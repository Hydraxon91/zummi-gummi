import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_LIMIT, SKILL_MAX, LESSON_GAIN,
  familyRelation, familyFor, generationOf, householdMembers,
  bondOf, pairBond, addBond, setBond,
  normalizeSkills, skillsFor, skillValue, strongestSkill, teachSkill,
  forageEatScale, courageHiveBonus, socialAcceptBonus,
  pushHistory, historyFor, normalizeHistory,
  schedulePlaydate, playdateDue, clearPlaydate, playdatesFor,
  homeRoutineOffset, routineWindowFor,
  pruneActorRefs,
} from '../src/family.js';

const actor = (uid, extra = {}) => ({
  uid, active: true, name: `A${uid}`, parentUids: [], home: 'Home 1', ...extra,
});

test('family relation covers parent, child and sibling without species branches', () => {
  const mother = actor(1);
  const father = actor(2);
  const child = actor(3, { parentUids: [1, 2] });
  const sibling = actor(4, { parentUids: [1, 2] });
  const stranger = actor(5);

  assert.equal(familyRelation(child, mother), 'parent');
  assert.equal(familyRelation(mother, child), 'child');
  assert.equal(familyRelation(child, sibling), 'sibling');
  assert.equal(familyRelation(child, stranger), null);
});

test('familyFor reports parents, siblings, children, grandparents and generation', () => {
  const grandmother = actor(1);
  const mother = actor(2, { parentUids: [1] });
  const father = actor(3);
  const child = actor(4, { parentUids: [2, 3] });
  const sibling = actor(5, { parentUids: [2, 3] });
  const grandchild = actor(6, { parentUids: [4, 99] });
  const all = [grandmother, mother, father, child, sibling, grandchild];

  const family = familyFor(child, all);
  assert.deepEqual(family.parents.map(p => p.uid), [2, 3]);
  assert.deepEqual(family.siblings.map(p => p.uid), [5]);
  assert.deepEqual(family.children.map(p => p.uid), [6]);
  assert.deepEqual(family.grandparents.map(p => p.uid), [1]);
  assert.equal(family.generation, 3);
  assert.equal(generationOf(grandchild, new Map(all.map(a => [a.uid, a]))), 4);
});

test('household membership is home-based and includes mixed species', () => {
  const bear = actor(1, { home: 'Villa A' });
  const glass = actor(2, { home: 'Villa A', kind: 'glass' });
  const other = actor(3, { home: 'Villa B' });
  assert.deepEqual(householdMembers(bear, [bear, glass, other]).map(a => a.uid), [1, 2]);
  assert.deepEqual(householdMembers(actor(4, { home: '' }), [bear]), []);
});

test('bonds stay symmetric and clamped', () => {
  const a = actor(1);
  const b = actor(2);
  addBond(a, b, .4);
  assert.equal(pairBond(a, b), .4);
  assert.equal(bondOf(a, b), .4);
  setBond(a, b, 4);
  assert.equal(pairBond(a, b), 1);
  setBond(a, b, -2);
  assert.equal(pairBond(a, b), 0);
  const c = actor(3);
  setBond(a, c, .25);
  assert.equal(bondOf(a, c), .25);
  assert.equal(bondOf(c, a), .25);
});

test('translation fixtures: asymmetric bonds average, then update symmetrically', () => {
  const a = actor(1, { bonds: { 2: .8 } });
  const b = actor(2, { bonds: { 1: .2 } });
  const unrelated = actor(3, { bonds: { 1: .9 } });

  assert.equal(bondOf(a, b), .8);
  assert.equal(bondOf(b, a), .2);
  assert.equal(pairBond(a, b), .5);
  const untouched = structuredClone(unrelated.bonds);
  assert.equal(addBond(a, b, .1), .6);
  assert.equal(bondOf(a, b), .6);
  assert.equal(bondOf(b, a), .6);
  assert.equal(pairBond(a, b), .6);
  assert.deepEqual(unrelated.bonds, untouched, 'an unrelated actor is not rewritten');
  assert.equal(setBond(a, b, 4), 1);
  assert.equal(pairBond(a, b), 1);
  assert.equal(setBond(a, b, -2), 0);
  assert.equal(pairBond(a, b), 0);
});

test('skills normalize, teach toward the parent and apply modest effects', () => {
  const parent = actor(1);
  const child = actor(2);
  parent.skills = { forage: .6, courage: .2, social: .1 };
  assert.deepEqual(normalizeSkills({ forage: 4, courage: -1, social: 'x' }), { forage: 1, courage: 0, social: 0 });
  assert.equal(strongestSkill(parent), 'forage');
  const lesson = teachSkill(child, parent);
  assert.equal(lesson.key, 'forage');
  assert.equal(lesson.gain, LESSON_GAIN);
  assert.equal(skillValue(child, 'forage'), LESSON_GAIN);
  const repeat = teachSkill(child, parent, 'forage');
  assert.equal(repeat.value, LESSON_GAIN * 2);
  child.skills.forage = SKILL_MAX;
  assert.equal(teachSkill(child, parent, 'forage').gain, 0);
  assert.ok(forageEatScale(child) < 1);
  assert.ok(courageHiveBonus(child) >= 0);
  assert.ok(socialAcceptBonus(child) >= 0);
});

test('history is bounded and pruned at the save boundary', () => {
  const a = actor(1);
  for (let i = 0; i < HISTORY_LIMIT + 4; i++) {
    pushHistory(a, { kind: 'meal', uid: 2 + (i % 2), day: 1, hour: 8 });
  }
  assert.equal(historyFor(a).length, HISTORY_LIMIT);
  assert.equal(a.history.at(-1).kind, 'meal');
  pruneActorRefs(a, new Set([2]));
  assert.ok(a.history.every(event => !event.uid || event.uid === 2));
});

test('normalizeHistory drops malformed entries and clamps fields', () => {
  const list = normalizeHistory([
    null,
    { kind: 'born', uid: '4', day: -2, hour: 99 },
    { kind: 7 },
    { kind: 'meal', uid: 'x', day: 'y', hour: 'z' },
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { kind: 'born', uid: 4, day: 0, hour: 24 });
  assert.deepEqual(list[1], { kind: 'meal', uid: 0, day: 0, hour: 0 });
});

test('playdates schedule both sides and become due on the target day', () => {
  const a = actor(1);
  const b = actor(2);
  schedulePlaydate(a, b, { day: 3, hour: 15 });
  assert.deepEqual(playdatesFor(a)['2'], { day: 3, hour: 15 });
  assert.deepEqual(playdatesFor(b)['1'], { day: 3, hour: 15 });
  assert.equal(playdateDue(a.playdates['2'], 3, 14), false);
  assert.equal(playdateDue(a.playdates['2'], 3, 15), true);
  assert.equal(playdateDue(a.playdates['2'], 4, 0), true);
  clearPlaydate(a, b);
  assert.equal(a.playdates['2'], undefined);
  assert.equal(b.playdates['1'], undefined);
});

test('routine windows use a deterministic per-home offset', () => {
  assert.equal(homeRoutineOffset('Home 1'), homeRoutineOffset('Home 1'));
  assert.ok(homeRoutineOffset('Home 1') >= 0 && homeRoutineOffset('Home 1') < .84);
  const a = actor(1, { home: 'Home 1' });
  const offset = homeRoutineOffset(a.home);
  assert.equal(routineWindowFor(a, 12 + offset).name, 'lunch');
  assert.equal(routineWindowFor(a, 9 + offset), null);
});

test('pruneActorRefs removes stale bond and playdate keys but keeps ancestry', () => {
  const a = actor(1, { parentUids: [99] });
  setBond(a, actor(2), .5);
  setBond(a, actor(3), .5);
  schedulePlaydate(a, actor(2), { day: 1, hour: 15 });
  pruneActorRefs(a, new Set([2]));
  assert.ok(a.bonds['2'] !== undefined);
  assert.equal(a.bonds['3'], undefined);
  assert.ok(a.playdates['2'] !== undefined);
  assert.deepEqual(a.parentUids, [99]);
});
