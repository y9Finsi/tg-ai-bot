import { normalizeSurface } from './surface_policy.js';

function readPath(object, path) {
    return path.split('.').reduce((value, key) => value == null ? undefined : value[key], object);
}

function format(value) { return value === undefined ? 'missing' : JSON.stringify(value); }

export function evaluateRule(rule, context = {}) {
    const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];
    for (const condition of conditions) {
        const actual = condition.field === 'surface' 
            ? normalizeSurface(context.surface) 
            : (condition.field === 'mode' || condition.field === 'routingMode'
                ? String(context.mode || context.routingMode || 'CASUAL').toUpperCase()
                : readPath(context, condition.field));
        const expected = condition.value;
        let matched = false;
        if (condition.operator === 'equals') matched = actual === expected;
        else if (condition.operator === 'in') matched = Array.isArray(expected) && expected.includes(actual);
        else if (condition.operator === 'gte') matched = Number(actual) >= Number(expected);
        else if (condition.operator === 'lte') matched = Number(actual) <= Number(expected);
        else if (condition.operator === 'between') matched = Array.isArray(expected) && Number(actual) >= Number(expected[0]) && Number(actual) <= Number(expected[1]);
        if (!matched) return { active: false, reason: `${condition.field} expected ${format(expected)}, received ${format(actual)}` };
    }
    return { active: true, reason: 'all conditions matched' };
}

export function explainRule(rule, context = {}) { return evaluateRule(rule, context); }

export function evaluateRules(rules = [], context = {}) {
    const active = [];
    const skipped = [];
    for (const rule of rules) {
        if (rule?.enabled === false) { skipped.push({ ruleId: rule.id, title: rule.title, reason: 'disabled' }); continue; }
        const targetSurface = normalizeSurface(context.surface);
        const ruleSurfaces = Array.isArray(rule?.surfaces) && rule.surfaces.length > 0
            ? rule.surfaces.map(normalizeSurface)
            : [normalizeSurface(rule?.surface || 'CHAT')];
        const surfaceMatches = ruleSurfaces.includes('ALL') || ruleSurfaces.includes(targetSurface);
        if (!surfaceMatches) {
            skipped.push({ ruleId: rule.id, title: rule.title, reason: `surface [${ruleSurfaces.join(', ')}] does not match ${targetSurface}` });
            continue;
        }

        // Mode condition check (CASUAL / EROTIC / ALL)
        const currentMode = String(context.mode || context.routingMode || 'CASUAL').toUpperCase();
        const ruleMode = String(rule?.mode || 'ALL').toUpperCase();
        if (ruleMode !== 'ALL' && ruleMode !== currentMode) {
            skipped.push({ ruleId: rule.id, title: rule.title, reason: `mode ${ruleMode} does not match current mode ${currentMode}` });
            continue;
        }

        const result = evaluateRule(rule, context);
        if (result.active) active.push(rule); else skipped.push({ ruleId: rule.id, title: rule.title, reason: result.reason });
    }
    active.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    return { active, skipped };
}
