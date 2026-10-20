// Seeded browser trace parity (smoke-level).
//
// Boots the served game twice with a deterministic Math.random stream, freezes
// rAF so no frames run behind the harness, then runs 180 x __gummy.sim(1) and
// compares __gummy.behavior() traces for the legacy and modules engines.
//
// Usage:
//   node scripts/behavior-browser-parity.mjs
//   GAME_URL=http://localhost:8000/ SEED=7 STEPS=180 node scripts/behavior-browser-parity.mjs

import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const BASE = process.env.GAME_URL || 'http://localhost:8000/';
const SEED = Number(process.env.SEED || 1234) >>> 0;
const STEPS = Math.max(1, Number(process.env.STEPS || 180));
const GLASS_HEAVY = process.env.GLASS_HEAVY === '1';
const DIRECTIVE_HEAVY = process.env.DIRECTIVE_HEAVY === '1';

function initScript(seed) {
  return `(() => {
    let state = (${seed} >>> 0) || 1;
    Math.random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    // The harness drives the simulation synchronously; no background frames.
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  })();`;
}

function traceExpression(steps, seed, glassHeavy, directiveHeavy) {
  return `(() => {
    const g = window.__gummy;
    g.pause(false);
    g.seed(${seed});
    if (${glassHeavy} && typeof g.spawnGlass === 'function') {
      for (let i = 0; i < 4; i++) g.spawnGlass({ stage: 'adult' });
    }
    const directives = [];
    if (${directiveHeavy}) {
      g.directive(0, 'go', { x: 2, z: 2 });
      g.directive(0, 'eat');
      g.directive(0, 'drink');
      g.directive(0, 'home');
      g.directive(0, 'social');
      g.sim(2);
      directives.push(g.directives(0));
      g.setHealth(0, 10);
      g.directive(0, 'eat');
      g.sim(1);
      directives.push(g.directives(0));
      g.setHealth(0, 100);
      g.possess(0);
      g.sim(1);
      g.exitPossession();
      directives.push(g.directives(0));
    }
    const trace = [];
    for (let step = 0; step < ${steps}; step++) {
      g.sim(1);
      const snapshot = g.behavior();
      trace.push((snapshot ? snapshot.actors : []).map(a => [
        a.uid,
        a.species,
        a.state,
        +(+a.hunger).toFixed(4),
        +(+a.thirst).toFixed(4),
        +(+a.energy).toFixed(4),
        +(+a.social).toFixed(4),
        +(+a.affection).toFixed(4),
        +(+a.health).toFixed(3),
        a.source || null,
        a.partner || null,
      ]));
    }
    g.pause(true);
    return { engine: g.behaviorEngine ? g.behaviorEngine() : null, trace, directives };
  })()`;
}

function firstTraceDiff(left, right) {
  if (left.length !== right.length) {
    return { path: 'steps', left: left.length, right: right.length };
  }
  for (let step = 0; step < left.length; step++) {
    const a = left[step];
    const b = right[step];
    if (a.length !== b.length) return { path: `step ${step} actors`, left: a.length, right: b.length };
    for (let index = 0; index < a.length; index++) {
      const leftActor = a[index];
      const rightActor = b[index];
      const length = Math.max(leftActor.length, rightActor.length);
      for (let field = 0; field < length; field++) {
        if (leftActor[field] !== rightActor[field]) {
          return {
            path: `step ${step} actor ${leftActor[0]} field ${field}`,
            left: leftActor[field], right: rightActor[field],
          };
        }
      }
    }
  }
  return null;
}

function transitions(trace) {
  let count = 0;
  const previous = new Map();
  for (const step of trace) {
    for (const actor of step) {
      const key = actor[0];
      const state = actor[2];
      if (previous.has(key) && previous.get(key) !== state) count++;
      previous.set(key, state);
    }
  }
  return count;
}

async function runEngine(browser, engine) {
  const url = new URL(BASE);
  url.searchParams.set('autostart', '1');
  url.searchParams.set('behaviors', engine);
  const page = await browser.openPage({ url: url.toString(), initScript: initScript(SEED) });
  try {
    await page.waitFor('window.__gummy && window.__gummy.booted === true', 60000);
    const result = await page.evaluate(traceExpression(STEPS, SEED, GLASS_HEAVY, DIRECTIVE_HEAVY), 180000);
    if (!result || !Array.isArray(result.trace)) throw new Error(`no trace from ${engine}`);
    return result;
  } finally {
    try { await browser.send('Target.closeTarget', { targetId: page.targetId }); } catch (error) {}
  }
}

async function main() {
  const launched = await launchBrowser({});
  const browser = await connectBrowser(launched);
  try {
    const legacy = await runEngine(browser, 'legacy');
    const modules = await runEngine(browser, 'modules');
    const diff = firstTraceDiff(legacy.trace, modules.trace);
    const directiveDiff = JSON.stringify(legacy.directives) === JSON.stringify(modules.directives)
      ? null : { legacy: legacy.directives, modules: modules.directives };
    const actors = legacy.trace[0] ? legacy.trace[0].length : 0;
    console.log(`browser parity: ${STEPS} steps, ${actors} actors, seed ${SEED}`);
    console.log(`  legacy transitions ${transitions(legacy.trace)}, modules transitions ${transitions(modules.trace)}`);
    if (DIRECTIVE_HEAVY) console.log(`  directive-heavy: ${legacy.directives.length} checkpoints compared`);
    console.log(`  engine flags: legacy=${legacy.engine}, modules=${modules.engine}`);
    if (browser.pageErrors.length) {
      console.log(`  page errors: ${browser.pageErrors.slice(0, 5).join(' | ')}`);
    }
    if (directiveDiff) {
      console.error(`  DIRECTIVE DIFF: ${JSON.stringify(directiveDiff).slice(0, 1200)}`);
      return 1;
    }
    if (diff) {
      console.error(`  DIFF ${diff.path}: ${JSON.stringify(diff.left)} != ${JSON.stringify(diff.right)}`);
      return 1;
    }
    console.log('  BROWSER TRACE PARITY PASS');
    return browser.pageErrors.length ? 1 : 0;
  } finally {
    await browser.close();
  }
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
