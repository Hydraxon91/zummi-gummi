import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TREE_SPECIES,
  TREE_SPECIES_ORDER,
  HOME_STYLES,
  HOME_STYLE_ORDER,
  BUSH_SPECIES,
  ROCK_SPECIES,
  getTreeSpecies,
  getHomeStyle,
} from '../src/floratypes.js';
import { MAP_CONTENT } from '../src/mapcontent.js';

test('flora IDs are unique and the authored tree order resolves completely', () => {
  assert.equal(new Set(TREE_SPECIES.map(species => species.id)).size, TREE_SPECIES.length);
  assert.equal(TREE_SPECIES_ORDER.length, 10);
  assert.ok(TREE_SPECIES_ORDER.every(id => getTreeSpecies(id)));
  assert.deepEqual(TREE_SPECIES_ORDER.slice(0, 2), ['mature', 'old']);
  assert.equal(BUSH_SPECIES.meadow.greens.length, 4);
  assert.equal(ROCK_SPECIES.meadow.label, 'meadow stone');
});

test('home styles have a stable ID sequence and complete definitions', () => {
  assert.equal(HOME_STYLE_ORDER.length, 8);
  assert.ok(HOME_STYLE_ORDER.every(id => getHomeStyle(id)));
  assert.deepEqual(Object.keys(HOME_STYLES).sort(), ['dome', 'pavilion', 'saucer', 'tower']);
  assert.equal(new Set(HOME_STYLE_ORDER).size, 4);
});

test('field map content preserves current homes, trees, rocks and starters', () => {
  const field = MAP_CONTENT.field;
  assert.equal(field.homes.length, 8);
  assert.equal(field.trees.length, 10);
  assert.equal(field.rocks.length, 4);
  assert.equal(field.starter.spots.length, 6);
  assert.equal(field.starter.colony.length, 6);
  assert.equal(field.starter.gummies.length, 2);
  assert.equal(new Set(field.homes.map(home => home.name)).size, 8);
  assert.ok(field.homes.every(home => getHomeStyle(home.style)));
  assert.deepEqual(field.homes.map(home => home.name), [
    'Thimble Cottage', 'Mossy Nook', 'Sugarplum House', 'Pebblewick',
    'Honeydew Cottage', 'Moonberry Lodge', 'Clover Croft', 'Butterscotch Barn',
  ]);
  assert.equal(field.trees[0].hiveHost, true);
  assert.equal(field.trees[1].hiveHost, true);
  assert.equal(field.trees[2].hiveHost, false);
  assert.ok(field.trees.every(tree => getTreeSpecies(tree.speciesId)));
  assert.deepEqual(field.cannonHome, { x: -18, z: 22 });
  assert.equal(field.studioHouse.name, 'Studio House');
});

test('studio starters live in the same content registry', () => {
  assert.deepEqual(MAP_CONTENT.studio.starter.flavors, [0, 1, 2, 3, 4, 0]);
  assert.equal(MAP_CONTENT.studio.starter.gummy.name, 'MSN Buddy');
});
