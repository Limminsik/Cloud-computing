"""Gachon University Central Library full-text fetcher using Playwright.

Confirmed form structure (from browser inspection):
  - Login URL  : https://lib.gachon.ac.kr/login  (POST)
  - Login type : radio — "가천대 포털ID" | "도서관ID(학번/사번)"  ← we use 도서관ID
  - Username   : input#id  (name="id", placeholder="학번, 사번")
  - Password   : input[type="password"] inside div.logForm.pwForm
  - Hidden enc : input#encId, input#encPw  (JS encrypts before submit — handled automatically)
  - Submit btn : 로그인 button (text match)

Search URL: https://lib.gachon.ac.kr/searchTotal/result?st=KWRD&si=TOTAL&oi=DISP07&os=ASC&q=...
Full-text links: <a> tags containing "원문보기" / "Full Text" in search results
"""

import asyncio
import concurrent.futures
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
LIBRARY_LOGIN  = "https://lib.gachon.ac.kr/login"
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
    """Use Playwright to log into Gachon Library and retrieve full text."""
    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout
    except ImportError:
        logger.warning("[Library] playwright not installed")
        return None

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                       " (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await ctx.new_page()

        try:
            # ── Step 1: Login with 도서관ID ─────────────────────────────────
            if username and password:
                logger.info("[Library] Navigating to login page")
                await page.goto(LIBRARY_LOGIN, timeout=20000)
                await page.wait_for_load_state("domcontentloaded", timeout=10000)

                # Select "도서관ID(학번/사번)" radio button
                # Radio buttons are in div.logTopW — click the one with text "도서관ID"
                try:
                    # Try clicking the radio label first
                    await page.click("text=도서관ID", timeout=5000)
                    logger.info("[Library] Clicked 도서관ID radio")
                except PWTimeout:
                    # If already selected or text not found, try direct radio click
                    try:
                        await page.click("input[type='radio']:nth-child(2)", timeout=3000)
                    except Exception:
                        pass

                # Wait for the ID input to be visible
                await page.wait_for_selector("input#id", timeout=8000)

                # Fill username (학번)
                await page.fill("input#id", username)
                logger.info("[Library] Filled username")

                # Fill password
                await page.fill("input[type='password']", password)
                logger.info("[Library] Filled password")

                # Click 로그인 button — JS will encrypt credentials into encId/encPw
                await page.click("button:has-text('로그인'), input[type='submit']")
                await page.wait_for_load_state("networkidle", timeout=15000)

                current_url = page.url
                logger.info("[Library] After login, URL: %s", current_url)

                # Verify login success (should redirect away from /login)
                if "/login" in current_url:
                    logger.warning("[Library] Login may have failed — still on login page")
                else:
                    logger.info("[Library] Login successful")

            # ── Step 2: Search by paper title ───────────────────────────────
            from urllib.parse import urlencode
            params = urlencode({"st": "KWRD", "si": "TOTAL", "oi": "DISP07", "os": "ASC", "q": title})
            search_url = f"{LIBRARY_SEARCH}?{params}"
            logger.info("[Library] Searching: %s", title[:60])
            await page.goto(search_url, timeout=20000)
            await page.wait_for_load_state("networkidle", timeout=15000)

            # ── Step 3: Find Full Text links ─────────────────────────────────
            try:
                await page.wait_for_selector(
                    "a:has-text('원문'), a:has-text('Full Text'), a:has-text('원문보기')",
                    timeout=10000,
                )
            except PWTimeout:
                logger.info("[Library] No full-text links found for: %s", title[:60])
                return None

            links = await page.evaluate("""() => {
                const seen = new Set();
                const results = [];
                document.querySelectorAll('a').forEach(a => {
                    const txt  = a.textContent.trim();
                    const href = a.href;
                    if (!href || href.startsWith('#') || seen.has(href)) return;
                    const isOA = txt.includes('Open Access') || txt.includes('오픈액세스');
                    const isFT = txt.includes('원문') || txt.toLowerCase().includes('full text');
                    if (isFT || isOA) {
                        seen.add(href);
                        results.push({ label: txt, url: href, isOA });
                    }
                });
                return results;
            }""")

            if not links:
                logger.info("[Library] No deduplicated links for: %s", title[:60])
                return None

            # Open Access first
            links.sort(key=lambda x: (0 if x.get("isOA") else 1))
            logger.info("[Library] Found %d full-text links for '%s'", len(links), title[:50])

            # ── Step 4: Follow each link ──────────────────────────────────────
            for lnk in links[:5]:
                logger.info("[Library] Trying '%s': %s", lnk["label"], lnk["url"][:80])
                try:
                    resp = await page.goto(lnk["url"], timeout=25000)
                    await page.wait_for_load_state("networkidle", timeout=12000)

                    ct = (resp.headers.get("content-type", "") if resp else "") or ""
                    if "pdf" in ct or lnk["url"].lower().endswith(".pdf"):
                        raw = await resp.body()
                        text = _extract_text_from_pdf_bytes(raw)
                        if text:
                            logger.info("[Library] PDF extracted %d chars via '%s'", len(text), lnk["label"])
                            return text[:12000]

                    # Extract main text from HTML page
                    text = await page.evaluate("""() => {
                        ['script','style','nav','header','footer','aside'].forEach(t =>
                            document.querySelectorAll(t).forEach(el => el.remove())
                        );
                        const sel = [
                            'article', 'main', '.article-body', '.article-content',
                            '#abstract', '.abstract', '#articleBody', '.content'
                        ];
                        for (const s of sel) {
                            const el = document.querySelector(s);
                            if (el && el.innerText.trim().length > 300)
                                return el.innerText.replace(/\\s+/g, ' ').trim();
                        }
                        return (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
                    }""")

                    if text and len(text) > 300:
                        logger.info("[Library] HTML extracted %d chars via '%s'", len(text), lnk["label"])
                        return text[:12000]

                except Exception as e:
                    logger.debug("[Library] Link failed (%s): %s", lnk["url"][:60], e)
                    continue

            logger.info("[Library] All links exhausted for: %s", title[:60])
            return None

        except Exception as e:
            logger.warning("[Library] Playwright error: %s", e)
            return None
        finally:
            await browser.close()


def _run_in_new_loop(title: str, username: str, password: str) -> Optional[str]:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_playwright_fetch(title, username, password))
    finally:
        loop.close()


def fetch_from_library(title: str) -> Optional[str]:
    """Synchronous wrapper — search Gachon Library and return full text or None."""
    cfg  = _load_config()
    lib  = cfg.get("library", {})
    user = lib.get("username", "")
    pwd  = lib.get("password", "")

    if not user or not pwd:
        logger.debug("[Library] No credentials configured — skipping library fetch")
        return None

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_run_in_new_loop, title, user, pwd)
            return future.result(timeout=90)
    except concurrent.futures.TimeoutError:
        logger.warning("[Library] fetch timed out for: %s", title[:60])
        return None
    except Exception as e:
        logger.warning("[Library] fetch_from_library error: %s", e)
        return None
