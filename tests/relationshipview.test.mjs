import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRelationshipView, pairEvents } from '../src/relationshipview.js';

function actor(uid, extra = {}) {
  return {
    uid, name: `actor-${uid}`, species: 'bear', active: true,
    parentUids: [], bonds: {}, history: [], guardianUid: undefined,
    ...extra,
  };
}

function known(actorValue, mapId = 'field') {
  return { actor: actorValue, mapId };
}

function event(kind, uid, day, hour) {
  return { kind, uid, day, hour };
}

function fixture() {
  const pip = actor(10, {
    name: 'Pip', parentUids: [1, 3, 99], guardianUid: 5,
    bonds: { 2: .72, 3: .4, 4: .9, 9: .1 },
    history: [
      event('born', 3, 1, 8),
      event('social', 2, 2, 10),
      event('meal', 2, 3, 12),
      event('social', 2, 4, 14),
      event('taught', 2, 5, 9),
      event('conflict', 3, 6, 18),
      event('stage', 0, 7, 7),
    ],
  });
  const parent = actor(1, { name: 'Mochi', parentUids: [50] });
  const sibling = actor(2, { name: 'Pebble', parentUids: [1, 3] });
  const otherParent = actor(3, { name: 'Gumdrop', bonds: { 10: .2 } });
  const grandparent = actor(50, { name: 'Toffee' });
  const guardian = actor(5, { name: 'Bramble' });
  const child = actor(6, { name: 'Pip Jr', parentUids: [10] });
  const dependent = actor(7, { name: 'Dot', stage: 'baby', guardianUid: 10 });
  const studio = actor(4, { name: 'Moss', species: 'glass' });
  return {
    pip,
    known: [
      known(pip), known(parent), known(sibling), known(otherParent),
      known(grandparent), known(guardian), known(child), known(dependent),
      known(studio, 'studio'),
    ],
  };
}

test('the view separates family, care, missing ancestry and directional bonds', () => {
  const { pip, known: records } = fixture();
  const view = buildRelationshipView(pip, records);

  assert.equal(view.actor.name, 'Pip');
  const parents = view.family.filter(row => row.relation === 'Parent');
  assert.deepEqual(parents.map(row => row.uid).sort((a, b) => a - b), [1, 3, 99]);
  assert.equal(parents.find(row => row.uid === 99).missing, true);
  assert.equal(parents.find(row => row.uid === 99).name, null);
  assert.equal(view.family.find(row => row.uid === 2).relation, 'Sibling');
  assert.equal(view.family.find(row => row.uid === 6).relation, 'Child');
  assert.equal(view.family.find(row => row.uid === 50).relation, 'Grandparent');
  assert.equal(view.care.find(row => row.uid === 5).relation, 'Guardian');
  assert.equal(view.care.find(row => row.uid === 7).relation, 'Dependent');

  assert.deepEqual(view.bonds.map(row => row.uid), [4, 2, 3, 9]);
  const asymmetric = view.bonds.find(row => row.uid === 3);
  assert.equal(asymmetric.asymmetric, true);
  assert.equal(asymmetric.bond, .4);
  assert.equal(asymmetric.reverse, .2);
  assert.equal(view.bonds.find(row => row.uid === 4).mapId, 'studio');
  assert.equal(view.bonds.find(row => row.uid === 9).missing, true);
  assert.equal(view.bonds.find(row => row.uid === 9).name, null);
});

test('pair interactions use the selected actor perspective and latest three', () => {
  const { pip, known: records } = fixture();
  const view = buildRelationshipView(pip, records);
  const pebble = view.family.find(row => row.uid === 2);
  assert.deepEqual(pebble.interactions.map(item => item.kind), ['taught', 'social', 'meal']);
  assert.deepEqual(pebble.interactions.map(item => item.day), [5, 4, 3]);
  assert.deepEqual(pairEvents(pip.history, 3).map(item => item.kind), ['conflict']);
  assert.deepEqual(pairEvents(pip.history, 99), []);
});

test('recent events are newest-first and the view does not mutate actor data', () => {
  const { pip, known: records } = fixture();
  const beforeBonds = JSON.stringify(pip.bonds);
  const beforeHistory = JSON.stringify(pip.history);
  const view = buildRelationshipView(pip, records, { eventLimit: 4, pairLimit: 2 });
  assert.deepEqual(view.events.map(item => item.kind), ['stage', 'conflict', 'taught', 'social']);
  assert.equal(view.family.find(row => row.uid === 2).interactions.length, 2);
  assert.equal(JSON.stringify(pip.bonds), beforeBonds);
  assert.equal(JSON.stringify(pip.history), beforeHistory);
});

test('a view built from another game does not leak players between rosters', () => {
  const { pip } = fixture();
  const otherGame = [known(actor(10, { name: 'Impostor', bonds: { 2: 1 } }))];
  const view = buildRelationshipView(pip, otherGame);
  assert.equal(view.bonds.find(row => row.uid === 2).missing, true);
  assert.equal(view.bonds.find(row => row.uid === 2).name, null);
});
