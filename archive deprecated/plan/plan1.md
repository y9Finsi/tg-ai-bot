# АРХИТЕКТУРНЫЙ АУДИТ И УЛЬТИМАТИВНЫЙ ТЕХНИЧЕСКИЙ ПЛАН РЕФАКТОРИНГА СИСТЕМЫ «ЛЕРА 2.0»

---

## 1. АУДИТ ТЕКУЩИХ ПРОБЛЕМ И КРИТИЧЕСКИЕ ТОЧКИ ОТКАЗА

Текущая реализация агента обладает рядом системных дефектов, приводящих к разрушению погружения, галлюцинациям модели и десинхронизации внутреннего состояния симуляции с интерфейсом пользователя.

### 1.1. Линейность и рельсовость расписания

* **Проблема:** Модуль `schedule_generator.js` формирует жесткий поминутный/почасовой план на 24 слота. В результате симуляция превращается в статическое выполнение заранее прописанных шагов.
* **Решение:** Переход на **Каркасно-Якорную Модель Расписания (Coarse Anchor Scheduling)**. Утренний генератор планирует только 2–4 ключевых реперных точки (якоря) на день. Все промежуточные слоты помечаются статусом `DYNAMIC_UNKNOWN` и формируются на лету в зависимости от результатов предыдущих тиков, состояния физиологических потребностей, местоположения на карте и рандомных событий.

### 1.2. Разорванность причинно-следственной связи тиков (State Discontinuity)

* **Проблема:** Каждый тик рассчитывается изолированно, без прямой передачи результативной дельты в следующий шаг.
* **Решение:** Реализация **Замкнутой Цепи Состояний (Sequential Tick Chaining)**. Выходной блок `📌 Итог (Consequence)` тика $N-1$ является **обязательным входящим контекстом** для начала тика $N$.

### 1.3. Отсутствие пространственно-визуального контекста (Scene Disconnect)

* **Проблема:** Лингвистическая модель генерирует мысли и действия в абстрактном вакууме, выдумывая несогласованные детали окружения.
* **Решение:** Разработка и внедрение двухзадачного модуля: `map_engine.js` (пространственная база данных Петербурга с графикой в админке) и `scene_generator.js` (динамический генератор физического окружения, объектов и NPC).

### 1.4. Фатальные галлюцинации персонажей и нарушение канона

* **Проблема:** Модель генерирует сторонних мужских персонажей («Кирилл», «симпатичный парень с набережной»), а также сценарии, противоречащие роли (покупка тестов на беременность).
* **Решение:** Жесткая фиксация мультипользовательской изоляции. Для миллиона юзеров в Telegram Лера работает по канону **«Единый Владелец / Богдан»**. В индивидуальном контексте каждого чата пользователь является её единственным фаворитом/партнером. Любые сторонние романтические/сексапильные контакты с NPC блокируются на уровне системного промпта и семантического фильтра.

---

## 2. СЕТЕВАЯ И СИСТЕМНАЯ АРХИТЕКТУРА (FULL ARCHITECTURE)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 ADMIN PANEL & MAP UI                                   │
│   • Express Server (server.js)                                                         │
│   • Leaflet.js Interactive St. Petersburg Map (Real-time Lera Marker Coordinates)       │
│   • Unexplored / Discovered Location Nodes Visualization                              │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Websockets / REST API
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              GAME LOOP & STATE MACHINE                                 │
│                                                                                        │
│  08:00 AM ──► Schedule Generator (Anchor Slots + UNKNOWN Fillers)                      │
│                                                                                        │
│  TICK N RUNTIME:                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Read Consequence of Tick N-1 (Итог предыдущего шага)                          │  │
│  │ 2. Fetch Map Coordinates & Node Properties (map_engine.js)                       │  │
│  │ 3. Generate Scene Description & Props (scene_generator.js)                        │  │
│  │ 4. Evaluate D100 Chaos & Task Progress (random_events.js / task_engine.js)       │  │
│  │ 5. Execute LLM Cycle: Generates [Thought], [Action], [Consequence]               │  │
│  │ 6. Apply Needs / Wallet / Location Mutations (lera_state.json)                   │  │
│  │ 7. Emit State Update to Admin Map & Append to daily_log.json                      │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          TELEGRAM BOT & USER INTERACTION INTERFACE                      │
│   • User-Isolated Context Mapping (Multi-User "Single Bogdan" Layer)                   │
│   • Ladder Messaging Queue with Human-like Typing Delays (queue.js)                     │
│   • Orgasm / Intimacy Evaluator Integration                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘

```

---

## 3. ДЕТАЛИЗАЦИЯ НОВЫХ И МОДИФИЦИРУЕМЫХ МОДУЛЕЙ

### 3.1. Модуль Пространства и Открытий (`src/engine/map_engine.js`)

Модуль управляет географическими координатами Леры, связями между узлами, временем перемещения и механикой исследования новых точек.

#### Базовая структура узлов карты (`src/data/map_nodes.json`):

```json
{
  "nodes": {
    "HOME_PETROGRADKA": {
      "id": "HOME_PETROGRADKA",
      "name": "Квартира на Петроградке",
      "district": "Петроградский район",
      "coordinates": [59.9589, 30.3049],
      "discovered": true,
      "category": "INDOOR",
      "sub_locations": ["Спальня", "Кухня с газовой колонкой", "Совмещенный санузел", "Прихожая"],
      "static_props": ["смятый плед", "ноутбук со стикерами", "Satisfyer в тумбочке", "высокие деревянные окна"],
      "default_npcs": []
    },
    "BUSHE_CAFE": {
      "id": "BUSHE_CAFE",
      "name": "Кофейня Буше (Б. Проспект П.С.)",
      "district": "Петроградский район",
      "coordinates": [59.9598, 30.3012],
      "discovered": true,
      "category": "CAFE",
      "sub_locations": ["Зал у окна", "Кассовая зона", "Туалетная комната"],
      "static_props": ["витрина с булкам", "кофемашина", "высокие барные стулья"],
      "default_npcs": ["Бариста", "Уставшие хипстеры"]
    },
    "VKUSVILL_STORE": {
      "id": "VKUSVILL_STORE",
      "name": "ВкусВилл",
      "district": "Петроградский район",
      "coordinates": [59.9575, 30.3081],
      "discovered": true,
      "category": "SHOP",
      "sub_locations": ["Торговый зал", "Касса самообслуживания"],
      "static_props": ["стеллаж с поке", "холодильник с напитками", "пакеты"],
      "default_npcs": ["Кассир", "Покупатели"]
    },
    "PETROGRADKA_STREETS": {
      "id": "PETROGRADKA_STREETS",
      "name": "Улицы Петроградки",
      "district": "Петроградский район",
      "coordinates": [59.9582, 30.3055],
      "discovered": true,
      "category": "OUTDOOR",
      "sub_locations": ["Большой проспект", "Двор-колодец", "Набережная Ждановки"],
      "static_props": ["скамейки", "порывистый ветер", "арочки дома"],
      "default_npcs": ["Прохожие", "Курьеры Самоката"]
    }
  },
  "edges": [
    { "from": "HOME_PETROGRADKA", "to": "BUSHE_CAFE", "travel_time_minutes": 10, "method": "WALK" },
    { "from": "HOME_PETROGRADKA", "to": "VKUSVILL_STORE", "travel_time_minutes": 7, "method": "WALK" },
    { "from": "BUSHE_CAFE", "to": "PETROGRADKA_STREETS", "travel_time_minutes": 2, "method": "WALK" }
  ]
}

```

#### Механика исследования точек (Exploration Engine):

Если во время выполнения текущего слота Лера выбирает действие «пойти погулять в неизвестную сторону» или едет с Настей в новое место, срабатывает функция `discoverNewNode()`:

1. Генератор через LLM генерирует новое название, координаты в пределах СПб, категорию и статические предметы места.
2. Новое место добавляется в `map_nodes.json` со статусом `discovered: true`.
3. На веб-карте в админке загорается новая открытая иконка, и прокладывается маршрут от текущей точки.

---

### 3.2. Модуль Генерации Сцены (`src/engine/scene_generator.js`)

Модуль создает физическое описание обстановки для конкретного тика.

#### Алгоритм работы генератора сцен:

1. Принимает на вход:
* Данные узла из `map_nodes.json` (где Лера находится физически).
* Текущее время и погоду в Петербурге (температура, наличие осадков/ветра).
* Состояние предметов в инвентаре (что надето, что в руках, что лежит в сумочке).
* Итог предыдущего тика ($N-1$).


2. Вызывает быструю нейросетевую модель для формирования кадра сцены.
3. Формирует контекстный блок **«СЦЕНА И ОКРУЖЕНИЕ»** для основного промпта тика.

#### Формат вывода `scene_generator.js`:

```json
{
  "location_id": "HOME_PETROGRADKA",
  "sub_location": "Спальня",
  "weather_context": "Санкт-Петербург, +14°C, пасмурно, порывистый ветер из щелей окна",
  "visible_objects": ["смятый плед", "ноутбук со стикерами", "чашка с недопитым чаем", "зарядка 3м"],
  "present_npcs": [],
  "atmosphere_description": "В комнате прохладно, из деревянной рамы слегка продувает. На кровати беспорядок. Тихо, слышен только гул машин с Большого проспекта."
}

```

---

### 3.3. Каркасно-Якорный Генератор Расписания (`src/engine/schedule_generator.js`)

Утренний генератор (запуск в 08:00) формирует структурированный каркас дня, содержащий только критически важные события.

#### Алгоритм формирования:

1. Запрашивает базовую структуру дня с учетом текущего дня недели, баланса денег, фазы менструального цикла и накопленной усталости.
2. Генерирует массив из 24 слотов, где 80% слотов имеют значение `UNKNOWN` (неизвестно).

#### Пример структуры `current_schedule.json`:

```json
{
  "date": "2026-07-31",
  "anchor_events": [
    { "slot": 8, "time": "08:00", "type": "ANCHOR", "title": "Пробуждение и утренний тупеж" },
    { "slot": 13, "type": "ANCHOR", "title": "Встреча с Настей в кофейне" },
    { "slot": 18, "type": "ANCHOR", "title": "Сдача поста для шоурума (Фриланс)" },
    { "slot": 23, "type": "ANCHOR", "title": "Личное время / Отдых в кровати" }
  ],
  "slots": {
    "8": { "status": "PLANNED", "activity": "Пробуждение, туалет, утренний тупеж" },
    "9": { "status": "UNKNOWN", "activity": "Неизвестно (зависит от итогов слота 8)" },
    "10": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "11": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "12": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "13": { "status": "PLANNED", "activity": "Встреча с Настей в кофейне" },
    "14": { "status": "UNKNOWN", "activity": "Неизвестно (зависит от исхода встречи)" },
    "15": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "16": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "17": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "18": { "status": "PLANNED", "activity": "Сдача поста для шоурума (Фриланс)" },
    "19": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "20": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "21": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "22": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "23": { "status": "PLANNED", "activity": "Личное время / Отдых в кровати" },
    "0": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "1": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "2": { "status": "UNKNOWN", "activity": "Неизвестно" },
    "3": { "status": "SLEEP", "activity": "Сон" },
    "4": { "status": "SLEEP", "activity": "Сон" },
    "5": { "status": "SLEEP", "activity": "Сон" },
    "6": { "status": "SLEEP", "activity": "Сон" },
    "7": { "status": "SLEEP", "activity": "Сон" }
  }
}

```

---

## 4. СКОЗНАЯ ПОСЛЕДОВАТЕЛЬНАЯ СХЕМА ВЫПОЛНЕНИЯ ТИКА (GAME LOOP PIPELINE)

Каждые 30 минут игровой цикл выполняет следующий алгоритмический процесс:

```
                  ┌──────────────────────────────────────────────┐
                  │          НАЧАЛО 30-МИНУТНОГО ТИКА            │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 1. ЧТЕНИЕ ИТОГА ПРЕДЫДУЩЕГО ТИКА (N-1)       │
                  │    Итог слота N-1 передается как входящий    │
                  │    фундамент текущей ситуации.               │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 2. ПЕРЕСЧЕТ СТАТОВ И ПЕРЕМЕЩЕНИЙ (State)     │
                  │    - Прирост потребности (голод, пошлость)   │
                  │    - Определение координат на карте          │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 3. ГЕНЕРАЦИЯ СЦЕНЫ (scene_generator.js)      │
                  │    Формирование описания окружения, видимых  │
                  │    предметов, погоды и присутствующих NPC.   │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 4. РАСЧЕТ РАНДОМА / ТАСОК (random_events.js) │
                  │    D100 Бросок. Если шанс сработал — LLM     │
                  │    генерирует локальное ЧП, меняющее планы.  │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 5. LLM ГЕНЕРАЦИЯ ШАГА (3 Обязательных поля)  │
                  │    - 💭 Думает (Скрытые мысли)                │
                  │    - 🎬 Делает (Физическое действие)          │
                  │    - 📌 Итог (Результат тика N)              │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 6. АКТУАЛИЗАЦИЯ И МУТАЦИЯ СТЕЙТА             │
                  │    - Итог тика N сохраняется как N-1 для N+1 │
                  │    - Запись в daily_log.json                 │
                  │    - Обновление маркер-точки в Админке       │
                  └──────────────────────────────────────────────┘

```

---

## 5. ПОШАГОВАЯ СИМУЛЯЦИЯ: ПРИМЕР 2 ПОСЛЕДОВАТЕЛЬНЫХ ТИКОВ

Ниже приведен эталонный пример того, как результаты Тика 1 логически перетекают в начало Тика 2 с обновлением локации и сцены.

---

### ⏱️ ТИК 1 (13:00 – 13:30) | Слоты 13:00

#### 1. Входящее состояние и локация:

* **Локация:** `HOME_PETROGRADKA` (Спальня)
* **Потребности:** Голод: 75, Усталость: 30, Пошлость: 20, Настроение: 50.
* **Бюджет:** 3 530 руб.
* **Надето:** Черная футболка Богдана, хлопковые шорты, без лифчика.
* **План на 13:00 (Якорь):** Встреча с Настей в кофейне «Буше».

#### 2. Генератор сцены (`scene_generator.js`):

> **Локация:** `HOME_PETROGRADKA` (Спальня).
> **Сцена:** Лере нужно выходить из дома. На столе лежит сумочка, телефон с 42% заряда. Из окна виден сероватый Питер, ветрище качает деревья.
> **Предметы рядом:** Тренч на вешалке, кроссовки New Balance, картхолдер.

#### 3. Выполнение генерации (LLM Output):

* **💭 Думает:** Блин, уже час дня, Настя наверняка ждет около «Буше». Голодная пиздец, живот урчит. На карте 3500, так что кофе и булку могу себе позволить. Надо натянуть джинсы и тренч, а то на улице ветрище.
* **🎬 Делает:** Снимает домашние шорты, надевает широкие джинсы, белые кроссы и бежевый тренч. Хватает сумочку, закрывает квартиру на ключ и спускается по старой лестнице на улицу.
* **📌 Итог тика 1:** Лера вышла из дома и идет пешком по Большому проспекту П.С. в сторону кофейни. Голод: 80, Усталость: 35. Локация изменилась на `PETROGRADKA_STREETS`.

---

### ⏱️ ТИК 2 (13:30 – 14:00) | Слот 14 (Был `UNKNOWN`)

#### 1. Входящие данные (ПРЯМЫЙ ИТОГ ТИКА 1):

* **Входящий контекс:** Лера идет по Большому проспекту П.С., вышла 10 минут назад, голодная, одета в тренч и джинсы, направилась в «Буше».
* **Текущая локация на карте:** `PETROGRADKA_STREETS` $\to$ `BUSHE_CAFE`.
* **Координаты в админке:** Обновлены на $[59.9598, 30.3012]$.

#### 2. Генератор сцены (`scene_generator.js`):

> **Локация:** `BUSHE_CAFE` (Зал у окна).
> **Сцена:** Зашла в теплое помещение кофейни. Пахнет свежей выпечкой и корицей. За столиком у окна сидит Настя, машет рукой. На столе стоят стеклянные стаканы с водой.
> **Предметы рядом:** Витрина со слойками, кассовый терминал, свободный столик у окна.

#### 3. Модуль Рандома и ЧП (`random_events.js` - d100 = 85 -> СРАБОТАЛ ХАОС!):

* **Сгенерированное событие:** *Настя эмоционально рассказывала про бывшего, задела локтем стакан с водой, вылила воду на джинсы Леры.*

#### 4. Выполнение генерации (LLM Output):

* **💭 Думает:** Ну пиздец) Зашла называется кофе попить! Настя со своими эмоциями вылила всю воду мне прямо на джинсы. Теперь на мокрых джинсах огромное темное пятно, еще и холодно стало. Настроение в говно. Придется валить домой переодеваться, какая тут работа за ноутом.
* **🎬 Делает:** Матерится себе под нос, вытирает джинсы салфетками. Быстро допивает купленный флэт уайт, забирает купленную яблочную слойку с собой и попрощавшись с Настей выбегает из кофейни обратно к дому.
* **📌 Итог тика 2:** Лера идет обратно домой с мокрыми джинсами и слойкой в руке. Бюджет: $-290$ руб. ($3240$ руб.). Настроение: $20$ (злая/вредная). Плановый слот 14:00 `UNKNOWN` переписался на «Аварийное возвращение домой и переодевание».

---

## 6. ТЕХНИЧЕСКИЙ СПЕЦИФИКАЦИОННЫЙ ПЛАН ИЗМЕНЕНИЙ В КОДЕ

Разработчику необходимо внести корректировки в файловую структуру и логику обработки.

### 6.1. Обновленная структура директорий

```
/src
├── /ai
│   ├── llm_client.js           # Обертка LLM с ротацией провайдеров (Gemini / OpenAI / MiniMax)
│   └── memory_extractor.js
│
├── /engine
│   ├── game_loop.js            # Главный последовательный цикл (Chained Ticks)
│   ├── map_engine.js           # [НОВЫЙ] Управление координатами, нодами и исследованием
│   ├── scene_generator.js      # [НОВЫЙ] Генератор визуально-бытовой сцены и предметов
│   ├── schedule_generator.js   # Якорный генератор расписания (Anchor Slots + UNKNOWN)
│   ├── random_events.js        # Dynamic LLM Chaos Evaluator
│   ├── needs_calculator.js     # Формулы физиологии и кошелька
│   └── orgasm_engine.js        # Orgasm Evaluator & Kink Tracker
│
├── /data
│   ├── map_nodes.json          # [НОВЫЙ] База точек Санкт-Петербурга
│   └── lera_opinions.json      # Матрица вкусов, стереотипов и принципов
│
├── /state
│   ├── lera_state.json         # Живой стейт (добавлены координаты и текущий node_id)
│   ├── current_schedule.json   # Якорный каркас дня
│   └── daily_log.json          # Живой суточный лог (Chained Inputs/Outputs)
│
├── /server
│   ├── admin_server.js         # Express сервер админ-панели
│   └── public/
│       ├── index.html          # [НОВЫЙ] Leaflet.js Интерактивная карта Питера
│       └── app.js              # Websocket-клиент для движения маркера Леры
│
└── ai.js                       # Пайплайн сборки промпта с изоляцией пользователей

```

---

### 6.2. Код Модуля Карт (`src/engine/map_engine.js`)

```javascript
const fs = require('fs');
const path = require('path');

const MAP_NODES_PATH = path.join(__dirname, '../data/map_nodes.json');
const STATE_PATH = path.join(__dirname, '../state/lera_state.json');

class MapEngine {
  constructor() {
    this.mapData = JSON.parse(fs.readFileSync(MAP_NODES_PATH, 'utf8'));
  }

  getCurrentLocation(nodeId) {
    return this.mapData.nodes[nodeId] || this.mapData.nodes['HOME_PETROGRADKA'];
  }

  updateLeraLocation(nodeId) {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const targetNode = this.getCurrentLocation(nodeId);

    state.current_node_id = targetNode.id;
    state.location_name = targetNode.name;
    state.coordinates = targetNode.coordinates;

    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    return targetNode;
  }

  /**
   * Исследование нового узла через LLM, если Лера покинула известную зону
   */
  async discoverNewNode(locationName, district, category) {
    const newNodeId = `DISCOVERED_${Date.now()}`;
    // Логика генерации случайных координат в районе Петроградки/Центра
    const lat = 59.95 + (Math.random() * 0.02 - 0.01);
    const lng = 30.30 + (Math.random() * 0.02 - 0.01);

    const newNode = {
      id: newNodeId,
      name: locationName,
      district: district || "Центральный район",
      coordinates: [lat, lng],
      discovered: true,
      category: category || "OUTDOOR",
      sub_locations: ["Основная зона"],
      static_props: ["городская мебель", "вывески"],
      default_npcs: ["Прохожие"]
    };

    this.mapData.nodes[newNodeId] = newNode;
    fs.writeFileSync(MAP_NODES_PATH, JSON.stringify(this.mapData, null, 2));
    
    this.updateLeraLocation(newNodeId);
    return newNode;
  }
}

module.exports = new MapEngine();

```

---

### 6.3. Модуль Генератора Сцены (`src/engine/scene_generator.js`)

```javascript
const llmClient = require('../ai/llm_client');

class SceneGenerator {
  /**
   * Формирует визуально-бытовой кадр для текущего тика
   */
  async buildSceneContext(locationNode, previousConsequence, weatherState) {
    const prompt = `
Ты — физический движок окружения симуляции. Сгенерируй короткое описание текущего кадра/сцены, в которой находится 19-летняя Лера.

ТЕКУЩАЯ ЛОКАЦИЯ: ${locationNode.name} (${locationNode.category})
ПОД-ЛОКАЦИИ: ${locationNode.sub_locations.join(', ')}
СТАТИЧЕСКИЕ ПРЕДМЕТЫ: ${locationNode.static_props.join(', ')}
ПОГОДА: ${weatherState || "Санкт-Петербург, пасмурно, ветрено, +15°C"}
ИТОГ ПРЕДЫДУЩЕГО ДЕЙСТВИЯ: "${previousConsequence}"

Напиши 2-3 предложения с деталями сцены: что находится прямо перед глазами Леры, какие предметы видны, какая атмосфера вокруг. 
Никаких абстракций. Только конкретные физические объекты и детали окружения.
`;

    try {
      const sceneText = await llmClient.generateText(prompt);
      return sceneText.trim();
    } catch (e) {
      return `Лера находится в локации ${locationNode.name}. Вокруг обычная обстановка.`;
    }
  }
}

module.exports = new SceneGenerator();

```

---

### 6.4. Главный Цикл `game_loop.js` (Последовательное связывание)

```javascript
const fs = require('fs');
const path = require('path');
const mapEngine = require('./map_engine');
const sceneGenerator = require('./scene_generator');
const needsCalculator = require('./needs_calculator');
const randomEvents = require('./random_events');
const llmClient = require('../ai/llm_client');

const STATE_PATH = path.join(__dirname, '../state/lera_state.json');
const LOG_PATH = path.join(__dirname, '../state/daily_log.json');
const SCHEDULE_PATH = path.join(__dirname, '../state/current_schedule.json');

async function runTick() {
  console.log('⏱️ [GAME LOOP] Запуск последовательного тика...');

  // 1. Чтение текущего состояния и историй
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const dailyLog = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  const schedule = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));

  // 2. Внимание! Извлечение ИТОГА предыдущего тика (N-1)
  const lastEntry = dailyLog.length > 0 ? dailyLog[dailyLog.length - 1] : null;
  const previousConsequence = lastEntry 
    ? lastEntry.consequence 
    : "Проснулась, лежит в кровати, планирует день.";

  // 3. Актуализация потребностей (Физиологический расчет)
  needsCalculator.recalculate(state);

  // 4. Получение локации и генерация сцены
  const currentLocationNode = mapEngine.getCurrentLocation(state.current_node_id);
  const sceneDescription = await sceneGenerator.buildSceneContext(
    currentLocationNode, 
    previousConsequence, 
    "СПб, пасмурно, +14°C, ветер 7 м/с"
  );

  // 5. Определение активности текущего слота
  const currentSlotNumber = new Date().getHours();
  let currentSlotActivity = schedule.slots[currentSlotNumber]?.activity || "Неизвестно";

  // 6. Бросок кубика D100 на Хаос/Событие
  let chaosEvent = null;
  if (Math.random() < 0.30) { // 30% шанс хаоса
    chaosEvent = await randomEvents.generateDynamicEvent(state, currentSlotActivity, sceneDescription);
  }

  // 7. Сборка контекста для генерации шага тика
  const prompt = `
Ты — Лера (19 лет, СПбГИК, фрилансер). Твоя задача — сгенерировать 3 поля дневника на основе ТЕКУЩЕГО ФИЗИЧЕСКОГО КАДРА И ИТОГА ПРЕДЫДУЩЕГО ШАГА.

[ИТОГ ПРЕДЫДУЩЕГО ШАГА (N-1)]:
"${previousConsequence}"

[ТЕКУЩАЯ СЦЕНА И ОКРУЖЕНИЕ]:
${sceneDescription}

[СОСТОЯНИЕ И СТАТЫ]:
- Локация: ${currentLocationNode.name}
- Деньги на карте: ${state.wallet.rubles} руб.
- Потребности: Голод ${state.needs.hunger}/100, Пошлость ${state.needs.horny}/100, Усталость ${state.needs.fatigue}/100
- Надето: ${state.wearing_now.top}, ${state.wearing_now.bottom}
${chaosEvent ? `\n[ВНЕЗАПНОЕ ПРОИСШЕСТВИЕ!]: ${chaosEvent.event_description}` : ''}

Сформируй STRICT JSON с тремя полями:
{
  "thought": "Скрытые эмоциональные мысли Леры (с легким матом, зумерским сленгом, без буквы Ё)",
  "action": "Конкретное физическое действие, которое совершает Лера прямо сейчас в этой сцене",
  "consequence": "Итог этого действия: что изменилось, куда направилась, какие статы/деньги потратила"
}
`;

  // 8. Вызов LLM и разбор ответа
  const response = await llmClient.generateJson(prompt);

  // 9. Сохранение записи в дневник
  const logEntry = {
    time: `${currentSlotNumber}:00`,
    slot: currentSlotNumber,
    location: currentLocationNode.name,
    scene: sceneDescription,
    thought: response.thought,
    action: response.action,
    consequence: response.consequence
  };

  dailyLog.push(logEntry);
  fs.writeFileSync(LOG_PATH, JSON.stringify(dailyLog, null, 2));

  // 10. Сохранение обновленного стейта
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  console.log(`✅ [TICK DONE] Локация: ${currentLocationNode.name} | Итог: ${response.consequence}`);
}

module.exports = { runTick };

```

---

## 7. АДМИН-ПАНЕЛЬ И ВЕБ-КАРТА (`src/server/public/index.html`)

Интерфейс админ-панели использует визуализацию на базе **Leaflet.js** для отображения перемещений Леры по Петербургу в реальном времени.

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Lera 2.0 - Control & Map Panel</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    #map { height: 600px; width: 100%; border-radius: 12px; }
    .status-card { background: #1a1a1a; color: #fff; padding: 15px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>Карта перемещений Леры (Санкт-Петербург)</h1>
  <div id="map"></div>
  
  <div class="status-card">
    <h3>Текущий Стейт:</h3>
    <p id="current-location">Локация: Загрузка...</p>
    <p id="current-action">Действие: Загрузка...</p>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    // Инициализация карты с центром на Петроградке
    const map = L.map('map').setView([59.9589, 30.3049], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Иконка маркера Леры
    const leraIcon = L.icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
      iconSize: [38, 38]
    });

    let marker = L.marker([59.9589, 30.3049], { icon: leraIcon }).addTo(map)
      .bindPopup('Лера дома (Петроградка)')
      .openPopup();

    // Функция обновления координат с сервера
    async function updateMapState() {
      const response = await fetch('/api/state');
      const data = await response.json();

      if (data.coordinates) {
        const newLatLng = new L.LatLng(data.coordinates[0], data.coordinates[1]);
        marker.setLatLng(newLatLng);
        marker.getPopup().setContent(`<b>${data.location_name}</b><br>${data.last_action || ''}`);
        map.panTo(newLatLng);

        document.getElementById('current-location').innerText = `Локация: ${data.location_name}`;
        document.getElementById('current-action').innerText = `Действие: ${data.last_action}`;
      }
    }

    // Опрос каждые 10 секунд
    setInterval(updateMapState, 10000);
    updateMapState();
  </script>
</body>
</html>

```

---

## 8. ИТОГОВЫЙ ЧЕК-ЛИСТ ДЛЯ РАЗРАБОТЧИКА

1. **Рефакторинг схемы дневника:** Запретить генерацию мыслей вне контекста кадра сцены. Добавить запуск `scene_generator.js` в начале каждого тика.
2. **Передача результатов $N-1 \to N$:** Проверить, что текстовая дельта `consequence` из элемента `daily_log[daily_log.length - 1]` безусловно подставляется в промпт следующего тика.
3. **Замена жесткого расписания на каркасное:** В `schedule_generator.js` генерировать только 2–4 якорных события, оставив intermediate слоты со статусом `UNKNOWN`.
4. **Внедрение `map_engine.js`:** Загрузить гео-координаты Петроградки и связать переходы между узлами с мутацией поля `coordinates` в `lera_state.json`.
5. **Строгая блокировка галлюцинаций:** Добавить валидатор ответов, отбраковывающий любые упоминания сторонних мужчин или фальшивых сюжетных линий, не связанных с текущим пользователем.вопросы