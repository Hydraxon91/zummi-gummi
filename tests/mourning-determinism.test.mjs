import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld, createRoster, mulberry32 } from '../scripts/behavior-parity.mjs';
import {
  addMourning, comfortMourning, mourningLabel, mourningMood, pruneMourning,
} from '../src/behaviors/mourning.js';

const DAY_SECONDS = 120;
const DT = .5;

function fakeAdapter() {
  return {
    sleeps: false,
    onStop: () => {},
    onSleep: () => {},
    onWake: () => {},
    sleepDone: () => true,
    preTick: () => {},
    preNeeds: () => false,
    hungerOpportunity: () => false,
    idleOpportunity: () => false,
    tickState: () => false,
  };
}

function clockAt(seconds) {
  const total = 6 + seconds / DAY_SECONDS * 24;
  return { day: 1 + Math.floor(total / 24), hours: total % 24 };
}

// A quick seeded actor run with mourning and mood enabled. `depart` removes one
// bonded adult through the stars trigger so the survivor carries real grief.
function run({ seed = 7, ticks = 1500, depart = false, record = false, mood = true } = {}) {
  const world = createWorld();
  const roster = createRoster('bear', 0, { seedBonds: true, allAdults: true });
  const next = mulberry32(seed);
  let draws = 0;
  const rng = () => { draws++; return next(); };
  const clock = { seconds: 0 };
  const config = createBehaviorConfig({ features: { mourning: true, mood } });
  const engine = createBehavior({
    engine: 'modules',
    config,
    field: world,
    getActors: () => roster,
    getHours: () => clockAt(clock.seconds).hours,
    getDay: () => clockAt(clock.seconds).day,
    getPopulationCap: () => 40,
    rng,
  });
  engine.registerAdapter('softbody', fakeAdapter());
  for (const actor of roster) engine.attach(actor);

  if (record) {
    addMourning(roster[0], { uid: 999, name: 'absent', species: 'bear' }, { day: 1, hours: 6 });
  }
  let departure = null;
  if (depart) {
    const departed = roster[1];
    departure = {
      added: engine.api.mournDeparture(departed, { cause: 'stars', reason: 'oldAge' }),
      survivor: engine.api.mourning(roster[0]),
      target: mood ? engine.api.mood(roster[0])?.target : null,
    };
    roster.splice(roster.indexOf(departed), 1);
  }

  const trace = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let tick = 0; tick < ticks; tick++) {
      clock.seconds += DT;
      for (const actor of roster) engine.tick(actor, DT);
      trace.push(roster.map(actor => ({
        uid: actor.uid,
        state: actor.ai ? actor.ai.state : null,
        hunger: +actor.hunger.toFixed(6),
        thirst: +actor.thirst.toFixed(6),
        energy: +actor.energy.toFixed(6),
        social: +actor.social.toFixed(6),
        affection: +actor.affection.toFixed(6),
        health: +actor.health.toFixed(6),
        mood: actor.ai && Number.isFinite(actor.ai.mood) ? +actor.ai.mood.toFixed(6) : null,
        bucket: actor.ai && Number.isFinite(actor.ai.moodBucket) ? actor.ai.moodBucket : null,
        grief: actor.mourning
          ? actor.mourning.map(item => [item.uid, item.untilDay, item.lastComfortDay])
          : null,
      })));
    }
  } finally {
    console.warn = warn;
  }
  return { trace, draws, departure, roster };
}

test('enabled mourning is deterministic for the same seed and departure', () => {
  const first = run({ seed: 11, depart: true });
  const second = run({ seed: 11, depart: true });
  assert.equal(first.departure.added > 0, true);
  assert.deepEqual(first.departure.survivor, second.departure.survivor);
  assert.equal(first.departure.target < 0, true, 'mourning lowers the mood target');
  assert.equal(first.draws, second.draws);
  assert.deepEqual(first.trace, second.trace);

  const last = first.trace.at(-1);
  assert.equal(last.every(actor => actor.grief === null), true,
    'grief expires and is pruned within the traced window');
});

test('mourning helpers consume no Math.random', () => {
  const survivor = {
    uid: 1, active: true, kind: 'bear', species: 'bear', stage: 'adult', age: 700,
    hunger: .3, thirst: .3, energy: 1, social: .3, affection: .25, bold: .5,
    home: 'Home 1', parentUids: [], bonds: { 2: .8 }, skills: {}, playdates: {}, history: [],
  };
  const departed = { uid: 2, name: 'gone', species: 'bear' };
  const nativeRandom = Math.random;
  Math.random = () => { throw new Error('mourning consumed Math.random'); };
  try {
    assert.equal(addMourning(survivor, departed, { day: 1, hours: 6 }), true);
    assert.ok(mourningMood(survivor, { day: 1, hours: 7 }) > 0);
    assert.match(mourningLabel(survivor, { day: 1, hours: 7 }), /gone/);
    assert.equal(comfortMourning(survivor, {
      uid: 3, active: true, species: 'bear', bonds: { 1: .8 },
    }, { day: 1, hours: 8 }), true);
    assert.equal(pruneMourning(survivor, 30, 0), true);
  } finally {
    Math.random = nativeRandom;
  }
});

test('departure bookkeeping and mood reads do not draw from the engine RNG', () => {
  const world = createWorld();
  const roster = createRoster('bear', 0, { seedBonds: true, allAdults: true });
  let draws = 0;
  const next = mulberry32(5);
  const rng = () => { draws++; return next(); };
  const config = createBehaviorConfig({ features: { mourning: true, mood: true } });
  const engine = createBehavior({
    engine: 'modules', config, field: world, getActors: () => roster,
    getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40, rng,
  });
  engine.registerAdapter('softbody', fakeAdapter());
  for (const actor of roster) engine.attach(actor);

  const baseline = draws;
  assert.equal(engine.api.mournDeparture(roster[1], { cause: 'stars', reason: 'oldAge' }) > 0, true);
  const afterDeparture = draws;
  engine.api.mourning(roster[0]);
  engine.api.mourningLabel(roster[0]);
  engine.api.mood(roster[0]);
  assert.equal(afterDeparture, baseline);
  assert.equal(draws, baseline);
});

test('tick-time pruning with mood off leaves the RNG stream and trace untouched', () => {
  const control = run({ seed: 17, ticks: 300, record: false, mood: false });
  const grieving = run({ seed: 17, ticks: 300, record: true, mood: false });
  assert.equal(grieving.draws, control.draws);
  assert.deepEqual(grieving.trace, control.trace);
});
