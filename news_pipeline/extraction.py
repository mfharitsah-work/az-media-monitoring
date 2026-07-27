"""RSS URL resolution and article body extraction helpers."""

from __future__ import annotations

import sys
from urllib.parse import urljoin

import requests
import trafilatura
from bs4 import BeautifulSoup
from googlenewsdecoder import gnewsdecoder

from .config import USER_AGENT

def resolve_google_news_url(url: str) -> str:
    """Decode URL Google News RSS (`news.google.com/rss/articles/...`) ke URL artikel asli.

    Google News URL bukan HTTP-redirect; URL asli base64-encoded di path dan harus
    di-decode dengan algoritma khusus. Untuk URL non-Google News, return apa adanya.
    """
    if "news.google.com" not in url:
        return url
    try:
        result = gnewsdecoder(url, interval=1)
        if result.get("status") and result.get("decoded_url"):
            return result["decoded_url"]
        print(f"    ! decode gagal: {result.get('message', '')[:80]}", file=sys.stderr)
        return url
    except Exception as e:
        print(f"    ! decode error: {e}", file=sys.stderr)
        return url


def parse_source_from_title(title: str) -> tuple[str, str]:
    if " - " in title:
        parts = title.rsplit(" - ", 1)
        return parts[0].strip(), parts[1].strip()
    return title.strip(), ""


def fetch_article_text(url: str, timeout: int = 10) -> str:
    """Extract main article body. trafilatura → fallback ke selectors generic.

    trafilatura adalah library purpose-built untuk news extraction — handle 99%
    situs Indonesia (Kompas, Detik, Tempo, Tribun, ANTARA) tanpa site-specific
    selectors. Return empty string kalau gagal — caller harus check len()
    sebelum kirim ke LM (otherwise summary jadi rubbish karena LM cuma punya
    headline).
    """
    try:
        resp = requests.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=timeout, allow_redirects=True
        )
        if resp.status_code != 200:
            return ""

        # Primary: trafilatura — pakai favor_recall biar agresif extract main content
        extracted = trafilatura.extract(
            resp.text,
            favor_recall=True,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
        )
        if extracted and len(extracted) > 200:
            return extracted[:5000]

        # Fallback: selector-based (kalau trafilatura gagal — rare untuk modern news sites)
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            tag.decompose()
        selectors = [
            "article", "[itemprop='articleBody']", ".detail__body-text",
            ".read__content", ".article-content", ".post-content",
            ".detail-text", ".content-detail", "main", "#content"
        ]
        for sel in selectors:
            elem = soup.select_one(sel)
            if elem:
                text = elem.get_text(separator=" ", strip=True)
                if len(text) > 200:
                    return text[:5000]
        paragraphs = [p.get_text(strip=True) for p in soup.find_all("p")]
        return " ".join(paragraphs)[:5000]
    except Exception as e:
        print(f"    ! fetch failed: {e}", file=sys.stderr)
        return ""


def extract_html_canonical_url(html: str, base_url: str) -> str | None:
    """Return <link rel="canonical"> href if present."""
    soup = BeautifulSoup(html, "html.parser")

    def has_canonical_rel(value) -> bool:
        if not value:
            return False
        if isinstance(value, str):
            return "canonical" in value.lower().split()
        return any(str(item).lower() == "canonical" for item in value)

    tag = soup.find("link", rel=has_canonical_rel)
    if not tag:
        return None
    href = tag.get("href")
    if not href:
        return None
    return urljoin(base_url, href)


def fetch_article_text_and_canonical(url: str, timeout: int = 10) -> tuple[str, str | None]:
    """Extract main article body plus canonical URL for identity dedupe."""
    try:
        resp = requests.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=timeout, allow_redirects=True
        )
        if resp.status_code != 200:
            return "", None

        canonical_url = extract_html_canonical_url(resp.text, resp.url)
        extracted = trafilatura.extract(
            resp.text,
            favor_recall=True,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
        )
        if extracted and len(extracted) > 200:
            return extracted[:5000], canonical_url

        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            tag.decompose()
        selectors = [
            "article", "[itemprop='articleBody']", ".detail__body-text",
            ".read__content", ".article-content", ".post-content",
            ".detail-text", ".content-detail", "main", "#content"
        ]
        for sel in selectors:
            elem = soup.select_one(sel)
            if elem:
                text = elem.get_text(separator=" ", strip=True)
                if len(text) > 200:
                    return text[:5000], canonical_url
        paragraphs = [p.get_text(strip=True) for p in soup.find_all("p")]
        return " ".join(paragraphs)[:5000], canonical_url
    except Exception as e:
        print(f"    ! fetch failed: {e}", file=sys.stderr)
        return "", None
