"""
Scrape AstraZeneca articles from The Independent + analyze with Groq.

Pipeline:
1. Fetch topic page → extract article URLs + headlines
2. Untuk tiap artikel: fetch body → kirim ke Groq → dapat ArticleAnalysis ter-validasi
3. Print/save hasil

Usage:
    python scrape_independent.py                    # default: 5 artikel
    python scrape_independent.py --limit 10
    python scrape_independent.py --output independent.csv

Reuse dari fetch_news.py:
- GroqClient (LM call dengan strict JSON Schema)
- ArticleAnalysis (Pydantic schema response)
- fetch_article_text (body scraper umum)
- make_article_id (stable hash dari URL)
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))

from fetch_news import (
    USER_AGENT,
    ArticleAnalysis,
    GroqClient,
    fetch_article_text,
    make_article_id,
)


TOPIC_URL = "https://www.independent.co.uk/topic/astrazeneca"

# URL pattern Independent: /news/<section>/<slug>-bXXXXXXX.html (b atau a + 6+ digit)
ARTICLE_URL_RE = re.compile(r"/news/.+-[ab]\d{6,}\.html$")

REQUEST_DELAY_SEC = 1.0  # Rate-limit antar fetch — be a good citizen


@dataclass
class ArticleStub:
    """Hasil scraping topic page — belum di-enrich dengan body / analisis."""
    url: str
    headline: str


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE pairs dari .env ke os.environ (skip kalau sudah set)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def scrape_topic_page(topic_url: str, limit: int = 5) -> list[ArticleStub]:
    """Ambil daftar artikel dari topic page Independent.

    Strategi: setiap card artikel punya 2 <a> ke URL yang sama —
    satu untuk image (aria-label, text kosong), satu untuk headline (text berisi).
    Kita filter ke link yang text-nya non-kosong, lalu dedupe by URL.
    """
    print(f"[*] Fetching topic page: {topic_url}", file=sys.stderr)
    resp = requests.get(topic_url, headers={"User-Agent": USER_AGENT}, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    seen: set[str] = set()
    stubs: list[ArticleStub] = []

    for a in soup.find_all("a", href=ARTICLE_URL_RE):
        href = a.get("href", "")
        headline = a.get_text(strip=True)
        if not headline:
            continue  # image link, bukan headline link
        full_url = urljoin(topic_url, href)
        if full_url in seen:
            continue
        seen.add(full_url)
        stubs.append(ArticleStub(url=full_url, headline=headline))
        if len(stubs) >= limit:
            break

    print(f"[+] Found {len(stubs)} articles (limit={limit})", file=sys.stderr)
    return stubs


def analyze_stub(stub: ArticleStub, groq: GroqClient) -> dict | None:
    """Fetch body untuk satu stub, lalu kirim ke Groq. Return row siap CSV."""
    print(f"  [.] {stub.headline[:80]}", file=sys.stderr)
    body = fetch_article_text(stub.url)
    if not body or len(body) < 200:
        print(f"      ! body kosong/terlalu pendek ({len(body)} chars), skip", file=sys.stderr)
        return None

    print(f"      body OK ({len(body)} chars) → Groq...", file=sys.stderr)
    start = time.time()
    analysis: ArticleAnalysis | None = groq.analyze_article(stub.headline, body)
    elapsed = time.time() - start

    if analysis is None:
        print(f"      ! Groq gagal", file=sys.stderr)
        return None

    print(f"      OK ({elapsed:.1f}s) — {analysis.category}/{analysis.sentiment}",
          file=sys.stderr)

    return {
        "id": make_article_id(stub.url),
        "headline": stub.headline,
        "source": "The Independent",
        "url": stub.url,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "summary": analysis.summary,
        "category": analysis.category,
        "sentiment": analysis.sentiment,
        "keywords": analysis.keywords,
    }


def save_csv(rows: list[dict], path: str) -> None:
    if not rows:
        print(f"[!] Tidak ada hasil — file {path} tidak ditulis", file=sys.stderr)
        return
    columns = ["id", "headline", "source", "url", "scraped_at",
               "summary", "category", "sentiment", "keywords"]
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in columns})
    print(f"[+] Saved {len(rows)} rows to {path}", file=sys.stderr)


def main() -> int:
    p = argparse.ArgumentParser(description="Scrape Independent AstraZeneca topic + analyze")
    p.add_argument("--url", default=TOPIC_URL, help="Topic page URL")
    p.add_argument("--limit", type=int, default=5, help="Max articles to process")
    p.add_argument("--output", default="independent_az.csv", help="Output CSV path")
    args = p.parse_args()

    load_env_file(Path(__file__).parent / ".env")
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("[!] GROQ_API_KEY tidak ada. Set di .env atau env var.", file=sys.stderr)
        return 1

    groq = GroqClient(api_key)
    if not groq.health_check():
        print("[!] Groq health check gagal", file=sys.stderr)
        return 1
    print(f"[*] Groq ready: {groq.model}", file=sys.stderr)

    stubs = scrape_topic_page(args.url, limit=args.limit)
    if not stubs:
        print("[!] Tidak ada artikel ditemukan — cek selector / blocked?", file=sys.stderr)
        return 1

    rows: list[dict] = []
    for stub in stubs:
        row = analyze_stub(stub, groq)
        if row:
            rows.append(row)
        time.sleep(REQUEST_DELAY_SEC)  # be polite

    save_csv(rows, args.output)

    print(f"\n[OK] Processed {len(rows)}/{len(stubs)} articles", file=sys.stderr)
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
