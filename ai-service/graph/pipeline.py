"""LangGraph pipeline — PRISMA systematic review with human-in-the-loop.

Graph structure:
  search → [interrupt] → screening → [interrupt] → eligibility → [interrupt] → extraction → writer → END

Each stage pauses BEFORE execution so the user can supply criteria via the UI.
State is persisted by MemorySaver (keyed by session_id as thread_id).
SSE emit functions are stored in a session registry (_emitters) outside the graph.
"""

from typing import Any, Callable, Coroutine
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from state import ReviewState
from agents.search_agent import search_agent
from agents.screening_agent import screening_agent
from agents.eligibility_agent import eligibility_agent
from agents.writer_agent import writer_agent

# ── Emit registry ─────────────────────────────────────────────────────────────
# Maps session_id → SSE emit function.
# Nodes look up their emitter here instead of receiving it as an argument,
# because LangGraph nodes only receive the state dict.
_emitters: dict[str, Callable[[dict], Coroutine[Any, Any, None]]] = {}


def register_emitter(session_id: str, emit: Callable):
    _emitters[session_id] = emit


def unregister_emitter(session_id: str):
    _emitters.pop(session_id, None)


async def _noop_emit(event: dict):
    pass


def _get_emit(session_id: str) -> Callable:
    return _emitters.get(session_id, _noop_emit)


# ── Node wrappers ──────────────────────────────────────────────────────────────

async def search_node(state: ReviewState) -> dict:
    emit = _get_emit(state["session_id"])
    return await search_agent(state, emit)


async def screening_node(state: ReviewState) -> dict:
    emit = _get_emit(state["session_id"])
    return await screening_agent(state, emit)


async def eligibility_node(state: ReviewState) -> dict:
    emit = _get_emit(state["session_id"])
    return await eligibility_agent(state, emit)


async def writer_node(state: ReviewState) -> dict:
    emit = _get_emit(state["session_id"])
    return await writer_agent(state, emit)


# ── Graph definition ───────────────────────────────────────────────────────────

def build_graph():
    """Build and compile the PRISMA LangGraph pipeline.

    interrupt_before pauses execution BEFORE each user-driven stage so that
    the frontend can collect criteria and resume via /pipeline/<stage>.
    """
    g = StateGraph(ReviewState)

    g.add_node("search",      search_node)
    g.add_node("screening",   screening_node)
    g.add_node("eligibility", eligibility_node)
    g.add_node("writer",      writer_node)

    g.set_entry_point("search")
    g.add_edge("search",      "screening")
    g.add_edge("screening",   "eligibility")
    g.add_edge("eligibility", "writer")
    g.add_edge("writer",      END)

    checkpointer = MemorySaver()

    return g.compile(
        checkpointer=checkpointer,
        interrupt_before=["screening", "eligibility"],
    )


# Singleton — compiled once at import time
prisma_graph = build_graph()


def get_config(session_id: str) -> dict:
    """LangGraph thread config keyed by session_id."""
    return {"configurable": {"thread_id": session_id}}
