// Controlled scheduler/RNG characterization plus live scheduler/clock checks.
//
// P5b controlled mode suppresses requestAnimationFrame, seeds and wraps
// Math.random, then drives one __gummy.sim(1/15, 0) call per observed frame.
// P5c live mode uses normal rAF and checks pause, freeze, inactive-map and
// map-return behavior with monotonic/equality assertions. Neither mode claims
// frame-rate-independent or cross-engine determinism.
//
// Usage:
//   node scripts/scheduler-rng-characterization.mjs
//   GAME_URL=http://localhost:8000/ SEED=1234 FRAMES=120 node scripts/scheduler-rng-characterization.mjs
//   LIVE_SETTLE_MS=250 LIVE_WAIT_MS=900 node scripts/scheduler-rng-characterization.mjs
//
// The wrapper records draw owners by source stack. Stack labels are diagnostic,
// not a runtime API. The script fails rather than inferring order from separate
// frames when no frame contains both Bear-host and Glass-host draws.

import assert from 'node:assert/strict';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

function integerEnv(name, fallback, minimum) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;
}

const BASE = process.env.GAME_URL || 'http://localhost:8000/';
const SEED = process.env.SEED === undefined ? 1234 : (Number(process.env.SEED) >>> 0);
const FRAMES = integerEnv('FRAMES', 120, 1);
const GLASS_SPAWNS = integerEnv('GLASS_SPAWNS', 4, 0);
const CONTROL_FRAMES = integerEnv('CONTROL_FRAMES', 30, 1);
const LIVE_SETTLE_MS = integerEnv('LIVE_SETTLE_MS', 250, 0);
const LIVE_WAIT_MS = integerEnv('LIVE_WAIT_MS', 900, 100);
const LIVE_TIMEOUT_MS = integerEnv('LIVE_TIMEOUT_MS', 10000, 1000);
const FRAME_SECONDS = String(1 / 15);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const showHours = value => Number(value).toFixed(4);
const hoursAdvance = (after, before) => ((after - before) % 24 + 24) % 24 > 1e-6;

function initScript(seed) {
  return `(() => {
    let state = (${seed} >>> 0) || 1;
    let frame = -1;
    let capture = false;
    const draws = [];

    Math.random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const value = state / 4294967296;
      if (!capture) return value;
      let label = 'other';
      try {
        const error = new Error();
        if (Error.captureStackTrace) Error.captureStackTrace(error, Math.random);
        const stack = error.stack || '';
        if (stack.includes('/src/glass.js')) label = 'glass';
        else if (stack.includes('/src/ai.js')) label = 'bear';
        else if (stack.includes('/src/field.js')) label = 'field';
        else if (stack.includes('stepGummyBehavior') || stack.includes('/src/app.js')) label = 'app';
        else if (stack.includes('/src/behaviors/')) label = 'behavior';
      } catch (error) {}
      draws.push([frame, label]);
      return value;
    };

    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
    window.__schedulerRng = {
      reset(value) {
        state = (Number(value) >>> 0) || 1;
        frame = -1;
        draws.length = 0;
        capture = true;
      },
      begin() {
        frame += 1;
      },
      stop() {
        capture = false;
      },
      snapshot() {
        return { draws: draws.slice(), frames: frame + 1 };
      },
    };
  })();`;
}

function controlledExpression() {
  return `(() => {
    const g = window.__gummy;
    g.pause(false);
    g.freeze(false);
    g.setAI(true);
    if (${GLASS_SPAWNS} > 0) {
      for (let i = 0; i < ${GLASS_SPAWNS}; i++) g.spawnGlass({ stage: 'adult' });
    }

    const skyBefore = g.map().sky;
    const hoursBefore = skyBefore.hours;
    const autoBefore = skyBefore.auto;
    const ticksBefore = g.behavior().ticks;
    g.sim(1, 0);
    const hoursAfter = g.map().sky.hours;
    const ticksAfter = g.behavior().ticks;

    window.__schedulerRng.reset(${SEED});
    for (let i = 0; i < ${FRAMES}; i++) {
      window.__schedulerRng.begin();
      g.sim(${FRAME_SECONDS}, 0);
    }
    window.__schedulerRng.stop();
    const trace = window.__schedulerRng.snapshot();

    const frames = Array.from({ length: ${FRAMES} }, () => []);
    for (const [frame, label] of trace.draws) {
      if (frame >= 0 && frame < ${FRAMES}) frames[frame].push(label);
    }
    const totals = {};
    for (const labels of frames) {
      for (const label of labels) totals[label] = (totals[label] || 0) + 1;
    }

    // Positive control: the same capture path and a comparable frame window
    // must still see Bear/Glass draws before freeze is applied.
    const controlTicksBefore = g.behavior().ticks;
    window.__schedulerRng.reset(${SEED});
    for (let i = 0; i < ${CONTROL_FRAMES}; i++) {
      window.__schedulerRng.begin();
      g.sim(${FRAME_SECONDS}, 0);
    }
    window.__schedulerRng.stop();
    const control = window.__schedulerRng.snapshot();
    const controlDraws = control.draws.filter(([frame]) => frame >= 0);
    const controlTicksAfter = g.behavior().ticks;

    const frozenTicksBefore = g.behavior().ticks;
    g.freeze(true);
    window.__schedulerRng.reset(${SEED});
    for (let i = 0; i < ${CONTROL_FRAMES}; i++) {
      window.__schedulerRng.begin();
      g.sim(${FRAME_SECONDS}, 0);
    }
    window.__schedulerRng.stop();
    const frozen = window.__schedulerRng.snapshot();
    const frozenDraws = frozen.draws.filter(([frame]) => frame >= 0);
    const frozenTicksAfter = g.behavior().ticks;
    g.freeze(false);

    return {
      engine: g.behaviorEngine ? g.behaviorEngine() : null,
      simClock: { auto: autoBefore, hoursBefore, hoursAfter, ticksBefore, ticksAfter },
      frames,
      totals,
      drawCount: trace.draws.length,
      frozen: {
        controlLabels: controlDraws.map(([, label]) => label),
        controlTicksBefore,
        controlTicksAfter,
        labels: frozenDraws.map(([, label]) => label),
        ticksBefore: frozenTicksBefore,
        ticksAfter: frozenTicksAfter,
      },
    };
  })()`;
}

async function runControlled(browser) {
  const url = new URL(BASE);
  url.searchParams.set('autostart', '1');
  const page = await browser.openPage({
    url: url.toString(),
    initScript: initScript(SEED),
  });
  try {
    await page.waitFor('!!window.__gummy?.booted', 60000);
    return await page.evaluate(controlledExpression(), 180000);
  } finally {
    try { await browser.send('Target.closeTarget', { targetId: page.targetId }); } catch (error) {}
  }
}

function frameSummary(frames) {
  return frames
    .map((labels, index) => ({ index, labels }))
    .filter(item => item.labels.length > 0)
    .slice(0, 12);
}

function assertControlled(result, label) {
  assert.ok(result, `${label}: no result`);
  assert.ok(result.simClock, `${label}: missing sim clock data`);
  assert.equal(
    result.simClock.auto,
    true,
    `${label}: controlled clock check requires sky.auto; got ${result.simClock.auto}`,
  );
  assert.ok(
    result.simClock.hoursBefore === result.simClock.hoursAfter,
    `${label}: g.sim(1) advanced sky hours ${result.simClock.hoursBefore} -> ${result.simClock.hoursAfter}`,
  );
  assert.ok(
    result.simClock.ticksAfter > result.simClock.ticksBefore,
    `${label}: g.sim(1) did not advance behavior ticks`,
  );
  assert.ok(result.drawCount > 0, `${label}: no RNG draws captured`);
  assert.ok(result.frames.length === FRAMES, `${label}: frame count changed`);

  const overlaps = [];
  for (let index = 0; index < result.frames.length; index += 1) {
    const labels = result.frames[index];
    if (!labels.includes('bear') || !labels.includes('glass')) continue;
    overlaps.push(index);
    assert.ok(
      labels.indexOf('bear') < labels.indexOf('glass'),
      `${label}: Bear draw did not precede Glass draw on frame ${index}: ${JSON.stringify(labels)}`,
    );
  }
  assert.ok(
    overlaps.length > 0,
    `${label}: no frame contained both Bear-host and Glass-host draws; ` +
    `refusing to infer order across frames: ${JSON.stringify(frameSummary(result.frames))}`,
  );

  assert.ok(result.frozen, `${label}: missing frozen control data`);
  assert.ok(
    result.frozen.controlLabels.includes('bear') && result.frozen.controlLabels.includes('glass'),
    `${label}: non-frozen control window did not capture both Bear and Glass draws: ` +
    `${JSON.stringify(result.frozen.controlLabels)}`,
  );
  assert.ok(
    result.frozen.controlTicksAfter > result.frozen.controlTicksBefore,
    `${label}: non-frozen control window did not advance behavior ticks`,
  );
  assert.ok(
    result.frozen.ticksAfter === result.frozen.ticksBefore,
    `${label}: frozen g.sim advanced behavior ticks`,
  );
  assert.ok(
    !result.frozen.labels.includes('bear') && !result.frozen.labels.includes('glass'),
    `${label}: frozen run retained Bear/Glass draws: ${JSON.stringify(result.frozen.labels)}`,
  );
  return {
    overlaps,
    order: result.frames[overlaps[0]],
    totals: result.totals,
    frozenControlDraws: result.frozen.controlLabels.length,
    frozenDraws: result.frozen.labels.length,
  };
}

async function runFreshControlled() {
  const launched = await launchBrowser({});
  const browser = await connectBrowser(launched);
  try {
    return {
      result: await runControlled(browser),
      pageErrors: browser.pageErrors.slice(),
    };
  } finally {
    await browser.close();
  }
}

function liveSnapshotExpression() {
  return `(() => {
    const g = window.__gummy;
    if (!g) return null;
    const map = g.map();
    const behavior = g.behavior();
    return {
      map: map ? map.id : null,
      hours: map && map.sky ? map.sky.hours : null,
      auto: map && map.sky ? map.sky.auto : null,
      ticks: behavior ? behavior.ticks : null,
      enabled: behavior ? behavior.enabled : null,
      paused: g.paused(),
      visible: document.visibilityState,
    };
  })()`;
}

async function readLive(page) {
  const snapshot = await page.evaluate(liveSnapshotExpression());
  assert.ok(snapshot, 'live snapshot: window.__gummy missing');
  return snapshot;
}

function liveAdvanceExpression(baseline, requireTicks) {
  return `(() => {
    const g = window.__gummy;
    if (!g) return false;
    const map = g.map();
    const behavior = g.behavior();
    if (!map || !map.sky || !behavior) return false;
    const delta = ((map.sky.hours - ${Number(baseline.hours)}) % 24 + 24) % 24;
    return delta > 1e-6${requireTicks ? ` && behavior.ticks > ${Number(baseline.ticks)}` : ''};
  })()`;
}

async function waitForLiveAdvance(page, baseline, label, requireTicks = true) {
  try {
    await page.waitFor(liveAdvanceExpression(baseline, requireTicks), LIVE_TIMEOUT_MS);
  } catch (error) {
    const current = await readLive(page);
    assert.fail(
      `${label}: live clock${requireTicks ? '/AI' : ''} did not advance within ` +
      `${LIVE_TIMEOUT_MS}ms; baseline=${JSON.stringify(baseline)} current=${JSON.stringify(current)}`,
    );
  }
  return readLive(page);
}

function assertHeld(before, after, label) {
  assert.equal(after.ticks, before.ticks, `${label}: behavior ticks changed`);
  assert.equal(after.hours, before.hours, `${label}: sky hours changed`);
}

async function runLive(browser) {
  const url = new URL(BASE);
  url.searchParams.set('autostart', '1');
  const page = await browser.openPage({ url: url.toString() });
  try {
    await page.waitFor('!!window.__gummy?.booted', 60000);
    await page.evaluate(`(() => {
      const g = window.__gummy;
      g.pause(false);
      g.freeze(false);
      g.setAI(true);
      return true;
    })()`);

    const start = await readLive(page);
    assert.equal(start.map, 'field', 'live baseline: expected the Meadow map');
    assert.equal(start.auto, true, 'live baseline: expected sky.auto');
    assert.equal(start.visible, 'visible', 'live baseline: page is not visible');
    assert.equal(start.paused, false, 'live baseline: expected the game to be running');
    assert.ok(Number.isFinite(start.hours), 'live baseline: sky hours missing');
    assert.ok(Number.isFinite(start.ticks), 'live baseline: behavior ticks missing');

    const baseline = await waitForLiveAdvance(page, start, 'live baseline');

    await page.evaluate('window.__gummy.pause(true)');
    await sleep(LIVE_SETTLE_MS);
    const paused = await readLive(page);
    assert.equal(paused.paused, true, 'live pause: pause hook did not set paused');
    await sleep(LIVE_WAIT_MS);
    const pausedAfter = await readLive(page);
    assertHeld(paused, pausedAfter, 'live pause');
    await page.evaluate('window.__gummy.pause(false)');
    const resumed = await waitForLiveAdvance(page, pausedAfter, 'live resume after pause');

    await page.evaluate('window.__gummy.freeze(true)');
    await sleep(LIVE_SETTLE_MS);
    const frozen = await readLive(page);
    const frozenAfter = await waitForLiveAdvance(page, frozen, 'live freeze sky', false);
    assert.equal(frozenAfter.ticks, frozen.ticks, 'live freeze: behavior ticks advanced');
    assert.ok(
      hoursAdvance(frozenAfter.hours, frozen.hours),
      'live freeze: sky hours did not advance',
    );
    await page.evaluate('window.__gummy.freeze(false)');
    const unfrozen = await waitForLiveAdvance(page, frozenAfter, 'live unfreeze');

    await page.evaluate('window.__gummy.pause(true)');
    await sleep(LIVE_SETTLE_MS);
    const beforeSwitch = await readLive(page);
    assert.equal(beforeSwitch.map, 'field', 'live switch: expected the Meadow map');
    assert.equal(beforeSwitch.paused, true, 'live switch: expected paused state');
    assert.equal(beforeSwitch.auto, true, 'live switch: field clock was not auto');
    assert.equal(beforeSwitch.enabled, true, 'live switch: behavior engine was disabled');
    const fieldHoursAtSwitch = beforeSwitch.hours;

    await page.evaluate("window.__gummy.setMap('studio')");
    await page.waitFor("window.__gummy.map().id === 'studio'", LIVE_TIMEOUT_MS);
    await sleep(500);
    const studioPaused = await readLive(page);
    assert.equal(studioPaused.map, 'studio', 'live switch: Studio did not activate');
    assert.equal(studioPaused.paused, true, 'live switch: pause did not survive map change');
    assert.equal(studioPaused.auto, true, 'live switch: sky.auto changed during map change');
    assert.equal(studioPaused.enabled, true, 'live switch: behavior engine disabled on inactive map');
    assert.equal(studioPaused.ticks, beforeSwitch.ticks,
      'live switch: paused map change advanced behavior ticks');
    assert.equal(studioPaused.hours, beforeSwitch.hours,
      'live switch: paused map change advanced sky hours');

    await page.evaluate('window.__gummy.pause(false)');
    await sleep(LIVE_WAIT_MS);
    const studioLive = await readLive(page);
    assert.equal(studioLive.map, 'studio', 'live Studio: map changed while running');
    assert.equal(studioLive.auto, true, 'live Studio: sky.auto changed while running');
    assert.equal(studioLive.enabled, true, 'live Studio: behavior engine disabled while running');
    assert.equal(studioLive.ticks, studioPaused.ticks,
      'live Studio: inactive map advanced behavior ticks');
    assert.equal(studioLive.hours, studioPaused.hours,
      'live Studio: inactive map advanced sky hours');

    await page.evaluate('window.__gummy.pause(true)');
    await sleep(LIVE_SETTLE_MS);
    const beforeReturn = await readLive(page);
    assert.equal(beforeReturn.map, 'studio', 'live return: expected Studio before return');

    await page.evaluate("window.__gummy.setMap('field')");
    await page.waitFor("window.__gummy.map().id === 'field'", LIVE_TIMEOUT_MS);
    await sleep(500);
    const returned = await readLive(page);
    assert.equal(returned.map, 'field', 'live return: Meadow did not activate');
    assert.equal(returned.paused, true, 'live return: pause did not survive map return');
    assert.equal(returned.auto, true, 'live return: sky.auto was not restored');
    const restoredDelta = Math.abs(returned.hours - fieldHoursAtSwitch);
    assert.ok(
      restoredDelta <= 1e-3,
      `live return: restored sky hours ${returned.hours} differ from ` +
      `${fieldHoursAtSwitch} by ${restoredDelta}`,
    );

    await sleep(LIVE_WAIT_MS);
    const returnedHeld = await readLive(page);
    assertHeld(returned, returnedHeld, 'live returned field pause');
    await page.evaluate('window.__gummy.pause(false)');
    const returnedLive = await waitForLiveAdvance(page, returnedHeld, 'live after field return');

    return {
      start,
      baseline,
      paused: { before: paused, after: pausedAfter, resumed },
      frozen: { before: frozen, after: frozenAfter, unfrozen },
      studio: { before: beforeSwitch, paused: studioPaused, live: studioLive },
      returned: { before: beforeReturn, paused: returned, held: returnedHeld, resumed: returnedLive },
      fieldHoursAtSwitch,
    };
  } finally {
    try {
      await page.evaluate(`(() => {
        const g = window.__gummy;
        if (g) { g.freeze(false); g.pause(false); }
        return true;
      })()`, 5000);
    } catch (error) {}
    try { await browser.send('Target.closeTarget', { targetId: page.targetId }); } catch (error) {}
  }
}

async function runFreshLive() {
  const launched = await launchBrowser({});
  const browser = await connectBrowser(launched);
  try {
    return {
      result: await runLive(browser),
      pageErrors: browser.pageErrors.slice(),
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const first = await runFreshControlled();
  const firstSummary = assertControlled(first.result, 'first controlled run');

  const second = await runFreshControlled();
  assertControlled(second.result, 'second controlled run');

  assert.deepEqual(
    second.result.frames,
    first.result.frames,
    'seeded per-frame RNG owner traces differ between fresh profiles',
  );
  assert.deepEqual(
    second.result.totals,
    first.result.totals,
    'seeded RNG draw totals differ between fresh profiles',
  );

  console.log(
    `scheduler/rng controlled: seed=${SEED} frames=${FRAMES} ` +
    `glassSpawns=${GLASS_SPAWNS} engine=${first.result.engine || 'unknown'}`,
  );
  console.log(`  sim clock: auto=${first.result.simClock.auto} ` +
    `${first.result.simClock.hoursBefore} -> ${first.result.simClock.hoursAfter}; ` +
    `behavior ticks ${first.result.simClock.ticksBefore} -> ${first.result.simClock.ticksAfter}`);
  console.log(`  overlaps: ${firstSummary.overlaps.length} frames; ` +
    `first=${firstSummary.overlaps[0]}; every overlap has bear<glass`);
  console.log(`  totals: ${JSON.stringify(firstSummary.totals)}`);
  console.log(`  repeat: identical per-frame owner traces and totals on fresh profiles`);
  console.log(`  frozen: control ${firstSummary.frozenControlDraws} draws; ` +
    `frozen ${firstSummary.frozenDraws} draws; no bear/glass labels`);
  const pageErrors = [...first.pageErrors, ...second.pageErrors];
  if (pageErrors.length) {
    console.error(`  page errors: ${pageErrors.slice(0, 5).join(' | ')}`);
    return 1;
  }
  console.log('SCHEDULER_RNG_CONTROLLED_OK');

  const live = await runFreshLive();
  if (live.pageErrors.length) {
    console.error(`  live page errors: ${live.pageErrors.slice(0, 5).join(' | ')}`);
    return 1;
  }
  const liveResult = live.result;
  console.log(
    `scheduler/rng live: settle=${LIVE_SETTLE_MS}ms wait=${LIVE_WAIT_MS}ms ` +
    `timeout=${LIVE_TIMEOUT_MS}ms`,
  );
  console.log(
    `  baseline: ticks ${liveResult.start.ticks} -> ${liveResult.baseline.ticks}; ` +
    `hours ${showHours(liveResult.start.hours)} -> ${showHours(liveResult.baseline.hours)}`,
  );
  console.log(
    `  pause: held ticks=${liveResult.paused.after.ticks} ` +
    `hours=${showHours(liveResult.paused.after.hours)}; resumed to ticks=${liveResult.paused.resumed.ticks}`,
  );
  console.log(
    `  freeze: ticks held=${liveResult.frozen.after.ticks}; hours ` +
    `${showHours(liveResult.frozen.before.hours)} -> ${showHours(liveResult.frozen.after.hours)}`,
  );
  console.log(
    `  studio: ticks held=${liveResult.studio.live.ticks} ` +
    `hours held=${showHours(liveResult.studio.live.hours)}`,
  );
  console.log(
    `  return: hours ${showHours(liveResult.fieldHoursAtSwitch)} -> ` +
    `${showHours(liveResult.returned.paused.hours)} ` +
    `(auto=${liveResult.returned.paused.auto}); resumed ticks ` +
    `${liveResult.returned.held.ticks} -> ${liveResult.returned.resumed.ticks}`,
  );
  console.log('SCHEDULER_RNG_LIVE_OK');
  console.log('SCHEDULER_RNG_OK');
  return 0;
}

main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
