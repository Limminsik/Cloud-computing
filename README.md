# Gachon Scholar

**AI가 수행하는 체계적 문헌 고찰 플랫폼**

연구 주제 하나만 입력하면, AI 에이전트들이 수백 편의 논문을 검색하고 PRISMA 방법론에 따라 선별·평가하여 최종 리뷰 보고서까지 자동으로 작성합니다.

---

## 이런 분들에게 유용합니다

- 특정 주제의 선행 연구를 빠르게 파악하고 싶은 연구자
- 체계적 문헌 고찰을 처음 접하는 대학원생
- 방대한 논문 더미에서 핵심 연구만 추려내고 싶은 분

---

## 어떻게 동작하나요?

```
연구 주제 입력
    ↓
① Search      PubMed + Semantic Scholar + Google Scholar에서 논문 수백 편 수집
    ↓
② Screening   제목·초록 기반 1차 선별  (Gemini AI)
    ↓
③ Eligibility 논문 전문(Full-text) 확보 후 적격성 평가  (Claude AI)
    ↓
④ Inclusion   최종 포함 논문 데이터 추출
    ↓
⑤ Report      PRISMA 형식의 체계적 리뷰 보고서 자동 생성
```

각 단계 사이에 **사람이 기준을 직접 설정하고 조정**할 수 있습니다.  
완전 자동화이면서도 연구자의 판단이 개입되는 Human-in-the-Loop 방식입니다.

---

## 주요 기능

### 실시간 진행 확인
분석이 진행되는 동안 어떤 에이전트가 무엇을 하고 있는지 라이브로 볼 수 있습니다. 논문 한 편 한 편의 포함/제외 판정도 즉시 표시됩니다.

### 단계별 기준 직접 설정
각 PRISMA 단계(Screening → Eligibility → Inclusion)를 실행하기 전에 포함/제외 기준을 직접 입력할 수 있습니다. 기준 없이 실행하면 AI가 연구 주제 적합성으로 자동 판단합니다.

### 논문 필터·탐색
선별된 논문들을 단계별(선별/적격/포함)·판정별(포함/제외)로 필터링하고, 검색어 하이라이트로 빠르게 훑어볼 수 있습니다.

### 과거 연구 이어 보기
분석이 완료된 연구는 **내 연구** 탭에 저장됩니다. 언제 다시 돌아와도 식별된 논문 목록, 각 단계 결과, PRISMA 통계가 그대로 복원됩니다.

### 리뷰 보고서 다운로드
최종 생성된 체계적 리뷰 보고서를 Markdown 파일로 다운로드할 수 있습니다.

---

## 화면 구성

```
┌─────────────────────────────────────────────────────────────┐
│  Gachon Scholar      [검색창]          분석 중   Live Log  │
├──────────┬──────────────────────────────────┬───────────────┤
│  Agent   │  식별(187) │ 심사(144) │ 리포트  │  PRISMA Flow │
│ Pipeline │                                  │               │
│          │  [논문 카드 목록]               │  Screening ✓  │
│ ○ Search │   제목 · 저자 · 판정 이유       │  Eligibility  │
│ ✓ Screen │   [포함] / [제외]               │  ▶ 실행       │
│ ● Eligib │                                  │               │
│ ○ Extract│                                  │  Inclusion    │
│ ○ Writer │                                  │               │
└──────────┴──────────────────────────────────┴───────────────┘
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | NestJS, Prisma ORM, PostgreSQL |
| AI Service | FastAPI, LangGraph (Human-in-the-Loop) |
| 검색 AI | Google Gemini 2.5 Flash Lite |
| 평가·작성 AI | Anthropic Claude Sonnet 4.6 |
| 논문 DB | PubMed, Semantic Scholar, Google Scholar |
| 실시간 통신 | SSE (Server-Sent Events) |

---

*Gachon University · Cloud Computing Project*
