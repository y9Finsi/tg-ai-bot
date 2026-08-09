import { runManualTick, loadDailyLog } from '../src/engine/game_loop.js';
import { loadLeraState } from '../src/engine/needs_calculator.js';

async function testTaskDrivenEngine() {
    console.log("🧪 [TEST] Тестирование Task-Driven Dynamic Tick Engine...\n");

    const result = await runManualTick(false);
    console.log("\n✅ [RESULT] Элемент тика сгенерирован:");
    console.log("📌 Anchor Title:", result.entry.anchor_title);
    console.log("📍 Location:", result.entry.location);
    console.log("🎯 Current Activity Header:", result.entry.current_activity_header);
    console.log("⏳ Active Task:", result.entry.active_task);
    console.log("💭 Thought:", result.entry.thought);
    console.log("🎬 Action:", result.entry.action);
    console.log("📌 Consequence:", result.entry.consequence);

    const state = loadLeraState();
    console.log("\n📊 [STATE ACTIVE TASK]:", state.active_task);

    const logs = loadDailyLog();
    console.log(`\n📖 [DAILY LOG RECORDS COUNT]: ${logs.length}`);
}

testTaskDrivenEngine().catch(console.error);
