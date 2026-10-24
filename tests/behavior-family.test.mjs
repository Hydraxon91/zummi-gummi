import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { familyTaskModule } from '../src/behaviors/family.js';
import { INTERACTIONS, cancelTask } from '../src/interactions.js';
import { createPairFixture } from './helpers/behavior-conformance.mjs';

const bear = { uid: 1, species: 'bear', kind: 'bear', stage: 'adult', sex: 'F', home: 'Home 1', skills: { forage: .6, courage: .3, social: .3 } };
const config = createBehaviorConfig();
const p = config.forActor(bear);

function baseActor(uid, extra = {}) {
  return {
    uid, active: true, species: 'bear', kind: 'bear', stage: 'child', sex: 'M', home: 'Home 1',
    cx: 0, cz: 0, cy: 1, hunger: .6, thirst: .3, energy: 1, health: 100, social: .5, affection: .4,
    bold: .5, bonds: {}, skills: { forage: 0, courage: 0, social: 0 }, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false, inside: false,
    ai: { state: 'familyTask', familyTask: null, partner: null, taskCooldown: 0, socialCooldown: 0, familyPlay: false, playmateKind: null, playdate: false },
    ...extra,
  };
}

function ctx(a, actors, extra = {}) {
  return {
    actor: a, ai: a.ai, p,
    api: {
      actors: () => actors,
      homeFor: () => ({ name: 'Home 1', door: { x: 1, z: 0 }, x: 0, z: 0 }),
      dayNow: () => 1, hoursNow: () => 12, isDayFor: () => true,
      emit: () => {}, stop: () => {}, setDestination: () => true,
      cancelTask: () => {},
      profile: () => p,
      ...extra,
    },
  };
}

test('meal relief .28, bond .05 and radius 2.6', () => {
  const a = baseActor(1);
  const near = baseActor(2, { home: 'Home 1', cx: 2.6, cz: 0 });
  const far = baseActor(3, { home: 'Home 1', cx: 2.7, cz: 0 });
  const actors = [a, near, far];
  a.ai.familyTask = { id: INTERACTIONS.familyMeal, phase: 'act', role: 'host', t: 0 };
  familyTaskModule.finish(ctx(a, actors));
  assert.ok(Math.abs(a.hunger - .32) < 1e-9);
  assert.ok(Math.abs(a.bonds['2'] - .05) < 1e-9, 'near housemate gains .05');
  assert.equal(a.bonds['3'], undefined, 'outside 2.6 m gets no bond');
  assert.ok(a.history.some(event => event.kind === 'meal'));
});

test('quirk 22: active directive blocks a lesson, queued directive does not', () => {
  const teacher = baseActor(1, {
    stage: 'adult', cx: 0, cz: 0,
    skills: { forage: .6, courage: .3, social: .3 },
  });
  const student = baseActor(2, {
    stage: 'teen', cx: .5, cz: 0, parentUids: [1],
    ai: { state: 'wander', familyTask: null, partner: null, directive: null, directives: [], taskCooldown: 0 },
  });
  const ctxValue = ctx(teacher, [teacher, student]);
  student.ai.directive = { kind: 'go', ttl: 10, target: { x: 1, z: 1 } };
  assert.equal(familyTaskModule.lessonCandidate(ctxValue), null, 'active directive blocks');
  student.ai.directive = null;
  student.ai.directives = [{ kind: 'go', ttl: 10, target: { x: 1, z: 1 } }];
  const candidate = familyTaskModule.lessonCandidate(ctxValue);
  assert.ok(candidate && candidate.student === student, 'queued directive does not block');
});

test('playdate completion grants .18 bond and history', () => {
  const a = baseActor(1);
  const b = baseActor(2, { cx: .5 });
  a.ai.familyTask = { id: INTERACTIONS.familyPlaydate, phase: 'act', role: 'host', t: 0 };
  a.ai.partner = b;
  b.ai.partner = a;
  b.ai.state = 'familyTask';
  b.ai.familyTask = { id: INTERACTIONS.familyPlaydate, phase: 'act', role: 'guest', t: 0 };
  a.playdates = {}; b.playdates = {};
  familyTaskModule.finish(ctx(a, [a, b]));
  assert.ok(Math.abs(a.bonds['2'] - .18) < 1e-9);
  assert.ok(a.history.some(event => event.kind === 'playdate'));
});

test('family module does not write partner/familyTask directly', () => {
  const source = readFileSync(new URL('../src/behaviors/family.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.partner\s*=/);
  assert.doesNotMatch(source, /\.familyTask\s*=/);
});

test('reciprocal playdate cancellation clears both sides and mirrors without rewards', () => {
  const a = baseActor(1);
  const b = baseActor(2, { cx: .5 });
  for (const actor of [a, b]) {
    actor.ai.familyPlay = true;
    actor.ai.playmateKind = 'sibling';
    actor.ai.playdate = true;
    actor.ai.playdateHome = 'Home 1';
    actor.ai.playdateTarget = { x: 1, z: 0 };
  }
  a.ai.familyTask = { id: INTERACTIONS.familyPlaydate, mode: 'pair', phase: 'act', role: 'host', t: 5 };
  b.ai.familyTask = { id: INTERACTIONS.familyPlaydate, mode: 'pair', phase: 'act', role: 'guest', t: 5 };
  a.ai.partner = b;
  b.ai.partner = a;
  const stopped = [];
  cancelTask(a, { stop: actor => stopped.push(actor.uid) });

  assert.deepEqual(stopped, [1, 2], 'both participants stopped once');
  for (const actor of [a, b]) {
    assert.equal(actor.ai.familyTask, null);
    assert.equal(actor.ai.partner, null);
    assert.equal(actor.ai.state, 'wander');
    assert.equal(actor.ai.idleT, .5);
    assert.equal(actor.ai.familyPlay, false);
    assert.equal(actor.ai.playmateKind, null);
    assert.equal(actor.ai.playdate, false);
    assert.equal(actor.ai.playdateHome, null);
    assert.equal(actor.ai.playdateTarget, null);
  }
  assert.equal(a.bonds['2'], undefined, 'cancelled host gains no bond');
  assert.equal(b.bonds['1'], undefined, 'cancelled guest gains no bond');
  assert.deepEqual(a.history, []);
  assert.deepEqual(b.history, []);

  const before = JSON.stringify([a.ai, b.ai]);
  cancelTask(b, { stop: actor => stopped.push(actor.uid) });
  assert.equal(JSON.stringify([a.ai, b.ai]), before, 'a repeated cancel is inert');
  assert.deepEqual(stopped, [1, 2], 'a repeated cancel does not stop again');
});

test('stall recovery cancels both playdate participants with no bond or history', () => {
  const { actors, engine } = createPairFixture();
  const [a, b] = actors;
  a.cx = 0; a.cz = 0;
  b.cx = 10; b.cz = 0;
  const forced = engine.forcePlaydate(a, b, 'sibling');
  assert.equal(forced.ok, true);
  assert.equal(a.ai.familyTask.id, INTERACTIONS.familyPlaydate);
  assert.equal(b.ai.familyTask.id, INTERACTIONS.familyPlaydate);

  // The host holds still on a travel task long enough to cross the 6 s
  // no-progress threshold; recovery uses the real modules engine.
  for (let i = 0; i < 7; i++) engine.tick(a, 1, { ready: true });

  assert.equal(a.ai.recoveries, 1, 'stall recovery ran once');
  for (const [actor, other] of [[a, b], [b, a]]) {
    assert.equal(actor.ai.familyTask, null);
    assert.equal(actor.ai.partner, null);
    assert.equal(actor.ai.state, 'wander');
    assert.equal(actor.ai.familyPlay, false);
    assert.equal(actor.ai.playmateKind, null);
    assert.equal(actor.ai.playdate, false);
    assert.equal(actor.ai.playdateHome, null);
    assert.equal(actor.ai.playdateTarget, null);
    assert.equal(actor.bonds[String(other.uid)], undefined);
    assert.deepEqual(actor.history, []);
  }
});
