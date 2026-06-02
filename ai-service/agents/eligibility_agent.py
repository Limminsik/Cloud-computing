"""Agent 3: Eligibility Agent (Claude) — PRISMA Eligibility stage.

실제 논문 전문(full-text)을 여러 경로로 확보 후 Claude가 읽고 판단.
전문 확보 불가 시 초록으로 fallback (단, 초록만 있을 때는 보수적 판정).
"""

import asyncio
import json
import logging
import re
from typing import Any, Callable, Coroutine
from langchain_core.messages import HumanMessage

logger = logging.getLogger("eligibility_agent")

import hashlib
from pathlib import Path

from state import ReviewState, PaperInfo
from config import ELIGIBILITY_MODEL, ELIGIBILITY_CONCURRENT, ELIGIBILITY_MAX_TOKENS, FETCH_FULLTEXT, PAPERS_DIR
from utils.fetch_fulltext import fetch_fulltext_with_source
from utils.llm_factory import get_llm


def _load_manual_fulltext(session_id: str, title: str) -> str | None:
    """Load manually uploaded full text for a paper if available."""
    safe = hashlib.md5(title.encode()).hexdigest()
    path = PAPERS_DIR / session_id / f"{safe}_manual.txt"
    if path.exists():
        try:
            return path.read_text(encoding="utf-8")
        except Exception:
            return None
    return None

ELIGIBILITY_PROMPT = """You are a senior systematic review methodologist performing PRISMA 2020 eligibility assessment.

## Research Question / Review Purpose
{query}

## Eligibility Criteria
{criteria_block}

## Paper Under Review
Title: {title}
Authors: {authors}
Year: {year}
Venue: {venue}

## Content ({content_type})
{content}

## Task
Carefully assess whether this paper meets eligibility criteria for the systematic review.
Extract structured information from the content to support report writing.

### Assessment rules by content type:

**If FULL TEXT is available:**
- Assess methodology, population, outcomes rigorously.
- INCLUDE only if the paper clearly addresses the research question with appropriate methods.
- EXCLUDE if design is inappropriate, population is out of scope, or outcomes are irrelevant.

**If ABSTRACT ONLY is available:**
- If the paper is clearly relevant to the research question based on topic and content, lean toward INCLUDE.
- EXCLUDE only when clearly out of scope, wrong language, duplicate, or the abstract explicitly describes an inappropriate study type.
- Do NOT exclude solely because the abstract is short or lacks methodological detail — insufficient information alone is not a reason to exclude.

### Article type classification:
Classify as one of: Original Article | Review | Systematic Review | Meta-analysis | Case Report | Editorial | Letter | Conference Paper | Other

## Output (JSON only — no markdown, no code fences)
** IMPORTANT: Write all text fields (reason, pico, key_findings, limitations) in Korean. **

{{
  "decision": "INCLUDE" or "EXCLUDE",
  "exclude_reason_category": "study_design" | "population" | "outcome" | "language" | "duplicate" | "other" | null,
  "reason": "<구체적 근거를 제시하는 2~3문장, 한국어로 작성>",
  "article_type": "<Original Article | Review | Systematic Review | Meta-analysis | Case Report | Editorial | Letter | Conference Paper | Other>",
  "pico": {{
    "population": "<연구 대상 집단 및 표본 크기(있는 경우), 한국어로 작성, 없으면 null>",
    "intervention": "<중재 또는 노출 요인, 한국어로 작성, 없으면 null>",
    "comparison": "<비교군 또는 대조군, 한국어로 작성, 없으면 null>",
    "outcome": "<주요 결과 지표, 한국어로 작성, 없으면 null>"
  }},
  "key_findings": "<주요 연구 결과 1~2문장 요약, 한국어로 작성, 제외 논문은 null>",
  "limitations": "<주요 한계점, 한국어로 작성, 없으면 null>"
}}
"""


async def _assess_one(
    llm,
    paper: PaperInfo,
    query: str,
    criteria_block: str,
    session_id: str = "",
) -> dict:
    """Fetch full text (manual upload first, then auto strategies) then assess."""
    abstract = paper.get("abstract", "") or ""

    # 1. Check for manually uploaded full text first
    manual_text = _load_manual_fulltext(session_id, paper["title"]) if session_id else None
    if manual_text:
        full_text        = manual_text
        full_text_source = "수동 업로드"
        logger.info(f"[EligibilityAgent] Using manual upload for: {paper['title'][:60]}")
    elif FETCH_FULLTEXT:
        # 2. Auto-fetch via URL strategies
        url_fields = {k: paper.get(k) for k in ("url", "pmc_url", "doi_url", "open_access_pdf", "arxiv_url", "pubmed_url")}
        available  = {k: v for k, v in url_fields.items() if v}
        logger.info(f"[EligibilityAgent] URL fields for '{paper['title'][:50]}': {list(available.keys()) or 'NONE'}")
        full_text, full_text_source = await asyncio.get_running_loop().run_in_executor(
            None, lambda: fetch_fulltext_with_source(dict(paper))
        )
    else:
        full_text, full_text_source = None, None

    if full_text:
        content = full_text
        content_type = f"FULL TEXT RETRIEVED ({full_text_source})"
        full_text_available = True
        logger.info(f"[EligibilityAgent] Full text obtained via {full_text_source}: {paper['title'][:60]}")
    else:
        full_text_source = None
        content = abstract or "(no abstract available)"
        content_type = "ABSTRACT ONLY — full text could not be retrieved"
        full_text_available = False
        logger.info(f"[EligibilityAgent] Abstract-only for: {paper['title'][:60]}")

    prompt = ELIGIBILITY_PROMPT.format(
        query=query,
        criteria_block=criteria_block,
        title=paper["title"],
        authors=", ".join(paper.get("authors", [])[:5]) or "Unknown",
        year=paper.get("year") or "Unknown",
        venue=paper.get("venue", "") or "",
        content_type=content_type,
        content=content,
    )

    response = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda p=prompt: llm.invoke([HumanMessage(content=p)])
    )
    raw = response.content.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
    start = raw.find("{")
    end   = raw.rfind("}") + 1
    if start != -1 and end > 0:
        raw = raw[start:end]
    result = json.loads(raw)
    result["full_text_available"] = result.get("full_text_available", full_text_available)
    result["full_text_source"] = full_text_source
    # First 600 chars of retrieved text as a preview snippet
    result["full_text_snippet"] = full_text[:600] if full_text else None
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

    llm = get_llm(ELIGIBILITY_MODEL, max_tokens=ELIGIBILITY_MAX_TOKENS)

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

    generated = state.get("generated_search_terms") or {}
    query = (
        generated.get("reasoning")
        or state.get("research_question")
        or ""
    )
    eligible: list[PaperInfo] = []
    included: list[PaperInfo] = []
    full_text_count = 0

    for batch_start in range(0, len(papers), ELIGIBILITY_CONCURRENT):
        batch = papers[batch_start: batch_start + ELIGIBILITY_CONCURRENT]
        batch_end = min(batch_start + ELIGIBILITY_CONCURRENT, len(papers))

        await emit({
            "type": "agent_progress",
            "agent": "EligibilityAgent",
            "message": f"전문 확보 및 적격성 평가 중 ({batch_start + 1}–{batch_end} / {len(papers)}건)...",
        })

        sid = state.get("session_id", "")
        tasks = [_assess_one(llm, p, query, criteria_block, sid) for p in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for p, result in zip(batch, results):
            if isinstance(result, Exception):
                decision              = "INCLUDE"
                reason                = f"평가 오류 → 보수적 포함 처리: {result}"
                exclude_reason_cat    = None
                article_type          = "Other"
                pico                  = {}
                key_findings          = None
                limitations           = None
                ft                    = False
                ft_source, ft_snippet = None, None
            else:
                decision           = result.get("decision", "INCLUDE")
                reason             = result.get("reason", "")
                exclude_reason_cat = result.get("exclude_reason_category")
                article_type       = result.get("article_type", "Other")
                pico               = result.get("pico") or {}
                key_findings       = result.get("key_findings")
                limitations        = result.get("limitations")
                ft                 = result.get("full_text_available", False)
                ft_source          = result.get("full_text_source")
                ft_snippet         = result.get("full_text_snippet")
                if ft:
                    full_text_count += 1

            extracted_data = {
                "article_type":          article_type,
                "exclude_reason_category": exclude_reason_cat,
                "pico":                  pico,
                "key_findings":          key_findings,
                "limitations":           limitations,
                "full_text_available":   ft,
                "full_text_source":      ft_source,
                "full_text_snippet":     ft_snippet,
            }

            updated: PaperInfo = {
                **p,
                "decision":       decision,
                "reason":         reason,
                "prisma_stage":   "eligible",
                "extracted_data": extracted_data,
            }
            eligible.append(updated)

            await emit({
                "type":                    "paper_decision",
                "title":                   p["title"],
                "decision":                decision,
                "reason":                  reason,
                "stage":                   "eligibility",
                "url":                     p.get("url"),
                "year":                    p.get("year"),
                "venue":                   p.get("venue"),
                "exclude_reason_category": exclude_reason_cat,
                "article_type":            article_type,
                "pico":                    pico,
                "key_findings":            key_findings,
                "limitations":             limitations,
                "full_text_available":     ft,
                "full_text_source":        ft_source,
                "full_text_snippet":       ft_snippet,
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
