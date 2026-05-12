"""Semantic Scholar Academic Graph API search source.

Free API — no key required for basic use.
Returns real abstracts + open access PDF links + citation counts.
Docs: https://api.semanticscholar.org/api-docs/
"""

import time
import httpx

BASE = "https://api.semanticscholar.org/graph/v1"
FIELDS = "title,abstract,authors,year,venue,openAccessPdf,externalIds,citationCount"
HEADERS = {"User-Agent": "GachonScholar/1.0 (systematic review)"}
PAGE_SIZE = 100  # Semantic Scholar max per request


def _build_url(paper: dict) -> str | None:
    """Prefer open access PDF, then DOI, then S2 page."""
    oa = paper.get("openAccessPdf")
    if oa and oa.get("url"):
        return oa["url"]
    ext = paper.get("externalIds") or {}
    doi = ext.get("DOI")
    if doi:
        return f"https://doi.org/{doi}"
    paper_id = paper.get("paperId")
    if paper_id:
        return f"https://www.semanticscholar.org/paper/{paper_id}"
    return None


def search_semantic_scholar(query: str, max_results: int = 200) -> tuple[list[dict], int]:
    """
    Search Semantic Scholar and return (papers, total_count).
    Paginates automatically up to max_results.
    """
    all_papers = []
    offset = 0
    total = None

    while len(all_papers) < max_results:
        limit = min(PAGE_SIZE, max_results - len(all_papers))
        for attempt in range(3):
            resp = httpx.get(
                f"{BASE}/paper/search",
                params={
                    "query": query,
                    "fields": FIELDS,
                    "limit": limit,
                    "offset": offset,
                },
                headers=HEADERS,
                timeout=30,
            )
            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            resp.raise_for_status()
            break
        else:
            raise httpx.HTTPStatusError("429 after retries", request=resp.request, response=resp)
        data = resp.json()

        if total is None:
            total = data.get("total", 0)

        items = data.get("data", [])
        if not items:
            break

        for p in items:
            title = (p.get("title") or "").strip()
            if not title:
                continue
            authors = [a.get("name", "") for a in (p.get("authors") or [])[:10]]
            oa = p.get("openAccessPdf") or {}
            oa_pdf_url = oa.get("url") if oa else None
            ext = p.get("externalIds") or {}
            doi = ext.get("DOI")
            doi_url = f"https://doi.org/{doi}" if doi else None
            arxiv_id = ext.get("ArXiv")
            arxiv_url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else None
            pmc_id = ext.get("PubMedCentral")
            pmc_url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{pmc_id}/" if pmc_id else None

            all_papers.append({
                "title": title,
                "abstract": p.get("abstract") or "",
                "authors": authors,
                "year": p.get("year"),
                "url": oa_pdf_url or arxiv_url or pmc_url or doi_url or _build_url(p),
                "open_access_pdf": oa_pdf_url,
                "arxiv_url": arxiv_url,
                "pmc_url": pmc_url,
                "doi_url": doi_url,
                "venue": p.get("venue") or "",
                "source": "Semantic Scholar",
                "citation_count": p.get("citationCount", 0),
            })

        if len(items) < limit:
            break
        offset += limit

    return all_papers, total or len(all_papers)
