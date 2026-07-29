"""
Cerebras enrichment for competitor news.

This script enriches only competitor raw articles that do not already have an
enrichment row. It intentionally does not calculate sentiment.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import requests
from google.api_core.exceptions import NotFound
from google.cloud import bigquery
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from news_pipeline.extraction import fetch_article_text


DEFAULT_DATASET = "az_daily_news_collection"
DEFAULT_RAW_TABLE = "competitor_news_articles"
DEFAULT_ENRICHMENT_TABLE = "competitor_news_enrichment"
DEFAULT_LOCATION = "asia-southeast2"
DEFAULT_CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"
DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b"


class CompetitorAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relevance: Literal["Relevant", "Not Relevant"] = Field(
        description="Whether the article materially discusses the target company."
    )
    summary: str = Field(
        description="Concise English summary from the article body, max 320 characters.",
        max_length=700,
    )
    key_message: str = Field(
        description="One concise English sentence explaining the main competitor signal.",
        max_length=500,
    )
    keywords: str = Field(
        description="Up to 5 important English keywords, comma-separated.",
        max_length=300,
    )


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def response_format() -> dict:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "CompetitorAnalysis",
            "schema": CompetitorAnalysis.model_json_schema(),
            "strict": True,
        },
    }


class CerebrasClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        api_url: str = DEFAULT_CEREBRAS_API_URL,
    ):
        self.model = model
        self.api_url = api_url
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def analyze(self, article: dict, body: str) -> CompetitorAnalysis | None:
        user_prompt = f"""
Target company: {article["company"]}
Headline: {article["headline"]}
Source: {article.get("source") or ""}
Snippet: {article.get("snippet") or ""}

Body:
{body[:3500]}
""".strip()
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": response_format(),
            "temperature": 0.2,
            "max_completion_tokens": 900,
        }
        response_text = self._post_with_retry(payload)
        if response_text is None:
            return None
        try:
            return CompetitorAnalysis.model_validate_json(response_text)
        except ValidationError as exc:
            print(
                f"    ! Cerebras schema validation failed: {exc.error_count()} error(s)",
                file=sys.stderr,
            )
            print(f"    Raw: {response_text[:300]}", file=sys.stderr)
            return None
        except json.JSONDecodeError as exc:
            print(f"    ! Cerebras JSON parse failed: {exc}", file=sys.stderr)
            return None

    def _post_with_retry(self, payload: dict, max_retries: int = 4) -> str | None:
        for attempt in range(max_retries + 1):
            try:
                resp = self.session.post(self.api_url, json=payload, timeout=45)
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
            except requests.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else "?"
                body = exc.response.text if exc.response is not None else ""
                if status == 429 and attempt < max_retries:
                    retry_after = _retry_after_seconds(exc.response.headers.get("retry-after"))
                    wait = retry_after if retry_after is not None else min(60, 5 * 2 ** attempt)
                    print(
                        f"    ! Cerebras 429, wait {wait:.1f}s "
                        f"({attempt + 1}/{max_retries})",
                        file=sys.stderr,
                    )
                    time.sleep(wait)
                    continue
                print(f"    ! Cerebras HTTP {status}: {body[:500]}", file=sys.stderr)
                return None
            except requests.Timeout:
                print("    ! Cerebras timeout", file=sys.stderr)
                return None
            except Exception as exc:
                print(f"    ! Cerebras call failed: {exc}", file=sys.stderr)
                return None


SYSTEM_PROMPT = """
You are a media analyst monitoring pharmaceutical competitor news in Indonesia.

Task:
- Determine whether the article materially discusses the target company.
- Produce a concise English summary, key message, and keywords.
- Do not calculate sentiment.

Relevance rules:
- Relevant: the target company is the main topic or a meaningful part of the
  article in a pharma, business, policy, product, access, partnership, legal, or
  public-health context.
- Not Relevant: the target company is absent, only appears in unrelated noise,
  or the article cannot be assessed from the provided text.

Summary rules:
- Use facts from the provided body/snippet. Do not invent facts.
- If text is too thin, set summary and key_message to empty strings and relevance
  to "Not Relevant".
- Keep proper nouns and Indonesian institution names unchanged.
""".strip()


def _retry_after_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value) + 0.5
    except ValueError:
        return None


def _norm_timestamp(value) -> str:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def table_exists(client: bigquery.Client, ref: str) -> bool:
    try:
        client.get_table(ref)
        return True
    except NotFound:
        return False


def pending_articles(
    project_id: str,
    dataset: str,
    raw_table: str,
    enrichment_table: str,
    location: str,
    max_age_hours: int,
    fetch_limit: int,
) -> list[dict]:
    client = bigquery.Client(project=project_id, location=location)
    raw_ref = f"{project_id}.{dataset}.{raw_table}"
    raw_latest_ref = f"{project_id}.{dataset}.{raw_table}_latest"
    raw_source = raw_latest_ref if table_exists(client, raw_latest_ref) else raw_ref

    enrichment_latest_ref = f"{project_id}.{dataset}.{enrichment_table}_latest"
    has_enrichment = table_exists(client, enrichment_latest_ref)

    if has_enrichment:
        sql = f"""
SELECT
  raw.id,
  raw.company,
  raw.headline,
  raw.url,
  raw.canonical_url,
  raw.source,
  raw.published_at,
  raw.snippet
FROM `{raw_source}` raw
LEFT JOIN `{enrichment_latest_ref}` enrichment
  ON raw.id = enrichment.article_id
WHERE raw.published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @max_age_hours HOUR)
  AND (
    enrichment.article_id IS NULL
    OR enrichment.analysis_status = 'failed'
  )
ORDER BY raw.published_at DESC
LIMIT @fetch_limit
"""
    else:
        sql = f"""
SELECT
  id,
  company,
  headline,
  url,
  canonical_url,
  source,
  published_at,
  snippet
FROM `{raw_source}`
WHERE published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @max_age_hours HOUR)
ORDER BY published_at DESC
LIMIT @fetch_limit
"""

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("max_age_hours", "INT64", max_age_hours),
            bigquery.ScalarQueryParameter("fetch_limit", "INT64", fetch_limit),
        ]
    )
    rows = client.query(sql, job_config=job_config).result()
    return [
        {
            "id": row.id,
            "company": row.company,
            "headline": row.headline,
            "url": row.url,
            "canonical_url": row.canonical_url,
            "source": row.source,
            "published_at": _norm_timestamp(row.published_at),
            "snippet": row.snippet,
        }
        for row in rows
    ]


def select_with_caps(
    rows: list[dict],
    limit: int,
    max_per_company: int,
) -> list[dict]:
    selected: list[dict] = []
    by_company: dict[str, int] = {}
    for row in rows:
        company = row["company"]
        if len(selected) >= limit:
            break
        if by_company.get(company, 0) >= max_per_company:
            continue
        by_company[company] = by_company.get(company, 0) + 1
        selected.append(row)
    return selected


def build_result_row(
    article: dict,
    status: Literal["analyzed", "skipped", "failed"],
    model: str,
    analysis: CompetitorAnalysis | None = None,
    error: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "article_id": article["id"],
        "company": article["company"],
        "summary": analysis.summary if analysis else "",
        "keywords": analysis.keywords if analysis else "",
        "key_message": analysis.key_message if analysis else "",
        "relevance": analysis.relevance if analysis else None,
        "lm_model": model,
        "analysis_status": status,
        "analysis_error": error,
        "analyzed_at": now,
    }


def enrich_articles(
    articles: list[dict],
    client: CerebrasClient | None,
    model: str,
) -> list[dict]:
    rows: list[dict] = []
    for index, article in enumerate(articles, start=1):
        print(
            f"[*] Enriching {index}/{len(articles)}: "
            f"{article['company']} - {article['headline'][:80]}",
            file=sys.stderr,
        )
        snippet = article.get("snippet") or ""
        body = fetch_article_text(article["url"])
        analysis_text = body if len(body) >= 300 else snippet
        if len(analysis_text) < 80:
            rows.append(build_result_row(article, "skipped", model, error="insufficient_text"))
            continue
        if client is None:
            rows.append(build_result_row(article, "failed", model, error="missing_cerebras_api_key"))
            continue
        analysis = client.analyze(article, analysis_text)
        if analysis is None:
            rows.append(build_result_row(article, "failed", model, error="cerebras_call_failed"))
            continue
        rows.append(build_result_row(article, "analyzed", model, analysis=analysis))
    return rows


def main() -> int:
    _load_env_file(Path(__file__).parent / ".env")

    parser = argparse.ArgumentParser(description="Enrich pending competitor news with Cerebras")
    parser.add_argument("--project", default=os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT"))
    parser.add_argument("--dataset", default=os.getenv("BQ_DATASET", DEFAULT_DATASET))
    parser.add_argument("--raw-table", default=os.getenv("BQ_COMPETITOR_NEWS_TABLE", DEFAULT_RAW_TABLE))
    parser.add_argument(
        "--enrichment-table",
        default=os.getenv("BQ_COMPETITOR_ENRICHMENT_TABLE", DEFAULT_ENRICHMENT_TABLE),
    )
    parser.add_argument("--location", default=os.getenv("BQ_LOCATION", DEFAULT_LOCATION))
    parser.add_argument("--output", default="competitor_news_enrichment.json")
    parser.add_argument(
        "--model",
        default=os.getenv("COMPETITOR_LM_MODEL", DEFAULT_CEREBRAS_MODEL),
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=int(os.getenv("COMPETITOR_LM_MAX_ARTICLES_PER_RUN", "10")),
    )
    parser.add_argument(
        "--max-per-company",
        type=int,
        default=int(os.getenv("COMPETITOR_LM_MAX_PER_COMPANY", "2")),
    )
    parser.add_argument("--max-age-hours", type=int, default=72)
    args = parser.parse_args()

    if not args.project:
        print("[!] GCP_PROJECT_ID is not set", file=sys.stderr)
        return 1

    raw_candidates = pending_articles(
        project_id=args.project,
        dataset=args.dataset,
        raw_table=args.raw_table,
        enrichment_table=args.enrichment_table,
        location=args.location,
        max_age_hours=args.max_age_hours,
        fetch_limit=max(args.limit * 5, 50),
    )
    candidates = select_with_caps(raw_candidates, args.limit, args.max_per_company)
    print(
        f"[*] Pending candidates: {len(raw_candidates)}; selected for LM: {len(candidates)}",
        file=sys.stderr,
    )

    api_key = os.getenv("CEREBRAS_API_KEY")
    client = CerebrasClient(
        api_key=api_key,
        model=args.model,
        api_url=os.getenv("CEREBRAS_API_URL", DEFAULT_CEREBRAS_API_URL),
    ) if api_key else None

    rows = enrich_articles(candidates, client, args.model)
    out_path = Path(args.output)
    out_path.write_text(
        json.dumps(
            {
                "rows": rows,
                "analyzed_at": datetime.now(timezone.utc).isoformat(),
                "model": args.model,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[OK] {len(rows)} enrichment rows -> {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
