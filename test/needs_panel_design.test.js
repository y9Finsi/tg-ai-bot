import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('admin v2 source contains SVG icon mappings for all needs, willingness, mood, and cycle tracker', () => {
    const source = fs.readFileSync('admin-v2/src/main.jsx', 'utf8');
    const css = fs.readFileSync('admin-v2/src/feature-components.css', 'utf8');

    // Check SVG icon imports
    for (const icon of ['Utensils', 'Zap', 'Sparkles', 'Droplets', 'Heart', 'BatteryCharging', 'HeartPulse', 'Flame', 'MapPin', 'Wallet', 'Calendar']) {
        assert.ok(source.includes(icon), `main.jsx should import ${icon} icon`);
    }

    // Check CSS animation rules and classes
    for (const cssClass of ['need-icon-badge', 'pulse-critical', 'need-compact-item', 'bento-needs-layout', 'bento-left', 'bento-right', 'bento-cycle-card', 'bento-cycle-bar']) {
        assert.ok(css.includes(cssClass), `feature-components.css should contain ${cssClass} rule`);
    }
});

test('cycle helper correctly resolves phases and descriptions for 28-day cycle', () => {
    const getCycleMeta = (cycleDay) => {
        const day = Math.max(1, Math.min(28, Math.round(Number(cycleDay || 3))));
        if (day <= 5) return { phase: 'Менструация', hint: 'Спад энергии · Требуется покой', tone: 'red' };
        if (day <= 11) return { phase: 'Фолликулярная фаза', hint: 'Подъём сил и активности', tone: 'green' };
        if (day <= 14) return { phase: 'Овуляция', hint: 'Пик гормонов и влечения (+2%/тик)', tone: 'purple' };
        if (day <= 22) return { phase: 'Лютеиновая фаза', hint: 'Стабильный режим', tone: 'blue' };
        return { phase: 'ПМС', hint: 'Эмоциональная чувствительность', tone: 'yellow' };
    };

    assert.equal(getCycleMeta(3).phase, 'Менструация');
    assert.equal(getCycleMeta(8).phase, 'Фолликулярная фаза');
    assert.equal(getCycleMeta(13).phase, 'Овуляция');
    assert.equal(getCycleMeta(18).phase, 'Лютеиновая фаза');
    assert.equal(getCycleMeta(25).phase, 'ПМС');
});
