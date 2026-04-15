from typing import TypedDict, Annotated, List, Optional, Dict, Any
import operator


class PaperInfo(TypedDict):
    title: str
    authors: List[str]
    year: Optional[int]
    url: Optional[str]
    abstract: Optional[str]
    venue: Optional[str]
    prisma_stage: str          # identified | screened | eligible | included
    decision: Optional[str]   # INCLUDE | EXCLUDE
    reason: Optional[str]
    extracted_data: Optional[Dict[str, Any]]


class PrismaStats(TypedDict):
    identified: int
    screened: int
    eligible: int
    included: int


class ReviewState(TypedDict):
    session_id: str
    query: str
    search_terms: List[str]
    inclusion_criteria: List[str]
    exclusion_criteria: List[str]

    # Papers at each PRISMA stage
    identified_papers: List[PaperInfo]
    screened_papers: List[PaperInfo]
    eligible_papers: List[PaperInfo]
    included_papers: List[PaperInfo]

    prisma_stats: PrismaStats

    # Final output
    review_report: Optional[str]

    # Agent logs (accumulated)
    logs: Annotated[List[str], operator.add]

    # Pipeline status
    status: str   # running | done | error
    error: Optional[str]
