import test from 'node:test';
import assert from 'node:assert/strict';
import { countHomeResidents, chooseBirthHome } from '../src/homesim.js';
import { createActorView } from '../src/npc.js';

const actor = (uid, home, extra = {}) => ({ uid, active: true, home, ...extra });
const home = name => ({ name, door: { x: 0, z: 0 }, authored: true });

test('resident count includes active soft-body and Glass actors with the exact home string', () => {
  const actors = [
    actor(1, 'Villa A'),
    actor(2, 'Villa A', { kind: 'glass' }),
    actor(3, 'Villa A', { active: false }),
    actor(4, 'Villa B'),
    actor(5, 'Villa A '),
    actor(6, 'villa a'),
    actor(7, ''),
    null,
  ];
  assert.equal(countHomeResidents(actors, 'Villa A'), 2);
  assert.equal(countHomeResidents(actors, 'Villa B'), 1);
  assert.equal(countHomeResidents(actors, 'Villa A '), 1);
});

test('resident count treats a missing or empty home name as no home', () => {
  const actors = [actor(1, 'Villa A'), actor(2, '')];
  assert.equal(countHomeResidents(actors, ''), 0);
  assert.equal(countHomeResidents(actors, null), 0);
  assert.equal(countHomeResidents(actors, undefined), 0);
  assert.equal(countHomeResidents(null, 'Villa A'), 0);
});

test('mother keeps her home while residents are below capacity', () => {
  const mother = actor(1, 'Villa A');
  const residents = [mother, actor(2, 'Villa A'), actor(3, 'Villa A')];
  const homes = [home('Villa A'), home('Villa B')];
  assert.equal(chooseBirthHome({ mother, homes, residents, capacity: 4 }), 'Villa A');
});

test('capacity boundary sends the birth to the first least-populated authored home', () => {
  const mother = actor(1, 'Villa A');
  const residents = [
    mother, actor(2, 'Villa A'), actor(3, 'Villa A'), actor(4, 'Villa A'),
    actor(5, 'Villa B'), actor(6, 'Villa B'),
    actor(7, 'Villa C'), actor(8, 'Villa C'),
    actor(9, 'Villa D'), actor(10, 'Villa D'),
  ];
  const homes = [home('Villa A'), home('Villa B'), home('Villa C'), home('Villa D')];
  assert.equal(countHomeResidents(residents, 'Villa A'), 4);
  assert.equal(chooseBirthHome({ mother, homes, residents, capacity: 4 }), 'Villa B');
});

test('overflow tie preserves authored home order', () => {
  const mother = actor(1, 'Villa A');
  const residents = [
    mother, actor(2, 'Villa A'), actor(3, 'Villa A'), actor(4, 'Villa A'),
    actor(5, 'Villa B'), actor(6, 'Villa B'),
    actor(7, 'Villa C'), actor(8, 'Villa C'),
  ];
  const homes = [home('Villa A'), home('Villa B'), home('Villa C')];
  assert.equal(chooseBirthHome({ mother, homes, residents, capacity: 4 }), 'Villa B');

  const glass = actor(9, 'Villa B', { kind: 'glass' });
  residents.push(glass);
  assert.equal(chooseBirthHome({ mother, homes, residents, capacity: 4 }), 'Villa C');
});

test('an absent or empty mother preserves the current first-home fallback', () => {
  const homes = [home('Villa A'), home('Villa B')];
  const residents = [actor(1, 'Villa A'), actor(2, 'Villa A'), actor(3, 'Villa A')];
  assert.equal(chooseBirthHome({ mother: null, homes, residents, capacity: 4 }), 'Villa B');
  assert.equal(chooseBirthHome({ mother: {}, homes, residents, capacity: 4 }), 'Villa B');
  assert.equal(chooseBirthHome({ mother: { home: '' }, homes, residents, capacity: 4 }), 'Villa B');
  assert.equal(chooseBirthHome({ mother: null, homes: [home('Villa A')], residents: [], capacity: 4 }), 'Villa A');
});

test('no homes or an empty home list preserves the exact mother fallback', () => {
  const mother = actor(1, 'Villa A');
  assert.equal(chooseBirthHome({ mother, homes: null, residents: [mother], capacity: 4 }), 'Villa A');
  assert.equal(chooseBirthHome({ mother, homes: undefined, residents: [mother], capacity: 4 }), 'Villa A');
  assert.equal(chooseBirthHome({ mother: { home: '' }, homes: null, residents: [], capacity: 4 }), '');
  assert.equal(chooseBirthHome({ mother: null, homes: null, residents: [], capacity: 4 }), '');
  assert.equal(chooseBirthHome({ mother, homes: [], residents: [mother], capacity: 4 }), 'Villa A');
  assert.equal(chooseBirthHome({ mother: null, homes: [], residents: [], capacity: 4 }), '');
});

test('a full mother home may choose any authored home, including one outside the mother home', () => {
  const mother = actor(1, 'Not An Authored Home');
  const residents = [
    mother, actor(2, 'Not An Authored Home'), actor(3, 'Not An Authored Home'), actor(4, 'Not An Authored Home'),
    actor(5, 'Villa A'), actor(6, 'Villa B'), actor(7, 'Villa B'),
  ];
  const homes = [home('Villa A'), home('Villa B')];
  assert.equal(chooseBirthHome({ mother, homes, residents, capacity: 4 }), 'Villa A');
});

test('the rule is deterministic and does not mutate actors, homes or the mother', () => {
  const mother = actor(1, 'Villa A');
  const residents = [mother, actor(2, 'Villa A'), actor(3, 'Villa B')];
  const homes = [home('Villa A'), home('Villa B')];
  const before = JSON.stringify({ mother, residents, homes });

  const first = chooseBirthHome({ mother, homes, residents, capacity: 2 });
  const second = chooseBirthHome({ mother, homes, residents, capacity: 2 });
  assert.equal(first, 'Villa B');
  assert.equal(second, first);
  assert.equal(JSON.stringify({ mother, residents, homes }), before);
  assert.equal(countHomeResidents(residents, 'Villa A'), 2);
  assert.equal(JSON.stringify({ mother, residents, homes }), before);
});

test('resident count matches the existing actor view for a mixed roster', () => {
  const soft = [
    actor(1, 'Villa A'),
    actor(2, 'Villa B'),
    actor(3, 'Villa A', { active: false }),
  ];
  const glass = [
    actor(4, 'Villa A', { kind: 'glass' }),
    actor(5, '', { kind: 'glass' }),
  ];
  const view = createActorView({ getSoft: () => soft, getGlass: () => glass });
  const all = view.all();
  for (const name of ['Villa A', 'Villa B', '', null, undefined]) {
    assert.equal(countHomeResidents(all, name), view.homeResidents(name));
  }
});

test('the chosen value is the authored home name, not the descriptor', () => {
  const homes = [home('Villa A')];
  const result = chooseBirthHome({ mother: null, homes, residents: [], capacity: 4 });
  assert.equal(result, 'Villa A');
  assert.equal(typeof result, 'string');
});
