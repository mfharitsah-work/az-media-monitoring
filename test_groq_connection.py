"""
Test koneksi ke Groq Cloud — pastikan setup benar
sebelum jalanin fetch_news.py --use-groq.

Best-practice approach yang divalidasi:
1. Pydantic ArticleAnalysis sebagai single source of truth (schema + validation)
2. Groq Structured Outputs (response_format: json_schema, strict: true)
3. Response otomatis ter-parse + ter-validasi → typed object

Usage:
    # Lewat .env file (sudah ada di project)
    python test_groq_connection.py

    # Atau lewat env var:
    export GROQ_API_KEY="gsk_..."
    python test_groq_connection.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from fetch_news import ArticleAnalysis, GroqClient


SAMPLE_HEADLINE = "AstraZeneca - Kemenkes kolaborasi tangani penyakit tidak menular"
SAMPLE_BODY = (
    "AstraZeneca, perusahaan biofarmasi global, bersama Kementerian Kesehatan "
    "(Kemenkes) memperkuat kerjasama dalam penanganan penyakit tidak menular "
    "di tanah air. Kerja sama tersebut mencakup berbagai area penting dalam "
    "penanganan penyakit tidak menular, seperti diabetes, kanker, asma, "
    "penyakit paru obstruktif kronis (PPOK), infeksi virus RSV, penyakit "
    "ginjal kronis, hingga penyakit langka. Melalui kolaborasi ini, "
    "Kementerian Kesehatan bertekad membangun sistem kesehatan yang lebih "
    "kuat dan inklusif."
)


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE pairs dari file .env ke os.environ (skip kalau sudah set)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def main() -> int:
    load_env_file(Path(__file__).parent / ".env")

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("[!] GROQ_API_KEY tidak ada di env atau .env file.")
        print('    Set di .env: GROQ_API_KEY="gsk_..."')
        print("    (dapat di https://console.groq.com/keys)")
        return 1

    if not api_key.startswith("gsk_"):
        print(f"[!] GROQ_API_KEY tidak terlihat valid (harus mulai 'gsk_')")
        print(f"    Anda set: {api_key[:10]}...")
        return 1

    print(f"[*] Testing Groq connection...")
    print(f"    API key prefix: {api_key[:8]}... (length: {len(api_key)})")

    client = GroqClient(api_key)

    print("\n[1/3] Health check...")
    if not client.health_check():
        return 1
    print(f"    OK — model '{client.model}' reachable")

    print("\n[2/3] Send sample article (Structured Outputs / strict JSON Schema)...")
    start = time.time()
    result = client.analyze_article(SAMPLE_HEADLINE, SAMPLE_BODY)
    elapsed = time.time() - start

    if result is None:
        print("    FAIL: response gagal di-parse atau gagal validasi schema")
        print("    (kalau model tidak support strict JSON Schema, akan terlihat di error log)")
        return 1

    print(f"    OK ({elapsed:.1f}s) — response valid sesuai schema")

    print("\n[3/3] Verify typed object...")
    # Karena Pydantic sudah validate, di sini cukup assert tipe — bukan presence check
    assert isinstance(result, ArticleAnalysis), f"Expected ArticleAnalysis, got {type(result)}"
    assert result.category in {"AstraZeneca", "Regulatory"}
    assert result.sentiment in {"Positive", "Neutral", "Negative"}
    print("    OK — semua field bertipe benar dan masuk enum")

    print("\n" + "=" * 60)
    print(f"RESPONSE FROM GROQ ({client.model}):")
    print("=" * 60)
    print(f"Summary    : {result.summary}")
    print(f"Category   : {result.category}")
    print(f"Sentiment  : {result.sentiment}")
    print(f"Keywords   : {result.keywords}")
    print("=" * 60)

    print("\n    JSON serialized (untuk inspeksi):")
    print(result.model_dump_json(indent=2))

    print("\n[OK] Setup ready. Run:")
    print("    python fetch_news.py --use-groq --output today.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
