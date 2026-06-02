"""Gachon University Central Library full-text fetcher.

Strategy:
  1. Search library with paper title
  2. Parse results for Open Access links (no auth needed)
  3. If credentials provided, login and access institutional links
  4. Extract text from PDF or HTML full text
"""

import json
import logging
import re
import time
from io import BytesIO
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlencode, quote

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("fetch_library")

# Docker: /app/configuration.json (mounted from repo root)
# Local:  ai-service/../configuration.json
CONFIG_PATH = Path(__file__).parent.parent / "configuration.json"
if not CONFIG_PATH.exists():
    CONFIG_PATH = Path(__file__).parent.parent.parent / "configuration.json"
LIBRARY_SEARCH = "https://lib.gachon.ac.kr/searchTotal/result"
LIBRARY_LOGIN  = "https://lib.gachon.ac.kr/Account/LogOn"

_SESSION_CACHE: dict[str, requests.Session] = {}


def _load_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _get_session(username: str = "", password: str = "") -> requests.Session:
    """Return a requests Session, logging in if credentials provided."""
    cache_key = username or "__anon__"
    if cache_key in _SESSION_CACHE:
        return _SESSION_CACHE[cache_key]

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                      " (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    })

    if username and password:
        try:
            # Get login page to retrieve any CSRF token
            resp = session.get(LIBRARY_LOGIN, timeout=10)
            soup = BeautifulSoup(resp.text, "html.parser")
            token_input = soup.find("input", {"name": "__RequestVerificationToken"})
            token = token_input["value"] if token_input else ""

            login_data = {
                "UserId":   username,
                "Password": password,
                "__RequestVerificationToken": token,
            }
            login_resp = session.post(LIBRARY_LOGIN, data=login_data, timeout=10, allow_redirects=True)
            if login_resp.ok:
                logger.info("[Library] Logged in successfully as %s", username)
            else:
                logger.warning("[Library] Login failed (status %d)", login_resp.status_code)
        except Exception as e:
            logger.warning("[Library] Login error: %s", e)

    _SESSION_CACHE[cache_key] = session
    return session


def _extract_text_from_pdf_bytes(content: bytes) -> Optional[str]:
    try:
        from pypdf import PdfReader
        reader = PdfReader(BytesIO(content))
        text = " ".join(page.extract_text() or "" for page in reader.pages[:30])
        text = re.sub(r"\s+", " ", text).strip()
        return text if len(text) >= 200 else None
    except Exception as e:
        logger.debug("[Library] PDF parse error: %s", e)
        return None


def _fetch_url_text(session: requests.Session, url: str) -> Optional[str]:
    """Try to download and read text from a URL (PDF or HTML)."""
    try:
        resp = session.get(url, timeout=20, allow_redirects=True)
        if not resp.ok:
            return None
        ct = resp.headers.get("Content-Type", "")
        if "pdf" in ct or url.lower().endswith(".pdf"):
            return _extract_text_from_pdf_bytes(resp.content)
        # HTML — try to extract main text
        soup = BeautifulSoup(resp.text, "lxml")
        # Remove scripts/styles
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator=" ", strip=True)
        text = re.sub(r"\s+", " ", text).strip()
        return text if len(text) >= 200 else None
    except Exception as e:
        logger.debug("[Library] URL fetch error (%s): %s", url, e)
        return None


def _parse_fulltext_links(soup: BeautifulSoup) -> list[dict]:
    """Parse library search result page for Full Text links.

    Returns list of {label, url, is_open_access}.
    """
    links = []
    # EDS-style result page: look for <a> tags with 원문보기 / Full Text labels
    for a in soup.find_all("a", href=True):
        label = a.get_text(strip=True)
        href  = a["href"]
        if not href or href.startswith("#"):
            continue
        lower = label.lower()
        is_oa = "open access" in lower or "오픈액세스" in label
        is_ft = (
            "원문보기" in label
            or "full text" in lower
            or "fulltext" in lower
            or "원문" in label
        )
        if is_ft or is_oa:
            full_url = urljoin("https://lib.gachon.ac.kr", href) if href.startswith("/") else href
            links.append({"label": label, "url": full_url, "is_open_access": is_oa})
    # Deduplicate by URL
    seen, out = set(), []
    for lnk in links:
        if lnk["url"] not in seen:
            seen.add(lnk["url"])
            out.append(lnk)
    return out


def fetch_from_library(title: str) -> Optional[str]:
    """Search Gachon Library and try to retrieve full text for a paper.

    Returns extracted text string or None.
    """
    cfg  = _load_config()
    lib  = cfg.get("library", {})
    user = lib.get("username", "")
    pwd  = lib.get("password", "")

    session = _get_session(user, pwd)

    # Build search URL
    params = {
        "st": "KWRD",
        "si": "TOTAL",
        "oi": "DISP07",
        "os": "ASC",
        "q":  title,
    }
    search_url = f"{LIBRARY_SEARCH}?{urlencode(params)}"
    logger.info("[Library] Searching: %s", title[:60])

    try:
        resp = session.get(search_url, timeout=15)
        if not resp.ok:
            logger.warning("[Library] Search failed: HTTP %d", resp.status_code)
            return None

        soup = BeautifulSoup(resp.text, "lxml")
        links = _parse_fulltext_links(soup)

        if not links:
            logger.info("[Library] No full-text links found for: %s", title[:60])
            return None

        # Prioritise: Open Access first, then authenticated links
        links.sort(key=lambda x: (0 if x["is_open_access"] else 1))

        for lnk in links[:4]:  # try up to 4 links
            logger.info("[Library] Trying %s: %s", lnk["label"], lnk["url"][:80])
            time.sleep(0.5)  # be polite
            text = _fetch_url_text(session, lnk["url"])
            if text:
                logger.info("[Library] Got %d chars via %s", len(text), lnk["label"])
                return text

        logger.info("[Library] All links exhausted for: %s", title[:60])
        return None

    except Exception as e:
        logger.warning("[Library] Error for '%s': %s", title[:60], e)
        return None
