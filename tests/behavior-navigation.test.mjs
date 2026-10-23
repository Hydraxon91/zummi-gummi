import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorModules } from '../src/behaviors/engine.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { socialModule } from '../src/behaviors/social.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function countedRng(seed) {
  const next = mulberry32(seed);
  let draws = 0;
  return {
    rng: () => {
      draws++;
      return next();
    },
    draws: () => draws,
  };
}

function actor(uid, extra = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear', stage: 'adult', age: 500,
    cx: uid, cz: 0, cy: 1, hunger: .2, thirst: .2, energy: 1, health: 100,
    social: .3, affection: .25, bold: .5, home: '', parentUids: [],
    sex: uid === 1 ? 'F' : 'M', bonds: {}, skills: {}, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false, mateCooldown: 0,
    ...extra,
  };
}

function engineFor(actors, options = {}) {
  return createBehaviorModules({
    getActors: () => actors,
    getHours: () => 12,
    getDay: () => 0,
    getPopulationCap: () => 40,
    getAdapter: () => ({ onStop: () => {} }),
    ...options,
  });
}

function attachAll(engine, actors) {
  for (const member of actors) engine.attach(member);
}

function setWander(actor) {
  actor.ai.state = 'wander';
  actor.ai.moving = false;
  actor.ai.path = null;
  actor.ai.target = null;
  actor.ai.idleT = 0;
  actor.ai.nextThink = 0;
  actor.ai.arrived = false;
}

test('getNavigation is optional and rejects non-function non-null values', () => {
  assert.doesNotThrow(() => engineFor([]));
  assert.doesNotThrow(() => engineFor([], { getNavigation: null }));
  for (const value of ['nav', 1, false, {}, []]) {
    assert.throws(
      () => engineFor([], { getNavigation: value }),
      TypeError,
    );
  }
});

test('navigation returns the provider value by identity and observes replacement', () => {
  const first = { tag: 'first' };
  const second = { tag: 'second' };
  let current = first;
  const engine = engineFor([], { getNavigation: () => current });

  assert.equal(engine.api.navigation(), first);
  current = second;
  assert.equal(engine.api.navigation(), second);
  current = null;
  assert.equal(engine.api.navigation(), null);
});

test('omitted provider falls back to the current field navigator', () => {
  const first = { tag: 'first' };
  const second = { tag: 'second' };
  const field = { nav: first };
  const engine = engineFor([], { field });

  assert.equal(engine.api.navigation(), first);
  field.nav = second;
  assert.equal(engine.api.navigation(), second);
  field.nav = null;
  assert.equal(engine.api.navigation(), null);
});

test('a provider result of null is authoritative and never falls back to field.nav', () => {
  let fieldCalls = 0;
  const field = {
    nav: {
      findPath() { fieldCalls++; return [{ x: 9, z: 9 }]; },
      nearestWalkable() { fieldCalls++; return { x: 9, z: 9 }; },
    },
  };
  const engine = engineFor([], { field, getNavigation: () => null });
  const member = actor(1);
  engine.attach(member);

  assert.equal(engine.api.navigation(), null);
  assert.equal(engine.api.pathTo(member, 1, 1), null);
  assert.equal(engine.api.setDestination(member, 10, 10), false);
  assert.deepEqual(member.ai.target, { x: 10, z: 10 });
  assert.equal(member.ai.path, null);
  assert.equal(fieldCalls, 0);
});

test('provider exceptions propagate from navigation and pathTo unchanged', () => {
  const failure = new Error('navigation unavailable');
  const engine = engineFor([], { getNavigation: () => { throw failure; } });

  assert.throws(() => engine.api.navigation(), error => error === failure);
  assert.throws(
    () => engine.api.pathTo({ cx: 0, cz: 0 }, 1, 1),
    error => error === failure,
  );
});

test('pathTo uses a provider navigator by receiver and preserves path/node identity', () => {
  const node = { x: 2, z: 3 };
  const path = [node];
  const nav = {
    findPath(fromX, fromZ, toX, toZ) {
      assert.equal(this, nav);
      assert.deepEqual([fromX, fromZ, toX, toZ], [0, 0, 4, 5]);
      return path;
    },
  };
  const engine = engineFor([], { getNavigation: () => nav });

  const result = engine.api.pathTo({ cx: 0, cz: 0 }, 4, 5);
  assert.equal(result, path);
  assert.equal(result[0], node);
});

test('the explicit findPath callback keeps precedence over the provider', () => {
  const path = [{ x: 4, z: 5 }];
  let providerCalls = 0;
  const engine = engineFor([], {
    findPath: () => path,
    getNavigation: () => {
      providerCalls++;
      throw new Error('provider must not run for the callback');
    },
  });

  assert.equal(engine.api.pathTo({ cx: 0, cz: 0 }, 4, 5), path);
  assert.equal(providerCalls, 0);
});

test('a callback null result does not fall back to the provider', () => {
  let providerCalls = 0;
  const engine = engineFor([], {
    findPath: () => null,
    getNavigation: () => {
      providerCalls++;
      return { findPath: () => [{ x: 1, z: 1 }] };
    },
  });

  assert.equal(engine.api.pathTo({ cx: 0, cz: 0 }, 4, 5), null);
  assert.equal(providerCalls, 0);
});

test('setDestination resolves the provider without a rendered field', () => {
  const path = [{ x: 4, z: 5 }];
  const nav = {
    nearestWalkable(x, z) {
      assert.equal(this, nav);
      assert.deepEqual([x, z], [5, 6]);
      return { x: 4, z: 5 };
    },
    findPath(fromX, fromZ, toX, toZ) {
      assert.equal(this, nav);
      assert.deepEqual([fromX, fromZ, toX, toZ], [0, 0, 4, 5]);
      return path;
    },
  };
  const member = actor(1, { cx: 0, cz: 0 });
  const engine = engineFor([member], { getNavigation: () => nav });
  engine.attach(member);

  assert.equal(engine.api.setDestination(member, 5, 6), true);
  assert.deepEqual(member.ai.target, { x: 4, z: 5 });
  assert.equal(member.ai.path, path);
  assert.equal(member.ai.path[0], path[0]);
});

test('setDestination keeps the absent-navigation target policy', () => {
  const member = actor(1, { cx: 0, cz: 0 });
  const engine = engineFor([member]);
  engine.attach(member);

  assert.equal(engine.api.setDestination(member, 10, 10), false);
  assert.deepEqual(member.ai.target, { x: 10, z: 10 });
  assert.equal(member.ai.path, null);
});

test('non-group consumers invoke nearestWalkable without fabricating a fallback', () => {
  const nav = { findPath: () => [{ x: 1, z: 1 }] };

  const destinationActor = actor(1);
  const destinationEngine = engineFor([destinationActor], { getNavigation: () => nav });
  destinationEngine.attach(destinationActor);
  assert.throws(() => destinationEngine.api.setDestination(destinationActor, 5, 5), TypeError);

  const fleeActor = actor(2);
  const fleeEngine = engineFor([fleeActor], { getNavigation: () => nav });
  fleeEngine.attach(fleeActor);
  assert.throws(() => fleeEngine.api.startFlee(fleeActor, { x: 0, z: 0 }), TypeError);

  const wanderActor = actor(3);
  const wanderEngine = engineFor([wanderActor], { getNavigation: () => nav });
  wanderEngine.attach(wanderActor);
  assert.throws(
    () => wanderEngine.api.runOpportunity(wanderActor, 'wander.target'),
    TypeError,
  );

  const host = actor(4, { home: 'Home A' });
  const guest = actor(5, { home: 'Home A' });
  const visitEngine = engineFor([host, guest], {
    field: visitField(),
    getNavigation: () => nav,
  });
  attachAll(visitEngine, [host, guest]);
  assert.throws(() => visitEngine.forceVisit(host, guest), TypeError);
});

test('wander resolves a provider with no field and preserves the returned path', () => {
  const path = [{ x: 3, z: 4 }];
  const nav = {
    nearestWalkable: (x, z) => ({ x: x + .1, z: z + .1 }),
    findPath: () => path,
  };
  const member = actor(1, { cx: 1, cz: 2 });
  const engine = engineFor([member], {
    getNavigation: () => nav,
    rng: mulberry32(17),
  });
  engine.attach(member);
  setWander(member);

  assert.equal(engine.api.runOpportunity(member, 'wander.target').id, 'wander.target');
  assert.ok(member.ai.target);
  assert.equal(member.ai.path, path);
  assert.equal(member.ai.path[0], path[0]);
});

function runWanderFixture(mode, seed) {
  const counter = countedRng(seed);
  const calls = [];
  const nav = {
    nearestWalkable(x, z) {
      calls.push(['nearest', x, z]);
      return { x, z };
    },
    findPath(fromX, fromZ, toX, toZ) {
      calls.push(['path', fromX, fromZ, toX, toZ]);
      return [{ x: toX, z: toZ }];
    },
  };
  const member = actor(1, { cx: 3, cz: -2 });
  const options = { rng: counter.rng };
  if (mode === 'field') {
    options.field = { nav, pond: { contains: () => false } };
  } else {
    options.getNavigation = () => nav;
  }
  const engine = engineFor([member], options);
  engine.attach(member);
  setWander(member);
  engine.api.runOpportunity(member, 'wander.target');
  return {
    draws: counter.draws(),
    target: member.ai.target,
    path: member.ai.path,
    calls,
  };
}

test('wander keeps seeded RNG order, draws and paths versus the original field fixture', () => {
  for (const seed of [1, 0x12345678, 99991]) {
    assert.deepEqual(
      runWanderFixture('provider', seed),
      runWanderFixture('field', seed),
      `seed ${seed}`,
    );
  }
});

test('flee uses the navigation provider without a field and keeps path identity', () => {
  const path = [{ x: 6, z: 0 }];
  const nav = {
    nearestWalkable(x, z) {
      assert.deepEqual([x, z], [6.5, 0]);
      return { x: 6, z: 0 };
    },
    findPath(fromX, fromZ, toX, toZ) {
      assert.deepEqual([fromX, fromZ, toX, toZ], [2, 0, 6, 0]);
      return path;
    },
  };
  const member = actor(1, { cx: 2, cz: 0 });
  const engine = engineFor([member], { getNavigation: () => nav });
  engine.attach(member);

  engine.api.startFlee(member, { x: 0, z: 0 });
  assert.equal(member.ai.state, 'flee');
  assert.deepEqual(member.ai.target, { x: 6, z: 0 });
  assert.equal(member.ai.path, path);
});

test('flee keeps its absent-navigation state semantics', () => {
  const member = actor(1, { cx: 2, cz: 0 });
  const engine = engineFor([member]);
  engine.attach(member);

  assert.doesNotThrow(() => engine.api.startFlee(member, { x: 0, z: 0 }));
  assert.equal(member.ai.state, 'flee');
  assert.equal(member.ai.target, null);
  assert.equal(member.ai.path, null);
});

function visitField(extra = {}) {
  return {
    homes: [{ name: 'Home A', x: 10, z: 8, door: { x: 9.2, z: 7.4 } }],
    pond: { contains: () => false },
    ...extra,
  };
}

test('social visit uses the navigation provider without field.nav or pond', () => {
  const paths = [];
  const nav = {
    nearestWalkable: (x, z) => ({ x, z }),
    findPath(fromX, fromZ, toX, toZ) {
      const path = [{ x: toX, z: toZ }];
      paths.push(path);
      return path;
    },
  };
  const host = actor(1, { home: 'Home A', cx: 0, cz: 0 });
  const guest = actor(2, { home: 'Home A', cx: 2, cz: 0 });
  const engine = engineFor([host, guest], {
    field: { homes: visitField().homes },
    getNavigation: () => nav,
  });
  attachAll(engine, [host, guest]);

  const result = engine.forceVisit(host, guest);
  assert.equal(result.ok, true);
  assert.equal(host.ai.state, 'visit');
  assert.equal(guest.ai.state, 'visit');
  assert.deepEqual(host.ai.target, { x: 9.2, z: 7.4 });
  assert.equal(host.ai.path, paths[0]);
  assert.equal(guest.ai.path, paths[1]);
});

test('startVisit tolerates an absent rendered field when navigation is supplied', () => {
  const home = { name: 'Home A', x: 10, z: 8, door: { x: 9.2, z: 7.4 } };
  const nav = {
    nearestWalkable: (x, z) => ({ x: x + .25, z: z - .25 }),
    findPath: (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }],
  };
  const host = actor(1, { home: 'Home A', cx: 0, cz: 0 });
  const guest = actor(2, { home: 'Home A', cx: 2, cz: 0 });
  host.ai = { state: 'wander', partner: null };
  guest.ai = { state: 'wander', partner: null };
  const paths = [];
  const hub = {
    actor: host,
    ai: host.ai,
    partner: guest,
    api: {
      isDayFor: () => true,
      homeFor: () => home,
      navigation: () => nav,
      pathTo: (who, x, z) => [{ x, z }],
      setPath: (who, path) => paths.push({ who, path }),
      face: () => {},
      emit: () => {},
    },
  };

  assert.equal(socialModule.startVisit(hub, guest), true);
  assert.equal(host.ai.state, 'visit');
  assert.equal(guest.ai.state, 'visit');
  assert.deepEqual(guest.ai.target, { x: 9.882, z: 6.574 });
  assert.equal(paths.length, 2);
});

test('startVisit still applies the pond check when a field is present', () => {
  const home = { name: 'Home A', x: 10, z: 8, door: { x: 9.2, z: 7.4 } };
  const nav = {
    nearestWalkable: () => ({ x: 9.5, z: 6.5 }),
    findPath: (fromX, fromZ, toX, toZ) => [{ x: toX, z: toZ }],
  };
  const host = actor(1, { home: 'Home A', cx: 0, cz: 0 });
  const guest = actor(2, { home: 'Home A', cx: 2, cz: 0 });
  host.ai = { state: 'wander', partner: null };
  guest.ai = { state: 'wander', partner: null };
  const hub = {
    actor: host,
    ai: host.ai,
    partner: guest,
    field: { pond: { contains: () => true } },
    api: {
      isDayFor: () => true,
      homeFor: () => home,
      navigation: () => nav,
      pathTo: (who, x, z) => [{ x, z }],
      setPath: () => {},
      face: () => {},
      emit: () => {},
    },
  };

  assert.equal(socialModule.startVisit(hub, guest), true);
  assert.deepEqual(guest.ai.target, { x: 9.2, z: 7.4 });
});

test('a null provider blocks social visit even when field.nav exists', () => {
  const field = visitField({
    nav: {
      nearestWalkable() { throw new Error('field navigator must not run'); },
      findPath() { throw new Error('field navigator must not run'); },
    },
  });
  const host = actor(1, { home: 'Home A' });
  const guest = actor(2, { home: 'Home A' });
  const engine = engineFor([host, guest], {
    field,
    getNavigation: () => null,
  });
  attachAll(engine, [host, guest]);

  const result = engine.forceVisit(host, guest);
  assert.equal(result.ok, false);
  assert.equal(host.ai.state, 'wander');
});

test('social visit retains the missing-navigation refusal', () => {
  const host = actor(1, { home: 'Home A' });
  const guest = actor(2, { home: 'Home A' });
  const engine = engineFor([host, guest], { field: visitField() });
  attachAll(engine, [host, guest]);

  const result = engine.forceVisit(host, guest);
  assert.equal(result.ok, false);
  assert.equal(host.ai.state, 'wander');
});

function groupConfig() {
  return createBehaviorConfig({ features: { groupActivities: true } });
}

function groupActors() {
  return [
    actor(1, { cx: 0, cz: 0 }),
    actor(2, { cx: 5, cz: 0 }),
    actor(3, { cx: 0, cz: 5 }),
  ];
}

test('group activities resolve provider slots and travel without a field', () => {
  const calls = [];
  const nav = {
    nearestWalkable(x, z) {
      calls.push(['nearest', x, z]);
      return { x, z };
    },
    findPath(fromX, fromZ, toX, toZ) {
      calls.push(['path', fromX, fromZ, toX, toZ]);
      return [{ x: toX, z: toZ }];
    },
  };
  const members = groupActors();
  const engine = engineFor(members, {
    config: groupConfig(),
    getNavigation: () => nav,
  });
  attachAll(engine, members);

  const result = engine.forceGroup(members[0], members.slice(1));
  assert.equal(result.ok, true);
  assert.equal(members[0].ai.state, 'group');
  assert.equal(calls.filter(call => call[0] === 'nearest').length, 3);
  for (const member of members) {
    assert.ok(Number.isFinite(member.ai.groupSlot.x));
    assert.ok(Number.isFinite(member.ai.groupSlot.z));
  }

  for (const member of members) engine.tick(member, .1);
  assert.ok(calls.some(call => call[0] === 'path'));
  assert.ok(members.some(member => member.ai.path));
});

test('group slot generation permits a navigator without nearestWalkable', () => {
  const nav = { findPath: () => [{ x: 1, z: 1 }] };
  const members = groupActors();
  const engine = engineFor(members, {
    config: groupConfig(),
    getNavigation: () => nav,
  });
  attachAll(engine, members);

  const result = engine.forceGroup(members[0], members.slice(1));
  assert.equal(result.ok, true);
  for (const member of members) {
    assert.ok(Number.isFinite(member.ai.groupSlot.x));
    assert.ok(Number.isFinite(member.ai.groupSlot.z));
  }
});

function runGroupFixture(mode, seed) {
  const counter = countedRng(seed);
  const calls = [];
  const nav = {
    nearestWalkable(x, z) {
      calls.push(['nearest', x, z]);
      return { x, z };
    },
    findPath(fromX, fromZ, toX, toZ) {
      calls.push(['path', fromX, fromZ, toX, toZ]);
      return [{ x: toX, z: toZ }];
    },
  };
  const members = groupActors();
  const options = {
    config: groupConfig(),
    rng: counter.rng,
  };
  if (mode === 'field') options.field = { nav };
  else options.getNavigation = () => nav;
  const engine = engineFor(members, options);
  attachAll(engine, members);

  const acquired = engine.forceGroup(members[0]);
  for (const member of members) engine.tick(member, .1);
  return {
    draws: counter.draws(),
    acquired,
    calls,
    trace: members.map(member => ({
      state: member.ai.state,
      slot: member.ai.groupSlot,
      target: member.ai.target,
      path: member.ai.path,
    })),
  };
}

test('enabled group activities preserve seeded RNG order against the field fixture', () => {
  for (const seed of [7, 2026]) {
    assert.deepEqual(
      runGroupFixture('provider', seed),
      runGroupFixture('field', seed),
      `seed ${seed}`,
    );
  }
});
