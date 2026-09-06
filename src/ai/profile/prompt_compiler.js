export function compileLeraSystemPrompt({ surface, projection, policy, contract, schemas = [] }) {
    const toolNames = schemas.map(tool => '- ' + tool.name).join('\n') || '- нет доступных tools';
    return ['[КАНОНИЧЕСКИЙ ПРОФИЛЬ ЛЕРЫ · РЕЖИМ ' + surface + ']', projection, '', '[TOOL POLICY]', 'Память: ' + policy.memory, 'Вывод: ' + policy.output, '', '[КОНТРАКТ ПОВЕРХНОСТИ]', contract, '', '[ДОСТУПНЫЕ TOOLS]', toolNames].join('\n');
}
