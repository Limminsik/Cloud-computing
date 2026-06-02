"""Gachon University Central Library full-text fetcher using Playwright.

The library (https://lib.gachon.ac.kr) uses EBSCO Discovery Service (EDS),
which is fully JavaScript-rendered. requests/BeautifulSoup cannot parse results.
We use Playwright headless Chromium to:
  1. Log in with library credentials (if provided)
  2. Search by paper title
  3. Find "Full Text (원문보기)" links in the results
  4. Click through to the full-text page and extract content

Credentials are read from configuration.json at the repo root.
"""

import asyncio
import json
import logging
import re
from io import BytesIO
from pathlib import Path
from typing import Optional

logger = logging.getLogger("fetch_library")

# Docker: /app/configuration.json  |  Local: repo_root/configuration.json
CONFIG_PATH = Path(__file__).parent.parent / "configuration.json"
if not CONFIG_PATH.exists():
    CONFIG_PATH = Path(__file__).parent.parent.parent / "configuration.json"

LIBRARY_BASE   = "https://lib.gachon.ac.kr"
LIBRARY_LOGIN  = "https://lib.gachon.ac.kr/Account/LogOn"
LIBRARY_SEARCH = "https://lib.gachon.ac.kr/searchTotal/result"


def _load_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


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


async def _playwright_fetch(title: str, username: str, password: str) -> Optional[str]:
    """Use Playwright to search the library and extract full text."""
    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout
    except ImportError:
        logger.warning("[Library] playwright not installed. Run: playwright install chromium")
        return None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                       " (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await ctx.new_page()

        try:
            # ── Step 1: Login if credentials provided ──────────────────────
            if username and password:
                logger.info("[Library] Logging in as %s", username)
                await page.goto(LIBRARY_LOGIN, timeout=15000)
                await page.fill("input[name='UserId'], input[id='UserId']", username)
                await page.fill("input[name='Password'], input[id='Password'], input[type='password']", password)
                await page.click("button[type='submit'], input[type='submit']")
                await page.wait_for_load_state("networkidle", timeout=10000)
                logger.info("[Library] Login complete, URL: %s", page.url)

            # ── Step 2: Search by paper title ───────────────────────────────
            from urllib.parse import urlencode
            params = urlencode({"st": "KWRD", "si": "TOTAL", "oi": "DISP07", "os": "ASC", "q": title})
            search_url = f"{LIBRARY_SEARCH}?{params}"
            logger.info("[Library] Searching: %s", title[:60])
            await page.goto(search_url, timeout=20000)
            await page.wait_for_load_state("networkidle", timeout=15000)

            # ── Step 3: Find Full Text links ────────────────────────────────
            # Wait for results to load (EBSCO EDS renders dynamically)
            try:
                await page.wait_for_selector("a:has-text('원문'), a:has-text('Full Text'), a:has-text('원문보기')", timeout=8000)
            except PWTimeout:
                logger.info("[Library] No full-text links found for: %s", title[:60])
                return None

            # Collect all full-text links — prefer Open Access
            links = await page.evaluate("""() => {
                const results = [];
                document.querySelectorAll('a').forEach(a => {
                    const txt = a.textContent.trim();
                    const href = a.href;
                    if (!href || href.startsWith('#')) return;
                    const isOA  = txt.includes('Open Access') || txt.includes('오픈액세스');
                    const isFT  = txt.includes('원문') || txt.toLowerCase().includes('full text');
                    if (isFT || isOA) {
                        results.push({ label: txt, url: href, isOA });
                    }
                });
                return results;
            }""")

            if not links:
                logger.info("[Library] No links after JS render for: %s", title[:60])
                return None

            # Sort: Open Access first
            links.sort(key=lambda x: (0 if x.get("isOA") else 1))
            logger.info("[Library] Found %d full-text links", len(links))

            # ── Step 4: Try each link ───────────────────────────────────────
            for lnk in links[:4]:
                logger.info("[Library] Trying %s: %s", lnk["label"], lnk["url"][:80])
                try:
                    resp = await page.goto(lnk["url"], timeout=20000)
                    await page.wait_for_load_state("networkidle", timeout=10000)

                    # Check if it's a PDF redirect
                    if resp and "pdf" in (resp.headers.get("content-type", "") or ""):
                        content = await resp.body()
                        text = _extract_text_from_pdf_bytes(content)
                        if text:
                            logger.info("[Library] Got PDF %d chars via %s", len(text), lnk["label"])
                            return text

                    # Try to extract text from the page
                    text = await page.evaluate("""() => {
                        ['script','style','nav','header','footer'].forEach(t =>
                            document.querySelectorAll(t).forEach(el => el.remove())
                        );
                        const main = document.querySelector('article, main, .article-body, #abstract, .abstract')
                                  || document.body;
                        return (main ? main.innerText : '').replace(/\\s+/g, ' ').trim();
                    }""")

                    if text and len(text) > 300:
                        logger.info("[Library] Got HTML %d chars via %s", len(text), lnk["label"])
                        return text[:12000]

                except Exception as e:
                    logger.debug("[Library] Link failed (%s): %s", lnk["url"][:60], e)
                    continue

        except Exception as e:
            logger.warning("[Library] Playwright error: %s", e)
        finally:
            await browser.close()

    return None


def fetch_from_library(title: str) -> Optional[str]:
    """Synchronous wrapper — search Gachon Library and return full text or None."""
    cfg  = _load_config()
    lib  = cfg.get("library", {})
    user = lib.get("username", "")
    pwd  = lib.get("password", "")

    try:
        # Must run in a fresh thread with its own event loop
        # (caller is already inside run_in_executor, so we can't reuse the running loop)
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_run_in_new_loop, title, user, pwd)
            return future.result(timeout=60)
    except Exception as e:
        logger.warning("[Library] fetch_from_library error: %s", e)
        return None


def _run_in_new_loop(title: str, username: str, password: str) -> Optional[str]:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_playwright_fetch(title, username, password))
    finally:
        loop.close()
