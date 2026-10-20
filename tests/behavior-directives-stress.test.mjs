import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBearAI } from '../src/ai.js';

const SEQUENCES = 600;
const KINDS = ['go', 'eat', 'drink', 'home', 'social'];

function mulberry32(seed) {
  let state = (Math.floor(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function field() {
  const source = {
    id: 'food-1', kind: 'flower', ripe: true, claim: null,
    x: 2, z: 0, approachX: 2, approachZ: 0, satiation: .3,
  };
  return {
    homes: [{ name: 'Home 1', x: 0, z: 0, door: { x: 1, z: 0 } }],
    nav: {
      nearestWalkable: (x, z) => ({ x, z }),
      findPath: (x, z, tx, tz) => [{ x: tx, z: tz }],
      isWalkable: () => true,
    },
    pond: { contains: () => false },
    waterSpots: [{ x: 3, z: 0, waterX: 3, waterZ: 0 }],
    food: {
      sources: [source], allRipe: () => [source],
      nearestRipe: () => source, claim: (s, a) => { s.claim = a; return true; },
      release: (s, a) => { if (s.claim === a) s.claim = null; }, consume: () => true,
    },
    emote: () => {}, emoteHouse: () => {}, splash: () => {},
  };
}

function make(engine, seed) {
  const world = field();
  const bears = [];
  const behavior = createBehavior({
    engine, field: world, getActors: () => bears, getHours: () => 12, getDay: () => 1,
    getPopulationCap: () => 40, rng: mulberry32(seed),
  });
  const ai = createBearAI({
    field: world, getBears: () => bears, getCompanions: () => bears,
    behavior, rng: mulberry32(seed ^ 0x5BD1E995),
  });
  const b = {
    uid: 1, active: true, kind: 'bear', species: 'bear', name: 'actor-1',
    cx: 0, cz: 0, cy: 1, sex: 'F', stage: 'adult', age: 700, home: 'Home 1',
    hunger: .3, thirst: .3, energy: 1, health: 100, social: .3, affection: .25,
    bold: .5, mateCooldown: 0, bonds: {}, skills: { forage: .3, courage: .3, social: .3 },
    playdates: {}, history: [], grabs: 0, inPond: false, sleeping: false, inside: false,
  };
  bears.push(b);
  behavior.attach(b);
  return { b, ai };
}

function operations(sequence) {
  const rng = mulberry32(0x9E3779B9 ^ (sequence * 2654435761));
  const ops = [
    { op: 'issue', kind: 'go', target: { x: 2, z: 2 } },
    { op: 'issue', kind: 'eat' },
    { op: 'issue', kind: 'drink' },
    { op: 'issue', kind: 'home' },
    { op: 'issue', kind: 'social' },
    { op: 'preNeeds' },
    { op: 'preTick', dt: 46 },
    { op: 'needs', health: 10 },
    { op: 'issue', kind: 'eat' },
    { op: 'preNeeds' },
    { op: 'needs', health: 100 },
    { op: 'expire' },
    { op: 'issue', kind: 'eat' },
    { op: 'issue', kind: 'home' },
    { op: 'possess', on: true },
    { op: 'possess', on: false },
  ];
  for (let i = 0; i < 4 + Math.floor(rng() * 6); i++) {
    const r = rng();
    if (r < .44) {
      const kind = KINDS[Math.floor(rng() * KINDS.length)];
      ops.push({ op: 'issue', kind, target: kind === 'go' ? {
        x: Math.round((rng() * 8 - 4) * 10) / 10,
        z: Math.round((rng() * 8 - 4) * 10) / 10,
      } : undefined });
    } else if (r < .58) {
      ops.push({ op: 'needs', health: rng() < .3 ? 10 : 100, hunger: rng(), thirst: rng(), energy: rng() });
    } else if (r < .70) {
      ops.push({ op: 'preNeeds' });
    } else if (r < .82) {
      ops.push({ op: 'preTick', dt: Math.round(rng() * 50 * 10) / 10 });
    } else if (r < .92) {
      ops.push({ op: 'cancel' });
    } else {
      ops.push({ op: 'possess', on: rng() < .5 });
    }
  }
  return ops;
}

function snapshot(ai, b) {
  const state = ai.directiveState(0);
  return {
    active: state.active,
    queue: state.queue,
    status: state.status,
    state: state.state,
    possessed: !!b.ai.possessed,
  };
}

function run(engine, sequence) {
  const { b, ai } = make(engine, sequence + 1);
  const trace = [];
  const counts = { overflows: 0, expiries: 0, refusals: 0, possessions: 0, steps: 0 };
  for (const op of operations(sequence)) {
    let result = null;
    if (op.op === 'issue') result = ai.issueDirective(b, op.kind, op.target);
    else if (op.op === 'needs') {
      if (op.health !== undefined) b.health = op.health;
      if (op.hunger !== undefined) b.hunger = op.hunger;
      if (op.thirst !== undefined) b.thirst = op.thirst;
      if (op.energy !== undefined) b.energy = op.energy;
    } else if (op.op === 'preTick') {
      ai.preTick(b, op.dt);
      ai.preNeeds(b);
    } else if (op.op === 'expire') {
      for (let attempt = 0; attempt < 12 && !b.ai.directive; attempt++) {
        ai.issueDirective(b, 'go', { x: 1, z: 1 });
        ai.preNeeds(b);
        if (!b.ai.directive) b.ai.directives.length = 0;
      }
      if (b.ai.directive) {
        ai.preTick(b, 46);
        ai.preNeeds(b);
        if (b.ai.directiveStatus?.text?.includes('expired')) counts.expiries += 1;
      }
    } else if (op.op === 'preNeeds') ai.preNeeds(b);
    else if (op.op === 'cancel') ai.cancelDirectives(b);
    else if (op.op === 'possess') {
      ai.setPossessed(b, op.on);
      counts.possessions += 1;
    }
    if (op.op === 'issue' && result && result.queued === 3) counts.overflows += 1;
    const state = ai.directiveState(0);
    if (state?.status?.text?.includes('expired')) counts.expiries += 1;
    if (state?.status?.text && /too hurt|too tired|too hungry|too thirsty|not hungry|not thirsty|no home|hungry|thirsty|courting|not right now/.test(state.status.text)) {
      counts.refusals += 1;
    }
    trace.push({ op: op.op, kind: op.kind || null, result, snapshot: snapshot(ai, b) });
    counts.steps += 1;
  }
  return { trace, counts };
}

test(`${SEQUENCES} seeded directive sequences match between legacy and modules`, () => {
  let steps = 0;
  let overflows = 0;
  let expiries = 0;
  let refusals = 0;
  let possessions = 0;
  for (let sequence = 0; sequence < SEQUENCES; sequence++) {
    const legacy = run('legacy', sequence);
    const modules = run('modules', sequence);
    const left = JSON.stringify(legacy.trace);
    const right = JSON.stringify(modules.trace);
    if (left !== right) {
      const at = legacy.trace.findIndex((entry, index) => JSON.stringify(entry) !== JSON.stringify(modules.trace[index]));
      assert.fail(`sequence ${sequence} diverged at step ${at}: ` +
        `${JSON.stringify(legacy.trace[at])} != ${JSON.stringify(modules.trace[at])}`);
    }
    steps += legacy.counts.steps;
    overflows += legacy.counts.overflows;
    expiries += legacy.counts.expiries;
    refusals += legacy.counts.refusals;
    possessions += legacy.counts.possessions;
  }
  assert.ok(steps >= SEQUENCES * 18, `expected at least 10,800 steps, saw ${steps}`);
  assert.ok(overflows > 0, 'queue overflow was exercised');
  assert.ok(refusals > 0, 'refusals were exercised');
  assert.ok(possessions > 0, 'possession transitions were exercised');
  console.log(`directive stress: ${SEQUENCES} sequences, ${steps} steps, ` +
    `${overflows} overflows, ${refusals} refusals, ${possessions} possession toggles, ${expiries} expiry observations`);
});
