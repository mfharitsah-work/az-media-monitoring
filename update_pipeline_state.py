"""
Update BigQuery pipeline_state after a successful scraper/load run.
"""

from __future__ import annotations

import argparse
import os
import sys
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


def update_state(
    project_id: str,
    dataset: str,
    table: str,
    state_name: str,
    location: str,
) -> None:
    client = bigquery.Client(project=project_id, location=location)
    table_ref = ensure_state_table(client, project_id, dataset, table)

    query = f"""
MERGE `{table_ref}` T
USING (
  SELECT
    @state_name AS name,
    CURRENT_TIMESTAMP() AS last_success_at,
    CURRENT_TIMESTAMP() AS updated_at
) S
ON T.`name` = S.`name`
WHEN MATCHED THEN
  UPDATE SET
    last_success_at = S.last_success_at,
    updated_at = S.updated_at
WHEN NOT MATCHED THEN
  INSERT (name, last_success_at, updated_at)
  VALUES (S.name, S.last_success_at, S.updated_at)
"""
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("state_name", "STRING", state_name)
        ]
    )
    job = client.query(query, job_config=job_config)
    print(f"[*] Submitted state MERGE job {job.job_id} -> {table_ref}", file=sys.stderr)
    job.result()
    if job.errors:
        print(f"[!] State MERGE errors: {job.errors}", file=sys.stderr)
        raise RuntimeError("BigQuery pipeline_state MERGE job had errors")
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
