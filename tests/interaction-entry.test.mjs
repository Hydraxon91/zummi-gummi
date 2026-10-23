import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAR_PROFILE } from '../src/behaviorprofiles.js';
import { socialModule } from '../src/behaviors/social.js';
import { linkPartner } from '../src/interactions.js';

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
  const values = [];
  return {
    rng: () => {
      const value = next();
      values.push(value);
      return value;
    },
    values: () => values,
  };
}

function actor(uid, extra = {}) {
  return {
    uid, active: true, kind: 'bear', species: 'bear', stage: 'adult',
    name: `bear-${uid}`, home: 'Home A', cx: uid === 1 ? 0 : 1.2, cz: 0, cy: 1,
    sex: uid % 2 ? 'F' : 'M', hunger: .3, thirst: .3, health: 100, energy: 1,
    social: .8, affection: .8, bold: .5, bonds: {}, skills: {}, playdates: {},
    history: [], grabs: 0, inPond: false, sleeping: false, inside: false,
    ai: {
      state: 'seekCompany', partner: null, socialCooldown: 0, target: null,
      visitHome: null, visitRole: null, visitPhase: null, visitArrived: false,
      visitT: 0, moving: false, path: null, pathIndex: 0, faceYaw: null,
      idleT: 0, taskCooldown: 0, inviteAccepted: null, inviteT: 0,
      declineT: 0, socialT: 0, heartT: 0, animT: 0,
    },
    ...extra,
  };
}

const HOME = { name: 'Home A', x: 10, z: 8, door: { x: 9.2, z: 7.4 } };

function context(actorValue, partner, rng, trace = [], options = {}) {
  const nav = options.nav || { nearestWalkable: (x, z) => ({ x: x + .1, z: z - .1 }) };
  return {
    actor: actorValue,
    ai: actorValue.ai,
    p: BEAR_PROFILE,
    field: options.field || { pond: { contains: () => false } },
    rng,
    features: {},
    config: null,
    api: {
      profile: (who) => {
        trace.push(['profile', who.uid]);
        return BEAR_PROFILE;
      },
      face: (who, x, z) => trace.push(['face', who.uid, +x.toFixed(6), +z.toFixed(6)]),
      emit: (who, kind, scale) => trace.push(['emit', who.uid, kind, scale]),
      stop: (who) => trace.push(['stop', who.uid]),
      setPath: (who, path) => trace.push(['setPath', who.uid,
        path.map(point => [+point.x.toFixed(6), +point.z.toFixed(6)])]),
      setDestination: (who, x, z) => trace.push(['setDestination', who.uid, +x.toFixed(6), +z.toFixed(6)]),
      isDayFor: options.isDayFor || (() => true),
      homeFor: options.homeFor || (() => HOME),
      navigation: options.navigation || (() => nav),
      pathTo: (who, x, z) => {
        trace.push(['pathTo', who.uid, +x.toFixed(6), +z.toFixed(6)]);
        return [{ x, z }];
      },
      actors: () => [partner],
      releaseFood: () => {},
      needsReplan: () => false,
      cancelPair: () => {},
      dayNow: () => 1,
      hoursNow: () => 12,
    },
  };
}

test('linkPartner writes one side, returns true and preserves partner identity', () => {
  const a = actor(1);
  const b = actor(2);
  assert.equal(linkPartner(a, b), true);
  assert.equal(a.ai.partner, b);
  assert.equal(a.ai.partner === b, true, 'same object reference');
  assert.equal(b.ai.partner, null, 'partner side is not written');

  const c = actor(3);
  assert.equal(linkPartner(a, c), true);
  assert.equal(a.ai.partner, c, 'a later own-side call replaces only the acting link');
  assert.equal(b.ai.partner, null);
});

test('linkPartner rejects invalid actors and self without writing', () => {
  const a = actor(1);
  const b = actor(2);
  assert.equal(linkPartner(a, b), true);
  const badActors = [null, undefined, {}, { ai: null }, { ai: undefined }];
  for (const bad of badActors) {
    assert.equal(linkPartner(bad, b), false);
    assert.equal(linkPartner(bad, a), false);
  }
  const badPartners = [null, undefined, {}, { ai: null }, { ai: undefined }];
  for (const bad of badPartners) {
    assert.equal(linkPartner(a, bad), false);
  }
  assert.equal(linkPartner(a, a), false, 'self is not a pair entry');
  assert.equal(a.ai.partner, b, 'failed calls leave the link untouched');
  assert.equal(b.ai.partner, null);
});

test('accepted invite keeps the entry write and callback order', () => {
  const a = actor(1);
  const b = actor(2);
  const counted = countedRng(0);
  const trace = [];
  const ctx = context(a, b, counted.rng, trace);

  assert.equal(socialModule.startInvite(ctx, b, true), true);
  assert.deepEqual(trace, [
    ['face', 1, 1.2, 0],
    ['profile', 2],
    ['profile', 2],
    ['face', 2, 0, 0],
    ['emit', 1, 'question', 1.08],
  ]);
  assert.equal(counted.values().length, 0, 'an explicit acceptance draws no RNG');
  assert.equal(a.ai.state, 'invite');
  assert.equal(b.ai.state, 'invite');
  assert.equal(a.ai.partner, b);
  assert.equal(b.ai.partner, a);
  assert.equal(a.ai.inviteAccepted, true);
  assert.equal(b.ai.inviteAccepted, true);
  assert.equal(a.ai.inviteT, .7);
  assert.equal(b.ai.inviteT, .7);
  assert.equal(b.ai.declineT, .9);
  assert.deepEqual(a.ai.target, { x: b.cx, z: b.cz });
  assert.deepEqual(b.ai.target, { x: a.cx, z: a.cz });
  assert.equal(a.ai.moving, false);
  assert.equal(b.ai.moving, false);
  assert.equal(a.ai.path, null);
  assert.equal(b.ai.path, null);
});

test('declined invite keeps the entry write and callback order', () => {
  const a = actor(1);
  const b = actor(2);
  const counted = countedRng(0);
  const trace = [];
  const ctx = context(a, b, counted.rng, trace);

  assert.equal(socialModule.startInvite(ctx, b, false), true);
  assert.deepEqual(trace, [
    ['face', 1, 1.2, 0],
    ['profile', 2],
    ['profile', 2],
    ['face', 2, 0, 0],
    ['emit', 1, 'question', 1.08],
  ]);
  assert.equal(counted.values().length, 0);
  assert.equal(a.ai.state, 'invite');
  assert.equal(b.ai.state, 'decline');
  assert.equal(a.ai.partner, b);
  assert.equal(b.ai.partner, a);
  assert.equal(a.ai.inviteAccepted, false);
  assert.equal(b.ai.inviteAccepted, false);
  assert.equal(b.ai.declineT, .9);
});

test('invite RNG decision keeps one draw and fixed trace', () => {
  const a = actor(1);
  const b = actor(2);
  const counted = countedRng(11);
  const trace = [];
  const ctx = context(a, b, counted.rng, trace);

  assert.equal(socialModule.startInvite(ctx, b), true);
  assert.deepEqual(trace, [
    ['profile', 2],
    ['face', 1, 1.2, 0],
    ['profile', 2],
    ['profile', 2],
    ['face', 2, 0, 0],
    ['emit', 1, 'question', 1.08],
  ]);
  assert.deepEqual(counted.values(), [.5115870486479253]);
  assert.equal(a.ai.inviteAccepted, true);
  assert.equal(b.ai.state, 'invite');

  const refused = actor(1);
  const refuser = actor(2);
  const refusedRng = countedRng(4);
  const refusedCtx = context(refused, refuser, refusedRng.rng);
  assert.equal(socialModule.startInvite(refusedCtx, refuser), true);
  assert.deepEqual(refusedRng.values(), [.9236361971125007]);
  assert.equal(refused.ai.inviteAccepted, false);
  assert.equal(refuser.ai.state, 'decline');
});

test('invite acceptance uses the partner profile hurt/tired thresholds', () => {
  const healthy = actor(1);
  const healthyPartner = actor(2);
  const healthyRng = countedRng(11);
  const healthyCtx = context(healthy, healthyPartner, healthyRng.rng);
  assert.equal(socialModule.startInvite(healthyCtx, healthyPartner), true);
  assert.equal(healthy.ai.inviteAccepted, true);
  assert.equal(healthyPartner.ai.state, 'invite');

  const weak = actor(1);
  const tiredPartner = actor(2, { health: 20, energy: .1 });
  const weakRng = countedRng(11);
  const weakTrace = [];
  const weakCtx = context(weak, tiredPartner, weakRng.rng, weakTrace);
  assert.equal(socialModule.startInvite(weakCtx, tiredPartner), true);
  assert.deepEqual(weakRng.values(), [.5115870486479253]);
  assert.equal(weak.ai.inviteAccepted, false);
  assert.equal(tiredPartner.ai.state, 'decline');
  assert.equal(weakTrace[0][0], 'profile');
  assert.equal(weakTrace[0][1], 2, 'decision reads the partner profile');
});

test('invite prerequisites fail before writes and self is refused', () => {
  const a = actor(1);
  const b = actor(2, { inside: true });
  const counted = countedRng(0);
  const trace = [];
  const ctx = context(a, b, counted.rng, trace);
  const before = { a: { ...a.ai }, b: { ...b.ai } };

  assert.equal(socialModule.startInvite(ctx, b), false);
  assert.deepEqual(trace, []);
  assert.equal(counted.values().length, 0);
  assert.equal(a.ai.state, before.a.state);
  assert.equal(a.ai.partner, before.a.partner);
  assert.equal(b.ai.state, before.b.state);
  assert.equal(b.ai.partner, before.b.partner);

  const selfTrace = [];
  const selfCounted = countedRng(0);
  const selfCtx = context(a, a, selfCounted.rng, selfTrace);
  assert.equal(socialModule.startInvite(selfCtx, a), false);
  assert.deepEqual(selfTrace, []);
  assert.equal(selfCounted.values().length, 0);
  assert.equal(a.ai.partner, null);
});

test('invite entry leaves incidental family and visit state untouched', () => {
  const taskA = { id: 'familyMeal', phase: 'act' };
  const taskB = { id: 'familyLesson', phase: 'travel' };
  const a = actor(1, {
    familyTask: taskA, familyPlay: true, playmateKind: 'sibling',
  });
  a.ai.familyTask = taskA;
  a.ai.familyPlay = true;
  a.ai.playmateKind = 'sibling';
  a.ai.visitHome = 'Old Home';
  a.ai.visitRole = 'guest';
  a.ai.visitPhase = 'hangout';
  a.ai.playdate = { partnerUid: 2, day: 2 };
  a.ai.playdateHome = 'Home B';
  a.ai.playdateTarget = { x: 1, z: 2 };
  const b = actor(2);
  b.ai.familyTask = taskB;
  b.ai.familyPlay = true;
  b.ai.playmateKind = 'sibling';
  b.ai.playdate = { partnerUid: 1, day: 2 };
  b.ai.playdateHome = 'Home A';
  b.ai.playdateTarget = { x: 2, z: 1 };
  const ctx = context(a, b, countedRng(0).rng);

  assert.equal(socialModule.startInvite(ctx, b, true), true);
  assert.equal(a.ai.familyTask, taskA);
  assert.equal(b.ai.familyTask, taskB);
  assert.equal(a.ai.familyPlay, true);
  assert.equal(b.ai.familyPlay, true);
  assert.equal(a.ai.playmateKind, 'sibling');
  assert.equal(b.ai.playmateKind, 'sibling');
  assert.deepEqual(a.ai.playdate, { partnerUid: 2, day: 2 });
  assert.equal(a.ai.playdateHome, 'Home B');
  assert.deepEqual(a.ai.playdateTarget, { x: 1, z: 2 });
  assert.deepEqual(b.ai.playdate, { partnerUid: 1, day: 2 });
  assert.equal(b.ai.playdateHome, 'Home A');
  assert.deepEqual(b.ai.playdateTarget, { x: 2, z: 1 });
  assert.equal(a.ai.visitHome, 'Old Home');
  assert.equal(a.ai.visitRole, 'guest');
  assert.equal(a.ai.visitPhase, 'hangout');
});

test('visit entry keeps host/guest, home target, path and callback order', () => {
  const a = actor(1);
  const b = actor(2);
  const counted = countedRng(0);
  const trace = [];
  const ctx = context(a, b, counted.rng, trace);

  assert.equal(socialModule.startVisit(ctx, b), true);
  assert.deepEqual(trace, [
    ['face', 1, 9.2, 7.4],
    ['face', 2, 9.732, 6.724],
    ['pathTo', 1, 9.2, 7.4],
    ['setPath', 1, [[9.2, 7.4]]],
    ['pathTo', 2, 9.732, 6.724],
    ['setPath', 2, [[9.732, 6.724]]],
    ['emit', 1, 'heart', .95],
  ]);
  assert.equal(counted.values().length, 0, 'visit entry draws no RNG');
  assert.equal(a.ai.state, 'visit');
  assert.equal(b.ai.state, 'visit');
  assert.equal(a.ai.partner, b);
  assert.equal(b.ai.partner, a);
  assert.equal(a.ai.visitHome, 'Home A');
  assert.equal(b.ai.visitHome, 'Home A');
  assert.equal(a.ai.visitRole, 'host');
  assert.equal(b.ai.visitRole, 'guest');
  assert.equal(a.ai.visitPhase, 'travel');
  assert.equal(b.ai.visitPhase, 'travel');
  assert.equal(a.ai.visitT, 0);
  assert.equal(b.ai.visitT, 0);
  assert.equal(a.ai.visitArrived, false);
  assert.equal(b.ai.visitArrived, false);
  assert.deepEqual(a.ai.target, { x: 9.2, z: 7.4 });
  assert.deepEqual(b.ai.target, { x: 9.732, z: 6.724 });
});

test('visit uses the door fallback when nearestWalkable returns nothing', () => {
  const a = actor(1);
  const b = actor(2);
  const trace = [];
  const ctx = context(a, b, countedRng(0).rng, trace, {
    nav: { nearestWalkable: () => null },
  });

  assert.equal(socialModule.startVisit(ctx, b), true);
  assert.deepEqual(b.ai.target, { x: 9.2, z: 7.4 });
  assert.deepEqual(trace, [
    ['face', 1, 9.2, 7.4],
    ['face', 2, 9.2, 7.4],
    ['pathTo', 1, 9.2, 7.4],
    ['setPath', 1, [[9.2, 7.4]]],
    ['pathTo', 2, 9.2, 7.4],
    ['setPath', 2, [[9.2, 7.4]]],
    ['emit', 1, 'heart', .95],
  ]);
});

test('visit entry leaves incidental family state untouched', () => {
  const taskA = { id: 'familyMeal', phase: 'act' };
  const taskB = { id: 'familyLesson', phase: 'travel' };
  const a = actor(1);
  a.ai.familyTask = taskA;
  a.ai.familyPlay = true;
  a.ai.playmateKind = 'sibling';
  a.ai.playdate = { partnerUid: 2, day: 2 };
  a.ai.playdateHome = 'Home B';
  a.ai.playdateTarget = { x: 1, z: 2 };
  const b = actor(2);
  b.ai.familyTask = taskB;
  b.ai.familyPlay = true;
  b.ai.playmateKind = 'sibling';
  b.ai.playdate = { partnerUid: 1, day: 2 };
  b.ai.playdateHome = 'Home A';
  b.ai.playdateTarget = { x: 2, z: 1 };
  const ctx = context(a, b, countedRng(0).rng);

  assert.equal(socialModule.startVisit(ctx, b), true);
  assert.equal(a.ai.familyTask, taskA);
  assert.equal(b.ai.familyTask, taskB);
  assert.equal(a.ai.familyPlay, true);
  assert.equal(b.ai.familyPlay, true);
  assert.equal(a.ai.playmateKind, 'sibling');
  assert.equal(b.ai.playmateKind, 'sibling');
  assert.deepEqual(a.ai.playdate, { partnerUid: 2, day: 2 });
  assert.equal(a.ai.playdateHome, 'Home B');
  assert.deepEqual(a.ai.playdateTarget, { x: 1, z: 2 });
  assert.deepEqual(b.ai.playdate, { partnerUid: 1, day: 2 });
  assert.equal(b.ai.playdateHome, 'Home A');
  assert.deepEqual(b.ai.playdateTarget, { x: 2, z: 1 });
});

test('visit prerequisites fail before writes and self is refused', () => {
  for (const options of [
    { isDayFor: () => false },
    { homeFor: () => null },
    { navigation: () => null },
  ]) {
    const a = actor(1);
    const b = actor(2);
    const counted = countedRng(0);
    const trace = [];
    const ctx = context(a, b, counted.rng, trace, options);
    assert.equal(socialModule.startVisit(ctx, b), false);
    assert.deepEqual(trace, []);
    assert.equal(counted.values().length, 0);
    assert.equal(a.ai.state, 'seekCompany');
    assert.equal(b.ai.state, 'seekCompany');
    assert.equal(a.ai.partner, null);
    assert.equal(b.ai.partner, null);
  }

  const a = actor(1);
  const selfCtx = context(a, a, countedRng(0).rng);
  assert.equal(socialModule.startVisit(selfCtx, a), false);
  assert.equal(a.ai.state, 'seekCompany');
  assert.equal(a.ai.partner, null);
});
