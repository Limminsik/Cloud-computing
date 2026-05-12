SEARCH_TERMS_PROMPT = """You are a systematic literature review expert with deep academic domain knowledge.

Research Question: {research_question}
User Keywords: {keywords}

Perform a structured 5-step analysis, then return a single JSON object.

STEP 1 — DOMAIN ANALYSIS
Identify the primary research domain. Write 2-3 sentences of reasoning that explain:
- What this research is fundamentally about
- Why it matters and what gap it addresses
- What types of studies would best answer it

STEP 2 — CONCEPT EXPANSION
For each core concept, list all synonyms and variant terms found in peer-reviewed literature (abbreviations, full forms, related technical terms). Be thorough here — this is for exploration only, not for the final query.

STEP 3 — PICO MAPPING
Map to PICO (Population, Intervention, Comparison, Outcome). If a dimension is not applicable, use "N/A".

STEP 4 — MeSH TERMS
Select official MeSH (Medical Subject Headings) terms for PubMed. Prefer MeSH over free-text whenever possible.

STEP 5 — FOCUSED BOOLEAN QUERY
Using the concept expansion and MeSH terms, construct a precise and effective Boolean query. Apply these rules:
- Select only 2-4 concept blocks that are ESSENTIAL to define the research focus (not every concept needs to be AND-ed)
- Within each block: prefer MeSH terms first, then add free-text synonyms only for terms NOT covered by MeSH
- Keep each OR block to the 3-5 most discriminating terms — avoid synonym overload
- Do NOT include every expanded synonym; choose terms that maximize precision while retaining adequate sensitivity
- Format: (term1[MeSH] OR "free text alt") AND (term2[MeSH] OR "free text alt")
- Explain in the reasoning field which concept blocks you chose as AND anchors and why

Return ONLY this JSON object (no markdown, no explanation):
{{
  "domain": "<primary research domain in one phrase>",
  "reasoning": "<2-3 sentences: what the research is about, which concept blocks anchor the query and why>",
  "concept_groups": [
    {{"concept": "<core concept>", "synonyms": ["<term1>", "<term2>", "..."]}}
  ],
  "pico": {{"population": "...", "intervention": "...", "comparison": "...", "outcome": "..."}},
  "mesh_terms": ["<MeSH term 1>", "<MeSH term 2>"],
  "boolean_query": "(<MeSH term>[MeSH] OR \\"free text\\") AND (<MeSH term>[MeSH] OR \\"free text\\")"
}}"""


SCREENING_PROMPT = """You are a systematic review screening expert applying PRISMA guidelines.

Research Query: {query}

Inclusion Criteria:
{inclusion_criteria}

Exclusion Criteria:
{exclusion_criteria}

Review each paper below and decide INCLUDE or EXCLUDE based on title and abstract screening.

Papers to screen (JSON):
{papers}

For each paper, respond with a JSON array containing objects with:
- title: (exact title from input)
- decision: "INCLUDE" or "EXCLUDE"
- reason: Brief one-sentence reason

Return ONLY valid JSON array.
"""

ELIGIBILITY_PROMPT = """You are a systematic review eligibility assessor applying full PRISMA criteria.

Research Query: {query}

Strict Inclusion Criteria:
{inclusion_criteria}

Strict Exclusion Criteria:
{exclusion_criteria}

You are performing full-text eligibility assessment on pre-screened papers.
Apply stricter criteria than initial screening.

Papers for eligibility assessment (JSON):
{papers}

For each paper, respond with a JSON array containing:
- title: (exact title from input)
- decision: "INCLUDE" or "EXCLUDE"
- reason: Detailed reason (1-2 sentences) citing which criterion was applied

Return ONLY valid JSON array.
"""

EXTRACTION_PROMPT = """You are a data extraction specialist for systematic literature reviews.

Research Query: {query}

Extract structured data from each included paper. For each paper, extract:
- study_design: Type of study (RCT, observational, survey, etc.)
- sample_size: Number of participants/samples if mentioned
- key_findings: 2-3 main findings as a list
- methods: Key methodology used
- limitations: Main limitations noted
- year: Publication year
- relevance_score: 1-10 score for relevance to the query

Papers (JSON):
{papers}

Respond with a JSON array. For each paper add an "extracted_data" field containing the above.
Return ONLY valid JSON array.
"""

WRITER_PROMPT = """You are an expert academic writer specializing in systematic literature reviews.

Write a comprehensive systematic literature review based on the PRISMA methodology.

Research Query: {query}

PRISMA Flow Summary:
- Papers Identified: {identified}
- After Screening: {screened}
- After Eligibility: {eligible}
- Final Included: {included}

Included Papers with Extracted Data:
{papers_data}

Write a full systematic literature review with these sections:
1. **Abstract** (structured: Background, Methods, Results, Conclusions)
2. **Introduction** (context, rationale, objectives)
3. **Methods** (search strategy, inclusion/exclusion criteria, PRISMA flow)
4. **Results** (synthesis of findings, organized by themes)
5. **Discussion** (interpretation, limitations, implications)
6. **Conclusion**
7. **References** (list all included papers)

Use academic tone. Be specific, cite paper titles where relevant. Minimum 1500 words.
"""
