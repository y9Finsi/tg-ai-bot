export const PROMPT_SECTIONS = {
    lera_base: 'lera_base.txt',
    lera_speech: 'lera_speech.txt',
    lera_intimacy: 'lera_intimacy.txt',
    lera_examples: 'lera_examples.txt',
    lera_virt_examples: 'lera_virt_examples.txt',
    lera_rules: 'lera_rules.txt',
    context_template: 'lera_context.txt'
};

export const ROUTING_PROMPT_SECTIONS = {
    routing_core: 'lera_core.txt',
    routing_common: 'lera_common.txt',
    routing_casual: 'lera_casual.txt',
    routing_erotic: 'lera_erotic.txt'
};

export const ALL_PROMPT_SECTIONS = {
    ...PROMPT_SECTIONS,
    ...ROUTING_PROMPT_SECTIONS
};
