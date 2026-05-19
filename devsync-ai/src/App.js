import React, { useState, useEffect, useRef } from 'react';
import Groq from 'groq-sdk';
import './App.css';

function App() {
  const [selectedTech, setSelectedTech] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState('checking');
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  // 채팅 모드
  const [chatMode, setChatMode] = useState('ollama'); // 'ollama' | 'groq'
  const [claudeModel, setClaudeModel] = useState('claude-3-5-sonnet-20241022'); // eslint-disable-line no-unused-vars
  const [claudeStatus, setClaudeStatus] = useState('checking'); // eslint-disable-line no-unused-vars
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [groqStatus, setGroqStatus] = useState('checking');

  const groqModels = [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (무료)' },
    { id: 'llama3-8b-8192',          name: 'Llama 3 8B (무료)'    },
    { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B (무료)'  },
    { id: 'gemma2-9b-it',            name: 'Gemma 2 9B (무료)'    },
    { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B Instant (무료)' },
  ];

  // Scout Agent state
  const [scoutArticles, setScoutArticles] = useState([]);
  const [scoutLoading, setScoutLoading] = useState(false);
  const [scoutError, setScoutError] = useState(null);
  const [scoutSource, setScoutSource] = useState('all');
  const [scoutStatus, setScoutStatus] = useState('idle'); // 'idle'|'loading'|'done'|'error'
  const [scoutCached, setScoutCached] = useState(false); // eslint-disable-line no-unused-vars
  const [scoutElapsed, setScoutElapsed] = useState(null);

  const techDescriptions = {
    LangChain: 'LangChain은 언어 모델을 기반으로 한 애플리케이션을 개발하기 위한 프레임워크입니다. 체인, 에이전트, 메모리 등의 개념을 제공하여 복잡한 AI 워크플로우를 구축할 수 있습니다.',
    LlamaIndex: 'LlamaIndex는 대규모 언어 모델과 데이터 소스를 연결하여 효율적인 검색 및 쿼리 기능을 제공하는 데이터 프레임워크입니다. RAG(Retrieval-Augmented Generation) 기술을 지원합니다.',
    Pinecone: 'Pinecone은 벡터 데이터베이스로, 고차원 벡터의 저장과 검색을 최적화하여 AI 애플리케이션의 검색 성능을 향상시킵니다. 실시간 벡터 유사성 검색을 제공합니다.',
    FastAPI: 'FastAPI는 Python 기반의 고성능 웹 프레임워크로, 비동기 처리를 지원하며 자동 API 문서 생성 기능을 갖추고 있습니다. RESTful API 개발에 적합합니다.',
    React: 'React는 사용자 인터페이스를 구축하기 위한 JavaScript 라이브러리로, 컴포넌트 기반 아키텍처를 통해 재사용 가능한 UI 요소를 만들 수 있습니다. 가상 DOM을 사용하여 효율적인 렌더링을 제공합니다.'
  };

  const agentDescriptions = {
    Orchestrator: '시스템의 전체적인 조율을 담당하는 에이전트로, 다른 에이전트들의 작업을 관리하고 조화롭게 운영합니다. 작업 분배와 결과 통합을 수행합니다.',
    'Scout Agent': '새로운 기술 트렌드와 정보를 실시간으로 탐색하는 에이전트입니다. 웹 크롤링과 데이터 수집을 통해 최신 정보를 수집합니다.',
    'Architect Agent': '시스템 아키텍처 설계와 코드 예제 생성을 담당하는 에이전트입니다. 사용자 수준에 맞는 다이어그램과 구현 가이드를 제공합니다.'
  };

  const techStack = ['LangChain', 'LlamaIndex', 'Pinecone', 'FastAPI', 'React'];
  const agents = ['Orchestrator', 'Scout Agent', 'Architect Agent'];

  // 채팅창 하단 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, ollamaLoading]);

  // Ollama 서버 상태 및 모델 목록 로드
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/tags');
        if (!res.ok) throw new Error('서버 응답 오류');
        const data = await res.json();
        const models = (data.models || []).map((m) => m.name);
        setOllamaModels(models);
        if (models.length > 0) setSelectedModel(models[0]);
        setOllamaStatus('online');
      } catch {
        setOllamaStatus('offline');
      }
    };
    fetchModels();
  }, []);

  // Claude API 키 상태 확인
  useEffect(() => {
    const checkClaude = async () => {
      try {
        const res = await fetch('http://localhost:8000/claude/status');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setClaudeStatus(data.configured ? 'ok' : 'error');
      } catch {
        setClaudeStatus('error');
      }
    };
    checkClaude();
  }, []);

  // Groq API 키 상태 확인 (환경변수 기반)
  useEffect(() => {
    const key = process.env.REACT_APP_GROQ_API_KEY;
    setGroqStatus(key ? 'ok' : 'error');
  }, []);

  const buildSystemPrompt = () => {
    const today = new Date().toISOString().slice(0, 10);

    // Scout Agent가 수집한 최신 기사를 컨텍스트로 구성
    let trendContext = '';
    if (scoutArticles.length > 0) {
      const lines = scoutArticles
        .slice(0, 40) // 토큰 절약을 위해 최대 40개
        .map((a, i) => {
          const meta = [a.points, a.comments].filter(Boolean).join(' | ');
          const tags = a.tags?.length ? `[${a.tags.join(', ')}]` : '';
          return `${i + 1}. [${a.source}] ${a.title}${tags ? ' ' + tags : ''}${meta ? ' (' + meta + ')' : ''}`;
        })
        .join('\n');

      trendContext = `\n\n## 오늘(${today}) Scout Agent가 수집한 최신 기술 트렌드\n${lines}\n\n위 목록은 Hacker News, DEV.to, GitHub Trending, Reddit, Lobste.rs에서 실시간 수집된 데이터입니다. 사용자가 트렌드나 최신 기술에 대해 질문하면 이 데이터를 근거로 구체적으로 답변하세요.`;
    }

    return `당신은 DevSync AI의 IT 기술 트렌드 전문 어시스턴트입니다.

## 역할과 전문성
- 최신 IT 기술 트렌드, 오픈소스, 개발 도구에 대한 정확하고 깊이 있는 설명을 제공합니다.
- LLM, RAG, 멀티 에이전트, 벡터 DB, MLOps 등 AI/ML 분야에 특히 정통합니다.
- 프론트엔드(React, Vue, Svelte), 백엔드(FastAPI, Node, Go), 인프라(Docker, K8s, Terraform) 전반을 다룹니다.
- 기술의 장단점, 실무 적용 방법, 다른 기술과의 비교를 명확하게 설명합니다.

## 답변 원칙
1. **정확성 우선**: 확실하지 않은 정보는 추측이라고 명시합니다.
2. **구체적 예시**: 추상적 설명보다 코드 예시나 실제 사례를 활용합니다.
3. **최신 데이터 활용**: 아래 Scout Agent 수집 데이터를 근거로 트렌드를 설명합니다.
4. **한국어 답변**: 사용자가 한국어로 질문하면 한국어로 답변합니다.
5. **구조화**: 복잡한 내용은 번호 목록, 소제목으로 정리합니다.
6. **출처 명시**: Scout 데이터 기반 답변 시 "[Hacker News 트렌드 기준]" 등으로 출처를 밝힙니다.

## 답변 금지 사항
- 근거 없는 추측을 사실처럼 제시하지 않습니다.
- 오래된 정보를 최신인 것처럼 말하지 않습니다.
- 지나치게 긴 서론 없이 핵심부터 답변합니다.${trendContext}`;
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || ollamaLoading) return;
    if (chatMode === 'ollama' && !selectedModel) return;

    const userMsg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputText('');
    setOllamaLoading(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      if (chatMode === 'groq') {
        // ── Groq SDK 직접 호출 (백엔드 불필요) ──
        const apiKey = process.env.REACT_APP_GROQ_API_KEY;
        if (!apiKey) throw new Error('GROQ API 키가 설정되지 않았습니다.');

        const groqClient = new Groq({
          apiKey,
          dangerouslyAllowBrowser: true,
        });

        const stream = await groqClient.chat.completions.create({
          model: groqModel,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            ...nextMessages.map(m => ({ role: m.role, content: m.content })),
          ],
          max_tokens: 2048,
          stream: true,
        });

        let accumulated = '';
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || '';
          if (token) {
            accumulated += token;
            const snap = accumulated;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: snap };
              return updated;
            });
          }
        }

      } else {
        // ── Ollama API (로컬 전용) ──
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: 'system', content: buildSystemPrompt() },
              ...nextMessages
            ],
            stream: true
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || response.statusText);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.error) throw new Error(parsed.error);
              const token = parsed.message?.content || '';
              if (token) {
                accumulated += token;
                const snap = accumulated;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: snap };
                  return updated;
                });
              }
            } catch (parseErr) {
              if (parseErr.message && !parseErr.message.includes('JSON')) {
                throw parseErr;
              }
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `⚠️ 오류: ${error.message}`,
          isError: true
        };
        return updated;
      });
    } finally {
      setOllamaLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => setMessages([]);

  // Scout Agent 크롤링
  const runScout = async (sourceOverride) => {
    const source = sourceOverride ?? scoutSource;
    const startTime = Date.now();
    setScoutLoading(true);
    setScoutStatus('loading');
    setScoutError(null);
    setScoutArticles([]);
    setScoutCached(false);
    setScoutElapsed(null);

    try {
      const res = await fetch(`http://localhost:8000/scout/crawl?source=${source}`);
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
      const data = await res.json();
      setScoutArticles(data);
      setScoutStatus('done');
      setScoutElapsed(((Date.now() - startTime) / 1000).toFixed(2));
    } catch (e) {
      setScoutError(e.message);
      setScoutStatus('error');
    } finally {
      setScoutLoading(false);
    }
  };

  const handleScoutTabChange = (key) => {
    setScoutSource(key);
    // 이미 크롤링 결과가 있으면 탭 변경 시 즉시 재크롤링
    if (scoutStatus === 'done' || scoutStatus === 'error') {
      runScout(key);
    }
  };

  const SOURCE_LABELS = {
    all:         '전체',
    hackernews:  'Hacker News',
    devto:       'DEV.to',
    github:      'GitHub',
    reddit:      'Reddit',
    lobsters:    'Lobste.rs',
  };

  const SOURCE_COLORS = {
    'Hacker News':           { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
    'DEV.to':                { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
    'GitHub Trending':       { bg: '#f0f9ff', color: '#075985', border: '#bae6fd' },
    'Reddit r/programming':  { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
    'Lobste.rs':             { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' },
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-copy">
          <p className="eyebrow">Premium AI Engineering Experience</p>
          <h1>DevSync AI</h1>
          <p className="hero-text">IT 기술 문서와 최신 개발 트렌드를 실시간으로 큐레이션하며, 실무에 바로 적용할 수 있는 코드 예제와 아키텍처 설계를 제공합니다.</p>
        </div>
        <div className="hero-metrics">
          <div className="metric-card">
            <strong>Realtime</strong>
            <span>실시간 트렌드 분석</span>
          </div>
          <div className="metric-card">
            <strong>Multi-Agent</strong>
            <span>Orchestrator 기반 오케스트레이션</span>
          </div>
          <div className="metric-card">
            <strong>RAG Ready</strong>
            <span>데이터 중심 지식 기반 확장</span>
          </div>
        </div>
      </header>

      <section className="section architecture">
        <div className="section-heading">
          <span>Architecture</span>
          <h2>멀티 에이전트 시스템</h2>
        </div>
        <p className="section-intro">DevSync AI는 각각의 역할을 가진 에이전트가 협력하는 구조로 설계되어, 빠르고 신뢰도 높은 정보를 제공합니다.</p>
        <div className="agent-list">
          {agents.map(agent => (
            <div
              key={agent}
              className={`agent-item ${selectedAgent === agent ? 'active' : ''}`}
              onClick={() => setSelectedAgent(agent)}
            >
              <strong>{agent}</strong>
            </div>
          ))}
        </div>
        {selectedAgent && (
          <div className="agent-description">
            <h4>{selectedAgent}</h4>
            <p>{agentDescriptions[selectedAgent]}</p>
          </div>
        )}
      </section>

      {/* ── Scout Agent ── */}
      <section className="section scout-section">
        <div className="section-heading">
          <span>Scout Agent</span>
          <h2>실시간 기술 트렌드</h2>
        </div>
        <p className="section-intro">
          Scout Agent가 Hacker News, DEV.to, GitHub, Reddit, Lobste.rs를 병렬로 크롤링합니다.
          결과는 5분간 캐싱됩니다.
        </p>

        <div className="scout-controls">
          <div className="scout-source-tabs">
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <button
                key={key}
                className={`scout-tab ${scoutSource === key ? 'active' : ''}`}
                onClick={() => handleScoutTabChange(key)}
                disabled={scoutLoading}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="scout-actions">
            <button className="scout-run-btn" onClick={() => runScout(scoutSource)} disabled={scoutLoading}>
              {scoutLoading
                ? <><span className="scout-spinner" /> 크롤링 중...</>
                : '🔍 크롤링 시작'}
            </button>
          </div>
        </div>

        {scoutStatus === 'idle' && (
          <div className="scout-empty">
            <div className="scout-empty-icon">🛰️</div>
            <p>크롤링 시작 버튼을 눌러 최신 기술 트렌드를 수집하세요.</p>
            <p className="scout-empty-hint">5개 소스를 병렬로 수집 · 5분 캐싱 · 재시도 로직 내장</p>
          </div>
        )}

        {scoutStatus === 'loading' && (
          <div className="scout-empty">
            <div className="scout-empty-icon">⏳</div>
            <p>5개 소스를 병렬로 수집하고 있습니다...</p>
          </div>
        )}

        {scoutStatus === 'done' && scoutArticles.length === 0 && (
          <div className="scout-empty">
            <div className="scout-empty-icon">🔎</div>
            <p>수집된 결과가 없습니다. 잠시 후 다시 시도해주세요.</p>
          </div>
        )}

        {scoutError && (
          <div className="scout-error">
            ⚠️ {scoutError}
            <span> — 백엔드 서버가 실행 중인지 확인하세요.</span>
          </div>
        )}

        {scoutArticles.length > 0 && (
          <>
            <div className="scout-result-meta">
              <span className="scout-result-count">
                총 <strong>{scoutArticles.length}개</strong> 수집
              </span>
              {scoutElapsed && (
                <span className="scout-elapsed">⚡ {scoutElapsed}s</span>
              )}
              <span className="scout-cache-badge">
                🗄️ 5분 캐시 적용
              </span>
            </div>
            <div className="scout-list-wrapper">
              <div className="scout-list">
                {scoutArticles.map((article, i) => {
                  const style = SOURCE_COLORS[article.source] || { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
                  return (
                    <a
                      key={i}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="scout-card"
                    >
                      <div className="scout-card-top">
                        <span className="scout-source-badge" style={{ background: style.bg, color: style.color, borderColor: style.border }}>
                          {article.source}
                        </span>
                        <span className="scout-card-meta">
                          {article.points && <span>{article.points}</span>}
                          {article.comments && <span>{article.comments}</span>}
                        </span>
                      </div>
                      <p className="scout-card-title">{article.title}</p>
                      {article.description && (
                        <p className="scout-card-desc">{article.description}</p>
                      )}
                      <div className="scout-card-footer">
                        {article.author && (
                          <span className="scout-card-author">👤 {article.author}</span>
                        )}
                        {article.published && (
                          <span className="scout-card-time">🕐 {article.published.slice(0, 10)}</span>
                        )}
                        {article.tags && article.tags.length > 0 && (
                          <div className="scout-card-tags">
                            {article.tags.slice(0, 3).map((tag, ti) => (
                              <span key={ti} className="scout-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="section tech-stack">        <div className="section-heading">
          <span>Technology</span>
          <h2>핵심 기술 스택</h2>
        </div>
        <p className="section-intro">AI 기반 RAG 워크플로우를 구성하는 주요 기술을 클릭하여 각각의 역할을 확인해보세요.</p>
        <div className="tech-buttons">
          {techStack.map(tech => (
            <button
              key={tech}
              onClick={() => setSelectedTech(tech)}
              className={`tech-button ${selectedTech === tech ? 'active' : ''}`}
            >
              {tech}
            </button>
          ))}
        </div>
        {selectedTech && (
          <div className="tech-description">
            <h3>{selectedTech}</h3>
            <p>{techDescriptions[selectedTech]}</p>
          </div>
        )}
      </section>

      <section className="section ollama-section">
        <div className="chat-header">
          <div className="section-heading">
            <span>AI Chat</span>
            <h2>AI 챗봇</h2>
          </div>
          <div className="chat-header-controls">
            {/* 모드 전환 토글 */}
            <div className="chat-mode-toggle">
              <button className={`chat-mode-btn ${chatMode === 'ollama' ? 'active' : ''}`}
                onClick={() => { setChatMode('ollama'); setMessages([]); }}>
                🦙 Ollama
              </button>
              <button className={`chat-mode-btn ${chatMode === 'groq' ? 'active' : ''}`}
                onClick={() => { setChatMode('groq'); setMessages([]); }}>
                ⚡ Groq
              </button>
            </div>

            {/* 연결 상태 배지 */}
            {chatMode === 'ollama' && (
              <div className={`ollama-status ollama-status--${ollamaStatus}`}>
                <span className="ollama-status-dot" />
                {ollamaStatus === 'checking' && '확인 중...'}
                {ollamaStatus === 'online' && '연결됨'}
                {ollamaStatus === 'offline' && '오프라인'}
              </div>
            )}
            {chatMode === 'groq' && (
              <div className={`ollama-status ollama-status--${groqStatus === 'ok' ? 'online' : groqStatus === 'checking' ? 'checking' : 'offline'}`}>
                <span className="ollama-status-dot" />
                {groqStatus === 'checking' && '확인 중...'}
                {groqStatus === 'ok' && '연결됨'}
                {groqStatus === 'error' && 'API 키 없음'}
              </div>
            )}

            {/* 모델 선택 */}
            {chatMode === 'ollama' && ollamaModels.length > 0 && (
              <select className="ollama-model-select" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {chatMode === 'groq' && (
              <select className="ollama-model-select" value={groqModel} onChange={(e) => setGroqModel(e.target.value)}>
                {groqModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}

            {/* 학습 완료 배지 */}
            {scoutArticles.length > 0 ? (
              <div className="chat-trained-badge">
                <span className="chat-trained-dot" />
                학습 완료 · {scoutArticles.length}개
              </div>
            ) : (
              <div className="chat-untrained-badge">
                미학습
              </div>
            )}

            {messages.length > 0 && (
              <button className="chat-clear-btn" onClick={clearChat}>초기화</button>
            )}
          </div>
        </div>

        {/* 메시지 목록 */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              {scoutArticles.length > 0 ? (
                <>
                  <p>Scout Agent의 최신 트렌드 <strong>{scoutArticles.length}개</strong>가 학습됐어요.</p>
                  <p className="chat-empty-hint">최신 기술 트렌드, 인기 오픈소스, 개발 이슈를 물어보세요.</p>
                </>
              ) : (
                <>
                  <p>Ollama 로컬 모델에게 무엇이든 물어보세요.</p>
                  <p className="chat-empty-hint">Scout Agent로 트렌드를 수집하면 최신 데이터 기반 답변이 가능해요.</p>
                </>
              )}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`chat-bubble-row chat-bubble-row--${msg.role}`}>
              <div className={`chat-avatar chat-avatar--${msg.role}`}>
                {msg.role === 'user' ? '나' : 'AI'}
              </div>
              <div className={`chat-bubble chat-bubble--${msg.role}${msg.isError ? ' chat-bubble--error' : ''}`}>
                {msg.content
                  ? msg.content
                  : (msg.role === 'assistant'
                      ? <span className="chat-typing"><span /><span /><span /></span>
                      : '')
                }
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* 입력창 */}
        <div className={`chat-input-area${ollamaStatus !== 'online' ? ' chat-input-area--disabled' : ''}`}>
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={inputText}
            rows={1}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ollamaStatus === 'online' ? '메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)' : 'Ollama 서버가 오프라인입니다. ollama serve를 실행해주세요.'}
            disabled={ollamaStatus !== 'online' || ollamaLoading}
          />
          <button
            className="chat-send-btn"
            onClick={sendMessage}
            disabled={ollamaLoading || ollamaStatus !== 'online' || !inputText.trim()}
            aria-label="전송"
          >
            ↑
          </button>
        </div>
      </section>

      <section className="section feature-grid">
        <div className="feature-card">
          <h3>Industry Impact</h3>
          <p>IT 산업의 변화 속에서 온보딩을 줄이고 연구 비용을 절감하며, 기업 지식 베이스와 통합 가능합니다.</p>
        </div>
        <div className="feature-card">
          <h3>Career Growth</h3>
          <p>최신 LLM 기반 RAG 및 멀티 에이전트 설계 경험으로 포트폴리오 가치를 높일 수 있습니다.</p>
        </div>
        <div className="feature-card">
          <h3>Scalable Design</h3>
          <p>모듈형 에이전트와 확장 가능한 기술 스택으로 레거시 시스템 분석까지 확장 가능합니다.</p>
        </div>
      </section>

      <footer className="App-footer">
        <p>DevSync AI © 2026 · 실무 중심 AI 기술 큐레이션</p>
      </footer>
    </div>
  );
}

export default App;