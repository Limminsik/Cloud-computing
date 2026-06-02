"""FastAPI AI Microservice — PRISMA pipeline powered by LangGraph."""

import asyncio
import json
import logging
import re

import hashlib

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import NESTJS_CALLBACK_URL, PAPERS_DIR
from state import ReviewState
from graph.pipeline import prisma_graph, get_config, register_emitter, unregister_emitter
from agents.search_agent import generate_search_terms
from sources.pubmed import search_pubmed
from sources.semantic_scholar import search_semantic_scholar

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("main")

# ── SSE event queues (session_id → asyncio.Queue) ────────────────────────────
_event_queues: dict[str, asyncio.Queue] = {}


def _get_or_create_queue(session_id: str) -> asyncio.Queue:
    if session_id not in _event_queues:
        _event_queues[session_id] = asyncio.Queue()
    return _event_queues[session_id]


async def _emit_to(session_id: str, event: dict):
    await _get_or_create_queue(session_id).put(event)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="PRISMA AI Review Service — LangGraph")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ─────────────────────────────────────────────────────────────

class GenerateTermsRequest(BaseModel):
    research_question: str
    keywords: list[str] = []

class PipelineRequest(BaseModel):
    session_id: str
    research_question: str
    keywords: list[str] = []              # 사용자가 직접 입력한 연구 키워드
    boolean_query: str = ""               # generate-terms에서 확정된 Boolean query
    search_terms: list[str] = []
    inclusion_criteria: list[str] = []
    exclusion_criteria: list[str] = []

class StageRequest(BaseModel):
    session_id: str
    criteria: list[str] = []

class PipelineResponse(BaseModel):
    session_id: str
    status: str


# ── NestJS callback ────────────────────────────────────────────────────────────

async def _notify_nestjs(session_id: str, final_state: ReviewState):
    url = f"{NESTJS_CALLBACK_URL}/api/sessions/{session_id}/complete"
    report = final_state.get("review_report") or ""
    payload = {
        "prisma_stats":    final_state.get("prisma_stats", {}),
        "included_papers": final_state.get("included_papers", []),
        "review_report":   report,
    }
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                logger.info(f"[{session_id}] NestJS notified — report {len(report)} chars")
                return
        except Exception as e:
            logger.error(f"[{session_id}] NestJS notify attempt {attempt+1} failed: {e}")
            if attempt < 2:
                await asyncio.sleep(2)
    logger.error(f"[{session_id}] NestJS notify failed after 3 attempts")


async def _save_stage_to_db(session_id: str, stage: str, papers: list, prisma_stats: dict):
    """Save intermediate stage results to NestJS DB (including full-text URL fields)."""
    logger.info(f"[{session_id}] Saving stage '{stage}': {len(papers)} papers")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{NESTJS_CALLBACK_URL}/api/sessions/{session_id}/stage-results",
                json={
                    "stage": stage,
                    "papers": [
                        {
                            "title":           p.get("title", ""),
                            "authors":         p.get("authors", []),
                            "year":            p.get("year"),
                            "url":             p.get("url"),
                            "abstract":        p.get("abstract", ""),
                            "venue":           p.get("venue", ""),
                            "pmc_url":         p.get("pmc_url"),
                            "doi_url":         p.get("doi_url"),
                            "open_access_pdf": p.get("open_access_pdf"),
                            "arxiv_url":       p.get("arxiv_url"),
                            "pubmed_url":      p.get("pubmed_url"),
                            "decision":        p.get("decision"),
                            "reason":          p.get("reason"),
                            "extracted_data":  p.get("extracted_data"),
                        }
                        for p in papers
                    ],
                    "prisma_stats": prisma_stats,
                },
            )
            logger.info(f"[{session_id}] Stage '{stage}' save response: {resp.status_code}")
    except Exception as e:
        logger.error(f"[{session_id}] Failed to save stage '{stage}': {e}")


async def _load_papers_from_db(session_id: str, prisma_stage: str) -> list[dict]:
    """Load papers of a given PRISMA stage from NestJS DB (fallback for lost MemorySaver state)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{NESTJS_CALLBACK_URL}/api/sessions/{session_id}")
            if resp.status_code != 200:
                return []
            data = resp.json()
            papers = data.get("papers", [])
            return [
                {
                    "title":           p.get("title", ""),
                    "authors":         p.get("authors", []),
                    "year":            p.get("year"),
                    "url":             p.get("url"),
                    "abstract":        p.get("abstract", ""),
                    "venue":           p.get("venue", ""),
                    "pmc_url":         p.get("pmcUrl"),
                    "doi_url":         p.get("doiUrl"),
                    "open_access_pdf": p.get("openAccessPdf"),
                    "arxiv_url":       p.get("arxivUrl"),
                    "pubmed_url":      p.get("pubmedUrl"),
                    "decision":        p.get("decision"),
                    "reason":          p.get("reason"),
                    "prisma_stage":    p.get("prismaStage", prisma_stage),
                    "extracted_data":  p.get("extractedData"),
                }
                for p in papers
                if p.get("prismaStage") == prisma_stage
            ]
    except Exception as e:
        logger.error(f"[{session_id}] Failed to load {prisma_stage} papers from DB: {e}")
        return []


# ── Pipeline runner ────────────────────────────────────────────────────────────

async def _run_graph(session_id: str, initial_state: ReviewState | None = None, updated_fields: dict | None = None):
    """
    Run or resume the LangGraph pipeline for a session.

    - initial_state is provided only on the first call (search stage).
    - On resume, pass updated_fields to inject new criteria into the state.
    """
    config = get_config(session_id)

    async def emit(event: dict):
        await _emit_to(session_id, event)

    register_emitter(session_id, emit)

    try:
        if updated_fields:
            # Inject user-supplied criteria before resuming
            prisma_graph.update_state(config, updated_fields)

        # --- DB fallback: if MemorySaver lost state (container restart), rebuild from DB ---
        if initial_state is None:
            snapshot = prisma_graph.get_state(config)
            snap_vals = snapshot.values if snapshot else {}
            next_nodes_now = list(snapshot.next) if snapshot else []

            # Determine which stage we're trying to resume based on what's in the state
            needs_screening  = (not snap_vals.get("identified_papers") and not snap_vals.get("screened_papers"))
            needs_eligibility = (not snap_vals.get("screened_papers") and snap_vals.get("identified_papers") is not None)

            if not snap_vals or (not snap_vals.get("identified_papers") and not snap_vals.get("screened_papers")):
                # No state at all — try to load from DB
                identified_from_db = await _load_papers_from_db(session_id, "identified")
                screened_from_db   = await _load_papers_from_db(session_id, "screened")
                if screened_from_db:
                    logger.info(f"[{session_id}] Restoring state from DB: {len(screened_from_db)} screened papers")
                    prisma_graph.update_state(config, {
                        "session_id": session_id,
                        "identified_papers": identified_from_db,
                        "screened_papers": screened_from_db,
                        "research_question": "",
                    }, as_node="eligibility")
                elif identified_from_db:
                    logger.info(f"[{session_id}] Restoring state from DB: {len(identified_from_db)} identified papers")
                    prisma_graph.update_state(config, {
                        "session_id": session_id,
                        "identified_papers": identified_from_db,
                        "research_question": "",
                    }, as_node="screening")
            elif snap_vals.get("identified_papers") and not snap_vals.get("screened_papers"):
                # Screening was done but screened_papers missing — reload
                screened_from_db = await _load_papers_from_db(session_id, "screened")
                if screened_from_db:
                    logger.info(f"[{session_id}] Restoring screened_papers from DB: {len(screened_from_db)}")
                    prisma_graph.update_state(config, {"screened_papers": screened_from_db})

        # ainvoke with None resumes from the last interrupt point
        input_state = initial_state if initial_state is not None else None
        final_state = await prisma_graph.ainvoke(input_state, config=config)

        # Check current graph state regardless of whether it's done or interrupted
        snapshot = prisma_graph.get_state(config)
        current_values = snapshot.values if snapshot else {}
        next_nodes = list(snapshot.next) if snapshot else []

        if not next_nodes:
            # Graph ran to END — pipeline fully complete
            await _notify_nestjs(session_id, current_values)
            await _emit_to(session_id, {
                "type": "pipeline_done",
                "session_id": session_id,
                "report_preview": (current_values.get("review_report") or "")[:200],
            })
        else:
            # Graph hit an interrupt — save identified papers if search just completed
            completed_stage = _prev_stage(next_nodes[0])

            if completed_stage == "identification":
                identified = current_values.get("identified_papers", [])
                generated  = current_values.get("generated_search_terms") or {}
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        # Save identified papers
                        await client.post(
                            f"{NESTJS_CALLBACK_URL}/api/sessions/{session_id}/identified",
                            json={
                                "papers": [
                                    {
                                        "title":           p.get("title", ""),
                                        "authors":         p.get("authors", []),
                                        "year":            p.get("year"),
                                        "url":             p.get("url"),
                                        "abstract":        p.get("abstract", ""),
                                        "venue":           p.get("venue", ""),
                                        "pmc_url":         p.get("pmc_url"),
                                        "doi_url":         p.get("doi_url"),
                                        "open_access_pdf": p.get("open_access_pdf"),
                                        "arxiv_url":       p.get("arxiv_url"),
                                        "pubmed_url":      p.get("pubmed_url"),
                                    }
                                    for p in identified
                                ],
                                "prisma_stats": current_values.get("prisma_stats", {}),
                            },
                        )
                        # Save generated terms only if LLM actually generated them (not preset)
                        # Preset case: SearchForm already saved full generatedTerms at session creation
                        if generated and generated.get("reasoning"):
                            await client.post(
                                f"{NESTJS_CALLBACK_URL}/api/sessions/{session_id}/generated-terms",
                                json={
                                    "generatedTerms": generated,
                                    "researchSummary": generated.get("reasoning", ""),
                                },
                            )
                except Exception as e:
                    logger.error(f"[{session_id}] Failed to save identification results: {e}")

                # Also emit identified_papers SSE for live display
                await _emit_to(session_id, {
                    "type": "identified_papers",
                    "papers": [
                        {
                            "title":    p.get("title", ""),
                            "authors":  p.get("authors", []),
                            "year":     p.get("year"),
                            "url":      p.get("url"),
                            "abstract": p.get("abstract", ""),
                            "venue":    p.get("venue", ""),
                        }
                        for p in identified
                    ],
                })

            elif completed_stage == "screening":
                screened = current_values.get("screened_papers", [])
                await _save_stage_to_db(session_id, "screened", screened, current_values.get("prisma_stats", {}))

            elif completed_stage == "eligibility":
                eligible = current_values.get("eligible_papers", [])
                await _save_stage_to_db(session_id, "eligible", eligible, current_values.get("prisma_stats", {}))

            await _emit_to(session_id, {
                "type": "stage_complete",
                "stage": completed_stage,
                "next":  next_nodes[0],
            })

    except Exception as e:
        await _emit_to(session_id, {"type": "error", "agent": "Pipeline", "message": str(e)})
    finally:
        unregister_emitter(session_id)


def _prev_stage(next_node: str) -> str:
    """Return the completed stage name given the next pending node."""
    mapping = {
        "screening":   "identification",
        "eligibility": "screening",
        "extraction":  "eligibility",
        "writer":      "inclusion",
    }
    return mapping.get(next_node, next_node)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}


class PreviewSearchRequest(BaseModel):
    boolean_query: str
    research_question: str = ""


@app.post("/pipeline/preview-search")
async def preview_search(body: PreviewSearchRequest):
    """Count-only search across all DBs — no paper fetch, just totals."""
    plain_query = re.sub(r'\[MeSH\]', '', body.boolean_query).strip() or body.research_question

    async def _count_pubmed():
        try:
            _, total = await asyncio.get_running_loop().run_in_executor(
                None, lambda: search_pubmed(plain_query, max_results=1)
            )
            return total
        except Exception:
            return None

    async def _count_semantic_scholar():
        try:
            _, total = await asyncio.get_running_loop().run_in_executor(
                None, lambda: search_semantic_scholar(plain_query, max_results=1)
            )
            return total
        except Exception:
            return None

    pubmed_total, s2_total = await asyncio.gather(
        _count_pubmed(), _count_semantic_scholar()
    )

    return {
        "status": "ok",
        "query": plain_query,
        "counts": {
            "pubmed": pubmed_total,
            "semantic_scholar": s2_total,
        }
    }


@app.post("/pipeline/generate-terms")
async def generate_terms_endpoint(body: GenerateTermsRequest):
    """Phase 1: Research Question + Keywords → PICO + MeSH + Boolean query."""
    try:
        result = await generate_search_terms(body.research_question, body.keywords)
        return {"status": "ok", "terms": result}
    except Exception as e:
        return {"status": "error", "message": str(e), "terms": None}


@app.post("/pipeline/start", response_model=PipelineResponse)
async def start_pipeline(body: PipelineRequest):
    """Start the pipeline — runs Search Agent then pauses before Screening."""
    session_id = body.session_id
    _get_or_create_queue(session_id)

    # boolean_query가 넘어온 경우 generated_search_terms에 미리 채워서 LLM 재생성 건너뜀
    preset_terms = {"boolean_query": body.boolean_query} if body.boolean_query else None

    initial_state: ReviewState = {
        "session_id":              session_id,
        "research_question":       body.research_question,
        "keywords":                body.keywords,
        "search_terms":            [],
        "generated_search_terms":  preset_terms,
        "inclusion_criteria":      body.inclusion_criteria,
        "exclusion_criteria":      body.exclusion_criteria,
        "identified_papers":       [],
        "screened_papers":         [],
        "eligible_papers":         [],
        "included_papers":         [],
        "prisma_stats":            {"identified": 0, "screened": 0, "eligible": 0, "included": 0},
        "review_report":           None,
        "logs":                    [],
        "status":                  "running",
        "error":                   None,
    }

    asyncio.create_task(_run_graph(session_id, initial_state=initial_state))
    return PipelineResponse(session_id=session_id, status="started")


@app.post("/pipeline/screening", response_model=PipelineResponse)
async def run_screening(body: StageRequest):
    """Resume graph — runs Screening Agent then pauses before Eligibility."""
    session_id = body.session_id
    updated = {"inclusion_criteria": body.criteria} if body.criteria else {}
    asyncio.create_task(_run_graph(session_id, updated_fields=updated or None))
    return PipelineResponse(session_id=session_id, status="screening")


@app.post("/pipeline/eligibility", response_model=PipelineResponse)
async def run_eligibility(body: StageRequest):
    """Resume graph — runs Eligibility Agent then pauses before Extraction."""
    session_id = body.session_id
    updated = {"inclusion_criteria": body.criteria} if body.criteria else {}
    asyncio.create_task(_run_graph(session_id, updated_fields=updated or None))
    return PipelineResponse(session_id=session_id, status="eligibility")


@app.post("/pipeline/inclusion", response_model=PipelineResponse)
async def run_inclusion(body: StageRequest):
    """Resume graph — runs Writer Agent to completion (legacy alias for /writer)."""
    session_id = body.session_id
    asyncio.create_task(_run_graph(session_id, updated_fields=None))
    return PipelineResponse(session_id=session_id, status="inclusion")


@app.post("/pipeline/writer", response_model=PipelineResponse)
async def run_writer(body: StageRequest):
    """Resume graph from eligibility — runs Writer Agent to completion."""
    session_id = body.session_id
    asyncio.create_task(_run_graph(session_id, updated_fields=None))
    return PipelineResponse(session_id=session_id, status="writer")


@app.get("/stream/{session_id}")
async def stream_events(session_id: str):
    """SSE endpoint — frontend subscribes here for real-time events.
    On connect, immediately replays current LangGraph state so reconnects/page-loads restore UI.
    """
    queue = _get_or_create_queue(session_id)

    # Build initial replay events from current LangGraph state
    replay_events: list[dict] = []
    try:
        config = get_config(session_id)
        snapshot = prisma_graph.get_state(config)
        if snapshot and snapshot.values:
            vals = snapshot.values
            next_nodes = list(snapshot.next)

            identified = vals.get("identified_papers", [])
            if identified:
                replay_events.append({
                    "type": "identified_papers",
                    "papers": [
                        {
                            "title":    p.get("title", ""),
                            "authors":  p.get("authors", []),
                            "year":     p.get("year"),
                            "url":      p.get("url"),
                            "abstract": p.get("abstract", ""),
                            "venue":    p.get("venue", ""),
                        }
                        for p in identified
                    ],
                })

            # Replay screened paper decisions
            for p in vals.get("screened_papers", []):
                replay_events.append({
                    "type":     "paper_decision",
                    "title":    p.get("title", ""),
                    "decision": p.get("decision", ""),
                    "reason":   p.get("reason", ""),
                    "stage":    "screening",
                    "url":      p.get("url"),
                })

            # Replay eligible paper decisions
            for p in vals.get("eligible_papers", []):
                ed = p.get("extracted_data") or {}
                replay_events.append({
                    "type":                    "paper_decision",
                    "title":                   p.get("title", ""),
                    "decision":                p.get("decision", ""),
                    "reason":                  p.get("reason", ""),
                    "stage":                   "eligibility",
                    "url":                     p.get("url"),
                    "year":                    p.get("year"),
                    "venue":                   p.get("venue"),
                    "article_type":            ed.get("article_type"),
                    "exclude_reason_category": ed.get("exclude_reason_category"),
                    "pico":                    ed.get("pico"),
                    "key_findings":            ed.get("key_findings"),
                    "limitations":             ed.get("limitations"),
                    "full_text_available":     ed.get("full_text_available"),
                    "full_text_source":        ed.get("full_text_source"),
                    "full_text_snippet":       ed.get("full_text_snippet"),
                })

            if vals.get("prisma_stats"):
                replay_events.append({"type": "prisma_update", "counts": vals["prisma_stats"]})

            # Emit stage_complete for each finished stage
            if identified and next_nodes:
                completed = _prev_stage(next_nodes[0])
                stage_order = ["identification", "screening", "eligibility", "inclusion"]
                completed_idx = stage_order.index(completed) if completed in stage_order else -1
                for stage in stage_order[:completed_idx + 1]:
                    replay_events.append({"type": "stage_complete", "stage": stage})

            # Also ensure identified papers are saved to DB if missing
            if identified:
                asyncio.create_task(_ensure_identified_saved(session_id, identified, vals.get("prisma_stats", {})))
    except Exception as e:
        logger.warning(f"[{session_id}] Could not build SSE replay: {e}")

    async def event_generator():
        # Send replay events first
        for ev in replay_events:
            yield {"data": json.dumps(ev, ensure_ascii=False)}

        # Then stream live events
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
                yield {"data": json.dumps(event, ensure_ascii=False)}
                if event.get("type") == "pipeline_done":
                    break
            except asyncio.TimeoutError:
                yield {"data": json.dumps({"type": "heartbeat"})}

    return EventSourceResponse(event_generator())


async def _ensure_identified_saved(session_id: str, identified: list, prisma_stats: dict):
    """Save identified papers to DB if not already there (idempotent)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            check = await client.get(f"{NESTJS_CALLBACK_URL}/api/sessions/{session_id}")
            if check.status_code == 200:
                data = check.json()
                papers = data.get("papers") or []
                has_identified = any(p.get("prismaStage") == "identified" for p in papers)
                if not has_identified:
                    await client.post(
                        f"{NESTJS_CALLBACK_URL}/api/sessions/{session_id}/identified",
                        json={
                            "papers": [
                                {
                                    "title":    p.get("title", ""),
                                    "authors":  p.get("authors", []),
                                    "year":     p.get("year"),
                                    "url":      p.get("url"),
                                    "abstract": p.get("abstract", ""),
                                    "venue":    p.get("venue", ""),
                                }
                                for p in identified
                            ],
                            "prisma_stats": prisma_stats,
                        },
                    )
                    logger.info(f"[{session_id}] Synced {len(identified)} identified papers to DB on SSE connect")
    except Exception as e:
        logger.warning(f"[{session_id}] Could not sync identified papers: {e}")


def _paper_fulltext_path(session_id: str, title: str):
    """Returns the file path for a manually uploaded paper's full text."""
    safe = hashlib.md5(title.encode()).hexdigest()
    session_dir = PAPERS_DIR / session_id
    session_dir.mkdir(exist_ok=True)
    return session_dir / f"{safe}_manual.txt"


@app.post("/sessions/{session_id}/fulltext")
async def upload_paper_fulltext(
    session_id: str,
    file: UploadFile = File(...),
    title: str = Form(...),
):
    """Accept a PDF upload for a specific paper, extract text, and store it."""
    try:
        from io import BytesIO
        try:
            from pypdf import PdfReader
        except ImportError:
            raise HTTPException(status_code=500, detail="pypdf not installed")

        content = await file.read()
        reader = PdfReader(BytesIO(content))
        text = " ".join(page.extract_text() or "" for page in reader.pages[:30])
        text = re.sub(r'\s+', ' ', text).strip()

        if not text or len(text) < 100:
            raise HTTPException(status_code=422, detail="PDF에서 텍스트를 추출할 수 없습니다. 스캔 PDF이거나 보호된 파일일 수 있습니다.")

        path = _paper_fulltext_path(session_id, title)
        path.write_text(text, encoding="utf-8")
        # Save title alongside so fulltext-status can map md5 → title
        title_path = path.with_suffix(".title")
        title_path.write_text(title, encoding="utf-8")
        logger.info(f"[{session_id}] Manual fulltext saved for '{title[:50]}' — {len(text)} chars")

        return {
            "status": "ok",
            "chars": len(text),
            "preview": text[:300],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{session_id}] PDF upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}/fulltext-status")
async def get_fulltext_status(session_id: str):
    """Return manual full-text upload status for all papers in a session."""
    session_dir = PAPERS_DIR / session_id
    if not session_dir.exists():
        return {"papers": []}

    results = []
    for path in session_dir.glob("*_manual.txt"):
        try:
            text = path.read_text(encoding="utf-8")
            title_path = path.with_suffix(".title")
            title = title_path.read_text(encoding="utf-8") if title_path.exists() else None
            results.append({
                "title":   title,
                "chars":   len(text),
                "preview": text[:200],
            })
        except Exception:
            pass
    return {"papers": results}


@app.delete("/sessions/{session_id}/fulltext")
async def delete_paper_fulltext(session_id: str, title: str):
    """Delete a manually uploaded full text for a paper."""
    path = _paper_fulltext_path(session_id, title)
    if path.exists():
        path.unlink()
        title_path = path.with_suffix(".title")
        if title_path.exists():
            title_path.unlink()
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="전문 파일을 찾을 수 없습니다.")


@app.get("/library/diagnose")
async def diagnose_library():
    """Diagnose library login page — returns HTML form info and screenshot path."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {"error": "playwright not installed"}

    from utils.fetch_library import _load_config, LIBRARY_BASE, LIBRARY_LOGIN
    cfg  = _load_config()
    lib  = cfg.get("library", {})
    user = lib.get("username", "")

    result: dict = {}

    async def _run():
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            page = await browser.new_page()
            try:
                # 1. Check library homepage
                resp = await page.goto(LIBRARY_BASE, timeout=15000)
                result["homepage_status"] = resp.status if resp else None
                result["homepage_url"]    = page.url

                # 2. Check login page
                resp2 = await page.goto(LIBRARY_LOGIN, timeout=15000)
                result["login_page_status"] = resp2.status if resp2 else None
                result["login_page_url"]    = page.url

                await page.wait_for_load_state("networkidle", timeout=8000)

                # 3. Find all input fields on login page
                inputs = await page.evaluate("""() =>
                    Array.from(document.querySelectorAll('input')).map(i => ({
                        type: i.type, name: i.name, id: i.id,
                        placeholder: i.placeholder, className: i.className.slice(0, 60)
                    }))
                """)
                result["login_inputs"] = inputs

                # 4. Find all form actions
                forms = await page.evaluate("""() =>
                    Array.from(document.querySelectorAll('form')).map(f => ({
                        action: f.action, method: f.method, id: f.id
                    }))
                """)
                result["login_forms"] = forms

                # 5. Save screenshot
                screenshot_path = "/tmp/library_login.png"
                await page.screenshot(path=screenshot_path, full_page=True)
                result["screenshot"] = screenshot_path

                # 6. Try login if credentials available
                if user:
                    result["credentials_configured"] = True
                    # Try to find ANY text or password input
                    all_inputs = await page.query_selector_all("input[type='text'], input[type='email'], input:not([type])")
                    pw_inputs  = await page.query_selector_all("input[type='password']")
                    result["text_input_count"] = len(all_inputs)
                    result["password_input_count"] = len(pw_inputs)
                else:
                    result["credentials_configured"] = False
            finally:
                await browser.close()

    await _run()
    return result


@app.get("/sessions/{session_id}/state")
async def get_session_state(session_id: str):
    """Return current LangGraph state snapshot for a session."""
    config = get_config(session_id)
    snapshot = prisma_graph.get_state(config)
    if not snapshot or not snapshot.values:
        raise HTTPException(status_code=404, detail="Session not found or not started")
    return {
        "values": snapshot.values,
        "next":   list(snapshot.next),
    }
