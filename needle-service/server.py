"""
Needle 3.0 Neural ONNX Router Sidecar Service
Нейросетевой векторный роутер на базе ruBERT-tiny2 (ONNX Runtime, 21MB),
производящий моментальное семантическое сопоставление (Cosine Similarity Margin)
любых зарегистрированных инструментов и классификацию диалоговых намерений.
"""

from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import os
import re
import time
import numpy as np

app = FastAPI(title="Needle 3.0 Neural ONNX Router", version="3.0.0")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "model.onnx")
TOKENIZER_PATH = os.path.join(os.path.dirname(__file__), "model", "tokenizer.json")

session = None
tokenizer = None
HAS_ONNX = False

try:
    if os.path.exists(MODEL_PATH) and os.path.exists(TOKENIZER_PATH):
        import onnxruntime as ort
        from tokenizers import Tokenizer
        
        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = 2
        session = ort.InferenceSession(MODEL_PATH, sess_options, providers=['CPUExecutionProvider'])
        tokenizer = Tokenizer.from_file(TOKENIZER_PATH)
        tokenizer.enable_truncation(max_length=128)
        tokenizer.enable_padding(length=128)
        HAS_ONNX = True
        print(f"✅ [ONNX NEURAL ROUTER] ruBERT-tiny2 ({os.path.getsize(MODEL_PATH) // 1024 // 1024} МБ) успешно загружен в память!")
except Exception as e:
    print(f"⚠️ [ONNX NEURAL ROUTER ERROR]: {e}")

TOOL_EMBEDDINGS_CACHE = {}

def get_text_embedding(text: str) -> np.ndarray:
    """Вычисляет семантический вектор предложения через ONNX Runtime"""
    if not HAS_ONNX or not session or not tokenizer:
        return np.zeros(384, dtype=np.float32)
    
    encoded = tokenizer.encode(text)
    input_ids = np.array([encoded.ids], dtype=np.int64)
    attention_mask = np.array([encoded.attention_mask], dtype=np.int64)
    token_type_ids = np.array([encoded.type_ids], dtype=np.int64)
    
    inputs = {
        'input_ids': input_ids,
        'attention_mask': attention_mask,
        'token_type_ids': token_type_ids
    }
    
    sess_inputs = {inp.name: inputs[inp.name] for inp in session.get_inputs() if inp.name in inputs}
    outputs = session.run(None, sess_inputs)
    
    last_hidden_state = outputs[0]
    mask_expanded = np.expand_dims(attention_mask, -1)
    sum_embeddings = np.sum(last_hidden_state * mask_expanded, axis=1)
    sum_mask = np.clip(np.sum(mask_expanded, axis=1), 1e-9, None)
    embedding = sum_embeddings / sum_mask
    
    norm = np.linalg.norm(embedding, axis=1, keepdims=True)
    return (embedding / np.clip(norm, 1e-9, None))[0]

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

# 2. Диалоговые намерения (режимы)
EROTIC_REGEX = re.compile(r'\b(секс[а-я]*|трах[а-я]*|соси[а-я]*|член[а-я]*|сиськ[а-я]*|попк[а-я]*|грудь|голая|разденься|подроч[а-я]*|минет|эротик[а-я]*|возбужд[а-я]*|поцелуй|в постел[ьи]|шлепни)\b', re.IGNORECASE)
JOKE_REGEX = re.compile(r'\b(анекдот|шутк[ауи]|пошути|рассмеши|мем|прикол|рофл)\b', re.IGNORECASE)
REACTION_ONLY_REGEX = re.compile(r'^(ок|оки|пон|понял|ага|да|нет|хз|лол|кек|пхах|ахах|хаха|\)+|\(+|👍|❤️|🔥|😂|🥰|😘|😴|🌚)$', re.IGNORECASE)

def extract_schema_arguments(message: str, schema: Dict[str, Any]) -> Dict[str, Any]:
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    if not properties:
        return {}

    args = {}
    msg_cleaned = message.strip()

    time_match = re.search(r'\b(завтра|сегодня|вечером|утром|днем|ночью|через\s+\d+\s+(?:минут[а-я]*|час[а-я]*|сек[а-я]*|дн[еяй]*)|в\s+\d{1,2}(?::\d{2})?)\b', msg_cleaned, re.IGNORECASE)
    time_val = time_match.group(0) if time_match else None

    clean_query = re.sub(r'^(ну\s+)?(поищи|найди|загугли|погугли|прогугли|ищи|скажи|узнай|проверь|глянь|посмотри|напомни|поставь)\s+(в\s+инете|в\s+интернете|в\s+гугле|мне|тебе|плиз|пожалуйста)?\s*(кто\s+такой|что\s+такое|где\s+находится|как)?\s*', '', msg_cleaned, flags=re.IGNORECASE).strip()
    if not clean_query:
        clean_query = msg_cleaned

    for prop_name, prop_meta in properties.items():
        prop_type = prop_meta.get("type", "string")
        prop_desc = (prop_meta.get("description") or "").lower()
        name_lower = prop_name.lower()

        if any(k in name_lower or k in prop_desc for k in ("when", "time", "date", "delay", "время", "когда", "срок")):
            if time_val:
                args[prop_name] = time_val
            elif prop_type == "string":
                args[prop_name] = "скоро"
            continue

        if prop_type in ("integer", "number"):
            num_match = re.search(r'\b\d+(?:\.\d+)?\b', msg_cleaned)
            if num_match:
                args[prop_name] = float(num_match.group(0)) if '.' in num_match.group(0) else int(num_match.group(0))
            continue

        if prop_type == "boolean":
            args[prop_name] = True
            continue

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
    return {
        "status": "ok",
        "service": "needle-neural-onnx-3.0",
        "has_onnx": HAS_ONNX,
        "model_file": os.path.exists(MODEL_PATH)
    }

@app.post("/v1/route", response_model=RouteResponse)
async def route_message(req: RouteRequest):
    start = time.time()
    msg = req.message.strip()

    # 1. Диалоговый режим (Mode)
    mode = "CASUAL"
    reaction_emoji = None

    if EROTIC_REGEX.search(msg):
        mode = "EROTIC"
    elif JOKE_REGEX.search(msg):
        mode = "JOKE"
    elif REACTION_ONLY_REGEX.search(msg) and len(msg) <= 10:
        mode = "REACTION"
        reaction_emoji = "❤️" if ("❤" in msg or "люблю" in msg) else "👍"

    # Если режим REACTION или обычное бытовое приветствие/диалог — сразу no_action
    CASUAL_CHAT_REGEX = re.compile(r'^(привет|хай|ку|добрый день|доброе утро|споки|спокойной ночи|как дела|как жизнь|что делаешь|че делаешь|как ты|как твои дела|ты кто|расскажи о себе)', re.IGNORECASE)
    if mode == "REACTION" or CASUAL_CHAT_REGEX.search(msg) or (len(msg.split()) <= 2 and re.match(r'^(да|нет|ладно|ясно|понятно)$', msg, re.IGNORECASE)):
        return RouteResponse(
            type="no_action",
            mode=mode,
            action=None,
            arguments={},
            confidence=0.98,
            reaction_emoji=reaction_emoji,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    # 2. Нейросетевой векторный роутинг (ONNX Embeddings)
    best_tool = None
    best_similarity = 0.0
    second_similarity = 0.0

    if HAS_ONNX and req.tools:
        user_vector = get_text_embedding(msg)
        scores = []

        for tool in req.tools:
            tool_name = tool.get("name", "")
            tool_desc = tool.get("description", "")
            tool_title = tool.get("title", "")
            input_schema = tool.get("inputSchema", {})
            props = input_schema.get("properties", {}) if isinstance(input_schema, dict) else {}
            props_text = " ".join([f"{k}: {v.get('description', '')}" for k, v in props.items() if isinstance(v, dict)])

            tool_signature = f"{tool_title}. {tool_desc}. Параметры: {props_text}"
            
            if tool_name not in TOOL_EMBEDDINGS_CACHE or TOOL_EMBEDDINGS_CACHE[tool_name].get("sig") != tool_signature:
                tool_vector = get_text_embedding(tool_signature)
                TOOL_EMBEDDINGS_CACHE[tool_name] = {
                    "sig": tool_signature,
                    "vector": tool_vector
                }
            else:
                tool_vector = TOOL_EMBEDDINGS_CACHE[tool_name]["vector"]

            similarity = float(np.dot(user_vector, tool_vector))
            scores.append((similarity, tool))

        scores.sort(key=lambda x: x[0], reverse=True)
        if scores:
            best_similarity, best_tool = scores[0]
            second_similarity = scores[1][0] if len(scores) > 1 else 0.0

    # 3. Принятие решения по векторному отрыву (Margin >= 0.07 и сходство >= 0.55)
    margin = best_similarity - second_similarity
    if best_tool and best_similarity >= 0.55 and margin >= 0.07:
        action_name = best_tool.get("name")
        input_schema = best_tool.get("inputSchema", {})
        extracted_args = extract_schema_arguments(msg, input_schema)

        confidence = min(0.99, round(0.75 + (margin * 1.5), 2))

        return RouteResponse(
            type="action",
            mode=mode,
            action=action_name,
            arguments=extracted_args,
            confidence=confidence,
            latency_ms=round((time.time() - start) * 1000, 2)
        )

    return RouteResponse(
        type="no_action",
        mode=mode,
        action=None,
        arguments={},
        confidence=0.90,
        reaction_emoji=reaction_emoji,
        latency_ms=round((time.time() - start) * 1000, 2)
    )
