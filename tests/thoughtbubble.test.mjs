import test from 'node:test';
import assert from 'node:assert/strict';
import { planReason } from '../src/behaviors/reason.js';
import { thoughtBubbleRows, layoutThoughtRows, createThoughtBubbleOverlay } from '../src/thoughtbubble.js';
import { FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld, createRoster } from '../scripts/behavior-parity.mjs';

function actor(extra = {}) {
  return {
    uid: 1, active: true, name: 'Mochi', cx: 0, cy: 0, cz: 0, ai: { state: 'wander' },
    hunger: .2, thirst: .2, social: .2, affection: .2,
    ...extra,
    ai: { state: 'wander', ...(extra.ai || {}) },
  };
}

test('thought bubbles are off by default', () => {
  assert.equal(FEATURE_DEFAULTS.thoughtBubbles, false);
});

test('planReason explains states without RNG or mutation', () => {
  const cases = [
    [{ ai: { state: 'sleep' } }, 'sleeping'],
    [{ ai: { state: 'seekFood' } }, 'looking for food'],
    [{ ai: { state: 'seekFood', source: { kind: 'flower' } } }, 'going to flower'],
    [{ ai: { state: 'eat' } }, 'eating'],
    [{ ai: { state: 'follow', follow: { name: 'Pip' } } }, 'following Pip'],
    [{ ai: { state: 'familyTask', familyTask: { id: 'familyMeal', phase: 'act' } } }, 'sharing a family meal'],
    [{ ai: { state: 'stargaze' } }, 'stargazing'],
    [{ ai: { state: 'wander' }, hunger: .8 }, 'getting hungry'],
    [{ ai: { state: 'flee' } }, 'fleeing a threat'],
  ];
  for (const [extra, expected] of cases) {
    const a = actor(extra);
    const before = JSON.stringify(a);
    assert.equal(planReason(a), expected);
    assert.equal(JSON.stringify(a), before, 'reason must not mutate the actor');
  }
});

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function featureRun(thoughtBubbles) {
  const world = createWorld();
  const roster = createRoster('bear');
  const rng = seeded(17);
  let draws = 0;
  const config = createBehaviorConfig({ features: { thoughtBubbles } });
  const engine = createBehavior({
    engine: 'modules', config, field: world, getActors: () => roster,
    getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40,
    rng: () => { draws++; return rng(); },
  });
  for (const actor of roster) engine.attach(actor);
  for (let tick = 0; tick < 200; tick++) {
    for (const actor of roster) engine.tick(actor, 1 / 20);
  }
  return {
    draws,
    state: JSON.stringify(roster.map(actor => [
      actor.uid, actor.ai?.state, actor.hunger, actor.thirst, actor.health,
      actor.energy, actor.social, actor.affection, actor.cx, actor.cz,
    ])),
  };
}

test('thoughtBubbles on/off leaves simulation state and RNG draws identical', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const off = featureRun(false);
    const on = featureRun(true);
    assert.equal(on.draws, off.draws);
    assert.equal(on.state, off.state);
  } finally {
    console.warn = warn;
  }
});

test('plan().reason is a lazy getter, not tick work', () => {
  const engine = createBehavior({
    engine: 'modules', field: {}, getActors: () => [], getHours: () => 12, getDay: () => 1,
    getPopulationCap: () => 40, rng: () => .5,
  });
  const a = actor();
  const plan = engine.plan(a);
  const descriptor = Object.getOwnPropertyDescriptor(plan, 'reason');
  assert.equal(typeof descriptor.get, 'function');
  assert.equal('value' in descriptor, false);
  assert.equal(plan.reason, 'wandering');
});

test('thought rows project visible actors and respect the cap', () => {
  const actors = [
    actor({ uid: 1 }),
    actor({ uid: 2, active: false }),
    actor({ uid: 3 }),
    actor({ uid: 4 }),
  ];
  const rows = thoughtBubbleRows(actors, a => ({ reason: `reason-${a.uid}` }),
    a => ({ x: 100 + a.uid, y: 200, z: 0, width: 800, height: 600 }), 2);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.uid), [1, 3]);
  assert.equal(rows[0].text, 'reason-1');
  const hidden = thoughtBubbleRows(actors, () => ({ reason: 'x' }),
    () => ({ x: -200, y: 10, z: 0, width: 800, height: 600 }));
  assert.equal(hidden.length, 0);
});

test('thought layout separates overlapping labels deterministically', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    uid: i + 1, text: `reason ${i}`, x: 720, y: 450, width: 1440, height: 900,
  }));
  const once = layoutThoughtRows(rows.map(row => ({ ...row })), { width: 1440, height: 900 });
  const twice = layoutThoughtRows(rows.map(row => ({ ...row })), { width: 1440, height: 900 });
  assert.deepEqual(once, twice);
  for (let i = 0; i < once.length; i++) {
    for (let j = i + 1; j < once.length; j++) {
      const a = once[i], b = once[j];
      const aw = Math.min(210, 22 + a.text.length * 6.1), bw = Math.min(210, 22 + b.text.length * 6.1);
      const overlap = Math.abs(a.x - b.x) < (aw + bw) / 2 &&
        a.y > b.y - 26 && a.y - 26 < b.y;
      assert.equal(overlap, false, `labels ${i}/${j} overlap`);
    }
  }
  for (const row of once) {
    assert.ok(row.x >= 0 && row.x <= 1440 && row.y >= 0 && row.y <= 900);
  }
});

function fakeElement() {
  return {
    style: {}, textContent: '', className: '', hidden: false, children: [], attrs: {},
    classList: { add() {}, remove() {} },
    setAttribute(key, value) { this.attrs[key] = value; },
    append(child) { this.children.push(child); },
    remove() {},
    replaceChildren() { this.children.length = 0; },
  };
}

test('disabled overlay reads no plans and stays hidden', () => {
  const container = fakeElement();
  container.ownerDocument = { createElement: fakeElement };
  let plans = 0;
  const overlay = createThoughtBubbleOverlay({
    container,
    project: () => ({ x: 100, y: 100, z: 0, width: 800, height: 600 }),
    getActors: () => [actor()],
    getPlan: () => { plans++; return { reason: 'eating' }; },
    isEnabled: () => false,
  });
  overlay.update(1);
  assert.equal(plans, 0);
  assert.equal(container.hidden, true);
  assert.equal(container.children.length, 0);
});

test('enabled overlay updates text and hides on disable', () => {
  const container = fakeElement();
  container.ownerDocument = { createElement: fakeElement };
  let enabled = true;
  let plans = 0;
  const overlay = createThoughtBubbleOverlay({
    container,
    project: a => ({ x: 100 + a.uid, y: 100, z: 0, width: 800, height: 600 }),
    getActors: () => [actor()],
    getPlan: () => { plans++; return { reason: 'eating' }; },
    isEnabled: () => enabled,
  });
  const state = overlay.refresh();
  assert.equal(plans, 1);
  assert.equal(state.count, 1);
  assert.equal(container.hidden, false);
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].textContent, 'eating');
  assert.match(container.children[0].style.left, /^\d+(\.\d+)?px$/);
  enabled = false;
  overlay.update(1);
  assert.equal(container.hidden, true);
});
