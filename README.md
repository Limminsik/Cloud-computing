<div align="center">

# [Gachon Scholar](https://github.com/Limminsik/gachonscholar)

**AI 멀티에이전트 기반 체계적 문헌 고찰 자동화 플랫폼**

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2-orange)](https://langchain-ai.github.io/langgraph/)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%204.6-blueviolet)](https://www.anthropic.com/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash-4285F4)](https://deepmind.google/technologies/gemini/)

</div>

---

## 소개

Gachon Scholar는 연구 주제를 입력하면 **PRISMA 2020** 방법론에 따라 논문 검색부터 최종 리뷰 보고서 작성까지 AI가 **완전 자동**으로 수행하는 Systematic Literature Review 플랫폼입니다.

연구자가 수 주에 걸쳐 수행하던 작업을 단 몇 분 안에 처리하며, 각 단계의 결과를 실시간으로 확인하고 최종 보고서를 PDF로 저장할 수 있습니다.

---

## 전체 파이프라인 (완전 자동)

```
연구 주제 입력
      ↓
Identification  (Gemini)
  · Research Question → PICO 분석 → MeSH Terms → Boolean Query 자동 생성
  · PubMed · Semantic Scholar · Google Scholar 병렬 검색 → 중복 제거
      ↓ 자동
Screening  (Gemini)
  · 제목·초록 기반 1차 선별
  · 포함/제외 기준 적용
      ↓ 자동
Full-text 확보
  · 가천대 중앙도서관 자동 로그인 → 검색 → 원문 확보 (Playwright)
  · PMC · arXiv · Unpaywall · 직접 PDF 다운로드 폴백 전략
  · 수동 PDF 업로드 지원 (업로드 기록 DB 영속 저장)
      ↓ 자동
Eligibility  (Claude Sonnet 4.6)
  · 전문 기반 PICO 분석 및 적격성 심층 평가
  · 포함 근거 · 핵심 결과 · 한계점 한국어 추출
      ↓ 자동
Writer  (Claude Sonnet 4.6)
  · Literature Review Report 자동 생성 (한국어)
  · 핵심 요약 · 연구 동향 · 시사점 · 한계 · 참고문헌
  · PDF 다운로드 (파일명: 연구주제_날짜)
```

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **완전 자동 파이프라인** | 검색 시작 후 보고서까지 버튼 클릭 없이 자동 진행 |
| **5단계 Search Terms 생성** | 도메인 분석 → 개념 확장 → PICO → MeSH → Boolean Query |
| **3개 DB 병렬 검색** | PubMed, Semantic Scholar, Google Scholar 동시 검색 |
| **기관 도서관 전문 확보** | 가천대 중앙도서관 Playwright 자동 로그인 + 원문 수집 |
| **PICO 구조화 분석** | 각 논문의 대상·중재·비교·결과 자동 추출 (한국어) |
| **Literature Review Report** | 주제별 통합 서술 · PDF 저장 (개별 논문 나열 금지 원칙) |
| **실시간 SSE 스트리밍** | 논문별 판정이 라이브로 화면에 표시 |
| **세션 완전 영속성** | 모든 단계 결과 DB 저장, 페이지 재방문 시 완전 복원 |
| **PRISMA Flow Diagram** | 식별 → 심사 → 적격성 → 포함 건수 실시간 추적 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 14, TypeScript, Tailwind CSS |
| 백엔드 | NestJS 10, Prisma ORM, PostgreSQL 16 |
| AI 파이프라인 | FastAPI, LangGraph StateGraph |
| Identification · Screening AI | Google Gemini 2.5 Flash |
| Eligibility · Writer AI | Anthropic Claude Sonnet 4.6 |
| 전문 확보 | Playwright (Chromium headless), pypdf, httpx |
| 논문 검색 소스 | PubMed E-utilities, Semantic Scholar API, SerpAPI (Google Scholar) |
| 실시간 통신 | Server-Sent Events (SSE) |
| 인프라 | Docker Compose |

---

## 프로젝트 구조

```
Cloud-computing/
├── configuration.json          중앙 설정 (모델·검색 파라미터·도서관 계정)
├── docker-compose.yml
├── frontend/                   Next.js 14 웹 앱
│   └── src/
│       ├── app/
│       │   ├── page.tsx               메인 검색 화면 (SearchForm)
│       │   └── results/[id]/page.tsx  결과 화면 (SSE 실시간)
│       └── components/
│           ├── SearchForm.tsx          연구 목적·키워드 입력
│           ├── Prisma2020Diagram.tsx   PRISMA Flow 사이드바
│           ├── IdentifiedPaperList.tsx 식별 논문 목록
│           ├── PaperList.tsx           심사 결과 목록
│           ├── FulltextPanel.tsx       전문 확보 (PDF 업로드)
│           ├── EligibilityPaperList.tsx 적격성 평가 결과 (PICO)
│           └── ReviewReport.tsx        보고서 뷰어 + PDF 저장
├── backend/                    NestJS API + PostgreSQL
│   └── src/research/           세션·논문·보고서 CRUD
└── ai-service/                 FastAPI AI 파이프라인
    ├── agents/
    │   ├── search_agent.py       Identification — Search Terms + DB 검색
    │   ├── screening_agent.py    Screening — 제목·초록 1차 선별 (Gemini)
    │   ├── eligibility_agent.py  Eligibility — 전문 기반 PICO 평가 (Claude)
    │   └── writer_agent.py       Writer — Literature Review Report (Claude)
    ├── utils/
    │   ├── fetch_fulltext.py     전문 확보 워터폴 (OA PDF → arXiv → PMC → Unpaywall → 도서관)
    │   └── fetch_library.py      가천대 중앙도서관 Playwright 자동 크롤러
    ├── sources/                  PubMed · Semantic Scholar 어댑터
    ├── graph/pipeline.py         LangGraph StateGraph (자동 파이프라인)
    └── prompts.py                Search Terms · Writer LLM 프롬프트
```

---

## 실행 방법

```bash
git clone https://github.com/Limminsik/gachonscholar.git
cd gachonscholar/Cloud-computing

# AI API 키 설정
cp ai-service/.env.example ai-service/.env
# ai-service/.env 에 입력:
#   GOOGLE_API_KEY=...
#   ANTHROPIC_API_KEY=...
#   SERPAPI_API_KEY=...   (Google Scholar 검색용, 선택)

# 도서관 계정 설정 (선택 — 전문 자동 확보용)
# configuration.json → "library" → "username", "password" 입력

docker compose up --build
# → http://localhost:3000
```

---

## 설정 파일 (`configuration.json`)

```json
{
  "agents": {
    "identification": "gemini-2.5-flash-lite",
    "screening":      "gemini-2.5-flash-lite",
    "eligibility":    "gemini-2.5-flash",
    "writer":         "gemini-2.5-flash"
  },
  "search": {
    "max_results_per_source": 5
  },
  "library": {
    "base_url": "https://lib.gachon.ac.kr",
    "username": "",
    "password": ""
  }
}
```

> `configuration.json`은 `.gitignore`에 포함되어 있어 계정 정보가 외부에 노출되지 않습니다.

---

*가천대학교 · 클라우드컴퓨팅 프로젝트*
