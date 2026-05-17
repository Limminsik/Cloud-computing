"""PubMed (NCBI E-utilities) search source.

Free API — no key required (rate limit: 3 req/s without key, 10/s with NCBI key).
Returns real abstracts unlike SerpAPI snippets.
"""

import httpx
import asyncio
import xml.etree.ElementTree as ET
from typing import Optional

from config import CONTACT_EMAIL

BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
HEADERS = {"User-Agent": f"GachonScholar/1.0 (systematic review; {CONTACT_EMAIL})"}
PAGE_SIZE = 100  # PubMed allows up to 10000 but 100 per fetch is safe


def _parse_abstract(article_el) -> str:
    """Extract abstract text from PubMed XML ArticleSet."""
    parts = []
    for ab in article_el.findall(".//AbstractText"):
        label = ab.get("Label")
        text = (ab.text or "").strip()
        if label:
            parts.append(f"{label}: {text}")
        elif text:
            parts.append(text)
    return " ".join(parts)


def _parse_authors(article_el) -> list[str]:
    authors = []
    for author in article_el.findall(".//Author"):
        last = author.findtext("LastName") or ""
        fore = author.findtext("ForeName") or author.findtext("Initials") or ""
        name = f"{last} {fore}".strip()
        if name:
            authors.append(name)
    return authors


def _pubmed_url(pmid: str) -> str:
    return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"


def search_pubmed(query: str, max_results: int = 200) -> tuple[list[dict], int]:
    """
    Search PubMed and return (papers, total_count).
    papers: list of dicts with title/abstract/authors/year/url/venue
    """
    # Step 1: esearch — get PMIDs and total count
    search_resp = httpx.get(
        f"{BASE}/esearch.fcgi",
        params={
            "db": "pubmed",
            "term": query,
            "retmax": max_results,
            "retmode": "json",
            "sort": "relevance",
        },
        headers=HEADERS,
        timeout=20,
    )
    search_resp.raise_for_status()
    search_data = search_resp.json()
    esearch = search_data.get("esearchresult", {})
    total_count = int(esearch.get("count", 0))
    pmids = esearch.get("idlist", [])

    if not pmids:
        return [], total_count

    # Step 2: efetch — get full records with abstracts
    fetch_resp = httpx.get(
        f"{BASE}/efetch.fcgi",
        params={
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
            "rettype": "abstract",
        },
        headers=HEADERS,
        timeout=30,
    )
    fetch_resp.raise_for_status()

    root = ET.fromstring(fetch_resp.content)
    papers = []

    for article in root.findall(".//PubmedArticle"):
        medline = article.find(".//MedlineCitation")
        if medline is None:
            continue
        art = medline.find(".//Article")
        if art is None:
            continue

        title = art.findtext(".//ArticleTitle") or ""
        abstract = _parse_abstract(art)
        authors = _parse_authors(art)

        # Year
        year = None
        pub_date = art.find(".//Journal/JournalIssue/PubDate")
        if pub_date is not None:
            year_text = pub_date.findtext("Year")
            if year_text and year_text.isdigit():
                year = int(year_text)

        # Journal
        journal = art.findtext(".//Journal/Title") or ""

        # PMID
        pmid_el = medline.find("PMID")
        pmid = pmid_el.text if pmid_el is not None else ""
        url = _pubmed_url(pmid) if pmid else None

        # PMC ID / DOI — only from PubmedData > ArticleIdList (not from reference lists)
        pmc_url = None
        doi_url = None
        pubmed_data = article.find("PubmedData")
        id_list = pubmed_data.find("ArticleIdList") if pubmed_data is not None else None
        if id_list is not None:
            for art_id in id_list.findall("ArticleId"):
                id_type = art_id.get("IdType", "")
                if id_type == "pmc" and art_id.text:
                    pmc_id = art_id.text.strip()
                    if not pmc_id.startswith("PMC"):
                        pmc_id = f"PMC{pmc_id}"
                    pmc_url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmc_id}/"
                elif id_type == "doi" and art_id.text:
                    doi_url = f"https://doi.org/{art_id.text.strip()}"

        if title:
            papers.append({
                "title": title.strip(),
                "abstract": abstract,
                "authors": authors,
                "year": year,
                "url": pmc_url or url,   # prefer PMC (free full text) over abstract page
                "pmc_url": pmc_url,
                "doi_url": doi_url,
                "pubmed_url": url,
                "venue": journal,
                "source": "PubMed",
            })

    return papers, total_count
