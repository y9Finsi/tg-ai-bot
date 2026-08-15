import { StateRepository } from '../db/state_repository.js';
import { GOAPPlanner } from '../radiant/goap_planner.js';
import { LOCATIONS, coordinateAtProgress } from '../radiant/world_map.js';
import { getEquippedClothes } from '../radiant/inventory.js';
import { calculateMood } from '../radiant/needs.js';
import { WeatherService } from '../radiant/weather_service.js';
import { getUser } from '../db/database.js';
import { getContextPromptTemplate } from '../prompts.js';
import { getUserRelationship, getChannelSubscriberCount } from '../db/database.js';
import { relationshipToPrompt } from './relationship.js';

export class ContextBuilder {
    static async buildSnapshot(overrides = {}) {
        const stateRow = await StateRepository.getState();
        WeatherService.syncOverride(stateRow?.weather_override);
        const [inventory, queue, executable, loadedFacts, observerDigests, loadedWeather, user, relationship, channelSubscribers] = await Promise.all([
            StateRepository.getInventory(),
            StateRepository.getQueue(),
            StateRepository.getExecutableTask(),
            StateRepository.getRecentFactualEvents(12).catch(() => []),
            StateRepository.getRecentObserverBatches(3).catch(() => []),
            WeatherService.getSnapshot(),
            overrides.userId ? getUser(overrides.userId).catch(() => null) : Promise.resolve(null),
            overrides.userId ? getUserRelationship(overrides.userId).catch(() => null) : Promise.resolve(null),
            getChannelSubscriberCount().catch(() => null)
        ]);
        const commitments = await StateRepository.getCommitments(null, null).catch(() => []);
        const facts = Array.isArray(overrides.dailyFacts)
            ? overrides.dailyFacts.map((fact, index) => typeof fact === 'string'
                ? { id: `sandbox-fact-${index}`, event_type: 'SANDBOX_FACT', payload: { text: fact } }
                : fact).filter(Boolean)
            : loadedFacts;
        const weather = overrides.weather && typeof overrides.weather === 'object'
            ? { ...loadedWeather, ...overrides.weather }
            : loadedWeather;
        const state = { ...(stateRow || {}), ...(overrides.location_id ? { location_id: overrides.location_id } : {}), needs: { ...(stateRow?.needs || {}), ...(overrides.needs || {}) }, physiology: { ...(stateRow?.physiology || {}), ...(overrides.physiology || {}) } };
        delete state.needs.mood;
        const activeTask = overrides.active_task || executable || queue.find(task => ['PENDING', 'IN_PROGRESS', 'IN_TRANSIT'].includes(task.status)) || null;
        const location = LOCATIONS[state.location_id] || LOCATIONS.petrogradka_home;
        const transit = activeTask?.task_type === 'TRAVEL' || activeTask?.status === 'IN_TRANSIT'
            ? { from: activeTask.transit_from_location || state.location_id, to: activeTask.transit_to_location || activeTask.target_location, progress_percent: Number(activeTask.transit_progress_percent || 0), coordinate: coordinateAtProgress(activeTask.transit_route, activeTask.transit_progress_percent) }
            : null;
        const activeCommitments = commitments.filter(item => !['COMPLETED', 'CANCELLED', 'MISSED'].includes(item.status));
        const missedCommitments = commitments.filter(item => item.status === 'MISSED');
        return {
            state, inventory, queue, facts, observerDigests, weather, activeTask, location, transit, commitments: activeCommitments, missedCommitments,
            relationship, channelSubscribers,
            mood: Number.isFinite(Number(overrides.mood))
                ? Math.max(0, Math.min(100, Math.round(Number(overrides.mood))))
                : calculateMood(state),
            willingness: GOAPPlanner.explainWillingness(state), user,
            preMessageGapSeconds: overrides.preMessageGapSeconds,
            previousActivityAt: overrides.previousActivityAt,
            currentTime: overrides.currentTime,
            outfitText: overrides.outfit_text,
            routingMode: overrides.routingMode || null
        };
    }

    static async buildTelegramContextDetailed(userId, options = {}) {
        const snapshot = await this.buildSnapshot({ ...(options.overrides || {}), userId });
        const actionPrompt = options.actionResult ? this.formatActionResultPrompt(options.actionResult) : '';
        const baseText = this.toPrompt(snapshot);
        const fullText = actionPrompt ? `${baseText}\n\n${actionPrompt}` : baseText;
        return {
            text: fullText,
            analysis: this.toAnalysis(snapshot),
            actionResultPrompt: actionPrompt,
            layers: {
                physics: { needs: snapshot.state.needs, physiology: snapshot.state.physiology, active_modifiers: snapshot.state.active_modifiers || [], mood: snapshot.mood },
                location: snapshot.location,
                active_task: snapshot.activeTask,
                transit: snapshot.transit,
                weather: snapshot.weather,
                willingness: snapshot.willingness,
                outfit: this.describeOutfit(snapshot.inventory, snapshot.activeTask),
                factual_events: snapshot.facts,
                observer_digests: snapshot.observerDigests,
                commitments: snapshot.commitments,
                missed_commitments: snapshot.missedCommitments,
                user: snapshot.user,
                relationship: snapshot.relationship,
                actionResult: options.actionResult || null
            }
        };
    }

    static formatActionResultPrompt(actionResult) {
        if (!actionResult || typeof actionResult !== 'object') return '';
        if (actionResult.status === 'error') {
            return `=== ⚡ ВНЕШНЕЕ ДЕЙСТВИЕ (ОШИБКА) ===\nДействие: ${actionResult.action}\nСтатус: ошибка (${actionResult.error?.message || 'сбой выполнения'})\n(Действие не удалось, отвечай обычным образом без технических подробностей).`;
        }

        const data = actionResult.data || {};
        let textContent = '';
        if (typeof data === 'string') {
            textContent = data;
        } else if (data.text) {
            textContent = data.text;
        } else {
            textContent = JSON.stringify(data, null, 2);
        }

        let sourcesText = '';
        if (Array.isArray(data.sources) && data.sources.length > 0) {
            const sourceLines = data.sources.slice(0, 5).map(s => `- ${s.title}: ${s.url}`).join('\n');
            sourcesText = `\nИсточники:\n${sourceLines}`;
        }

        return `=== ⚡ АКТУАЛЬНЫЕ ДАННЫЕ (ACTION RESULT) ===\nДействие: ${actionResult.action}\nДанные:\n${textContent}${sourcesText}\n(Используй эту информацию органично в своей реплике, сохраняя тон и характер Леры).`;
    }

    static async buildTelegramContext(userId, options = {}) { return (await this.buildTelegramContextDetailed(userId, options)).text; }

    static toPrompt(snapshot) {
        const userName = snapshot.user?.first_name || 'пользователь';
        const pause = formatConversationGap(snapshot.preMessageGapSeconds);
        const continuityGuidance = formatConversationContinuityGuidance(snapshot.preMessageGapSeconds);
        const prompt = getContextPromptTemplate()
            .replaceAll('{{CONTEXT_PARTNER}}', userName)
            .replaceAll('{{CONTEXT_PAUSE}}', pause || '')
            .replaceAll('{{CONTEXT_PAUSE_LINE}}', pause ? `• Пауза в диалоге: ${pause}` : '')
            .replaceAll('{{CONTEXT_PAUSE_GUIDANCE}}', continuityGuidance)
            .replaceAll('{{CONTEXT_ANALYSIS}}', this.toAnalysis(snapshot));
        return continuityGuidance && !prompt.includes(continuityGuidance)
            ? `${prompt}\n${continuityGuidance}`
            : prompt;
    }

    static toAnalysis(snapshot) {
        const isErotic = snapshot.routingMode === 'EROTIC';
        const needs = snapshot.state.needs || {}; const task = snapshot.activeTask;
        const facts = uniqueLines((snapshot.facts || []).map(humanizeFact)).slice(0, 6);
        const plans = uniqueLines((snapshot.commitments || []).map(humanizePlan)).slice(0, 4);
        const events = uniqueLines([...facts, ...plans]).slice(0, 8);
        const sleepGuidance = !isErotic && isSleepingTask(task)
            ? '\n• Состояние сна: можно коротко сказать, что Лера спала или только проснулась. Не имитируй голос, слух, шёпот, дыхание или звуки; не используй многоточия в начале фразы.'
            : '';
        const currentStatus = isErotic && isSleepingTask(task)
            ? 'Дома'
            : humanizeCurrentStatus(task, snapshot.transit);
        const wellbeing = isErotic
            ? 'Чувствует себя хорошо, возбуждена и готова к близости'
            : humanizeWellbeing(snapshot.mood, needs, snapshot.state?.physiology);
        return `${relationshipToPrompt(snapshot.relationship || {})}

[СОСТОЯНИЕ ЛЕРЫ И ОКРУЖЕНИЕ]
• Время: ${formatContextDate(snapshot.currentTime)}
• Локация: ${humanizeLocation(snapshot.location.name)}
• Текущий статус: ${currentStatus}
• Самочувствие: ${wellbeing}
• Одежда дома: ${humanizeOutfit(snapshot.outfitText || this.describeOutfit(snapshot.inventory, task).text)}
• Погода за окном: ${humanizeWeather(snapshot.weather)}${sleepGuidance}
• Telegram-канал (ТГК Леры): ${snapshot.channelSubscribers !== null && snapshot.channelSubscribers !== undefined ? `${snapshot.channelSubscribers} подписчиков (актуальное число)` : 'ведёт личный ТГК'}

[ГЛАВНЫЕ СОБЫТИЯ ЗА ДЕНЬ (ПРОШЕДШЕЕ ВРЕМЯ)]
${events.length ? events.join('\n') : '- Значимых подтверждённых событий пока нет.'}`;
    }

    static describeOutfit(inventory = [], activeTask = null) {
        if (isSleepingTask(activeTask)) {
            return {
                text: 'oversized_tshirt, pajama',
                bySlot: {
                    top: { item_id: 'oversized_tshirt', rain_resist: false },
                    sleep: { item_id: 'pajama', rain_resist: false }
                }
            };
        }
        const equipped = inventory.filter(item => item.item_type === 'clothes' && item.is_equipped && Number(item.quantity) > 0);
        if (!equipped.length) return { text: getEquippedClothes(inventory)?.item_id || 'домашняя футболка', bySlot: {} };
        const bySlot = Object.fromEntries(equipped.map(item => [item.properties?.slot || 'top', { item_id: item.item_id, rain_resist: !!item.properties?.rain_resist }]));
        return { text: Object.values(bySlot).map(item => item.item_id).join(', '), bySlot };
    }
}

const TASK_LABELS = {
    SLEEP_NIGHT: 'спит ночью', SLEEP_EXHAUSTED: 'отсыпается', EAT_BREAKFAST: 'завтракает', EAT_LUNCH: 'обедает', EAT_DINNER: 'ужинает', EMERGENCY_EAT: 'ест из-за сильного голода',
    WORK_LAPTOP: 'работает за ноутбуком', TRAVEL: 'едет', SOCIAL_NASTYA: 'встречается с Настей', LEISURE_HOME: 'отдыхает дома', IDLE_HOME_REST: 'делает паузу дома',
    GO_TO_BATHROOM: 'идёт в туалет', SHOWER_HOME: 'принимает душ', PRIVATE_RELIEF: 'занимается личными делами', PREPARE_FOR_OUTING: 'собирается выйти'
};
const COMPLETED_TASK_LABELS = {
    SLEEP_NIGHT: 'поспала ночью',
    SLEEP_EXHAUSTED: 'отоспалась',
    EAT_BREAKFAST: 'позавтракала',
    EAT_LUNCH: 'пообедала',
    EAT_DINNER: 'поужинала',
    EMERGENCY_EAT: 'поела',
    WORK_LAPTOP: 'занималась рабочими делами по СММ',
    TRAVEL: 'съездила',
    SOCIAL_NASTYA: 'увиделась с Настей',
    LEISURE_HOME: 'отдохнула дома',
    IDLE_HOME_REST: 'отдохнула дома',
    SHOWER_HOME: 'приняла душ',
    PRIVATE_RELIEF: 'занялась личными делами',
    PREPARE_FOR_OUTING: 'собралась выйти'
};
const HIDDEN_MICRO_TASKS = new Set(['GO_TO_BATHROOM']);
const LOCATION_LABELS = { petrogradka_home: 'дома на Петроградке', showroom_work: 'в рабочем месте', cafe_sloy: 'в кафе', vkusvill_lenina: 'в магазине', bar_rubinsteina: 'в баре на Рубинштейна' };
const EVENT_LABELS = { WORK_REQUEST_CREATED: 'Макс прислал рабочую задачу', SOCIAL_MEETING_PROPOSED: 'Настя предложила встретиться', COMMITMENT_MISSED: 'Лера не успела выполнить план', RANDOM_EVENT: 'произошло неожиданное событие' };

function humanizeTask(value) { return TASK_LABELS[value] || 'занимается делом'; }
function humanizeCompletedTask(value) { return COMPLETED_TASK_LABELS[value] || 'закончила дела'; }
function humanizeLocation(value) { return LOCATION_LABELS[value] || String(value || 'дома').replaceAll('_', ' '); }
function formatContextDate(value) {
    const date = parseContextDate(value);
    if (Number.isNaN(date.getTime())) return String(value || 'время не указано');
    const parts = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).formatToParts(date);
    const get = (type) => parts.find(part => part.type === type)?.value || '';
    const weekday = get('weekday');
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${get('day')}.${get('month')}.${get('year')}, ${get('hour')}:${get('minute')} (Москва/Питер)`;
}
function parseContextDate(value) {
    if (!value) return new Date();
    const text = String(value).trim();
    const mskText = text.match(/^(\d{4}-\d{2}-\d{2})[ ,T]+(\d{2}:\d{2})(?::\d{2})?\s*MSK$/i);
    if (mskText) return new Date(`${mskText[1]}T${mskText[2]}:00+03:00`);
    return new Date(value);
}
function humanizeWeather(weather = {}) {
    const text = String(weather.text || '').trim();
    if (text) return text;
    if (weather.is_raining === true) return 'Идёт дождь';
    if (weather.is_raining === false) return 'Без осадков';
    return 'Погода неизвестна';
}
function humanizeOutfit(value) {
    const labels = { oversized_tshirt: 'Oversized футболка', oversized_t_shirt: 'Oversized футболка', pajama: 'пижама', pajamas: 'пижама', shorts: 'шорты' };
    return String(value || 'домашняя одежда').split(',').map(item => labels[item.trim()] || item.trim().replaceAll('_', ' ')).filter(Boolean).join(' / ');
}
function humanizeCurrentStatus(task, transit) {
    if (transit?.to) return `Едет в ${humanizeLocation(transit.to)}`;
    if (transit) return 'В дороге';
    if (!task) return 'Свободна';
    const labels = { SLEEP_NIGHT: 'Спит (отдыхает до утра)', SLEEP_EXHAUSTED: 'Спит (отсыпается)', LEISURE_HOME: 'Отдыхает дома', IDLE_HOME_REST: 'Отдыхает дома' };
    return labels[task.task_type] || capitalize(humanizeTask(task.task_type));
}
function isSleepingTask(task) {
    return ['SLEEP_NIGHT', 'SLEEP_EXHAUSTED'].includes(task?.task_type);
}
function humanizeWellbeing(mood, needs = {}, physiology = {}) {
    const fatigue = Number(needs.fatigue || 0);
    const moodText = Number(mood || 0) >= 55 ? 'в целом всё нормально' : 'настроение тяжёлое';
    const cycleDay = Number(physiology?.cycle_day || 0);
    let cycleNote = '';
    if (cycleDay >= 1 && cycleDay <= 2) {
        cycleNote = ' (начало цикла: тянет низ живота, лёгкая слабость, хочется тепла)';
    } else if (cycleDay >= 12 && cycleDay <= 14) {
        cycleNote = ' (середина цикла: пик энергии и чувственности)';
    } else if (cycleDay >= 25 && cycleDay <= 28) {
        cycleNote = ' (ПМС: обострённая эмоциональная чувствительность)';
    }
    if (fatigue >= 80) return `Заметная усталость, тяжёлый день, но ${moodText}${cycleNote}`;
    if (fatigue >= 55) return `Усталость заметна, но ${moodText}${cycleNote}`;
    return `Чувствует себя нормально, ${moodText}${cycleNote}`;
}
function capitalize(value) { const text = String(value || ''); return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text; }
function humanizeModifiers(modifiers = []) { return modifiers.length ? modifiers.map(value => String(value).replaceAll('_', ' ').toLowerCase()).join(', ') : 'ничего особенного'; }
function humanizeWillingness(willingness = {}) { const value = Number(willingness.value || 0); return value >= 70 ? 'ей легко браться за внешние дела' : value >= 40 ? 'она может заниматься делами без спешки' : 'ей трудно переключаться на внешние дела'; }
function humanizeNeed(value, label) { const number = Number(value || 0); const strong = { голод: 'сильный голод', усталость: 'сильная усталость', скука: 'сильная скука', 'личное напряжение': 'сильное личное напряжение', 'потребность в туалете': 'сильная потребность в туалете' }[label] || `сильная ${label}`; return number >= 80 ? `${strong}, скоро начнёт мешать` : number >= 55 ? `${label} заметна` : `${label} пока не мешает`; }
function humanizeHygiene(value) { const number = Number(value ?? 100); return number <= 30 ? 'пора привести себя в порядок' : number <= 60 ? 'можно освежиться позже' : 'всё в порядке'; }
function humanizeMood(value) { const number = Number(value || 0); return number >= 70 ? 'настроение хорошее' : number >= 40 ? 'настроение ровное' : 'настроение тяжёлое'; }
function humanizeFact(event = {}) {
    const payload = event.payload || {};
    if (event.event_type === 'SANDBOX_FACT' && payload.text) return `- ${payload.text}`;
    if (event.event_type === 'TASK_COMPLETED' && payload.taskType) {
        if (HIDDEN_MICRO_TASKS.has(payload.taskType)) return null;
        return `- Лера ${humanizeCompletedTask(payload.taskType)}${payload.locationId ? ` ${locationPhrase(payload.locationId)}` : ''}.`;
    }
    if (event.event_type === 'TRAVEL_COMPLETED' && (payload.locationId || payload.to)) return `- Лера приехала ${locationPhrase(payload.locationId || payload.to)}.`;
    if (event.event_type === 'RANDOM_EVENT' && payload.title) return `- ${payload.title}.`;
    if (event.event_type === 'WORK_REQUEST_CREATED' || event.event_type === 'SOCIAL_MEETING_PROPOSED') return `- ${EVENT_LABELS[event.event_type]}.`;
    return null;
}

function humanizePlan(item = {}) {
    if (!item.title) return null;
    return `- В плане: «${item.title}»${item.target_location || item.targetLocation ? `, ${locationPhrase(item.target_location || item.targetLocation)}` : ''}.`;
}

function locationPhrase(value) {
    const location = humanizeLocation(value);
    return /^(в |дома\b)/i.test(location) ? location : `в ${location}`;
}

function uniqueLines(lines = []) { return [...new Set(lines.filter(Boolean))]; }

function formatConversationGap(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return '';
    return formatGapLabel(seconds);
}

function formatConversationContinuityGuidance(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds > 10 * 60) return '';
    return `• Непрерывность диалога: после предыдущей реплики прошло всего ${formatElapsedPause(seconds)}. Продолжай свежую сцену из истории; она важнее расписания и приветствия пользователя. Не объявляй, что наступило утро, Лера уснула или только проснулась, только потому что пользователь написал «доброе утро» или «споки». Если слова пользователя шутливо противоречат только что сказанному, подхвати шутку или мягко отметь несостыковку.`;
}

function formatElapsedPause(seconds) {
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} секунд назад`;
    if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} минут назад`;
    return `${Math.max(1, Math.round(seconds / 3600))} часов назад`;
}

function formatGapLabel(seconds) {
    if (seconds <= 10 * 60) return 'продолжение беседы';
    if (seconds < 6 * 3600) return 'возвращение к диалогу';
    if (seconds < 24 * 3600) return 'длинная пауза';
    return 'после долгого перерыва';
}
