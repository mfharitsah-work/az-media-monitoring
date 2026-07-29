"""
BigQuery loader for full competitor news raw articles.

The loader is idempotent and avoids BigQuery DML. It stages new rows, builds a
deduped replacement table with SELECT, then overwrites the target table via copy
job. This keeps the project compatible with a billing-disabled BigQuery setup.
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
DEFAULT_TABLE = "competitor_news_articles"
DEFAULT_LOCATION = "asia-southeast2"

BQ_SCHEMA = [
    bigquery.SchemaField("id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("company", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("headline", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("url", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("canonical_url", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("source", "STRING"),
    bigquery.SchemaField("published_at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("snippet", "STRING"),
    bigquery.SchemaField("matched_query", "STRING"),
    bigquery.SchemaField("is_whitelisted_source", "BOOL"),
    bigquery.SchemaField("scraped_at", "TIMESTAMP", mode="REQUIRED"),
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


def create_competitor_news_table(client: bigquery.Client, table_ref: str) -> None:
    bq_table = bigquery.Table(table_ref, schema=BQ_SCHEMA)
    bq_table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="published_at",
    )
    bq_table.clustering_fields = ["company", "id"]
    bq_table.description = (
        "Raw competitor news articles loaded idempotently by non-DML dedup overwrite."
    )
    client.create_table(bq_table, exists_ok=True)


def ensure_views(client: bigquery.Client, project_id: str, dataset: str, table: str) -> None:
    table_ref = f"{project_id}.{dataset}.{table}"
    latest_view = f"{project_id}.{dataset}.{table}_latest"
    sql = f"""
CREATE OR REPLACE VIEW `{latest_view}` AS
SELECT * EXCEPT(rn)
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY id ORDER BY scraped_at DESC) AS rn
  FROM `{table_ref}`
)
WHERE rn = 1
"""
    client.query(sql).result()


def build_replacement_sql(table_ref: str, staging_ref: str) -> str:
    columns = [field.name for field in BQ_SCHEMA]
    select_columns = ", ".join(f"`{column}`" for column in columns)
    return f"""
SELECT {select_columns}
FROM (
  SELECT
    {select_columns},
    ROW_NUMBER() OVER (
      PARTITION BY id
      ORDER BY scraped_at DESC
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
    table: str,
    location: str = DEFAULT_LOCATION,
) -> None:
    client = bigquery.Client(project=project_id, location=location)
    table_ref = f"{project_id}.{dataset}.{table}"
    staging_ref = f"{project_id}.{dataset}.staging_competitor_news_{uuid.uuid4().hex}"
    replacement_ref = f"{project_id}.{dataset}.replacement_competitor_news_{uuid.uuid4().hex}"

    create_competitor_news_table(client, table_ref)
    ensure_views(client, project_id, dataset, table)

    if not rows:
        print("[!] No competitor news rows to load", file=sys.stderr)
        return

    ndjson_path = Path("_bq_competitor_news_load_tmp.ndjson")
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

        create_competitor_news_table(client, replacement_ref)
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

        ensure_views(client, project_id, dataset, table)
        final_table = client.get_table(table_ref)
        print(
            f"[+] Staged {job.output_rows} competitor news rows; target now has "
            f"{final_table.num_rows} deduped rows",
            file=sys.stderr,
        )
    finally:
        client.delete_table(staging_ref, not_found_ok=True)
        client.delete_table(replacement_ref, not_found_ok=True)
        ndjson_path.unlink(missing_ok=True)


def main() -> int:
    _load_env_file(Path(__file__).parent / ".env")

    parser = argparse.ArgumentParser(description="Load raw competitor news JSON to BigQuery")
    parser.add_argument("json_path", help="Path to JSON output from fetch_competitor_news.py")
    parser.add_argument("--project", default=os.getenv("GCP_PROJECT_ID"))
    parser.add_argument("--dataset", default=os.getenv("BQ_DATASET", DEFAULT_DATASET))
    parser.add_argument("--table", default=os.getenv("BQ_COMPETITOR_NEWS_TABLE", DEFAULT_TABLE))
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
        f"[*] Loading {len(rows)} competitor news rows -> "
        f"{args.project}.{args.dataset}.{args.table}",
        file=sys.stderr,
    )
    load_to_bigquery(rows, args.project, args.dataset, args.table, args.location)
    print(f"[OK] Done. Query via view `{args.dataset}.{args.table}_latest`.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
