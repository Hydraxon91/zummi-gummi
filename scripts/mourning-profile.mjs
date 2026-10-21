// CPU profile for enabled mourning. This is not a frame-time or FPS claim:
// it measures the mourning functions and the behavior engine with 40 actors.
// Run from the repo root: node scripts/mourning-profile.mjs
import { loadavg } from 'node:os';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld, createRoster } from './behavior-parity.mjs';
import {
  addMourning, mourningMood, pruneMourning,
} from '../src/behaviors/mourning.js';

const ACTORS = 40;
const TICKS = 200;
const DT = 1 / 20;
const BATCHES = 5;
const RECORD_COUNTS = [1, 8];
const DEPARTED = { uid: 9000, name: 'gone', species: 'bear' };

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const ms = value => +value.toFixed(3);
const us = value => +value.toFixed(4);

function makeRoster(records) {
  const base = createRoster('bear');
  return Array.from({ length: ACTORS }, (_, index) => {
    const source = base[index % base.length];
    const actor = {
      ...source,
      uid: index + 1,
      name: `bear-${index + 1}`,
      cx: (index % 8) * 2 - 7,
      cz: Math.floor(index / 8) * 2 - 4,
      bonds: {},
      history: [],
      playdates: {},
      parentUids: [...(source.parentUids || [])],
      skills: { ...(source.skills || {}) },
      ai: null,
    };
    for (let index = 0; index < records; index++) {
      const departed = { ...DEPARTED, uid: DEPARTED.uid + index };
      actor.bonds[String(departed.uid)] = .85;
      addMourning(actor, departed, { day: 1, hours: 6 });
    }
    return actor;
  });
}

function makeEngine(roster) {
  const config = createBehaviorConfig({ features: { mood: true, mourning: true } });
  return createBehavior({
    engine: 'modules',
    config,
    field: createWorld(),
    getActors: () => roster,
    getHours: () => 12,
    getDay: () => 1,
    getPopulationCap: () => ACTORS,
    rng: () => .5,
  });
}

function purePass(roster) {
  for (const actor of roster) {
    mourningMood(actor, { day: 1, hours: 7 });
    pruneMourning(actor, 1, 7);
  }
}

function engineHour(records) {
  const roster = makeRoster(records);
  const engine = makeEngine(roster);
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const actor of roster) engine.attach(actor);
    const started = performance.now();
    for (let tick = 0; tick < TICKS; tick++) {
      for (const actor of roster) engine.tick(actor, DT);
    }
    return performance.now() - started;
  } finally {
    console.warn = warn;
  }
}

const loadStart = loadavg().map(value => +value.toFixed(2));
const pure = {};
for (const records of [0, ...RECORD_COUNTS]) {
  const roster = makeRoster(records);
  const samples = [];
  for (let batch = 0; batch < BATCHES; batch++) {
    const started = performance.now();
    for (let pass = 0; pass < 500; pass++) purePass(roster);
    samples.push((performance.now() - started) / (500 * roster.length) * 1000);
  }
  pure[records === 0 ? 'control' : `${records}record`] = {
    usPerActorPass: us(median(samples)), samples: samples.map(us),
  };
}

const engine = {};
for (const records of [0, ...RECORD_COUNTS]) {
  const samples = [];
  for (let batch = 0; batch < BATCHES; batch++) samples.push(engineHour(records));
  engine[records === 0 ? 'noRecords' : `${records}record`] = {
    msPerSimHour: ms(median(samples)),
    msPerTick: us(median(samples) / TICKS),
    samples: samples.map(ms),
  };
}
const loadEnd = loadavg().map(value => +value.toFixed(2));

console.log(JSON.stringify({
  actors: ACTORS,
  recordCounts: [0, ...RECORD_COUNTS],
  ticks: TICKS,
  dt: DT,
  batches: BATCHES,
  loadAverageStart: loadStart,
  loadAverageEnd: loadEnd,
  pure,
  engine,
}, null, 2));
