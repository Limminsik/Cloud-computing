<div align="center">

# [Gachon Scholar](https://github.com/Limminsik/gachonscholar)

**AI-powered Systematic Literature Review Platform**

*Enter a research topic. Get a full PRISMA-compliant review report — automatically.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2-orange)](https://langchain-ai.github.io/langgraph/)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%204.6-blueviolet)](https://www.anthropic.com/)

</div>

---

## Overview

Gachon Scholar automates the entire systematic literature review (SLR) process using a **multi-agent AI pipeline** built on LangGraph. What typically takes researchers weeks to complete manually — searching hundreds of papers, screening by criteria, assessing eligibility, and synthesizing findings — is executed in minutes.

The platform follows **PRISMA 2020** methodology with a **Human-in-the-Loop** design: AI handles the heavy lifting at each stage while researchers retain control over inclusion/exclusion criteria before every step.

---

## How It Works

```
 Input: research query
        │
        ▼
┌───────────────────┐
│  Search Agent     │  Queries PubMed · Semantic Scholar · Google Scholar in parallel
│  (Gemini Flash)   │  Deduplicates and merges hundreds of results
└─────────┬─────────┘
          │  ⏸ User reviews identified papers & sets screening criteria
          ▼
┌───────────────────┐
│  Screening Agent  │  Title & abstract screening against user-defined criteria
│  (Gemini Flash)   │  Batch-processes up to 50 papers per LLM call
└─────────┬─────────┘
          │  ⏸ User confirms criteria before eligibility assessment
          ▼
┌───────────────────┐
│ Eligibility Agent │  Retrieves full text via PMC · arXiv · Unpaywall · OA PDF
│  (Claude Sonnet)  │  Performs in-depth PRISMA eligibility assessment
└─────────┬─────────┘
          │  ⏸ User sets final inclusion criteria
          ▼
┌───────────────────┐
│ Extraction Agent  │  Extracts structured data from included papers
│  (Claude Sonnet)  │  (study design, findings, methods, limitations)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│   Writer Agent    │  Synthesizes all findings into a full SLR report
│  (Claude Sonnet)  │  PRISMA-formatted, 1500+ words, downloadable as Markdown
└───────────────────┘
```

---

## Key Features

**Real-time pipeline monitoring**  
Every agent action streams live to the browser via SSE. Watch papers get screened one by one, with include/exclude decisions and reasoning displayed as they happen.

**Interactive PRISMA flow panel**  
A side panel visualizes each PRISMA stage with live counts and exclusion tallies. Each stage gate shows a criteria input — leave blank for AI-only judgment, or specify your own rules.

**Multi-source full-text retrieval**  
The Eligibility Agent doesn't rely solely on abstracts. It systematically attempts to obtain full text from PubMed Central, arXiv (ar5iv), Unpaywall, and open-access PDF links before falling back to abstract-only assessment.

**Persistent session state**  
Every stage result is saved to the database immediately after completion. Returning to a past session — even after a server restart — fully restores identified papers, screening decisions, PRISMA statistics, and agent statuses.

**SSE reconnect replay**  
On reconnect or page revisit, the server replays the current LangGraph checkpoint as SSE events, so the UI reconstructs its state without a page reload.

**Paper explorer with filters**  
Filter the paper list by PRISMA stage (screened / eligible / included) and decision (include / exclude), with keyword highlighting matched to your original query.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                Browser (Next.js 14)                  │
│  SSE stream ◄──────────────────────────────────┐    │
│  REST calls ──────────────────────────────────┐ │   │
└───────────────────────────────────────────────┼─┼───┘
                                                │ │
                                ┌───────────────▼─┴───┐
                                │   NestJS Backend     │
                                │   (port 4000)        │
                                │   Prisma ORM         │
                                └──────────┬─────┬─────┘
                                           │     │
                          ┌────────────────▼┐  ┌─▼──────────┐
                          │   PostgreSQL     │  │ FastAPI     │
                          │   (port 5432)   │  │ AI Service  │
                          └─────────────────┘  │ (port 8000) │
                                               │ LangGraph   │
                                               │ MemorySaver │
                                               └─────────────┘
```

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | NestJS 10, Prisma ORM, PostgreSQL 16 |
| AI Pipeline | FastAPI, LangGraph StateGraph, MemorySaver |
| Search AI | Google Gemini 2.5 Flash Lite |
| Review AI | Anthropic Claude Sonnet 4.6 |
| Paper Sources | PubMed E-utilities, Semantic Scholar Graph API, SerpAPI |
| Realtime | Server-Sent Events (SSE) |
| Infrastructure | Docker Compose |

---

## Screenshots

> Agent pipeline sidebar · PRISMA interactive flow · Paper decision list · Live log

```
┌──────────────┬────────────────────────────────────┬──────────────────┐
│ Agent        │  식별(187)  심사(144)  리포트       │  PRISMA Flow     │
│ Pipeline     │                                    │                  │
│              │  ┌─────────────────────────────┐  │  Identification  │
│ ✓ Search     │  │ Paper Title                 │  │  187 ✓           │
│ ✓ Screening  │  │ [포함]  [RCT][신뢰도:high]  │  │                  │
│ ● Eligibility│  │ ...                         │  │  Screening ✓     │
│ ○ Extraction │  └─────────────────────────────┘  │  144             │
│ ○ Writer     │                                    │                  │
│              │  [단계별 필터] [판정 필터]          │  ▶ Eligibility   │
└──────────────┴────────────────────────────────────┴──────────────────┘
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/Limminsik/gachonscholar.git
cd gachonscholar/Cloud-computing

# Configure API keys
cp .env.example .env
# Fill in GOOGLE_API_KEY, ANTHROPIC_API_KEY, SERPAPI_API_KEY

# Run
docker-compose up --build
# → http://localhost:3000
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` | Gemini API key (Search & Screening agents) |
| `ANTHROPIC_API_KEY` | Claude API key (Eligibility, Extraction & Writer agents) |
| `SERPAPI_API_KEY` | SerpAPI key for Google Scholar |
| `CONTACT_EMAIL` | Email for PubMed & Unpaywall polite-pool requests |
| `DATABASE_URL` | PostgreSQL connection string |

---

## Project Structure

```
Cloud-computing/
├── frontend/               Next.js 14 app
│   └── src/
│       ├── app/            pages (home, results/[id])
│       └── components/     AgentStatusCards, PrismaInteractiveFlow,
│                           PaperList, IdentifiedPaperList, LiveLog, …
├── backend/                NestJS API
│   └── src/research/       session CRUD, stage-result persistence
├── ai-service/             FastAPI + LangGraph pipeline
│   ├── agents/             5 AI agents
│   ├── graph/pipeline.py   StateGraph with interrupt_before hooks
│   ├── sources/            PubMed & Semantic Scholar adapters
│   └── utils/              full-text retrieval (PMC, arXiv, Unpaywall)
└── docker-compose.yml
```

---

*Gachon University · Cloud Computing Capstone Project*
