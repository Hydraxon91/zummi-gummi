import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { familyTaskModule } from '../src/behaviors/family.js';
import { INTERACTIONS } from '../src/interactions.js';

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
