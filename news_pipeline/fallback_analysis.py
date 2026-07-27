"""Rule-based fallback analysis used when Groq is unavailable."""

from __future__ import annotations

import re

from .config import NEGATIVE_WORDS, POSITIVE_WORDS

def _has_keyword(text_lower: str, keyword: str) -> bool:
    return bool(re.search(rf"\b{re.escape(keyword)}\b", text_lower))


def simple_sentiment(text: str) -> str:
    text_lower = text.lower()
    pos_count = sum(1 for w in POSITIVE_WORDS if _has_keyword(text_lower, w))
    neg_count = sum(1 for w in NEGATIVE_WORDS if _has_keyword(text_lower, w))
    total = pos_count + neg_count
    if total == 0:
        return "Neutral"
    score = (pos_count - neg_count) / total
    if score >= 0.25:
        return "Positive"
    elif score <= -0.25:
        return "Negative"
    return "Neutral"


STAKEHOLDER_KEYWORDS = [
    "bpom", "kemenkes", "kementerian kesehatan", "menkes", "bpjs kesehatan",
    "komisi ix dpr", "kemenperin", "lkpp", "mui halal",
]
PHARMA_POLICY_KEYWORDS = [
    "hta", "formularium nasional", "fornas", "e-katalog", "izin edar obat",
    "ina-cbgs", "tkdn farmasi", "uji klinis", "drug reimbursement",
    "market access", "biologic regulation", "vaccine regulation",
]


def detect_subcategory(text: str) -> str:
    """Fallback rule-based — dipakai kalau Groq gagal. Best-effort match by keyword."""
    text_lower = text.lower()
    has_az = "astrazeneca" in text_lower or "vaxzevria" in text_lower or "imfinzi" in text_lower

    if has_az:
        # Heuristic: if AZ in headline/early body, it's likely the focus.
        return "AZ Focus" if text_lower.find("astrazeneca") < 200 else "AZ Mentioned"

    if any(_has_keyword(text_lower, kw) for kw in STAKEHOLDER_KEYWORDS):
        return "Stakeholder & Regulator"
    if any(_has_keyword(text_lower, kw) for kw in PHARMA_POLICY_KEYWORDS):
        return "Pharma Policy"
    return "General Health Regulation"


def make_summary(text: str, max_chars: int = 300) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    summary = ""
    for s in sentences[:3]:
        if len(summary) + len(s) > max_chars:
            break
        summary += s + " "
    return summary.strip()


def extract_keywords(text: str, n: int = 5) -> str:
    stopwords = {
        "yang", "dan", "untuk", "dari", "dengan", "pada", "di", "ke", "ini",
        "itu", "adalah", "akan", "atau", "tidak", "juga", "dalam", "telah",
        "oleh", "para", "kita", "kami", "mereka", "saya", "anda", "the",
        "and", "for", "with", "from", "to", "in", "of", "is", "are", "a", "an"
    }
    words = re.findall(r"\b[a-zA-Z]{4,}\b", text.lower())
    freq: dict[str, int] = {}
    for w in words:
        if w not in stopwords:
            freq[w] = freq.get(w, 0) + 1
    top = sorted(freq.items(), key=lambda x: -x[1])[:n]
    return ", ".join(w for w, _ in top)


def detect_language(text: str) -> str:
    id_markers = {"yang", "dan", "untuk", "dari", "dengan", "adalah", "akan", "tidak"}
    text_lower = text.lower()
    id_count = sum(1 for w in id_markers if _has_keyword(text_lower, w))
    return "id" if id_count >= 2 else "en"
