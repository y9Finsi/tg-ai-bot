"""
Needle 2.6 Robust Semantic Router Sidecar Service
Высокоскоростная Zero-Shot маршрутизация инструментов с русской лемматизацией,
стеммингом корней и поддержкой синонимов (поищи/инет/гугл/найди/напомни/погода).
"""

from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Set
import re
import time

app = FastAPI(title="Needle 2.6 Semantic Router", version="2.6.0")

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

# 1. Диалоговые намерения (режимы)
EROTIC_REGEX = re.compile(r'\b(секс[а-я]*|трах[а-я]*|соси[а-я]*|член[а-я]*|сиськ[а-я]*|попк[а-я]*|грудь|голая|разденься|подроч[а-я]*|минет|эротик[а-я]*|возбужд[а-я]*|поцелуй|в постел[ьи]|шлепни)\b', re.IGNORECASE)
JOKE_REGEX = re.compile(r'\b(анекдот|шутк[ауи]|пошути|рассмеши|мем|прикол|рофл)\b', re.IGNORECASE)
REACTION_ONLY_REGEX = re.compile(r'^(ок|оки|пон|понял|ага|да|нет|хз|лол|кек|пхах|ахах|хаха|\)+|\(+|👍|❤️|🔥|😂|🥰|😘|😴|🌚)$', re.IGNORECASE)

# 2. Стоп-слова
STOP_WORDS = {
    'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все', 'она',
    'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'только', 'ее',
    'мне', 'было', 'вот', 'от', 'меня', 'еще', 'нет', 'о', 'из', 'ему', 'теперь', 'когда',
    'даже', 'ну', 'вдруг', 'ли', 'если', 'уже', 'или', 'ни', 'быть', 'был', 'него', 'до',
    'вас', 'нибудь', 'опять', 'уж', 'вам', 'ведь', 'там', 'потом', 'себя', 'ничего', 'ей',
    'может', 'они', 'тут', 'где', 'есть', 'надо', 'ней', 'для', 'мы', 'тебя', 'их', 'чем',
    'была', 'сам', 'чтоб', 'без', 'будто', 'чего', 'раз', 'тоже', 'себе', 'под', 'будет',
    'ж', 'тогда', 'кто', 'этот', 'того', 'потому', 'этого', 'какой', 'совсем', 'ним', 'здесь',
    'этом', 'один', 'почти', 'мой', 'тем', 'чтобы', 'нее', 'сейчас', 'были', 'куда', 'зачем',
    'всех', 'никогда', 'можно', 'при', 'наконец', 'два', 'об', 'другой', 'хоть', 'после',
    'над', 'больше', 'тот', 'через', 'эти', 'нас', 'про', 'всего', 'них', 'какая', 'много',
    'разве', 'три', 'эту', 'моя', 'впрочем', 'хорошо', 'свою', 'этой', 'перед', 'иногда',
    'лучше', 'чуть', 'том', 'нельзя', 'такой', 'им', 'более', 'всегда', 'конечно', 'всю',
    'между', 'пожалуйста', 'плиз', 'слушай', 'лера', 'говорю', 'гворю', 'скажи', 'подскажи'
}

# 3. Нормализация синонимов и корней
SYNONYM_MAP = {
    'инет': 'интернет',
    'инте': 'интернет',
    'инту': 'интернет',
    'инете': 'интернет',
    'гугл': 'поиск',
    'погугли': 'поиск',
    'загугли': 'поиск',
    'прогугли': 'поиск',
    'поищи': 'поиск',
    'ищи': 'поиск',
    'найди': 'поиск',
    'найти': 'поиск',
    'поискать': 'поиск',
    'напомни': 'напоминание',
    'напомнить': 'напоминание',
    'напомнишь': 'напоминание',
    'напомните': 'напоминание',
    'таймер': 'напоминание',
    'будильник': 'напоминание',
    'запиши': 'напоминание',
    'погодка': 'погода',
    'погоде': 'погода',
    'погоду': 'погода',
    'градусов': 'погода',
    'градуса': 'погода',
    'дождь': 'погода',
    'дожди': 'погода'
}

RUSSIAN_SUFFIXES = (
    'ейший', 'ейшая', 'ейшее', 'ейшие', 'ованный', 'ованная', 'ованное', 'ованные',
    'вшийся', 'вшаяся', 'вшееся', 'вшиеся', 'ивший', 'ившая', 'ившее', 'ившие',
    'вшего', 'вшему', 'вшим', 'вших', 'вшем', 'нный', 'нная', 'нное', 'нные',
    'нного', 'нному', 'нным', 'нных', 'нном', 'ными', 'выми', 'тыми',
    'ости', 'ость', 'остях', 'остями', 'ением', 'ениями', 'ении', 'ения', 'ение',
    'ами', 'ями', 'ами', 'ями', 'ей', 'ий', 'ой', 'ый', 'ая', 'яя', 'ое', 'ее',
    'ые', 'ие', 'ем', 'им', 'ом', 'ым', 'их', 'ых', 'ую', 'юю', 'ою', 'ею',
    'ать', 'ять', 'еть', 'ить', 'уть', 'ыть', 'али', 'яли', 'ели', 'или',
    'ала', 'яла', 'ела', 'ила', 'ало', 'яло', 'ело', 'ило', 'али', 'или',
    'ает', 'яет', 'еет', 'ит', 'ят', 'ут', 'ют', 'ешь', 'ишь', 'ите', 'ете',
    'ся', 'сь', 'ов', 'ев', 'ей', 'ам', 'ям', 'ах', 'ях', 'ом', 'ем'
)

def stem_word(word: str) -> str:
    """Усекает окончания русского слова для выделения корня"""
    w = word.lower()
    if w in SYNONYM_MAP:
        return SYNONYM_MAP[w]
    if len(w) <= 3:
        return w
    for suffix in RUSSIAN_SUFFIXES:
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            w = w[:-len(suffix)]
            break
    return w

def extract_stems(text: str) -> Set[str]:
    """Извлекает нормализованные корни слов из текста"""
    words = re.findall(r'[a-zA-Zа-яА-Я0-9_]{2,}', text.lower())
    stems = set()
    for raw in words:
        if raw in STOP_WORDS:
            continue
        # Проверяем прямой маппинг синонимов
        normalized = SYNONYM_MAP.get(raw, raw)
        stems.add(normalized)
        stems.add(stem_word(raw))
        # Добавляем префикс корня (4 буквы)
        if len(raw) >= 4:
            stems.add(raw[:4])
    return stems

def extract_schema_arguments(message: str, schema: Dict[str, Any]) -> Dict[str, Any]:
    """Автоматически извлекает параметры из сообщения в соответствии с inputSchema инструмента"""
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    if not properties:
        return {}

    args = {}
    msg_cleaned = message.strip()

    # Паттерны времени
    time_match = re.search(r'\b(завтра|сегодня|вечером|утром|днем|ночью|через\s+\d+\s+(?:минут[а-я]*|час[а-я]*|сек[а-я]*|дн[еяй]*)|в\s+\d{1,2}(?::\d{2})?)\b', msg_cleaned, re.IGNORECASE)
    time_val = time_match.group(0) if time_match else None

    # Очищенный поисковый запрос (удаляем команды поиска)
    clean_query = re.sub(r'^(ну\s+)?(поищи|найди|загугли|погугли|прогугли|ищи|скажи|узнай|проверь|глянь|посмотри|напомни|поставь)\s+(в\s+инете|в\s+интернете|в\s+гугле|мне|тебе|плиз|пожалуйста)?\s*(кто\s+такой|что\s+такое|где\s+находится|как)?\s*', '', msg_cleaned, flags=re.IGNORECASE).strip()
    if not clean_query:
        clean_query = msg_cleaned

    for prop_name, prop_meta in properties.items():
        prop_type = prop_meta.get("type", "string")
        prop_desc = (prop_meta.get("description") or "").lower()
        name_lower = prop_name.lower()

        # Поле времени
        if any(k in name_lower or k in prop_desc for k in ("when", "time", "date", "delay", "время", "когда", "срок")):
            if time_val:
                args[prop_name] = time_val
            elif prop_type == "string":
                args[prop_name] = "скоро"
            continue

        # Числовые поля
        if prop_type in ("integer", "number"):
            num_match = re.search(r'\b\d+(?:\.\d+)?\b', msg_cleaned)
            if num_match:
                args[prop_name] = float(num_match.group(0)) if '.' in num_match.group(0) else int(num_match.group(0))
            continue

        # Булевые поля
        if prop_type == "boolean":
            args[prop_name] = True
            continue

        # Основной текстовый аргумент (query, text, message, prompt, reminder_text, etc.)
        if any(k in name_lower or k in prop_desc for k in ("query", "text", "search", "reminder", "prompt", "msg", "content", "поиск", "текст", "запрос", "название", "город", "city")):
            if "city" in name_lower or "город" in prop_desc:
                city_match = re.search(r'\b(санкт-петербург|петербург|питер|москв[аеу]|спб)\b', msg_cleaned, re.IGNORECASE)
                args[prop_name] = city_match.group(0).capitalize() if city_match else "Санкт-Петербург"
            else:
                args[prop_name] = clean_query
            continue

    if not args and properties:
        first_key = next(iter(properties.keys()))
        args[first_key] = clean_query

    return args

@app.get("/health")
def health():
    return {"status": "ok", "service": "needle-semantic-router-2.6"}

@app.post("/v1/route", response_model=RouteResponse)
async def route_message(req: RouteRequest):
    start = time.time()
    msg = req.message.strip()

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

    # Если режим REACTION или короткое бытовое приветствие — сразу no_action
    if mode == "REACTION" or (len(msg.split()) <= 2 and re.match(r'^(привет|хай|ку|добрый день|споки|спокойной ночи|как дела|что делаешь)$', msg, re.IGNORECASE)):
        return RouteResponse(
            type="no_action",
            mode=mode,
            action=None,
            arguments={},
            confidence=0.98,
            reaction_emoji=reaction_emoji,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 2. Семантический скоринг инструментов (Tools Matching)
    msg_stems = extract_stems(msg)
    best_tool = None
    best_score = 0.0

    for tool in req.tools:
        tool_name = tool.get("name", "")
        tool_desc = tool.get("description", "")
        tool_title = tool.get("title", "")
        input_schema = tool.get("inputSchema", {})
        props = input_schema.get("properties", {}) if isinstance(input_schema, dict) else {}
        props_text = " ".join([f"{k} {v.get('description', '')}" for k, v in props.items() if isinstance(v, dict)])

        tool_signature = f"{tool_name} {tool_title} {tool_desc} {props_text}"
        tool_stems = extract_stems(tool_signature)

        # Вычисляем покрытие корней пользователя в сигнатуре инструмента
        common_stems = msg_stems.intersection(tool_stems)
        if not common_stems:
            continue

        # Score = количество совпавших корней + отношение к числу значимых слов пользователя
        overlap_ratio = len(common_stems) / max(1, len(msg_stems))
        score = len(common_stems) * 0.35 + overlap_ratio * 0.65

        if score > best_score:
            best_score = score
            best_tool = tool

    # 3. Принятие решения по confidence threshold
    # Если найден хотя бы один четкий совпадающий корень (score >= 0.35)
    if best_tool and best_score >= 0.35:
        action_name = best_tool.get("name")
        input_schema = best_tool.get("inputSchema", {})
        extracted_args = extract_schema_arguments(msg, input_schema)

        confidence = min(0.99, round(0.75 + min(0.24, best_score * 0.2), 2))

        return RouteResponse(
            type="action",
            mode=mode,
            action=action_name,
            arguments=extracted_args,
            confidence=confidence,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 4. Если нет инструментов или явного соответствия — обычный диалог
    return RouteResponse(
        type="no_action",
        mode=mode,
        action=None,
        arguments={},
        confidence=0.90,
        reaction_emoji=reaction_emoji,
        latency_ms=round((time.time() - start) * 1000, 2)
    )
