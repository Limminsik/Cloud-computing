"""Agent 2: Screening Agent (Gemini) — PRISMA Screening stage.

PRISMA 2020 기준: 제목(Title) + 초록(Abstract)만으로 1차 선별.
연구 목적 요약문(researchSummary / reasoning)을 기준으로 관련성 판단.
"""

import json
import re
import asyncio
from typing import Any, Callable, Coroutine

from langchain_core.messages import HumanMessage

from state import ReviewState, PaperInfo
from config import SCREENING_MODEL, SCREENING_BATCH_SIZE
from utils.llm_factory import get_llm

SCREENING_PROMPT = """당신은 체계적 문헌고찰(Systematic Review) 스크리닝 전문가입니다.
PRISMA 2020 가이드라인에 따라 제목과 초록만으로 논문의 포함 여부를 판단합니다.

## 연구 목적 요약
{research_summary}

## 판단 기준
- INCLUDE: 위 연구 목적과 직접적으로 관련되는 논문
- EXCLUDE: 연구 목적과 무관하거나, 초록이 없어 판단 불가하거나, 명백히 범위 밖인 논문

{extra_criteria}

## 스크리닝 대상 논문 (제목 + 초록)
{papers_json}

## 출력 형식
반드시 아래 JSON 배열만 반환하세요. 마크다운 없이 순수 JSON만.
[
  {{
    "title": "<입력과 동일한 제목>",
    "decision": "INCLUDE" 또는 "EXCLUDE",
    "reason": "<한 문장으로 판단 근거>"
  }},
  ...
]
"""


async def screening_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """PRISMA Screening: 제목 + 초록 기반 1차 선별."""

    papers = state.get("identified_papers", [])
    await emit({
        "type": "agent_start",
        "agent": "ScreeningAgent",
        "message": f"Screening Agent 시작 — {len(papers)}건 제목/초록 선별...",
    })

    if not papers:
        await emit({"type": "agent_complete", "agent": "ScreeningAgent", "message": "선별할 논문 없음"})
        return {"screened_papers": [], "prisma_stats": state.get("prisma_stats", {}),
                "logs": ["[ScreeningAgent] 선별할 논문 없음"]}

    # ── 연구 요약문 결정 ────────────────────────────────────────────────────────
    # generated_search_terms.reasoning > research_question 순으로 사용
    generated = state.get("generated_search_terms") or {}
    research_summary = (
        generated.get("reasoning")
        or state.get("research_question", "")
    )

    # ── 사용자 추가 기준 (선택) ─────────────────────────────────────────────────
    inclusion = state.get("inclusion_criteria", [])
    exclusion = state.get("exclusion_criteria", [])
    extra_lines = []
    if inclusion:
        extra_lines.append("추가 포함 기준:")
        extra_lines.extend(f"  - {c}" for c in inclusion)
    if exclusion:
        extra_lines.append("추가 제외 기준:")
        extra_lines.extend(f"  - {c}" for c in exclusion)
    extra_criteria = "\n".join(extra_lines) if extra_lines else ""

    llm = get_llm(SCREENING_MODEL)

    all_decisions: dict[str, dict] = {}
    total = len(papers)

    # ── 배치 처리 ───────────────────────────────────────────────────────────────
    for batch_start in range(0, total, SCREENING_BATCH_SIZE):
        batch = papers[batch_start: batch_start + SCREENING_BATCH_SIZE]
        batch_end = min(batch_start + SCREENING_BATCH_SIZE, total)

        await emit({
            "type": "agent_progress",
            "agent": "ScreeningAgent",
            "message": f"선별 중... ({batch_start + 1}–{batch_end} / {total}건)",
        })

        papers_json = json.dumps(
            [
                {
                    "title":    p["title"],
                    "abstract": (p.get("abstract") or "").strip()[:800],  # 토큰 절약
                }
                for p in batch
            ],
            ensure_ascii=False,
            indent=2,
        )

        prompt = SCREENING_PROMPT.format(
            research_summary=research_summary,
            extra_criteria=extra_criteria,
            papers_json=papers_json,
        )

        try:
            response = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda p=prompt: llm.invoke([HumanMessage(content=p)])
            )
            raw = response.content.strip()
            # 마크다운 코드 펜스 제거
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
            raw = raw.strip()

            decisions = json.loads(raw)
            for d in decisions:
                if isinstance(d, dict) and "title" in d:
                    all_decisions[d["title"]] = d
        except Exception as e:
            await emit({
                "type": "error",
                "agent": "ScreeningAgent",
                "message": f"배치 선별 오류 ({batch_start + 1}–{batch_end}): {e}",
            })

    # ── 결과 적용 ───────────────────────────────────────────────────────────────
    screened: list[PaperInfo] = []
    for p in papers:
        info = all_decisions.get(p["title"], {})
        decision = info.get("decision", "EXCLUDE")
        reason   = info.get("reason", "스크리닝 결과 없음 — 제외 처리")

        await emit({
            "type":     "paper_decision",
            "title":    p["title"],
            "decision": decision,
            "reason":   reason,
            "stage":    "screening",
            "url":      p.get("url"),
        })

        if decision == "INCLUDE":
            screened.append({
                **p,
                "decision":    decision,
                "reason":      reason,
                "prisma_stage": "screened",
            })

    included_count = len(screened)
    excluded_count = total - included_count

    stats = {**state.get("prisma_stats", {}), "screened": included_count}

    await emit({
        "type": "agent_complete",
        "agent": "ScreeningAgent",
        "message": (
            f"1차 선별 완료 — "
            f"{total}건 검토 → {included_count}건 통과 / {excluded_count}건 제외"
        ),
    })
    await emit({"type": "prisma_update", "counts": stats})

    return {
        "screened_papers": screened,
        "prisma_stats":    stats,
        "logs": [
            f"[ScreeningAgent] {total}건 중 {included_count}건 통과 ({excluded_count}건 제외)",
            f"[ScreeningAgent] 연구 요약 기준 적용: {research_summary[:100]}...",
        ],
    }
