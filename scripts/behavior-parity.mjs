// Headless A/B parity harness for the modular behavior engine.
//
// Runs the legacy engine (src/behavior.js) and the modular engine
// (src/behaviors/engine.js) against identical fixtures: fresh worlds, fresh
// actor rosters, the same seeded RNG and the same fixed-dt host loop. It logs
// state transitions and key need values, then diffs a full per-tick snapshot.
//
// The host loop is a deterministic stand-in for app.js + ai.js + glass.js:
// movement is continuous along ai.path, and Glass inside/exit is emulated. The
// engine itself never sees Box3D or three.js.
//
// Usage:
//   node scripts/behavior-parity.mjs
//   node scripts/behavior-parity.mjs --race glass --days 2 --seeds 1,2
//   node scripts/behavior-parity.mjs --validate
//   node scripts/behavior-parity.mjs --long        # 20 days x 5 seeds
//
// Exit code is non-zero when a diff is found (unless the run expected one).

import { pathToFileURL } from 'node:url';
import { createBehavior } from '../src/behaviors/index.js';
import { createFoodRegistry } from '../src/food.js';

const DT = 1 / 20;
const DAY_SECONDS = 240;
const START_HOUR = 6;
const POPULATION_CAP = 40;

/* ------------------------------------------------------------------- rng */

export function mulberry32(seed) {
  let state = (Math.floor(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tracedRng(seed) {
  const next = mulberry32(seed);
  let draws = 0;
  return {
    rng() { draws++; return next(); },
    get draws() { return draws; },
  };
}

/* ----------------------------------------------------------------- world */

const FOOD = [
  { id: 'flower-1', kind: 'flower', x: 2.5, z: 0.5, respawn: 40 },
  { id: 'flower-2', kind: 'flower', x: -3.0, z: 2.0, respawn: 40 },
  { id: 'flower-3', kind: 'flower', x: 0.5, z: 4.5, respawn: 40 },
  { id: 'flower-4', kind: 'flower', x: -1.5, z: -4.0, respawn: 40 },
  { id: 'flower-5', kind: 'flower', x: 6.0, z: 3.0, respawn: 40 },
  { id: 'flower-6', kind: 'flower', x: -6.5, z: -2.5, respawn: 40 },
  { id: 'flower-7', kind: 'flower', x: 4.0, z: -5.5, respawn: 40 },
  { id: 'flower-8', kind: 'flower', x: -5.0, z: 6.0, respawn: 40 },
  { id: 'hive-1', kind: 'hive', x: 8.0, z: 0.0, respawn: 120 },
  { id: 'hive-2', kind: 'hive', x: -8.0, z: 1.5, respawn: 120 },
];

const HOMES = [
  { name: 'Home 1', x: 10, z: 8, door: { x: 9.2, z: 7.4 } },
  { name: 'Home 2', x: 10, z: -8, door: { x: 9.2, z: -7.4 } },
  { name: 'Home 3', x: -10, z: 8, door: { x: -9.2, z: 7.4 } },
  { name: 'Home 4', x: -10, z: -8, door: { x: -9.2, z: -7.4 } },
  { name: 'Home 5', x: 0, z: 11, door: { x: 0.8, z: 10.2 } },
  { name: 'Home 6', x: 0, z: -11, door: { x: 0.8, z: -10.2 } },
];

const WATER = [
  { x: 5, z: 6, waterX: 5, waterZ: 6 },
  { x: -5, z: 6, waterX: -5, waterZ: 6 },
  { x: 5, z: -6, waterX: 5, waterZ: -6 },
  { x: -5, z: -6, waterX: -5, waterZ: -6 },
];

const POND = { x: 0, z: 0, r: 2.4 };
const ARENA = 18;

function insidePond(x, z) {
  return Math.hypot(x - POND.x, z - POND.z) <= POND.r;
}

function projectWalkable(x, z) {
  let nx = x, nz = z;
  const d = Math.hypot(nx - POND.x, nz - POND.z);
  if (d < POND.r) {
    const len = d || 1;
    nx = POND.x + (nx - POND.x) / len * (POND.r + .25);
    nz = POND.z + (nz - POND.z) / len * (POND.r + .25);
  }
  const r = Math.hypot(nx, nz);
  if (r > ARENA) {
    nx = nx / r * ARENA;
    nz = nz / r * ARENA;
  }
  return { x: nx, z: nz };
}

export function createWorld({ flowers = 0 } = {}) {
  const sources = FOOD.map(source => ({ ...source }));
  for (let index = 0; index < flowers; index++) {
    const angle = index * 2.399963;
    const radius = 11 + (index % 4);
    sources.push({
      id: `flower-extra-${index}`,
      kind: 'flower',
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      respawn: 40,
    });
  }
  const food = createFoodRegistry({ sources, rng: mulberry32(99) });
  return {
    homes: HOMES.map(home => ({ ...home, door: { ...home.door } })),
    waterSpots: WATER.map(spot => ({ ...spot })),
    food,
    pond: { contains: (x, z) => insidePond(x, z) },
    nav: {
      nearestWalkable(x, z) {
        const near = projectWalkable(x, z);
        return { x: near.x, z: near.z };
      },
      findPath(x, z, tx, tz) {
        if (![x, z, tx, tz].every(Number.isFinite)) return null;
        if (insidePond(tx, tz)) return null;
        return [{ x: tx, z: tz }];
      },
      isWalkable(x, z) { return Number.isFinite(x) && Number.isFinite(z) && !insidePond(x, z); },
    },
    emote() {},
    splash() {},
    sting() {},
  };
}

/* ---------------------------------------------------------------- roster */

const RACE_SPECIES = {
  bear: { species: 'bear', kind: 'bear' },
  gummy: { species: 'msn', kind: 'bear' },
  glass: { species: 'glass', kind: 'glass' },
};

export function createRoster(race, perturb = 0) {
  const def = RACE_SPECIES[race] || RACE_SPECIES.bear;
  const rows = [
    { uid: 1, sex: 'F', stage: 'adult', age: 700, home: 'Home 1', parents: [] },
    { uid: 2, sex: 'M', stage: 'adult', age: 760, home: 'Home 1', parents: [] },
    { uid: 3, sex: 'M', stage: 'teen', age: 300, home: 'Home 2', parents: [] },
    { uid: 4, sex: 'F', stage: 'teen', age: 320, home: 'Home 2', parents: [] },
    { uid: 5, sex: 'F', stage: 'baby', age: 60, home: 'Home 1', parents: [1, 2] },
    { uid: 6, sex: 'M', stage: 'baby', age: 60, home: 'Home 1', parents: [1, 2] },
  ];
  const start = [
    { x: 1, z: 1 }, { x: -1, z: 1 }, { x: 2, z: 2 },
    { x: -2, z: 2 }, { x: 1, z: -2 }, { x: -1, z: -2 },
  ];
  return rows.map((row, index) => {
    const actor = {
      uid: row.uid,
      active: true,
      kind: def.kind,
      species: def.species,
      name: `${race}-${row.uid}`,
      cx: start[index].x,
      cz: start[index].z,
      cy: 1,
      sex: row.sex,
      stage: row.stage,
      age: row.age,
      scale: row.stage === 'baby' ? .58 : row.stage === 'teen' ? .78 : 1,
      home: row.home,
      parentUids: row.parents.slice(),
      fatherUid: 0,
      hunger: .30,
      thirst: .30,
      energy: 1,
      health: 100,
      social: .30,
      affection: .25,
      bold: .5,
      pregnant: false,
      gestation: 0,
      mateCooldown: 0,
      bedtime: 20,
      wakeTime: 6,
      bonds: {},
      skills: { forage: .30, courage: .30, social: .30 },
      playdates: {},
      history: [],
      grabs: 0,
      inPond: false,
      sleeping: false,
      inside: false,
      freeBody: false,
      hopSpeedMin: .8,
      hopSpeedMax: 1.65,
    };
    if (perturb) actor.hunger += perturb;
    return actor;
  });
}

/* --------------------------------------------------------------- adapters */

function glassDay(hours) {
  return hours >= 8 && hours < 18;
}

function createSoftAdapter() {
  return {
    onStop(actor) { if (actor && actor.ai) actor.ai.moving = false; },
  };
}

function createGlassAdapter() {
  return {
    onStop(actor) { if (actor && actor.ai) actor.ai.moving = false; },
    onSleep(actor, home, restKind) {
      if (!actor || !actor.ai) return;
      if (home) { actor.cx = home.door.x; actor.cz = home.door.z; }
      actor.inside = true;
      actor.ai.state = 'sleep';
      actor.ai.restKind = restKind || 'shelter';
      actor.ai.sleepHome = home ? home.name : actor.home;
      actor.ai.insideT = 34;
      actor.ai.moving = false;
      actor.shelteredToday = true;
    },
    onWake(actor) {
      if (!actor || !actor.ai) return;
      actor.inside = false;
      actor.ai.state = 'exit';
      actor.exitT = .55;
      actor.ai.restKind = null;
    },
    sleepDone(actor, { hours }) {
      if (!actor) return true;
      if (!actor.inside) return true;
      return !glassDay(hours) || (actor.ai && (actor.ai.insideT || 0) <= 0);
    },
  };
}

/* ------------------------------------------------------------- host loop */

function clockAt(seconds, daySeconds = DAY_SECONDS) {
  const totalHours = START_HOUR + seconds / (daySeconds / 24);
  return {
    hours: totalHours % 24,
    day: Math.floor(totalHours / 24),
  };
}

function hostTick(run, dt) {
  const clock = clockAt(run.clock.seconds, run.daySeconds);
  for (const actor of run.roster) {
    const ai = actor.ai;
    if (!ai) continue;
    if (Number.isFinite(actor.mateCooldown) && actor.mateCooldown > 0) {
      actor.mateCooldown = Math.max(0, actor.mateCooldown - dt);
    }
    if (actor.kind === 'glass') {
      actor.shelteredToday = glassDay(clock.hours) ? !!actor.shelteredToday : false;
      if (actor.inside) {
        actor.ai.insideT = Math.max(0, (actor.ai.insideT || 0) - dt);
        run.engineApi.tick(actor, dt, { ready: false });
        if (actor.ai.insideT <= 0 || !glassDay(clock.hours)) {
          run.engineApi.api.wake(actor);
        }
        continue;
      }
      if (ai.state === 'exit') {
        actor.exitT = (Number.isFinite(actor.exitT) ? actor.exitT : .55) - dt;
        if (actor.exitT <= 0) {
          ai.state = 'wander';
          ai.idleT = .4;
          ai.nextThink = 0;
          actor.exitT = null;
        }
        run.engineApi.tick(actor, dt, { ready: false });
        continue;
      }
    }
    run.engineApi.tick(actor, dt, { ready: true });
  }
  driveMovement(run, dt);
  run.world.food.update(dt);
  run.clock.seconds += dt;
}

function driveMovement(run, dt) {
  for (const actor of run.roster) {
    const ai = actor.ai;
    if (!ai || !ai.moving) continue;
    if (actor.grabs > 0 || actor.inPond || ai.interrupted || ai.possessed) continue;
    const glass = actor.kind === 'glass';
    let point = ai.target;
    if (ai.path && ai.path.length) {
      let index = ai.pathIndex | 0;
      const reach = glass ? .25 : .42;
      while (index < ai.path.length - 1 &&
        Math.hypot(ai.path[index].x - actor.cx, ai.path[index].z - actor.cz) <= reach) {
        index++;
      }
      ai.pathIndex = index;
      point = ai.path[index] || ai.target;
    }
    if (!point) {
      if (glass) {
        ai.path = null;
        ai.pathIndex = 0;
        ai.arrived = true;
      }
      ai.moving = false;
      continue;
    }
    const dx = point.x - actor.cx;
    const dz = point.z - actor.cz;
    const d = Math.hypot(dx, dz);
    if (glass) {
      if (d < .22) {
        ai.pathIndex = (ai.pathIndex | 0) + 1;
        if (!ai.path || ai.pathIndex >= ai.path.length) {
          ai.path = null;
          ai.pathIndex = 0;
          ai.moving = false;
          ai.arrived = true;
        }
        continue;
      }
      const step = Math.min(d, 1.35 * dt);
      actor.cx += dx / d * step;
      actor.cz += dz / d * step;
      continue;
    }
    if (d < .52) {
      ai.moving = false;
      ai.faceYaw = null;
      if (ai.state === 'wander') ai.arrived = true;
      continue;
    }
    const step = Math.min(d, 1.2 * dt);
    actor.cx += dx / d * step;
    actor.cz += dz / d * step;
  }
}

/* -------------------------------------------------------------- snapshots */

function number(value) {
  return Number.isFinite(value) ? value : 0;
}

function timer(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bondSnapshot(actor) {
  if (!actor.bonds || typeof actor.bonds !== 'object') return [];
  return Object.keys(actor.bonds)
    .map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    .map(uid => [uid, Number(actor.bonds[uid])]);
}

function historySnapshot(actor) {
  return (actor.history || []).map(event => [event.kind, event.uid, event.day, event.hour]);
}

function playdateSnapshot(actor) {
  if (!actor.playdates || typeof actor.playdates !== 'object') return [];
  return Object.keys(actor.playdates)
    .map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    .map(uid => [uid, actor.playdates[uid].day, actor.playdates[uid].hour]);
}

function actorSnapshot(actor) {
  const ai = actor.ai;
  const task = ai.familyTask;
  return {
    state: ai.state,
    hunger: number(actor.hunger), thirst: number(actor.thirst),
    health: number(actor.health), energy: number(actor.energy),
    social: number(actor.social), affection: number(actor.affection),
    stage: actor.stage, home: actor.home || '', sleeping: !!actor.sleeping,
    inside: !!actor.inside, pregnant: !!actor.pregnant,
    gestation: number(actor.gestation), mateCooldown: number(actor.mateCooldown),
    bedtime: number(actor.bedtime), wakeTime: number(actor.wakeTime),
    shelteredToday: !!actor.shelteredToday, shelterCheckT: number(actor.shelterCheckT),
    target: ai.target ? [ai.target.x, ai.target.z] : null,
    source: ai.source ? ai.source.id : null,
    water: ai.waterSpot ? [ai.waterSpot.x, ai.waterSpot.z] : null,
    partner: ai.partner ? ai.partner.uid : null,
    follow: ai.follow ? ai.follow.uid : null,
    task: task ? [task.id, task.phase, task.role, task.t, task.anchor ? [task.anchor.x, task.anchor.z] : null] : null,
    flags: [
      !!ai.familyPlay, !!ai.playdate, ai.playmateKind || '', ai.visitPhase || '',
      ai.visitRole || '', ai.restKind || '', !!ai.interrupted, !!ai.possessed,
      !!ai.directiveHome, ai.fleeFrom ? [ai.fleeFrom.x, ai.fleeFrom.z] : null,
    ],
    visit: ai.visitHome || '',
    visitArrived: !!ai.visitArrived,
    moving: !!ai.moving, arrived: !!ai.arrived, pathIndex: ai.pathIndex | 0,
    path: ai.path ? ai.path.map(p => [p.x, p.z]) : [],
    faceYaw: ai.faceYaw === null || ai.faceYaw === undefined ? null : ai.faceYaw,
    animT: number(ai.animT),
    timers: [
      timer(ai.eatT), timer(ai.drinkT), timer(ai.inviteT), timer(ai.socialT),
      timer(ai.declineT), timer(ai.conflictT), timer(ai.mateT), timer(ai.raidT),
      timer(ai.fleeT), timer(ai.stungT), timer(ai.idleT), timer(ai.nextThink),
      timer(ai.taskCooldown), timer(ai.socialCooldown), timer(ai.conflictCooldown),
      timer(ai.familyPlayCooldown), timer(ai.followRetryT), timer(ai.restCooldown),
      timer(ai.avoidSourceT), timer(ai.noProgressT), timer(ai.insideT),
      timer(ai.clock), timer(ai.doorEntries), timer(ai.doorExits),
      ai.avoidSourceId || null, ai.contestSource ? ai.contestSource.id : null,
      ai.contestBear ? ai.contestBear.uid : null,
      ai.conflictSource ? ai.conflictSource.id : null,
      ai.shove ? [ai.shove.x, ai.shove.z] : null,
      ai.lastMealWindow || null,
    ],
    bonds: bondSnapshot(actor),
    history: historySnapshot(actor),
    playdates: playdateSnapshot(actor),
    skills: actor.skills ? [actor.skills.forage, actor.skills.courage, actor.skills.social] : null,
  };
}

function snapshot(run) {
  return JSON.stringify({
    actors: run.roster.map(actor => [actor.uid, actorSnapshot(actor)]),
    food: run.world.food.sources.map(source => [
      source.id, !!source.ripe, source.claim ? source.claim.uid : 0,
    ]),
  });
}

function firstDiffPath(left, right, path = [], out = []) {
  if (out.length >= 3) return out;
  if (left === right) return out;
  if (typeof left !== typeof right || left === null || right === null ||
      typeof left !== 'object' || typeof right !== 'object') {
    out.push({ path: path.join('.'), left, right });
    return out;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      out.push({ path: path.join('.'), left, right });
      return out;
    }
    for (let i = 0; i < left.length && out.length < 3; i++) {
      firstDiffPath(left[i], right[i], [...path, i], out);
    }
    return out;
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (out.length >= 3) break;
    firstDiffPath(left[key], right[key], [...path, key], out);
  }
  return out;
}

/* ------------------------------------------------------------------ runs */

function createRun({ race, seed, perturb = 0, engine = 'legacy', daySeconds = DAY_SECONDS, collectSamples = false, flowers = 0 }) {
  const world = createWorld({ flowers });
  const roster = createRoster(race, perturb);
  const traced = tracedRng(seed);
  const clock = { seconds: 0 };
  const engineApi = createBehavior({
    engine,
    field: world,
    getActors: () => roster,
    getHours: () => clockAt(clock.seconds, daySeconds).hours,
    getDay: () => clockAt(clock.seconds, daySeconds).day,
    getPopulationCap: () => POPULATION_CAP,
    rng: traced.rng,
  });
  engineApi.registerAdapter('softbody', createSoftAdapter());
  engineApi.registerAdapter('skinned', createGlassAdapter());
  for (const actor of roster) engineApi.attach(actor);
  const run = {
    race, seed, engine, world, roster, engineApi, traced, daySeconds, collectSamples, clock,
    transitions: [], samples: [], warnings: [], lastState: new Map(),
  };
  for (const actor of roster) run.lastState.set(actor.uid, actor.ai ? actor.ai.state : null);
  return run;
}

let warningSink = null;

function captureWarnings(run, fn) {
  warningSink = run.warnings;
  try {
    return fn();
  } finally {
    warningSink = null;
  }
}

function stepRun(run, { dt, sampleEvery, sampleAcc }) {
  const before = new Map(run.roster.map(actor => [actor.uid, actor.ai ? actor.ai.state : null]));
  captureWarnings(run, () => hostTick(run, dt));
  const t = +run.clock.seconds.toFixed(6);
  for (const actor of run.roster) {
    const state = actor.ai ? actor.ai.state : null;
    const previous = before.get(actor.uid);
    if (state !== previous) {
      run.transitions.push({ t, uid: actor.uid, from: previous, to: state });
    }
    run.lastState.set(actor.uid, state);
  }
  const shouldSample = run.collectSamples && (sampleAcc === 0 || sampleEvery <= 1);
  if (shouldSample) {
    run.samples.push({
      t,
      actors: run.roster.map(actor => ({
        uid: actor.uid,
        state: actor.ai ? actor.ai.state : null,
        hunger: +number(actor.hunger).toFixed(6),
        thirst: +number(actor.thirst).toFixed(6),
        energy: +number(actor.energy).toFixed(6),
        social: +number(actor.social).toFixed(6),
        affection: +number(actor.affection).toFixed(6),
        health: +number(actor.health).toFixed(6),
      })),
    });
  }
}

/* -------------------------------------------------------------- comparison */

export function runParity({
  race = 'bear',
  seed = 1,
  days = 3,
  dt = DT,
  daySeconds = DAY_SECONDS,
  sampleEvery = 1,
  perturb = 0,
  verbose = false,
  engineA = 'legacy',
  engineB = 'modules',
  flowers = 0,
} = {}) {
  const a = createRun({ race, seed, engine: engineA, daySeconds, collectSamples: verbose, flowers });
  const b = createRun({ race, seed, engine: engineB, perturb, daySeconds, collectSamples: verbose, flowers });
  const ticks = Math.round(days * daySeconds / dt);
  const started = Date.now();
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (warningSink && warningSink.length < 200) warningSink.push(args.map(String).join(' '));
  };
  try {
    for (let tick = 0; tick < ticks; tick++) {
      const sampleAcc = tick % sampleEvery;
      stepRun(a, { dt, sampleEvery, sampleAcc });
      stepRun(b, { dt, sampleEvery, sampleAcc });
      const left = snapshot(a);
      const right = snapshot(b);
      if (left !== right) {
        const leftJson = JSON.parse(left);
        const rightJson = JSON.parse(right);
        const diffs = firstDiffPath(leftJson, rightJson);
        return {
          race, seed, ticks: tick + 1, ok: false,
          transitionsA: a.transitions.length,
          transitionsB: b.transitions.length,
          drawsA: a.traced.draws, drawsB: b.traced.draws,
          warningsA: a.warnings.length, warningsB: b.warnings.length,
          coverage: typeof b.engineApi.coverage === 'function' ? b.engineApi.coverage() : null,
          diffs,
          firstTick: tick,
          durationMs: Date.now() - started,
          transitions: verbose ? b.transitions : undefined,
          transitionLogA: verbose ? a.transitions : undefined,
          transitionLogB: verbose ? b.transitions : undefined,
          samples: verbose ? b.samples : undefined,
        };
      }
    }
  } finally {
    console.warn = originalWarn;
  }
  return {
    race, seed, ticks, ok: true,
    transitionsA: a.transitions.length,
    transitionsB: b.transitions.length,
    drawsA: a.traced.draws, drawsB: b.traced.draws,
    warningsA: a.warnings.length, warningsB: b.warnings.length,
    coverage: typeof b.engineApi.coverage === 'function' ? b.engineApi.coverage() : null,
    diffs: [],
    durationMs: Date.now() - started,
    transitions: verbose ? b.transitions : undefined,
    transitionLogA: verbose ? a.transitions : undefined,
    transitionLogB: verbose ? b.transitions : undefined,
    samples: verbose ? b.samples : undefined,
  };
}

/* --------------------------------------------------------------- validate */

export function validateParity({ race = 'bear', seed = 7, days = 1, verbose = false } = {}) {
  const sameEngine = runParity({ race, seed, days, engineA: 'legacy', engineB: 'legacy', verbose });
  const parity = runParity({ race, seed, days, engineA: 'legacy', engineB: 'modules', verbose });
  const perturbed = runParity({
    race, seed, days, engineA: 'legacy', engineB: 'modules', perturb: .001, verbose,
  });
  return {
    legacyVsLegacy: { ok: sameEngine.ok, diff: sameEngine.diffs[0] || null },
    legacyVsModules: { ok: parity.ok, diff: parity.diffs[0] || null },
    perturbationDetected: { ok: !perturbed.ok, diff: perturbed.diffs[0] || null },
    ok: sameEngine.ok && parity.ok && !perturbed.ok,
  };
}

/* ---------------------------------------------------------------- coverage */

export const LOW_COVERAGE = 20;

// Current engine states, including the dead seekSocial state, so a zero-hit
// branch is visible in the report instead of simply missing from the map.
export const KNOWN_STATES = Object.freeze([
  'wander', 'seekFood', 'eat', 'seekWater', 'drink', 'seekHive', 'raidHive',
  'flee', 'seekHome', 'sleep', 'seekCompany', 'invite', 'social', 'decline',
  'visit', 'seekConflict', 'conflict', 'seekMate', 'mate', 'follow',
  'familyTask', 'stargaze', 'seekSocial', 'exit',
]);

export function mergeCoverage(results) {
  const states = {};
  const entries = {};
  const opportunities = {};
  for (const result of results) {
    const coverage = result && result.coverage;
    if (!coverage) continue;
    for (const [key, value] of Object.entries(coverage.states || {})) {
      states[key] = (states[key] || 0) + value;
    }
    for (const [key, value] of Object.entries(coverage.entries || {})) {
      entries[key] = (entries[key] || 0) + value;
    }
    for (const [key, value] of Object.entries(coverage.opportunities || {})) {
      opportunities[key] = (opportunities[key] || 0) + value;
    }
  }
  return { states, entries, opportunities };
}

export function formatCoverage(results) {
  const merged = mergeCoverage(results);
  const stateNames = [...new Set([...KNOWN_STATES, ...Object.keys(merged.entries)])].sort();
  const lowStates = stateNames
    .filter(state => (merged.entries[state] || 0) < LOW_COVERAGE);
  const lowOpportunities = Object.entries(merged.opportunities)
    .filter(([, hits]) => hits < LOW_COVERAGE).map(([id]) => id);
  const lines = ['COVERAGE (module engine; entries/ticks per state)'];
  for (const state of stateNames) {
    const entries = merged.entries[state] || 0;
    const ticks = merged.states[state] || 0;
    lines.push(`  ${state.padEnd(14)} ${String(entries).padStart(7)} entries ${String(ticks).padStart(9)} ticks${entries < LOW_COVERAGE ? '  LOW' : ''}`);
  }
  lines.push('COVERAGE opportunities (times selected)');
  for (const id of Object.keys(merged.opportunities).sort()) {
    const hits = merged.opportunities[id] || 0;
    lines.push(`  ${id.padEnd(18)} ${String(hits).padStart(7)}${hits < LOW_COVERAGE ? '  LOW' : ''}`);
  }
  lines.push(`LOW (<${LOW_COVERAGE}) states: ${lowStates.join(', ') || 'none'}`);
  lines.push(`LOW (<${LOW_COVERAGE}) opportunities: ${lowOpportunities.join(', ') || 'none'}`);
  return { merged, lowStates, lowOpportunities, text: lines.join('\n') };
}

/* -------------------------------------------------------------------- cli */

const RACES = ['bear', 'gummy', 'glass'];

// Dedicated packs for branches the open-world long run does not reach often.
// Mate needs a rich larder (MATE_FOOD_MIN is 18 safe sources); the fixture world
// starts with 8 flowers, so mate is unreachable without this pack.
export const SCENARIOS = Object.freeze({
  mate: Object.freeze({
    id: 'mate',
    label: 'mate (rich food, rested adults)',
    days: 5,
    seeds: [1, 2, 3, 4, 5],
    flowers: 28,
  }),
});

function parseList(value) {
  if (!value) return null;
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    races: RACES.slice(), seeds: [1], days: 3, dt: DT, daySeconds: DAY_SECONDS,
    sampleEvery: 1, validate: false, long: false, json: false, verbose: false,
    coverage: false, scenario: null, flowers: 0, seedProvided: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];
    if (arg === '--race') options.races = parseList(value()) || options.races;
    else if (arg === '--race=*') options.races = RACES.slice();
    else if (arg.startsWith('--race=')) options.races = parseList(arg.slice(7)) || options.races;
    else if (arg === '--seed') { options.seeds = [Number(value())]; options.seedProvided = true; }
    else if (arg.startsWith('--seed=')) { options.seeds = [Number(arg.slice(7))]; options.seedProvided = true; }
    else if (arg === '--seeds') { options.seeds = (parseList(value()) || []).map(Number); options.seedProvided = true; }
    else if (arg.startsWith('--seeds=')) { options.seeds = (parseList(arg.slice(8)) || []).map(Number); options.seedProvided = true; }
    else if (arg === '--days') options.days = Number(value());
    else if (arg.startsWith('--days=')) options.days = Number(arg.slice(7));
    else if (arg === '--dt') options.dt = Number(value());
    else if (arg.startsWith('--dt=')) options.dt = Number(arg.slice(5));
    else if (arg === '--day-seconds') options.daySeconds = Number(value());
    else if (arg.startsWith('--day-seconds=')) options.daySeconds = Number(arg.slice(14));
    else if (arg === '--sample') options.sampleEvery = Math.max(1, Number(value()));
    else if (arg.startsWith('--sample=')) options.sampleEvery = Math.max(1, Number(arg.slice(9)));
    else if (arg === '--validate') options.validate = true;
    else if (arg === '--long') options.long = true;
    else if (arg === '--coverage') options.coverage = true;
    else if (arg === '--scenario') options.scenario = value();
    else if (arg.startsWith('--scenario=')) options.scenario = arg.slice(11);
    else if (arg === '--json') options.json = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  if (options.long) {
    options.days = 20;
    options.seeds = [1, 2, 3, 4, 5];
    options.sampleEvery = Math.max(options.sampleEvery, 5);
    options.coverage = true;
  }
  if (options.scenario) {
    const scenario = SCENARIOS[options.scenario];
    if (!scenario) {
      options.unknownScenario = options.scenario;
    } else {
      options.days = scenario.days;
      options.flowers = scenario.flowers;
      if (!options.seedProvided && Array.isArray(scenario.seeds)) options.seeds = scenario.seeds.slice();
      options.coverage = true;
    }
  }
  options.seeds = options.seeds.filter(Number.isFinite);
  return options;
}

function formatDiff(diff) {
  if (!diff) return '';
  return `${diff.path}: ${JSON.stringify(diff.left)} != ${JSON.stringify(diff.right)}`;
}

function printHelp() {
  console.log(`Behavior parity harness

  --race bear,gummy,glass   races to run (default all three)
  --seed N | --seeds 1,2    RNG seeds (default 1)
  --days N                  simulated days per seed (default 3)
  --dt S                    fixed step (default 1/20)
  --day-seconds S           wall-clock seconds per in-game day (default 240)
  --sample N                snapshot every N ticks (default 1)
  --validate                legacy/legacy, legacy/modules, perturbation check
  --long                    20 days x 5 seeds, sampled every 5 ticks, coverage on
  --coverage                print per-state and per-opportunity hit counts
  --scenario mate           dedicated branch pack (rich food, rested adults)
  --json                    machine-readable summary
  --verbose                 include the transition log`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) { printHelp(); return 0; }
  if (options.unknownScenario) {
    console.error(`Unknown scenario "${options.unknownScenario}". Known: ${Object.keys(SCENARIOS).join(', ')}`);
    return 1;
  }
  if (options.validate) {
    const results = [];
    for (const race of options.races.length ? options.races : RACES) {
      results.push({ race, ...validateParity({ race, seed: options.seeds[0] || 7, days: 1, verbose: options.verbose }) });
    }
    const ok = results.every(result => result.ok);
    if (options.json) console.log(JSON.stringify({ validate: results, ok }, null, 2));
    else {
      for (const result of results) {
        console.log(`${result.race}: legacy-vs-legacy ${result.legacyVsLegacy.ok ? 'PASS' : 'FAIL'}, ` +
          `legacy-vs-modules ${result.legacyVsModules.ok ? 'PASS' : 'FAIL'}, ` +
          `perturbation ${result.perturbationDetected.ok ? 'DETECTED' : 'MISSED'}`);
        for (const key of ['legacyVsLegacy', 'legacyVsModules', 'perturbationDetected']) {
          const diff = result[key].diff;
          if (diff) console.log(`  ${key}: ${formatDiff(diff)}`);
        }
      }
      console.log(ok ? 'VALIDATION PASS' : 'VALIDATION FAIL');
    }
    return ok ? 0 : 1;
  }

  const results = [];
  for (const seed of options.seeds) {
    for (const race of options.races) {
      const result = runParity({
        race, seed, days: options.days, dt: options.dt,
        daySeconds: options.daySeconds, sampleEvery: options.sampleEvery,
        verbose: options.verbose, flowers: options.flowers,
      });
      results.push(result);
      if (!options.json) {
        const status = result.ok ? 'PASS' : 'DIFF';
        console.log(`${status} ${race} seed ${seed}: ${result.ticks} ticks, ` +
          `${result.transitionsA}/${result.transitionsB} transitions, ` +
          `${result.drawsA}/${result.drawsB} rng draws, ` +
          `${result.warningsA}/${result.warningsB} warnings, ${result.durationMs} ms`);
        for (const diff of result.diffs.slice(0, 3)) console.log(`  ${formatDiff(diff)}`);
      }
    }
  }
  const parityOk = results.every(result => result.ok);
  const coverage = (options.coverage || options.scenario) ? formatCoverage(results) : null;
  if (options.scenario) {
    const scenario = SCENARIOS[options.scenario];
    const hits = coverage.merged.entries[options.scenario] || 0;
    console.log(`SCENARIO ${scenario.id} (${scenario.label}): ${hits} ${options.scenario} entries across ` +
      `${options.races.length} races x ${options.seeds.length} seeds x ${options.days} days`);
    if (hits < LOW_COVERAGE) {
      console.log(`SCENARIO COVERAGE FAIL: ${options.scenario} remained under ${LOW_COVERAGE}`);
    }
    options.scenarioOk = hits >= LOW_COVERAGE;
  }
  const ok = parityOk && (options.scenarioOk !== false);
  if (coverage) {
    if (!options.json) console.log(coverage.text);
    if (options.json) {
      console.log(JSON.stringify({ results, coverage: coverage.merged, low: {
        states: coverage.lowStates, opportunities: coverage.lowOpportunities,
      }, ok }, null, 2));
      return ok ? 0 : 1;
    }
  }
  if (options.json) console.log(JSON.stringify({ results, ok }, null, 2));
  else console.log(ok ? 'PARITY PASS' : 'PARITY FAIL');
  return ok ? 0 : 1;
}

const isMain = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
