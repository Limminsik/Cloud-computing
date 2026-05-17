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
    # Full-text access URLs (preserved through all pipeline stages)
    pmc_url: Optional[str]
    doi_url: Optional[str]
    open_access_pdf: Optional[str]
    arxiv_url: Optional[str]
    pubmed_url: Optional[str]


class PrismaStats(TypedDict, total=False):
    identified: int
    fetched: int        # API로 실제 수집된 건수 (중복 제거 후)
    duplicates: int     # 수집된 것 중 제목 중복으로 제거된 건수
    screened: int
    eligible: int
    included: int


class ConceptGroup(TypedDict, total=False):
    concept: str
    synonyms: List[str]

class GeneratedSearchTerms(TypedDict, total=False):
    domain: str                   # 연구 도메인 (e.g. "Biomedical Signal Processing")
    reasoning: str                # AI 추론 요약
    concept_groups: List[ConceptGroup]  # 개념별 동의어 그룹
    pico: Dict[str, str]          # population, intervention, comparison, outcome
    mesh_terms: List[str]
    keywords: List[str]
    boolean_query: str            # 최종 DB 검색에 사용될 Boolean 쿼리


class ReviewState(TypedDict):
    session_id: str
    research_question: str        # 사용자가 입력한 자연어 연구 목적
    keywords: List[str]           # 사용자가 직접 입력한 연구 키워드
    search_terms: List[str]       # (미사용) 하위 호환 보존
    generated_search_terms: Optional[GeneratedSearchTerms]  # LLM이 생성한 Search Terms
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
