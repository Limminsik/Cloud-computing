"""Agent 1: Identification Agent — PRISMA Identification stage (Steps 1–3).

Step 1: Research Question → Search Terms (LLM, PICO + MeSH + Boolean query)
Step 2: Parallel DB search — Google Scholar · PubMed · Semantic Scholar
Step 3: Deduplicate by title

Public API:
  generate_search_terms(question) → GeneratedSearchTerms   (Phase 1, fast)
  search_agent(state, emit)       → dict                   (Phase 2, slow)
"""

import asyncio
import json
import re
from typing import Any, Callable, Coroutine

try:
    import serpapi as _serpapi_lib
    HAS_SERPAPI = True
except ImportError:
    HAS_SERPAPI = False

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from state import ReviewState, PaperInfo, GeneratedSearchTerms
from config import SERPAPI_API_KEY, SEARCH_MODEL, MAX_RESULTS_PER_SOURCE, SCHOLAR_PAGE_SIZE, SCHOLAR_MAX_PAGES
from prompts import SEARCH_TERMS_PROMPT
from sources.pubmed import search_pubmed
from sources.semantic_scholar import search_semantic_scholar

# ── SerpAPI / Google Scholar helpers ──────────────────────────────────────────

_PAGE_SIZE = SCHOLAR_PAGE_SIZE
_MAX_PAGES = SCHOLAR_MAX_PAGES


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
    client = _serpapi_lib.Client(api_key=SERPAPI_API_KEY)
    resp = client.search({"engine": "google_scholar", "q": query, "hl": "en", "num": _PAGE_SIZE, "start": 0})
    organic = resp.get("organic_results", [])
    total = resp.get("search_information", {}).get("total_results", len(organic))
    return organic, total


def _fetch_scholar_page(query: str, start: int) -> list[dict]:
    client = _serpapi_lib.Client(api_key=SERPAPI_API_KEY)
    resp = client.search({"engine": "google_scholar", "q": query, "hl": "en", "num": _PAGE_SIZE, "start": start})
    return resp.get("organic_results", [])


async def _fetch_scholar_all(query: str) -> tuple[list[dict], int]:
    """Fetch Google Scholar results (up to _MAX_PAGES pages) in parallel."""
    first_page, total = await asyncio.get_running_loop().run_in_executor(
        None, lambda: _fetch_scholar_first_page(query)
    )
    pages_needed = min(total // _PAGE_SIZE, _MAX_PAGES - 1)
    if pages_needed <= 0:
        return first_page, total

    tasks = [
        asyncio.get_running_loop().run_in_executor(None, lambda s=i * _PAGE_SIZE: _fetch_scholar_page(query, s))
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


# ── Step 1: Research Question → Search Terms ──────────────────────────────────

async def generate_search_terms(research_question: str, keywords: list[str] | None = None) -> GeneratedSearchTerms:
    """LLM이 Research Question + Keywords를 PICO + MeSH + Boolean query로 변환."""
    llm = ChatGoogleGenerativeAI(model=SEARCH_MODEL, temperature=0)
    keywords_str = ", ".join(keywords) if keywords else "없음"
    prompt = SEARCH_TERMS_PROMPT.format(research_question=research_question, keywords=keywords_str)

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    text = response.content.strip()

    # 마크다운 코드 펜스 제거 (```json ... ``` or ``` ... ```)
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    text = text.strip()

    # 첫 번째 { 부터 마지막 } 까지만 추출
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"JSON 블록을 찾을 수 없습니다: {text[:300]}")

    json_str = text[start:end]
    return json.loads(json_str)


# ── Main agent ─────────────────────────────────────────────────────────────────

async def search_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """
    PRISMA Identification (Steps 1–3):
      1. Research Question → Search Terms (LLM)
      2. Parallel DB search: Google Scholar · PubMed · Semantic Scholar
      3. Deduplicate by title
    """
    await emit({"type": "agent_start", "agent": "IdentificationAgent", "message": "Identification Agent 시작..."})

    research_question = state.get("research_question", "")
    keywords: list[str] = state.get("keywords") or []

    # ── Step 1: Search Terms 생성 ────────────────────────────────────────────
    # 우선순위: ① SearchForm에서 확정된 Boolean query (preset) → LLM 재생성 건너뜀
    #          ② 없으면 LLM으로 생성
    preset: GeneratedSearchTerms | None = state.get("generated_search_terms")
    generated: GeneratedSearchTerms | None = None

    if preset and preset.get("boolean_query"):
        generated = preset
        combined_query = preset["boolean_query"]
        await emit({"type": "agent_progress", "agent": "IdentificationAgent",
                    "message": f"확정된 Boolean query로 검색: {combined_query}"})
    else:
        kw_msg = f" + 키워드 {len(keywords)}개" if keywords else ""
        await emit({"type": "agent_progress", "agent": "IdentificationAgent",
                    "message": f"Research Question 분석 중 (PICO · MeSH · Boolean query 생성{kw_msg})..."})
        try:
            generated = await generate_search_terms(research_question, keywords)
            await emit({
                "type": "search_terms_generated",
                "agent": "IdentificationAgent",
                "domain":          generated.get("domain", ""),
                "reasoning":       generated.get("reasoning", ""),
                "concept_groups":  generated.get("concept_groups", []),
                "pico":            generated.get("pico", {}),
                "mesh_terms":      generated.get("mesh_terms", []),
                "boolean_query":   generated.get("boolean_query", ""),
                "message": f"Search Terms 생성 완료 — {generated.get('domain', '')} | {generated.get('boolean_query', '')}",
            })
            combined_query = generated.get("boolean_query") or research_question
        except Exception as e:
            await emit({"type": "agent_progress", "agent": "IdentificationAgent",
                        "message": f"Search Terms 생성 실패, Research Question으로 직접 검색: {e}"})
            combined_query = research_question

    if not combined_query:
        await emit({"type": "error", "agent": "IdentificationAgent", "message": "검색어가 없습니다."})
        return {"identified_papers": [], "prisma_stats": state.get("prisma_stats", {}), "logs": []}

    # [MeSH] 태그는 PubMed 전용 문법 — Scholar/S2/PubMed 모두 plain query 사용
    # (LLM이 생성한 boolean_query의 [MeSH] 태그는 UI 표시용으로만 활용)
    plain_query = re.sub(r'\[MeSH\]', '', combined_query).strip()

    await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": f"DB 병렬 검색 시작 — {plain_query}"})

    # ── Step 2: Run all three sources in parallel ──────────────────────────────
    scholar_task = asyncio.create_task(_run_scholar(plain_query, emit))
    pubmed_task  = asyncio.create_task(_run_pubmed(plain_query, emit))
    s2_task      = asyncio.create_task(_run_semantic_scholar(plain_query, emit))

    scholar_result, pubmed_result, s2_result = await asyncio.gather(
        scholar_task, pubmed_task, s2_task, return_exceptions=True
    )

    # ── Step 3: Merge & deduplicate ────────────────────────────────────────────
    seen_titles: set[str] = set()
    papers: list[PaperInfo] = []
    source_counts = {}
    total_identified = 0
    raw_fetched = 0  # 실제 수집된 총 건수 (중복 제거 전)

    for source_name, result in [
        ("Google Scholar", scholar_result),
        ("PubMed",         pubmed_result),
        ("Semantic Scholar", s2_result),
    ]:
        if isinstance(result, Exception):
            await emit({"type": "error", "agent": "IdentificationAgent", "message": f"{source_name} 오류: {result}"})
            source_counts[source_name] = 0
            continue

        items, total = result
        total_identified += total
        raw_fetched += len(items)
        added = 0
        for item in items:
            title_key = item.get("title", "").strip().lower()
            if title_key and title_key not in seen_titles:
                seen_titles.add(title_key)
                papers.append(item)
                added += 1
        source_counts[source_name] = added

    fetched = len(papers)
    # 실제 중복: 수집된 원본 건수 - 제목이 다른 고유 건수
    duplicates_removed = raw_fetched - fetched

    await emit({
        "type": "agent_progress",
        "agent": "IdentificationAgent",
        "message": (
            f"중복 제거 완료 — "
            f"Google Scholar: {source_counts.get('Google Scholar', 0)}건 · "
            f"PubMed: {source_counts.get('PubMed', 0)}건 · "
            f"Semantic Scholar: {source_counts.get('Semantic Scholar', 0)}건 "
            f"→ 중복 {duplicates_removed}건 제거 → 최종 {fetched}건"
        ),
    })

    stats = {**state.get("prisma_stats", {"identified": 0, "screened": 0, "eligible": 0, "included": 0})}
    stats["identified"] = total_identified
    stats["fetched"] = fetched
    stats["duplicates"] = duplicates_removed

    await emit({
        "type": "agent_complete",
        "agent": "IdentificationAgent",
        "message": f"식별 완료 (Steps 1–3) — 3개 DB 총 약 {total_identified:,}건 / 중복 제거 후 {fetched}건",
    })
    await emit({"type": "prisma_update", "counts": stats})

    result_dict = {
        "identified_papers":      papers,
        "prisma_stats":           stats,
        "generated_search_terms": generated,
        "query":                  research_question,
        "logs": [
            f"[IdentificationAgent] Research Question: {research_question}",
            f"[IdentificationAgent] Boolean query: {generated.get('boolean_query', combined_query) if generated else combined_query}",
            f"[IdentificationAgent] 총 {total_identified:,}건 식별, 중복 {duplicates_removed}건 제거, {fetched}건 수집",
            f"  Google Scholar: {source_counts.get('Google Scholar', 0)}건",
            f"  PubMed: {source_counts.get('PubMed', 0)}건",
            f"  Semantic Scholar: {source_counts.get('Semantic Scholar', 0)}건",
        ],
    }
    return result_dict


# ── Source runners ─────────────────────────────────────────────────────────────

async def _run_scholar(query: str, emit) -> tuple[list[PaperInfo], int]:
    if not HAS_SERPAPI:
        await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": "Google Scholar 건너뜀 (serpapi 미설치)"})
        return [], 0
    await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": "Google Scholar 검색 중..."})
    try:
        items, total = await _fetch_scholar_all(query)
        papers = [_serpapi_item_to_paper(i) for i in items]
        await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": f"Google Scholar: 총 약 {total:,}건 / {len(papers)}건 수집"})
        return papers, total
    except Exception as e:
        await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": f"Google Scholar 오류 (SerpAPI 할당량 확인): {e}"})
        raise


async def _run_pubmed(query: str, emit) -> tuple[list[PaperInfo], int]:
    await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": "PubMed 검색 중..."})
    papers_raw, total = await asyncio.get_running_loop().run_in_executor(
        None, lambda: search_pubmed(query, max_results=MAX_RESULTS_PER_SOURCE)
    )
    papers = [_source_to_paper(p) for p in papers_raw]
    await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": f"PubMed: 총 {total:,}건 / {len(papers)}건 수집 (실제 초록 포함)"})
    return papers, total


async def _run_semantic_scholar(query: str, emit) -> tuple[list[PaperInfo], int]:
    await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": "Semantic Scholar 검색 중..."})
    papers_raw, total = await asyncio.get_running_loop().run_in_executor(
        None, lambda: search_semantic_scholar(query, max_results=MAX_RESULTS_PER_SOURCE)
    )
    papers = [_source_to_paper(p) for p in papers_raw]
    await emit({"type": "agent_progress", "agent": "IdentificationAgent", "message": f"Semantic Scholar: 총 {total:,}건 / {len(papers)}건 수집 (OA PDF 포함)"})
    return papers, total
