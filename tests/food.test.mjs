import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoodRegistry } from '../src/food.js';
import { getFoodType, listFoodTypes, registerFoodType, isSafeFood } from '../src/foodtypes.js';
import { FLAVORS } from '../src/config.js';

test('food definitions preserve existing balance and seeded respawn draws', () => {
  const food = createFoodRegistry({ rng: () => .5,
    sources: ['flower', 'fruit', 'hive'].map((kind, x) => ({ kind, x, z: 0 })) });
  assert.deepEqual(food.sources.map(s => [s.id, s.label, s.satiation, s.respawn]), [
    ['flower-0', 'jelly flower', .20, 35],
    ['fruit-1', 'jelly fruit', .35, 67.5],
    ['hive-2', 'beehive', .55, 120],
  ]);
  assert.deepEqual(food.allRipe({ safe: true }).map(s => s.kind), ['flower', 'fruit']);
  assert.equal(food.nearestRipe(2, 0, { safe: true }).kind, 'fruit');
  assert.equal(isSafeFood({ kind: 'hive' }), false);
  assert.deepEqual(food.validate(), []);
});

test('fixture food reuses an existing visual and is discoverable without AI kind lists', () => {
  registerFoodType({ id: 'fixture-berry', label: 'berry', safe: true,
    satiation: .25, respawnMin: 10, respawnMax: 20, visual: 'fruit', interaction: 'eat' });
  const changes = [];
  const food = createFoodRegistry({ rng: () => .5,
    sources: [{ id: 'berry-42', kind: 'fixture-berry', x: 1, z: 2 }],
    onVisibility: (s, visible) => changes.push([s.id, visible]) });
  const actor = { uid: 1 };
  const source = food.nearestRipe(0, 0, { safe: true });
  assert.equal(source.type, getFoodType('fixture-berry'));
  assert.equal(source.type.visual, 'fruit');
  assert.equal(food.claim(source, actor), true);
  assert.equal(food.claim(source, { uid: 2 }), false);
  assert.equal(food.consume(source, actor), true);
  assert.deepEqual(food.snapshot(), [{ id: 'berry-42', ripe: false, timer: 15 }]);
  food.update(15);
  assert.equal(food.allRipe({ safe: true }).length, 1);
  assert.deepEqual(changes, [['berry-42', false], ['berry-42', true]]);
  assert.equal(food.restore([{ id: 'berry-42', ripe: false, timer: 3 },
    { id: 'old-missing-id', ripe: false, timer: 1 }]), 1);
  assert.equal(source.timer, 3);
  assert.equal(source.claim, null);
  assert.ok(listFoodTypes().includes(source.type));
});

test('per-source overrides and legacy generic food remain supported', () => {
  const food = createFoodRegistry({ rng: () => 0, sources: [
    { kind: 'fruit', x: 0, z: 0, satiation: .9, respawnMin: 2, respawnMax: 4 },
    { x: 1, z: 1 },
  ] });
  assert.equal(food.sources[0].satiation, .9);
  assert.equal(food.sources[0].respawn, 2);
  assert.equal(food.sources[1].respawn, 25);
  assert.equal(food.sources[1].type, null);
  assert.equal(food.allRipe({ safe: true }).length, 1);
  assert.throws(() => registerFoodType({ id: 'fruit' }), /already registered/);
  assert.throws(() => registerFoodType({ id: 'bad', label: 'bad', satiation: 0 }), /satiation/);
});

test('canonical flavors keep the saved numeric order and rendered colors', () => {
  assert.deepEqual(FLAVORS.map(f => [f.id, f.hex, f.att, f.attDist]), [
    ['cherry', 0xd51f3c, 0x8c1024, .95], ['orange', 0xff7b1c, 0xb14400, .88],
    ['lemon', 0xffc61f, 0xbd8800, .80], ['apple', 0x69c22f, 0x2f7a16, .92],
    ['pineapple', 0xf7f2df, 0xe6d9a6, 3.20],
  ]);
});
