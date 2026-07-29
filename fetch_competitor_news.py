"""
Full competitor news scraper.

This is the raw collection step for competitor monitoring. It does not call an
LM. The Cerebras enrichment step is intentionally separate so raw collection can
still complete when the LM provider is unavailable or quota-limited.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote_plus

import feedparser
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from fetch_competitor_counts import (
    COMPETITORS,
    WHITELIST_BYPASS_COMPANIES,
    apex_domain,
)
from news_pipeline.config import GOOGLE_NEWS_RSS, JUNK_TITLE_RE, USER_AGENT
from news_pipeline.extraction import parse_source_from_title, resolve_google_news_url
from news_pipeline.url_utils import canonicalize_article_url, is_whitelisted_source


def make_competitor_article_id(company: str, canonical_url: str) -> str:
    """Stable identity for one company/article pair."""
    identity = f"{company.strip()}|{canonical_url.strip()}"
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]


def clean_html_text(value: str) -> str:
    return BeautifulSoup(value or "", "html.parser").get_text(" ", strip=True)


def fetch_one_company(company: str, hours: int, max_per_company: int) -> list[dict]:
    query = quote_plus(f'"{company}" when:{hours}h')
    rss_url = GOOGLE_NEWS_RSS.format(query=query)
    print(f"[*] Querying RSS for: {company}", file=sys.stderr)
    feed = feedparser.parse(rss_url, request_headers={"User-Agent": USER_AGENT})

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    bypass_whitelist = company in WHITELIST_BYPASS_COMPANIES
    rows: list[dict] = []
    seen_ids: set[str] = set()

    for entry in feed.entries:
        if len(rows) >= max_per_company:
            print(
                f"    [cap reached] {max_per_company} rows saved for {company}",
                file=sys.stderr,
            )
            break

        raw_title = getattr(entry, "title", "") or ""
        headline, fallback_source = parse_source_from_title(raw_title)
        if JUNK_TITLE_RE.search(headline) or len(headline) < 10:
            continue

        try:
            published_at = date_parser.parse(entry.published).astimezone(timezone.utc)
            if published_at < cutoff:
                continue
        except Exception:
            continue

        try:
            real_url = resolve_google_news_url(entry.link)
        except Exception:
            real_url = entry.link

        canonical_url = canonicalize_article_url(real_url)
        is_whitelisted = is_whitelisted_source(canonical_url)
        if not bypass_whitelist and not is_whitelisted:
            continue

        article_id = make_competitor_article_id(company, canonical_url)
        if article_id in seen_ids:
            continue
        seen_ids.add(article_id)

        description = (
            getattr(entry, "summary", "")
            or getattr(entry, "description", "")
            or ""
        )
        source = apex_domain(canonical_url) or fallback_source or None

        rows.append({
            "id": article_id,
            "company": company,
            "headline": headline,
            "url": canonical_url,
            "canonical_url": canonical_url,
            "source": source,
            "published_at": published_at.isoformat(),
            "snippet": clean_html_text(description),
            "matched_query": company,
            "is_whitelisted_source": is_whitelisted,
        })

    print(
        f"    [+] {company}: {len(rows)} raw articles "
        f"({'no whitelist' if bypass_whitelist else 'whitelist filter applied'})",
        file=sys.stderr,
    )
    return rows


def parse_companies(value: str | None) -> list[str]:
    if not value:
        return COMPETITORS
    companies = [c.strip() for c in value.split(",") if c.strip()]
    invalid = [c for c in companies if c not in COMPETITORS]
    if invalid:
        raise ValueError(f"Unknown companies: {invalid}. Valid: {COMPETITORS}")
    return companies


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape raw competitor news")
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--output", default="competitor_news_raw.json")
    parser.add_argument("--companies", default=None)
    parser.add_argument("--max-per-company", type=int, default=20)
    parser.add_argument("--max-total", type=int, default=300)
    args = parser.parse_args()

    try:
        companies = parse_companies(args.companies)
    except ValueError as exc:
        print(f"[!] {exc}", file=sys.stderr)
        return 1

    print(
        f"[*] Scraping {len(companies)} competitors, rolling {args.hours}h window",
        file=sys.stderr,
    )

    scraped_at = datetime.now(timezone.utc).isoformat()
    all_rows: list[dict] = []
    for company in companies:
        if len(all_rows) >= args.max_total:
            print(f"[*] Global cap reached: {args.max_total}", file=sys.stderr)
            break
        try:
            rows = fetch_one_company(company, args.hours, args.max_per_company)
        except Exception as exc:
            print(f"[!] {company} failed: {exc}", file=sys.stderr)
            rows = []
        for row in rows:
            row["scraped_at"] = scraped_at
        all_rows.extend(rows)
        all_rows = all_rows[: args.max_total]

    out_path = Path(args.output)
    out_path.write_text(
        json.dumps({"rows": all_rows, "scraped_at": scraped_at}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[OK] {len(all_rows)} total raw rows -> {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
