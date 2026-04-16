"""FastAPI AI Microservice — PRISMA Systematic Review Pipeline with SSE streaming."""

import asyncio
import json
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import NESTJS_CALLBACK_URL
from state import ReviewState
from agents.search_agent import search_agent
from agents.screening_agent import screening_agent
from agents.eligibility_agent import eligibility_agent
from agents.extraction_agent import extraction_agent
from agents.writer_agent import writer_agent


# In-memory stores
_event_queues: dict[str, asyncio.Queue] = {}
_session_states: dict[str, ReviewState] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    _event_queues.clear()
    _session_states.clear()


app = FastAPI(title="PRISMA AI Review Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class PipelineRequest(BaseModel):
    session_id: str
    query: str
    search_terms: list[str]
    inclusion_criteria: list[str]
    exclusion_criteria: list[str]

class StageRequest(BaseModel):
    session_id: str
    criteria: list[str] = []

class PipelineResponse(BaseModel):
    session_id: str
    status: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_queue(session_id: str) -> asyncio.Queue:
    if session_id not in _event_queues:
        _event_queues[session_id] = asyncio.Queue()
    return _event_queues[session_id]


async def _emit_to(session_id: str, event: dict):
    queue = _get_or_create_queue(session_id)
    await queue.put(event)


async def _notify_nestjs(session_id: str, final_state: ReviewState):
    url = f"{NESTJS_CALLBACK_URL}/api/sessions/{session_id}/complete"
    payload = {
        "prisma_stats": final_state.get("prisma_stats", {}),
        "included_papers": final_state.get("included_papers", []),
        "review_report": final_state.get("review_report", ""),
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(url, json=payload)
    except Exception:
        pass


# ── Stage runners ─────────────────────────────────────────────────────────────

async def _run_search(state: ReviewState, session_id: str):
    async def emit(event: dict):
        await _emit_to(session_id, event)
    try:
        result = await search_agent(state, emit)
        state.update(result)
        _session_states[session_id] = state
        await _emit_to(session_id, {
            "type": "stage_complete",
            "stage": "identification",
            "count": state.get("prisma_stats", {}).get("identified", 0),
        })
    except Exception as e:
        await _emit_to(session_id, {"type": "error", "agent": "SearchAgent", "message": str(e)})


async def _run_screening(state: ReviewState, session_id: str):
    async def emit(event: dict):
        await _emit_to(session_id, event)
    try:
        result = await screening_agent(state, emit)
        state.update(result)
        _session_states[session_id] = state
        await _emit_to(session_id, {
            "type": "stage_complete",
            "stage": "screening",
            "count": state.get("prisma_stats", {}).get("screened", 0),
        })
    except Exception as e:
        await _emit_to(session_id, {"type": "error", "agent": "ScreeningAgent", "message": str(e)})


async def _run_eligibility(state: ReviewState, session_id: str):
    async def emit(event: dict):
        await _emit_to(session_id, event)
    try:
        result = await eligibility_agent(state, emit)
        state.update(result)
        _session_states[session_id] = state
        await _emit_to(session_id, {
            "type": "stage_complete",
            "stage": "eligibility",
            "count": state.get("prisma_stats", {}).get("eligible", 0),
        })
    except Exception as e:
        await _emit_to(session_id, {"type": "error", "agent": "EligibilityAgent", "message": str(e)})


async def _run_inclusion(state: ReviewState, session_id: str):
    async def emit(event: dict):
        await _emit_to(session_id, event)
    try:
        result = await extraction_agent(state, emit)
        state.update(result)
        result2 = await writer_agent(state, emit)
        state.update(result2)
        _session_states[session_id] = state
        await _notify_nestjs(session_id, state)
        await _emit_to(session_id, {
            "type": "pipeline_done",
            "session_id": session_id,
            "report_preview": (state.get("review_report") or "")[:200],
        })
    except Exception as e:
        await _emit_to(session_id, {"type": "error", "agent": "Pipeline", "message": str(e)})
        await _emit_to(session_id, {"type": "pipeline_done", "session_id": session_id, "report_preview": ""})


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}


@app.post("/pipeline/start", response_model=PipelineResponse)
async def start_pipeline(body: PipelineRequest):
    """식별(Identification) 단계만 실행 — 검색 결과 반환 후 대기."""
    session_id = body.session_id
    _get_or_create_queue(session_id)

    state: ReviewState = {
        "session_id": session_id,
        "query": body.query,
        "search_terms": body.search_terms,
        "inclusion_criteria": body.inclusion_criteria,
        "exclusion_criteria": body.exclusion_criteria,
        "identified_papers": [],
        "screened_papers": [],
        "eligible_papers": [],
        "included_papers": [],
        "prisma_stats": {"identified": 0, "screened": 0, "eligible": 0, "included": 0},
        "review_report": None,
        "logs": [],
        "status": "running",
        "error": None,
    }
    _session_states[session_id] = state

    asyncio.create_task(_run_search(state, session_id))
    return PipelineResponse(session_id=session_id, status="started")


@app.post("/pipeline/screening", response_model=PipelineResponse)
async def run_screening(body: StageRequest):
    """선별(Screening) 단계 실행 — 사용자 기준 적용."""
    session_id = body.session_id
    state = _session_states.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    if body.criteria:
        state["inclusion_criteria"] = body.criteria

    asyncio.create_task(_run_screening(state, session_id))
    return PipelineResponse(session_id=session_id, status="screening")


@app.post("/pipeline/eligibility", response_model=PipelineResponse)
async def run_eligibility(body: StageRequest):
    """적격성(Eligibility) 단계 실행 — 사용자 기준 적용."""
    session_id = body.session_id
    state = _session_states.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    if body.criteria:
        state["inclusion_criteria"] = body.criteria

    asyncio.create_task(_run_eligibility(state, session_id))
    return PipelineResponse(session_id=session_id, status="eligibility")


@app.post("/pipeline/inclusion", response_model=PipelineResponse)
async def run_inclusion(body: StageRequest):
    """포함(Inclusion) + 리포트 작성 단계 실행."""
    session_id = body.session_id
    state = _session_states.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    if body.criteria:
        state["inclusion_criteria"] = body.criteria

    asyncio.create_task(_run_inclusion(state, session_id))
    return PipelineResponse(session_id=session_id, status="inclusion")


@app.get("/stream/{session_id}")
async def stream_events(session_id: str):
    """Frontend SSE 구독 엔드포인트."""
    queue = _get_or_create_queue(session_id)

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
                yield {"data": json.dumps(event, ensure_ascii=False)}
                if event.get("type") == "pipeline_done":
                    break
            except asyncio.TimeoutError:
                yield {"data": json.dumps({"type": "heartbeat"})}

    return EventSourceResponse(event_generator())


@app.get("/sessions/{session_id}/state")
async def get_session_state(session_id: str):
    state = _session_states.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found or still running")
    return state
