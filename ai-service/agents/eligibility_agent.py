"""Agent 3: Eligibility Agent (Claude) — PRISMA Eligibility stage.

실제 논문 전문(full-text)을 여러 경로로 확보 후 Claude가 읽고 판단.
전문 확보 불가 시 초록으로 fallback.
"""

import asyncio
import json
from typing import Any, Callable, Coroutine
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage

from state import ReviewState, PaperInfo
from config import ANTHROPIC_API_KEY, REVIEW_MODEL
from utils.fetch_fulltext import fetch_fulltext

ELIGIBILITY_PROMPT = """You are a senior systematic review methodologist performing PRISMA 2020 eligibility assessment.

## Research Question
{query}

## Eligibility Criteria
{criteria_block}

## Paper Under Review
Title: {title}
Authors: {authors}
Year: {year}
Venue: {venue}

## Available Content
{content}

## Task
Assess eligibility based on available content.

IMPORTANT RULES:
- If only abstract is available (no full text), apply LENIENT criteria — give benefit of the doubt.
  INCLUDE if the title/abstract suggests relevance, even if details are missing.
- If full text is available, apply criteria carefully but err on the side of inclusion.
- Only EXCLUDE when the paper is CLEARLY irrelevant or explicitly violates a stated criterion.
- Default to INCLUDE when uncertain — false negatives (missing relevant papers) are worse than false positives.

Dimensions to evaluate:
1. **Relevance** — Does the paper relate to the research question?
2. **Study design** — Is the methodology identifiable?
3. **Population/Scope** — Is the target population appropriate?
4. **Outcomes** — Are outcomes potentially relevant?
5. **Language** — Is the paper readable (English or Korean)?

## Output (JSON only)
{{
  "decision": "INCLUDE" or "EXCLUDE",
  "reason": "<1–2 sentences. If abstract-only, note that full-text was unavailable>",
  "study_design": "<RCT | Cohort | Cross-sectional | Case-control | Systematic Review | Meta-analysis | Other | Unknown>",
  "confidence": "high" | "moderate" | "low",
  "full_text_available": true or false
}}

Return ONLY the JSON object. No markdown, no extra text.
"""


async def _assess_one(
    llm: ChatAnthropic,
    paper: PaperInfo,
    query: str,
    criteria_block: str,
) -> dict:
    """Fetch full text (using all available URL fields) then ask Claude."""
    abstract = paper.get("abstract", "") or ""

    # Pass full paper dict so fetch_fulltext can try all URL strategies
    full_text = await asyncio.get_running_loop().run_in_executor(
        None, lambda: fetch_fulltext(dict(paper))
    )

    if full_text:
        content = f"[FULL TEXT RETRIEVED]\n\n{full_text}"
        full_text_available = True
    else:
        content = f"[ABSTRACT ONLY — full text not accessible]\n\n{abstract}"
        full_text_available = False

    prompt = ELIGIBILITY_PROMPT.format(
        query=query,
        criteria_block=criteria_block,
        title=paper["title"],
        authors=", ".join(paper.get("authors", [])[:5]) or "Unknown",
        year=paper.get("year") or "Unknown",
        venue=paper.get("venue", "") or "",
        content=content,
    )

    response = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda p=prompt: llm.invoke([HumanMessage(content=p)])
    )
    raw = response.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    result = json.loads(raw)
    result["full_text_available"] = result.get("full_text_available", full_text_available)
    return result


async def eligibility_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """Full-text eligibility assessment — concurrent batches with Claude."""

    papers = state.get("screened_papers", [])
    await emit({
        "type": "agent_start",
        "agent": "EligibilityAgent",
        "message": f"{len(papers)}건 논문 전문 확보 및 적격성 평가 시작...",
    })

    if not papers:
        await emit({"type": "agent_complete", "agent": "EligibilityAgent", "message": "평가할 논문 없음"})
        return {
            "eligible_papers": [],
            "included_papers": [],
            "prisma_stats": state.get("prisma_stats", {}),
            "logs": ["[EligibilityAgent] 평가할 논문 없음"],
        }

    llm = ChatAnthropic(
        model=REVIEW_MODEL,
        anthropic_api_key=ANTHROPIC_API_KEY,
        temperature=0,
        max_tokens=1024,
    )

    # Build criteria block
    inclusion = state.get("inclusion_criteria", [])
    exclusion = state.get("exclusion_criteria", [])
    criteria_lines = []
    if inclusion:
        criteria_lines.append("포함 기준:")
        criteria_lines.extend(f"  - {c}" for c in inclusion)
    if exclusion:
        criteria_lines.append("제외 기준:")
        criteria_lines.extend(f"  - {c}" for c in exclusion)
    criteria_block = "\n".join(criteria_lines) if criteria_lines else "별도 기준 없음 — 연구 질문 적합성과 방법론적 엄밀성으로 판단"

    query = state.get("query", "")
    eligible: list[PaperInfo] = []
    included: list[PaperInfo] = []
    full_text_count = 0

    CONCURRENT = 5
    for batch_start in range(0, len(papers), CONCURRENT):
        batch = papers[batch_start: batch_start + CONCURRENT]
        batch_end = min(batch_start + CONCURRENT, len(papers))

        await emit({
            "type": "agent_progress",
            "agent": "EligibilityAgent",
            "message": f"전문 확보 및 평가 중 ({batch_start + 1}–{batch_end} / {len(papers)}건)...",
        })

        tasks = [_assess_one(llm, p, query, criteria_block) for p in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for p, result in zip(batch, results):
            if isinstance(result, Exception):
                decision = "INCLUDE"  # on error, be conservative — include
                reason = f"평가 오류 → 보수적 포함 처리: {result}"
                study_design, confidence, ft = "Unknown", "low", False
            else:
                decision = result.get("decision", "INCLUDE")
                reason = result.get("reason", "")
                study_design = result.get("study_design", "Unknown")
                confidence = result.get("confidence", "low")
                ft = result.get("full_text_available", False)
                if ft:
                    full_text_count += 1

            label = "전문" if ft else "초록"
            full_reason = f"[{study_design}][신뢰도:{confidence}][{label}] {reason}"

            updated: PaperInfo = {
                **p,
                "decision": decision,
                "reason": full_reason,
                "prisma_stage": "eligible",
            }
            eligible.append(updated)

            await emit({
                "type": "paper_decision",
                "title": p["title"],
                "decision": decision,
                "reason": full_reason,
                "stage": "eligibility",
            })

            if decision == "INCLUDE":
                included.append({**updated, "prisma_stage": "included"})

    excluded_count = len(eligible) - len(included)
    stats = {**state.get("prisma_stats", {}), "eligible": len(eligible), "included": len(included)}

    await emit({
        "type": "agent_complete",
        "agent": "EligibilityAgent",
        "message": (
            f"적격성 평가 완료: {len(papers)}건 → {len(included)}건 포함 / {excluded_count}건 제외 "
            f"(전문 확보 {full_text_count}건 / 초록 {len(papers) - full_text_count}건)"
        ),
    })
    await emit({"type": "prisma_update", "counts": stats})

    return {
        "eligible_papers": eligible,
        "included_papers": included,
        "prisma_stats": stats,
        "logs": [
            f"[EligibilityAgent] {len(papers)}건 평가 → {len(included)}건 포함",
            f"전문 확보: {full_text_count}건 / 초록 fallback: {len(papers) - full_text_count}건",
        ],
    }
