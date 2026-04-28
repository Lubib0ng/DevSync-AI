import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [selectedTech, setSelectedTech] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', content: string }
  const [inputText, setInputText] = useState('');
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState('checking');
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

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

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || ollamaLoading) return;
    if (!selectedModel) return;

    const userMsg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputText('');
    setOllamaLoading(true);

    // assistant 자리 미리 추가 (스트리밍용)
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: 'You are a helpful assistant for DevSync AI.' },
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
            const token = parsed.message?.content || '';
            accumulated += token;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: accumulated };
              return updated;
            });
          } catch {
            // 파싱 실패한 줄 무시
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

      <section className="section tech-stack">
        <div className="section-heading">
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
            <span>Ollama</span>
            <h2>AI 챗봇</h2>
          </div>
          <div className="chat-header-controls">
            <div className={`ollama-status ollama-status--${ollamaStatus}`}>
              <span className="ollama-status-dot" />
              {ollamaStatus === 'checking' && '확인 중...'}
              {ollamaStatus === 'online' && `연결됨`}
              {ollamaStatus === 'offline' && '오프라인'}
            </div>
            {ollamaModels.length > 0 && (
              <select
                className="ollama-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {ollamaModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
            {messages.length > 0 && (
              <button className="chat-clear-btn" onClick={clearChat} title="대화 초기화">
                초기화
              </button>
            )}
          </div>
        </div>

        {/* 메시지 목록 */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              <p>Ollama 로컬 모델에게 무엇이든 물어보세요.</p>
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