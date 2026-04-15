"""FastAPI AI Microservice — PRISMA Systematic Review Pipeline with SSE streaming."""

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import NESTJS_CALLBACK_URL
from state import ReviewState
from graph.pipeline import run_pipeline


# In-memory store: session_id → asyncio.Queue for SSE events
_event_queues: dict[str, asyncio.Queue] = {}
# In-memory store: session_id → final state (after completion)
_session_states: dict[str, ReviewState] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Cleanup queues on shutdown
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


# ── Request / Response Models ──────────────────────────────────────────────────

class PipelineRequest(BaseModel):
    session_id: str
    query: str
    search_terms: list[str]
    inclusion_criteria: list[str]
    exclusion_criteria: list[str]


class PipelineResponse(BaseModel):
    session_id: str
    status: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_queue(session_id: str) -> asyncio.Queue:
    if session_id not in _event_queues:
        _event_queues[session_id] = asyncio.Queue()
    return _event_queues[session_id]


async def _run_and_notify(state: ReviewState, session_id: str):
    """Run the pipeline, emitting events into the session queue, then call NestJS."""
    queue = _get_or_create_queue(session_id)

    async def emit(event: dict):
        await queue.put(event)

    try:
        final_state = await run_pipeline(state, emit)
        _session_states[session_id] = final_state
        # Notify NestJS backend with final results
        await _notify_nestjs(session_id, final_state)
    except Exception as e:
        error_event = {"type": "error", "agent": "Pipeline", "message": str(e)}
        await queue.put(error_event)
        await queue.put({"type": "pipeline_done", "session_id": session_id, "report_preview": ""})


async def _notify_nestjs(session_id: str, final_state: ReviewState):
    """POST final results back to NestJS for DB persistence."""
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
        # Non-fatal: NestJS may not be available in standalone mode
        pass


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}


@app.post("/pipeline/start", response_model=PipelineResponse)
async def start_pipeline(body: PipelineRequest):
    """NestJS calls this to kick off the PRISMA pipeline for a session."""
    session_id = body.session_id
    _get_or_create_queue(session_id)  # Pre-create queue so SSE can subscribe immediately

    initial_state: ReviewState = {
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

    # Run pipeline in background task so this endpoint returns immediately
    asyncio.create_task(_run_and_notify(initial_state, session_id))

    return PipelineResponse(session_id=session_id, status="started")


@app.get("/stream/{session_id}")
async def stream_events(session_id: str):
    """Frontend subscribes here for real-time SSE events from the pipeline."""
    queue = _get_or_create_queue(session_id)

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
                yield {"data": json.dumps(event, ensure_ascii=False)}
                if event.get("type") == "pipeline_done":
                    break
            except asyncio.TimeoutError:
                # Heartbeat to keep connection alive
                yield {"data": json.dumps({"type": "heartbeat"})}

    return EventSourceResponse(event_generator())


@app.get("/sessions/{session_id}/state")
async def get_session_state(session_id: str):
    """Return final state after pipeline completion."""
    state = _session_states.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found or still running")
    return state
