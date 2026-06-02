"""Gachon University Central Library full-text fetcher using Playwright.

Confirmed structure (from browser inspection):
  Login:
    - URL    : POST https://lib.gachon.ac.kr/login
    - id     : input#id  (name="id")
    - pw     : input[type="password"]
    - radio  : click "text=도서관ID" first
    - submit : button:has-text('로그인')

  Search results page:
    - URL     : GET https://lib.gachon.ac.kr/searchTotal/result?st=KWRD&si=TOTAL&q={title}
    - Articles: ul#articlesUl  li  (JS-rendered via searchTotal.js)
    - Title   : li p.listTitle  (or nearby heading)
    - FT link : li p.link a[href*='directLink']  or  a img[alt*='Full Text']

  Full Text link format:
    /eds/directLink/{id}?moduleId=eds&linkType=plink  (relative URL on library domain)
    → redirects to publisher page with institutional access
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


def _title_similarity(a: str, b: str) -> float:
    """Simple word overlap ratio for fuzzy title matching."""
    wa = set(re.sub(r"[^a-z0-9가-힣 ]", " ", a.lower()).split())
    wb = set(re.sub(r"[^a-z0-9가-힣 ]", " ", b.lower()).split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / max(len(wa), len(wb))


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
    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout
    except ImportError:
        logger.warning("[Library] playwright not installed")
        return None

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage",
                  "--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                       " (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await ctx.new_page()

        try:
            # ── Step 1: Login ─────────────────────────────────────────────────
            logger.info("[Library] Logging in as %s", username)
            await page.goto(LIBRARY_LOGIN, timeout=20000)
            await page.wait_for_load_state("domcontentloaded")

            # Select "도서관ID(학번/사번)" radio
            try:
                await page.click("text=도서관ID", timeout=5000)
            except PWTimeout:
                pass  # may already be selected

            await page.wait_for_selector("input#id", timeout=8000)
            await page.fill("input#id", username)
            await page.fill("input[type='password']", password)
            await page.click("button:has-text('로그인')")
            await page.wait_for_load_state("networkidle", timeout=15000)

            if "/login" in page.url:
                logger.warning("[Library] Login may have failed (still on /login)")
            else:
                logger.info("[Library] Login successful, URL: %s", page.url)

            # ── Step 2: Search ────────────────────────────────────────────────
            from urllib.parse import urlencode
            params = urlencode({"st": "KWRD", "si": "TOTAL", "oi": "DISP07", "os": "ASC", "q": title})
            search_url = f"{LIBRARY_SEARCH}?{params}"
            logger.info("[Library] Searching: %s", title[:60])
            await page.goto(search_url, timeout=20000)

            # Wait for JS-rendered article list
            try:
                await page.wait_for_selector("ul#articlesUl li", timeout=20000)
            except PWTimeout:
                logger.info("[Library] No articles rendered for: %s", title[:60])
                return None

            # ── Step 3: Find matching article and Full Text link ───────────────
            title_json = json.dumps(title)
            match = await page.evaluate(f"""() => {{
                const target = {title_json}.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
                const targetWords = new Set(target.split(/\\s+/).filter(w => w.length > 2));

                const items = document.querySelectorAll('ul#articlesUl > li');
                let bestScore = 0;
                let bestResult = null;

                for (const li of items) {{
                    // Find title text in this result
                    const titleEl = li.querySelector('p.listTitle, .listTitle, h3, h4, .title, p.title');
                    const rawTitle = titleEl ? titleEl.innerText : li.innerText.split('\\n')[0];
                    const norm = rawTitle.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
                    const words = new Set(norm.split(/\\s+/).filter(w => w.length > 2));

                    // Word overlap score
                    let overlap = 0;
                    for (const w of targetWords) if (words.has(w)) overlap++;
                    const score = overlap / Math.max(targetWords.size, words.size, 1);

                    if (score > bestScore) {{
                        bestScore = score;
                        // Find Full Text link
                        const ftLink = li.querySelector(
                            'a[href*="directLink"], a[href*="fulltext"], ' +
                            'p.link a, .link a'
                        );
                        // Try by img alt
                        const ftImg = li.querySelector('img[alt*="Full Text"], img[alt*="원문"]');
                        const ftByImg = ftImg ? ftImg.closest('a') : null;
                        const el = ftLink || ftByImg;
                        bestResult = {{
                            score: score,
                            foundTitle: rawTitle.trim(),
                            url: el ? el.href : null,
                            allLinks: Array.from(li.querySelectorAll('a')).map(a => ({{
                                href: a.href, text: a.innerText.trim().slice(0, 50)
                            }}))
                        }};
                    }}
                }}
                return bestScore >= 0.4 ? bestResult : null;
            }}""")

            if not match:
                logger.info("[Library] No matching article found (score < 0.4) for: %s", title[:60])
                return None

            logger.info("[Library] Matched '%s' (score=%.2f), FT URL: %s",
                        match.get("foundTitle", "")[:60], match.get("score", 0),
                        (match.get("url") or "")[:80])

            ft_url = match.get("url")
            if not ft_url:
                logger.info("[Library] No Full Text link in matched article for: %s", title[:60])
                # Log all links found in this article for debugging
                for lnk in (match.get("allLinks") or [])[:6]:
                    logger.debug("[Library]   link: %s  %s", lnk.get("href","")[:60], lnk.get("text",""))
                return None

            # ── Step 4: Follow Full Text link ─────────────────────────────────
            logger.info("[Library] Navigating to Full Text: %s", ft_url[:80])
            resp = await page.goto(ft_url, timeout=25000)
            await page.wait_for_load_state("networkidle", timeout=15000)
            logger.info("[Library] Final URL after redirect: %s", page.url)

            ct = (resp.headers.get("content-type", "") if resp else "") or ""
            if "pdf" in ct or page.url.lower().endswith(".pdf"):
                raw = await resp.body()
                text = _extract_text_from_pdf_bytes(raw)
                if text:
                    logger.info("[Library] PDF extracted %d chars", len(text))
                    return text[:12000]

            # Extract main text from publisher page
            text = await page.evaluate("""() => {
                ['script','style','nav','header','footer','aside',
                 '.cookie-banner','.ad','.sidebar'].forEach(sel =>
                    document.querySelectorAll(sel).forEach(el => el.remove())
                );
                const candidates = [
                    'article', 'main', '.article-body', '.article-content',
                    '#article', '#articleBody', '.fulltext', '.body',
                    '#abstract', '.abstract', '.paper-body',
                ];
                for (const sel of candidates) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText.trim().length > 400)
                        return el.innerText.replace(/\\s+/g, ' ').trim();
                }
                const body = document.body?.innerText || '';
                return body.replace(/\\s+/g, ' ').trim();
            }""")

            if text and len(text) > 300:
                logger.info("[Library] HTML extracted %d chars from publisher page", len(text))
                return text[:12000]

            logger.info("[Library] Could not extract text from publisher page: %s", page.url)
            return None

        except Exception as e:
            logger.warning("[Library] Error: %s", e)
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
    cfg  = _load_config()
    lib  = cfg.get("library", {})
    user = lib.get("username", "")
    pwd  = lib.get("password", "")

    if not user or not pwd:
        logger.debug("[Library] No credentials — skipping")
        return None

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(_run_in_new_loop, title, user, pwd).result(timeout=90)
    except concurrent.futures.TimeoutError:
        logger.warning("[Library] Timed out for: %s", title[:60])
        return None
    except Exception as e:
        logger.warning("[Library] Error: %s", e)
        return None
