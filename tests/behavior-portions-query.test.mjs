import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorModules } from '../src/behaviors/engine.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { giftingModule } from '../src/behaviors/gifting.js';
import { createFoodPortionRegistry } from '../src/foodportions.js';
import { createWorld } from '../scripts/behavior-parity.mjs';

function actor(uid, extra = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear', name: `actor-${uid}`,
    stage: 'adult', age: 700, scale: 1, sex: 'F',
    cx: 2.5, cz: .5, cy: 1, hunger: .2, thirst: .2, energy: 1, health: 100,
    social: .3, affection: .25, bold: .5, bonds: {}, skills: {}, playdates: {},
    history: [], parentUids: [], fatherUid: 0, home: 'Home 1', grabs: 0,
    inPond: false, sleeping: false, inside: false, bedtime: 20, wakeTime: 6,
    ...extra,
  };
}

function adapter() {
  return {
    sleeps: false,
    onStop: () => {}, onSleep: () => {}, onWake: () => {},
    sleepDone: () => true, preTick: () => {}, preNeeds: () => false,
    hungerOpportunity: () => false, idleOpportunity: () => false,
    tickState: () => false,
  };
}

function makeEngine(options = {}) {
  return createBehaviorModules({
    getActors: () => [], getHours: () => 12, getDay: () => 1,
    getPopulationCap: () => 40, getAdapter: () => ({ onStop: () => {} }),
    ...options,
  });
}

function setup({
  field, getFood, getPortions, gifting = true,
  giverExtra = {}, receiverExtra = {}, rng = () => .5,
} = {}) {
  const giver = actor(10, giverExtra);
  const receiver = actor(11, { cx: 3.25, hunger: .5, ...receiverExtra });
  const options = {
    config: createBehaviorConfig({ features: { gifting, interactionHistory: true } }),
    getActors: () => [giver, receiver],
    getHours: () => 12,
    getDay: () => 1,
    getPopulationCap: () => 40,
    rng,
  };
  if (field !== undefined) options.field = field;
  if (getFood !== undefined) options.getFood = getFood;
  if (getPortions !== undefined) options.getPortions = getPortions;
  const engine = createBehaviorModules(options);
  engine.registerAdapter('softbody', adapter());
  engine.attach(giver);
  engine.attach(receiver);
  return { engine, giver, receiver };
}

function tick(engine, actor, seconds = 4) {
  for (let elapsed = 0; elapsed < seconds; elapsed += .2) {
    engine.tick(actor, .2, { ready: true });
  }
}

function sourceFixture(id = 'only') {
  const source = {
    id, kind: 'flower', ripe: true, satiation: .3, claim: null,
    x: 2.5, z: .5, approachX: 2.5, approachZ: .5,
  };
  const calls = { claim: 0, release: 0, consume: 0 };
  const food = {
    nearestRipe: () => source,
    claim: (item, who) => { calls.claim++; item.claim = who; return true; },
    release: (item, who) => {
      calls.release++;
      if (item.claim === who) item.claim = null;
    },
    consume: (item, who) => {
      calls.consume++;
      if (item.claim !== who) return false;
      item.claim = null;
      item.ripe = false;
      return true;
    },
    allRipe: () => (source.ripe ? [source] : []),
  };
  return { source, food, calls };
}

function trackedRegistry() {
  const registry = createFoodPortionRegistry();
  const calls = { add: 0, claim: 0, release: 0, take: 0, nextId: 0 };
  return {
    calls,
    registry,
    facade: {
      add: (value) => { calls.add++; return registry.add(value); },
      restore: registry.restore,
      all: registry.all,
      get: registry.get,
      claim: (portion, who) => { calls.claim++; return registry.claim(portion, who); },
      release: (portion, who) => { calls.release++; return registry.release(portion, who); },
      releaseActor: registry.releaseActor,
      take: (portion, who) => { calls.take++; return registry.take(portion, who); },
      nearest: registry.nearest,
      snapshot: registry.snapshot,
      reset: registry.reset,
      nextId: () => { calls.nextId++; return registry.nextId(); },
      stats: registry.stats,
      get sources() { return registry.sources; },
    },
  };
}

test('portions provider is optional and defaults to the field registry', () => {
  const portions = { all: () => [] };
  const engine = makeEngine({ field: { portions } });
  assert.equal(engine.api.portions(), portions);
  assert.equal(makeEngine().api.portions(), null);
});

test('constructor rejects non-function portions providers and accepts null or a function', () => {
  for (const value of [0, '', {}, [], true]) {
    assert.throws(() => makeEngine({ getPortions: value }), TypeError,
      `getPortions must reject ${JSON.stringify(value)}`);
  }
  assert.doesNotThrow(() => makeEngine({ getPortions: null }));
  assert.doesNotThrow(() => makeEngine({ getPortions: undefined }));
  assert.doesNotThrow(() => makeEngine({ getPortions: () => null }));
});

test('provider values are queried every time and remain authoritative', () => {
  const fieldPortions = { all: () => [] };
  const first = { all: () => [] };
  const second = { all: () => [] };
  let current = first;
  let calls = 0;
  const engine = makeEngine({
    field: { portions: fieldPortions },
    getPortions: () => { calls++; return current; },
  });
  assert.equal(engine.api.portions(), first);
  current = second;
  assert.equal(engine.api.portions(), second);
  current = null;
  assert.equal(engine.api.portions(), null, 'provider null never falls back to field portions');
  current = undefined;
  assert.equal(engine.api.portions(), undefined, 'provider undefined never falls back to field portions');
  assert.equal(calls, 4);
});

test('omitted provider tracks the current field registry and provider exceptions propagate', () => {
  const first = { all: () => [] };
  const second = { all: () => [] };
  const field = { portions: first };
  const engine = makeEngine({ field });
  assert.equal(engine.api.portions(), first);
  field.portions = second;
  assert.equal(engine.api.portions(), second);

  const throwing = makeEngine({
    getPortions: () => { throw new Error('portions provider failed'); },
  });
  assert.throws(() => throwing.api.portions(), /portions provider failed/);
});

test('no-op paths do not query the portions provider', () => {
  let calls = 0;
  const engine = makeEngine({
    getPortions: () => { calls++; throw new Error('portions provider must not be queried'); },
  });
  const noCarry = actor(1);
  engine.attach(noCarry);
  assert.equal(engine.dropCarried(noCarry), null);
  engine.cancelPair(noCarry);
  assert.equal(calls, 0);

  const waiting = actor(2, { hunger: .9 });
  const other = actor(3, { cx: 3, hunger: .6 });
  const busy = makeEngine({
    getActors: () => [waiting, other],
    config: createBehaviorConfig({ features: { gifting: true } }),
    getPortions: () => { calls++; throw new Error('portions provider must not be queried'); },
  });
  busy.registerAdapter('softbody', adapter());
  busy.attach(waiting);
  busy.attach(other);
  assert.equal(busy.forceGift(waiting, other).ok, false, 'ineligible giver refuses first');
  busy.setFeature('gifting', false);
  busy.forceGift(waiting, other);
  assert.equal(calls, 0);
});

test('gifting collects and hands over from providers without a rendered field', () => {
  const { source, food, calls } = sourceFixture();
  const track = trackedRegistry();
  const { engine, giver, receiver } = setup({
    getFood: () => food,
    getPortions: () => track.facade,
  });

  assert.equal(engine.forceGift(giver, receiver).ok, true);
  assert.equal(source.claim, giver);
  engine.tick(giver, .2, { ready: true });
  assert.equal(giver.ai.giftPhase, 'deliver');
  assert.equal(giver.carriedFood.kind, 'flower');
  assert.equal(giver.carriedFood.id, 'gift-1');
  assert.equal(calls.consume, 1);

  for (let n = 0; n < 30 && giver.ai.state !== 'wander'; n++) {
    engine.tick(giver, .2, { ready: true });
    engine.tick(receiver, .2, { ready: true });
  }
  assert.equal(giver.carriedFood, null);
  assert.equal(receiver.hunger < .5, true);
  assert.equal(giver.lastGiftDay, 1);
  assert.equal(track.registry.all('field').length, 0);
  assert.equal(track.calls.take, 0, 'a fresh source is not taken from the portion registry');
  assert.equal(calls.consume, 1, 'source is consumed exactly once');
});

test('a dropped gift recovers by identity from a provided registry', () => {
  const { food } = sourceFixture();
  const track = trackedRegistry();
  const { engine, giver, receiver } = setup({
    getFood: () => food,
    getPortions: () => track.facade,
  });

  assert.equal(engine.forceGift(giver, receiver).ok, true);
  engine.tick(giver, .2, { ready: true });
  assert.equal(giver.carriedFood.kind, 'flower');
  engine.cancelPair(giver);
  assert.equal(giver.carriedFood, null);
  const dropped = track.registry.all('field');
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].kind, 'flower');
  assert.equal(track.calls.add, 1);

  giver.ai.giftRetryT = 0;
  assert.equal(engine.forceGift(giver, receiver).ok, true);
  assert.equal(giver.ai.giftOrigin.type, 'portion');
  assert.equal(giver.ai.giftOrigin.portion, dropped[0], 'the same live portion is reserved');
  engine.tick(giver, .2, { ready: true });
  assert.equal(track.calls.take, 1, 'the claimed portion is taken exactly once');
  assert.equal(giver.carriedFood.id, dropped[0].id, 'carried identity is retained');
  for (let n = 0; n < 30 && giver.ai.state !== 'wander'; n++) {
    engine.tick(giver, .2, { ready: true });
    engine.tick(receiver, .2, { ready: true });
  }
  assert.equal(track.calls.take, 1);
  assert.equal(track.registry.all('field').length, 0);
  const before = receiver.hunger;
  tick(engine, giver, 2);
  assert.equal(receiver.hunger, before, 'handover happens once');
});

test('the natural opportunity starts from providers alone', () => {
  const { food } = sourceFixture();
  const track = trackedRegistry();
  const { engine, giver, receiver } = setup({
    getFood: () => food,
    getPortions: () => track.facade,
  });
  const opportunity = engine.api.runOpportunity(giver, 'gifting.offer');
  assert.equal(opportunity?.id, 'gifting.offer');
  assert.equal(giver.ai.state, 'seekGift');
  assert.equal(receiver.ai.state, 'seekGift');
  assert.equal(giver.ai.giftOrigin.type, 'source');
});

test('a null portions provider clears carried food and never reads field portions', () => {
  const field = {
    get portions() { throw new Error('field portions must not be read'); },
  };
  const { engine, giver } = setup({
    field,
    getPortions: () => null,
    giverExtra: { carriedFood: { id: 'carried', kind: 'flower', satiation: .3 } },
  });
  assert.equal(engine.dropCarried(giver), null);
  assert.equal(giver.carriedFood, null, 'carried food clears before the unavailable drop');
});

test('missing portion collection fails and cancels without a field fallback', () => {
  const field = {
    get portions() { throw new Error('field portions must not be read'); },
  };
  const track = trackedRegistry();
  const placed = track.registry.add({
    id: 'gift-7', kind: 'flower', satiation: .3, x: 2.5, y: .9, z: .5, mapId: 'field',
  });
  let read = 0;
  const { engine, giver, receiver } = setup({
    field,
    getFood: () => null,
    getPortions: () => (++read === 1 ? track.facade : null),
  });
  assert.equal(engine.forceGift(giver, receiver).ok, true);
  assert.equal(giver.ai.giftOrigin.type, 'portion');
  assert.equal(placed.claim, giver);
  engine.tick(giver, .2, { ready: true });
  assert.equal(giver.carriedFood, undefined);
  assert.notEqual(giver.ai.state, 'seekGift');
  assert.equal(receiver.ai.state, 'wander');
  assert.equal(track.calls.take, 0, 'no take through a missing registry');
  assert.equal(track.registry.get('gift-7').claim, giver,
    'the unavailable release leaves the existing claim untouched');
});

test('failed beginPair release is skipped when the portions provider disappears', () => {
  const field = {
    get portions() { throw new Error('field portions must not be read'); },
  };
  const track = trackedRegistry();
  track.registry.add({
    id: 'gift-8', kind: 'flower', satiation: .3, x: 2.5, y: .9, z: .5, mapId: 'field',
  });
  let reads = 0;
  const getPortions = () => (++reads === 1 ? track.facade : null);
  const giver = actor(10);
  const recipient = actor(11, { cx: 3.25, hunger: .5 });
  const config = createBehaviorConfig({ features: { gifting: true } });
  const engine = makeEngine({
    field,
    config,
    getActors: () => [giver, recipient],
    getPortions,
  });
  engine.attach(giver);
  let aiReads = 0;
  let ai = recipient.ai;
  Object.defineProperty(recipient, 'ai', {
    get() {
      aiReads++;
      // candidateFor reads ai four times; beginPair's first ai read fails.
      return aiReads >= 5 ? null : ai || (ai = {
        state: 'wander', partner: null, familyTask: null, source: null,
      });
    },
  });
  const ctx = {
    actor: giver, ai: giver.ai, p: config.forActor(giver), field,
    features: { gifting: true }, mapId: 'field',
    api: {
      actors: () => [giver, recipient],
      portions: getPortions,
      food: () => null,
      dayNow: () => 1, hoursNow: () => 12,
      stop: () => {}, face: () => {}, emit: () => {},
      setDestination: () => true,
    },
  };
  const started = giftingModule.beginGift(ctx, recipient);
  assert.equal(started, false);
  assert.equal(reads, 2, 'origin claim and failed release each resolve the provider');
  assert.equal(track.calls.release, 0, 'release is skipped when the provider is unavailable');
  assert.equal(track.registry.get('gift-8').claim, giver, 'skipped release keeps the claim');
});

test('a failed beginPair releases a claimed portion through the provider', () => {
  const track = trackedRegistry();
  track.registry.add({
    id: 'gift-6', kind: 'flower', satiation: .3, x: 2.5, y: .9, z: .5, mapId: 'field',
  });
  const giver = actor(10);
  const recipient = actor(11, { cx: 3.25, hunger: .5 });
  const config = createBehaviorConfig({ features: { gifting: true } });
  const engine = makeEngine({
    config,
    getActors: () => [giver, recipient],
    getPortions: () => track.facade,
  });
  engine.attach(giver);
  let aiReads = 0;
  let ai = recipient.ai;
  Object.defineProperty(recipient, 'ai', {
    get() {
      aiReads++;
      return aiReads >= 5 ? null : ai || (ai = {
        state: 'wander', partner: null, familyTask: null, source: null,
      });
    },
  });
  const ctx = {
    actor: giver, ai: giver.ai, p: config.forActor(giver), features: { gifting: true },
    mapId: 'field',
    api: {
      actors: () => [giver, recipient],
      portions: () => track.facade,
      food: () => null,
      dayNow: () => 1, hoursNow: () => 12,
      stop: () => {}, face: () => {}, emit: () => {},
      setDestination: () => true,
    },
  };
  assert.equal(giftingModule.beginGift(ctx, recipient), false);
  assert.equal(track.calls.claim, 1);
  assert.equal(track.calls.release, 1);
  assert.equal(track.registry.get('gift-6').claim, null);
});

test('a module context without api.portions throws when portions are queried', () => {
  const giver = actor(10);
  const recipient = actor(11, { cx: 3.25, hunger: .5 });
  giver.ai = {
    state: 'wander', partner: null, familyTask: null, source: null, giftRetryT: 0,
  };
  recipient.ai = { state: 'wander', partner: null, familyTask: null, source: null };
  const config = createBehaviorConfig({ features: { gifting: true } });
  const ctx = {
    actor: giver, ai: giver.ai, p: config.forActor(giver),
    features: { gifting: true }, mapId: 'field',
    api: {
      actors: () => [giver, recipient],
      food: () => null,
      dayNow: () => 1, hoursNow: () => 12,
      stop: () => {}, face: () => {}, emit: () => {},
      setDestination: () => true,
    },
  };
  assert.throws(() => giftingModule.beginGift(ctx, recipient),
    /api\.portions is not a function/);
  assert.equal(giver.ai.state, 'wander', 'no offer state is fabricated');
  assert.equal(giver.ai.partner, null);
  assert.equal(giver.ai.giftOrigin, undefined);
});

test('disabling gifting and detaching a giver drop through the provider registry', () => {
  const { food } = sourceFixture();
  const track = trackedRegistry();
  const { engine, giver, receiver } = setup({
    getFood: () => food,
    getPortions: () => track.facade,
  });
  assert.equal(engine.forceGift(giver, receiver).ok, true);
  engine.tick(giver, .2, { ready: true });
  assert.equal(giver.carriedFood.kind, 'flower');
  engine.setFeature('gifting', false);
  assert.equal(giver.carriedFood, null);
  assert.equal(track.registry.all('field').length, 1);
  assert.equal(track.calls.add, 1);
  assert.equal(giver.ai.state, 'wander');

  engine.setFeature('gifting', true);
  const second = trackedRegistry();
  const { food: food2 } = sourceFixture('only-2');
  const detached = setup({
    getFood: () => food2,
    getPortions: () => second.facade,
  });
  assert.equal(detached.engine.forceGift(detached.giver, detached.receiver).ok, true);
  detached.engine.tick(detached.giver, .2, { ready: true });
  assert.equal(detached.giver.carriedFood.kind, 'flower');
  detached.engine.detach(detached.giver);
  assert.equal(second.registry.all('field').length, 1);
  assert.equal(second.calls.add, 1);
});

test('source collection keeps the fallback ID when portions are unavailable', () => {
  const { food } = sourceFixture();
  const { engine, giver, receiver } = setup({
    getFood: () => food,
    getPortions: () => null,
  });
  assert.equal(engine.forceGift(giver, receiver).ok, true);
  giver.ai.clock = 7.9;
  engine.tick(giver, .2, { ready: true });
  assert.equal(giver.carriedFood.id, 'gift-10-8');
});

test('provider and field routes keep the exact seeded trace and RNG stream', () => {
  function run(mode) {
    let seed = 7;
    const draws = [];
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = seed / 4294967296;
      draws.push(value);
      return value;
    };
    const world = createWorld({
      foodSources: [{ id: 'only', kind: 'flower', x: 2.5, z: .5, respawn: 40 }],
    });
    let portions = world.portions;
    const options = {
      config: createBehaviorConfig({ features: { gifting: true, interactionHistory: true } }),
      getActors: () => [giver, receiver],
      getHours: () => 12,
      getDay: () => 1,
      getPopulationCap: () => 40,
      rng,
      getNavigation: () => world.nav,
    };
    if (mode === 'field') options.field = world;
    else {
      options.getHomes = () => world.homes;
      options.getFood = () => world.food;
      options.getWaterSpots = () => world.waterSpots;
      options.getPortions = () => portions;
    }
    const giver = actor(10);
    const receiver = actor(11, { cx: 3.25, hunger: .5 });
    const engine = createBehaviorModules(options);
    engine.registerAdapter('softbody', adapter());
    engine.attach(giver);
    engine.attach(receiver);
    const trace = [];
    assert.equal(engine.forceGift(giver, receiver).ok, true);
    for (let n = 0; n < 40; n++) {
      engine.tick(giver, .2, { ready: true });
      engine.tick(receiver, .2, { ready: true });
      trace.push({
        state: giver.ai.state,
        phase: giver.ai.giftPhase,
        carried: giver.carriedFood,
        receiverHunger: +receiver.hunger.toFixed(6),
        lastGiftDay: giver.lastGiftDay ?? null,
        portions: world.portions.snapshot('field'),
      });
      if (giver.lastGiftDay === 1) break;
    }
    return { draws, trace, finalPortions: world.portions.snapshot('field') };
  }

  const fieldRoute = run('field');
  const providerRoute = run('provider');
  assert.equal(providerRoute.trace.length, fieldRoute.trace.length);
  assert.deepEqual(providerRoute.trace, fieldRoute.trace);
  assert.deepEqual(providerRoute.finalPortions, fieldRoute.finalPortions);
  assert.deepEqual(providerRoute.draws, fieldRoute.draws);
});
