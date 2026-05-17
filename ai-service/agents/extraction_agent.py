"""Agent 4: Data Extraction Agent (Claude) — Extract structured data from included papers."""

import json
import asyncio
from pathlib import Path
from typing import Any, Callable, Coroutine
from langchain_core.messages import HumanMessage

from state import ReviewState, PaperInfo
from config import EXTRACTION_MODEL, PAPERS_DIR
from prompts import EXTRACTION_PROMPT
from utils.llm_factory import get_llm


async def extraction_agent(
    state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> dict:
    """Extract structured data from each included paper and save to papers/ dir."""

    papers = state["included_papers"]
    await emit({
        "type": "agent_start",
        "agent": "ExtractionAgent",
        "message": f"{len(papers)}건 포함 논문 데이터 추출 시작...",
    })

    if not papers:
        await emit({"type": "agent_complete", "agent": "ExtractionAgent", "message": "추출할 논문 없음"})
        return {"included_papers": [], "logs": ["[ExtractionAgent] 추출할 논문 없음"]}

    llm = get_llm(EXTRACTION_MODEL, max_tokens=4096)

    BATCH = 10
    extracted_map: dict[str, dict] = {}

    for i in range(0, len(papers), BATCH):
        batch = papers[i: i + BATCH]
        papers_json = json.dumps(
            [{"title": p["title"], "abstract": p.get("abstract", ""), "venue": p.get("venue", ""), "year": p.get("year"), "authors": p.get("authors", [])} for p in batch],
            ensure_ascii=False,
            indent=2,
        )
        prompt = EXTRACTION_PROMPT.format(
            query=state.get("research_question") or state.get("query", ""),
            papers=papers_json,
        )

        await emit({
            "type": "agent_progress",
            "agent": "ExtractionAgent",
            "message": f"데이터 추출 중 ({i + 1}–{min(i + BATCH, len(papers))}/{len(papers)}건)...",
        })

        try:
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
            results = json.loads(raw)
            for r in results:
                extracted_map[r["title"]] = r.get("extracted_data", {})
        except Exception as e:
            await emit({"type": "error", "agent": "ExtractionAgent", "message": f"추출 오류: {str(e)}"})

    # Update papers with extracted data and save to files
    enriched: list[PaperInfo] = []
    session_dir = PAPERS_DIR / state["session_id"]
    session_dir.mkdir(exist_ok=True)

    for p in papers:
        extracted = extracted_map.get(p["title"], {})
        updated = {**p, "extracted_data": extracted}
        enriched.append(updated)

        # Save individual paper file
        safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in p["title"])[:80]
        paper_file = session_dir / f"{safe_title}.json"
        paper_file.write_text(
            json.dumps(updated, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    await emit({
        "type": "agent_complete",
        "agent": "ExtractionAgent",
        "message": f"데이터 추출 완료: {len(enriched)}건 → papers/{state['session_id']}/ 저장",
    })

    return {
        "included_papers": enriched,
        "logs": [f"[ExtractionAgent] {len(enriched)}건 데이터 추출 + 파일 저장 완료"],
    }
