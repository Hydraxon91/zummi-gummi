// Longer-running Meadow soak check. This is a local/deep harness, not part of
// the short CI smoke job. It exercises a larger household population through
// wandering, family tasks, stage growth and a map round trip, and reports actors
// that keep `moving` set without actually changing position.
//
//   python3 launch.py --no-open
//   node scripts/soak-test.mjs
//
// SOAK_SECONDS defaults to 60; GAME_URL/BROWSER_BIN follow the shared harness.
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const GAME = process.env.GAME_URL || 'http://localhost:8000/';
const SECONDS = Math.max(10, Number(process.env.SOAK_SECONDS) || 60);
const TARGET = Math.max(10, Number(process.env.SOAK_POP) || 14);
const browser = await connectBrowser(await launchBrowser({}));
try {
  const page = await browser.openPage({ url: `${GAME}?autostart=1`, width: 1440, height: 900 });
  await page.waitFor('window.__gummy?.booted', 150000);
  const report = await page.evaluate(`(async () => {
    const g = window.__gummy;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.setTime(12);
    g.setCeiling(24);
    g.sim(2, 0);
    const startBears = g.bears.length;
    for (let pass = 0; pass < 30 && g.bears.length < ${TARGET}; pass++) {
      const adults = g.bears
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b.active && b.stage === 'adult' && b.sex === 'F');
      if (!adults.length) break;
      for (const { i } of adults) g.forceBirth(i);
      g.sim(1, 0);
    }
    const actors = g.bears.map(b => b.uid);
    const last = new Map(actors.map(uid => [uid, null]));
    const still = new Map(actors.map(uid => [uid, 0]));
    const stuck = [];
    for (let second = 0; second < ${SECONDS}; second++) {
      g.sim(1, 0);
      if (second % 3 !== 2) continue;
      for (const b of g.bears) {
        if (!b.active) continue;
        const previous = last.get(b.uid);
        const x = b.cx, z = b.cz;
        last.set(b.uid, [x, z]);
        if (!previous) continue;
        const moved = Math.hypot(x - previous[0], z - previous[1]);
        const activeTask = b.ai && (b.ai.moving || b.ai.familyTask);
        const exempt = b.inside || b.sleeping || b.inPond || b.grabs > 0 ||
          ['eat', 'drink', 'social', 'invite', 'decline', 'mate', 'conflict', 'familyTask'].includes(b.ai?.state);
        if (activeTask && !exempt && moved < .03) {
          const n = (still.get(b.uid) || 0) + 1;
          still.set(b.uid, n);
          if (n >= 2) stuck.push({ uid: b.uid, name: b.name, state: b.ai?.state, task: b.ai?.familyTask?.id || null, x, z });
        } else {
          still.set(b.uid, 0);
        }
      }
      if (stuck.length) break;
    }
    const stats = g.stats();
    const beforeMap = g.map().id;
    const beforeGlass = g.glass().count;
    g.setMap('studio');
    await sleep(1200);
    const studioMap = g.map().id;
    g.setMap('field');
    await sleep(1200);
    return {
      startBears,
      endBears: g.bears.length,
      glass: g.glass().count,
      seconds: ${SECONDS},
      stats: { nan: stats.nan, minY: stats.minY, maxXZ: stats.maxXZ },
      stuck: stuck.slice(0, 8),
      map: { beforeMap, studioMap, afterMap: g.map().id, beforeGlass, afterGlass: g.glass().count },
      errors: 0,
    };
  })()`, 300000);
  report.pageErrors = browser.pageErrors;
  const failures = [];
  if (report.stats.nan) failures.push('non-finite physics state');
  if (report.stuck.length) failures.push(`stuck movers: ${JSON.stringify(report.stuck)}`);
  if (report.map.beforeMap !== 'field' || report.map.studioMap !== 'studio' || report.map.afterMap !== 'field') {
    failures.push(`map round trip failed: ${JSON.stringify(report.map)}`);
  }
  if (report.map.afterGlass !== report.map.beforeGlass) {
    failures.push(`Glass count changed across map round trip: ${JSON.stringify(report.map)}`);
  }
  if (report.pageErrors.length) failures.push(`page errors: ${report.pageErrors.slice(0, 3).join(' | ')}`);
  console.log('SOAK', JSON.stringify(report));
  if (failures.length) throw new Error(failures.join('; '));
} finally {
  await browser.close();
}
