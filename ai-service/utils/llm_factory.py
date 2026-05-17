"""LLM factory — returns the right LangChain chat model from a model name string.

Supported prefixes:
  gemini-*   → ChatGoogleGenerativeAI  (requires GOOGLE_API_KEY)
  claude-*   → ChatAnthropic           (requires ANTHROPIC_API_KEY)
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_anthropic import ChatAnthropic

from config import GOOGLE_API_KEY, ANTHROPIC_API_KEY


def get_llm(model: str, temperature: float = 0, max_tokens: int | None = None):
    """Return a LangChain chat model instance for the given model name."""
    if model.startswith("gemini"):
        kwargs = dict(model=model, google_api_key=GOOGLE_API_KEY, temperature=temperature)
        if max_tokens:
            kwargs["max_output_tokens"] = max_tokens
        return ChatGoogleGenerativeAI(**kwargs)

    if model.startswith("claude"):
        kwargs = dict(model=model, anthropic_api_key=ANTHROPIC_API_KEY, temperature=temperature)
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        return ChatAnthropic(**kwargs)

    raise ValueError(
        f"Unknown model '{model}'. Model name must start with 'gemini' or 'claude'."
    )
