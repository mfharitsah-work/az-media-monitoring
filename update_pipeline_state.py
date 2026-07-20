"""
Update BigQuery pipeline_state after a successful scraper/load run.

This avoids BigQuery DML/MERGE so it can run on a billing-disabled project.
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery


DEFAULT_DATASET = "az_daily_news_collection"
DEFAULT_STATE_TABLE = "pipeline_state"
DEFAULT_LOCATION = "asia-southeast2"

STATE_SCHEMA = [
    bigquery.SchemaField("name", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("last_success_at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("updated_at", "TIMESTAMP", mode="REQUIRED"),
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


def ensure_state_table(
    client: bigquery.Client,
    project_id: str,
    dataset: str,
    table: str,
) -> str:
    table_ref = f"{project_id}.{dataset}.{table}"
    bq_table = bigquery.Table(table_ref, schema=STATE_SCHEMA)
    bq_table.description = "Pipeline state for dynamic scrape window calculation."
    client.create_table(bq_table, exists_ok=True)
    return table_ref


def _create_state_table(client: bigquery.Client, table_ref: str) -> None:
    bq_table = bigquery.Table(table_ref, schema=STATE_SCHEMA)
    bq_table.description = "Temporary pipeline state table."
    client.create_table(bq_table)


def _build_state_replacement_sql(table_ref: str, staging_ref: str) -> str:
    return f"""
SELECT name, last_success_at, updated_at
FROM (
  SELECT
    name,
    last_success_at,
    updated_at,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY updated_at DESC) AS rn
  FROM (
    SELECT name, last_success_at, updated_at FROM `{table_ref}`
    UNION ALL
    SELECT name, last_success_at, updated_at FROM `{staging_ref}`
  )
)
WHERE rn = 1
"""


def update_state(
    project_id: str,
    dataset: str,
    table: str,
    state_name: str,
    location: str,
) -> None:
    client = bigquery.Client(project=project_id, location=location)
    table_ref = ensure_state_table(client, project_id, dataset, table)
    staging_ref = f"{project_id}.{dataset}.staging_pipeline_state_{uuid.uuid4().hex}"
    replacement_ref = f"{project_id}.{dataset}.replacement_pipeline_state_{uuid.uuid4().hex}"

    now = datetime.now(timezone.utc).isoformat()
    load_job_config = bigquery.LoadJobConfig(
        schema=STATE_SCHEMA,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    row = {
        "name": state_name,
        "last_success_at": now,
        "updated_at": now,
    }

    try:
        load_job = client.load_table_from_json(
            [row],
            staging_ref,
            job_config=load_job_config,
        )
        print(f"[*] Submitted state staging load job {load_job.job_id} -> "
              f"{staging_ref}", file=sys.stderr)
        load_job.result()
        if load_job.errors:
            print(f"[!] State load errors: {load_job.errors}", file=sys.stderr)
            raise RuntimeError("BigQuery pipeline_state load job had errors")

        _create_state_table(client, replacement_ref)
        query_job_config = bigquery.QueryJobConfig(
            destination=replacement_ref,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        replace_job = client.query(
            _build_state_replacement_sql(table_ref, staging_ref),
            job_config=query_job_config,
        )
        print(f"[*] Submitted state replacement SELECT job {replace_job.job_id} -> "
              f"{replacement_ref}", file=sys.stderr)
        replace_job.result()
        if replace_job.errors:
            print(f"[!] State replacement errors: {replace_job.errors}", file=sys.stderr)
            raise RuntimeError("BigQuery pipeline_state replacement query had errors")

        copy_job_config = bigquery.CopyJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE
        )
        copy_job = client.copy_table(
            replacement_ref,
            table_ref,
            job_config=copy_job_config,
            location=location,
        )
        print(f"[*] Submitted state overwrite copy job {copy_job.job_id} -> "
              f"{table_ref}", file=sys.stderr)
        copy_job.result()
        if copy_job.errors:
            print(f"[!] State copy errors: {copy_job.errors}", file=sys.stderr)
            raise RuntimeError("BigQuery pipeline_state overwrite copy job had errors")
    finally:
        client.delete_table(staging_ref, not_found_ok=True)
        client.delete_table(replacement_ref, not_found_ok=True)

    print(f"[+] Updated pipeline state `{state_name}`", file=sys.stderr)


def main() -> int:
    _load_env_file(Path(__file__).parent / ".env")

    p = argparse.ArgumentParser(description="Update BigQuery pipeline scrape state")
    p.add_argument("--project", default=os.getenv("GCP_PROJECT_ID") or
                   os.getenv("GOOGLE_CLOUD_PROJECT"))
    p.add_argument("--dataset", default=os.getenv("BQ_DATASET", DEFAULT_DATASET))
    p.add_argument("--state-table", default=os.getenv("BQ_STATE_TABLE", DEFAULT_STATE_TABLE))
    p.add_argument("--state-name", default="daily_news_scrape")
    p.add_argument("--location", default=os.getenv("BQ_LOCATION", DEFAULT_LOCATION))
    args = p.parse_args()

    if not args.project:
        print("[!] GCP_PROJECT_ID belum di-set", file=sys.stderr)
        return 1

    update_state(
        args.project,
        args.dataset,
        args.state_table,
        args.state_name,
        args.location,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
