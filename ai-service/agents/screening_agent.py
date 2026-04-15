"""Agent 2: Screening Agent (Claude) — PRISMA Screening stage (title/abstract)."""

import json
import asyncio
from typing import Any, Callable, Coroutine
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from state import ReviewState, PaperInfo
from config import ANTHROPIC_API_KEY, REVIEW_MODEL
from prompts import SCREENING_PROMPT


async def screening_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """Screen papers by title/abstract against inclusion/exclusion criteria."""

    papers = state["identified_papers"]
    await emit({
        "type": "agent_start",
        "agent": "ScreeningAgent",
        "message": f"{len(papers)}건 논문 1차 선별(제목/초록) 시작...",
    })

    if not papers:
        await emit({"type": "agent_complete", "agent": "ScreeningAgent", "message": "선별할 논문 없음"})
        return {"screened_papers": [], "logs": ["[ScreeningAgent] 선별할 논문 없음"]}

    llm = ChatAnthropic(
        model=REVIEW_MODEL,
        anthropic_api_key=ANTHROPIC_API_KEY,
        temperature=0,
        max_tokens=4096,
    )

    inclusion_str = "\n".join(f"- {c}" for c in state["inclusion_criteria"])
    exclusion_str = "\n".join(f"- {c}" for c in state["exclusion_criteria"])

    # Batch into chunks of 20 to stay within token limits
    BATCH = 20
    all_decisions: dict[str, dict] = {}

    for i in range(0, len(papers), BATCH):
        batch = papers[i: i + BATCH]
        papers_json = json.dumps(
            [{"title": p["title"], "abstract": p.get("abstract", ""), "year": p.get("year")} for p in batch],
            ensure_ascii=False,
            indent=2,
        )
        prompt = SCREENING_PROMPT.format(
            query=state["query"],
            inclusion_criteria=inclusion_str,
            exclusion_criteria=exclusion_str,
            papers=papers_json,
        )

        await emit({
            "type": "agent_progress",
            "agent": "ScreeningAgent",
            "message": f"선별 진행 중 ({i + 1}–{min(i + BATCH, len(papers))}/{len(papers)}건)...",
        })

        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda p=prompt: llm.invoke([HumanMessage(content=p)])
            )
            raw = response.content.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            raw = raw.strip()
            decisions = json.loads(raw)
            for d in decisions:
                all_decisions[d["title"]] = d
        except Exception as e:
            await emit({"type": "error", "agent": "ScreeningAgent", "message": f"선별 오류: {str(e)}"})

    screened: list[PaperInfo] = []
    for p in papers:
        decision_info = all_decisions.get(p["title"], {"decision": "EXCLUDE", "reason": "선별 결과 없음"})
        decision = decision_info.get("decision", "EXCLUDE")
        reason = decision_info.get("reason", "")

        updated = {**p, "decision": decision, "reason": reason, "prisma_stage": "screened"}

        await emit({
            "type": "paper_decision",
            "title": p["title"],
            "decision": decision,
            "reason": reason,
            "stage": "screening",
        })

        if decision == "INCLUDE":
            screened.append(updated)

    stats = {**state["prisma_stats"], "screened": len(screened)}
    included_count = len(screened)
    excluded_count = len(papers) - included_count

    await emit({
        "type": "agent_complete",
        "agent": "ScreeningAgent",
        "message": f"1차 선별 완료: {len(papers)}→{included_count}건 통과 ({excluded_count}건 제외)",
    })
    await emit({"type": "prisma_update", "counts": stats})

    return {
        "screened_papers": screened,
        "prisma_stats": stats,
        "logs": [f"[ScreeningAgent] {len(papers)}건 중 {included_count}건 통과"],
    }
