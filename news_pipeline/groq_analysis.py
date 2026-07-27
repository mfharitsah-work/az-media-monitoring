"""Groq Structured Outputs client and response schema."""

from __future__ import annotations

import json
import re
import sys
import time
from typing import Literal

import requests
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .config import GROQ_API_URL, GROQ_MODEL, GROQ_TIMEOUT, SYSTEM_PROMPT


# 2-level taxonomy: Category > Subcategory.
# LM hanya return Subcategory; Category di-derive via SUBCATEGORY_TO_CATEGORY.
#
# Category "About AstraZeneca":
#   - "AZ Focus"             : AZ atau produknya (Vaxzevria, Imfinzi, Tagrisso, dll) sbg topik utama
#   - "AZ Mentioned"         : AZ disebut sebagai data point dalam topik yg lebih general
#
# Category "Regulatory/Policy":
#   - "Stakeholder & Regulator"   : aktor pemerintah (BPOM, Kemenkes, BPJS, DPR Komisi IX, LKPP, MUI Halal)
#   - "Pharma Policy"             : kebijakan industri farmasi (HTA, formularium, izin edar obat, e-catalogue, market access)
#   - "General Health Regulation" : regulasi kesehatan umum (UU Kesehatan, RUU, Permenkes, kebijakan vaksin/obat)
#
# Skip:
#   - "Not Relevant"  : di-FILTER OUT di process_article, tidak masuk database
Subcategory = Literal[
    # About AstraZeneca
    "AZ Focus", "AZ Mentioned",
    # Regulatory/Policy
    "Stakeholder & Regulator", "Pharma Policy", "General Health Regulation",
    # Standalone category (no real subcategory — di-flatten ke level kategori
    # di process_article: row.category = label ini, row.subcategory = NULL)
    "Crisis & Disruption",
    # Skip
    "Not Relevant",
]
Sentiment = Literal["Positive", "Neutral", "Negative"]

SUBCATEGORY_TO_CATEGORY: dict[str, str] = {
    "AZ Focus": "About AstraZeneca",
    "AZ Mentioned": "About AstraZeneca",
    "Stakeholder & Regulator": "Regulatory/Policy",
    "Pharma Policy": "Regulatory/Policy",
    "General Health Regulation": "Regulatory/Policy",
    # Self-mapping — "subcategory" ini di-promote ke level kategori
    "Crisis & Disruption": "Crisis & Disruption",
}

# Subcategory yang sebenarnya kategori standalone (tidak punya sub).
# Di process_article, untuk subcategory ini: row.category = label, row.subcategory = NULL.
STANDALONE_CATEGORIES: set[str] = {"Crisis & Disruption"}


class ArticleAnalysis(BaseModel):
    """Schema response dari LM. Dipakai untuk:
    1. Generate JSON Schema → dikirim ke Groq (`response_format: json_schema`)
    2. Validate + parse response → typed Python object

    Kalau struktur berubah, cukup edit class ini — prompt & validasi sinkron otomatis.

    DUAL-LANGUAGE: LM produce SEPARATE Indonesian + English fields untuk headline,
    summary, dan keywords. Disimpan ke kolom BQ terpisah (mis. `headline` = en,
    `headline_id` = id) supaya UI bisa toggle bahasa tanpa Groq call on-demand.
    """
    # `extra='forbid'` menambahkan `additionalProperties: false` ke JSON Schema —
    # Groq strict mode butuh ini di setiap object.
    model_config = ConfigDict(extra="forbid")

    # --- Headline (translate dari RSS Indonesian) ---
    headline_en: str = Field(
        description="English headline translation. Preserve proper nouns and "
                    "Indonesian acronyms (BPOM, Kemenkes, AstraZeneca, BPJS, JKN, "
                    "Permenkes, Komisi IX, DPR, dll). Length similar to original.",
        max_length=400,
    )
    # --- Summary (LM generate dari body) ---
    summary_id: str = Field(
        description="Ringkasan 2-3 kalimat Bahasa Indonesia, max 300 karakter",
        max_length=600,
    )
    summary_en: str = Field(
        description="English summary, 2-3 sentences, max 300 chars. "
                    "Translate `summary_id` keeping facts identical. "
                    "Preserve proper nouns and Indonesian acronyms.",
        max_length=600,
    )
    # --- Classification ---
    subcategory: Subcategory = Field(description="Klasifikasi spesifik artikel (lihat aturan di prompt)")
    sentiment: Sentiment = Field(description="Sentimen dari sudut pandang AstraZeneca")
    # --- Keywords (Indonesian + English) ---
    keywords_id: str = Field(description="5 keyword Bahasa Indonesia dipisah koma")
    keywords_en: str = Field(
        description="5 English keywords, comma-separated. Translate keywords_id; "
                    "preserve proper nouns and acronyms.",
    )
    # --- Location (proper nouns Indonesian — no translation) ---
    city: str = Field(
        description="Kota di Indonesia yang menjadi fokus berita (mis. 'Jakarta', 'Surabaya'). "
                    "String kosong '' kalau tidak ada kota spesifik disebut.",
        max_length=80,
    )
    province: str = Field(
        description="Provinsi Indonesia yang menjadi fokus berita, nama resmi "
                    "(mis. 'DKI Jakarta', 'Jawa Barat', 'Jawa Timur'). "
                    "String kosong '' kalau tidak disebut atau berita nasional/global.",
        max_length=80,
    )


def _build_response_format() -> dict:
    """Bangun payload `response_format` Groq Structured Outputs dari Pydantic model."""
    schema = ArticleAnalysis.model_json_schema()
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "ArticleAnalysis",
            "schema": schema,
            "strict": True,
        },
    }



class GroqClient:
    """
    Client untuk Groq Cloud API. Pakai response_format=json_object untuk
    enforce structured output. Default model: Llama 3.3 70B Versatile.

    Reference: https://console.groq.com/docs/api-reference
    
    Pattern API ini OpenAI-compatible — kalau nanti mau pindah ke provider
    lain (OpenAI, Together AI, Anyscale), tinggal ganti URL dan API key.
    """

    def __init__(self, api_key: str, model: str = GROQ_MODEL):
        self.api_key = api_key
        self.model = model
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def health_check(self) -> bool:
        """Test koneksi dengan call ringan."""
        try:
            resp = self._session.post(
                GROQ_API_URL,
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": "say 'ok'"}],
                    "max_tokens": 5,
                },
                timeout=10,
            )
            resp.raise_for_status()
            return True
        except requests.HTTPError as e:
            if e.response.status_code == 401:
                print(f"[!] API key invalid atau expired", file=sys.stderr)
            elif e.response.status_code == 429:
                print(f"[!] Rate limit terlampaui", file=sys.stderr)
            else:
                print(f"[!] Groq health check failed: {e}", file=sys.stderr)
            return False
        except Exception as e:
            print(f"[!] Groq tidak reachable: {e}", file=sys.stderr)
            return False

    def analyze_article(self, headline: str, body: str) -> ArticleAnalysis | None:
        """Kirim artikel ke Groq, return ArticleAnalysis ter-validasi atau None kalau gagal."""
        user_prompt = (
            f"Analisis artikel berikut.\n\n"
            f"HEADLINE: {headline}\n\n"
            f"BODY:\n{body[:3500]}"
        )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": _build_response_format(),  # Structured Outputs (strict JSON Schema)
            "temperature": 0.3,  # rendah untuk konsistensi
            # Dual-language output (ID + EN headline/summary/keywords) butuh budget
            # lebih besar dari single-language schema. 1500 cukup untuk 2× summary
            # 300 char + 2× keywords + headline_en + classifier fields.
            "max_tokens": 1500,
        }

        response_text = self._post_with_retry(payload)
        if response_text is None:
            return None

        try:
            return ArticleAnalysis.model_validate_json(response_text)
        except ValidationError as e:
            print(f"    ! Schema validation failed: {e.error_count()} error(s)", file=sys.stderr)
            print(f"    Raw: {response_text[:200]}...", file=sys.stderr)
            return None
        except json.JSONDecodeError as e:
            print(f"    ! JSON parse failed: {e}", file=sys.stderr)
            return None

    def _post_with_retry(self, payload: dict, max_retries: int = 5) -> str | None:
        """POST ke Groq dengan retry untuk 429 (rate limit). Return raw content string.

        Smart retry: parse pesan error Groq yang ngasih tahu waktu retry tepat
        ("Please try again in 2.9175s"). Lebih reliable daripada fixed sleep.
        Fallback ke exponential backoff kalau parsing gagal.

        Raises:
            TPDLimitExceeded: kalau Groq response menandakan TPD (tokens-per-day)
                terlampaui. Caller harus stop scrape dan save partial — retry sia-sia
                karena reset window 20+ menit dan total quota habis hari itu.
        """
        attempt = 0
        while True:
            try:
                resp = self._session.post(GROQ_API_URL, json=payload, timeout=GROQ_TIMEOUT)
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
            except requests.Timeout:
                print(f"    ! Groq timeout setelah {GROQ_TIMEOUT}s", file=sys.stderr)
                return None
            except requests.HTTPError as e:
                status = e.response.status_code
                err_body = e.response.text if e.response is not None else ""
                # Distinguish TPD (daily) vs TPM (per-minute). TPD = hard stop,
                # tidak ada gunanya retry; signal caller untuk graceful exit.
                if status == 429 and "tokens per day" in err_body.lower():
                    raise TPDLimitExceeded(err_body[:300])
                if status == 429 and attempt < max_retries:
                    attempt += 1
                    wait = _parse_retry_after(err_body, fallback=min(60, 5 * 2 ** attempt))
                    print(f"    ! 429 TPM hit, wait {wait:.1f}s & retry ({attempt}/{max_retries})...",
                          file=sys.stderr)
                    time.sleep(wait)
                    continue
                print(f"    ! Groq HTTP {status}: {err_body[:500]}", file=sys.stderr)
                return None
            except Exception as e:
                print(f"    ! Groq call failed: {e}", file=sys.stderr)
                return None


class TPDLimitExceeded(Exception):
    """Groq daily token budget exhausted. Pipeline should save partial + exit graceful.

    Raised dari `GroqClient._post_with_retry` saat response 429 menyebut
    "tokens per day (TPD)" — beda dari TPM yang bisa di-retry dalam detik.
    """
    pass


_RETRY_AFTER_RE = re.compile(r"try again in ([0-9]+(?:\.[0-9]+)?)(ms|s)")


def _parse_retry_after(err_body: str, fallback: float) -> float:
    """Parse 'Please try again in 2.9175s' atau '352.5ms' dari pesan error Groq.
    Return waktu tunggu dalam detik, plus 0.5s buffer untuk safety."""
    m = _RETRY_AFTER_RE.search(err_body)
    if not m:
        return fallback
    val = float(m.group(1))
    if m.group(2) == "ms":
        val = val / 1000
    return val + 0.5
