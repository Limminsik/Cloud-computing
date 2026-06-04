# Gachon Scholar — 개발 환경 & 배포 가이드

## 서비스 구성

| 서비스 | 기술 | 포트 | 역할 |
|--------|------|------|------|
| Frontend | Next.js 14 | 3000 | 웹 UI |
| Backend | NestJS 10 | 4000 | API 서버 + DB 관리 |
| AI Service | FastAPI + LangGraph | 8000 | PRISMA 파이프라인 |
| Database | PostgreSQL 16 | 5432 | 세션·논문 데이터 저장 |

---

## 사전 준비 (공통)

### API 키 발급
| 키 | 발급처 | 용도 |
|----|--------|------|
| `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com/) | Gemini (Identification · Screening) |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/) | Claude (Eligibility · Writer) |
| `SERPAPI_API_KEY` | [SerpAPI](https://serpapi.com/) | Google Scholar 검색 (선택) |

> `SERPAPI_API_KEY`가 없으면 PubMed + Semantic Scholar 만 검색합니다.

### 파일 구조
```
Cloud-computing/
├── .env                    ← 생성 필요 (gitignore)
├── configuration.json      ← 생성 필요 (gitignore)
├── docker-compose.yml
├── frontend/
├── backend/
└── ai-service/
    └── .env               ← 생성 필요 (gitignore)
```

---

## 로컬 개발 — Docker Compose

### 1. 환경 파일 생성

**`ai-service/.env`**
```env
GOOGLE_API_KEY=your_google_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
SERPAPI_API_KEY=your_serpapi_key
NESTJS_CALLBACK_URL=http://backend:4000
CONTACT_EMAIL=your_email@example.com
```

**`configuration.json`** (프로젝트 루트)
```json
{
  "agents": {
    "identification": "gemini-2.5-flash-lite",
    "screening":      "gemini-2.5-flash-lite",
    "eligibility":    "gemini-2.5-flash",
    "writer":         "gemini-2.5-flash"
  },
  "search": {
    "max_results_per_source": 20,
    "scholar_page_size": 10,
    "scholar_max_pages": 2
  },
  "pipeline": {
    "screening_batch_size": 50,
    "eligibility_concurrent": 5,
    "eligibility_max_tokens": 4096
  },
  "features": {
    "fetch_fulltext": true,
    "auto_generate_criteria": true
  },
  "library": {
    "base_url": "https://lib.gachon.ac.kr",
    "username": "",
    "password": ""
  }
}
```

### 2. 실행

```bash
cd Cloud-computing

# 최초 실행 (빌드 포함)
docker compose up --build

# 이후 실행
docker compose up -d

# 종료
docker compose down          # 데이터 유지
docker compose down -v       # DB 볼륨까지 삭제
```

### 3. 접속 URL

| 서비스 | URL |
|--------|-----|
| 웹 UI | http://localhost:3000 |
| Backend API | http://localhost:4000/api |
| AI Service | http://localhost:8000/docs |

---

## 로컬 개발 — 서비스 개별 실행

개발 시 핫리로드가 필요하면 각 서비스를 따로 실행합니다.

### DB (PostgreSQL)
```bash
docker run -d \
  --name gachon-db \
  -e POSTGRES_DB=research \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:16-alpine
```

### Backend (NestJS) — 터미널 1
```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

### AI Service (FastAPI) — 터미널 2
```bash
cd ai-service
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (Next.js) — 터미널 3
```bash
cd frontend
npm install
# .env.local 생성
echo "NEXT_PUBLIC_NESTJS_URL=http://localhost:4000" > .env.local
echo "NEXT_PUBLIC_AI_SERVICE_URL=http://localhost:8000" >> .env.local
npm run dev
```

---

## GCP 배포 — Google Compute Engine

### 인프라 정보

| 항목 | 값 |
|------|-----|
| 플랫폼 | Google Cloud Platform |
| 프로젝트 ID | `gachonscholar` |
| VM 이름 | `gachonscholar-vm` |
| 리전/존 | `asia-northeast3-a` (서울) |
| 머신 타입 | `e2-standard-4` (4 vCPU, 16GB RAM) |
| OS | Ubuntu 22.04 LTS |
| 디스크 | 50GB |
| 외부 IP | `34.64.163.173` |
| 접속 URL | http://34.64.163.173:3000 |

### 포트 방화벽 규칙

```
allow-gachonscholar: tcp:3000, tcp:4000, tcp:8000
```

### 최초 VM 구성 (gcloud CLI)

```bash
# 프로젝트 설정
gcloud config set project gachonscholar

# API 활성화
gcloud services enable compute.googleapis.com

# VM 생성
gcloud compute instances create gachonscholar-vm \
  --zone=asia-northeast3-a \
  --machine-type=e2-standard-4 \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --tags=http-server

# 방화벽 규칙
gcloud compute firewall-rules create allow-gachonscholar \
  --allow="tcp:3000,tcp:4000,tcp:8000" \
  --target-tags=http-server

# VM 접속
gcloud compute ssh gachonscholar-vm --zone=asia-northeast3-a
```

### VM 초기 설정 (VM 내부에서 실행)

```bash
# Docker 설치
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 코드 클론
git clone https://github.com/Limminsik/gachonscholar.git
cd gachonscholar

# AI Service 환경 변수
cat > ai-service/.env << 'EOF'
GOOGLE_API_KEY=실제_키_입력
ANTHROPIC_API_KEY=실제_키_입력
SERPAPI_API_KEY=실제_키_입력
NESTJS_CALLBACK_URL=http://backend:4000
CONTACT_EMAIL=your_email@example.com
EOF

# GCP용 URL 환경변수 (.env — docker-compose가 읽음)
cat > .env << 'EOF'
FRONTEND_URL=http://34.64.163.173:3000
NEXT_PUBLIC_NESTJS_URL=http://34.64.163.173:4000
NEXT_PUBLIC_AI_SERVICE_URL=http://34.64.163.173:8000
EOF

# configuration.json (도서관 계정 포함)
cat > configuration.json << 'EOF'
{
  "agents": {
    "identification": "gemini-2.5-flash-lite",
    "screening":      "gemini-2.5-flash-lite",
    "eligibility":    "gemini-2.5-flash",
    "writer":         "gemini-2.5-flash"
  },
  "search": {
    "max_results_per_source": 20,
    "scholar_page_size": 10,
    "scholar_max_pages": 2
  },
  "pipeline": {
    "screening_batch_size": 50,
    "eligibility_concurrent": 5,
    "eligibility_max_tokens": 4096
  },
  "features": {
    "fetch_fulltext": true,
    "auto_generate_criteria": true
  },
  "library": {
    "base_url": "https://lib.gachon.ac.kr",
    "username": "학번_입력",
    "password": "비밀번호_입력"
  }
}
EOF

# 배포
docker compose up --build -d
```

### 코드 업데이트 (이후)

```bash
# VM 접속
gcloud compute ssh gachonscholar-vm --zone=asia-northeast3-a

# 최신 코드 반영
cd gachonscholar
git pull origin claude/ai-research-agent-JtsVl

# 변경된 서비스만 재빌드
docker compose up --build -d

# 전체 재시작
docker compose restart
```

### VM 중지/시작 (비용 절감)

```bash
# VM 중지 (디스크 비용만 발생)
gcloud compute instances stop gachonscholar-vm --zone=asia-northeast3-a

# VM 재시작
gcloud compute instances start gachonscholar-vm --zone=asia-northeast3-a

# 재시작 후 접속
gcloud compute ssh gachonscholar-vm --zone=asia-northeast3-a
# cd gachonscholar && docker compose up -d
```

> VM 재시작 후 외부 IP가 변경될 수 있습니다.  
> 고정 IP가 필요하면 GCP Console → VPC → 외부 IP 주소 → 고정으로 승격.

---

## 환경별 주요 차이점

| 항목 | 로컬 | GCP |
|------|------|-----|
| `NEXT_PUBLIC_NESTJS_URL` | `http://localhost:4000` | `http://34.64.163.173:4000` |
| `NEXT_PUBLIC_AI_SERVICE_URL` | `http://localhost:8000` | `http://34.64.163.173:8000` |
| `.env` 파일 위치 | 필요 없음 (기본값 사용) | 루트에 `.env` 생성 필요 |
| `configuration.json` | 로컬 파일 직접 생성 | VM에서 직접 생성 |

> `docker-compose.yml`은 `${변수:-기본값}` 형식으로 환경별 URL을 주입받으므로  
> **동일한 파일**로 로컬/GCP 모두 동작합니다.

---

## 자주 쓰는 명령어

```bash
# 로그 확인
docker compose logs -f ai-service
docker compose logs -f backend
docker compose logs -f frontend

# 컨테이너 상태
docker compose ps

# DB 직접 접속
docker compose exec db psql -U postgres -d research

# 특정 서비스만 재빌드
docker compose up --build ai-service -d
docker compose up --build backend -d
docker compose up --build frontend -d

# Prisma 스키마 변경 후
docker compose exec backend npx prisma db push
```
