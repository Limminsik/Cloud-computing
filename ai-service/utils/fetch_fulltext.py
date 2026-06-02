"""Utility to fetch full text of a paper.

Accepts either a URL string (legacy) or a paper dict with multiple URL fields.

Strategy order:
1. open_access_pdf  → direct PDF download
2. arxiv_url        → ar5iv HTML or arXiv abstract
3. pmc_url          → PubMed Central HTML (free full text)
4. doi_url          → Unpaywall OA resolver → PDF/HTML
5. url (primary)    → PDF or HTML
6. pubmed_url       → PubMed abstract page (fallback)
"""

import logging
import re
import httpx
from io import BytesIO

from config import CONTACT_EMAIL

logger = logging.getLogger("fetch_fulltext")

try:
    from pypdf import PdfReader
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

HEADERS = {
    "User-Agent": f"Mozilla/5.0 (compatible; GachonScholar/1.0; systematic review bot; {CONTACT_EMAIL})"
}
TIMEOUT = 20
MAX_CHARS = 12000  # ~3,000 tokens to Claude


def _truncate(text: str) -> str:
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:MAX_CHARS] + ("..." if len(text) > MAX_CHARS else "")


# ── Individual fetchers ───────────────────────────────────────────────────────

def _extract_arxiv_id(url: str) -> str | None:
    m = re.search(r'arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})', url or "")
    return m.group(1) if m else None


def _fetch_arxiv(arxiv_id: str) -> str | None:
    # Try ar5iv HTML version first
    try:
        resp = httpx.get(
            f"https://ar5iv.org/html/{arxiv_id}",
            headers=HEADERS, timeout=TIMEOUT, follow_redirects=True
        )
        if resp.status_code == 200 and HAS_BS4:
            soup = BeautifulSoup(resp.text, "lxml")
            for tag in soup.select("nav, header, footer, script, style, .ltx_bibliography"):
                tag.decompose()
            text = soup.get_text(separator=" ")
            if len(text.strip()) > 200:
                return _truncate(text)
    except Exception:
        pass

    # Fallback: arXiv abstract page
    try:
        resp = httpx.get(
            f"https://arxiv.org/abs/{arxiv_id}",
            headers=HEADERS, timeout=TIMEOUT, follow_redirects=True
        )
        if resp.status_code == 200 and HAS_BS4:
            soup = BeautifulSoup(resp.text, "lxml")
            parts = []
            title_el = soup.select_one("h1.title")
            abstract_el = soup.select_one(".abstract")
            if title_el:
                parts.append(title_el.get_text())
            if abstract_el:
                parts.append(abstract_el.get_text())
            if parts:
                return _truncate(" ".join(parts))
    except Exception:
        pass
    return None


def _fetch_pdf(url: str) -> str | None:
    if not HAS_PYPDF:
        return None
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return None
        content_type = resp.headers.get("content-type", "")
        if "pdf" not in content_type and not url.lower().endswith(".pdf"):
            return None
        reader = PdfReader(BytesIO(resp.content))
        text = " ".join(page.extract_text() or "" for page in reader.pages[:15])
        return _truncate(text) if text.strip() else None
    except Exception:
        return None


def _fetch_html(url: str, selectors: list[str] | None = None) -> str | None:
    if not HAS_BS4:
        return None
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            return None
        content_type = resp.headers.get("content-type", "")
        if "html" not in content_type:
            return None
        soup = BeautifulSoup(resp.text, "lxml")
        for tag in soup.select("nav, header, footer, script, style, aside, .cookie, .banner"):
            tag.decompose()

        # Try custom selectors first (for specific sites)
        if selectors:
            for sel in selectors:
                el = soup.select_one(sel)
                if el:
                    text = el.get_text(separator=" ")
                    if len(text.strip()) > 200:
                        return _truncate(text)

        # Generic fallback
        main = (
            soup.select_one("article")
            or soup.select_one("main")
            or soup.select_one(".article-body")
            or soup.select_one("#abstract")
            or soup.body
        )
        text = (main or soup).get_text(separator=" ")
        return _truncate(text) if len(text.strip()) > 200 else None
    except Exception:
        return None


def _fetch_pmc(pmc_url: str) -> str | None:
    """Fetch PubMed Central free full text HTML."""
    return _fetch_html(pmc_url, selectors=[
        "#mc-main-content",
        ".article-body",
        "#article-back",
        "article",
    ])


def _fetch_unpaywall(doi_url: str) -> str | None:
    """Use Unpaywall API to find a free OA version of a DOI paper."""
    doi_match = re.search(r'doi\.org/(.+)', doi_url)
    if not doi_match:
        return None
    doi = doi_match.group(1)
    try:
        resp = httpx.get(
            f"https://api.unpaywall.org/v2/{doi}",
            params={"email": CONTACT_EMAIL},
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        oa_url = None
        # Prefer best_oa_location PDF
        best = data.get("best_oa_location") or {}
        oa_url = best.get("url_for_pdf") or best.get("url_for_landing_page")
        # Fallback: any oa_location with PDF
        if not oa_url:
            for loc in (data.get("oa_locations") or []):
                if loc.get("url_for_pdf"):
                    oa_url = loc["url_for_pdf"]
                    break
        if not oa_url:
            return None
        # Try PDF first, then HTML
        result = _fetch_pdf(oa_url)
        if result:
            return result
        return _fetch_html(oa_url)
    except Exception:
        return None


# ── Public API ────────────────────────────────────────────────────────────────

def fetch_fulltext_with_source(url_or_paper: str | dict | None) -> tuple[str | None, str | None]:
    """Same as fetch_fulltext but also returns the source label that succeeded."""
    if url_or_paper is None:
        return None, None

    if isinstance(url_or_paper, str):
        paper: dict = {"url": url_or_paper}
    else:
        paper = url_or_paper

    attempts: list[tuple[str, object]] = []

    oa_pdf = paper.get("open_access_pdf")
    if oa_pdf:
        attempts.append(("OA PDF", lambda u=oa_pdf: _fetch_pdf(u)))
        attempts.append(("OA PDF (HTML)", lambda u=oa_pdf: _fetch_html(u)))

    arxiv_url = paper.get("arxiv_url") or paper.get("url", "")
    arxiv_id = _extract_arxiv_id(arxiv_url or "")
    if not arxiv_id and paper.get("url"):
        arxiv_id = _extract_arxiv_id(paper["url"])
    if arxiv_id:
        attempts.append(("arXiv", lambda aid=arxiv_id: _fetch_arxiv(aid)))

    pmc_url = paper.get("pmc_url")
    if pmc_url:
        attempts.append(("PubMed Central", lambda u=pmc_url: _fetch_pmc(u)))

    doi_url = paper.get("doi_url")
    if doi_url:
        attempts.append(("Unpaywall", lambda u=doi_url: _fetch_unpaywall(u)))

    primary_url = paper.get("url")
    if primary_url:
        if primary_url.lower().endswith(".pdf") or "/pdf/" in primary_url.lower():
            attempts.append(("직접 PDF", lambda u=primary_url: _fetch_pdf(u)))
        else:
            attempts.append(("직접 링크", lambda u=primary_url: _fetch_html(u)))
            attempts.append(("직접 링크 (PDF)", lambda u=primary_url: _fetch_pdf(u)))

    pubmed_url = paper.get("pubmed_url")
    if pubmed_url and pubmed_url != primary_url:
        attempts.append(("PubMed 초록", lambda u=pubmed_url: _fetch_html(u, selectors=["#abstract", ".abstract-content"])))

    # Gachon Library — last resort (rate-limited, needs credentials for some content)
    title = paper.get("title", "")
    if title:
        try:
            from utils.fetch_library import fetch_from_library
            attempts.append(("가천도서관", lambda t=title: fetch_from_library(t)))
        except ImportError:
            pass

    title_hint = (paper.get("title") or "")[:60]
    if not attempts:
        logger.info(f"[fetch_fulltext] No URL fields available — '{title_hint}'")
        return None, None

    for label, fn in attempts:
        try:
            result = fn()
            if result and len(result.strip()) > 150:
                logger.info(f"[fetch_fulltext] ✓ {label} — '{title_hint}' ({len(result)} chars)")
                return result, label
            else:
                logger.debug(f"[fetch_fulltext] ✗ {label} — '{title_hint}'")
        except Exception as e:
            logger.debug(f"[fetch_fulltext] ✗ {label} error — '{title_hint}': {e}")
            continue

    logger.info(f"[fetch_fulltext] All strategies failed — '{title_hint}'")
    return None, None


def fetch_fulltext(url_or_paper: str | dict | None) -> str | None:
    """Convenience wrapper — returns text only (source label discarded)."""
    text, _ = fetch_fulltext_with_source(url_or_paper)
    return text
