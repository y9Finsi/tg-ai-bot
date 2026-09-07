import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

test('Figma Remote Control (Пульт) Redesign - Component & Asset Contracts', async (t) => {
    await t.test('1. Figma SVG and PNG assets exist in public assets', () => {
        const assets = [
            'admin-linear/public/assets/hero_bg_clean_250.png',
            'admin-linear/public/assets/lera_figma_avatar.png',
            'admin-linear/public/assets/icon_clock.svg',
            'admin-linear/public/assets/icon_weather.svg',
            'admin-linear/public/assets/icon_wallet.svg',
            'admin-linear/public/assets/icon_calendar.svg',
            'admin-linear/public/assets/icon_nav.svg',
            'admin-linear/public/assets/icon_dots9.svg'
        ];

        for (const assetPath of assets) {
            const fullPath = path.join(ROOT_DIR, assetPath);
            assert.ok(fs.existsSync(fullPath), `Asset file ${assetPath} must exist`);
            const stat = fs.statSync(fullPath);
            assert.ok(stat.size > 0, `Asset file ${assetPath} must not be empty`);
        }
    });

    await t.test('2. FigmaListItemRow component implements Frame 221 design tokens', () => {
        const code = fs.readFileSync(path.join(ROOT_DIR, 'admin-linear/src/components/FigmaListItemRow.jsx'), 'utf8');
        assert.ok(code.includes('h-[61px]'), 'Must have 61px height');
        assert.ok(code.includes('#1b1d22'), 'Must have #1b1d22 surface background');
        assert.ok(code.includes('rounded-[16px]'), 'Must have 16px corner radius');
        assert.ok(code.includes('icon_dots9.svg'), 'Must use Figma 9-dots icon');
        assert.ok(code.includes('#292e5e'), 'Must support blue button variant');
        assert.ok(code.includes('#28583b'), 'Must support green button variant');
        assert.ok(code.includes('#582828'), 'Must support red button variant');
    });

    await t.test('3. Header implements centered pill button group (Figma 13:1935 & 13:1936)', () => {
        const code = fs.readFileSync(path.join(ROOT_DIR, 'admin-linear/src/components/Header.jsx'), 'utf8');
        assert.ok(code.includes('#1b1d22'), 'Button group must use #1b1d22');
        assert.ok(code.includes('rounded-full'), 'Button group must be pill/rounded-full');
        assert.ok(code.includes('#292e5e'), 'Active button must use #292e5e');
        assert.ok(code.includes('#434771'), 'Active button must use #434771 border');
        assert.ok(code.includes('Пульт') && code.includes('Настройка ИИ') && code.includes('Карта СПб'), 'Must contain 3 tabs');
    });

    await t.test('4. LeraStatusHero implements Hero Banner (Figma 15:2765)', () => {
        const code = fs.readFileSync(path.join(ROOT_DIR, 'admin-linear/src/components/LeraStatusHero.jsx'), 'utf8');
        assert.ok(code.includes('h-[250px]'), 'Hero banner must have 250px height');
        assert.ok(code.includes('rounded-[19px]'), 'Hero banner must have 19px corner radius');
        assert.ok(code.includes('hero_bg_clean_250.png'), 'Must use clean 250px map background');
        assert.ok(code.includes('w-[99px] h-[100px]'), 'Avatar must have 99x100 dimensions');
        assert.ok(code.includes('icon_clock.svg'), 'Must include clock icon');
        assert.ok(code.includes('icon_weather.svg'), 'Must include weather icon');
        assert.ok(code.includes('icon_wallet.svg'), 'Must include wallet icon');
        assert.ok(code.includes('icon_calendar.svg'), 'Must include calendar icon');
        assert.ok(code.includes('icon_nav.svg'), 'Must include nav icon');
    });

    await t.test('5. NeedsPanel implements 6 indicators (Figma 13:2132)', () => {
        const code = fs.readFileSync(path.join(ROOT_DIR, 'admin-linear/src/components/NeedsPanel.jsx'), 'utf8');
        assert.ok(code.includes('Состояние'), 'Header must be "Состояние"');
        assert.ok(code.includes('h-[92px]'), 'Each indicator card must have 92px height');
        assert.ok(code.includes('rounded-[23px]'), 'Card must have 23px corner radius');
        assert.ok(code.includes('rounded-[20px]'), 'Value pill must have 20px corner radius');
        assert.ok(code.includes('Голод') && code.includes('Скука') && code.includes('Туалет'), 'Must have correct labels');
        assert.ok(code.includes('Усталость') && code.includes('Свежесть') && code.includes('Влечение'), 'Must have 6 labels');
        assert.ok(code.includes('/api/admin/radiant/mutate'), 'Must connect to real radiant mutate API');
    });

    await t.test('6. KanbanBoard implements 4 columns (Figma 13:2135)', () => {
        const code = fs.readFileSync(path.join(ROOT_DIR, 'admin-linear/src/components/KanbanBoard.jsx'), 'utf8');
        assert.ok(code.includes('Расписание на день'), 'Header must be "Расписание на день"');
        assert.ok(code.includes('h-[351px]'), 'Columns must have 351px height');
        assert.ok(code.includes('rounded-[23px]'), 'Columns must have 23px corner radius');
        assert.ok(code.includes('Предстоит') && code.includes('В процессе') && code.includes('Сделано') && code.includes('Отменено'), 'Must contain 4 columns');
    });

    await t.test('7. InventoryWidget implements 2 columns & Frame 221 items (Figma 14:2186)', () => {
        const code = fs.readFileSync(path.join(ROOT_DIR, 'admin-linear/src/components/InventoryWidget.jsx'), 'utf8');
        assert.ok(code.includes('Надето'), 'Left column must be "Надето"');
        assert.ok(code.includes('h-[287px]'), 'Inventory columns must have 287px height');
        assert.ok(code.includes('FigmaListItemRow'), 'Must use FigmaListItemRow');
        assert.ok(code.includes('/api/admin/inventory/unequip') || code.includes('/api/admin/radiant/mutate'), 'Must connect to real inventory unequip');
        assert.ok(code.includes('/api/admin/inventory/equip'), 'Must connect to real inventory equip');
        assert.ok(code.includes('/api/admin/inventory/consume') || code.includes('/api/admin/inventory/use'), 'Must connect to real inventory consume');
    });
});
