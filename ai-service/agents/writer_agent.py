"""Agent 5: Writer Agent (Claude) — Synthesize included papers into a review paper."""

import json
import asyncio
from typing import Any, Callable, Coroutine
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from state import ReviewState
from config import ANTHROPIC_API_KEY, REVIEW_MODEL
from prompts import WRITER_PROMPT


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

    llm = ChatAnthropic(
        model=REVIEW_MODEL,
        anthropic_api_key=ANTHROPIC_API_KEY,
        temperature=0.3,
        max_tokens=8192,
    )

    papers_summary = []
    for p in papers:
        entry = {
            "title": p["title"],
            "authors": p.get("authors", []),
            "year": p.get("year"),
            "venue": p.get("venue", ""),
            "abstract": p.get("abstract", ""),
        }
        if p.get("extracted_data"):
            entry.update(p["extracted_data"])
        papers_summary.append(entry)

    papers_json = json.dumps(papers_summary, ensure_ascii=False, indent=2)

    prompt = WRITER_PROMPT.format(
        query=state["query"],
        identified=stats.get("identified", 0),
        screened=stats.get("screened", 0),
        eligible=stats.get("eligible", 0),
        included=stats.get("included", len(papers)),
        papers_data=papers_json,
    )

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
