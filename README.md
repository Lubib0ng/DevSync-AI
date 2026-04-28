# 🤖 DevSync AI

> IT 기술 문서와 최신 개발 트렌드를 실시간으로 큐레이션하며, 실무에 바로 적용할 수 있는 코드 예제와 아키텍처 설계를 제공하는 AI 기반 웹 애플리케이션

[![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)](https://reactjs.org/)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20LLM-000000?logo=ai)](https://ollama.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ 주요 기능

### 🎯 멀티 에이전트 시스템
- **Orchestrator** — 시스템 전체 조율 및 작업 분배
- **Scout Agent** — 실시간 기술 트렌드 탐색 및 데이터 수집
- **Architect Agent** — 아키텍처 설계 및 코드 예제 생성

### 🛠️ 핵심 기술 스택 소개
LangChain, LlamaIndex, Pinecone, FastAPI, React 등 AI 기반 RAG 워크플로우를 구성하는 주요 기술을 인터랙티브하게 탐색할 수 있습니다.

### 💬 Ollama 로컬 챗봇
- ✅ 로컬에서 실행되는 Ollama 모델과 실시간 대화
- ✅ 설치된 모델 자동 감지 및 선택
- ✅ 스트리밍 응답 (토큰 단위 실시간 출력)
- ✅ 대화 히스토리 유지 (멀티턴 컨텍스트)
- ✅ 타이핑 애니메이션 및 말풍선 UI

---

## 🖼️ 스크린샷

```
┌─────────────────────────────────────────┐
│  DevSync AI                             │
│  Premium AI Engineering Experience      │
├─────────────────────────────────────────┤
│  ⚙️ 멀티 에이전트 시스템                │
│  🔧 핵심 기술 스택                       │
│  💬 AI 챗봇 (Ollama 연동)               │
└─────────────────────────────────────────┘
```

---

## 🚀 빠른 시작

### 📋 사전 요구사항

- **Node.js** 16 이상 ([다운로드](https://nodejs.org/))
- **Ollama** 설치 및 실행 ([설치 가이드](https://ollama.com/))

### 📦 설치

```bash
# 저장소 클론
git clone https://github.com/Lubib0ng/devsync-ai.git
cd devsync-ai/devsync-ai

# 의존성 설치
npm install
```

### 🤖 Ollama 설정

```bash
# 1. Ollama 서버 실행 (별도 터미널)
ollama serve

# 2. 사용할 모델 다운로드
ollama pull llama3.2
# 또는
ollama pull mistral
ollama pull codellama
```

### ▶️ 개발 서버 실행

```bash
npm start
```

브라우저가 자동으로 열리며 [http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

> **참고**: `package.json`의 `proxy` 설정으로 Ollama API(`http://127.0.0.1:11434`)가 자동 연결됩니다.

---

## 📁 프로젝트 구조

```
devsync-ai/
├── public/
│   └── index.html          # HTML 템플릿
├── src/
│   ├── App.js              # 메인 컴포넌트 (UI + 로직)
│   ├── App.css             # 스타일시트
│   ├── index.js            # React 엔트리포인트
│   └── index.css           # 글로벌 스타일
├── package.json            # 의존성 및 스크립트
└── README.md
```

---

## 🔌 Ollama API 연동

### 사용 엔드포인트

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `GET` | `/api/tags` | 설치된 모델 목록 조회 |
| `POST` | `/api/chat` | 스트리밍 채팅 요청 |

### 요청 예시

```javascript
// 모델 목록 조회
const response = await fetch('/api/tags');
const data = await response.json();
console.log(data.models);

// 채팅 요청 (스트리밍)
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llama3.2',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' }
    ],
    stream: true
  })
});
```

---

## 🛠️ 기술 스택

| 카테고리 | 기술 |
|---------|------|
| **Frontend** | React 18, CSS3 |
| **AI/LLM** | Ollama (로컬 실행) |
| **빌드 도구** | Create React App, Webpack |
| **개발 환경** | Node.js, npm |

---

## 📜 사용 가능한 스크립트

```bash
# 개발 서버 실행
npm start

# 프로덕션 빌드
npm run build

# 테스트 실행
npm test

# eject (권장하지 않음)
npm run eject
```

---

## 🏗️ 프로덕션 빌드

```bash
npm run build
```

최적화된 프로덕션 번들이 `build/` 폴더에 생성됩니다.

### 배포 옵션
- **정적 호스팅**: Vercel, Netlify, GitHub Pages
- **서버 배포**: Nginx, Apache와 함께 정적 파일 서빙
- **컨테이너**: Docker 이미지로 패키징

---

## 🐛 문제 해결

### Ollama 연결 실패
```bash
# Ollama 서버가 실행 중인지 확인
ollama list

# 서버 재시작
ollama serve
```

### 모델이 표시되지 않음
```bash
# 모델 다운로드 확인
ollama list

# 모델 다운로드
ollama pull llama3.2
```

### 포트 충돌
`package.json`의 `proxy` 설정에서 Ollama 포트를 확인하세요 (기본값: `11434`).

---

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

## 👤 작성자

**Lubib0ng**

- GitHub: [@Lubib0ng](https://github.com/Lubib0ng)
- Email: 1234tmddnjs9819@gmail.com

---

## 🙏 감사의 말

- [Ollama](https://ollama.com/) — 로컬 LLM 실행 환경
- [React](https://reactjs.org/) — UI 프레임워크
- [Create React App](https://create-react-app.dev/) — 프로젝트 부트스트랩

---

<div align="center">
  <strong>⭐ 이 프로젝트가 도움이 되었다면 Star를 눌러주세요!</strong>
</div>
