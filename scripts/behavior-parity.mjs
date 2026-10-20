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
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createFoodRegistry } from '../src/food.js';
import {
  STAGE_AGE, GESTATION_TIME, MATE_COOLDOWN,
  advanceAge, advanceGestation, scaleForStage,
} from '../src/life.js';

const DT = 1 / 20;
const DAY_SECONDS = 240;
const START_HOUR = 6;
const POPULATION_CAP = 40;

// Mirrors app.js stepLife() (~870-895), applyBearStage() (~670-674) and the
// meadow population cap in setCeilingForMap() (~5260). The lifecycle test
// fails if these drift from life.js or the app-owned cap.
export const HARNESS_LIFECYCLE = Object.freeze({
  stageAge: Object.freeze({ ...STAGE_AGE }),
  gestation: GESTATION_TIME,
  mateCooldown: MATE_COOLDOWN,
  populationCap: POPULATION_CAP,
});

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
  { id: 'flower-9', kind: 'flower', x: 3.0, z: 8.0, respawn: 40 },
  { id: 'flower-10', kind: 'flower', x: -3.0, z: 8.0, respawn: 40 },
  { id: 'flower-11', kind: 'flower', x: 8.0, z: 4.0, respawn: 40 },
  { id: 'flower-12', kind: 'flower', x: -8.0, z: 4.0, respawn: 40 },
  { id: 'flower-13', kind: 'flower', x: 8.0, z: -4.0, respawn: 40 },
  { id: 'flower-14', kind: 'flower', x: -8.0, z: -4.0, respawn: 40 },
  { id: 'flower-15', kind: 'flower', x: 3.0, z: -8.0, respawn: 40 },
  { id: 'flower-16', kind: 'flower', x: -3.0, z: -8.0, respawn: 40 },
  { id: 'flower-17', kind: 'flower', x: 11.0, z: 0.0, respawn: 40 },
  { id: 'flower-18', kind: 'flower', x: -11.0, z: 0.0, respawn: 40 },
  { id: 'flower-19', kind: 'flower', x: 0.0, z: 9.0, respawn: 40 },
  { id: 'flower-20', kind: 'flower', x: 0.0, z: -9.0, respawn: 40 },
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

export function createWorld({ flowers = 0, foodSources = null } = {}) {
  const sources = Array.isArray(foodSources)
    ? foodSources.map(source => ({ ...source }))
    : FOOD.map(source => ({ ...source }));
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

export function createRoster(race, perturb = 0, { seedBonds = false, social = false, allAdults = false, traits = null } = {}) {
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
    { x: 8.5, z: 7.0 }, { x: 9.5, z: 8.6 }, { x: 8.5, z: -7.0 },
    { x: 9.5, z: -8.6 }, { x: 7.8, z: 8.2 }, { x: 10.2, z: 7.2 },
  ];
  const roster = rows.map((row, index) => {
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
      stage: allAdults ? 'adult' : row.stage,
      age: allAdults ? 700 : row.age,
      scale: allAdults ? 1 : row.stage === 'baby' ? .58 : row.stage === 'teen' ? .78 : 1,
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
      skills: row.stage === 'adult'
        ? { forage: .55, courage: .40, social: .50 }
        : row.stage === 'teen'
          ? { forage: .20, courage: .20, social: .20 }
          : { forage: 0, courage: 0, social: 0 },
      playdates: {},
      history: [],
      ...(traits ? { traits: { ...traits } } : {}),
      grabs: 0,
      inPond: false,
      sleeping: false,
      inside: false,
      freeBody: false,
      hopSpeedMin: .8,
      hopSpeedMax: 1.65,
    };
    if (social) {
      actor.social = .90;
      actor.affection = .90;
    }
    if (perturb) actor.hunger += perturb;
    return actor;
  });
  if (seedBonds) {
    for (const a of roster) {
      for (const b of roster) {
        if (a === b) continue;
        a.bonds[String(b.uid)] = .55;
      }
    }
  }
  return roster;
}

// Minimal app-equivalent birth. app.js birthChild() also handles genomes,
// flavors and effects; the behavior engine only needs the actor fields.
function birthChild(run, mother) {
  if (!mother || !mother.active || !mother.pregnant) return false;
  if (run.roster.filter(actor => actor.active).length >= (run.populationCap || HARNESS_LIFECYCLE.populationCap)) {
    run.life.blockedBirths++;
    return false;
  }
  const father = run.roster.find(actor => actor.active && actor.uid === mother.fatherUid) || null;
  const uid = run.nextBirthUid++;
  const child = {
    uid,
    active: true,
    kind: mother.kind,
    species: mother.species,
    name: `born-${uid}`,
    cx: mother.cx,
    cz: mother.cz,
    cy: 1,
    sex: uid % 2 ? 'F' : 'M',
    stage: 'baby',
    age: 0,
    scale: scaleForStage('baby'),
    home: mother.home,
    parentUids: [mother.uid, father ? father.uid : 0].filter(Boolean),
    fatherUid: father ? father.uid : 0,
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
    bedtime: mother.bedtime,
    wakeTime: mother.wakeTime,
    bonds: {},
    skills: { forage: 0, courage: 0, social: 0 },
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
  if (mother.bonds) mother.bonds[String(uid)] = .5;
  if (father && father.bonds) father.bonds[String(uid)] = .5;
  child.bonds[String(mother.uid)] = .5;
  if (father) child.bonds[String(father.uid)] = .5;
  run.engineApi.attach(child);
  run.roster.push(child);
  mother.pregnant = false;
  mother.gestation = 0;
  mother.birthRetryT = 0;
  mother.mateCooldown = HARNESS_LIFECYCLE.mateCooldown;
  run.life.births++;
  return true;
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

function clockAt(seconds, daySeconds = DAY_SECONDS, startHour = START_HOUR) {
  const totalHours = startHour + seconds / (daySeconds / 24);
  return {
    hours: totalHours % 24,
    day: Math.floor(totalHours / 24),
  };
}

function hostTick(run, dt) {
  const clock = clockAt(run.clock.seconds, run.daySeconds, run.startHour);
  for (const actor of run.roster) {
    const ai = actor.ai;
    if (!ai) continue;
    if (Number.isFinite(actor.mateCooldown) && actor.mateCooldown > 0) {
      actor.mateCooldown = Math.max(0, actor.mateCooldown - dt);
    }
    if (actor.birthRetryT > 0) actor.birthRetryT = Math.max(0, actor.birthRetryT - dt);
    if (actor.pendingStage && actor.grabs === 0 && !actor.inPond) {
      actor.stage = actor.pendingStage;
      actor.scale = scaleForStage(actor.stage);
      actor.pendingStage = null;
      run.life.stageUps++;
    }
    const nextStage = advanceAge(actor, dt);
    if (nextStage !== actor.stage) {
      if (actor.grabs === 0 && !actor.inPond) {
        actor.stage = nextStage;
        actor.scale = scaleForStage(nextStage);
        if (nextStage !== 'baby' && ai.state === 'follow') {
          ai.follow = null;
          ai.state = 'wander';
          ai.idleT = .5;
          ai.path = null;
          ai.moving = false;
        }
        run.life.stageUps++;
      } else {
        actor.pendingStage = nextStage;
      }
    }
    if (actor.pregnant && advanceGestation(actor, dt) && actor.birthRetryT <= 0) {
      if (!birthChild(run, actor)) actor.birthRetryT = 3;
    }
    if (ai.possessed) {
      run.engineApi.tick(actor, dt, { ready: false });
      continue;
    }
    if (actor.grabs > 0 || actor.inPond) {
      if (!ai.interrupted) {
        ai.interrupted = true;
        ai.moving = false;
        ai.hopState = null;
        run.engineApi.api.releaseFood(actor);
      }
      run.grabHold.set(actor, true);
      run.engineApi.tick(actor, dt, { ready: false });
      continue;
    }
    if (run.grabHold.get(actor)) {
      run.grabHold.delete(actor);
      ai.interrupted = false;
      ai.nextThink = 0;
      ai.hopState = null;
      ai.path = null;
      run.engineApi.resumeTask(actor);
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
      const step = Math.min(d, 2.0 * dt);
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
    const step = Math.min(d, 2.0 * dt);
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

function summarize(run) {
  const history = {};
  const skills = {};
  for (const actor of run.roster) {
    for (const event of actor.history || []) {
      history[event.kind] = (history[event.kind] || 0) + 1;
    }
    const initial = run.initialSkills.get(actor.uid);
    if (!initial || !actor.skills) continue;
    for (const [key, value] of Object.entries(actor.skills)) {
      const gain = Number(value) - Number(initial[key] || 0);
      if (gain > 0) skills[key] = (skills[key] || 0) + gain;
    }
  }
  return { history, skills };
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

function createRun({ race, seed, perturb = 0, engine = 'legacy', daySeconds = DAY_SECONDS, collectSamples = false, flowers = 0, social = false, seedBonds = false, startHour = START_HOUR, allAdults = false, rngValue = null, populationCap = POPULATION_CAP, traits = null, personality = false, mood = false }) {
  const world = createWorld({ flowers });
  const roster = createRoster(race, perturb, { social, seedBonds, allAdults, traits });
  const traced = tracedRng(seed);
  const clock = { seconds: 0 };
  const config = (personality || mood)
    ? createBehaviorConfig({ features: { personality, mood } })
    : null;
  const engineApi = createBehavior({
    engine,
    config,
    field: world,
    getActors: () => roster,
    getHours: () => clockAt(clock.seconds, daySeconds, startHour).hours,
    getDay: () => clockAt(clock.seconds, daySeconds, startHour).day,
    getPopulationCap: () => populationCap,
    rng: Number.isFinite(rngValue) ? () => rngValue : traced.rng,
  });
  engineApi.registerAdapter('softbody', createSoftAdapter());
  engineApi.registerAdapter('skinned', createGlassAdapter());
  for (const actor of roster) engineApi.attach(actor);
  const run = {
    race, seed, engine, world, roster, engineApi, traced, daySeconds, collectSamples, clock, startHour,
    rngValue, populationCap,
    transitions: [], samples: [], warnings: [], lastState: new Map(), grabHold: new Map(),
    life: { pregnancies: 0, births: 0, stageUps: 0, blockedBirths: 0 }, nextBirthUid: 1000,
    pregnancySeen: new Set(),
    initialSkills: new Map(roster.map(actor => [actor.uid, { ...(actor.skills || {}) }])),
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
  for (const actor of run.roster) {
    if (actor.pregnant) {
      if (!run.pregnancySeen.has(actor.uid)) {
        run.pregnancySeen.add(actor.uid);
        run.life.pregnancies++;
      }
    } else {
      run.pregnancySeen.delete(actor.uid);
    }
  }
  const t = +run.clock.seconds.toFixed(6);
  for (const actor of run.roster) {
    const state = actor.ai ? actor.ai.state : null;
    const previous = before.get(actor.uid);
    if (state !== previous) {
      run.transitions.push({ t, uid: actor.uid, from: previous, to: state,
        task: actor.ai && actor.ai.familyTask ? actor.ai.familyTask.id : null });
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
  social = false,
  seedBonds = false,
  hooks = [],
  startHour = START_HOUR,
  allAdults = false,
  rngValue = null,
  populationCap = POPULATION_CAP,
} = {}) {
  const a = createRun({ race, seed, engine: engineA, daySeconds, collectSamples: verbose, flowers, social, seedBonds, startHour, allAdults, rngValue, populationCap });
  const b = createRun({ race, seed, engine: engineB, perturb, daySeconds, collectSamples: verbose, flowers, social, seedBonds, startHour, allAdults, rngValue, populationCap });
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
      for (const hook of hooks) {
        const hit = hook.every ? (tick + 1) % hook.every === 0 : hook.at === tick + 1;
        if (!hit) continue;
        hook.run(a);
        hook.run(b);
      }
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
          life: b.life, roster: b.roster.length,
          summary: summarize(b),
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
    life: b.life, roster: b.roster.length,
    summary: summarize(b),
    diffs: [],
    durationMs: Date.now() - started,
    transitions: verbose ? b.transitions : undefined,
    transitionLogA: verbose ? a.transitions : undefined,
    transitionLogB: verbose ? b.transitions : undefined,
    samples: verbose ? b.samples : undefined,
  };
}

/* ------------------------------------------------------- personality packs */

export function runTraitScenario({
  race = 'bear', traits = null, days = 2, seed = 1,
  allAdults = false, resetEvery = 0, resetHunger = null, resetSocial = null,
} = {}) {
  const run = createRun({
    race, seed, engine: 'modules', personality: true, traits, allAdults,
  });
  const ticks = Math.round(days * DAY_SECONDS / DT);
  const last = new Map(run.roster.map(actor => [actor.uid, [actor.cx, actor.cz]]));
  const perActor = new Map(run.roster.map(actor => [actor.uid, 0]));
  const reset = () => {
    for (const actor of run.roster) {
      if (!actor.active || !actor.ai) continue;
      const ai = actor.ai;
      ai.state = 'wander';
      ai.familyTask = null;
      ai.partner = null;
      ai.follow = null;
      ai.directives.length = 0;
      ai.directive = null;
      ai.target = null;
      ai.path = null;
      ai.pathIndex = 0;
      ai.moving = false;
      ai.source = null;
      ai.taskCooldown = 0;
      ai.familyPlayCooldown = 0;
      ai.socialCooldown = 0;
      ai.conflictCooldown = 0;
      ai.nextThink = 0;
      actor.sleeping = false;
      actor.inside = false;
      actor.grabs = 0;
      actor.inPond = false;
      actor.thirst = .2;
      actor.energy = 1;
      actor.health = 100;
      if (Number.isFinite(resetHunger)) actor.hunger = resetHunger;
      if (Number.isFinite(resetSocial)) {
        actor.social = resetSocial;
        actor.affection = resetSocial;
      }
    }
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let tick = 0; tick < ticks; tick++) {
      if (resetEvery && tick % resetEvery === 0) reset();
      hostTick(run, DT);
      for (const actor of run.roster) {
        if (!actor.active) continue;
        const [x, z] = last.get(actor.uid) || [actor.cx, actor.cz];
        perActor.set(actor.uid, (perActor.get(actor.uid) || 0) + Math.hypot(actor.cx - x, actor.cz - z));
        last.set(actor.uid, [actor.cx, actor.cz]);
      }
    }
  } finally {
    console.warn = warn;
  }
  const summary = summarize(run);
  return {
    race, seed, days,
    distance: +[...perActor.values()].reduce((sum, value) => sum + value, 0).toFixed(2),
    distancePerActor: +([...perActor.values()].reduce((sum, value) => sum + value, 0) /
      Math.max(1, perActor.size)).toFixed(2),
    life: run.life,
    roster: run.roster.length,
    summary,
    coverage: typeof run.engineApi.coverage === 'function' ? run.engineApi.coverage() : null,
  };
}

export function runPersonalityBaseline({ race = 'bear', days = 20, seed = 1 } = {}) {
  const run = createRun({ race, seed, engine: 'modules', personality: true });
  const rows = new Map();
  const previous = new Map();
  const positions = new Map();
  for (const actor of run.roster) {
    if (!actor.active) continue;
    rows.set(actor.uid, {
      uid: actor.uid,
      traits: { ...(actor.traits || {}) },
      socialEntries: 0,
      seekFoodOnsets: [],
      wanderDistance: 0,
    });
    previous.set(actor.uid, actor.ai ? actor.ai.state : null);
    positions.set(actor.uid, [actor.cx, actor.cz]);
  }
  const ticks = Math.round(days * DAY_SECONDS / DT);
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let tick = 0; tick < ticks; tick++) {
      hostTick(run, DT);
      for (const actor of run.roster) {
        if (!actor.active || !actor.ai) continue;
        const row = rows.get(actor.uid);
        if (!row) continue;
        const state = actor.ai.state;
        if (state === 'social' && previous.get(actor.uid) !== 'social') row.socialEntries += 1;
        if (state === 'seekFood' && previous.get(actor.uid) !== 'seekFood') {
          row.seekFoodOnsets.push(actor.hunger);
        }
        const [x, z] = positions.get(actor.uid) || [actor.cx, actor.cz];
        if (state === 'wander') row.wanderDistance += Math.hypot(actor.cx - x, actor.cz - z);
        positions.set(actor.uid, [actor.cx, actor.cz]);
        previous.set(actor.uid, state);
      }
    }
  } finally {
    console.warn = warn;
  }
  return { race, seed, days, actors: [...rows.values()] };
}

export function runMoodBaseline({ race = 'bear', days = 20, seed = 1 } = {}) {
  const run = createRun({ race, seed, engine: 'modules', mood: true });
  const rows = new Map();
  for (const actor of run.roster) {
    if (!actor.active) continue;
    rows.set(actor.uid, { uid: actor.uid, species: actor.species, values: [] });
  }
  const ticks = Math.round(days * DAY_SECONDS / DT);
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let tick = 0; tick < ticks; tick++) {
      hostTick(run, DT);
      if (tick % 20 === 0) {
        for (const actor of run.roster) {
          if (!actor.active || !actor.ai) continue;
          const row = rows.get(actor.uid);
          if (!row) continue;
          row.values.push(+number(actor.ai.mood).toFixed(3));
        }
      }
    }
  } finally {
    console.warn = warn;
  }
  return { race, seed, days, actors: [...rows.values()] };
}

export function runMoodScenario({ race = 'bear', mode = 'content', days = 2, seed = 1 } = {}) {
  const run = createRun({ race, seed, engine: 'modules', mood: true, allAdults: true });
  const ticks = Math.round(days * DAY_SECONDS / DT);
  const per = new Map(run.roster.map(actor => [actor.uid, {
    uid: actor.uid,
    distance: 0,
    social: 0,
    seekFood: 0,
    stargaze: 0,
    mood: 0,
  }]));
  const previous = new Map();
  const positions = new Map();
  const reset = () => {
    for (const actor of run.roster) {
      const ai = actor.ai;
      if (!ai) continue;
      ai.state = 'wander';
      ai.familyTask = null;
      ai.partner = null;
      ai.follow = null;
      ai.directives.length = 0;
      ai.directive = null;
      ai.target = null;
      ai.path = null;
      ai.moving = false;
      ai.source = null;
      ai.taskCooldown = 0;
      ai.familyPlayCooldown = 0;
      ai.socialCooldown = 0;
      ai.conflictCooldown = 0;
      ai.nextThink = 0;
      actor.sleeping = false;
      actor.inside = false;
      actor.grabs = 0;
      actor.inPond = false;
      if (mode === 'unhappy') {
        actor.hunger = .92;
        actor.thirst = .90;
        actor.health = 20;
        actor.energy = .15;
        actor.social = .10;
        actor.affection = .10;
        actor.bonds = {};
      } else {
        actor.hunger = .20;
        actor.thirst = .20;
        actor.health = 100;
        actor.energy = 1;
        actor.social = .90;
        actor.affection = .85;
        actor.bonds = {};
        for (const other of run.roster) {
          if (other.uid !== actor.uid) actor.bonds[String(other.uid)] = .70;
        }
      }
    }
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let tick = 0; tick < ticks; tick++) {
      if (tick % 100 === 0) reset();
      hostTick(run, DT);
      for (const actor of run.roster) {
        if (!actor.active || !actor.ai) continue;
        const row = per.get(actor.uid);
        if (!row) continue;
        const state = actor.ai.state;
        const [x, z] = positions.get(actor.uid) || [actor.cx, actor.cz];
        if (state === 'wander') row.distance += Math.hypot(actor.cx - x, actor.cz - z);
        if (state === 'social' && previous.get(actor.uid) !== 'social') row.social += 1;
        if (state === 'seekFood' && previous.get(actor.uid) !== 'seekFood') row.seekFood += 1;
        if (state === 'stargaze' && previous.get(actor.uid) !== 'stargaze') row.stargaze += 1;
        row.mood = actor.ai.mood || 0;
        positions.set(actor.uid, [actor.cx, actor.cz]);
        previous.set(actor.uid, state);
      }
    }
  } finally {
    console.warn = warn;
  }
  return {
    race, seed, days, mode,
    actors: [...per.values()],
    distance: +[...per.values()].reduce((sum, row) => sum + row.distance, 0).toFixed(2),
    social: [...per.values()].reduce((sum, row) => sum + row.social, 0),
    seekFood: [...per.values()].reduce((sum, row) => sum + row.seekFood, 0),
    stargaze: [...per.values()].reduce((sum, row) => sum + row.stargaze, 0),
    mood: +([...per.values()].reduce((sum, row) => sum + row.mood, 0) /
      Math.max(1, per.size)).toFixed(3),
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

const BEAR_STATES = Object.freeze(['wander', 'seekFood', 'eat', 'seekWater', 'drink', 'seekHive',
  'raidHive', 'flee', 'seekHome', 'sleep', 'seekCompany', 'invite', 'social', 'decline', 'visit',
  'seekConflict', 'conflict', 'seekMate', 'mate', 'follow', 'familyTask', 'seekSocial']);
const ALL_RACE_STATES = Object.freeze({
  bear: BEAR_STATES,
  gummy: BEAR_STATES,
  glass: Object.freeze(['wander', 'seekFood', 'eat', 'seekWater', 'drink', 'seekHome', 'sleep',
    'seekCompany', 'invite', 'social', 'decline', 'visit', 'seekMate', 'mate', 'follow',
    'familyTask', 'stargaze', 'seekSocial', 'exit']),
});

function raceStates(race) {
  return ALL_RACE_STATES[race] || ALL_RACE_STATES.bear;
}

const BEAR_ONLY = new Set(['hive.seek', 'conflict.critical', 'conflict.fallback']);
const GLASS_ONLY = new Set(['stargaze']);
const KNOWN_OPPORTUNITIES = Object.freeze([
  'water.critical', 'forage.critical', 'water.seek', 'hive.seek', 'forage.seek',
  'mate.seek', 'social.company', 'wander.arrive', 'wander.target',
]);
const KNOWN_PIPELINE = Object.freeze([
  'meal', 'conflict.critical', 'conflict.fallback', 'lesson', 'playdate',
  'follow', 'familyPlaymate', 'stargaze',
]);

function applicable(race, id) {
  if (!race) return true;
  if (BEAR_ONLY.has(id)) return race === 'bear' || race === 'gummy';
  if (GLASS_ONLY.has(id)) return race === 'glass';
  return true;
}

export function mergeCoverage(results) {
  const states = {};
  const entries = {};
  const opportunities = {};
  const taskPhases = {};
  const tasks = {};
  const taskEntries = {};
  const pipeline = {};
  const conflictOutcomes = {};
  const stargazeHours = {};
  const fleeOutcomes = {};
  const add = (target, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      target[key] = (target[key] || 0) + value;
    }
  };
  for (const result of results) {
    const coverage = result && result.coverage;
    if (!coverage) continue;
    add(states, coverage.states);
    add(entries, coverage.entries);
    add(opportunities, coverage.opportunities);
    add(taskPhases, coverage.taskPhases);
    add(tasks, coverage.tasks);
    add(taskEntries, coverage.taskEntries);
    add(pipeline, coverage.pipeline);
    add(conflictOutcomes, coverage.conflictOutcomes);
    add(stargazeHours, coverage.stargazeHours);
    add(fleeOutcomes, coverage.fleeOutcomes);
  }
  return { states, entries, opportunities, taskPhases, tasks, taskEntries, pipeline, conflictOutcomes, stargazeHours, fleeOutcomes };
}

function coverageSection(merged, title, race = null) {
  const named = race ? raceStates(race) : KNOWN_STATES;
  const stateNames = [...new Set([...named, ...Object.keys(merged.entries)])]
    .filter(state => !race || named.includes(state))
    .sort();
  const lowStates = stateNames
    .filter(state => (merged.entries[state] || 0) < LOW_COVERAGE);
  const lines = [title];
  for (const state of stateNames) {
    const entries = merged.entries[state] || 0;
    const ticks = merged.states[state] || 0;
    lines.push(`  ${state.padEnd(14)} ${String(entries).padStart(7)} entries ${String(ticks).padStart(9)} ticks${entries < LOW_COVERAGE ? '  LOW' : ''}`);
  }
  lines.push('  opportunities (times selected)');
  const opportunityNames = [...new Set([...KNOWN_OPPORTUNITIES, ...Object.keys(merged.opportunities)])]
    .filter(id => applicable(race, id)).sort();
  const lowOpps = [];
  for (const id of opportunityNames) {
    const hits = merged.opportunities[id] || 0;
    if (hits < LOW_COVERAGE) lowOpps.push(id);
    lines.push(`    ${id.padEnd(18)} ${String(hits).padStart(7)}${hits < LOW_COVERAGE ? '  LOW' : ''}`);
  }
  lines.push('  pipeline slots (inline, not opportunity objects)');
  const pipelineNames = [...new Set([...KNOWN_PIPELINE, ...Object.keys(merged.pipeline || {})])]
    .filter(id => applicable(race, id)).sort();
  const lowPipeline = [];
  for (const id of pipelineNames) {
    const hits = merged.pipeline?.[id] || 0;
    if (hits < LOW_COVERAGE) lowPipeline.push(id);
    lines.push(`    ${id.padEnd(18)} ${String(hits).padStart(7)}${hits < LOW_COVERAGE ? '  LOW' : ''}`);
  }
  lines.push('  conflict outcomes');
  for (const id of Object.keys(merged.conflictOutcomes || {}).sort()) {
    lines.push(`    ${id.padEnd(18)} ${String(merged.conflictOutcomes[id] || 0).padStart(7)}`);
  }
  const stargazeHours = Object.entries(merged.stargazeHours || {}).sort(([a], [b]) => a.localeCompare(b));
  if (stargazeHours.length) {
    lines.push('  stargaze by hour: ' +
      stargazeHours.map(([key, hits]) => `${key}=${hits}`).join(', '));
  }
  if (merged.fleeOutcomes && Object.keys(merged.fleeOutcomes).length) {
    lines.push('  flee outcomes: ' + Object.entries(merged.fleeOutcomes)
      .map(([key, hits]) => `${key}=${hits}`).join(', '));
  }
  const travel = merged.taskPhases.travel || 0;
  const act = merged.taskPhases.act || 0;
  lines.push(`  familyTask time: travel ${travel} ticks, act ${act} ticks`);
  const taskNames = [...new Set([...Object.keys(merged.tasks), ...Object.keys(merged.taskEntries)])].sort();
  for (const id of taskNames) {
    lines.push(`    ${id.padEnd(18)} ${String(merged.taskEntries[id] || 0).padStart(6)} entries ${String(merged.tasks[id] || 0).padStart(8)} ticks`);
  }
  lines.push(`  LOW (<${LOW_COVERAGE}) states: ${lowStates.join(', ') || 'none'}`);
  lines.push(`  LOW (<${LOW_COVERAGE}) opportunities: ${lowOpps.join(', ') || 'none'}`);
  lines.push(`  LOW (<${LOW_COVERAGE}) pipeline slots: ${lowPipeline.join(', ') || 'none'}`);
  return { text: lines.join('\n'), lowStates, lowOpportunities: lowOpps, lowPipeline };
}

export function formatCoverage(results) {
  const grouped = new Map();
  for (const result of results) {
    const race = result && result.race ? result.race : 'unknown';
    if (!grouped.has(race)) grouped.set(race, []);
    grouped.get(race).push(result);
  }
  const byRace = {};
  const sections = [];
  for (const race of [...grouped.keys()].sort()) {
    const merged = mergeCoverage(grouped.get(race));
    const section = coverageSection(merged, `COVERAGE ${race} (module engine; entries/ticks per state)`, race);
    byRace[race] = merged;
    sections.push(section.text);
  }
  const merged = mergeCoverage(results);
  const aggregate = coverageSection(merged, 'COVERAGE all races');
  return {
    merged,
    byRace,
    lowStates: aggregate.lowStates,
    lowOpportunities: aggregate.lowOpportunities,
    lowPipeline: aggregate.lowPipeline,
    text: [...sections, aggregate.text].join('\n\n'),
  };
}

/* -------------------------------------------------------------------- cli */

function lessonPack(run) {
  const teacher = run.roster[0];
  const student = run.roster[4];
  if (!teacher || !student || !teacher.ai || !student.ai) return;
  teacher.stage = 'adult';
  teacher.skills = { ...(teacher.skills || {}), forage: .90 };
  student.stage = 'baby';
  student.parentUids = [teacher.uid];
  student.skills = { ...(student.skills || {}), forage: .10 };
  teacher.cx = 0; teacher.cz = 0;
  student.cx = .5; student.cz = 0;
  teacher.sleeping = false;
  student.sleeping = false;
  teacher.inside = false;
  student.inside = false;
  teacher.grabs = 0;
  student.grabs = 0;
  teacher.hunger = .3;
  student.hunger = .3;
  teacher.health = 100;
  student.health = 100;
  teacher.ai.state = 'wander';
  student.ai.state = 'wander';
  teacher.ai.taskCooldown = 0;
  teacher.ai.partner = null;
  student.ai.partner = null;
  student.ai.directive = null;
  run.engineApi.forceLesson(teacher, student);
}

const RACES = ['bear', 'gummy', 'glass'];

// Engine-level save/rebuild: detach clears ai and releases claims; actor fields
// (needs, bonds, history, playdates, pregnancy) survive. A fresh engine attaches
// over the same roster, standing in for a save -> load -> continue.
function rebuildRun(run) {
  for (const actor of run.roster) run.engineApi.detach(actor);
  const clock = run.clock;
  const engineApi = createBehavior({
    engine: run.engine,
    field: run.world,
    getActors: () => run.roster,
    getHours: () => clockAt(clock.seconds, run.daySeconds, run.startHour).hours,
    getDay: () => clockAt(clock.seconds, run.daySeconds, run.startHour).day,
    getPopulationCap: () => run.populationCap || POPULATION_CAP,
    rng: Number.isFinite(run.rngValue) ? () => run.rngValue : run.traced.rng,
  });
  engineApi.registerAdapter('softbody', createSoftAdapter());
  engineApi.registerAdapter('skinned', createGlassAdapter());
  for (const actor of run.roster) engineApi.attach(actor);
  run.engineApi = engineApi;
}

// The open world never produces this many mating cycles (pregnancy blocks the
// only adult pair), so the mate pack restores eligibility on a fixed cadence.
function resetMating(run) {
  for (const actor of run.roster) {
    if (actor.stage !== 'adult') continue;
    actor.pregnant = false;
    actor.gestation = 0;
    actor.mateCooldown = 0;
    actor.birthRetryT = 0;
  }
}

// Alternate critical hunger/thirst while moving so both critical-need
// opportunities are exercised (water.critical at order 10, forage.critical at 11).
function criticalNeeds(run) {
  const actor = run.roster[0];
  if (!actor || !actor.ai) return;
  actor.sleeping = false;
  actor.ai.state = 'wander';
  actor.ai.taskCooldown = 0;
  actor.ai.idleT = 0;
  actor.ai.moving = true;
  actor.ai.target = { x: actor.cx + 2, z: actor.cz };
  actor.ai.path = [{ x: actor.cx + 2, z: actor.cz }];
  actor.ai.pathIndex = 0;
  run.scenarioFlip = !run.scenarioFlip;
  if (run.scenarioFlip) actor.thirst = .95;
  else actor.hunger = .95;
}

// Claim every flower but the contested one, then alternate critical (45) and
// fallback (55) hunger so both conflict slots run.
function conflictNeeds(run) {
  const actor = run.roster[0];
  const other = run.roster[1];
  const blocker = run.roster[2];
  if (!actor || !other || !blocker || !actor.ai || !other.ai) return;
  const sources = run.world.food.sources.filter(source => source.kind === 'flower' && source.ripe);
  if (!sources.length) return;
  for (const source of sources) source.claim = null;
  const target = sources[0];
  for (const source of sources.slice(1)) source.claim = blocker;
  target.claim = other;
  actor.cx = target.approachX + .4;
  actor.cz = target.approachZ;
  other.cx = target.approachX;
  other.cz = target.approachZ;
  actor.sleeping = false;
  other.sleeping = false;
  actor.health = 20;
  other.health = 100;
  actor.thirst = .2;
  actor.ai.state = 'wander';
  other.ai.state = 'wander';
  actor.ai.taskCooldown = 0;
  actor.ai.idleT = 0;
  actor.ai.moving = false;
  actor.ai.source = null;
  actor.ai.waterSpot = null;
  actor.ai.target = null;
  actor.ai.path = null;
  actor.ai.partner = null;
  actor.ai.conflictCooldown = 0;
  actor.ai.socialCooldown = 0;
  actor.ai.avoidSourceId = null;
  actor.ai.avoidSourceT = 0;
  other.ai.state = 'wander';
  other.ai.partner = null;
  other.ai.conflictT = 0;
  other.ai.conflictCooldown = 0;
  other.ai.moving = false;
  other.ai.source = null;
  other.ai.target = null;
  other.ai.path = null;
  other.grabs = 0;
  other.inPond = false;
  run.conflictFlip = !run.conflictFlip;
  actor.hunger = run.conflictFlip ? .95 : .80;
}

function conflictOutcomes(run) {
  const actor = run.roster[0];
  const other = run.roster[1];
  if (!actor || !other || !actor.ai || !other.ai) return;
  const source = run.world.food.sources.find(item => item.kind === 'flower' && item.ripe);
  if (!source) return;
  for (const item of run.world.food.sources) item.claim = null;
  source.claim = other;
  actor.cx = source.approachX + .3;
  actor.cz = source.approachZ;
  other.cx = source.approachX;
  other.cz = source.approachZ;
  actor.health = 100;
  other.health = 100;
  actor.hunger = .8;
  other.hunger = .8;
  actor.scale = 1;
  other.scale = 1;
  actor.bold = .5;
  other.bold = .5;
  actor.energy = 1;
  other.energy = 1;
  actor.pregnant = false;
  other.pregnant = false;
  actor.mateCooldown = 999;
  other.mateCooldown = 999;
  actor.sleeping = false;
  other.sleeping = false;
  actor.ai.state = 'wander';
  other.ai.state = 'wander';
  actor.ai.partner = null;
  other.ai.partner = null;
  actor.ai.conflictT = 0;
  other.ai.conflictT = 0;
  actor.ai.conflictCooldown = 0;
  other.ai.conflictCooldown = 0;
  actor.ai.taskCooldown = 0;
  actor.ai.idleT = 0;
  actor.ai.moving = false;
  other.ai.moving = false;
  run.conflictMode = ((run.conflictMode || 0) + 1) % 4;
  const mode = run.scenarioTie ? 2 : run.conflictMode;
  if (mode === 0) {
    actor.scale = 1.5;
    other.scale = .7;
    run.engineApi.forceConflict(actor, other, source);
  } else if (mode === 1) {
    actor.scale = .7;
    other.scale = 1.5;
    run.engineApi.forceConflict(actor, other, source);
  } else if (mode === 2) {
    const profile = run.engineApi.api.profile(actor);
    other.hunger = actor.hunger + profile.needs.hungerRate * (1 / 20);
    other.energy = actor.energy - profile.needs.energyRate * (1 / 20);
    run.engineApi.forceConflict(actor, other, source);
  } else {
    other.health = 10;
    actor.hunger = .8;
    run.engineApi.api.acquireContest(actor);
  }
}

// Dedicated packs for branches the open-world long run does not reach often.
// Mate needs a rich larder (MATE_FOOD_MIN is 18 safe sources); the fixture world
// starts with 8 flowers, so mate is unreachable without this pack.
export const SCENARIOS = Object.freeze({
  grab: Object.freeze({
    id: 'grab', label: 'grab and resume', days: 1,
    hooks: Object.freeze([
      { at: 300, run: (run) => run.engineApi.onGrab(run.roster[0]) },
      { at: 340, run: (run) => run.engineApi.onRelease(run.roster[0]) },
    ]),
  }),
  pond: Object.freeze({
    id: 'pond', label: 'pond interrupt and resume', days: 1,
    hooks: Object.freeze([
      { at: 300, run: (run) => { run.roster[0].inPond = true; } },
      { at: 340, run: (run) => { run.roster[0].inPond = false; } },
    ]),
  }),
  disable: Object.freeze({
    id: 'disable', label: 'AI disable and enable', days: 1,
    hooks: Object.freeze([
      { at: 300, run: (run) => run.engineApi.setEnabled(false) },
      { at: 340, run: (run) => run.engineApi.setEnabled(true) },
    ]),
  }),
  possess: Object.freeze({
    id: 'possess', label: 'possession suspend and resume', days: 1,
    hooks: Object.freeze([
      { at: 300, run: (run) => { run.roster[0].ai.possessed = true; } },
      { at: 340, run: (run) => { run.roster[0].ai.possessed = false; } },
    ]),
  }),
  critical: Object.freeze({
    id: 'critical', label: 'critical need interrupts social', days: 1,
    hooks: Object.freeze([
      { at: 300, run: (run) => {
        run.engineApi.forceSocial(run.roster[0], run.roster[1], true);
        run.roster[0].hunger = .95;
        run.roster[1].hunger = .95;
      } },
    ]),
  }),
  save: Object.freeze({
    id: 'save', label: 'detach, rebuild engine and continue', days: 1,
    hooks: Object.freeze([
      { at: 300, run: rebuildRun },
    ]),
  }),
  criticalNeeds: Object.freeze({
    id: 'criticalNeeds', label: 'critical hunger/thirst while moving', days: 1,
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    hooks: Object.freeze([{ every: 200, run: criticalNeeds }]),
    requireOpportunities: ['water.critical', 'forage.critical'],
  }),
  conflictNeeds: Object.freeze({
    id: 'conflictNeeds', label: 'contested food: critical and fallback', days: 1,
    seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    startHour: 10, skipRaces: ['glass'],
    hooks: Object.freeze([{ every: 100, run: conflictNeeds }]),
    requirePipeline: ['conflict.critical', 'conflict.fallback'],
  }),
  conflictOutcomes: Object.freeze({
    id: 'conflictOutcomes', label: 'conflict win/loss/tie/health-floor', days: 1,
    seeds: [1, 2, 3, 4, 5],
    startHour: 10, skipRaces: ['glass'], rngValue: .5,
    hooks: Object.freeze([{ every: 100, run: conflictOutcomes }]),
    requireConflictOutcomes: ['actor', 'opponent', 'tie', 'healthFloor'],
  }),
  conflictTie: Object.freeze({
    id: 'conflictTie', label: 'conflict tie every hook', days: 1,
    seeds: [1, 2, 3, 4, 5], startHour: 10, skipRaces: ['glass'], rngValue: .5,
    hooks: Object.freeze([{ every: 100, run: (run) => { run.scenarioTie = true; conflictOutcomes(run); } }]),
    requireConflictOutcomes: ['tie'],
  }),
  lessonPack: Object.freeze({
    id: 'lessonPack', label: 'completed lessons and skill gain', days: 1,
    seeds: [1, 2, 3, 4, 5], startHour: 10,
    hooks: Object.freeze([{ every: 200, run: lessonPack }]),
    requireHistory: { lesson: 20, taught: 20 },
  }),
  social: Object.freeze({
    id: 'social', label: 'social chain and visits', days: 10, seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    social: true, seedBonds: true, startHour: 10, require: 'visit',
  }),
  mate: Object.freeze({
    id: 'mate', label: 'mate (rich food, rested adults)', days: 10, seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    flowers: 28, require: 'mate', allAdults: true,
    hooks: Object.freeze([{ every: 1800, run: resetMating }]),
  }),
  glassBaseline: Object.freeze({
    id: 'glassBaseline', label: 'Glass without the 40-population cap', days: 5,
    seeds: [1, 2, 3], populationCap: 80,
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
    social: false, seedBonds: false, hooks: [], scenarioRequire: null,
    startHour: 6, allAdults: false, rngValue: null, populationCap: POPULATION_CAP,
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
    else if (arg === '--cap') options.populationCap = Math.max(1, Number(value()));
    else if (arg.startsWith('--cap=')) options.populationCap = Math.max(1, Number(arg.slice(6)));
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
      options.flowers = scenario.flowers || 0;
      options.social = !!scenario.social;
      options.seedBonds = !!scenario.seedBonds;
      options.allAdults = !!scenario.allAdults;
      options.rngValue = Number.isFinite(scenario.rngValue) ? scenario.rngValue : null;
      options.hooks = scenario.hooks ? scenario.hooks.slice() : [];
      options.scenarioRequire = scenario.require || null;
      options.startHour = Number.isFinite(scenario.startHour) ? scenario.startHour : 6;
      if (Number.isFinite(scenario.populationCap)) options.populationCap = scenario.populationCap;
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
  --cap N                   population cap (default 40; Glass baseline uses 80)
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
        social: options.social, seedBonds: options.seedBonds, hooks: options.hooks,
        startHour: options.startHour, allAdults: options.allAdults,
        rngValue: options.rngValue, populationCap: options.populationCap,
      });
      results.push(result);
      if (!options.json) {
        const status = result.ok ? 'PASS' : 'DIFF';
        console.log(`${status} ${race} seed ${seed}: ${result.ticks} ticks, ` +
          `${result.transitionsA}/${result.transitionsB} transitions, ` +
          `${result.drawsA}/${result.drawsB} rng draws, ` +
          `${result.warningsA}/${result.warningsB} warnings, ${result.durationMs} ms`);
        if (result.life) {
          console.log(`  life: pregnancies ${result.life.pregnancies}, births ${result.life.births}, ` +
            `blocked ${result.life.blockedBirths}, stage-ups ${result.life.stageUps}, roster ${result.roster}`);
        }
        if (result.summary) {
          const history = Object.entries(result.summary.history).map(([k, v]) => `${k}=${v}`).join(', ');
          const skills = Object.entries(result.summary.skills).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ');
          console.log(`  history: ${history || 'none'}; skills: ${skills || 'none'}`);
        }
        for (const diff of result.diffs.slice(0, 3)) console.log(`  ${formatDiff(diff)}`);
      }
    }
  }
  const parityOk = results.every(result => result.ok);
  const coverage = (options.coverage || options.scenario) ? formatCoverage(results) : null;
  if (options.scenario) {
    const scenario = SCENARIOS[options.scenario];
    let scenarioOk = true;
    const check = (kind, key) => {
      const hits = {};
      const skip = scenario.skipRaces || [];
      for (const race of options.races) {
        if (skip.includes(race)) { hits[race] = 'n/a'; continue; }
        const merged = coverage.byRace[race] || {};
        const source = kind === 'state' ? merged.entries
          : kind === 'opportunity' ? merged.opportunities
            : kind === 'conflictOutcome' ? merged.conflictOutcomes
              : merged.pipeline;
        hits[race] = source?.[key] || 0;
        if (hits[race] < LOW_COVERAGE) scenarioOk = false;
      }
      console.log(`SCENARIO ${scenario.id} required ${key}: ` +
        Object.entries(hits).map(([race, n]) => `${race} ${n}`).join(', '));
    };
    if (scenario.require) check('state', scenario.require);
    for (const key of scenario.requireOpportunities || []) check('opportunity', key);
    for (const key of scenario.requirePipeline || []) check('pipeline', key);
    for (const key of scenario.requireConflictOutcomes || []) check('conflictOutcome', key);
    if (scenario.requireHistory) {
      for (const [kind, minimum] of Object.entries(scenario.requireHistory)) {
        const hits = {};
        for (const race of options.races) {
          hits[race] = results
            .filter(result => result.race === race)
            .reduce((sum, result) => sum + ((result.summary?.history?.[kind]) || 0), 0);
          if (hits[race] < minimum) scenarioOk = false;
        }
        console.log(`SCENARIO ${scenario.id} completed ${kind}: ` +
          Object.entries(hits).map(([race, n]) => `${race} ${n}`).join(', '));
      }
    }
    if (!scenario.require && !scenario.requireOpportunities && !scenario.requirePipeline &&
        !scenario.requireConflictOutcomes && !scenario.requireHistory) {
      console.log(`SCENARIO ${scenario.id} (${scenario.label}) parity pack`);
    }
    if (!scenarioOk) console.log('SCENARIO COVERAGE FAIL: a required branch is under ' + LOW_COVERAGE);
    options.scenarioOk = scenarioOk;
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
