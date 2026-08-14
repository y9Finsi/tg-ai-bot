"""
Needle 2 Unified Router Sidecar Service (Cactus Compute Architecture)
Мгновенно классифицирует диалоговые намерения (CASUAL/EROTIC/JOKE/REACTION)
и маршрутизирует действия (Actions) с калиброванным confidence.
"""

from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import re
import time

app = FastAPI(title="Needle 2 Unified Router", version="2.0.0")

class RouteRequest(BaseModel):
    message: str
    tools: List[Dict[str, Any]] = Field(default_factory=list)
    history: Optional[List[Dict[str, Any]]] = None
    context: Optional[Dict[str, Any]] = None

class RouteResponse(BaseModel):
    type: str # "action" | "no_action"
    mode: str = "CASUAL" # "CASUAL" | "EROTIC" | "JOKE" | "REACTION"
    action: Optional[str] = None
    arguments: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 1.0
    reaction_emoji: Optional[str] = None
    latency_ms: float = 0.0

# Регулярные выражения для классификации намерений
EROTIC_REGEX = re.compile(r'\b(секс[а-я]*|трах[а-я]*|соси[а-я]*|член[а-я]*|сиськ[а-я]*|попк[а-я]*|грудь|голая|разденься|подроч[а-я]*|минет|эротик[а-я]*|возбужд[а-я]*|поцелуй|в постел[ьи]|шлепни)\b', re.IGNORECASE)
JOKE_REGEX = re.compile(r'\b(анекдот|шутк[ауи]|пошути|рассмеши|мем|прикол|рофл)\b', re.IGNORECASE)
REACTION_ONLY_REGEX = re.compile(r'^(ок|оки|пон|понял|ага|да|нет|хз|лол|кек|пхах|ахах|хаха|\)+|\(+|👍|❤️|🔥|😂|🥰|😘|😴|🌚)$', re.IGNORECASE)

# Паттерны навыков (Actions)
WEATHER_REGEX = re.compile(r'\b(погод[аеу]|дожд[ьяе]|градус[аов]?|температур[аеу]|пасмурно|солнечно|холодно|жарко|осадк[иов]|зонты?|прогноз)\b', re.IGNORECASE)
SPB_PLACES_REGEX = re.compile(r'\b(севкабель|слой|петроградк[аеу]|рубинштейна|новая голландия|фонтанк[аеу]|кофейн[яе]|кафе|бар[а-я]*|петербург|питер)\b', re.IGNORECASE)
SEARCH_REGEX = re.compile(r'\b(найди|поищи|загугли|погугли|что такое|кто так[ое|ая|ой]|расписание|новости|событи[яе]|где находится|когда|во сколько|актуальн|режим работы|афиша|билеты|концерт|происходит)\b', re.IGNORECASE)

@app.get("/health")
def health():
    return {"status": "ok", "service": "needle-unified-router-2"}

@app.post("/v1/route", response_model=RouteResponse)
async def route_message(req: RouteRequest):
    start = time.time()
    msg = req.message.strip()
    available_tools = {t.get("name"): t for t in req.tools}

    # 1. Определение диалогового режима (Mode)
    mode = "CASUAL"
    reaction_emoji = None

    if EROTIC_REGEX.search(msg):
        mode = "EROTIC"
    elif JOKE_REGEX.search(msg):
        mode = "JOKE"
    elif REACTION_ONLY_REGEX.search(msg) and len(msg) <= 10:
        mode = "REACTION"
        reaction_emoji = "❤️" if ("❤" in msg or "люблю" in msg) else "👍"

    # 2. Определение необходимости инструмента (Action Routing)
    # Если режим REACTION или короткий бытовой ответ — сразу no_action
    if mode == "REACTION" or (len(msg.split()) <= 2 and re.match(r'^(привет|хай|ку|добрый день|споки|спокойной ночи|как дела|что делаешь)', msg, re.IGNORECASE)):
        return RouteResponse(
            type="no_action",
            mode=mode,
            action=None,
            arguments={},
            confidence=0.98,
            reaction_emoji=reaction_emoji,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 3. Погода (weather)
    if "weather" in available_tools and WEATHER_REGEX.search(msg):
        return RouteResponse(
            type="action",
            mode="CASUAL",
            action="weather",
            arguments={"city": "Санкт-Петербург"},
            confidence=0.96,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 4. Места и локации Питера (spb_places)
    if "spb_places" in available_tools and SPB_PLACES_REGEX.search(msg):
        match = SPB_PLACES_REGEX.search(msg)
        place_query = match.group(0) if match else msg
        return RouteResponse(
            type="action",
            mode="CASUAL",
            action="spb_places",
            arguments={"query": place_query},
            confidence=0.92,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 5. Веб-поиск (web_search)
    if "web_search" in available_tools and (SEARCH_REGEX.search(msg) or "?" in msg or len(msg.split()) >= 4):
        clean_query = re.sub(r'^(найди|поищи|загугли|скажи|подскажи|слушай|лера|а)\s+', '', msg, flags=re.IGNORECASE).strip()
        if len(clean_query) >= 3 and not re.match(r'^(привет|как дела|что делаешь|ты кто|споки|доброе утро)', clean_query, re.IGNORECASE):
            return RouteResponse(
                type="action",
                mode="CASUAL",
                action="web_search",
                arguments={"query": clean_query},
                confidence=0.90,
                latency_ms=round((time.time() - start) * 1000, 2)
            )

    # 6. Обычный диалог без вызова внешних инструментов
    return RouteResponse(
        type="no_action",
        mode=mode,
        action=None,
        arguments={},
        confidence=0.95,
        reaction_emoji=reaction_emoji,
        latency_ms=round((time.time() - start) * 1000, 2)
    )
