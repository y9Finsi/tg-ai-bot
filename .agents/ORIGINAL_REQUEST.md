# Original User Request

## Initial Request — 2026-08-25T01:34:23+03:00

Полный рефакторинг админ-панели и модуля публикаций в Telegram-канал (ТГК) бота Леры: модульная декомпозиция фронтенда, устранение десинхронизации генерации/публикации AI-медиа, создание централизованной матрицы AI-провайдеров с валидацией эндпоинтов, внедрение интерактивного D3-графа памяти и оптимизация работы с медиа.

Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main
Integrity mode: development

## Requirements

### R1. TGK Publishing & WYSIWYG Photo Consistency
- Fix image desynchronization in channel post publishing: when a draft with a generated AI photo preview (preview_url / buffer) is published, send the exact previewed image to Telegram rather than triggering a random re-generation.
- Fix auto-posting cron scheduler: calculate daily post limits based on calendar day in Europe/Moscow (00:00 MSK) rather than a rolling 24-hour window. Remove artificial constraints on post frequency (Math.max(12)) and daily posts (Math.min(2)).
- Implement intelligent text adaptation in src/channel_content.js to prevent hard rejections on minor character limit overflows (up to 15-20%).

### R2. Centralized AI Model Matrix & Routing
- Centralize provider configuration and roles into a unified model matrix: Core Dialogue (LLM with ordered fallbacks), Style Classifier, Judge, Text-to-Image generator (with explicit protocol selector: /images/generations vs /chat/completions), Image-to-Image / Edit (/chat/completions with required reference verification), and Voice (TTS).
- Provide instant diagnostic health-checks for every model slot.

### R3. Frontend Modular Architecture & Hash Navigation
- Refactor the 6,000-line monolithic admin-v2/src/main.jsx into a clean, feature-driven directory structure (admin-v2/src/features/{channel, crm, studio, providers, content, simulation}).
- Implement a modern SPA sidebar layout with hash-based routing (#channel, #crm, #studio, #providers, #content, #simulation) where each tab operates as an isolated component with independent state and caching.

### R4. CRM & Interactive Force-Directed Memory Graph
- Replace the static 4x4 coordinate grid in MemoryGraph with an interactive, physical force-directed graph (D3 / SVG canvas) supporting zooming, panning, node dragging, and inspectable relationship edges.
- Virtualize user chat history scrolling in CRM cards to maintain 60 FPS performance during inspection of extensive message histories.

### R5. Media Optimization & Channel Permission Diagnostics
- Implement client-side image compression (HTML5 Canvas) before uploading to reduce file sizes to 2–3 MB, completely eliminating 413 Payload Too Large errors.
- Add an instant channel access validation endpoint (GET /api/admin/channel/check-access) and UI button to verify Telegram bot administrative permissions (can_post_messages) and display channel metadata before publishing.

## Acceptance Criteria

### Backend & Core Logic
- [ ] Publishing a post draft with a generated AI photo sends the exact previewed image directly to Telegram without triggering duplicate generation requests.
- [ ] Channel poster cron operates on calendar days (Europe/Moscow) and respects user-configured post frequency and daily limits without backend clamps.
- [ ] Text-to-image and image-edit providers route to the correct endpoints based on explicit capability/protocol flags, and edit models properly require reference images.
- [ ] GET /api/admin/channel/check-access accurately returns bot permissions and channel details.

### Frontend & UI Architecture
- [ ] Monolithic main.jsx is successfully decomposed into modular sub-packages under src/features/.
- [ ] Hash navigation seamlessly switches between #channel, #crm, #studio, #providers, #content, and #simulation without full-page re-renders.
- [ ] Model Matrix UI allows configuring, switching, and pinging all AI roles from a single interface.
- [ ] CRM Memory Graph renders real force-directed nodes with physics, zoom/pan, and draggable elements.
- [ ] Client-side image upload automatically resizes large images before sending to server.
- [ ] npm run admin:build passes without build or bundling errors.

## Request — 2026-09-03T20:13:51Z

Комплексная трансформация 3D-карты Петроградской стороны в живой симулятор The Sims: процедурные текстуры классических петербургских фасадов (окна со светом, рустовка, витрины), 2.5D персонажи с походкой и социальным ИИ строго на тротуарах, объемные деревья в садах и движущийся трафик машин со светом фар.

Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main
Integrity mode: development

Requested team structure:
1. Дизайнер текстур и фасадов (архитектурные текстуры СПб, окна со светом, витрины кафе, дорожная разметка).
2. Инженер ИИ и симуляции жителей (суточные распорядки, геометрия тротуаров, бесконфликтное движение, социальные реакции).
3. Геймдизайнер городского окружения (3D-деревья в Матвеевском саду и скверах, движущийся трафик машин, уличные фонари).
4. Критик-верификатор (проверка качества интерфейса по лучшему опыту better-ui, концентрические радиусы, палитра Linear).
5. QA Тестировщик (сквозное тестирование через Chrome CDP, проверка отсутствия коллизий со зданиями, сборка `npm run admin:build`).

## Requirements

### R1. Текстурирование 3D-зданий и дорожной сети Петроградки
- Процедурные ритмы окон на фасадах петербургских домов (наличники днем, теплый свет окон в вечернее и ночное время).
- Рустованный цокольный этаж с витринами заведений («Слой», «ВкусВилл», шоурум).
- Четкая дорожная разметка: пешеходные переходы («зебры») на перекрестках и разделительные полосы.

### R2. 2.5D Персонажи The Sims и Поведенческий ИИ
- Замена плоских круглых маркеров на анатомические 2.5D фигурки людей с прорисованной одеждой, шагом и разворотом корпуса по направлению движения.
- Строгая привязка к геометрии тротуаров и «зебр»: пешеходы ни при каких условиях не должны проходить сквозь полигоны 3D-зданий.
- Поведенческий интеллект: суточное расписание жителей, остановки у витрин и на лавочках, социальные реакции и диалоговые бабблы при встрече с другими жителями или Лерой (<15м).

### R3. Городское окружение (The Sims World Design)
- Объемные деревья и кустарники с колыханием крон и мягкими тенями в Матвеевском саду, сквере Низами, сквере Попова и на аллеях.
- Движущийся трафик автомобилей (питерские такси, седаны, синий городской автобус) по Большому и Каменноостровскому проспектам с включением фар в сумерках и ночью.
- Уличные фонарные столбы с конусами теплого света на тротуарах в ночном режиме.

### R4. Архитектурный контроль качества и производительность (Design Engineering)
- Концентрические радиусы скругления модалок и карточек, единая палитра Linear (#08090a, monochrome), тактильный отклик `active:scale-[0.96]`.
- Плавная синхронизированная анимация на 25–30 FPS без перегрузки WebGL и просадок кадров.

### R5. Комплексное автоматизированное тестирование
- Сквозная проверка через Chrome CDP: подтверждение отсутствия захода пешеходов на полигоны домов, проверка зажигания фар машин и света в окнах ночью, проверка интерактивной карточки жителя при клике.
- Сборка проекта `npm run admin:build` и отсутствие ошибок в консоли браузера.

## Acceptance Criteria

### Персонажи и коллизии
- [ ] Пешеходы отображаются как фигурки людей (голова, туловище, ноги в фазе шага), а не плоские круглые иконки.
- [ ] Ни один пешеход не проходит сквозь полигоны 3D-зданий при перемещении по карте.
- [ ] Фигурки поворачиваются лицом в сторону своего движения.
- [ ] При сближении жителей появляются диалоговые бабблы или приветствия.

### Фасады и дорожная сеть
- [ ] 3D-здания имеют текстурный ритм окон (в темноте в окнах горит свет).
- [ ] На ключевых перекрестках присутствуют пешеходные «зебры».

### Городское наполнение
- [ ] В Матвеевском саду и сквере Низами отображаются объемные зеленые деревья с тенями.
- [ ] По проспектам двигаются машинки с включенными фарами в темное время суток.

### Техническое качество
- [ ] `npm run admin:build` завершается с кодом 0 без ошибок.
- [ ] В консоли браузера отсутствуют ошибки WebGL при перемещении камеры, переключении времени суток и симуляции.

## Follow-up — 2026-09-03T20:14:02Z

ВАЖНОЕ ОБНОВЛЕНИЕ ОТ ПОЛЬЗОВАТЕЛЯ ПО ПЕРСОНАЖАМ:
«Инженер ИИ и симуляции: пускай будут тридэ как в гта»

Требование по персонажам обновлено:
Вместо 2.5D плоских спрайтов, персонажи (жители и Лера) должны быть честными 3D-моделями / фигурками (в стиле GTA / Low-Poly 3D человечков с головой, телом, анимированными конечностями в 3D пространстве карты, честным поворотом меша в 3D по направлению ходьбы и 3D-тенями).
Пожалуйста, учтите это во втором слое (Инженер ИИ и симуляции) и при интеграции в WebGL.

## Follow-up — 2026-09-03T20:38:54Z

КРИТИЧЕСКИЙ ФИДБЕК ОТ ПОЛЬЗОВАТЕЛЯ ПО КАЧЕСТВУ ТЕКСТУР И МОДЕЛЕЙ:

1. «текстуры которые предложил геймдизайнер на здания очень парашные»:
   Базовый 2D-канвас с цветными прямоугольниками окон выглядит дешево и мыльно при тайлинге fill-extrusion-pattern.
   ТРЕБУЕТСЯ: переработать текстуры фасадов на качественные, реалистичные и стильные:
   - Скачать/использовать качественные открытые бесшовные текстуры петербургских фасадов (Poly Haven, ambientCG, открытые CDN ассеты: штукатурка, рустованный гранит цоколя, четкие окна с рамами и стеклом, жестяная фальцевая крыша).
   - Либо высокодетализированный SVG/Hi-DPI атлас фасада с фотореалистичными деталями (наличники, лепнина, отражения в стеклах).

2. «если что они могут использовать модельки и текстуры из интернта скачать там нарпимер чтобы качество лучше было»:
   Разрешено и рекомендуется использовать качественные открытые 3D-модели (GLTF/GLB) персонажей, машинок и деревьев (например, из библиотек Kenney, Quaternius, Mixamo/Three.js assets) или качественные PBR текстуры из сети.

Пожалуйста, немедленно скорректируйте генерацию фасадов и используйте качественные ассеты.

## 2026-09-04T03:57:49Z

Комплексная трансформация 3D-карты Петроградской стороны в живой симулятор The Sims / GTA: высококачественные реалистичные текстуры классических петербургских фасадов (рустованный цоколь, окна со светом, фальцевые крыши), честные 3D-модели людей в стиле GTA со скелетной/процедурной кинематикой шага строго на тротуарах (разрешено скачивать качественные GLTF/GLB модели и PBR-текстуры из открытых источников), 3D-деревья в скверах и движущийся трафик машин со светом фар.

Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main
Integrity mode: development

ВАЖНО — ВОЗОБНОВЛЕНИЕ РАБОТЫ ПОСЛЕ СБОЯ КВОТЫ И УТОЧНЕНИЯ ПОЛЬЗОВАТЕЛЯ:
1. Квота полностью сбросилась.
2. Пользователь выразил прямой фидбек:
   - Предыдущие 2D-канвас текстуры зданий выглядели плохо и примитивно. Требуется использовать действительно качественные, реалистичные текстуры/атласы фасадов (скачать из открытых CDN / Poly Haven / ambientCG или сгенерировать ультра-детализированный SVG/Hi-DPI PBR атлас: гранитный руст, четкие рамы окон со стеклом, рельефная штукатурка, фальцевая жестяная кровля, брендовые витрины).
   - Разрешено и приветствуется использовать качественные открытые 3D-модели (GLTF/GLB) из сети (Kenney / Quaternius / Three.js) для 3D-персонажей в стиле GTA, машин с фарами и объемных деревьев.
3. В проекте уже есть наработки:
   - `admin-linear/src/lib/roadMarkingsData.js` (зебры и разметка);
   - `admin-linear/src/lib/threePedestrianLayer.js` (CustomLayer Three.js с 3D моделями);
   - `admin-linear/src/lib/pedestrianData.js` (NavMesh тротуаров без захода на дома);
   - `admin-linear/src/components/FullScreenMap.jsx` (интеграция).
   Продолжите разработку с учетом этих требований и доведите до победы все майлстоуны.

Requested team structure:
1. Дизайнер текстур и фасадов (высококачественные реалистичные текстуры СПб: гранитный руст, четкие окна с рамами и вечерним светом, витрины «Слой»/«ВкусВилл», зебры; разрешено скачивать качественные открытые текстуры/атласы).
2. Инженер ИИ и симуляции жителей (честные 3D-модели людей в стиле GTA с ногами/руками/поворотом, NavMesh тротуаров без захода на дома, суточные распорядки, диалоги при встрече; разрешено использовать открытые GLTF/GLB модели).
3. Геймдизайнер городского окружения (3D-деревья с колыханием крон в Матвеевском саду и скверах, движущиеся машинки с фарами ночью, фонари).
4. Критик-верификатор (проверка качества интерфейса по better-ui, концентрические радиусы, палитра Linear).
5. QA Тестировщик (сквозное тестирование через Chrome CDP, проверка отсутствия коллизий со зданиями, сборка `npm run admin:build`).

## Requirements

### R1. Высококачественные фасады 3D-зданий и дорожная сеть Петроградки
- Замена примитивных канвас-прямоугольников на высококачественные реалистичные текстуры петербургских фасадов (рустованный гранит цоколя, классическая рельефная штукатурка, четкие оконные рамы со стеклом и теплым вечерним светом в темноте, фальцевая кровля; использовать качественные открытые текстурные ассеты/атласы).
- Оформленные витрины заведений первого этажа («Слой», «ВкусВилл», шоурум).
- Четкая дорожная разметка: пешеходные «зебры» на перекрестках и разделительные осевые линии.

### R2. Честные 3D-персонажи людей в стиле GTA и Поведенческий ИИ
- Честные 3D-модели людей (стиль GTA / Low-Poly 3D: голова, торс, анимированные ноги и руки при ходьбе в Three.js пространстве карты, 3D yaw поворот по вектору движения, направленные тени, вращающийся пламбоб над Лерой). Разрешено использовать открытые GLTF/GLB модели (Kenney / Three.js).
- Строгая привязка к геометрии тротуаров и «зебр»: пешеходы ни при каких условиях не должны проходить сквозь полигоны 3D-зданий.
- Поведенческий интеллект: суточное расписание, остановки у витрин и на лавочках в скверах, социальные приветствия и диалоговые бабблы при встрече (<15м).

### R3. Городское окружение (The Sims World Design)
- Объемные 3D-деревья и кустарники с колыханием крон и мягкими тенями в Матвеевском саду, сквере Низами, сквере Попова и на аллеях.
- Движущийся трафик автомобилей (питерские такси, седаны, синий городской автобус) по Большому и Каменноостровскому проспектам с включением фар в сумерках и ночью.
- Уличные фонарные столбы с конусами теплого света на тротуарах в ночном режиме.

### R4. Архитектурный контроль качества и производительность (Design Engineering)
- Концентрические радиусы скругления модалок и карточек, единая палитра Linear (#08090a, monochrome), тактильный отклик `active:scale-[0.96]`.
- Плавная синхронизированная анимация на 25–30 FPS без перегрузки WebGL и просадок кадров.

### R5. Комплексное автоматизированное тестирование
- Сквозная проверка через Chrome CDP: подтверждение отсутствия захода пешеходов на полигоны домов, проверка зажигания фар машин и света в окнах ночью, проверка интерактивной карточки жителя при клике.
- Сборка проекта `npm run admin:build` и отсутствие ошибок в консоли браузера.

## Acceptance Criteria

### Персонажи и коллизии
- [ ] Пешеходы отображаются как честные 3D-модели людей в стиле GTA (с ногами, руками, шагом), а не плоские иконки.
- [ ] Ни один пешеход не проходит сквозь полигоны 3D-зданий при перемещении по карте.
- [ ] Фигурки поворачиваются лицом в сторону своего движения.
- [ ] При сближении жителей появляются диалоговые бабблы или приветствия.

### Фасады и дорожная сеть
- [ ] 3D-здания имеют качественные реалистичные текстуры фасадов и окон (в темноте в окнах горит свет).
- [ ] На ключевых перекрестках присутствуют пешеходные «зебры».

### Городское наполнение
- [ ] В Матвеевском саду и сквере Низами отображаются объемные зеленые деревья с тенями.
- [ ] По проспектам двигаются машинки с включенными фарами в темное время суток.

### Техническое качество
- [ ] `npm run admin:build` завершается с кодом 0 без ошибок.
- [ ] В консоли браузера отсутствуют ошибки WebGL при перемещении камеры, переключении времени суток и симуляции.

## Follow-up — 2026-09-04T04:03:11Z

НАПОМИНАНИЕ И РАЗРЕШЕНИЕ ОТ ПОЛЬЗОВАТЕЛЯ:
«опять же можно юзать интернет для моделек»

Пользователь прямо подчёркивает: обязательно используйте интернет для скачивания качественных 3D-моделей (GLTF/GLB) людей (low-poly GTA biped), машин (такси, седаны, автобус) и деревьев/растительности, а также качественных бесшовных текстур фасадов СПб.

Пожалуйста, скачивайте и используйте открытые ассеты (Kenney, Quaternius, Three.js examples, Poly Haven) в папку public/admin-linear/models/ и public/admin-linear/textures/ для максимального визуального качества!
