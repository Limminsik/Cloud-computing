# Gachon Scholar — 사용 가이드 (처음부터 끝까지)

> 이 문서 하나로 **로컬 실행**과 **GCP 서버 배포** 모두 가능합니다.  
> 순서대로 따라오면 누구나 실행할 수 있습니다.

---

## 목차

1. [이 플랫폼이 무엇인지](#1-이-플랫폼이-무엇인지)
2. [사전 준비 — API 키 발급](#2-사전-준비--api-키-발급)
3. [로컬 실행 (내 컴퓨터에서 테스트)](#3-로컬-실행-내-컴퓨터에서-테스트)
4. [GCP 배포 (서버에 올려서 운영)](#4-gcp-배포-서버에-올려서-운영)
5. [코드 수정 후 반영 방법](#5-코드-수정-후-반영-방법)
6. [문제가 생겼을 때](#6-문제가-생겼을-때)

---

## 1. 이 플랫폼이 무엇인지

Gachon Scholar는 연구 주제를 입력하면 AI가 자동으로:

```
① 논문 검색 (PubMed, Google Scholar, Semantic Scholar)
② 심사 (관련 없는 논문 제외)
③ 전문 확보 (가천대 도서관 자동 로그인 + 원문 다운로드)
④ 적격성 평가 (PICO 분석)
⑤ 보고서 작성 (Literature Review Report, PDF 저장)
```

이 모든 것을 자동으로 수행합니다.

---

## 2. 사전 준비 — API 키 발급

아래 3개의 API 키가 필요합니다. 한 번만 발급받으면 됩니다.

### Google API Key (필수)
1. https://aistudio.google.com 접속
2. 로그인 (Google 계정)
3. 왼쪽 메뉴 → **"Get API key"** 클릭
4. **"Create API key"** 클릭
5. 생성된 키를 복사해서 저장 (`AIza...` 로 시작하는 긴 문자열)

### Anthropic API Key (필수)
1. https://console.anthropic.com 접속
2. 회원가입 / 로그인
3. 왼쪽 메뉴 → **"API Keys"** 클릭
4. **"Create Key"** 클릭
5. 생성된 키를 복사해서 저장 (`sk-ant-...` 로 시작)

### SerpAPI Key (선택 — Google Scholar 검색용)
1. https://serpapi.com 접속
2. 회원가입 (무료 플랜 있음)
3. 대시보드에서 **"Your Private API Key"** 복사
4. 없으면 PubMed + Semantic Scholar만 검색 (기능 일부 제한)

---

## 3. 로컬 실행 (내 컴퓨터에서 테스트)

### 사전 설치 확인

Docker Desktop이 설치되어 있어야 합니다.
- Windows/Mac: https://www.docker.com/products/docker-desktop 에서 다운로드 후 설치
- 설치 후 Docker Desktop 앱 실행 (하단 상태바에 고래 아이콘이 초록색이면 OK)

### Step 1. 코드 다운로드

PowerShell(Windows) 또는 터미널(Mac)에서 실행:

```bash
git clone https://github.com/Limminsik/gachonscholar.git
cd gachonscholar
```

### Step 2. AI Service 환경변수 파일 생성

아래 내용을 복사해서 `ai-service/.env` 파일로 저장합니다.  
**API 키 3개를 실제 값으로 교체하세요.**

```
ai-service/.env 파일 내용:
```

```env
GOOGLE_API_KEY=여기에_Google_API_키_입력
ANTHROPIC_API_KEY=여기에_Anthropic_API_키_입력
SERPAPI_API_KEY=여기에_SerpAPI_키_입력
NESTJS_CALLBACK_URL=http://backend:4000
CONTACT_EMAIL=본인이메일@gmail.com
```

> 파일 위치: `gachonscholar/ai-service/.env`  
> (`.env`는 숨김 파일이라 파일 탐색기에서 안 보일 수 있음 — 메모장으로 직접 생성)

### Step 3. configuration.json 생성

아래 내용을 복사해서 `configuration.json` 파일로 저장합니다.  
프로젝트 루트(`gachonscholar/`) 폴더에 저장하세요.

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
    "username": "가천대학교_학번",
    "password": "도서관_비밀번호"
  }
}
```

> 도서관 계정 없어도 실행은 됩니다. 전문 자동 확보 기능만 비활성화됩니다.

### Step 4. 실행

```bash
# gachonscholar 폴더 안에서 실행
docker compose up --build
```

처음 실행은 Docker 이미지를 빌드하므로 **5~10분** 소요됩니다.  
아래 메시지가 뜨면 성공:

```
frontend-1   | ✓ Ready in 104ms
backend-1    | Backend running on http://localhost:4000/api
ai-service-1 | Uvicorn running on http://0.0.0.0:8000
```

### Step 5. 접속

브라우저에서 **http://localhost:3000** 접속

### 이후 실행 (빌드 없이 빠르게)

```bash
docker compose up -d
```

### 종료

```bash
docker compose down
```

---

## 4. GCP 배포 (서버에 올려서 운영)

### 현재 GCP 서버 정보

| 항목 | 값 |
|------|-----|
| 플랫폼 | Google Cloud Platform |
| 프로젝트 | gachonscholar |
| 서버 이름 | gachonscholar-vm |
| 위치 | 서울 (asia-northeast3-a) |
| 서버 사양 | 4 CPU, 16GB RAM |
| 외부 IP | 34.64.163.173 |
| **접속 URL** | **http://34.64.163.173:3000** |

---

### 4-A. 이미 만들어진 서버에 접속해서 시작할 때

#### Step 1. gcloud CLI 설치 (최초 1회)
https://cloud.google.com/sdk/docs/install 에서 Windows용 설치 파일 다운로드 후 설치

#### Step 2. 로그인
```bash
gcloud auth login
```
브라우저가 열리면 Google 계정으로 로그인

#### Step 3. 서버 접속
```bash
gcloud compute ssh gachonscholar-vm --zone=asia-northeast3-a
```

#### Step 4. 서버 안에서 실행

서버에 처음 접속한 경우 (코드가 없는 경우):
```bash
# 코드 다운로드
git clone https://github.com/Limminsik/gachonscholar.git
cd gachonscholar

# Docker 설치 (서버에 없는 경우)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

환경 파일 생성:
```bash
# AI Service API 키
cat > ai-service/.env << 'EOF'
GOOGLE_API_KEY=여기에_Google_API_키_입력
ANTHROPIC_API_KEY=여기에_Anthropic_API_키_입력
SERPAPI_API_KEY=여기에_SerpAPI_키_입력
NESTJS_CALLBACK_URL=http://backend:4000
CONTACT_EMAIL=limminsik12@gmail.com
EOF

# GCP 서버 URL 설정 (로컬과 다르게 서버 IP 사용)
cat > .env << 'EOF'
FRONTEND_URL=http://34.64.163.173:3000
NEXT_PUBLIC_NESTJS_URL=http://34.64.163.173:4000
NEXT_PUBLIC_AI_SERVICE_URL=http://34.64.163.173:8000
EOF

# 도서관 + 검색 설정
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
    "username": "가천대학교_학번",
    "password": "도서관_비밀번호"
  }
}
EOF
```

배포 실행:
```bash
docker compose up --build -d
```

**완료!** → http://34.64.163.173:3000 접속

---

### 4-B. GCP 서버 새로 만드는 경우 (처음부터)

#### Step 1. GCP 설정
```bash
# 프로젝트 설정
gcloud config set project gachonscholar

# Compute Engine API 활성화
gcloud services enable compute.googleapis.com --project=gachonscholar
```

#### Step 2. 서버(VM) 생성
```bash
gcloud compute instances create gachonscholar-vm \
  --zone=asia-northeast3-a \
  --machine-type=e2-standard-4 \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --tags=http-server
```

#### Step 3. 방화벽 (포트 열기)
```bash
gcloud compute firewall-rules create allow-gachonscholar \
  --allow="tcp:3000,tcp:4000,tcp:8000" \
  --target-tags=http-server
```

#### Step 4. 서버 외부 IP 확인
```bash
gcloud compute instances describe gachonscholar-vm \
  --zone=asia-northeast3-a \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

→ 나온 IP 주소를 메모합니다. 이후 Step에서 `34.64.163.173` 대신 이 IP를 사용하세요.

#### Step 5. 서버 접속 후 배포
위 **4-A** 의 Step 3~4 와 동일하게 진행합니다.

---

### 4-C. 서버 켜기/끄기 (비용 절감)

서버를 사용하지 않을 때 끄면 **디스크 비용만 발생** (약 $2/월)합니다.

```bash
# 서버 끄기
gcloud compute instances stop gachonscholar-vm --zone=asia-northeast3-a

# 서버 켜기
gcloud compute instances start gachonscholar-vm --zone=asia-northeast3-a

# 서버 켠 후 접속
gcloud compute ssh gachonscholar-vm --zone=asia-northeast3-a
# 서버 안에서:
cd gachonscholar
docker compose up -d
```

> ⚠️ 서버를 껐다 켜면 외부 IP가 바뀔 수 있습니다.  
> IP 고정이 필요하면: GCP Console → VPC 네트워크 → 외부 IP 주소 → 해당 IP → **"고정"** 으로 변경

---

## 5. 코드 수정 후 반영 방법

### 로컬에서 수정 → GitHub → 서버 반영 순서

#### 1단계: 로컬에서 코드 수정 후 GitHub에 올리기

```bash
# 수정한 파일 확인
git status

# 변경사항 저장
git add -A
git commit -m "수정 내용 간단히 설명"
git push origin claude/ai-research-agent-JtsVl
```

#### 2단계: GCP 서버에 반영하기

```bash
# 서버 접속
gcloud compute ssh gachonscholar-vm --zone=asia-northeast3-a

# 서버 안에서
cd gachonscholar
git pull origin claude/ai-research-agent-JtsVl

# 전체 재시작 (변경 내용 반영)
docker compose up --build -d
```

### 어떤 서비스만 재빌드할 때

```bash
# 프론트엔드만
docker compose up --build frontend -d

# 백엔드만
docker compose up --build backend -d

# AI 서비스만
docker compose up --build ai-service -d
```

---

## 6. 문제가 생겼을 때

### 로그 확인

```bash
# 전체 로그
docker compose logs --tail=50

# 서비스별 로그
docker compose logs --tail=50 ai-service
docker compose logs --tail=50 backend
docker compose logs --tail=50 frontend

# 실시간 로그 (Ctrl+C로 종료)
docker compose logs -f ai-service
```

### 컨테이너 상태 확인

```bash
docker compose ps
```

모든 서비스가 `Up` 상태여야 합니다. `Restarting`이면 로그를 확인하세요.

### 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| ai-service가 Restarting | `configuration.json` 파일이 없거나 디렉토리로 생성됨 | `rm -rf configuration.json` 후 파일로 재생성 |
| 보고서가 안 보임 | NestJS 바디 크기 초과 | 이미 수정됨 (v1.0 이후) |
| 접속이 안 됨 (GCP) | 방화벽 미설정 또는 VM이 꺼짐 | VM 켜기 + 방화벽 규칙 확인 |
| 논문이 너무 적게 검색됨 | `max_results_per_source` 설정 | `configuration.json` 에서 숫자 늘리기 |

### 완전 초기화 (데이터 포함)

```bash
# 모든 컨테이너와 데이터 삭제 후 재시작
docker compose down -v
docker compose up --build -d
```

---

## 참고: 파일 구조

```
gachonscholar/
├── DEVELOPMENT.md          ← 이 파일
├── README.md               ← 프로젝트 소개
├── docker-compose.yml      ← 전체 서비스 실행 설정
├── configuration.json      ← 직접 생성 필요 (gitignore)
├── .env                    ← GCP용만 생성 (gitignore)
│
├── frontend/               ← Next.js 웹 화면
├── backend/                ← NestJS API 서버
└── ai-service/
    ├── .env                ← 직접 생성 필요 (gitignore)
    ├── agents/             ← AI 에이전트 (검색/심사/평가/보고서)
    ├── utils/              ← 전문 확보 유틸리티
    └── prompts.py          ← LLM 프롬프트
```
