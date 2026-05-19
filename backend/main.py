from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from bs4 import BeautifulSoup
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import asyncio
import logging
import os
import json
from dotenv import load_dotenv
import anthropic
from groq import Groq

load_dotenv(dotenv_path="backend/.env")

# ── 로깅 설정 ──
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("scout-agent")

app = FastAPI(
    title="DevSync AI - Scout Agent",
    description="전문적인 기술 트렌드 크롤링 에이전트",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 모든 출처 허용 (Vercel, 로컬 등)
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 모델 ──
class Article(BaseModel):
    title: str
    url: str
    source: str
    points: str = ""
    comments: str = ""
    published: Optional[str] = None
    tags: List[str] = []
    author: Optional[str] = None
    description: Optional[str] = None

# ── 메모리 캐시 (TTL 5분) ──
cache_store: dict = {}
CACHE_TTL = 300

def get_cache(key: str) -> Optional[List[Article]]:
    if key in cache_store:
        data, ts = cache_store[key]
        if datetime.now() - ts < timedelta(seconds=CACHE_TTL):
            logger.info(f"Cache HIT: {key}")
            return data
        del cache_store[key]
    return None

def set_cache(key: str, data: List[Article]):
    cache_store[key] = (data, datetime.now())
    logger.info(f"Cache SET: {key} ({len(data)} items)")

# ── 재시도 래퍼 ──
async def fetch_with_retry(
    client: httpx.AsyncClient,
    url: str,
    retries: int = 2,
    timeout: int = 12,
    **kwargs
) -> Optional[httpx.Response]:
    for attempt in range(retries):
        try:
            res = await client.get(url, timeout=timeout, **kwargs)
            res.raise_for_status()
            return res
        except Exception as e:
            logger.warning(f"[Retry {attempt+1}/{retries}] {url} — {e}")
            if attempt < retries - 1:
                await asyncio.sleep(1.5 * (attempt + 1))
    logger.error(f"Failed: {url}")
    return None

# ══════════════════════════════════════════════════════════
# 크롤러
# ══════════════════════════════════════════════════════════

async def crawl_hackernews(client: httpx.AsyncClient) -> List[Article]:
    logger.info("Crawling Hacker News...")
    res = await fetch_with_retry(client, "https://news.ycombinator.com/")
    if not res:
        return []

    soup = BeautifulSoup(res.text, "html.parser")
    articles = []

    for row in soup.select("tr.athing")[:20]:
        title_tag = row.select_one("span.titleline > a")
        if not title_tag:
            continue

        title = title_tag.get_text(strip=True)
        url = title_tag.get("href", "")
        if url.startswith("item?"):
            url = f"https://news.ycombinator.com/{url}"

        subrow = row.find_next_sibling("tr")
        points = author = published = comments = ""

        if subrow:
            if s := subrow.select_one("span.score"):
                points = s.get_text(strip=True)
            if u := subrow.select_one("a.hnuser"):
                author = u.get_text(strip=True)
            if a := subrow.select_one("span.age"):
                published = a.get("title", a.get_text(strip=True))[:10]
            for a_tag in subrow.select("a"):
                if "comment" in a_tag.get_text().lower():
                    comments = a_tag.get_text(strip=True)
                    break

        articles.append(Article(
            title=title, url=url, source="Hacker News",
            points=points, comments=comments,
            author=author, published=published,
        ))

    logger.info(f"Hacker News: {len(articles)}")
    return articles


async def crawl_devto(client: httpx.AsyncClient) -> List[Article]:
    logger.info("Crawling DEV.to...")
    res = await fetch_with_retry(
        client,
        "https://dev.to/api/articles?top=7&per_page=15",
        headers={"Accept": "application/json"},
    )
    if not res:
        return []

    articles = []
    for item in res.json():
        # tag_list는 항상 문자열 리스트
        raw_tags = item.get("tag_list", [])
        tags = raw_tags if isinstance(raw_tags, list) else []
        tags = [t for t in tags if isinstance(t, str)][:3]

        pub = item.get("published_at", "")
        if pub:
            pub = pub[:10]

        articles.append(Article(
            title=item.get("title", ""),
            url=item.get("url", ""),
            source="DEV.to",
            points=f"❤️ {item.get('positive_reactions_count', 0)}",
            comments=f"💬 {item.get('comments_count', 0)}",
            author=item.get("user", {}).get("name", ""),
            published=pub,
            tags=tags,
            description=(item.get("description") or "")[:120],
        ))

    logger.info(f"DEV.to: {len(articles)}")
    return articles


async def crawl_github_trending(client: httpx.AsyncClient) -> List[Article]:
    logger.info("Crawling GitHub Trending...")
    res = await fetch_with_retry(
        client,
        "https://github.com/trending",
        headers={"Accept-Language": "en-US"},
    )
    if not res:
        return []

    soup = BeautifulSoup(res.text, "html.parser")
    articles = []

    for repo in soup.select("article.Box-row")[:15]:
        h2 = repo.select_one("h2 a")
        if not h2:
            continue

        path = h2.get("href", "").strip()
        title = path.lstrip("/").replace("/", " / ")
        url = f"https://github.com{path}"

        desc = ""
        if p := repo.select_one("p"):
            desc = p.get_text(strip=True)

        stars = ""
        if s := repo.select_one("a[href$='/stargazers']"):
            stars = s.get_text(strip=True)

        lang = ""
        if l := repo.select_one("span[itemprop='programmingLanguage']"):
            lang = l.get_text(strip=True)

        today = ""
        if t := repo.select_one("span.d-inline-block.float-sm-right"):
            today = t.get_text(strip=True)

        articles.append(Article(
            title=title, url=url, source="GitHub Trending",
            points=f"⭐ {stars}" if stars else "",
            comments=today,
            tags=[lang] if lang else [],
            description=desc[:100] + ("..." if len(desc) > 100 else ""),
        ))

    logger.info(f"GitHub Trending: {len(articles)}")
    return articles


async def crawl_reddit(client: httpx.AsyncClient) -> List[Article]:
    logger.info("Crawling Reddit r/programming...")
    res = await fetch_with_retry(
        client,
        "https://www.reddit.com/r/programming/hot.json?limit=15",
        headers={"User-Agent": "DevSync-AI-Scout/2.1 (educational project)"},
    )
    if not res:
        return []

    articles = []
    for post in res.json().get("data", {}).get("children", []):
        item = post.get("data", {})
        if item.get("stickied"):   # 공지 제외
            continue

        ts = item.get("created_utc", 0)
        pub = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d") if ts else ""

        articles.append(Article(
            title=item.get("title", ""),
            url=item.get("url", ""),
            source="Reddit r/programming",
            points=f"⬆️ {item.get('ups', 0):,}",
            comments=f"💬 {item.get('num_comments', 0)}",
            author=item.get("author", ""),
            published=pub,
        ))

    logger.info(f"Reddit: {len(articles)}")
    return articles


async def crawl_lobsters(client: httpx.AsyncClient) -> List[Article]:
    """Lobste.rs — HN 스타일 기술 링크 공유 사이트 (JSON API 제공)"""
    logger.info("Crawling Lobste.rs...")
    res = await fetch_with_retry(
        client,
        "https://lobste.rs/hottest.json",
        headers={"Accept": "application/json"},
    )
    if not res:
        return []

    articles = []
    for item in res.json()[:15]:
        tags = item.get("tags", [])[:3]
        pub = (item.get("created_at") or "")[:10]

        articles.append(Article(
            title=item.get("title", ""),
            url=item.get("url") or f"https://lobste.rs{item.get('short_id_url', '')}",
            source="Lobste.rs",
            points=f"▲ {item.get('score', 0)}",
            comments=f"💬 {item.get('comment_count', 0)}",
            author=item.get("submitter_user", {}).get("username", ""),
            published=pub,
            tags=tags,
            description=(item.get("description") or "")[:120],
        ))

    logger.info(f"Lobste.rs: {len(articles)}")
    return articles

# ══════════════════════════════════════════════════════════
# 소스 맵
# ══════════════════════════════════════════════════════════

CRAWLERS = {
    "hackernews": crawl_hackernews,
    "devto":      crawl_devto,
    "github":     crawl_github_trending,
    "reddit":     crawl_reddit,
    "lobsters":   crawl_lobsters,
}

# ══════════════════════════════════════════════════════════
# API 엔드포인트
# ══════════════════════════════════════════════════════════

@app.get("/scout/crawl", response_model=List[Article])
async def crawl_endpoint(source: str = "all"):
    """
    source: "all" | "hackernews" | "devto" | "github" | "reddit" | "lobsters"
    """
    cache_key = f"crawl_{source}"
    if cached := get_cache(cache_key):
        return cached

    async with httpx.AsyncClient(
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (DevSync AI Scout/2.1)"},
        timeout=15.0,
    ) as client:
        if source == "all":
            selected = list(CRAWLERS.values())
        elif source in CRAWLERS:
            selected = [CRAWLERS[source]]
        else:
            selected = list(CRAWLERS.values())

        results_list = await asyncio.gather(
            *[fn(client) for fn in selected],
            return_exceptions=True,
        )

        results: List[Article] = []
        for r in results_list:
            if isinstance(r, list):
                results.extend(r)
            else:
                logger.error(f"Crawler exception: {r}")

    # 결과가 없어도 빈 배열 반환 (503 제거)
    if results:
        set_cache(cache_key, results)

    return results


@app.get("/scout/sources")
async def get_sources():
    return {
        "sources": [
            {"id": "all",         "name": "전체",                  "description": "모든 소스 통합"},
            {"id": "hackernews",  "name": "Hacker News",           "description": "기술 뉴스 커뮤니티"},
            {"id": "devto",       "name": "DEV.to",                "description": "개발자 블로그 플랫폼"},
            {"id": "github",      "name": "GitHub Trending",       "description": "트렌딩 오픈소스"},
            {"id": "reddit",      "name": "Reddit r/programming",  "description": "프로그래밍 서브레딧"},
            {"id": "lobsters",    "name": "Lobste.rs",             "description": "기술 링크 공유 커뮤니티"},
        ]
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "2.1.0",
        "cache_entries": len(cache_store),
        "sources": list(CRAWLERS.keys()),
    }


@app.post("/scout/clear-cache")
async def clear_cache_endpoint():
    cache_store.clear()
    logger.info("Cache cleared")
    return {"message": "Cache cleared"}

# ══════════════════════════════════════════════════════════
# Claude API 엔드포인트
# ══════════════════════════════════════════════════════════

class ChatMessage(BaseModel):
    role: str      # "user" | "assistant" | "system"
    content: str

class ClaudeChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "claude-3-5-sonnet-20241022"
    max_tokens: int = 2048
    system: Optional[str] = None

@app.post("/claude/chat")
async def claude_chat(req: ClaudeChatRequest):
    """
    Claude API 스트리밍 채팅 엔드포인트.
    API 키는 backend/.env의 ANTHROPIC_API_KEY에서 로드합니다.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or not api_key.startswith("sk-ant-"):
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY가 설정되지 않았습니다. backend/.env 파일을 확인하세요."
        )

    # system 메시지 분리 (Anthropic API는 system을 별도 파라미터로 받음)
    system_prompt = req.system or ""
    user_messages = []
    for m in req.messages:
        if m.role == "system":
            system_prompt = m.content  # 마지막 system 메시지 사용
        else:
            user_messages.append({"role": m.role, "content": m.content})

    if not user_messages:
        raise HTTPException(status_code=400, detail="메시지가 없습니다.")

    async def stream_generator():
        try:
            client = anthropic.Anthropic(api_key=api_key)
            kwargs = dict(
                model=req.model,
                max_tokens=req.max_tokens,
                messages=user_messages,
            )
            if system_prompt:
                kwargs["system"] = system_prompt

            with client.messages.stream(**kwargs) as stream:
                for text in stream.text_stream:
                    chunk = json.dumps({
                        "message": {"role": "assistant", "content": text},
                        "done": False
                    }, ensure_ascii=False)
                    yield (chunk + "\n").encode("utf-8")

            yield (json.dumps({"message": {"role": "assistant", "content": ""}, "done": True}, ensure_ascii=False) + "\n").encode("utf-8")

        except anthropic.AuthenticationError:
            yield (json.dumps({"error": "API 키가 유효하지 않습니다."}, ensure_ascii=False) + "\n").encode("utf-8")
        except anthropic.RateLimitError:
            yield (json.dumps({"error": "API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."}, ensure_ascii=False) + "\n").encode("utf-8")
        except anthropic.APIError as e:
            yield (json.dumps({"error": f"Claude API 오류: {str(e)}"}, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(stream_generator(), media_type="application/x-ndjson; charset=utf-8")


@app.get("/claude/models")
async def claude_models():
    """사용 가능한 Claude 모델 목록"""
    return {
        "models": [
            {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "description": "최신 · 빠름 · 균형잡힌 성능 (권장)"},
            {"id": "claude-3-5-haiku-20241022",  "name": "Claude 3.5 Haiku",  "description": "가장 빠름 · 저비용"},
            {"id": "claude-opus-4-5",            "name": "Claude Opus 4.5",   "description": "최고 성능 · 복잡한 작업"},
        ]
    }


@app.get("/claude/status")
async def claude_status():
    """Claude API 키 설정 여부 확인"""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    configured = bool(api_key and api_key.startswith("sk-ant-"))
    return {
        "configured": configured,
        "message": "API 키가 설정되어 있습니다." if configured else "backend/.env에 ANTHROPIC_API_KEY를 설정하세요."
    }


# ══════════════════════════════════════════════════════════
# Gemini API 엔드포인트
# ══════════════════════════════════════════════════════════

@app.post("/gemini/chat")
async def gemini_chat(req: ClaudeChatRequest):
    """
    Google Gemini 스트리밍 채팅.
    API 키: backend/.env의 GEMINI_API_KEY
    무료 모델: gemini-1.5-flash, gemini-1.5-flash-8b
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY가 설정되지 않았습니다. backend/.env 파일을 확인하세요."
        )

    # system + user 메시지 분리
    system_prompt = req.system or ""
    for m in req.messages:
        if m.role == "system":
            system_prompt = m.content

    async def stream_generator():
        try:
            from google import genai as new_genai
            from google.genai import types

            client = new_genai.Client(api_key=api_key)

            # 히스토리 구성 (마지막 user 제외)
            last_user = next(
                (m.content for m in reversed(req.messages) if m.role == "user"), ""
            )
            history = []
            for m in req.messages:
                if m.role == "system":
                    continue
                if m.content == last_user and m.role == "user":
                    continue
                role = "model" if m.role == "assistant" else "user"
                history.append(types.Content(role=role, parts=[types.Part(text=m.content)]))

            config = types.GenerateContentConfig(
                system_instruction=system_prompt if system_prompt else None,
                max_output_tokens=req.max_tokens,
            )

            response = client.models.generate_content_stream(
                model=req.model,
                contents=history + [types.Content(role="user", parts=[types.Part(text=last_user)])],
                config=config,
            )

            for chunk in response:
                text = chunk.text if hasattr(chunk, "text") and chunk.text else ""
                if text:
                    yield (json.dumps({
                        "message": {"role": "assistant", "content": text},
                        "done": False
                    }, ensure_ascii=False) + "\n").encode("utf-8")

            yield (json.dumps({"message": {"role": "assistant", "content": ""}, "done": True}, ensure_ascii=False) + "\n").encode("utf-8")

        except Exception as e:
            logger.error(f"Gemini error: {e}")
            yield (json.dumps({"error": f"Gemini 오류: {str(e)}"}, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(stream_generator(), media_type="application/x-ndjson; charset=utf-8")


@app.get("/gemini/models")
async def gemini_models():
    return {
        "models": [
            {"id": "gemini-1.5-flash",    "name": "Gemini 1.5 Flash",    "description": "무료 · 빠름 · 균형 (권장)"},
            {"id": "gemini-1.5-flash-8b", "name": "Gemini 1.5 Flash 8B", "description": "무료 · 가장 빠름 · 경량"},
            {"id": "gemini-1.5-pro",      "name": "Gemini 1.5 Pro",      "description": "고성능 · 유료"},
            {"id": "gemini-2.0-flash",    "name": "Gemini 2.0 Flash",    "description": "최신 · 무료 티어"},
        ]
    }


@app.get("/gemini/status")
async def gemini_status():
    api_key = os.getenv("GEMINI_API_KEY", "")
    configured = bool(api_key)
    return {
        "configured": configured,
        "message": "API 키가 설정되어 있습니다." if configured else "backend/.env에 GEMINI_API_KEY를 설정하세요."
    }


# ══════════════════════════════════════════════════════════
# Groq API 엔드포인트
# ══════════════════════════════════════════════════════════

@app.post("/groq/chat")
async def groq_chat(req: ClaudeChatRequest):
    """
    Groq 스트리밍 채팅.
    API 키: backend/.env의 GROQ_API_KEY
    무료 모델: llama3-8b-8192, llama3-70b-8192, mixtral-8x7b-32768, gemma2-9b-it
    """
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY가 설정되지 않았습니다. backend/.env 파일을 확인하세요."
        )

    # messages 구성 (system 포함)
    groq_messages = []
    system_prompt = req.system or ""

    for m in req.messages:
        if m.role == "system":
            system_prompt = m.content
        else:
            groq_messages.append({"role": m.role, "content": m.content})

    if system_prompt:
        groq_messages.insert(0, {"role": "system", "content": system_prompt})

    async def stream_generator():
        try:
            client = Groq(api_key=api_key)
            stream = client.chat.completions.create(
                model=req.model,
                messages=groq_messages,
                max_tokens=req.max_tokens,
                stream=True,
            )

            for chunk in stream:
                delta = chunk.choices[0].delta
                text = delta.content or ""
                if text:
                    yield (json.dumps({
                        "message": {"role": "assistant", "content": text},
                        "done": False
                    }, ensure_ascii=False) + "\n").encode("utf-8")

            yield (json.dumps({"message": {"role": "assistant", "content": ""}, "done": True}, ensure_ascii=False) + "\n").encode("utf-8")

        except Exception as e:
            logger.error(f"Groq error: {e}")
            yield (json.dumps({"error": f"Groq 오류: {str(e)}"}, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(stream_generator(), media_type="application/x-ndjson; charset=utf-8")


@app.get("/groq/models")
async def groq_models():
    return {
        "models": [
            {"id": "llama-3.3-70b-versatile",  "name": "Llama 3.3 70B",      "description": "무료 · 최신 · 고성능 (권장)"},
            {"id": "llama3-8b-8192",            "name": "Llama 3 8B",         "description": "무료 · 매우 빠름 · 경량"},
            {"id": "mixtral-8x7b-32768",        "name": "Mixtral 8x7B",       "description": "무료 · 긴 컨텍스트"},
            {"id": "gemma2-9b-it",              "name": "Gemma 2 9B",         "description": "무료 · Google 오픈소스"},
            {"id": "llama-3.1-8b-instant",      "name": "Llama 3.1 8B Instant","description": "무료 · 초고속"},
        ]
    }


@app.get("/groq/status")
async def groq_status():
    api_key = os.getenv("GROQ_API_KEY", "")
    configured = bool(api_key)
    return {
        "configured": configured,
        "message": "API 키가 설정되어 있습니다." if configured else "backend/.env에 GROQ_API_KEY를 설정하세요."
    }


@app.get("/ai/all-status")
async def all_ai_status():
    """모든 AI 서비스 키 설정 상태 한번에 확인"""
    return {
        "claude":  bool(os.getenv("ANTHROPIC_API_KEY", "").startswith("sk-ant-")),
        "gemini":  bool(os.getenv("GEMINI_API_KEY", "")),
        "groq":    bool(os.getenv("GROQ_API_KEY", "")),
    }
