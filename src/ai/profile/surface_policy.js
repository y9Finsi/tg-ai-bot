export const SURFACES = Object.freeze(['CHAT', 'GROUP', 'CHANNEL', 'COMMENTS', 'INITIATIVE']);

const SAFE_READ = Object.freeze(['web_search', 'weather', 'spb_places', 'get_channel_posts']);
const PRIVATE_READ = Object.freeze([...SAFE_READ, 'search_archive_memory']);

export const SURFACE_POLICY = Object.freeze({
    CHAT: { memory: 'private', allowedTools: PRIVATE_READ, forbiddenTools: [], output: 'telegram_bubbles' },
    GROUP: { memory: 'none', allowedTools: SAFE_READ, forbiddenTools: ['search_archive_memory', 'set_reaction', 'schedule_followup', 'schedule_reminder'], output: 'telegram_bubbles' },
    CHANNEL: { memory: 'public_only', allowedTools: ['web_search', 'weather', 'spb_places', 'get_channel_posts', 'send_content'], forbiddenTools: ['search_archive_memory', 'send_voice', 'schedule_followup', 'schedule_reminder'], output: 'channel_post' },
    COMMENTS: { memory: 'public_only', allowedTools: SAFE_READ, forbiddenTools: ['search_archive_memory', 'set_reaction', 'send_voice', 'schedule_followup', 'schedule_reminder'], output: 'comment_json' },
    INITIATIVE: { memory: 'private_limited', allowedTools: PRIVATE_READ.concat(['send_photo', 'send_voice', 'send_content', 'set_reaction', 'record_open_thread']), forbiddenTools: ['schedule_followup', 'schedule_reminder'], output: 'telegram_bubbles' }
});

export function normalizeSurface(surface = 'CHAT') {
    const value = String(surface || 'CHAT').toUpperCase();
    if (value === 'CHANNEL_COMMENT') return 'COMMENTS';
    return SURFACES.includes(value) ? value : 'CHAT';
}

export function getSurfacePolicy(surface) {
    return SURFACE_POLICY[normalizeSurface(surface)];
}

export function isToolAllowed(toolName, surface, context = {}) {
    const mode = normalizeSurface(surface || context.surface);
    const policy = getSurfacePolicy(mode);
    if (policy.forbiddenTools.includes(toolName)) return false;
    return policy.allowedTools.includes(toolName);
}

export function assertToolAllowed({ toolName, surface, context = {} }) {
    const mode = normalizeSurface(surface || context.surface);
    if (!isToolAllowed(toolName, mode, context)) {
        const error = new Error(`Действие '${toolName}' запрещено для поверхности ${mode}`);
        error.code = 'TOOL_NOT_ALLOWED';
        error.surface = mode;
        throw error;
    }
    return true;
}

export function getAllowedToolNames(surface) {
    return [...getSurfacePolicy(surface).allowedTools];
}
