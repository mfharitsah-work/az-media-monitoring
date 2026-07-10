"""
Compute scraper lookback window from the last successful pipeline run.

Stdout intentionally prints only the integer hour value so GitHub Actions can
capture it safely. Warnings go to stderr.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery


DEFAULT_DATASET = "az_daily_news_collection"
DEFAULT_STATE_TABLE = "pipeline_state"
DEFAULT_LOCATION = "asia-southeast2"


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def get_last_success_at(
    project_id: str,
    dataset: str,
    table: str,
    state_name: str,
    location: str,
) -> datetime | None:
    client = bigquery.Client(project=project_id, location=location)
    state_ref = f"{project_id}.{dataset}.{table}"
    query = f"""
SELECT last_success_at
FROM `{state_ref}`
WHERE name = @state_name
LIMIT 1
"""
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("state_name", "STRING", state_name)
        ]
    )
    rows = list(client.query(query, job_config=job_config).result())
    if not rows:
        return None
    return _as_utc(rows[0].last_success_at)


def compute_hours(
    last_success_at: datetime | None,
    default_hours: int,
    min_hours: int,
    max_hours: int,
    buffer_hours: int,
    now: datetime | None = None,
) -> int:
    if last_success_at is None:
        return default_hours

    current_time = now or datetime.now(timezone.utc)
    elapsed_hours = max(0.0, (current_time - last_success_at).total_seconds() / 3600)
    return _clamp(math.ceil(elapsed_hours) + buffer_hours, min_hours, max_hours)


def main() -> int:
    _load_env_file(Path(__file__).parent / ".env")

    p = argparse.ArgumentParser(description="Compute dynamic news scrape window")
    p.add_argument("--project", default=os.getenv("GCP_PROJECT_ID") or
                   os.getenv("GOOGLE_CLOUD_PROJECT"))
    p.add_argument("--dataset", default=os.getenv("BQ_DATASET", DEFAULT_DATASET))
    p.add_argument("--state-table", default=os.getenv("BQ_STATE_TABLE", DEFAULT_STATE_TABLE))
    p.add_argument("--state-name", default="daily_news_scrape")
    p.add_argument("--location", default=os.getenv("BQ_LOCATION", DEFAULT_LOCATION))
    p.add_argument("--default-hours", type=int, default=24)
    p.add_argument("--min-hours", type=int, default=6)
    p.add_argument("--max-hours", type=int, default=48)
    p.add_argument("--buffer-hours", type=int, default=3)
    args = p.parse_args()

    if args.min_hours > args.max_hours:
        print("[!] --min-hours cannot be greater than --max-hours", file=sys.stderr)
        return 1

    if not args.project:
        hours = _clamp(args.default_hours, args.min_hours, args.max_hours)
        print(f"[!] GCP project not set; fallback to {hours} hours", file=sys.stderr)
        print(hours)
        return 0

    try:
        last_success_at = get_last_success_at(
            args.project,
            args.dataset,
            args.state_table,
            args.state_name,
            args.location,
        )
        hours = compute_hours(
            last_success_at,
            _clamp(args.default_hours, args.min_hours, args.max_hours),
            args.min_hours,
            args.max_hours,
            args.buffer_hours,
        )
    except Exception as exc:  # state table can be absent on first deployment
        hours = _clamp(args.default_hours, args.min_hours, args.max_hours)
        print(f"[!] Could not read pipeline state; fallback to {hours} hours: {exc}",
              file=sys.stderr)

    print(hours)
    return 0


if __name__ == "__main__":
    sys.exit(main())
