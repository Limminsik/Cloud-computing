"""Agent 2: Screening Agent (Gemini) — PRISMA Screening stage (title/abstract)."""

import json
import asyncio
from typing import Any, Callable, Coroutine
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from state import ReviewState, PaperInfo
from config import GOOGLE_API_KEY, SEARCH_MODEL

# Gemini has a large context window — batch 50 papers at once
BATCH_SIZE = 50

SCREENING_PROMPT = """You are a systematic review expert applying PRISMA 2020 screening guidelines.

## Research Query
{query}

## User-Defined Criteria
{criteria_block}

## Task
Screen each paper below using ONLY its title and abstract (no full-text access).
Apply the criteria above. If no criteria are provided, use the research query relevance alone.

Default rules (always apply):
- INCLUDE: paper is clearly relevant to the research query
- EXCLUDE: paper is unrelated, duplicate concept, or abstract is missing/too short to judge

## Papers to Screen
{papers_json}

## Output Format
Return a JSON array. One object per paper, in the same order:
[
  {{
    "title": "<exact title from input>",
    "decision": "INCLUDE" or "EXCLUDE",
    "reason": "<one sentence citing which criterion>"
  }},
  ...
]

Return ONLY valid JSON. No markdown, no explanation outside the JSON.
"""


async def screening_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """Screen papers by title/abstract using Gemini."""

    papers = state.get("identified_papers", [])
    await emit({
        "type": "agent_start",
        "agent": "ScreeningAgent",
        "message": f"{len(papers)}건 논문 1차 선별(제목/초록) 시작...",
    })

    if not papers:
        await emit({"type": "agent_complete", "agent": "ScreeningAgent", "message": "선별할 논문 없음"})
        return {"screened_papers": [], "prisma_stats": state.get("prisma_stats", {}), "logs": ["[ScreeningAgent] 선별할 논문 없음"]}

    llm = ChatGoogleGenerativeAI(
        model=SEARCH_MODEL,
        google_api_key=GOOGLE_API_KEY,
        temperature=0,
    )

    # Build criteria block from user input
    inclusion = state.get("inclusion_criteria", [])
    exclusion = state.get("exclusion_criteria", [])
    criteria_lines = []
    if inclusion:
        criteria_lines.append("포함 기준 (INCLUDE if):")
        criteria_lines.extend(f"  - {c}" for c in inclusion)
    if exclusion:
        criteria_lines.append("제외 기준 (EXCLUDE if):")
        criteria_lines.extend(f"  - {c}" for c in exclusion)
    criteria_block = "\n".join(criteria_lines) if criteria_lines else "별도 기준 없음 — 연구 질문 관련성으로 판단"

    all_decisions: dict[str, dict] = {}

    # Process in batches
    for batch_start in range(0, len(papers), BATCH_SIZE):
        batch = papers[batch_start: batch_start + BATCH_SIZE]
        batch_end = min(batch_start + BATCH_SIZE, len(papers))

        await emit({
            "type": "agent_progress",
            "agent": "ScreeningAgent",
            "message": f"선별 중... ({batch_start + 1}–{batch_end} / {len(papers)}건)",
        })

        papers_json = json.dumps(
            [
                {
                    "title": p["title"],
                    "abstract": p.get("abstract", "") or "",
                    "venue": p.get("venue", "") or "",
                    "year": p.get("year"),
                }
                for p in batch
            ],
            ensure_ascii=False,
            indent=2,
        )

        prompt = SCREENING_PROMPT.format(
            query=state.get("query", ""),
            criteria_block=criteria_block,
            papers_json=papers_json,
        )

        try:
            response = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda p=prompt: llm.invoke([HumanMessage(content=p)])
            )
            raw = response.content.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            raw = raw.strip()
            decisions = json.loads(raw)
            for d in decisions:
                all_decisions[d["title"]] = d
        except Exception as e:
            await emit({"type": "error", "agent": "ScreeningAgent", "message": f"선별 오류 (배치 {batch_start}): {str(e)}"})

    # Apply decisions back to papers
    screened: list[PaperInfo] = []
    for p in papers:
        info = all_decisions.get(p["title"], {"decision": "EXCLUDE", "reason": "선별 결과 없음"})
        decision = info.get("decision", "EXCLUDE")
        reason = info.get("reason", "")

        await emit({
            "type": "paper_decision",
            "title": p["title"],
            "decision": decision,
            "reason": reason,
            "stage": "screening",
        })

        if decision == "INCLUDE":
            screened.append({**p, "decision": decision, "reason": reason, "prisma_stage": "screened"})

    included = len(screened)
    excluded = len(papers) - included
    stats = {**state.get("prisma_stats", {}), "screened": included}

    await emit({
        "type": "agent_complete",
        "agent": "ScreeningAgent",
        "message": f"1차 선별 완료: {len(papers)}건 → {included}건 통과 / {excluded}건 제외",
    })
    await emit({"type": "prisma_update", "counts": stats})

    return {
        "screened_papers": screened,
        "prisma_stats": stats,
        "logs": [f"[ScreeningAgent] {len(papers)}건 중 {included}건 통과 ({excluded}건 제외)"],
    }
