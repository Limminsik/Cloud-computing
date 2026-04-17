"""Agent 1: Search Agent — PRISMA Identification stage.

Three parallel sources:
  1. Google Scholar (SerpAPI)  — broad coverage, snippet-level abstracts
  2. PubMed (NCBI E-utilities) — biomedical focus, real full abstracts, FREE
  3. Semantic Scholar           — CS/multi-domain, real abstracts + OA PDFs, FREE

Results are deduplicated by title and merged.
"""

import asyncio
import re
from typing import Any, Callable, Coroutine

from state import ReviewState, PaperInfo
from config import SERPAPI_API_KEY
from sources.pubmed import search_pubmed
from sources.semantic_scholar import search_semantic_scholar

# ── SerpAPI / Google Scholar helpers ──────────────────────────────────────────

_PAGE_SIZE = 10
_MAX_PAGES = 5  # 임시: 무료 플랜 절약


def _parse_authors_serpapi(pub_info: dict) -> list[str]:
    authors_raw = pub_info.get("authors", [])
    if isinstance(authors_raw, list):
        return [a.get("name", "") for a in authors_raw if a.get("name")]
    if isinstance(authors_raw, str):
        return [a.strip() for a in authors_raw.split(",")]
    return []


def _extract_year(summary: str) -> int | None:
    match = re.search(r'\b(19|20)\d{2}\b', summary or "")
    return int(match.group()) if match else None


def _fetch_scholar_first_page(query: str) -> tuple[list[dict], int]:
    import serpapi as _serpapi
    client = _serpapi.Client(api_key=SERPAPI_API_KEY)
    resp = client.search({"engine": "google_scholar", "q": query, "hl": "en", "num": _PAGE_SIZE, "start": 0})
    organic = resp.get("organic_results", [])
    total = resp.get("search_information", {}).get("total_results", len(organic))
    return organic, total


def _fetch_scholar_page(query: str, start: int) -> list[dict]:
    import serpapi as _serpapi
    client = _serpapi.Client(api_key=SERPAPI_API_KEY)
    resp = client.search({"engine": "google_scholar", "q": query, "hl": "en", "num": _PAGE_SIZE, "start": start})
    return resp.get("organic_results", [])


async def _fetch_scholar_all(query: str) -> tuple[list[dict], int]:
    """Fetch Google Scholar results (up to _MAX_PAGES pages) in parallel."""
    first_page, total = await asyncio.get_event_loop().run_in_executor(
        None, lambda: _fetch_scholar_first_page(query)
    )
    pages_needed = min(total // _PAGE_SIZE, _MAX_PAGES - 1)
    if pages_needed <= 0:
        return first_page, total

    tasks = [
        asyncio.get_event_loop().run_in_executor(None, lambda s=i * _PAGE_SIZE: _fetch_scholar_page(query, s))
        for i in range(1, pages_needed + 1)
    ]
    rest = await asyncio.gather(*tasks, return_exceptions=True)
    all_items = list(first_page)
    for page in rest:
        if isinstance(page, list):
            all_items.extend(page)
    return all_items, total


def _serpapi_item_to_paper(item: dict) -> PaperInfo:
    pub_info = item.get("publication_info", {})
    if not isinstance(pub_info, dict):
        pub_info = {}
    summary = pub_info.get("summary", "")
    return {
        "title": item.get("title", "Unknown Title"),
        "authors": _parse_authors_serpapi(pub_info),
        "year": _extract_year(summary),
        "url": item.get("link") or item.get("result_id"),
        "abstract": item.get("snippet", ""),
        "venue": summary,
        "prisma_stage": "identified",
        "decision": None,
        "reason": None,
        "extracted_data": None,
    }


def _source_to_paper(item: dict) -> PaperInfo:
    """Convert PubMed / Semantic Scholar result dict to PaperInfo."""
    return {
        "title": item.get("title", "Unknown Title"),
        "authors": item.get("authors", []),
        "year": item.get("year"),
        "url": item.get("url"),
        "abstract": item.get("abstract", ""),
        "venue": item.get("venue", ""),
        "prisma_stage": "identified",
        "decision": None,
        "reason": None,
        "extracted_data": None,
    }


# ── Main agent ─────────────────────────────────────────────────────────────────

async def search_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """
    Identify papers from three sources in parallel:
    Google Scholar (SerpAPI) + PubMed + Semantic Scholar.
    """
    await emit({"type": "agent_start", "agent": "SearchAgent", "message": "Google Scholar · PubMed · Semantic Scholar 병렬 검색 시작..."})

    query = state.get("query", "")
    search_terms = state.get("search_terms") or []

    # Build combined query
    if search_terms:
        terms_str = " ".join(t.strip() for t in search_terms if t.strip())
        if query and query.strip().lower() not in terms_str.lower():
            combined_query = f"{query} {terms_str}".strip()
        else:
            combined_query = terms_str or query
    else:
        combined_query = query

    if not combined_query:
        await emit({"type": "error", "agent": "SearchAgent", "message": "검색어가 없습니다."})
        return {"identified_papers": [], "prisma_stats": state.get("prisma_stats", {}), "logs": []}

    await emit({"type": "agent_progress", "agent": "SearchAgent", "message": f"검색어: {combined_query}"})

    # ── Run all three sources in parallel ──────────────────────────────────────
    scholar_task = asyncio.create_task(_run_scholar(combined_query, emit))
    pubmed_task  = asyncio.create_task(_run_pubmed(combined_query, emit))
    s2_task      = asyncio.create_task(_run_semantic_scholar(combined_query, emit))

    scholar_result, pubmed_result, s2_result = await asyncio.gather(
        scholar_task, pubmed_task, s2_task, return_exceptions=True
    )

    # ── Merge & deduplicate ────────────────────────────────────────────────────
    seen_titles: set[str] = set()
    papers: list[PaperInfo] = []
    source_counts = {}
    total_identified = 0

    for source_name, result in [
        ("Google Scholar", scholar_result),
        ("PubMed",         pubmed_result),
        ("Semantic Scholar", s2_result),
    ]:
        if isinstance(result, Exception):
            await emit({"type": "error", "agent": "SearchAgent", "message": f"{source_name} 오류: {result}"})
            source_counts[source_name] = 0
            continue

        items, total = result
        total_identified += total
        added = 0
        for item in items:
            title_key = item.get("title", "").strip().lower()
            if title_key and title_key not in seen_titles:
                seen_titles.add(title_key)
                papers.append(item)
                added += 1
        source_counts[source_name] = added

    fetched = len(papers)

    await emit({
        "type": "agent_progress",
        "agent": "SearchAgent",
        "message": (
            f"수집 완료 — "
            f"Google Scholar: {source_counts.get('Google Scholar', 0)}건 · "
            f"PubMed: {source_counts.get('PubMed', 0)}건 · "
            f"Semantic Scholar: {source_counts.get('Semantic Scholar', 0)}건 "
            f"(중복 제거 후 총 {fetched}건)"
        ),
    })

    stats = {**state.get("prisma_stats", {"identified": 0, "screened": 0, "eligible": 0, "included": 0})}
    stats["identified"] = total_identified
    stats["fetched"] = fetched

    await emit({
        "type": "agent_complete",
        "agent": "SearchAgent",
        "message": f"식별 완료 — 3개 DB 총 약 {total_identified:,}건 / 수집 {fetched}건",
    })
    await emit({"type": "prisma_update", "counts": stats})

    return {
        "identified_papers": papers,
        "prisma_stats": stats,
        "logs": [
            f"[SearchAgent] 총 {total_identified:,}건 식별, {fetched}건 수집",
            f"  Google Scholar: {source_counts.get('Google Scholar', 0)}건",
            f"  PubMed: {source_counts.get('PubMed', 0)}건",
            f"  Semantic Scholar: {source_counts.get('Semantic Scholar', 0)}건",
        ],
    }


# ── Source runners ─────────────────────────────────────────────────────────────

async def _run_scholar(query: str, emit) -> tuple[list[PaperInfo], int]:
    await emit({"type": "agent_progress", "agent": "SearchAgent", "message": "Google Scholar 검색 중..."})
    try:
        items, total = await _fetch_scholar_all(query)
        papers = [_serpapi_item_to_paper(i) for i in items]
        await emit({"type": "agent_progress", "agent": "SearchAgent", "message": f"Google Scholar: 총 약 {total:,}건 / {len(papers)}건 수집"})
        return papers, total
    except Exception as e:
        await emit({"type": "agent_progress", "agent": "SearchAgent", "message": f"Google Scholar 오류 (SerpAPI 할당량 확인): {e}"})
        raise


async def _run_pubmed(query: str, emit) -> tuple[list[PaperInfo], int]:
    await emit({"type": "agent_progress", "agent": "SearchAgent", "message": "PubMed 검색 중..."})
    papers_raw, total = await asyncio.get_event_loop().run_in_executor(
        None, lambda: search_pubmed(query, max_results=200)
    )
    papers = [_source_to_paper(p) for p in papers_raw]
    await emit({"type": "agent_progress", "agent": "SearchAgent", "message": f"PubMed: 총 {total:,}건 / {len(papers)}건 수집 (실제 초록 포함)"})
    return papers, total


async def _run_semantic_scholar(query: str, emit) -> tuple[list[PaperInfo], int]:
    await emit({"type": "agent_progress", "agent": "SearchAgent", "message": "Semantic Scholar 검색 중..."})
    papers_raw, total = await asyncio.get_event_loop().run_in_executor(
        None, lambda: search_semantic_scholar(query, max_results=200)
    )
    papers = [_source_to_paper(p) for p in papers_raw]
    await emit({"type": "agent_progress", "agent": "SearchAgent", "message": f"Semantic Scholar: 총 {total:,}건 / {len(papers)}건 수집 (OA PDF 포함)"})
    return papers, total
