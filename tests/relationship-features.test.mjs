import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld } from '../scripts/behavior-parity.mjs';
import { friendshipLabel, setRival } from '../src/relationships.js';

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

function setup(list, features = {}, extra = {}) {
  const world = extra.world || createWorld();
  const engine = createBehavior({
    engine: 'modules',
    config: createBehaviorConfig({ features: { interactionHistory: true, ...features } }),
    field: world,
    getActors: () => list,
    getHours: () => 12,
    getDay: () => 1,
    getPopulationCap: () => 40,
    getMapId: () => extra.mapId || 'field',
    rng: extra.rng || (() => .5),
  });
  engine.registerAdapter('softbody', adapter());
  for (const value of list) engine.attach(value);
  return { engine, world, list };
}

function tickBoth(engine, a, b, seconds = 8) {
  for (let elapsed = 0; elapsed < seconds; elapsed += .2) {
    engine.tick(a, .2, { ready: true });
    engine.tick(b, .2, { ready: true });
  }
}

test('friendship labels remain read-only display thresholds', () => {
  assert.equal(friendshipLabel(0), 'acquaintance');
  assert.equal(friendshipLabel(.18), 'familiar');
  assert.equal(friendshipLabel(.35), 'friend');
  assert.equal(friendshipLabel(.65), 'close friend');
});

test('chat completes once, relieves social need and records both sides', () => {
  const a = actor(10);
  const b = actor(11, { cx: 3.25 });
  const { engine } = setup([a, b], { pairActivities: true });
  const result = engine.forceChat(a, b);
  assert.equal(result.ok, true);
  assert.equal(a.ai.state, 'seekChat');
  tickBoth(engine, a, b, 10);
  assert.equal(a.ai.state, 'wander');
  assert.equal(b.ai.state, 'wander');
  assert.ok(Math.abs(a.bonds['11'] - .02) < 1e-9);
  assert.ok(Math.abs(b.bonds['10'] - .02) < 1e-9);
  assert.equal(a.history.some(event => event.kind === 'chat'), true);
  assert.equal(b.history.some(event => event.kind === 'chat'), true);
  assert.ok(a.ai.chatCooldown > 0);
  assert.ok(b.ai.chatCooldown > 0);
});

test('cuddle requires a reciprocal bond threshold and applies its larger gain', () => {
  const a = actor(10);
  const b = actor(11, { cx: 3.25 });
  const { engine } = setup([a, b], { pairActivities: true });
  assert.equal(engine.forceCuddle(a, b).ok, false);
  engine.setBond(a, b, .4);
  assert.equal(engine.forceCuddle(a, b).ok, true);
  tickBoth(engine, a, b, 12);
  assert.ok(a.bonds['11'] >= .44 - 1e-9);
  assert.equal(a.history.some(event => event.kind === 'cuddle'), true);
});

test('critical thirst interrupts chat without a bond award', () => {
  const a = actor(10);
  const b = actor(11, { cx: 3.25 });
  const { engine } = setup([a, b], { pairActivities: true });
  assert.equal(engine.forceChat(a, b).ok, true);
  a.thirst = .99;
  engine.tick(a, .2, { ready: true });
  assert.notEqual(a.ai.state, 'chat');
  assert.notEqual(a.ai.state, 'seekChat');
  assert.equal(a.bonds['11'], undefined);
});

test('reconciliation clears a reciprocal rivalry and adds a small bond', () => {
  const a = actor(10);
  const b = actor(11, { cx: 3.25 });
  const { engine } = setup([a, b], { reconciliation: true });
  setRival(a, b, { day: 1, hour: 10 });
  assert.equal(a.rivals['11'] !== undefined, true);
  assert.equal(engine.forceReconcile(a, b).ok, true);
  tickBoth(engine, a, b, 10);
  assert.equal(a.rivals && Object.keys(a.rivals).length, 0);
  assert.equal(b.rivals && Object.keys(b.rivals).length, 0);
  assert.ok(Math.abs(a.bonds['11'] - .04) < 1e-9);
  assert.equal(a.history.some(event => event.kind === 'reconcile'), true);
});

test('interrupted reconciliation records a failed-attempt cooldown', () => {
  const a = actor(10);
  const b = actor(11, { cx: 3.25 });
  const { engine } = setup([a, b], { reconciliation: true });
  setRival(a, b, { day: 1, hour: 10 });
  assert.equal(engine.forceReconcile(a, b).ok, true);
  engine.cancelPair(a);
  assert.ok(a.ai.reconcileCooldown >= 29.9);
  assert.equal(a.rivals['11'] !== undefined, true);
});

test('partnership requires adult, compatible, strongly bonded actors and is reciprocal', () => {
  const a = actor(10, { sex: 'F' });
  const b = actor(11, { sex: 'M', cx: 3.25 });
  const { engine } = setup([a, b], { partnership: true });
  assert.equal(engine.forcePartnership(a, b).ok, false);
  engine.setBond(a, b, .65);
  assert.equal(engine.forcePartnership(a, b).ok, true);
  tickBoth(engine, a, b, 10);
  assert.equal(a.partnerUid, 11);
  assert.equal(b.partnerUid, 10);
  assert.equal(a.history.some(event => event.kind === 'partnered'), true);
  assert.equal(engine.separatePartnership(a), true);
  assert.equal(a.partnerUid, undefined);
  assert.equal(b.partnerUid, undefined);
  assert.equal(a.history.some(event => event.kind === 'separated'), true);
});

test('group activity completes once for all members with one bond per pair', () => {
  const members = [
    actor(10), actor(11, { cx: 3.25 }), actor(12, { cx: 1.9, cz: 1.5 }), actor(13, { cx: 1.9, cz: -.5 }),
  ];
  const { engine } = setup(members, { groupActivities: true });
  assert.equal(engine.forceGroup(members[0], members.slice(1)).ok, true);
  assert.equal(members.every(member => member.ai.state === 'group'), true);
  for (const member of members) {
    member.cx = member.ai.groupSlot.x;
    member.cz = member.ai.groupSlot.z;
  }
  engine.tick(members[0], .2, { ready: true });
  engine.tick(members[0], 10.5, { ready: true });
  assert.equal(members.every(member => member.ai.state === 'wander'), true);
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      assert.ok(Math.abs(members[i].bonds[String(members[j].uid)] - .01) < 1e-9);
    }
  }
  assert.equal(members[0].history.some(event => event.kind === 'groupGather'), true);
});

test('the natural opportunity starts chat without a forced pair', () => {
  const a = actor(10);
  const b = actor(11, { cx: 3.25 });
  const { engine } = setup([a, b], { pairActivities: true });
  const opportunity = engine.api.runOpportunity(a, 'affection.chat');
  assert.equal(opportunity?.id, 'affection.chat');
  assert.equal(a.ai.state, 'seekChat');
  assert.equal(b.ai.state, 'seekChat');
});

test('critical thirst removes one group member and dissolves below three', () => {
  const members = [
    actor(10), actor(11, { cx: 3.25 }), actor(12, { cx: 1.9, cz: 1.5 }), actor(13, { cx: 1.9, cz: -.5 }),
  ];
  const { engine } = setup(members, { groupActivities: true });
  assert.equal(engine.forceGroup(members[0], members.slice(1)).ok, true);
  members[0].thirst = .99;
  engine.tick(members[0], .2, { ready: true });
  assert.notEqual(members[0].ai.state, 'group');
  assert.equal(members[1].ai.state, 'group');
  assert.equal(members[1].ai.group.members.length, 3);
  members[1].thirst = .99;
  engine.tick(members[1], .2, { ready: true });
  assert.equal(members.every(member => member.ai.state !== 'group'), true);
});

test('group completion effects are applied exactly once', () => {  const members = [
    actor(10), actor(11, { cx: 3.25 }), actor(12, { cx: 1.9, cz: 1.5 }),
  ];
  const { engine } = setup(members, { groupActivities: true });
  assert.equal(engine.forceGroup(members[0], members.slice(1)).ok, true);
  for (const member of members) {
    member.cx = member.ai.groupSlot.x;
    member.cz = member.ai.groupSlot.z;
  }
  engine.tick(members[0], .2, { ready: true });
  engine.tick(members[0], 10.5, { ready: true });
  const first = members[0].bonds['11'];
  engine.tick(members[0], .2, { ready: true });
  engine.tick(members[1], .2, { ready: true });
  assert.equal(members[0].bonds['11'], first);
});

test('natural group and reconciliation opportunities start from real eligibility', () => {
  const a = actor(10, { rivals: { 11: { sinceDay: 1, sinceHour: 2 } } });
  const b = actor(11, { cx: 3.25, rivals: { 10: { sinceDay: 1, sinceHour: 2 } } });
  const c = actor(12, { cx: 3.3, cz: 1 });
  const { engine } = setup([a, b, c], { reconciliation: true, groupActivities: true });
  assert.equal(engine.api.runOpportunity(a, 'relationship.reconcile')?.id,
    'relationship.reconcile');
  engine.cancelPair(a);
  engine.setFeature('reconciliation', false);
  // Group eligibility needs two more idle candidates.
  assert.equal(engine.api.runOpportunity(a, 'group.seek')?.id, 'group.seek');
});

test('cuddle requires both directions, not only the pair average', () => {
  const a = actor(10);
  const b = actor(11, { cx: 3.25 });
  const { engine } = setup([a, b], { pairActivities: true });
  a.bonds['11'] = .7;
  b.bonds['10'] = 0;
  assert.equal(engine.forceCuddle(a, b).ok, false);
});

test('a Glass actor can participate in a group activity', () => {
  const members = [
    actor(10), actor(11, { cx: 3.25 }),
    actor(12, { cx: 1.9, cz: 1.5, kind: 'glass', species: 'glass' }),
  ];
  const { engine } = setup(members, { groupActivities: true });
  assert.equal(engine.forceGroup(members[0], members.slice(1)).ok, true);
  for (const member of members) {
    member.cx = member.ai.groupSlot.x;
    member.cz = member.ai.groupSlot.z;
  }
  engine.tick(members[0], .2, { ready: true });
  engine.tick(members[0], 10.5, { ready: true });
  assert.equal(members[2].history.some(event => event.kind === 'groupGather'), true);
  assert.ok(members[0].bonds['12'] >= .01);
});

function runNewFeature(kind) {
  let draws = 0;
  const counted = () => { draws++; return .5; };
  const a = actor(10, kind === 'partner' ? { sex: 'F' } : {});
  const b = actor(11, { cx: 3.25, sex: 'M' });
  const c = actor(12, { cx: 1.9, cz: 1.5 });
  const d = actor(13, { cx: 1.9, cz: -.5 });
  const list = kind === 'group' ? [a, b, c, d] : [a, b];
  const features = {
    pairActivities: kind === 'chat' || kind === 'cuddle',
    reconciliation: kind === 'reconcile',
    partnership: kind === 'partner',
    groupActivities: kind === 'group',
  };
  const { engine } = setup(list, features, { rng: counted });
  if (kind === 'cuddle') engine.setBond(a, b, .4);
  if (kind === 'reconcile') setRival(a, b, { day: 1, hour: 2 });
  if (kind === 'partner') engine.setBond(a, b, .7);
  const baseline = draws;
  if (kind === 'chat') engine.forceChat(a, b);
  if (kind === 'cuddle') engine.forceCuddle(a, b);
  if (kind === 'reconcile') engine.forceReconcile(a, b);
  if (kind === 'partner') engine.forcePartnership(a, b);
  if (kind === 'group') {
    engine.forceGroup(a, [b, c, d]);
    for (const member of list) {
      member.cx = member.ai.groupSlot.x;
      member.cz = member.ai.groupSlot.z;
    }
  }
  for (let n = 0; n < 80; n++) {
    if (kind === 'group') {
      engine.tick(a, n === 0 ? .2 : 10.5, { ready: true });
      if (a.ai.state !== 'group') break;
    } else {
      engine.tick(a, .2, { ready: true });
      if (a.ai.state === 'wander') break;
      engine.tick(b, .2, { ready: true });
    }
  }
  return {
    draws: draws - baseline,
    trace: JSON.stringify(list.map(member => ({
      uid: member.uid, state: member.ai.state,
      bond: member.bonds[String(list.find(other => other !== member).uid)],
    }))),
  };
}

test('new interactions draw no RNG and repeat identically at the same seed', () => {
  for (const kind of ['chat', 'cuddle', 'reconcile', 'partner', 'group']) {
    const first = runNewFeature(kind);
    const second = runNewFeature(kind);
    assert.equal(first.draws, 0, `${kind} draws no RNG`);
    assert.equal(first.trace, second.trace, `${kind} is deterministic`);
  }
});

test('a committed farewell ends the partnership on both sides', () => {
  const a = actor(10, { sex: 'F' });
  const b = actor(11, { sex: 'M', cx: 3.25 });
  const { engine } = setup([a, b], { partnership: true });
  engine.setBond(a, b, .7);
  assert.equal(engine.forcePartnership(a, b).ok, true);
  tickBoth(engine, a, b, 10);
  assert.equal(a.partnerUid, 11);
  engine.commitFarewell(a);
  assert.equal(a.partnerUid, undefined);
  assert.equal(b.partnerUid, undefined);
  assert.equal(b.history.some(event => event.kind === 'separated'), true);
});
