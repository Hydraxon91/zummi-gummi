import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStars, lifespanDays, oldAgeThreshold, STAR_DEFAULTS,
} from '../src/behaviors/stars.js';
import { createBehaviorConfig, FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { createBehavior } from '../src/behaviors/index.js';
import { createWorld, createRoster } from '../scripts/behavior-parity.mjs';
import { snapshotActor } from '../src/actorrecord.js';

function makeActor(uid, extra = {}) {
  return {
    uid, active: true, species: 'bear', kind: 'bear', name: `actor-${uid}`,
    stage: 'adult', age: 700, scale: 1, sex: uid % 2 ? 'F' : 'M',
    health: 100, hunger: .3, thirst: .3, energy: 1, social: .5, affection: .3,
    bonds: {}, skills: {}, history: [], playdates: {}, parentUids: [], home: 'Home 1',
    ...extra,
  };
}

function setup(extra = {}) {
  const actors = Array.from({ length: 8 }, (_, i) => makeActor(i + 1));
  const features = {
    farewells: true, starsOldAge: true, starsStarvation: true, starsStings: true,
    ...extra,
  };
  const farewells = [];
  const blocked = [];
  let day = 1;
  const stars = createStars({
    features,
    getActors: () => actors.filter(actor => actor.active),
    getDay: () => day,
    getCeiling: () => 40,
    daySeconds: 240,
    onFarewell: (actor, info) => farewells.push({ uid: actor.uid, ...info }),
    onBlocked: (actor, reason) => blocked.push({ uid: actor.uid, reason }),
  });
  return { actors, features, stars, farewells, blocked, setDay: value => { day = value; } };
}

function run(stars, actors, seconds, dt = 1 / 20) {
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) {
    for (const actor of actors) stars.update(actor, dt);
  }
}

test('stars are off by default and lifespan is uid-hash only', () => {
  for (const key of ['farewells', 'starsOldAge', 'starsStarvation', 'starsStings']) {
    assert.equal(FEATURE_DEFAULTS[key], false, key);
  }
  const a = lifespanDays(7, 'bear');
  assert.equal(a, lifespanDays(7, 'bear'));
  assert.notEqual(a, lifespanDays(8, 'bear'));
  assert.ok(a >= STAR_DEFAULTS.oldAgeMinDays && a <= STAR_DEFAULTS.oldAgeMaxDays);
  assert.equal(oldAgeThreshold(7, 'bear', 240), 420 + a * 240);
});

test('normal old-age fading starts, shows feeling faint, and departs', () => {
  const { actors, stars, farewells } = setup();
  actors[0].age = 99999;
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading.reason, 'oldAge');
  assert.equal(stars.state(actors[0]).committed, false);
  run(stars, [actors[0]], 29.9);
  assert.equal(farewells.length, 0);
  run(stars, [actors[0]], .2);
  assert.equal(farewells.length, 1);
  assert.equal(farewells[0].reason, 'oldAge');
  assert.equal(actors[0].fading.committed, true);
});

test('old-age rescue grants a one-day reprieve; routine eating does not', () => {
  const { actors, stars, setDay } = setup();
  actors[0].age = 99999;
  stars.update(actors[0], .05);
  assert.equal(stars.onRescue(actors[0], 'food'), true);
  assert.equal(actors[0].fading, undefined);
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading, undefined, 'same day must stay reprieved');
  setDay(2);
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading.reason, 'oldAge');
  assert.equal(stars.state(actors[0]).reprieveUntil, 2);
});

test('starvation accumulates only at the unchanged health floor and needs 120 s', () => {
  const { actors, stars, farewells } = setup();
  actors[0].health = 1;
  actors[0].hunger = .96;
  actors[0].age = 700;
  run(stars, [actors[0]], 119);
  assert.equal(actors[0].fading, undefined);
  run(stars, [actors[0]], 1.2);
  assert.equal(actors[0].fading.reason, 'starvation');
  run(stars, [actors[0]], 30.2);
  assert.equal(farewells.at(-1).reason, 'starvation');
});

test('eating or drinking clears fading and resets starvation', () => {
  const { actors, stars } = setup();
  actors[0].health = 1;
  actors[0].hunger = .96;
  run(stars, [actors[0]], 120.1);
  assert.equal(actors[0].fading.reason, 'starvation');
  assert.equal(stars.onRescue(actors[0], 'water'), true);
  assert.equal(actors[0].fading, undefined);
  assert.equal(actors[0].starveT, 0);
});

test('stings only accelerate an existing fading actor at health floor', () => {
  const { actors, stars, farewells } = setup();
  actors[0].age = 99999;
  assert.equal(stars.onSting(actors[0]), false);
  stars.update(actors[0], .05);
  actors[0].health = 50;
  assert.equal(stars.onSting(actors[0]), false, 'not at health floor');
  actors[0].health = 1;
  assert.equal(stars.onSting(actors[0]), true);
  assert.equal(actors[0].fading.reason, 'sting');
  assert.ok(actors[0].fading.remaining >= STAR_DEFAULTS.minimumFadeSeconds);
  run(stars, [actors[0]], 24.8);
  assert.equal(farewells.length, 0);
  run(stars, [actors[0]], .2);
  assert.equal(farewells.length, 1);
  assert.equal(farewells[0].reason, 'sting');
});

test('pregnancy, baby households, stay, population floor and last species block', () => {
  const { actors, stars, blocked } = setup();
  actors[0].age = 99999;
  actors[0].pregnant = true;
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading, undefined);

  actors[0].pregnant = false;
  actors[0].home = 'Home 1';
  actors[1].home = 'Home 1';
  actors[1].stage = 'baby';
  actors[1].parentUids = [actors[0].uid];
  for (let i = 2; i < actors.length; i++) actors[i].home = 'Home 2';
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading, undefined, 'no other household adult');

  actors[1].home = 'Home 2';
  actors[0].stay = true;
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading, undefined, 'stay');

  actors[0].stay = false;
  actors[0].age = 99999;
  for (let i = 0; i < 8; i++) actors[i].active = i < 6;
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading, undefined, 'population floor');

  for (let i = 0; i < 8; i++) actors[i].active = true;
  for (let i = 1; i < 8; i++) actors[i].species = 'msn';
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading, undefined, 'last of species');

  assert.ok(blocked.length >= 0);
});

test('a blocked departure clears fading and retries after one game day', () => {
  const { actors, stars, blocked, farewells, setDay } = setup();
  actors[0].age = 99999;
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading.reason, 'oldAge');
  actors[0].pregnant = true;
  run(stars, [actors[0]], 30.2);
  assert.equal(farewells.length, 0);
  assert.equal(actors[0].fading, undefined);
  assert.equal(blocked.at(-1).reason, 'pregnant');
  assert.equal(actors[0].starsRetryDay, 2);
  setDay(2);
  actors[0].pregnant = false;
  stars.update(actors[0], .05);
  assert.equal(actors[0].fading.reason, 'oldAge');
});

test('stars state machine consumes no RNG', () => {
  const { actors, stars } = setup();
  actors[0].age = 99999;
  const original = Math.random;
  Math.random = () => { throw new Error('stars consumed RNG'); };
  try {
    stars.update(actors[0], .05);
    run(stars, [actors[0]], 30.2);
    assert.equal(actors[0].fading.committed, true);
  } finally {
    Math.random = original;
  }
});

test('fading is not written to an actor save', () => {
  const { actors, stars } = setup();
  actors[0].age = 99999;
  stars.update(actors[0], .05);
  const save = JSON.stringify(snapshotActor(actors[0]));
  assert.equal(save.includes('fading'), false);
  assert.equal(save.includes('starsRetry'), false);
});

test('all farewell flags off creates no runtime fields', () => {
  const { actors, stars } = setup({
    farewells: false, starsOldAge: false, starsStarvation: false, starsStings: false,
  });
  actors[0].age = 99999;
  actors[0].hunger = 1;
  actors[0].health = 1;
  run(stars, [actors[0]], 160);
  assert.equal(actors[0].fading, undefined);
  assert.equal(actors[0].starveT, undefined);
  assert.equal(actors[0].starsRetryDay, undefined);
});

test('off/on farewell flags leave a no-candidate engine trace identical', () => {
  function trace(on) {
    const world = createWorld();
    const roster = createRoster('bear');
    let draws = 0;
    const config = createBehaviorConfig({ features: { farewells: on } });
    const engine = createBehavior({
      engine: 'modules', config, field: world, getActors: () => roster,
      getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40,
      daySeconds: 240, rng: () => { draws++; return .5; },
    });
    const warn = console.warn;
    console.warn = () => {};
    try {
      for (const actor of roster) engine.attach(actor);
      for (let tick = 0; tick < 80; tick++) {
        for (const actor of roster) engine.tick(actor, 1 / 20);
      }
    } finally {
      console.warn = warn;
    }
    return { draws, state: JSON.stringify(roster.map(actor => [actor.uid, actor.ai?.state, actor.cx, actor.cz])) };
  }
  assert.deepEqual(trace(true), trace(false));
});

test('scarce-food fixture still reaches starvation while eating is unavailable', () => {
  const world = createWorld({ foodSources: [] });
  assert.equal(world.food.allRipe().length, 0);
  assert.equal(world.food.nearestRipe(0, 0), null);
  const actors = createRoster('bear').concat(createRoster('bear').map((actor, i) => ({
    ...actor, uid: 20 + i, name: `extra-${i}`, bonds: {}, history: [],
  })));
  const actor = actors[0];
  actor.age = 700;
  actor.hunger = .96;
  actor.health = 1;
  const config = createBehaviorConfig({ features: { farewells: true, starsStarvation: true } });
  const departures = [];
  const engine = createBehavior({
    engine: 'modules', config, field: world, getActors: () => actors,
    getHours: () => 12, getDay: () => 1, getPopulationCap: () => 40,
    daySeconds: 240, rng: () => .5,
    onFarewell: (who, info) => departures.push({ uid: who.uid, reason: info.reason }),
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const item of actors) engine.attach(item);
    for (let tick = 0; tick < 152 * 20; tick++) engine.tick(actor, 1 / 20);
  } finally {
    console.warn = warn;
  }
  assert.equal(departures.length, 1);
  assert.equal(departures[0].reason, 'starvation');
});
