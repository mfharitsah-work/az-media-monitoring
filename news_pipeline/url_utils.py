"""URL normalization and source allowlist helpers."""

from __future__ import annotations

import hashlib
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from .config import SOURCE_BLOCKLIST, SOURCE_WHITELIST, VIDEO_PATH_SEGMENT_RE

TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "gbraid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
    "wbraid",
}


def canonicalize_article_url(url: str) -> str:
    """Normalize article URL for identity/dedupe only."""
    original = url.strip()
    try:
        parsed = urlparse(original)
    except Exception:
        return original

    if not parsed.scheme or not parsed.netloc:
        return original

    netloc = parsed.netloc
    lower_netloc = netloc.lower()

    # AMP/mobile hosts usually mirror the canonical www article.
    if lower_netloc.startswith("amp."):
        netloc = "www." + netloc[4:]
        lower_netloc = netloc.lower()
    elif lower_netloc.startswith("m."):
        netloc = "www." + netloc[2:]
        lower_netloc = netloc.lower()

    segments = [seg for seg in parsed.path.split("/") if seg]
    filtered_segments = [seg for seg in segments if seg.lower() != "amp"]

    # SINDO exposes both /read/ and /newsread/ for the same article.
    if lower_netloc.endswith("sindonews.com"):
        filtered_segments = [
            "read" if seg.lower() == "newsread" else seg
            for seg in filtered_segments
        ]

    path = "/" + "/".join(filtered_segments) if filtered_segments else parsed.path or "/"

    query_pairs = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        key_lower = key.lower()
        if key_lower in TRACKING_QUERY_KEYS or key_lower.startswith("utm_"):
            continue
        if key_lower == "page":
            continue
        query_pairs.append((key, value))

    query = urlencode(query_pairs, doseq=True)

    return urlunparse((
        parsed.scheme,
        netloc,
        path,
        "",
        query,
        "",
    ))


def make_article_id(url: str) -> str:
    identity_url = canonicalize_article_url(url)
    return hashlib.sha256(identity_url.encode("utf-8")).hexdigest()[:12]


def _normalized_netloc(url: str) -> str:
    netloc = urlparse(url).netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


def is_blocked_source_url(url: str) -> bool:
    """True kalau URL ada di blocklist walau apex domain-nya whitelisted."""
    parsed = urlparse(url)
    netloc = _normalized_netloc(url)
    if any(netloc == d or netloc.endswith("." + d) for d in SOURCE_BLOCKLIST):
        return True
    return bool(VIDEO_PATH_SEGMENT_RE.search(parsed.path))


def is_whitelisted_source(url: str) -> bool:
    """True kalau domain URL ada di SOURCE_WHITELIST dan tidak di-block."""
    if is_blocked_source_url(url):
        return False
    netloc = _normalized_netloc(url)
    return any(netloc == d or netloc.endswith("." + d) for d in SOURCE_WHITELIST)
