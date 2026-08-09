import { startTick, finishTick, loadDailyLog } from '../src/engine/game_loop.js';
import { loadLeraState } from '../src/engine/needs_calculator.js';

async function testTwoPhaseLifecycle() {
    console.log("🧪 [TEST] Тестирование Two-Phase Dynamic Tick Lifecycle...\n");

    // 1. Старт Фазы 1
    console.log("--- СТАРТ ФАЗЫ 1 ---");
    const phase1Result = await startTick(false);
    console.log("📌 Phase 1 Status:", phase1Result.entry.status);
    console.log("📌 Phase 1 Consequence:", phase1Result.entry.consequence);
    console.log("⏳ Active Task:", phase1Result.entry.active_task.title);

    // 2. Старт Фазы 2 (Финиш тика)
    console.log("\n--- СТАРТ ФАЗЫ 2 (По истечению таймера 00:00) ---");
    const phase2Result = await finishTick();
    console.log("📌 Next Tick Started Status:", phase2Result.entry.status);
    
    const logs = loadDailyLog();
    console.log(`\n📖 Всего записей в дневнике: ${logs.length}`);
    const lastCompleted = logs.filter(l => l.status === 'COMPLETED').pop();
    if (lastCompleted) {
        console.log("✅ Последний завершенный итог:", lastCompleted.consequence);
    }
}

testTwoPhaseLifecycle().catch(console.error);
