# Gachon Scholar

**AI 기반 체계적 문헌 고찰 플랫폼** — PRISMA 2020 방법론을 따르는 멀티 에이전트 파이프라인으로, 연구 주제를 입력하면 논문 검색부터 최종 리뷰 보고서 작성까지 자동으로 수행합니다.

---

## 무엇을 만들었나요?

체계적 문헌 고찰(Systematic Literature Review)은 특정 주제의 모든 관련 연구를 체계적으로 검색·선별·분석하는 연구 방법입니다. 보통 연구자 2~3명이 수 주에서 수 개월을 소요하는 작업인데, **Gachon Scholar**는 이 과정을 AI 에이전트들이 자동으로 수행합니다.

```
사용자가 연구 주제 입력
        ↓
[Search Agent]      → PubMed + Semantic Scholar에서 논문 수집 (수백 편)
        ↓
[Screening Agent]   → 제목·초록 기반 1차 선별 (Gemini Flash)
        ↓
[Eligibility Agent] → 전문(Full-text) 확보 후 적격성 평가 (Claude Sonnet)
        ↓
[Extraction Agent]  → 포함 논문에서 핵심 데이터 추출
        ↓
[Writer Agent]      → PRISMA 형식의 체계적 리뷰 보고서 생성
```

각 단계마다 **사람이 기준을 조정**하고 확인할 수 있어서, 완전 자동화이면서도 연구자의 판단이 개입되는 Human-in-the-Loop 방식입니다.

---

## 주요 기능

- **실시간 진행 상황 모니터링** — SSE(Server-Sent Events)로 에이전트 작동 과정을 라이브로 확인
- **PRISMA 인터랙티브 플로우** — 각 단계(식별 → 선별 → 적격 → 포함)를 직접 실행하고 기준 수정 가능
- **전문(Full-text) 자동 확보** — PubMed Central, arXiv, Unpaywall OA 등 다양한 경로로 논문 원문 수집
- **중간 결과 자동 저장** — 각 단계 완료 시 DB 저장, 과거 연구로 돌아와도 결과 그대로 복원
- **SSE 재연결 시 상태 복원** — 페이지 새로고침이나 재방문 시 LangGraph 체크포인트에서 UI 자동 복구
- **연구 기록 관리** — 내 연구 사이드바에서 과거 분석 기록 확인 및 이어서 진행

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| **Frontend** | Next.js 14 (App Router, TypeScript, Tailwind CSS) |
| **Backend** | NestJS (TypeScript), Prisma ORM, PostgreSQL 16 |
| **AI Service** | FastAPI (Python), LangGraph StateGraph |
| **AI Models** | Google Gemini 2.5 Flash Lite (검색/선별), Claude Sonnet 4.6 (적격성/보고서) |
| **데이터 소스** | PubMed E-utilities, Semantic Scholar Graph API, SerpAPI |
| **실시간 통신** | SSE (Server-Sent Events) |
| **컨테이너** | Docker Compose |

### 아키텍처

```
Browser (Next.js :3000)
    ↕ REST + SSE
NestJS Backend (:4000)  ←→  PostgreSQL (:5432)
    ↕ HTTP
FastAPI AI Service (:8000)
    ↕ LangGraph (Human-in-the-Loop, MemorySaver checkpointer)
    → PubMed / Semantic Scholar / SerpAPI
    → Claude API / Gemini API
```

---

## 시작하기

### 사전 요구사항

- Docker & Docker Compose
- Google AI API 키 ([Google AI Studio](https://aistudio.google.com))
- Anthropic API 키 ([console.anthropic.com](https://console.anthropic.com))
- SerpAPI 키 ([serpapi.com](https://serpapi.com))

### Docker로 실행 (권장)

```bash
# 1. 저장소 클론
git clone https://github.com/your-org/gachon-scholar.git
cd gachon-scholar/Cloud-computing

# 2. 환경변수 설정
cp .env.example .env
# .env 파일을 열어 API 키 입력

# 3. 전체 실행
docker-compose up --build

# 브라우저에서 http://localhost:3000 접속
```

### 로컬 개발 환경 (Docker 없이)

```bash
# PostgreSQL (Docker)
docker run -d -p 5433:5432 \
  -e POSTGRES_DB=research -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password \
  postgres:16-alpine

# Backend
cd backend && npm install
npx prisma migrate dev
npm run start:dev          # :4000

# AI Service
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev                # :3000
```

---

## 프로젝트 구조

```
Cloud-computing/
├── frontend/              # Next.js 14 웹 앱
│   └── src/
│       ├── app/           # 페이지 (홈, 결과)
│       └── components/    # PRISMA Flow, PaperList, LiveLog 등
├── backend/               # NestJS API 서버
│   └── src/
│       ├── research/      # 세션·논문·보고서 CRUD
│       └── prisma/        # DB 스키마 (ResearchSession, Paper, Report)
├── ai-service/            # FastAPI AI 파이프라인
│   ├── agents/            # 5개 AI 에이전트
│   │   ├── search_agent.py       # PubMed + S2 + SerpAPI 검색
│   │   ├── screening_agent.py    # 제목/초록 1차 선별 (Gemini)
│   │   ├── eligibility_agent.py  # 전문 확보 + 적격성 평가 (Claude)
│   │   ├── extraction_agent.py   # 핵심 데이터 추출
│   │   └── writer_agent.py       # 리뷰 보고서 생성
│   ├── graph/             # LangGraph 파이프라인 (interrupt_before)
│   ├── sources/           # 논문 검색 소스 (PubMed, Semantic Scholar)
│   └── utils/             # 전문 확보 유틸 (fetch_fulltext)
├── docker-compose.yml
└── .env.example           # 환경변수 템플릿
```

---

## 환경변수

`.env.example`을 복사하여 `.env`를 만들고 API 키를 채워넣으세요.

| 변수 | 설명 | 필수 |
|------|------|------|
| `GOOGLE_API_KEY` | Gemini API 키 (Search/Screening 에이전트) | ✅ |
| `ANTHROPIC_API_KEY` | Claude API 키 (Eligibility/Writer 에이전트) | ✅ |
| `SERPAPI_API_KEY` | SerpAPI 키 (Google Scholar 검색) | ✅ |
| `CONTACT_EMAIL` | PubMed·Unpaywall polite pool용 이메일 | 권장 |
| `DATABASE_URL` | PostgreSQL 연결 URL | ✅ |
| `NESTJS_CALLBACK_URL` | FastAPI → NestJS 콜백 URL | ✅ |

---

## API 엔드포인트

### NestJS Backend (:4000/api)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/research` | 새 연구 세션 시작 |
| `GET` | `/sessions` | 최근 세션 목록 |
| `GET` | `/sessions/:id` | 세션 상세 (논문 + 보고서) |
| `POST` | `/sessions/:id/run-stage` | 특정 PRISMA 단계 실행 |
| `POST` | `/sessions/:id/complete` | 파이프라인 완료 콜백 |

### FastAPI AI Service (:8000)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/pipeline/start` | 파이프라인 시작 |
| `POST` | `/pipeline/screening` | Screening 단계 재개 |
| `POST` | `/pipeline/eligibility` | Eligibility 단계 재개 |
| `POST` | `/pipeline/inclusion` | Inclusion 단계 재개 |
| `GET` | `/stream/{session_id}` | SSE 실시간 스트림 |

---

## 개발 배경

클라우드 컴퓨팅 수업 프로젝트로 시작한 이 플랫폼은, 연구자들이 체계적 문헌 고찰에 쏟는 시간을 줄이고 더 많은 시간을 실제 연구에 집중할 수 있도록 돕는 것을 목표로 합니다. PRISMA 2020 가이드라인을 준수하며, 각 단계에서 AI의 판단을 사람이 검토하고 수정할 수 있는 구조로 설계했습니다.

---

*Gachon University · Cloud Computing Project*
