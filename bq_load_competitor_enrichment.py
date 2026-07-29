"""
BigQuery loader for competitor news LM enrichment.

Uses the same non-DML idempotent load pattern as the other loaders.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

from google.cloud import bigquery


DEFAULT_DATASET = "az_daily_news_collection"
DEFAULT_RAW_TABLE = "competitor_news_articles"
DEFAULT_TABLE = "competitor_news_enrichment"
DEFAULT_LOCATION = "asia-southeast2"

BQ_SCHEMA = [
    bigquery.SchemaField("article_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("company", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("summary", "STRING"),
    bigquery.SchemaField("keywords", "STRING"),
    bigquery.SchemaField("key_message", "STRING"),
    bigquery.SchemaField("relevance", "STRING"),
    bigquery.SchemaField("lm_model", "STRING"),
    bigquery.SchemaField("analysis_status", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("analysis_error", "STRING"),
    bigquery.SchemaField("analyzed_at", "TIMESTAMP", mode="REQUIRED"),
]


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def read_rows(json_path: Path) -> list[dict]:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    rows = data.get("rows", [])
    if not isinstance(rows, list):
        raise ValueError(f"Expected 'rows' array in {json_path}, got {type(rows)}")
    return rows


def to_ndjson(rows: list[dict], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def create_enrichment_table(client: bigquery.Client, table_ref: str) -> None:
    bq_table = bigquery.Table(table_ref, schema=BQ_SCHEMA)
    bq_table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="analyzed_at",
    )
    bq_table.clustering_fields = ["article_id", "company"]
    bq_table.description = "Competitor news enrichment loaded idempotently."
    client.create_table(bq_table, exists_ok=True)


def ensure_views(
    client: bigquery.Client,
    project_id: str,
    dataset: str,
    raw_table: str,
    enrichment_table: str,
) -> None:
    enrichment_ref = f"{project_id}.{dataset}.{enrichment_table}"
    enrichment_latest_ref = f"{project_id}.{dataset}.{enrichment_table}_latest"
    raw_latest_ref = f"{project_id}.{dataset}.{raw_table}_latest"
    joined_latest_ref = f"{project_id}.{dataset}.competitor_news_latest"

    client.query(f"""
CREATE OR REPLACE VIEW `{enrichment_latest_ref}` AS
SELECT * EXCEPT(rn)
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY article_id ORDER BY analyzed_at DESC) AS rn
  FROM `{enrichment_ref}`
)
WHERE rn = 1
""").result()

    client.query(f"""
CREATE OR REPLACE VIEW `{joined_latest_ref}` AS
SELECT
  raw.id,
  raw.company,
  raw.headline,
  raw.url,
  raw.canonical_url,
  raw.source,
  raw.published_at,
  raw.snippet,
  raw.matched_query,
  raw.is_whitelisted_source,
  raw.scraped_at,
  enrichment.summary,
  enrichment.keywords,
  enrichment.key_message,
  enrichment.relevance,
  COALESCE(enrichment.analysis_status, 'pending') AS analysis_status,
  enrichment.analysis_error,
  enrichment.lm_model,
  enrichment.analyzed_at
FROM `{raw_latest_ref}` raw
LEFT JOIN `{enrichment_latest_ref}` enrichment
  ON raw.id = enrichment.article_id
""").result()


def build_replacement_sql(table_ref: str, staging_ref: str) -> str:
    columns = [field.name for field in BQ_SCHEMA]
    select_columns = ", ".join(f"`{column}`" for column in columns)
    return f"""
SELECT {select_columns}
FROM (
  SELECT
    {select_columns},
    ROW_NUMBER() OVER (
      PARTITION BY article_id
      ORDER BY analyzed_at DESC
    ) AS rn
  FROM (
    SELECT {select_columns} FROM `{table_ref}`
    UNION ALL
    SELECT {select_columns} FROM `{staging_ref}`
  )
)
WHERE rn = 1
"""


def load_to_bigquery(
    rows: list[dict],
    project_id: str,
    dataset: str,
    raw_table: str,
    table: str,
    location: str = DEFAULT_LOCATION,
) -> None:
    client = bigquery.Client(project=project_id, location=location)
    table_ref = f"{project_id}.{dataset}.{table}"
    staging_ref = f"{project_id}.{dataset}.staging_competitor_enrichment_{uuid.uuid4().hex}"
    replacement_ref = f"{project_id}.{dataset}.replacement_competitor_enrichment_{uuid.uuid4().hex}"

    create_enrichment_table(client, table_ref)

    if not rows:
        ensure_views(client, project_id, dataset, raw_table, table)
        print("[!] No competitor enrichment rows to load", file=sys.stderr)
        return

    ndjson_path = Path("_bq_competitor_enrichment_load_tmp.ndjson")
    to_ndjson(rows, ndjson_path)

    job_config = bigquery.LoadJobConfig(
        schema=BQ_SCHEMA,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        ignore_unknown_values=True,
    )

    try:
        with ndjson_path.open("rb") as f:
            job = client.load_table_from_file(f, staging_ref, job_config=job_config)
        print(f"[*] Submitted staging load job {job.job_id} -> {staging_ref}", file=sys.stderr)
        job.result()
        if job.errors:
            print(f"[!] Job errors: {job.errors}", file=sys.stderr)
            raise RuntimeError("BigQuery load job had errors")

        create_enrichment_table(client, replacement_ref)
        query_job_config = bigquery.QueryJobConfig(
            destination=replacement_ref,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        replace_job = client.query(
            build_replacement_sql(table_ref, staging_ref),
            job_config=query_job_config,
        )
        print(
            f"[*] Submitted replacement SELECT job {replace_job.job_id} -> {replacement_ref}",
            file=sys.stderr,
        )
        replace_job.result()
        if replace_job.errors:
            print(f"[!] Replacement query errors: {replace_job.errors}", file=sys.stderr)
            raise RuntimeError("BigQuery replacement query had errors")

        copy_job_config = bigquery.CopyJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE
        )
        copy_job = client.copy_table(
            replacement_ref,
            table_ref,
            job_config=copy_job_config,
            location=location,
        )
        print(f"[*] Submitted overwrite copy job {copy_job.job_id} -> {table_ref}", file=sys.stderr)
        copy_job.result()
        if copy_job.errors:
            print(f"[!] Copy errors: {copy_job.errors}", file=sys.stderr)
            raise RuntimeError("BigQuery overwrite copy job had errors")

        ensure_views(client, project_id, dataset, raw_table, table)
        final_table = client.get_table(table_ref)
        print(
            f"[+] Staged {job.output_rows} enrichment rows; target now has "
            f"{final_table.num_rows} deduped rows",
            file=sys.stderr,
        )
    finally:
        client.delete_table(staging_ref, not_found_ok=True)
        client.delete_table(replacement_ref, not_found_ok=True)
        ndjson_path.unlink(missing_ok=True)


def main() -> int:
    _load_env_file(Path(__file__).parent / ".env")

    parser = argparse.ArgumentParser(description="Load competitor enrichment JSON to BigQuery")
    parser.add_argument("json_path", help="Path to JSON output from enrich_competitor_news.py")
    parser.add_argument("--project", default=os.getenv("GCP_PROJECT_ID"))
    parser.add_argument("--dataset", default=os.getenv("BQ_DATASET", DEFAULT_DATASET))
    parser.add_argument("--raw-table", default=os.getenv("BQ_COMPETITOR_NEWS_TABLE", DEFAULT_RAW_TABLE))
    parser.add_argument("--table", default=os.getenv("BQ_COMPETITOR_ENRICHMENT_TABLE", DEFAULT_TABLE))
    parser.add_argument("--location", default=os.getenv("BQ_LOCATION", DEFAULT_LOCATION))
    args = parser.parse_args()

    if not args.project:
        print("[!] GCP_PROJECT_ID is not set", file=sys.stderr)
        return 1

    json_path = Path(args.json_path)
    if not json_path.exists():
        print(f"[!] File not found: {json_path}", file=sys.stderr)
        return 1

    rows = read_rows(json_path)
    print(
        f"[*] Loading {len(rows)} competitor enrichment rows -> "
        f"{args.project}.{args.dataset}.{args.table}",
        file=sys.stderr,
    )
    load_to_bigquery(rows, args.project, args.dataset, args.raw_table, args.table, args.location)
    print(f"[OK] Done. Query via view `{args.dataset}.competitor_news_latest`.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
