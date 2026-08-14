"""
Needle 2 Router Sidecar Service
Легковесный HTTP роутер для маршрутизации сообщений к инструментам (Actions).
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import re
import time

app = FastAPI(title="Needle 2 Router Sidecar", version="2.0.0")

class RouteRequest(BaseModel):
    message: str
    tools: List[Dict[str, Any]] = Field(default_factory=list)
    context: Optional[Dict[str, Any]] = None

class RouteResponse(BaseModel):
    type: str # "action" | "no_action"
    action: Optional[str] = None
    arguments: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 1.0
    latency_ms: float = 0.0

# Паттерны для быстрой и точной локальной маршрутизации
WEATHER_REGEX = re.compile(r'\b(погод[аеу]|дожд[ьяе]|градус[аов]?|температур[аеу]|пасмурно|солнечно|холодно|жарко|осадк[иов]|зонты?|прогноз)\b', re.IGNORECASE)
SPB_PLACES_REGEX = re.compile(r'\b(севкабель|слой|петроградк[аеу]|рубинштейна|новая голландия|фонтанк[аеу]|кафе|бар|кофейн[яе]|парк|ресторан|петербург|питер)\b', re.IGNORECASE)
SEARCH_REGEX = re.compile(r'\b(найди|поищи|загугли|погугли|что такое|кто так[ое|ая|ой]|расписание|новости|событи[яе]|где находится|когда|во сколько|актуальн|режим работы|афиша|билеты)\b', re.IGNORECASE)

@app.get("/health")
def health():
    return {"status": "ok", "service": "needle-router-2"}

@app.post("/v1/route", response_model=RouteResponse)
async def route_message(req: RouteRequest):
    start = time.time()
    msg = req.message.strip()
    available_tools = {t.get("name"): t for t in req.tools}

    # 1. Если список доступных инструментов пуст
    if not available_tools:
        return RouteResponse(
            type="no_action",
            action=None,
            arguments={},
            confidence=1.0,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 2. Проверка триггеров погоды
    if "weather" in available_tools and WEATHER_REGEX.search(msg):
        return RouteResponse(
            type="action",
            action="weather",
            arguments={"city": "Санкт-Петербург"},
            confidence=0.95,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 3. Проверка локаций Петербурга
    if "spb_places" in available_tools and SPB_PLACES_REGEX.search(msg):
        # Если вопрос чисто про карту / места
        match = SPB_PLACES_REGEX.search(msg)
        place_query = match.group(0) if match else msg
        return RouteResponse(
            type="action",
            action="spb_places",
            arguments={"query": place_query},
            confidence=0.90,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 4. Общий веб-поиск (события, актуальные факты, внешняя информация)
    if "web_search" in available_tools:
        if SEARCH_REGEX.search(msg) or "?" in msg or len(msg.split()) >= 4:
            # Очистка поискового запроса от мусорных слов
            clean_query = re.sub(r'^(найди|поищи|загугли|скажи|подскажи|слушай|лера|а)\s+', '', msg, flags=re.IGNORECASE).strip()
            if len(clean_query) >= 3 and not re.match(r'^(привет|как дела|что делаешь|ты кто|споки|доброе утро)', clean_query, re.IGNORECASE):
                return RouteResponse(
                    type="action",
                    action="web_search",
                    arguments={"query": clean_query},
                    confidence=0.88,
                    latency_ms=round((time.time() - start) * 1000, 2)
                )

    # 5. Обычный разговор (NO_ACTION)
    return RouteResponse(
        type="no_action",
        action=None,
        arguments={},
        confidence=0.95,
        latency_ms=round((time.time() - start) * 1000, 2)
    )
