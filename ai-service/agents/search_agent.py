"""Agent 1: Search Agent (Gemini) — PRISMA Identification stage."""

import json
import asyncio
from typing import Any, Callable, Coroutine
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from state import ReviewState, PaperInfo
from config import GOOGLE_API_KEY, SEARCH_MODEL, MAX_PAPERS
from prompts import SEARCH_AGENT_PROMPT


async def search_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """Identify papers using Gemini + Google Search grounding."""

    await emit({"type": "agent_start", "agent": "SearchAgent", "message": "Google 검색으로 논문 탐색 시작..."})

    llm = ChatGoogleGenerativeAI(
        model=SEARCH_MODEL,
        google_api_key=GOOGLE_API_KEY,
        temperature=0.1,
    )

    search_terms_str = ", ".join(state["search_terms"])
    prompt = SEARCH_AGENT_PROMPT.format(
        query=state["query"],
        search_terms=search_terms_str,
        max_papers=MAX_PAPERS,
    )

    await emit({"type": "agent_progress", "agent": "SearchAgent", "message": f"검색어: {search_terms_str}"})

    try:
        response = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: llm.invoke([HumanMessage(content=prompt)])
        )
        raw = response.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        papers_data = json.loads(raw)
    except Exception as e:
        await emit({"type": "error", "agent": "SearchAgent", "message": f"검색 중 오류: {str(e)}"})
        # Return empty to allow graceful degradation
        papers_data = []

    papers: list[PaperInfo] = []
    for p in papers_data:
        papers.append({
            "title": p.get("title", "Unknown Title"),
            "authors": p.get("authors", []),
            "year": p.get("year"),
            "url": p.get("url"),
            "abstract": p.get("abstract", ""),
            "venue": p.get("venue", ""),
            "prisma_stage": "identified",
            "decision": None,
            "reason": None,
            "extracted_data": None,
        })

    count = len(papers)
    stats = {**state.get("prisma_stats", {"identified": 0, "screened": 0, "eligible": 0, "included": 0})}
    stats["identified"] = count

    await emit({
        "type": "agent_complete",
        "agent": "SearchAgent",
        "message": f"식별 완료: {count}건 논문 발견",
    })
    await emit({
        "type": "prisma_update",
        "counts": stats,
    })

    return {
        "identified_papers": papers,
        "prisma_stats": stats,
        "logs": [f"[SearchAgent] {count}건 논문 식별 완료"],
    }
