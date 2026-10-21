import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
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

function setup({ gifting = true, interactionHistory = true } = {}) {
  const world = createWorld();
  const giver = actor(10);
  const receiver = actor(11, { cx: 3.25, hunger: .5 });
  const engine = createBehavior({
    engine: 'modules',
    config: createBehaviorConfig({ features: { gifting, interactionHistory } }),
    field: world,
    getActors: () => [giver, receiver],
    getHours: () => 12,
    getDay: () => 1,
    getPopulationCap: () => 40,
    rng: () => .5,
  });
  engine.registerAdapter('softbody', adapter());
  engine.attach(giver);
  engine.attach(receiver);
  return { engine, giver, receiver, world };
}

function tick(engine, actor, seconds = 4) {
  for (let elapsed = 0; elapsed < seconds; elapsed += .2) {
    engine.tick(actor, .2, { ready: true });
  }
}

test('an accepted gift consumes one source, feeds the receiver and records the delta', () => {
  const { engine, giver, receiver, world } = setup();
  const result = engine.forceGift(giver, receiver);
  assert.equal(result.ok, true);
  const source = giver.ai.source;
  assert.equal(source.claim, giver);
  tick(engine, giver, 4);
  assert.equal(source.ripe, false);
  assert.equal(giver.ai.source, null);
  assert.equal(giver.ai.state, 'wander');
  assert.equal(receiver.ai.state, 'wander');
  assert.equal(receiver.hunger < .5, true);
  assert.equal(giver.lastGiftDay, 1);
  const event = giver.history.find(e => e.kind === 'gift');
  assert.equal(event.uid, receiver.uid);
  assert.equal(event.bondBefore, 0);
  assert.equal(event.bondAfter, .04);
  assert.equal(receiver.history.some(e => e.kind === 'receivedGift'), true);
});

test('a receiver who is no longer hungry causes a refusal without consuming food', () => {
  const { engine, giver, receiver } = setup();
  receiver.hunger = .1;
  const result = engine.forceGift(giver, receiver);
  assert.equal(result.ok, false);
  assert.equal(giver.ai.source, null);
  assert.equal(receiver.hunger, .1);
  assert.equal(giver.lastGiftDay, undefined);
});

test('the daily cap blocks a second gift and an interrupted offer releases the claim', () => {
  const { engine, giver, receiver } = setup();
  assert.equal(engine.forceGift(giver, receiver).ok, true);
  const source = giver.ai.source;
  engine.onGrab(giver);
  assert.equal(source.claim, null);
  assert.equal(giver.ai.source, null);
  giver.lastGiftDay = 1;
  assert.equal(engine.forceGift(giver, receiver).ok, false);
});

test('gifting off adds no state and cannot start', () => {
  const { engine, giver, receiver } = setup({ gifting: false });
  assert.equal(engine.forceGift(giver, receiver).ok, false);
  assert.equal(giver.ai.source, null);
  assert.equal('giftRetryT' in giver.ai, false);
  assert.equal(giver.history.length, 0);
});

test('a Glass receiver can receive a gift', () => {
  const { engine, giver, receiver } = setup();
  receiver.kind = 'glass';
  receiver.species = 'glass';
  receiver.hunger = .5;
  assert.equal(engine.forceGift(giver, receiver).ok, true);
  tick(engine, giver, 4);
  assert.equal(giver.history.some(e => e.kind === 'gift' && e.uid === receiver.uid), true);
  assert.equal(receiver.hunger < .5, true);
});
