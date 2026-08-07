"""
AstraZeneca Indonesia daily news fetcher.

This file is intentionally kept as the CLI/orchestration entrypoint used by
GitHub Actions. Shared scraper configuration, URL normalization, extraction,
Groq analysis, fallback analysis, and serialization live in news_pipeline/.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote_plus

import feedparser
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from news_pipeline.config import (
    DEFAULT_KEYWORDS,
    DEFAULT_OUTPUT,
    GOOGLE_NEWS_RSS,
    JUNK_TITLE_RE,
    MIN_BODY_CHARS,
    SOURCE_WHITELIST,
    USER_AGENT,
)
from news_pipeline.extraction import (
    extract_html_canonical_url,
    fetch_article_text,
    fetch_article_text_and_canonical,
    parse_source_from_title,
    resolve_google_news_url,
)
from news_pipeline.fallback_analysis import (
    detect_language,
    detect_subcategory,
    extract_keywords,
    make_summary,
    simple_sentiment,
)
from news_pipeline.groq_analysis import (
    ArticleAnalysis,
    GroqClient,
    STANDALONE_CATEGORIES,
    SUBCATEGORY_TO_CATEGORY,
    TPDLimitExceeded,
)
from news_pipeline.output import OUTPUT_COLUMNS, save_csv, save_json
from news_pipeline.url_utils import (
    canonicalize_article_url,
    is_blocked_source_url,
    is_whitelisted_source,
    make_article_id,
)


# Re-export imports above for older ad-hoc scripts. New code should import from
# news_pipeline.* directly.

def process_article(entry, fetch_body: bool, groq: GroqClient | None) -> dict | None:
    """Bentuk satu row final.

    Field naming dialigment ke kebutuhan website (lihat save_json/save_csv):
    headline, url, date, source, summary, category, sentiment, keywords, city, province.
    """
    headline, source = parse_source_from_title(entry.title)

    # Filter entry rusak (mis. title = "AA22yZxx.jpg" dari RSS yang aneh)
    if JUNK_TITLE_RE.search(headline) or len(headline) < 15:
        print(f"    ! skip junk title: {headline[:60]!r}", file=sys.stderr)
        return None

    # Decode URL Google News → real article URL (penting agar body bisa di-scrape)
    raw_url = entry.link
    url = resolve_google_news_url(raw_url)

    # Filter source whitelist — drop sebelum body fetch + Groq call (hemat quota)
    if is_blocked_source_url(url):
        print(f"    skip blocked video/non-article source: {url[:80]}", file=sys.stderr)
        return None

    if not is_whitelisted_source(url):
        print(f"    skip non-whitelisted source: {url[:80]}", file=sys.stderr)
        return None

    try:
        pub_dt = date_parser.parse(entry.published).astimezone(timezone.utc)
    except Exception:
        pub_dt = datetime.now(timezone.utc)

    description = entry.get("summary", "") or entry.get("description", "")
    description_clean = BeautifulSoup(description, "html.parser").get_text(strip=True)

    body = ""
    canonical_url = None
    if fetch_body:
        print(f"    fetching: {url[:80]}...", file=sys.stderr)
        body, canonical_url = fetch_article_text_and_canonical(url)

    # Body length guard: kalau body terlalu tipis, LM cuma akan paraphrase headline
    # (tidak menambah info). Skip artikel — bukan saved with bad summary.
    if fetch_body and len(body) < MIN_BODY_CHARS:
        print(f"    skip thin body ({len(body)} chars < {MIN_BODY_CHARS})", file=sys.stderr)
        return None

    analysis_text = (headline + " " + description_clean + " " + body).strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    # Konvensi dual-language: kolom utama (headline, summary, keywords) = English,
    # kolom *_id = Indonesian original. `language` selalu "en" pasca refactor
    # (kolom di-keep untuk backward compat tapi semantik berubah).
    base = {
        "id": make_article_id(canonical_url or url),
        "url": url,
        "date": pub_dt.isoformat(),
        "source": source,
        "language": "en",
        "scraped_at": now_iso,
    }

    # AI processing dengan Groq, fallback ke rule-based
    if groq and body:
        print(f"    → Groq {groq.model}...", file=sys.stderr)
        start = time.time()
        ai = groq.analyze_article(headline, body)
        elapsed = time.time() - start
        if ai:
            # Skip artikel yang LM nilai tidak relevan untuk AZ monitoring
            if ai.subcategory == "Not Relevant":
                print(f"    SKIP ({elapsed:.1f}s) — Not Relevant", file=sys.stderr)
                return None
            category = SUBCATEGORY_TO_CATEGORY[ai.subcategory]
            # Standalone category (Crisis & Disruption): tidak ada konsep
            # subcategory di bawahnya → label dipromosikan jadi kategori dan
            # field subcategory di-NULL-kan. Chart subcategory di frontend akan
            # fallback ke category untuk row seperti ini.
            is_standalone = ai.subcategory in STANDALONE_CATEGORIES
            row_subcategory = None if is_standalone else ai.subcategory
            print(f"    OK ({elapsed:.1f}s) — {category}"
                  f"{'/' + ai.subcategory if not is_standalone else ''}"
                  f"/{ai.sentiment}{' @ ' + ai.city if ai.city else ''}",
                  file=sys.stderr)
            return {
                **base,
                "headline":     ai.headline_en,   # English (primary display)
                "headline_id":  headline,         # Indonesian original from RSS
                "summary":      ai.summary_en,    # English
                "summary_id":   ai.summary_id,    # Indonesian
                "category":     category,
                "subcategory":  row_subcategory,
                "sentiment":    ai.sentiment,
                "keywords":     ai.keywords_en,   # English
                "keywords_id":  ai.keywords_id,   # Indonesian
                "city":         ai.city,
                "province":     ai.province,
            }
        print(f"    ! fallback to rule-based (Indonesian-only)", file=sys.stderr)

    # Rule-based fallback — best-effort, hanya kalau Groq gagal.
    # Tidak ada terjemahan English di fallback path → English fields kosong.
    # Acceptable: fallback jarang trigger; data tetap usable lewat *_id fields.
    fallback_subcategory = detect_subcategory(analysis_text)
    fallback_summary = make_summary(body or description_clean or headline)
    fallback_keywords = extract_keywords(analysis_text)
    return {
        **base,
        "language":     "id",  # tidak ada translasi di fallback path
        "headline":     headline,        # Indonesian (no EN available)
        "headline_id":  headline,
        "summary":      fallback_summary,
        "summary_id":   fallback_summary,
        "category":     SUBCATEGORY_TO_CATEGORY[fallback_subcategory],
        "subcategory":  fallback_subcategory,
        "sentiment":    simple_sentiment(analysis_text),
        "keywords":     fallback_keywords,
        "keywords_id":  fallback_keywords,
        "city":         "",
        "province":     "",
    }


def fetch_news(keywords: list[str], hours: int, fetch_body: bool,
               groq: GroqClient | None, max_per_keyword: int = 5) -> list[dict]:
    """Iterate semua keyword (sudah priority-ordered di DEFAULT_KEYWORDS:
    AZ → Regulatory → Crisis), process artikel, return list.

    `max_per_keyword` — cap artikel ter-save per keyword. Lindungi dari burst
    news (mis. 1 keyword "gempa AND rumah sakit" return 20 artikel mirip).
    Hitung berdasarkan artikel yang berhasil masuk all_articles (bukan
    LM-calls) — sederhana & predictable untuk coverage di BQ.

    TPDLimitExceeded — Groq quota habis hari itu. Pipeline save partial dan
    exit graceful. Sisa keyword tidak diproses (sudah ke-skip duluan oleh
    priority ordering: AZ + Regulatory diproses di awal saat quota masih ada).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    all_articles: list[dict] = []
    seen_urls: set[str] = set()
    seen_article_ids: set[str] = set()

    try:
        for kw in keywords:
            query = quote_plus(f"{kw} when:{hours}h")
            rss_url = GOOGLE_NEWS_RSS.format(query=query)
            print(f"[*] Fetching RSS for keyword: {kw}", file=sys.stderr)
            feed = feedparser.parse(rss_url)

            saved_for_kw = 0
            for entry in feed.entries:
                if saved_for_kw >= max_per_keyword:
                    print(f"    [cap reached] {max_per_keyword} artikel saved untuk '{kw}',"
                          f" lanjut keyword berikutnya", file=sys.stderr)
                    break

                if entry.link in seen_urls:
                    continue
                seen_urls.add(entry.link)
                try:
                    pub_dt = date_parser.parse(entry.published).astimezone(timezone.utc)
                    if pub_dt < cutoff:
                        continue
                except Exception:
                    pass

                article = process_article(entry, fetch_body, groq)
                if article:
                    if article["id"] in seen_article_ids:
                        print(
                            f"    skip duplicate canonical article id: {article['id']}",
                            file=sys.stderr,
                        )
                        continue
                    seen_article_ids.add(article["id"])
                    all_articles.append(article)
                    saved_for_kw += 1
    except TPDLimitExceeded as e:
        # Groq daily quota habis — keluar dari semua loop, save apa yang
        # sudah ada. Pipeline (main) tetap save_json + save_csv + exit 0.
        # Acceptable degradation: scrape harian belum lengkap tapi data
        # tersimpan + kualitas tidak compromise.
        print(f"\n[!] TPD limit reached — stopping scrape early.", file=sys.stderr)
        print(f"    {len(all_articles)} artikel sudah ke-collect, lanjut save partial.",
              file=sys.stderr)
        print(f"    Groq msg: {str(e)[:200]}", file=sys.stderr)

    return all_articles


def _load_env_file(path: str) -> None:
    """Load KEY=VALUE pairs dari .env file ke os.environ (skip kalau sudah set)."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> None:
    _load_env_file(os.path.join(os.path.dirname(__file__) or ".", ".env"))

    p = argparse.ArgumentParser(description="AstraZeneca Indonesia daily news fetcher")
    p.add_argument("--keywords", default=",".join(DEFAULT_KEYWORDS))
    p.add_argument("--hours", type=int, default=24)
    p.add_argument("--output", default=DEFAULT_OUTPUT,
                   help="CSV output path. JSON disimpan ke path yang sama dengan ekstensi .json")
    p.add_argument("--json-only", action="store_true",
                   help="Skip CSV; output hanya JSON (untuk feed langsung ke web)")
    p.add_argument("--no-fetch-body", action="store_true")
    p.add_argument("--use-groq", action="store_true",
                   help="Use Groq Cloud LM (requires GROQ_API_KEY env var)")
    p.add_argument("--max-per-keyword", type=int, default=5,
                   help="Cap artikel ter-save per keyword (anti-burst guard). "
                        "Default 5. Naikkan kalau quota lega + ingin coverage "
                        "lebih luas; turunkan kalau quota mepet.")
    args = p.parse_args()

    groq = None
    if args.use_groq:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            print("[!] GROQ_API_KEY tidak ada di env. Falling back to rule-based.",
                  file=sys.stderr)
            print("    Daftar di https://console.groq.com untuk dapat API key (gratis)",
                  file=sys.stderr)
        else:
            groq = GroqClient(api_key)
            if not groq.health_check():
                print("[!] Groq health check gagal, fallback ke rule-based",
                      file=sys.stderr)
                groq = None
            else:
                print(f"[*] Groq enabled: {groq.model}", file=sys.stderr)

    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]
    print(f"[*] Processing {len(keywords)} keywords (priority-ordered: "
          f"AZ → Regulatory → Crisis), cap={args.max_per_keyword}/keyword",
          file=sys.stderr)
    articles = fetch_news(
        keywords=keywords,
        hours=args.hours,
        fetch_body=not args.no_fetch_body,
        groq=groq,
        max_per_keyword=args.max_per_keyword,
    )

    articles.sort(key=lambda a: (
        0 if a["category"] == "Regulatory/Policy" else 1,
        -date_parser.parse(a["date"]).timestamp()
    ))

    json_path = os.path.splitext(args.output)[0] + ".json"
    save_json(articles, json_path)
    if not args.json_only:
        save_csv(articles, args.output)
    print(f"[+] Done. {len(articles)} articles processed.", file=sys.stderr)


if __name__ == "__main__":
    main()
