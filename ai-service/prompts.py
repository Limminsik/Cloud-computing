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

연구 목적 "{query}", 키워드 "{keywords}"로 정의된 연구 질문에 비추어,
분석된 논문들이 공통으로 제시하는 실무·정책·연구적 시사점을 4~6가지로 서술합니다.

작성 기준:
- 각 시사점은 반드시 분석 논문의 구체적 발견에 근거해야 합니다 (막연한 일반론 금지)
- 연구 목적 "{query}"와 직접적으로 연결된 현장 적용 가능한 제언을 담으세요
- "~가 필요하다", "~를 우선적으로 도입해야 한다", "~에 초점을 맞춰야 한다" 형태로 작성
- 특정 이해관계자(실무자, 정책 입안자, 연구자)를 명시하면 더욱 효과적입니다

## 연구 주제의 한계 및 향후 연구 방향

연구 목적 "{query}"를 기준으로 현재까지의 연구가 가진 공백과 미해결 과제를 면밀히 분석합니다.
(본 문헌 검색 방법의 한계가 아니라, 이 연구 영역 자체의 학문적 한계를 다룹니다.)

**한계점** — 다음 관점에서 깊이 검토하세요:
- 분석된 논문들이 공통적으로 전제하거나 검증하지 않은 가정
- 연구 대상(Population), 맥락(Context), 측정 방법에서 나타나는 편향 또는 제약
- 특정 집단·환경·지역에서 검증이 부족한 영역
- 연구들 간 상충되는 결과가 해소되지 않은 논쟁 지점

**향후 연구 방향** — 연구 목적 "{query}"를 더 깊이 탐구하기 위해:
- 현재 방법론의 한계를 극복할 새로운 연구 설계 제안
- 충분히 다뤄지지 않은 연구 집단·환경·변수에 대한 탐색 필요성
- 실무 현장과 학문 연구 간의 격차를 좁히기 위한 구체적 연구 과제
- 기술·사회·정책 변화에 따라 새롭게 부상하는 연구 질문

## 참고문헌

분석에 포함된 논문 목록
형식: 저자 (연도). 제목. 저널명.
"""
