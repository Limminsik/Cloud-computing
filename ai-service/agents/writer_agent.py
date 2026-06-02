"""Agent 5: Writer Agent (Claude) — Synthesize included papers into a review paper."""

import json
import asyncio
from typing import Any, Callable, Coroutine
from langchain_core.messages import HumanMessage

from state import ReviewState
from config import WRITER_MODEL
from prompts import WRITER_PROMPT
from utils.llm_factory import get_llm


async def writer_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """Write a full systematic literature review from included papers."""

    papers = state["included_papers"]
    stats = state["prisma_stats"]

    await emit({
        "type": "agent_start",
        "agent": "WriterAgent",
        "message": f"{len(papers)}건 논문을 기반으로 리뷰 논문 작성 시작...",
    })

    llm = get_llm(WRITER_MODEL, temperature=0.3, max_tokens=8192)

    papers_summary = []
    for p in papers:
        entry = {
            "title":   p["title"],
            "authors": p.get("authors", []),
            "year":    p.get("year"),
            "venue":   p.get("venue", ""),
            "abstract": p.get("abstract", ""),
            "reason":  p.get("reason", ""),
        }
        ed = p.get("extracted_data") or {}
        entry.update({
            "article_type":        ed.get("article_type"),
            "pico":                ed.get("pico"),
            "key_findings":        ed.get("key_findings"),
            "limitations":         ed.get("limitations"),
            "full_text_available": ed.get("full_text_available", False),
        })
        papers_summary.append(entry)

    papers_json = json.dumps(papers_summary, ensure_ascii=False, indent=2)

    inclusion  = state.get("inclusion_criteria") or []
    exclusion  = state.get("exclusion_criteria") or []
    generated  = state.get("generated_search_terms") or {}
    keywords   = generated.get("keywords") or state.get("keywords") or []

    # Use str.replace instead of .format() to avoid KeyError when
    # criteria / keywords contain literal { } characters
    prompt = WRITER_PROMPT
    replacements = {
        "{query}":              state.get("research_question") or state.get("query", ""),
        "{keywords}":           ", ".join(keywords) if keywords else "없음",
        "{inclusion_criteria}": "\n".join(f"  - {c}" for c in inclusion) if inclusion else "  별도 기준 없음",
        "{exclusion_criteria}": "\n".join(f"  - {c}" for c in exclusion) if exclusion else "  별도 기준 없음",
        "{identified}":         str(stats.get("identified", 0)),
        "{screened}":           str(stats.get("screened", 0)),
        "{eligible}":           str(stats.get("eligible", 0)),
        "{included}":           str(stats.get("included", len(papers))),
        "{papers_data}":        papers_json,
    }
    for key, val in replacements.items():
        prompt = prompt.replace(key, val)

    await emit({
        "type": "agent_progress",
        "agent": "WriterAgent",
        "message": "리뷰 논문 생성 중 (시간이 소요될 수 있습니다)...",
    })

    try:
        response = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: llm.invoke([HumanMessage(content=prompt)])
        )
        review_report = response.content.strip()
    except Exception as e:
        await emit({"type": "error", "agent": "WriterAgent", "message": f"작성 오류: {str(e)}"})
        review_report = f"# 오류 발생\n\n리뷰 논문 생성 중 오류가 발생했습니다: {str(e)}"

    await emit({
        "type": "agent_complete",
        "agent": "WriterAgent",
        "message": f"리뷰 논문 작성 완료 ({len(review_report)}자)",
    })

    return {
        "review_report": review_report,
        "status": "done",
        "logs": [f"[WriterAgent] 리뷰 논문 작성 완료 ({len(review_report)}자)"],
    }
