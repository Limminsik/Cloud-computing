import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY", "")
NESTJS_CALLBACK_URL = os.getenv("NESTJS_CALLBACK_URL", "http://localhost:4000")
CONTACT_EMAIL = os.getenv("CONTACT_EMAIL", "your_email@example.com")

SEARCH_MODEL = "gemini-2.5-flash-lite"
REVIEW_MODEL = "claude-sonnet-4-6"

PAPERS_DIR = Path(__file__).parent / "papers"
PAPERS_DIR.mkdir(exist_ok=True)

# MAX_PAPERS is no longer used — search_agent fetches all available results (up to ~1000/query)
