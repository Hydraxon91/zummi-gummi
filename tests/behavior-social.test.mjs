import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { socialModule } from '../src/behaviors/social.js';

const RACES = [
  { id: 'bear', species: 'bear', kind: 'bear' },
  { id: 'gummy', species: 'msn', kind: 'bear' },
  { id: 'glass', species: 'glass', kind: 'glass' },
];

function actor(uid, race, home, extra = {}) {
  return {
    uid, active: true, species: race.species, kind: race.kind,
    name: `${race.id}-${uid}`, home,
    cx: 0, cz: 0, cy: 1, sex: uid % 2 ? 'F' : 'M', stage: 'adult',
    hunger: .3, thirst: .3, health: 100, energy: 1, social: .8, affection: .8,
    bold: .5, bonds: {}, skills: {}, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false, inside: false,
    ai: {
      state: 'wander', partner: null, socialCooldown: 0, target: null,
      visitHome: null, visitRole: null, visitPhase: null, visitArrived: false,
      moving: false, path: null, pathIndex: 0, faceYaw: null, idleT: 0,
    },
    ...extra,
  };
}

function field() {
  return {
    homes: [
      { name: 'Home A', x: 10, z: 8, door: { x: 9.2, z: 7.4 } },
      { name: 'Home B', x: -10, z: -8, door: { x: -9.2, z: -7.4 } },
    ],
    nav: { nearestWalkable: (x, z) => ({ x, z }), findPath: () => [{ x: 9.2, z: 7.4 }] },
    pond: { contains: () => false },
  };
}

function context(race, actorValue, partner, p, apiExtra = {}) {
  return {
    actor: actorValue, ai: actorValue.ai, p,
    field: field(),
    rng: () => .5,
    api: {
      profile: (who) => (who === partner ? p : p),
      homeFor: () => field().homes[0],
      isDayFor: () => true,
      navigation: () => field().nav,
      pathTo: () => [{ x: 9.2, z: 7.4 }],
      setPath: () => true,
      setDestination: () => true,
      face: () => {},
      emit: () => {},
      stop: () => {},
      ...apiExtra,
    },
    features: {},
    config: null,
  };
}

test('quirk 25: acceptance uses the partner profile thresholds, per race', () => {
  const config = createBehaviorConfig();
  for (const race of RACES) {
    const initiator = actor(1, race, 'Home A');
    const partner = actor(2, race, 'Home B', { health: 10, energy: .1, social: .3 });
    initiator.bonds['2'] = .3;
    partner.bonds['1'] = .3;
    partner.ai.state = 'wander';
    const base = config.forActor(partner);
    let seen = null;
    const ctx = context(race, initiator, partner, base);
    ctx.rng = () => .5;
    ctx.api.profile = (who) => {
      seen = who;
      return { ...base, thresholds: { ...base.thresholds, healthHurt: 0, energyTired: 0 } };
    };
    assert.equal(socialModule.decideAccept(ctx, partner), true,
      `${race.id}: partner thresholds must remove the hurt/tired penalties`);
    assert.equal(seen, partner, `${race.id}: profile must be read for the partner`);

    ctx.api.profile = () => base;
    assert.equal(socialModule.decideAccept(ctx, partner), false,
      `${race.id}: normal partner thresholds must apply the penalties`);
  }
});

test('quirk 26: visit completion keeps the hardcoded bond/relief values, per race', () => {
  const config = createBehaviorConfig();
  for (const race of RACES) {
    const a = actor(1, race, 'Home A');
    const b = actor(2, race, 'Home B');
    a.social = .8; a.affection = .8;
    b.social = .8; b.affection = .8;
    a.bonds['2'] = .2; b.bonds['1'] = .2;
    a.ai.state = 'visit'; b.ai.state = 'visit';
    a.ai.partner = b; b.ai.partner = a;
    a.ai.visitRole = 'host'; b.ai.visitRole = 'guest';
    const ctx = context(race, a, b, config.forActor(a));
    ctx.features = { interactionHistory: true };
    socialModule.finishVisit(ctx, true);
    assert.ok(Math.abs(a.social - .58) < 1e-9, `${race.id}: initiator social relief .22`);
    assert.ok(Math.abs(a.affection - .64) < 1e-9, `${race.id}: initiator affection relief .16`);
    assert.ok(Math.abs(b.social - .58) < 1e-9, `${race.id}: partner social relief .22`);
    assert.ok(Math.abs(b.affection - .64) < 1e-9, `${race.id}: partner affection relief .16`);
    assert.equal(a.ai.socialCooldown, 8, `${race.id}: initiator cooldown 8`);
    assert.equal(b.ai.socialCooldown, 8, `${race.id}: partner cooldown 8`);
    assert.ok(Math.abs(a.bonds['2'] - .28) < 1e-9, `${race.id}: initiator bond +.08`);
    assert.ok(Math.abs(b.bonds['1'] - .28) < 1e-9, `${race.id}: partner bond +.08`);
    assert.equal(a.ai.partner, null, `${race.id}: initiator pair cleared`);
    assert.equal(b.ai.partner, null, `${race.id}: partner pair cleared`);
    assert.deepEqual(a.history.map(event => event.kind), ['hosted'], `${race.id}: host history`);
    assert.deepEqual(b.history.map(event => event.kind), ['visit'], `${race.id}: guest history`);
    assert.equal(a.history[0].bondBefore, .2);
    assert.equal(a.history[0].bondAfter, .28);
    assert.equal(b.history[0].bondBefore, .2);
    assert.equal(b.history[0].bondAfter, .28);
  }
});

test('interrupted visit close grants no bond, relief or completion history, per race', () => {
  const config = createBehaviorConfig();
  for (const race of RACES) {
    const a = actor(1, race, 'Home A');
    const b = actor(2, race, 'Home B');
    a.social = .8; a.affection = .8;
    b.social = .8; b.affection = .8;
    a.bonds['2'] = .2; b.bonds['1'] = .2;
    a.ai.state = 'visit'; b.ai.state = 'visit';
    a.ai.partner = b; b.ai.partner = a;
    a.ai.visitHome = 'Home A'; b.ai.visitHome = 'Home A';
    a.ai.visitRole = 'host'; b.ai.visitRole = 'guest';
    a.ai.visitPhase = 'travel'; b.ai.visitPhase = 'travel';
    const ctx = context(race, a, b, config.forActor(a));
    ctx.features = { interactionHistory: true };

    socialModule.finishVisit(ctx);
    assert.equal(a.bonds['2'], .2, `${race.id}: interruption keeps the initiator bond`);
    assert.equal(b.bonds['1'], .2, `${race.id}: interruption keeps the partner bond`);
    assert.equal(a.social, .8, `${race.id}: interruption grants no initiator social relief`);
    assert.equal(b.social, .8, `${race.id}: interruption grants no partner social relief`);
    assert.equal(a.affection, .8, `${race.id}: interruption grants no initiator affection relief`);
    assert.equal(b.affection, .8, `${race.id}: interruption grants no partner affection relief`);
    assert.deepEqual(a.history, [], `${race.id}: interruption writes no initiator history`);
    assert.deepEqual(b.history, [], `${race.id}: interruption writes no partner history`);
    assert.equal(a.ai.partner, null);
    assert.equal(b.ai.partner, null);
    assert.equal(a.ai.state, 'wander');
    assert.equal(b.ai.state, 'wander');
    assert.equal(a.ai.visitHome, null);
    assert.equal(b.ai.visitHome, null);
    assert.equal(a.ai.visitRole, null);
    assert.equal(b.ai.visitRole, null);
    assert.equal(a.ai.visitPhase, null);
    assert.equal(b.ai.visitPhase, null);
    assert.equal(a.ai.socialCooldown, 8);
    assert.equal(b.ai.socialCooldown, 8);

    socialModule.finishVisit(ctx);
    assert.equal(a.bonds['2'], .2, `${race.id}: repeated cleanup is inert`);
    assert.equal(b.bonds['1'], .2);
    assert.equal(a.social, .8);
    assert.equal(b.social, .8);
    assert.deepEqual(a.history, []);
    assert.deepEqual(b.history, []);
  }
});

test('quirk 27: a visit uses the initiator home for host and guest, per race', () => {
  const config = createBehaviorConfig();
  for (const race of RACES) {
    const a = actor(1, race, 'Home A');
    const b = actor(2, race, 'Home B');
    const ctx = context(race, a, b, config.forActor(a));
    assert.equal(socialModule.startVisit(ctx, b), true, `${race.id}: visit starts`);
    assert.equal(a.ai.visitHome, 'Home A', `${race.id}: host home`);
    assert.equal(b.ai.visitHome, 'Home A', `${race.id}: guest follows initiator home`);
    assert.equal(a.ai.visitRole, 'host');
    assert.equal(b.ai.visitRole, 'guest');
    assert.deepEqual(a.ai.target, { x: 9.2, z: 7.4 });
    assert.ok(Math.hypot(b.ai.target.x - 9.2, b.ai.target.z - 7.4) < .8,
      `${race.id}: guest target is near Home A, not Home B`);
  }
});
