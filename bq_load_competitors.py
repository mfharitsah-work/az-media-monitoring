"""
BigQuery loader untuk competitor_articles table.

Strategi: load ke staging table lalu MERGE ke `competitor_articles`.
Re-run/overlap window tidak menambah row baru untuk kombinasi `(company, url)`.

Usage:
    # Lokal
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
    export GCP_PROJECT_ID=my-project-123
    python bq_load_competitors.py competitor_news.json

    # GitHub Actions (ADC sudah di-set via google-github-actions/auth)
    python bq_load_competitors.py competitor_news.json

Env vars:
    GCP_PROJECT_ID (required) GCP project ID
    BQ_DATASET     (optional) default: "az_daily_news_collection"
    BQ_TABLE       (optional) default: "competitor_articles"
    BQ_LOCATION    (optional) default: "asia-southeast2"
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
DEFAULT_TABLE = "competitor_articles"
DEFAULT_LOCATION = "asia-southeast2"

BQ_SCHEMA = [
    bigquery.SchemaField("url", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("company", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("source", "STRING"),
    bigquery.SchemaField("published_at", "TIMESTAMP", mode="REQUIRED"),
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
        raise ValueError(f"Expected 'rows' array di {json_path}, got {type(rows)}")
    return rows


def to_ndjson(rows: list[dict], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _build_competitor_merge_sql(table_ref: str, staging_ref: str) -> str:
    columns = [field.name for field in BQ_SCHEMA]
    update_assignments = ",\n    ".join(
        f"T.`{column}` = S.`{column}`"
        for column in columns
        if column not in {"company", "url"}
    )
    insert_columns = ", ".join(f"`{column}`" for column in columns)
    insert_values = ", ".join(f"S.`{column}`" for column in columns)

    return f"""
MERGE `{table_ref}` T
USING (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY company, url
        ORDER BY scraped_at DESC
      ) AS rn
    FROM `{staging_ref}`
  )
  WHERE rn = 1
) S
ON T.`company` = S.`company` AND T.`url` = S.`url`
WHEN MATCHED THEN
  UPDATE SET
    {update_assignments}
WHEN NOT MATCHED THEN
  INSERT ({insert_columns})
  VALUES ({insert_values})
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
    staging_ref = f"{project_id}.{dataset}.staging_competitors_{uuid.uuid4().hex}"

    ndjson_path = Path("_bq_competitor_load_tmp.ndjson")
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
        print(f"[*] Submitted staging load job {job.job_id} -> {staging_ref}",
              file=sys.stderr)
        job.result()
        if job.errors:
            print(f"[!] Job errors: {job.errors}", file=sys.stderr)
            raise RuntimeError("BigQuery load job had errors")

        merge_job = client.query(_build_competitor_merge_sql(table_ref, staging_ref))
        print(f"[*] Submitted MERGE job {merge_job.job_id} -> {table_ref}",
              file=sys.stderr)
        merge_job.result()
        if merge_job.errors:
            print(f"[!] MERGE errors: {merge_job.errors}", file=sys.stderr)
            raise RuntimeError("BigQuery MERGE job had errors")

        affected_rows = merge_job.num_dml_affected_rows
        print(
            f"[+] Staged {job.output_rows} competitor rows; MERGE affected "
            f"{affected_rows if affected_rows is not None else 'unknown'} rows",
            file=sys.stderr,
        )
    finally:
        client.delete_table(staging_ref, not_found_ok=True)
        ndjson_path.unlink(missing_ok=True)


def main() -> int:
    _load_env_file(Path(__file__).parent / ".env")

    p = argparse.ArgumentParser(description="Load competitor news JSON ke BigQuery")
    p.add_argument("json_path", help="Path ke JSON output dari fetch_competitor_counts.py")
    p.add_argument("--project", default=os.getenv("GCP_PROJECT_ID"))
    p.add_argument("--dataset", default=os.getenv("BQ_DATASET", DEFAULT_DATASET))
    p.add_argument("--table", default=os.getenv("BQ_COMPETITOR_TABLE", DEFAULT_TABLE))
    p.add_argument("--location", default=os.getenv("BQ_LOCATION", DEFAULT_LOCATION))
    args = p.parse_args()

    if not args.project:
        print("[!] GCP_PROJECT_ID belum di-set", file=sys.stderr)
        return 1

    json_path = Path(args.json_path)
    if not json_path.exists():
        print(f"[!] File tidak ada: {json_path}", file=sys.stderr)
        return 1

    rows = read_rows(json_path)
    if not rows:
        print(f"[!] Tidak ada competitor rows di {json_path} (no news matched)",
              file=sys.stderr)
        return 0

    print(f"[*] Loading {len(rows)} competitor rows -> "
          f"{args.project}.{args.dataset}.{args.table}", file=sys.stderr)
    load_to_bigquery(rows, args.project, args.dataset, args.table, args.location)
    print(f"[OK] Done. Query lewat view `{args.dataset}.competitor_articles_latest`.",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
