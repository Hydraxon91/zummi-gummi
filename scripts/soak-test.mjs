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
    g.seed(421337);
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
    const movementIntent = (b) => {
      const ai = b.ai;
      if (!ai) return false;
      if (ai.state === 'follow') {
        if (!ai.follow || ai.follow.inside || ai.follow.sleeping) return false;
        const tx = ai.follow.cx, tz = ai.follow.cz;
        return Math.hypot(tx - b.cx, tz - b.cz) > 2.35;
      }
      if (['seekFood', 'seekHive', 'seekWater', 'seekHome', 'seekConflict',
        'seekMate', 'seekCompany'].includes(ai.state)) return true;
      if (ai.state === 'familyTask' && ai.familyTask && ai.familyTask.phase === 'travel') {
        const anchor = ai.familyTask.anchor;
        return !anchor || Math.hypot(anchor.x - b.cx, anchor.z - b.cz) > 1.5;
      }
      if (ai.state === 'visit' && ai.visitPhase !== 'hangout') {
        return !ai.target || Math.hypot(ai.target.x - b.cx, ai.target.z - b.cz) > 1.7;
      }
      return false;
    };
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
        const intends = movementIntent(b);
        const exempt = b.inside || b.sleeping || b.inPond || b.grabs > 0 || b.ai?.interrupted;
        if (intends && !exempt && moved < .03 && (b.ai?.noProgressT || 0) >= 6.2) {
          const n = (still.get(b.uid) || 0) + 1;
          still.set(b.uid, n);
          if (n >= 1) stuck.push({
            uid: b.uid, name: b.name, state: b.ai?.state,
            moving: !!b.ai?.moving, path: b.ai?.path?.length || 0,
            pathIndex: b.ai?.pathIndex || 0,
            task: b.ai?.familyTask?.id || null,
            contacts: b.contacts, airborne: !!b.airborne, interrupted: !!b.ai?.interrupted,
            rMat4: +(b.rMat?.[4] || 0).toFixed(2),
            noProgressT: +(b.ai?.noProgressT || 0).toFixed(2), x, z,
          });
        } else {
          still.set(b.uid, 0);
        }
      }
      if (stuck.length) break;
    }
    const stats = g.stats();
    const beforeMap = g.map().id;
    const beforeGlass = g.glass().count;
    const doorLoop = [
      ...(g.ai()?.bears || []).map(b => ({
        uid: b.uid, species: 'bear', entries: b.doorEntries, exits: b.doorExits,
      })),
      ...g.glass().actors.map(a => ({
        uid: a.uid, species: 'glass', entries: a.doorEntries, exits: a.doorExits,
      })),
    ].filter(a => a.entries + a.exits > 2);
    const recoveryLoop = g.bears
      .filter(b => (b.ai?.recoveries || 0) > 2)
      .map(b => ({
        uid: b.uid, name: b.name, state: b.ai?.state, recoveries: b.ai.recoveries,
        lastStuck: b.ai.lastStuck || null,
      }));
    return {
      startBears,
      endBears: g.bears.length,
      glass: g.glass().count,
      seconds: ${SECONDS},
      stats: { nan: stats.nan, minY: stats.minY, maxXZ: stats.maxXZ },
      stuck: stuck.slice(0, 8),
      doorLoop,
      recoveryLoop,
      map: { beforeMap, beforeGlass },
      errors: 0,
    };
  })()`, 300000);
  if (report.map.beforeMap !== 'field') {
    throw new Error(`soak did not start in the Meadow: ${JSON.stringify(report.map)}`);
  }
  await page.evaluate("window.__gummy.setMap('studio')");
  await page.waitFor("window.__gummy.map().id === 'studio'", 30000);
  await page.waitFor("!document.getElementById('mapWipe').classList.contains('on')", 30000);
  report.map.studioMap = await page.evaluate('window.__gummy.map().id');
  await page.evaluate("window.__gummy.setMap('field')");
  await page.waitFor("window.__gummy.map().id === 'field'", 30000);
  await page.waitFor("!document.getElementById('mapWipe').classList.contains('on')", 30000);
  report.map.afterMap = await page.evaluate('window.__gummy.map().id');
  report.map.afterGlass = await page.evaluate('window.__gummy.glass().count');
  report.pageErrors = browser.pageErrors;
  const failures = [];
  if (report.stats.nan) failures.push('non-finite physics state');
  if (report.stuck.length) failures.push(`stuck movers: ${JSON.stringify(report.stuck)}`);
  if (report.doorLoop.length) failures.push(`door loop: ${JSON.stringify(report.doorLoop)}`);
  if (report.recoveryLoop.length) failures.push(`repeated stall recovery: ${JSON.stringify(report.recoveryLoop)}`);
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
