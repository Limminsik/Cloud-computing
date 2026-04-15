# PRISMA AI Research Agent

PRISMA 방법론 기반 자동 체계적 문헌 고찰(Systematic Literature Review) 플랫폼.

## Architecture

```
[Next.js Frontend :3000]
        │  REST (세션 생성·조회)
        ▼
[NestJS Backend :4000] ──── [PostgreSQL :5432]
        │  HTTP (파이프라인 시작)
        ▼
[FastAPI AI Service :8000]
        │  LangGraph 5-Agent Pipeline
        ├── Agent 1: SearchAgent    (Gemini)  → Identification
        ├── Agent 2: ScreeningAgent (Claude)  → Screening
        ├── Agent 3: EligibilityAgent (Claude)→ Eligibility
        ├── Agent 4: ExtractionAgent (Claude) → Data Extraction
        └── Agent 5: WriterAgent   (Claude)  → Review Paper
        │
        └── SSE Stream → [Next.js Frontend] (실시간 이벤트)
```

## PRISMA Flow

```
Records Identified (Agent 1)
        ↓
Records after Screening (Agent 2) ─── Excluded w/ reasons
        ↓
Reports Eligible (Agent 3) ────────── Excluded w/ reasons
        ↓
Studies Included (Agent 4 & 5) ────── Final Review Paper
```

## Quick Start

### 1. 환경변수 설정
```bash
cp .env.example .env
# .env 파일을 열어 GOOGLE_API_KEY, ANTHROPIC_API_KEY 입력
```

### 2. Docker Compose로 실행
```bash
docker-compose up --build
```

### 3. 브라우저에서 접속
```
http://localhost:3000
```

## Service Endpoints

| Service | Port | Endpoint |
|---------|------|----------|
| Frontend | 3000 | `http://localhost:3000` |
| Backend API | 4000 | `http://localhost:4000/api` |
| AI Service | 8000 | `http://localhost:8000` |
| DB | 5432 | PostgreSQL |

## API Reference

### Backend (NestJS)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/research` | 새 연구 세션 시작 |
| `GET` | `/api/sessions` | 최근 세션 목록 |
| `GET` | `/api/sessions/:id` | 세션 상세 (논문 + 보고서) |
| `POST` | `/api/sessions/:id/complete` | 파이프라인 완료 콜백 (AI Service → Backend) |

### AI Service (FastAPI)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/pipeline/start` | 파이프라인 시작 (Backend에서 호출) |
| `GET` | `/stream/{session_id}` | SSE 실시간 스트림 (Frontend에서 직접 구독) |
| `GET` | `/sessions/{session_id}/state` | 최종 파이프라인 상태 |
| `GET` | `/health` | 헬스체크 |

## SSE Event Types

| Event | Description |
|-------|-------------|
| `agent_start` | 에이전트 시작 |
| `agent_progress` | 에이전트 진행 상황 |
| `agent_complete` | 에이전트 완료 |
| `prisma_update` | PRISMA 카운트 업데이트 |
| `paper_decision` | 논문 선별 결과 (INCLUDE/EXCLUDE) |
| `pipeline_done` | 전체 파이프라인 완료 |
| `error` | 오류 발생 |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | NestJS 10, TypeScript |
| ORM | Prisma 5 (PostgreSQL) |
| AI Service | FastAPI, LangGraph, LangChain |
| Search | Google Gemini (Gemini 2.0 Flash) |
| Review | Anthropic Claude (claude-sonnet-4-6) |
| Infra | Docker Compose, PostgreSQL 16 |
