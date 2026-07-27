"""Serialization helpers for scraper CSV and JSON outputs."""

from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone

# Urutan kolom = urutan kontrak data untuk web/database. JANGAN ubah tanpa migrasi.
# Catatan dual-language: kolom utama (headline/summary/keywords) = English;
# kolom *_id = Indonesian original.
OUTPUT_COLUMNS = [
    "id",
    "headline", "headline_id",
    "url", "date", "source",
    "summary", "summary_id",
    "category", "subcategory", "sentiment",
    "keywords", "keywords_id",
    "city", "province",
    "language", "scraped_at",
]


def save_csv(articles: list[dict], path: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for art in articles:
            writer.writerow({k: art.get(k, "") for k in OUTPUT_COLUMNS})
    print(f"[+] Saved CSV: {len(articles)} rows → {path}", file=sys.stderr)


def save_json(articles: list[dict], path: str) -> None:
    """Output untuk konsumsi web (Next.js dst). Pretty-printed, UTF-8 mentah."""
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(articles),
        "articles": [{k: art.get(k, "") for k in OUTPUT_COLUMNS} for art in articles],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[+] Saved JSON: {len(articles)} rows → {path}", file=sys.stderr)
