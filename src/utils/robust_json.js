/**
 * Parses common LLM JSON mistakes without turning arbitrary prose into data.
 */
export function parseLlmJson(rawText) {
    let text = String(rawText || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```(?:json|javascript|js)?/gi, '')
        .replace(/```/g, '')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, ' ')
        .trim();

    text = text
        .replace(/\/\/[^\n\r]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/:\s*True\b/gi, ': true')
        .replace(/:\s*False\b/gi, ': false')
        .replace(/:\s*None\b/gi, ': null')
        .replace(/:\s*[+-]?(?:Infinity|Inf|NaN)\b/gi, ': null')
        .replace(/:\s*\+([0-9]+(?:\.[0-9]+)?)\b/g, ': $1');

    // Convert single quotes around JSON keys or string values to double quotes
    text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, p1) => {
        return '"' + p1.replace(/"/g, '\\"') + '"';
    });

    // Quote unquoted keys: { key: ... } or , key: ... -> { "key": ... }
    text = text.replace(/([{,]\s*)([A-Za-z_$][\w$-]*)\s*:/g, '$1"$2":');

    // Fix unquoted values starting with colon or text: "title": :Text -> "title": "Text"
    text = text.replace(/:\s*:([^\r\n,}\]]+)/g, ': "$1"');

    // Remove trailing commas before closing braces/brackets: , } -> }
    text = text.replace(/,\s*([}\]])/g, '$1');

    const start = text.search(/[[{]/);
    if (start < 0) throw new Error('LLM не вернул JSON-объект');
    const opening = text[start];
    const closing = opening === '{' ? '}' : ']';
    let depth = 0;
    let quote = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quote = false;
            continue;
        }
        if (char === '"') {
            quote = true;
            continue;
        }
        if (char === opening) depth++;
        if (char === closing) {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    const candidate = end >= start ? text.slice(start, end + 1) : text.slice(start);
    try {
        return JSON.parse(candidate);
    } catch (err) {
        // Fallback cleanup if parsing candidate still failed: replace unescaped control chars / newlines in strings
        const cleaned = candidate.replace(/[\r\n\t]/g, ' ');
        return JSON.parse(cleaned);
    }
}
