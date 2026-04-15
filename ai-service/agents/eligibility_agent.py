"""Agent 3: Eligibility Agent (Claude) — PRISMA Eligibility stage (full-text)."""

import json
import asyncio
from typing import Any, Callable, Coroutine
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from state import ReviewState, PaperInfo
from config import ANTHROPIC_API_KEY, REVIEW_MODEL
from prompts import ELIGIBILITY_PROMPT


async def eligibility_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """Full-text eligibility assessment applying stricter PRISMA criteria."""

    papers = state["screened_papers"]
    await emit({
        "type": "agent_start",
        "agent": "EligibilityAgent",
        "message": f"{len(papers)}건 논문 적격성 평가(풀텍스트) 시작...",
    })

    if not papers:
        await emit({"type": "agent_complete", "agent": "EligibilityAgent", "message": "평가할 논문 없음"})
        return {"eligible_papers": [], "included_papers": [], "logs": ["[EligibilityAgent] 평가할 논문 없음"]}

    llm = ChatAnthropic(
        model=REVIEW_MODEL,
        anthropic_api_key=ANTHROPIC_API_KEY,
        temperature=0,
        max_tokens=4096,
    )

    inclusion_str = "\n".join(f"- {c}" for c in state["inclusion_criteria"])
    exclusion_str = "\n".join(f"- {c}" for c in state["exclusion_criteria"])

    BATCH = 15
    all_decisions: dict[str, dict] = {}

    for i in range(0, len(papers), BATCH):
        batch = papers[i: i + BATCH]
        papers_json = json.dumps(
            [{"title": p["title"], "abstract": p.get("abstract", ""), "venue": p.get("venue", ""), "year": p.get("year")} for p in batch],
            ensure_ascii=False,
            indent=2,
        )
        prompt = ELIGIBILITY_PROMPT.format(
            query=state["query"],
            inclusion_criteria=inclusion_str,
            exclusion_criteria=exclusion_str,
            papers=papers_json,
        )

        await emit({
            "type": "agent_progress",
            "agent": "EligibilityAgent",
            "message": f"적격성 평가 진행 ({i + 1}–{min(i + BATCH, len(papers))}/{len(papers)}건)...",
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
            await emit({"type": "error", "agent": "EligibilityAgent", "message": f"평가 오류: {str(e)}"})

    eligible: list[PaperInfo] = []
    included: list[PaperInfo] = []

    for p in papers:
        decision_info = all_decisions.get(p["title"], {"decision": "EXCLUDE", "reason": "평가 결과 없음"})
        decision = decision_info.get("decision", "EXCLUDE")
        reason = decision_info.get("reason", "")

        updated = {**p, "decision": decision, "reason": reason, "prisma_stage": "eligible"}
        eligible.append(updated)

        await emit({
            "type": "paper_decision",
            "title": p["title"],
            "decision": decision,
            "reason": reason,
            "stage": "eligibility",
        })

        if decision == "INCLUDE":
            included_paper = {**updated, "prisma_stage": "included"}
            included.append(included_paper)

    stats = {**state["prisma_stats"], "eligible": len(eligible), "included": len(included)}
    excluded_count = len(eligible) - len(included)

    await emit({
        "type": "agent_complete",
        "agent": "EligibilityAgent",
        "message": f"적격성 평가 완료: {len(papers)}건 → {len(included)}건 최종 포함 ({excluded_count}건 제외)",
    })
    await emit({"type": "prisma_update", "counts": stats})

    return {
        "eligible_papers": eligible,
        "included_papers": included,
        "prisma_stats": stats,
        "logs": [f"[EligibilityAgent] {len(included)}건 최종 포함"],
    }
