import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerFoodType, getFoodType, listFoodTypes, isSafeFood } from '../src/foodtypes.js';
import { createFoodRegistry } from '../src/food.js';
import { createFoodPortionRegistry, normalizeCarriedFood } from '../src/foodportions.js';

// Fixture-only definition. It reuses the shipped fruit visual/interaction; no
// renderer object, asset or risk handler is introduced by this test.
const FIXTURE = registerFoodType({
  id: 'c4-fixture-berry',
  label: 'c4 fixture berry',
  safe: true,
  satiation: .25,
  respawnMin: 10,
  respawnMax: 20,
  visual: 'fruit',
  interaction: 'eat',
});

test('a definition reusing an existing visual registers exactly once and rejects invalid definitions', () => {
  assert.equal(getFoodType('c4-fixture-berry'), FIXTURE);
  assert.equal(listFoodTypes().filter(type => type.id === FIXTURE.id).length, 1);
  assert.equal(Object.isFrozen(FIXTURE), true);
  assert.equal(FIXTURE.visual, 'fruit');
  assert.equal(FIXTURE.interaction, 'eat');
  assert.equal(isSafeFood({ kind: 'c4-fixture-berry' }), true);

  assert.throws(() => registerFoodType({ ...FIXTURE, label: 'duplicate' }), /already registered/);
  assert.throws(() => registerFoodType(null), /id required/);
  assert.throws(() => registerFoodType({ ...FIXTURE, id: '' }), /id required/);
  assert.throws(() => registerFoodType({ ...FIXTURE, id: 'c4-no-label', label: '' }), /label required/);
  assert.throws(() => registerFoodType({ ...FIXTURE, id: 'c4-bad-satiation', satiation: 0 }), /satiation/);
  assert.throws(() => registerFoodType({
    ...FIXTURE, id: 'c4-bad-respawn', respawnMin: 20, respawnMax: 10,
  }), /respawn/);
  assert.throws(() => registerFoodType({ ...FIXTURE, id: 'c4-bad-safety', safe: 'yes' }), /safety/);
});

test('source visibility fires once on consume and once on respawn with the exact source and boolean', () => {
  const changes = [];
  const food = createFoodRegistry({
    rng: () => .5,
    sources: [{ id: 'c4-source', kind: FIXTURE.id, x: 1, z: 2, respawnMin: 4, respawnMax: 8 }],
    onVisibility: (source, visible) => changes.push([source, visible]),
  });
  const source = food.get('c4-source');
  const giver = { uid: 1 };
  const other = { uid: 2 };

  assert.equal(source.type, FIXTURE);
  assert.equal(source.visible, true);
  assert.equal(source.respawn, 6, 'per-source respawn range wins over definition defaults');
  assert.equal(food.claim(source, giver), true);
  assert.equal(food.claim(source, other), false, 'a competing claim is rejected');
  assert.equal(source.claim, giver);
  assert.equal(food.consume(source, other), false, 'only the claimant consumes');
  assert.equal(food.consume(source, giver), true);
  assert.equal(food.consume(source, giver), false, 'a second consume is inert');
  assert.equal(source.ripe, false);
  assert.equal(source.visible, false);
  assert.equal(source.timer, 6);
  assert.equal(changes.length, 1);
  assert.equal(changes[0][0], source);
  assert.equal(changes[0][1], false);

  food.update(5.9);
  assert.equal(source.ripe, false, 'the timer is still positive');
  assert.equal(source.visible, false);
  assert.equal(changes.length, 1);
  food.update(.2);
  assert.equal(source.ripe, true);
  assert.equal(source.visible, true);
  assert.equal(source.timer, 0);
  assert.equal(changes.length, 2);
  assert.equal(changes[1][0], source);
  assert.equal(changes[1][1], true);
});

test('restore emits only changed visibility, clears claims and preserves timers', () => {
  const changes = [];
  const food = createFoodRegistry({
    rng: () => 0,
    sources: [
      { id: 'c4-ripe', kind: FIXTURE.id, x: 0, z: 0, respawnMin: 5, respawnMax: 5 },
      { id: 'c4-depleted', kind: FIXTURE.id, x: 1, z: 0, ripe: false, respawnMin: 5, respawnMax: 5 },
    ],
    onVisibility: (source, visible) => changes.push([source, visible]),
  });
  const ripe = food.get('c4-ripe');
  const depleted = food.get('c4-depleted');
  const actor = { uid: 3 };
  assert.equal(food.claim(ripe, actor), true);

  assert.equal(food.restore([
    { id: 'c4-ripe', ripe: false, timer: 2 },
    { id: 'c4-depleted', ripe: true, timer: 99 },
    { id: 'c4-unknown', ripe: false, timer: 1 },
  ]), 2);
  assert.equal(changes.length, 2);
  assert.equal(changes[0][0], ripe);
  assert.equal(changes[0][1], false);
  assert.equal(changes[1][0], depleted);
  assert.equal(changes[1][1], true);
  assert.equal(ripe.ripe, false);
  assert.equal(ripe.visible, false);
  assert.equal(ripe.timer, 2);
  assert.equal(ripe.claim, null);
  assert.equal(depleted.ripe, true);
  assert.equal(depleted.visible, true);
  assert.equal(depleted.timer, 0);
  assert.equal(depleted.claim, null);

  assert.equal(food.claim(depleted, actor), true);
  assert.equal(food.restore([{ id: 'c4-ripe', ripe: false, timer: 2 },
    { id: 'c4-depleted', ripe: true, timer: 0 }]), 2);
  assert.equal(changes.length, 2, 'a same-visibility restore does not notify');
  assert.equal(depleted.claim, null, 'restore still drops the claim');
  assert.equal(food.restore([{ id: 'c4-unknown', ripe: false, timer: 1 }]), 0);
});

test('source registry preserves per-source overrides and authored metadata', () => {
  const custom = { marker: 'authored' };
  const food = createFoodRegistry({ rng: () => .25, sources: [
    {
      id: 'c4-override', kind: FIXTURE.id, x: 0, z: 0, satiation: .9,
      respawnMin: 2, respawnMax: 4, label: 'special berry', tag: 'authored', custom,
    },
    { x: 1, z: 1 },
  ] });
  const [override, generic] = food.sources;
  assert.equal(override.type, FIXTURE);
  assert.equal(override.satiation, .9);
  assert.equal(override.respawnMin, 2);
  assert.equal(override.respawnMax, 4);
  assert.equal(override.respawn, 2.5);
  assert.equal(override.label, 'special berry');
  assert.equal(override.tag, 'authored');
  assert.equal(override.custom, custom);
  assert.equal(override.visible, true);
  assert.equal(generic.type, null);
  assert.equal(generic.id, 'food-0');
  assert.equal(generic.kind, 'food');
  assert.equal(generic.label, 'food');
  assert.equal(generic.satiation, .2);
  assert.equal(generic.respawn, 30);
  assert.equal(generic.visible, true);
});

test('portion IDs stay stable and duplicate or invalid additions are rejected', () => {
  const portions = createFoodPortionRegistry();
  const authored = portions.add({
    id: 'gift-7', kind: 'flower', satiation: .2, x: 1, z: 2, mapId: 'field',
  });
  assert.equal(authored.id, 'gift-7');
  assert.equal(portions.nextId(), 'gift-8');
  assert.equal(portions.add({
    id: 'gift-7', kind: 'fruit', satiation: .3, x: 3, z: 4, mapId: 'studio',
  }), null, 'duplicate identity is rejected');
  assert.equal(portions.all().length, 1);

  const generated = portions.add({
    kind: 'fruit', satiation: .3, x: 3, y: .5, z: 4, mapId: 'studio',
  });
  assert.equal(generated.id, 'gift-9');
  assert.equal(portions.add({ kind: 'flower', satiation: .2 }), null);
  assert.equal(portions.add({ kind: '', satiation: .2, x: 0, z: 0 }), null);
  assert.equal(portions.add({ kind: 'flower', satiation: 0, x: 0, z: 0 }), null);
  assert.equal(portions.all().length, 2);
});

test('portion claims, release ownership, snapshot and take are exactly-once', () => {
  const portions = createFoodPortionRegistry({ portions: [{
    id: 'gift-1', kind: 'fruit', satiation: .18, x: 2, y: .3, z: -4, mapId: 'field',
  }] });
  const portion = portions.get('gift-1');
  const owner = { uid: 1 };
  const other = { uid: 2 };

  assert.equal(portions.claim(portion, owner), true);
  assert.equal(portions.claim(portion, other), false, 'a competing claim is rejected');
  assert.equal(portion.claim, owner);
  assert.equal(portions.claim(null, owner), false);
  assert.equal(portions.claim(portion, null), false);

  portions.release(portion, other);
  assert.equal(portion.claim, owner, 'a non-owner cannot release the claim');
  portions.release(portion, owner);
  assert.equal(portion.claim, null);
  assert.equal(portions.claim(portion, owner), true);

  assert.deepEqual(portions.snapshot('field'), [{
    id: 'gift-1', kind: 'fruit', satiation: .18, x: 2, y: .3, z: -4, mapId: 'field',
  }]);
  assert.deepEqual(Object.keys(portions.snapshot('field')[0]).sort(),
    ['id', 'kind', 'mapId', 'satiation', 'x', 'y', 'z']);

  assert.equal(portions.take(portion, other), null, 'a non-owner cannot take');
  assert.equal(portions.get('gift-1'), portion);
  assert.deepEqual(portions.take(portion, owner),
    { id: 'gift-1', kind: 'fruit', satiation: .18 });
  assert.equal(portions.get('gift-1'), null);
  assert.equal(portions.take(portion, owner), null, 'a second take is inert');
  assert.deepEqual(portions.snapshot(), []);
});

test('portion restore clears claims, preserves maps and replaces prior entries', () => {
  const portions = createFoodPortionRegistry();
  portions.add({ id: 'gift-5', kind: 'fruit', satiation: .3, x: 10, z: 10, mapId: 'studio' });
  portions.add({ id: 'gift-6', kind: 'flower', satiation: .2, x: 1, z: 0, mapId: 'field' });
  portions.add({ id: 'gift-7', kind: 'flower', satiation: .2, x: 2, z: 0, mapId: 'field' });
  const studio = portions.get('gift-5');

  assert.deepEqual(portions.all('studio').map(p => p.id), ['gift-5']);
  assert.deepEqual(portions.all('field').map(p => p.id), ['gift-6', 'gift-7']);
  assert.equal(portions.nearest(10, 10, { mapId: 'studio' }).id, 'gift-5');
  assert.equal(portions.nearest(10, 10, { mapId: 'field', maxDistance: 5 }), null);
  assert.deepEqual(portions.snapshot('field').map(p => p.id), ['gift-6', 'gift-7']);
  portions.claim(studio, { uid: 4 });

  assert.equal(portions.restore([
    { id: 'gift-5', kind: 'fruit', satiation: .3, x: 10, y: 0, z: 10, mapId: 'studio' },
    { id: 'gift-6', kind: 'flower', satiation: .2, x: 1, y: 0, z: 0, mapId: 'field' },
    { id: 'gift-6', kind: 'flower', satiation: .2, x: 1, y: 0, z: 0, mapId: 'field' },
    { id: 'not-a-portion' },
  ]), 2);
  assert.equal(portions.get('gift-5').claim, null, 'restore drops the previous claim');
  assert.equal(portions.get('gift-5').mapId, 'studio');
  assert.equal(portions.get('gift-6').mapId, 'field');
  assert.equal(portions.get('gift-7'), null, 'restore replaces the prior list');
  assert.deepEqual(portions.all('field').map(p => p.id), ['gift-6']);
  assert.deepEqual(portions.all('studio').map(p => p.id), ['gift-5']);
  assert.equal(portions.nextId(), 'gift-7', 'the allocator advances past restored IDs');
});

test('an interrupted carried portion drops as a new record with the same identity', () => {
  const portions = createFoodPortionRegistry({ portions: [{
    id: 'gift-10', kind: 'flower', satiation: .2, x: 1, z: 1, mapId: 'field',
  }] });
  const actor = { uid: 7 };
  const original = portions.get('gift-10');
  assert.equal(portions.claim(original, actor), true);

  const carried = portions.take(original, actor);
  assert.deepEqual(carried, { id: 'gift-10', kind: 'flower', satiation: .2 });
  assert.equal(portions.get('gift-10'), null);

  const dropped = portions.add({
    id: carried.id, kind: carried.kind, satiation: carried.satiation,
    x: 8.25, y: .4, z: 9.5, mapId: 'field',
  });
  assert.ok(dropped);
  assert.equal(dropped.id, carried.id);
  assert.notEqual(dropped, original, 'the record is rebuilt, not resurrected');
  assert.equal(dropped.claim, null);
  assert.equal(dropped.mapId, 'field');
  assert.equal(portions.get('gift-10'), dropped);
  assert.equal(portions.claim(dropped, actor), true);
  assert.deepEqual(portions.take(dropped, actor), carried, 'identity survives the recovery');
});

test('carried food normalization accepts only finite positive identity records', () => {
  assert.deepEqual(normalizeCarriedFood({
    id: 'gift-1', kind: 'fruit', satiation: .18, extra: 'ignored',
  }), { id: 'gift-1', kind: 'fruit', satiation: .18 });
  assert.deepEqual(normalizeCarriedFood({
    id: 'gift-2', kind: 'flower', satiation: '0.33333',
  }), { id: 'gift-2', kind: 'flower', satiation: .3333 });

  for (const invalid of [
    null, undefined, [], {},
    { id: '', kind: 'fruit', satiation: .2 },
    { id: 'gift-3', kind: '', satiation: .2 },
    { id: 'gift-3', kind: 'fruit', satiation: 0 },
    { id: 'gift-3', kind: 'fruit', satiation: NaN },
    { id: 'gift-3', kind: 'fruit', satiation: 'not-a-number' },
  ]) {
    assert.equal(normalizeCarriedFood(invalid), null, `rejects ${JSON.stringify(invalid)}`);
  }
});

test('resource rule modules remain renderer-free', () => {
  for (const file of ['foodtypes.js', 'food.js', 'foodportions.js', 'behaviors/gifting.js']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]three['"]/, `${file} must not import three`);
    assert.doesNotMatch(source, /\bTHREE\./, `${file} must not use renderer objects`);
  }
});
