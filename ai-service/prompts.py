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

WRITER_PROMPT = """당신은 PRISMA 2020 방법론에 정통한 체계적 문헌고찰 전문가입니다.
아래 정보를 바탕으로 학술적으로 완성도 높은 한국어 체계적 문헌고찰 보고서를 작성하세요.

## 연구 정보
- 연구 목적: {query}
- 키워드: {keywords}
- 포함 기준: {inclusion_criteria}
- 제외 기준: {exclusion_criteria}

## PRISMA 선별 현황
- 식별 논문: {identified}건
- 심사 통과: {screened}건
- 적격성 평가 후 최종 포함: {included}건

## 포함된 논문 데이터 (PICO 분석 포함)
{papers_data}

---

## 작성 지침

**문체**: 학술 논문 스타일, 3인칭, 수동태 활용
**언어**: 전문 한국어 (용어는 영문 병기 가능)
**분량**: 최소 2,000자 이상

## 보고서 구성

### 1. 요약 (Abstract)
- 배경(Background), 목적(Objective), 방법(Methods), 결과(Results), 결론(Conclusions)을 각각 단락으로 구분하여 작성

### 2. 서론 (Introduction)
- 연구 주제의 학문적·실무적 중요성
- 기존 연구의 현황과 한계
- 본 체계적 문헌고찰의 목적과 연구 질문

### 3. 연구 방법 (Methods)
- 검색 전략: 활용한 데이터베이스(PubMed, Google Scholar, Semantic Scholar), 핵심 검색어, 검색 기간
- 선별 기준: 포함/제외 기준 명시
- PRISMA 선별 과정: 식별 → 심사 → 적격성 평가 → 최종 포함 흐름 기술

### 4. 결과 (Results)
- 포함 논문 개요 (논문 수, 연구 유형 분포, 발행 연도 범위)
- 각 논문의 PICO 요소를 통합하여 주제별로 묶어 서술
  예: "대상 집단", "중재 방법", "비교군", "결과 지표" 별로 공통점·차이점 정리
- 핵심 연구 결과 종합 및 비교
- 연구 간 일관성 및 불일치 사항

### 5. 고찰 (Discussion)
- 연구 결과의 의의와 해석
- 연구 목적에 비추어 본 주요 발견
- 포함 논문들의 한계점 종합
- 본 문헌고찰 자체의 제한점 (전문 미확보 논문 비율 등)

### 6. 결론 (Conclusion)
- 연구 질문에 대한 핵심 답변
- 실무적·정책적 시사점
- 향후 연구 방향 제언

### 7. 참고문헌 (References)
- 포함된 모든 논문을 APA 형식으로 나열
  형식: 저자(연도). 제목. 저널명.

---
위 구성에 따라 보고서를 작성하세요. 논문 제목을 인용할 때는 반드시 해당 논문의 연구 결과나 PICO 정보를 구체적으로 언급하세요.
"""
