import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Secrets (from .env) ───────────────────────────────────────────────────────
GOOGLE_API_KEY      = os.getenv("GOOGLE_API_KEY", "")
ANTHROPIC_API_KEY   = os.getenv("ANTHROPIC_API_KEY", "")
SERPAPI_API_KEY     = os.getenv("SERPAPI_API_KEY", "")
NESTJS_CALLBACK_URL = os.getenv("NESTJS_CALLBACK_URL", "http://localhost:4000")
CONTACT_EMAIL       = os.getenv("CONTACT_EMAIL", "your_email@example.com")

# ── Central configuration (configuration.json) ───────────────────────────────
_ROOT = Path(__file__).parent.parent
_cfg_path = _ROOT / "configuration.json"

def _load() -> dict:
    if _cfg_path.exists():
        with open(_cfg_path, encoding="utf-8") as f:
            return json.load(f)
    return {}

_cfg = _load()

# Agent models
_agents      = _cfg.get("agents", {})
SEARCH_MODEL = _agents.get("identification", "gemini-2.5-flash-lite")
REVIEW_MODEL = _agents.get("eligibility",    "claude-sonnet-4-6")
WRITER_MODEL = _agents.get("writer",         "claude-opus-4-7")

# Search
_search = _cfg.get("search", {})
MAX_RESULTS_PER_SOURCE = _search.get("max_results_per_source", 200)
SCHOLAR_PAGE_SIZE      = _search.get("scholar_page_size", 10)
SCHOLAR_MAX_PAGES      = _search.get("scholar_max_pages", 5)

# Pipeline
_pipeline = _cfg.get("pipeline", {})
SCREENING_BATCH_SIZE     = _pipeline.get("screening_batch_size", 50)
ELIGIBILITY_CONCURRENT   = _pipeline.get("eligibility_concurrent", 5)
ELIGIBILITY_MAX_TOKENS   = _pipeline.get("eligibility_max_tokens", 1024)

# Features
_features = _cfg.get("features", {})
FETCH_FULLTEXT          = _features.get("fetch_fulltext", True)
AUTO_GENERATE_CRITERIA  = _features.get("auto_generate_criteria", True)

# Misc
PAPERS_DIR = Path(__file__).parent / "papers"
PAPERS_DIR.mkdir(exist_ok=True)
