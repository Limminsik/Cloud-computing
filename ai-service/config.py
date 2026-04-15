import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
NESTJS_CALLBACK_URL = os.getenv("NESTJS_CALLBACK_URL", "http://localhost:4000")

SEARCH_MODEL = "gemini-2.0-flash"
REVIEW_MODEL = "claude-sonnet-4-6"

PAPERS_DIR = Path(__file__).parent / "papers"
PAPERS_DIR.mkdir(exist_ok=True)

MAX_PAPERS = int(os.getenv("MAX_PAPERS", "50"))
