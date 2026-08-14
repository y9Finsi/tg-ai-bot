"""
Needle 2 Universal Semantic Router Sidecar Service (Cactus Compute Architecture)
Мгновенно классифицирует диалоговые намерения (CASUAL/EROTIC/JOKE/REACTION)
и производит Zero-Shot семантическую маршрутизацию инструментов (Actions)
по их описанию и JSON Schema без захардкоженных названий.
"""

from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Set
import re
import math
import time

app = FastAPI(title="Needle 2 Universal Semantic Router", version="2.5.0")

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

# 1. Регулярные выражения для классификации диалоговых режимов (Dialogue Mode)
EROTIC_REGEX = re.compile(r'\b(секс[а-я]*|трах[а-я]*|соси[а-я]*|член[а-я]*|сиськ[а-я]*|попк[а-я]*|грудь|голая|разденься|подроч[а-я]*|минет|эротик[а-я]*|возбужд[а-я]*|поцелуй|в постел[ьи]|шлепни)\b', re.IGNORECASE)
JOKE_REGEX = re.compile(r'\b(анекдот|шутк[ауи]|пошути|рассмеши|мем|прикол|рофл)\b', re.IGNORECASE)
REACTION_ONLY_REGEX = re.compile(r'^(ок|оки|пон|понял|ага|да|нет|хз|лол|кек|пхах|ахах|хаха|\)+|\(+|👍|❤️|🔥|😂|🥰|😘|😴|🌚)$', re.IGNORECASE)

# Стоп-слова для токенизации запроса
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
    'между', 'пожалуйста', 'плиз', 'слушай', 'лера'
}

def extract_char_ngrams(text: str, n: int = 3) -> Set[str]:
    """Генерирует n-граммы символов (subword shingles) для устойчивости к морфологии и опечаткам"""
    cleaned = re.sub(r'[^a-zA-Zа-яА-Я0-9]', ' ', text.lower()).strip()
    words = [w for w in cleaned.split() if w not in STOP_WORDS and len(w) >= 2]
    shingles = set()
    for word in words:
        # Добавляем корень/префикс слова
        if len(word) <= n:
            shingles.add(word)
        else:
            for i in range(len(word) - n + 1):
                shingles.add(word[i:i+n])
            # Дополнительно добавляем стем (первые 4-5 букв)
            shingles.add(word[:min(len(word), 5)])
    return shingles

def compute_cosine_similarity(set_a: Set[str], set_b: Set[str]) -> float:
    """Вычисляет косинусное сходство между множествами n-грамм"""
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a.intersection(set_b))
    if intersection == 0:
        return 0.0
    return intersection / math.sqrt(len(set_a) * len(set_b))

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

    # Очищенный текст без служебных глаголов
    stripped_text = re.sub(r'^(напомни|поставь|запиши|найди|поищи|загугли|погода|курс|узнай|проверь|сделай|скажи)\s+', '', msg_cleaned, flags=re.IGNORECASE).strip()
    if not stripped_text:
        stripped_text = msg_cleaned

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
            # Для города
            if "city" in name_lower or "город" in prop_desc:
                city_match = re.search(r'\b(санкт-петербург|петербург|питер|москв[аеу]|спб)\b', msg_cleaned, re.IGNORECASE)
                args[prop_name] = city_match.group(0).capitalize() if city_match else "Санкт-Петербург"
            else:
                args[prop_name] = stripped_text
            continue

    # Fallback: если ни один аргумент не был заполнен, назначаем первый строковый параметр
    if not args and properties:
        first_key = next(iter(properties.keys()))
        args[first_key] = stripped_text

    return args

@app.get("/health")
def health():
    return {"status": "ok", "service": "needle-universal-semantic-router-2.5"}

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

    # 2. Zero-Shot Семантический скоринг доступных инструментов (Tools Matching)
    msg_ngrams = extract_char_ngrams(msg)
    best_tool = None
    best_score = 0.0

    for tool in req.tools:
        tool_name = tool.get("name", "")
        tool_desc = tool.get("description", "")
        tool_title = tool.get("title", "")
        input_schema = tool.get("inputSchema", {})
        props = input_schema.get("properties", {}) if isinstance(input_schema, dict) else {}
        props_text = " ".join([f"{k} {v.get('description', '')}" for k, v in props.items() if isinstance(v, dict)])

        # Собираем семантический профиль инструмента
        tool_signature = f"{tool_name} {tool_title} {tool_desc} {props_text}"
        tool_ngrams = extract_char_ngrams(tool_signature)

        score = compute_cosine_similarity(msg_ngrams, tool_ngrams)

        # Бонус за точное совпадение корней имени или описания
        for word in re.findall(r'[a-zA-Zа-яА-Я]{4,}', msg.lower()):
            if word in tool_signature.lower():
                score += 0.15

        if score > best_score:
            best_score = score
            best_tool = tool

    # 3. Принятие решения по confidence threshold
    # Если сходство высокое (score >= 0.25 при n-gram сходстве) — выбираем лучший инструмент
    if best_tool and best_score >= 0.25:
        action_name = best_tool.get("name")
        input_schema = best_tool.get("inputSchema", {})
        extracted_args = extract_schema_arguments(msg, input_schema)

        confidence = min(0.99, round(0.70 + (best_score * 0.4), 2))

        return RouteResponse(
            type="action",
            mode=mode,
            action=action_name,
            arguments=extracted_args,
            confidence=confidence,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 4. Если нет явного совпадения по инструментам — обычный диалог
    return RouteResponse(
        type="no_action",
        mode=mode,
        action=None,
        arguments={},
        confidence=0.90,
        reaction_emoji=reaction_emoji,
        latency_ms=round((time.time() - start) * 1000, 2)
    )
