import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorModules } from '../src/behaviors/engine.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { followModule } from '../src/behaviors/follow.js';
import { familyTaskModule } from '../src/behaviors/family.js';
import { socialModule } from '../src/behaviors/social.js';
import { forageModule } from '../src/behaviors/forage.js';
import { waterModule } from '../src/behaviors/water.js';
import { hiveModule } from '../src/behaviors/hive.js';
import { conflictModule } from '../src/behaviors/conflict.js';
import { giftingModule } from '../src/behaviors/gifting.js';

const config = createBehaviorConfig();

function makeActor(uid, extra = {}) {
  const { ai: aiExtra = {}, ...rest } = extra;
  return {
    uid, active: true, kind: 'bear', species: 'bear', stage: 'adult',
    sex: uid % 2 ? 'F' : 'M', home: 'Home A',
    cx: 0, cz: 0, cy: 1, hunger: .6, thirst: .3, energy: 1, health: 100,
    social: .5, affection: .4, bold: .5, scale: 1,
    parentUids: [], bonds: {}, skills: {}, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false, inside: false,
    ...rest,
    ai: {
      state: 'wander', partner: null, familyTask: null, taskCooldown: 0,
      socialCooldown: 0, conflictCooldown: 0, source: null,
      ...aiExtra,
    },
  };
}

function makeHome(name, x = 0, z = 0) {
  return { name, x, z, door: { x, z } };
}

function makeEngine(options = {}) {
  return createBehaviorModules({
    getActors: () => [], getHours: () => 12, getDay: () => 0,
    getPopulationCap: () => 40, getAdapter: () => ({ onStop: () => {} }),
    ...options,
  });
}

test('constructor providers are optional and default to the field fallback', () => {
  const field = {
    homes: [makeHome('Home A')],
    food: { allRipe: () => [{ id: 'f1' }] },
    waterSpots: [{ x: 1, z: 2 }],
  };
  const engine = makeEngine({ field });
  assert.equal(engine.api.homes(), field.homes);
  assert.equal(engine.api.food(), field.food);
  assert.equal(engine.api.waterSpots(), field.waterSpots);

  const noField = makeEngine();
  assert.equal(noField.api.homes(), null);
  assert.equal(noField.api.food(), null);
  assert.equal(noField.api.waterSpots(), null);
});

test('constructor rejects non-function providers and accepts null or a function', () => {
  for (const key of ['getHomes', 'getFood', 'getWaterSpots']) {
    for (const value of [0, '', {}, [], true]) {
      assert.throws(() => makeEngine({ [key]: value }), TypeError,
        `${key} must reject ${JSON.stringify(value)}`);
    }
    assert.doesNotThrow(() => makeEngine({ [key]: null }));
    assert.doesNotThrow(() => makeEngine({ [key]: undefined }));
    assert.doesNotThrow(() => makeEngine({ [key]: () => null }));
  }
});

test('provider values are queried every time and remain authoritative', () => {
  const field = {
    homes: [makeHome('Field Home')],
    food: { allRipe: () => [{ id: 'field-food' }] },
    waterSpots: [{ x: 9, z: 9 }],
  };
  const first = {
    homes: [makeHome('Provided Home')],
    food: { allRipe: () => [{ id: 'provided-food' }] },
    waterSpots: [{ x: 1, z: 1 }],
  };
  const calls = { homes: 0, food: 0, water: 0 };
  let homesValue = first.homes;
  let foodValue = first.food;
  let waterValue = first.waterSpots;
  const engine = makeEngine({
    field,
    getHomes: () => { calls.homes++; return homesValue; },
    getFood: () => { calls.food++; return foodValue; },
    getWaterSpots: () => { calls.water++; return waterValue; },
  });

  assert.equal(engine.api.homes(), first.homes);
  assert.equal(engine.api.food(), first.food);
  assert.equal(engine.api.waterSpots(), first.waterSpots);
  assert.deepEqual(calls, { homes: 1, food: 1, water: 1 });

  homesValue = [makeHome('Replacement')];
  foodValue = { allRipe: () => [] };
  waterValue = [];
  assert.equal(engine.api.homes(), homesValue);
  assert.equal(engine.api.food(), foodValue);
  assert.equal(engine.api.waterSpots(), waterValue);

  homesValue = null;
  foodValue = undefined;
  waterValue = [];
  assert.equal(engine.api.homes(), null, 'provider null never falls back to field homes');
  assert.equal(engine.api.food(), undefined, 'provider undefined never falls back to field food');
  assert.equal(engine.api.waterSpots(), waterValue);
  assert.deepEqual(calls, { homes: 3, food: 3, water: 3 });
});

test('omitted providers return field identities and provider exceptions propagate', () => {
  const homes = [makeHome('Home A')];
  const food = { allRipe: () => [] };
  const waterSpots = [{ x: 1, z: 1 }];
  const engine = makeEngine({ field: { homes, food, waterSpots } });
  assert.equal(engine.api.homes(), homes);
  assert.equal(engine.api.food(), food);
  assert.equal(engine.api.waterSpots(), waterSpots);

  for (const key of ['getHomes', 'getFood', 'getWaterSpots']) {
    const name = key === 'getHomes' ? 'homes' : key === 'getFood' ? 'food' : 'waterSpots';
    const throwing = makeEngine({
      [key]: () => { throw new Error(`${name} provider failed`); },
    });
    assert.throws(() => throwing.api[name](), new RegExp(`${name} provider failed`));
  }
});

test('homes and food consumers use the provided references, not the field', () => {
  const homes = [makeHome('Home A', 3, 4)];
  const actor = makeActor(1, { home: 'Home A' });
  const field = {
    get homes() { throw new Error('field homes must not be read'); },
    get food() { throw new Error('field food must not be read'); },
    get waterSpots() { throw new Error('field waterSpots must not be read'); },
    nav: { nearestWalkable: (x, z) => ({ x, z }), findPath: () => null },
  };
  const engine = makeEngine({
    field,
    getActors: () => [actor],
    getHomes: () => homes,
    getFood: () => ({ allRipe: () => [{ id: 'safe' }] }),
    getWaterSpots: () => [{ x: 2, z: 2 }],
  });
  assert.equal(engine.api.homeFor(actor), homes[0]);
  assert.equal(engine.api.safeFoodCount(), 1);
  assert.equal(engine.api.waterSpots()[0].x, 2);

  const assignActor = makeActor(2, { home: '' });
  const assigning = makeEngine({
    getActors: () => [assignActor],
    getHomes: () => homes,
  });
  assert.equal(assigning.api.assignHome(assignActor), homes[0]);
  assert.equal(assignActor.home, 'Home A');
});

test('a null homes provider blocks engine, follow, family and social home lookups', () => {
  const homes = [makeHome('Home A', 7, 8)];
  const field = { homes };
  const actor = makeActor(1, { home: 'Home A' });
  const engine = makeEngine({
    field, getActors: () => [actor], getHomes: () => null,
  });
  assert.equal(engine.api.homeFor(actor), null);
  assert.equal(engine.api.assignHome(actor), null);
  assert.equal(actor.home, 'Home A', 'assignHome must not mutate home when blocked');

  const parent = makeActor(2, { home: 'Home A', inside: true, cx: 1, cz: 2 });
  const followCtx = {
    api: { homes: () => null },
    field,
    actor,
    ai: actor.ai,
  };
  assert.deepEqual(followModule.parentTarget(followCtx, parent), { x: 1, z: 2 });
  followCtx.api.homes = () => homes;
  assert.deepEqual(followModule.parentTarget(followCtx, parent), { x: 7, z: 8 });

  const partner = makeActor(3, { home: 'Home A', cx: 2, cz: 2 });
  let chosen = null;
  const familyCtx = {
    actor, ai: actor.ai, field,
    api: {
      homes: () => null,
      releaseFood: () => {},
      dayNow: () => 1,
      setDestination: (who, x, z) => { chosen = { who, x, z }; return true; },
    },
  };
  assert.equal(familyTaskModule.startPlaydate(familyCtx, partner, 'sibling'), true);
  assert.equal(actor.ai.playdateHome, null);
  assert.deepEqual(actor.ai.playdateTarget, { x: 1, z: 1 }, 'null homes keeps the midpoint');

  const familyHome = makeActor(4, { home: 'Home A', cx: 2, cz: 2 });
  const familyActor2 = makeActor(5, { home: 'Home A' });
  const familyCtx2 = {
    actor: familyActor2,
    ai: familyActor2.ai,
    field,
    api: {
      homes: () => homes,
      releaseFood: () => {},
      dayNow: () => 1,
      setDestination: () => true,
    },
  };
  assert.equal(familyTaskModule.startPlaydate(familyCtx2, familyHome, 'sibling'), true);
  assert.deepEqual(familyCtx2.actor.ai.playdateTarget, { x: 7, z: 8 });

  const a = makeActor(6, { home: 'Home A', cx: 0, cz: 0 });
  const b = makeActor(7, { home: 'Home A', cx: 0, cz: 0 });
  a.ai.state = 'visit';
  a.ai.partner = b;
  a.ai.visitHome = 'Home A';
  a.ai.visitPhase = 'travel';
  a.ai.target = { x: 0, z: 0 };
  a.ai.visitT = 0;
  b.ai.state = 'visit';
  b.ai.partner = a;
  b.ai.visitHome = 'Home A';
  b.ai.visitPhase = 'travel';
  b.ai.visitArrived = false;
  const socialCtx = {
    actor: a, ai: a.ai, p: config.forActor(a), field, features: {},
    api: {
      homes: () => null,
      isDayFor: () => true,
      stop: () => {},
      profile: () => config.forActor(a),
    },
  };
  assert.equal(socialModule.tick(socialCtx, .1), true);
  assert.equal(a.ai.state, 'wander', 'null homes finishes the visit pair');
  assert.equal(b.ai.state, 'wander');
  assert.equal(a.ai.partner, null);

  const c = makeActor(8, { home: 'Home A', cx: 0, cz: 0 });
  const d = makeActor(9, { home: 'Home A', cx: 0, cz: 0 });
  c.ai.state = 'visit';
  c.ai.partner = d;
  c.ai.visitHome = 'Home A';
  c.ai.visitPhase = 'travel';
  c.ai.target = { x: 0, z: 0 };
  d.ai.state = 'visit';
  d.ai.partner = c;
  d.ai.visitHome = 'Home A';
  d.ai.visitArrived = false;
  const socialCtx2 = {
    ...socialCtx,
    actor: c,
    ai: c.ai,
    api: { ...socialCtx.api, homes: () => homes },
  };
  assert.equal(socialModule.tick(socialCtx2, .1), true);
  assert.equal(c.ai.state, 'visit');
  assert.equal(c.ai.visitArrived, true);
});

test('engine food helpers respect a null provider while the field still has a registry', () => {
  const released = [];
  const registry = {
    allRipe: () => [{ id: 'a' }, { id: 'b' }],
    release: (source, actor) => released.push([source, actor]),
  };
  const field = { food: registry };
  const blockedActor = makeActor(1, { ai: { source: { id: 'source' } } });
  const blocked = makeEngine({ field, getFood: () => null });
  assert.equal(blocked.api.safeFoodCount(), 0);
  blocked.api.releaseFood(blockedActor);
  assert.equal(released.length, 0);
  assert.equal(blockedActor.ai.source, null);

  const allowedActor = makeActor(2, { ai: { source: { id: 'source' } } });
  const allowed = makeEngine({ field });
  assert.equal(allowed.api.safeFoodCount(), 2);
  allowed.api.releaseFood(allowedActor);
  assert.deepEqual(released[0], [{ id: 'source' }, allowedActor]);
});

test('forage, hive and water acquire use only the supplied resources', () => {
  const forageSource = {
    id: 'food-1', kind: 'flower', ripe: true, satiation: .3,
    x: 1, z: 0, approachX: 1, approachZ: 0,
  };
  const claims = [];
  const releases = [];
  const food = {
    nearestRipe: () => forageSource,
    claim: (source, actor) => { claims.push([source, actor]); source.claim = actor; return true; },
    release: (source, actor) => releases.push([source, actor]),
  };
  const forageActor = makeActor(1, { cx: 0, cz: 0, ai: { avoidSourceT: 0 } });
  const forageCtx = {
    actor: forageActor, ai: forageActor.ai, p: config.forActor(forageActor),
    api: {
      food: () => food,
      pathTo: () => [{ x: 1, z: 0 }],
      setPath: () => true,
      face: () => {},
    },
  };
  assert.equal(forageModule.acquire(forageCtx), forageSource);
  assert.equal(claims[0][0], forageSource);
  assert.equal(claims[0][1], forageActor);
  assert.equal(forageActor.ai.source, forageSource);

  const blockedForage = {
    actor: makeActor(2), p: config.forActor(makeActor(2)),
    api: { food: () => null },
    field: { food },
  };
  blockedForage.ai = blockedForage.actor.ai;
  assert.equal(forageModule.acquire(blockedForage), null,
    'null provider blocks forage even when field.food exists');
  assert.equal(releases.length, 0);

  const hiveSource = {
    id: 'hive-1', kind: 'hive', ripe: true, satiation: .5,
    x: 1, z: 0, approachX: 1, approachZ: 0,
  };
  const hiveClaims = [];
  const hiveFood = {
    nearestRipe: () => hiveSource,
    claim: (source, actor) => { hiveClaims.push(actor); return true; },
    release: () => {},
  };
  const hiveActor = makeActor(3, { hunger: .99, health: 100, bold: .9 });
  const hiveCtx = {
    actor: hiveActor, ai: hiveActor.ai, p: config.forActor(hiveActor),
    api: {
      food: () => hiveFood,
      pathTo: () => [{ x: 1, z: 0 }],
      setPath: () => true,
      face: () => {},
    },
  };
  assert.equal(hiveModule.acquire(hiveCtx), hiveSource);
  assert.deepEqual(hiveClaims, [hiveActor]);

  const spots = [{ x: 5, z: 0 }, { x: 1, z: 0 }, { x: 3, z: 0 }];
  const waterActor = makeActor(4, { cx: 0, cz: 0 });
  const waterCtx = {
    actor: waterActor, ai: waterActor.ai,
    api: {
      waterSpots: () => spots,
      pathTo: () => [{ x: 1, z: 0 }],
      setPath: () => true,
      face: () => {},
    },
  };
  assert.equal(waterModule.acquire(waterCtx), spots[1], 'nearest spot keeps order and identity');
  assert.equal(waterActor.ai.waterSpot, spots[1]);

  const waterBlockedActor = makeActor(5);
  const waterBlocked = {
    actor: waterBlockedActor, ai: waterBlockedActor.ai,
    api: { waterSpots: () => null },
    field: { waterSpots: spots },
  };
  assert.equal(waterModule.acquire(waterBlocked), null);
  assert.equal(waterBlockedActor.ai.state, 'wander');
});

test('conflict finds and releases contested food through api.food()', () => {
  const other = makeActor(2, { cx: 1, cz: 0, ai: { state: 'wander' } });
  const actor = makeActor(1, { cx: 0, cz: 0, hunger: .8 });
  const source = {
    id: 'flower-1', kind: 'flower', ripe: true, claim: other,
    x: 1, z: 0, approachX: 1, approachZ: 0,
  };
  const findCtx = {
    actor, ai: actor.ai, p: config.forActor(actor),
    field: { food: { sources: [] } },
    api: {
      food: () => ({ sources: [source] }),
      profile: (who) => config.forActor(who),
      coverConflictOutcome: () => {},
    },
  };
  const contest = conflictModule.findContest(findCtx);
  assert.equal(contest.source, source);
  assert.equal(contest.actor, other);
  assert.equal(conflictModule.findContest({
    ...findCtx, api: { ...findCtx.api, food: () => null },
  }), null, 'null provider blocks conflict even when field.food has sources');

  const writes = [];
  const finishActor = makeActor(1, { scale: 2, cx: 0, cz: 0 });
  const finishOther = makeActor(2, { scale: 1, cx: 1, cz: 0 });
  source.claim = finishOther;
  finishActor.ai.state = 'conflict';
  finishActor.ai.partner = finishOther;
  finishActor.ai.conflictSource = source;
  finishActor.ai.conflictT = .1;
  finishOther.ai.state = 'conflict';
  finishOther.ai.partner = finishActor;
  finishOther.ai.conflictSource = source;
  finishOther.ai.conflictT = .1;
  const registry = {
    release: (src, who) => writes.push(['release', src, who]),
    claim: (src, who) => writes.push(['claim', src, who]),
  };
  const finishCtx = {
    actor: finishActor, ai: finishActor.ai, p: config.forActor(finishActor),
    rng: () => .5, features: {}, field: {},
    api: {
      food: () => registry,
      profile: (who) => config.forActor(who),
      coverConflictOutcome: () => {},
      releaseFood: () => {},
      stop: () => {}, emit: () => {}, startEat: () => {},
      setDestination: () => true,
    },
  };
  conflictModule.finishConflict(finishCtx);
  assert.deepEqual(writes, [
    ['release', source, finishOther],
    ['claim', source, finishActor],
    ['release', source, finishOther],
  ]);
});

test('gifting starts from a supplied food registry when field.food is absent', () => {
  const giver = makeActor(1, {
    cx: 0, cz: 0, hunger: .2, thirst: .2, health: 100, lastGiftDay: 0,
  });
  const recipient = makeActor(2, { cx: 2, cz: 0, hunger: .5, health: 100 });
  const source = {
    id: 'gift-food', kind: 'flower', ripe: true, satiation: .3,
    x: 2, z: 0, approachX: 2, approachZ: 0, claim: null,
  };
  const claims = [];
  const food = {
    nearestRipe: () => source,
    claim: (src, actor) => { claims.push(actor); src.claim = actor; return true; },
    release: () => {},
    consume: () => true,
  };
  const field = { portions: null };
  const ctx = {
    actor: giver, ai: giver.ai, p: config.forActor(giver), field,
    features: { gifting: true }, mapId: 'field',
    api: {
      actors: () => [giver, recipient],
      food: () => food,
      dayNow: () => 1, hoursNow: () => 12,
      stop: () => {}, face: () => {},
      emit: () => {},
      setDestination: () => true,
    },
  };
  assert.equal(giftingModule.beginGift(ctx, recipient), true);
  assert.equal(giver.ai.state, 'seekGift');
  assert.equal(giver.ai.giftOrigin.source, source);
  assert.equal(source.claim, giver);
  assert.deepEqual(claims, [giver]);
});

test('provider and field conflict routes draw the same seeded RNG sequence', () => {
  function run(mode) {
    let seed = 7;
    const draws = [];
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = seed / 4294967296;
      draws.push(value);
      return value;
    };
    const writes = [];
    const source = {
      id: 'contested', kind: 'flower', ripe: true, claim: null,
      x: 1, z: 0, approachX: 1, approachZ: 0,
    };
    const field = {
      nav: { nearestWalkable: (x, z) => ({ x, z }), findPath: () => null },
      pond: { contains: () => false }, emote: () => {},
    };
    const registry = {
      sources: [source],
      release: (src, who) => writes.push(['release', src, who]),
      claim: (src, who) => { writes.push(['claim', src, who]); src.claim = who; return true; },
      allRipe: () => [],
    };
    if (mode === 'field') field.food = registry;
    const a = makeActor(1, { scale: 2, cx: 0, cz: 0 });
    const b = makeActor(2, { scale: 1, cx: 1, cz: 0 });
    source.claim = b;
    const engine = makeEngine({
      field, rng,
      getActors: () => [a, b],
      ...(mode === 'provider' ? { getFood: () => registry } : {}),
    });
    engine.attach(a);
    engine.attach(b);
    assert.equal(engine.forceConflict(a, b, source).ok, true);
    a.ai.conflictT = .001;
    b.ai.conflictT = .001;
    engine.tick(a, .01);
    return { draws, writes, state: a.ai.state };
  }

  const provided = run('provider');
  const fieldRoute = run('field');
  assert.equal(provided.draws.length, 2);
  assert.equal(fieldRoute.draws.length, 2);
  assert.deepEqual(provided.draws, fieldRoute.draws);
  assert.deepEqual(provided.writes, fieldRoute.writes);
  assert.equal(provided.state, fieldRoute.state);
});

test('null actor home lookups do not query the provider', () => {
  let calls = 0;
  const engine = makeEngine({
    getHomes: () => {
      calls++;
      throw new Error('homes provider must not be queried for a null actor');
    },
  });
  assert.equal(engine.api.assignHome(null), null);
  assert.equal(engine.api.homeFor(null), null);
  assert.equal(calls, 0);
});

test('releaseFood skips a null food provider when there is no source', () => {
  let calls = 0;
  const field = {
    get food() { throw new Error('field food must not be read as a fallback'); },
  };
  const actor = makeActor(1);
  const engine = makeEngine({
    field,
    getFood: () => {
      calls++;
      throw new Error('food provider must not be queried without a source');
    },
  });
  assert.doesNotThrow(() => engine.api.releaseFood(actor));
  assert.equal(calls, 0);
  assert.equal(actor.ai.source, null);

  actor.ai.source = { id: 'held-source' };
  const blocked = makeEngine({ field, getFood: () => null });
  assert.doesNotThrow(() => blocked.api.releaseFood(actor));
  assert.equal(actor.ai.source, null, 'a missing provider still clears the source');
});

test('forced eat returns the seeking result when api.food() is null', () => {
  const field = {
    get food() { throw new Error('field food must not be read as a fallback'); },
  };
  const engine = makeEngine({ field, getFood: () => null });
  const actor = makeActor(1);
  let result = null;
  assert.doesNotThrow(() => {
    result = engine.debugState(actor, 'eat');
  });
  assert.deepEqual(result, {
    ok: false, state: 'seekFood', note: 'no food target; seeking',
  });
  assert.equal(actor.ai.state, 'seekFood');
});

test('forage failed-destination release and resume claims tolerate a null provider', () => {
  const field = {
    get food() { throw new Error('field food must not be read as a fallback'); },
  };
  const source = {
    id: 'forage-source', kind: 'flower', ripe: true, satiation: .3,
    x: 5, z: 0, approachX: 5, approachZ: 0,
  };
  const actor = makeActor(1, { ai: { state: 'seekFood', source } });
  source.claim = actor;
  const thinkCtx = {
    actor, ai: actor.ai, p: config.forActor(actor), field,
    api: {
      food: () => null,
      needsReplan: () => true,
      setDestination: () => false,
    },
  };
  assert.doesNotThrow(() => forageModule.think(thinkCtx));
  assert.equal(actor.ai.source, null);
  assert.equal(actor.ai.state, 'wander');
  assert.equal(actor.ai.idleT, .7);

  for (const state of ['eat', 'seekFood']) {
    const resumer = makeActor(state === 'eat' ? 2 : 3, {
      ai: { state, source: { ...source, claim: null } },
    });
    const claimCtx = {
      actor: resumer, ai: resumer.ai, p: config.forActor(resumer), field,
      api: { food: () => null },
    };
    let resumed = false;
    assert.doesNotThrow(() => {
      resumed = forageModule.resume(claimCtx);
    });
    assert.equal(resumed, true);
    assert.equal(resumer.ai.source, null);
    assert.equal(resumer.ai.nextThink, 0);
    assert.equal(resumer.ai.state, 'seekFood');
  }
});

test('hive finish skips consume and still cleans up with a null provider', () => {
  const source = {
    id: 'hive-source', kind: 'hive', ripe: true, satiation: .5,
    x: 1, y: .5, z: 0, approachX: 1, approachZ: 0,
  };
  const actor = makeActor(1, {
    ai: { state: 'raidHive', source, raidT: .05 },
  });
  const ctx = {
    actor, ai: actor.ai, p: config.forActor(actor), field: {},
    rng: () => 1,
    api: { food: () => null, stop: () => {} },
  };
  assert.doesNotThrow(() => hiveModule.tick({ ...ctx, dt: .1 }));
  assert.equal(actor.ai.source, null);
  assert.equal(actor.ai.target, null);
  assert.equal(actor.ai.state, 'wander');
  assert.equal(actor.ai.idleT, .9);
  assert.equal(actor.ai.taskCooldown, 1.3);
});

test('conflict finish skips registry writes and still cleans up with a null provider', () => {
  const actor = makeActor(1, {
    scale: 2, cx: 0, cz: 0, ai: { state: 'conflict' },
  });
  const other = makeActor(2, {
    scale: 1, cx: 1, cz: 0, ai: { state: 'conflict' },
  });
  const source = {
    id: 'conflict-source', kind: 'flower', ripe: true, claim: other,
    x: 1, z: 0, approachX: 1, approachZ: 0,
  };
  actor.ai.partner = other;
  actor.ai.conflictSource = source;
  actor.ai.conflictT = .1;
  other.ai.partner = actor;
  other.ai.conflictSource = source;
  other.ai.conflictT = .1;
  const field = {
    get food() { throw new Error('field food must not be read as a fallback'); },
  };
  const ctx = {
    actor, ai: actor.ai, p: config.forActor(actor), rng: () => .5,
    features: {}, field,
    api: {
      food: () => null,
      profile: (who) => config.forActor(who),
      coverConflictOutcome: () => {},
      releaseFood: () => {},
      stop: () => {}, emit: () => {}, startEat: () => {},
      setDestination: () => true,
    },
  };
  assert.doesNotThrow(() => conflictModule.finishConflict(ctx));
  assert.equal(actor.ai.partner, null);
  assert.equal(other.ai.partner, null);
  assert.equal(other.ai.state, 'wander');
  assert.equal(source.claim, other, 'skipped writes leave the existing claim untouched');
});

test('gifting beginGift release is skipped when the food provider becomes null', () => {
  const giver = makeActor(1, {
    cx: 0, cz: 0, hunger: .2, thirst: .2, health: 100, lastGiftDay: 0,
  });
  const recipient = makeActor(2, { cx: 2, cz: 0, hunger: .5, health: 100 });
  const source = {
    id: 'gift-release-source', kind: 'flower', ripe: true, satiation: .3,
    x: 2, z: 0, approachX: 2, approachZ: 0, claim: null,
  };
  let foodReads = 0;
  let released = 0;
  const food = {
    nearestRipe: () => source,
    claim: (src, actor) => { src.claim = actor; return true; },
    release: () => { released++; },
  };
  const countingRecipient = { ...recipient };
  let aiReads = 0;
  Object.defineProperty(countingRecipient, 'ai', {
    get() {
      aiReads++;
      // candidateFor reads ai four times; beginPair's first ai read fails.
      return aiReads >= 5 ? null : recipient.ai;
    },
  });
  const ctx = {
    actor: giver, ai: giver.ai, p: config.forActor(giver),
    field: { portions: null }, features: { gifting: true }, mapId: 'field',
    api: {
      actors: () => [giver, recipient],
      food: () => {
        foodReads++;
        return foodReads === 1 ? food : null;
      },
      dayNow: () => 1, hoursNow: () => 12,
      stop: () => {}, face: () => {}, emit: () => {},
      setDestination: () => true,
    },
  };
  let started = true;
  assert.doesNotThrow(() => {
    started = giftingModule.beginGift(ctx, countingRecipient);
  });
  assert.equal(started, false);
  assert.equal(aiReads, 5);
  assert.equal(foodReads, 2);
  assert.equal(released, 0, 'release is skipped when the provider is unavailable');
  assert.equal(source.claim, giver, 'skipped release keeps the claim as-is');
  assert.equal(giver.ai.giftRetryT, ctx.p.gifting.retryT);
});
