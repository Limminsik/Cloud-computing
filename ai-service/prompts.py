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

WRITER_PROMPT = """당신은 체계적 문헌 분석 전문가입니다.
아래 데이터를 바탕으로 연구 주제에 대한 Systematic Literature Review 보고서를 한국어로 작성하세요.

## 연구 주제
{query}

## 키워드
{keywords}

## 문헌 선별 결과
총 식별 {identified}건 → 심사 통과 {screened}건 → 최종 분석 대상 {included}건

## 분석 대상 논문 데이터
{papers_data}

---

## 작성 규칙 (반드시 준수)

1. **보고서 첫 줄은 반드시 `## 문헌 분석 현황`으로 시작하세요.** 제목·서문·인사말 절대 금지.
2. "리서치 인텔리전스", "본 보고서는" 같은 표현을 사용하지 마세요.
3. 논문을 개별 나열하지 마세요. 여러 논문의 발견을 주제별로 통합하여 서술합니다.
4. 각 섹션 제목은 `##` 헤더로, 소제목은 `###`으로 표시하세요.
5. 한국어로 작성하되 전문 용어는 영문 병기 가능합니다.

---

## 문헌 분석 현황

최종 분석 대상 {included}건의 특성을 간략히 기술합니다.
- 연구 유형 분포 (Original Article / Review / 기타)
- 발행 연도 범위 및 주요 출처

## 핵심 요약

연구 주제 **{query}** 에 대해 이번 문헌 분석에서 도출된 가장 중요한 발견 3~5가지를 불릿으로 서술합니다.
독자가 이 섹션만 읽어도 전체 내용을 파악할 수 있어야 합니다.

## 연구 배경 및 목적

연구 주제 **{query}** 가 왜 중요한지, 기존 연구의 흐름과 공백이 무엇인지 2~3문단으로 기술합니다.

## 주요 연구 동향 및 발견

3~5개의 테마로 구성합니다. 각 테마는 `###` 소제목으로 시작하며,
여러 논문의 발견을 통합하여 하나의 흐름으로 서술합니다.

- 연구들이 공통으로 보여주는 패턴과 일치점
- 연구 간 상충되는 견해나 논쟁
- 구체적 수치나 근거가 있으면 반드시 포함

## 핵심 시사점

**연구 주제 {query} 자체**에서 도출되는 실무·정책·연구 시사점 3~5가지를 서술합니다.
문헌 검색 방법이나 본 분석의 한계가 아니라, **이 연구 영역이 현장에 주는 메시지**를 담으세요.
"~가 필요하다", "~를 고려해야 한다" 형태의 실행 지향적 문장으로 작성합니다.

## 연구 주제의 한계 및 향후 방향

**연구 주제 {query} 자체**의 학문적·실무적 한계와 미해결 과제를 다룹니다.
(검색 방법이나 논문 수집의 한계가 아닙니다.)
- 현재 연구가 아직 충분히 다루지 못한 영역 또는 논쟁 중인 문제
- 향후 연구가 집중해야 할 방향과 필요한 접근법

## 참고문헌

분석에 포함된 논문 목록
형식: 저자 (연도). 제목. 저널명.
"""
