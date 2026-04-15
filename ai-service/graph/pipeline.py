"""LangGraph pipeline: 5-node PRISMA systematic review workflow."""

import asyncio
from typing import Any, Callable, Coroutine

from langgraph.graph import StateGraph, END

from state import ReviewState
from agents.search_agent import search_agent
from agents.screening_agent import screening_agent
from agents.eligibility_agent import eligibility_agent
from agents.extraction_agent import extraction_agent
from agents.writer_agent import writer_agent


def build_pipeline(emit: Callable[[dict], Coroutine[Any, Any, None]]):
    """Build and compile the LangGraph StateGraph.

    Each node wraps an async agent function and passes the shared `emit`
    callable for SSE event streaming.
    """

    def make_node(agent_fn):
        async def node(state: ReviewState) -> dict:
            return await agent_fn(state, emit)
        return node

    graph = StateGraph(ReviewState)

    graph.add_node("search", make_node(search_agent))
    graph.add_node("screening", make_node(screening_agent))
    graph.add_node("eligibility", make_node(eligibility_agent))
    graph.add_node("extraction", make_node(extraction_agent))
    graph.add_node("writer", make_node(writer_agent))

    graph.set_entry_point("search")
    graph.add_edge("search", "screening")
    graph.add_edge("screening", "eligibility")
    graph.add_edge("eligibility", "extraction")
    graph.add_edge("extraction", "writer")
    graph.add_edge("writer", END)

    return graph.compile()


async def run_pipeline(
    initial_state: ReviewState,
    emit: Callable[[dict], Coroutine[Any, Any, None]],
) -> ReviewState:
    """Execute the full PRISMA pipeline and return final state."""
    pipeline = build_pipeline(emit)
    final_state = await pipeline.ainvoke(initial_state)
    return final_state
