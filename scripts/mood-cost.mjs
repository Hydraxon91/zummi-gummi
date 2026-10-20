// Config-cache invalidation rate for 40 actors under mood.
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld, createRoster } from './behavior-parity.mjs';

const world = createWorld();
const base = createRoster('bear');
const roster = [];
for (let i = 0; i < 40; i++) {
  const src = base[i % base.length];
  roster.push({
    ...src,
    uid: i + 1,
    name: `bear-${i + 1}`,
    cx: (i % 8) * 2 - 7,
    cz: Math.floor(i / 8) * 2 - 4,
    bonds: {},
    history: [],
    playdates: {},
    parentUids: [...(src.parentUids || [])],
    skills: { ...(src.skills || {}) },
  });
}
const config = createBehaviorConfig({ features: { mood: true } });
const engine = createBehavior({
  engine: 'modules', config, field: world, getActors: () => roster,
  getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40, rng: () => .5,
});
const warn = console.warn;
console.warn = () => {};
try {
  for (const actor of roster) engine.attach(actor);
  config.resetInvalidations();
  // One sim-hour = 10 s at 20 ticks/s.
  for (let tick = 0; tick < 200; tick++) {
    for (const actor of roster) engine.tick(actor, 1 / 20);
  }
} finally {
  console.warn = warn;
}
const invalidations = config.getInvalidations();
console.log(JSON.stringify({
  actors: roster.length,
  simHours: 1,
  invalidations,
  invalidationsPerActorHour: +(invalidations / roster.length).toFixed(3),
  invalidationsPerSimHour: invalidations,
}));
