// Authored map content. Keep positions, names, species/style IDs and starter
// populations here; world.js owns map state and the builders own rendering.
import { HOME_STYLE_ORDER, TREE_SPECIES_ORDER } from './floratypes.js';

const HOUSE_LOTS = [
  { x: -7, z: -7,  name: 'Thimble Cottage',  wall: 0xf6ead0, roof: 0xd04a61, door: 0x6b3d2c },
  { x: -8, z: 7,   name: 'Mossy Nook',       wall: 0xf2e6c8, roof: 0x6fae5a, door: 0x7c4b33 },
  { x: 3, z: -11,  name: 'Sugarplum House',  wall: 0xf8e6da, roof: 0xd9779c, door: 0x753f34 },
  { x: 11, z: -6,  name: 'Pebblewick',       wall: 0xf1e8d6, roof: 0x729bc9, door: 0x664334 },
  { x: 12, z: 4,   name: 'Honeydew Cottage', wall: 0xf7eed3, roof: 0xe8b94e, door: 0x7b4b2c },
  { x: 18, z: 12,  name: 'Moonberry Lodge',  wall: 0xf5e7d8, roof: 0x8e74c8, door: 0x6c3d32 },
  { x: 24, z: -2,  name: 'Clover Croft',     wall: 0xefe9cf, roof: 0x5fa7a0, door: 0x765036 },
  { x: -26, z: -13, name: 'Butterscotch Barn', wall: 0xf6e5c3, roof: 0xc9864f, door: 0x6a3f2d },
];

const TREE_LOTS = [
  { x: -28, z: -2, s: 1.05 }, { x: -20, z: 14, s: 0.95 }, { x: -12, z: -19, s: 1.08 },
  { x: -26, z: 24, s: 1.0 }, { x: 26, z: 18, s: 0.92 }, { x: 28, z: -11, s: 1.1 },
  { x: 20, z: -22, s: 0.9 }, { x: -4, z: -25, s: 1.04 }, { x: 31, z: 8, s: 0.97 },
  { x: -31, z: 20, s: 1.02 },
].map((lot, index) => ({
  ...lot,
  speciesId: TREE_SPECIES_ORDER[index % TREE_SPECIES_ORDER.length],
  hiveHost: index < 2,
}));

const ROCK_LOTS = [
  { x: -3, z: 5, s: 0.55 }, { x: 14, z: 1, s: 0.42 },
  { x: -22, z: 9, s: 0.5 }, { x: 22, z: 15, s: 0.46 },
].map(lot => ({ ...lot, speciesId: 'meadow' }));

const FIELD_STARTER = {
  spots: [[-2.2, 4.0], [2.4, 3.4], [-3.6, 0.4], [4.2, 0.2], [-0.8, -3.0], [2.2, -5.2]],
  colony: [
    { sex: 'F', stage: 'adult', scale: 1.00, age: 600 },
    { sex: 'F', stage: 'adult', scale: 1.00, age: 600 },
    { sex: 'M', stage: 'adult', scale: 1.00, age: 600 },
    { sex: 'M', stage: 'adult', scale: 1.00, age: 600 },
    { sex: 'F', stage: 'teen',  scale: 0.78, age: 240 },
    { sex: 'M', stage: 'baby',  scale: 0.58, age: 30 },
  ],
  flavors: [0, 1, 2, 3, 4, 3],
  gummies: [
    { x: 0.5, z: 6.0, sex: 'F', name: 'MSN Buddy' },
    { x: 2.8, z: 6.4, sex: 'M', name: 'MSN Buddy 2' },
  ],
};

const STUDIO_STARTER = {
  flavors: [0, 1, 2, 3, 4, 0],
  gummy: { xFraction: -0.72, z: 0.45, flavor: 3, name: 'MSN Buddy' },
};

export const MAP_CONTENT = {
  field: {
    homes: HOUSE_LOTS.map((lot, index) => ({
      ...lot,
      style: HOME_STYLE_ORDER[index % HOME_STYLE_ORDER.length],
    })),
    trees: TREE_LOTS,
    rocks: ROCK_LOTS,
    cannonHome: { x: -18, z: 22 },
    studioHouse: {
      x: 0, z: -18, yaw: 0, r: 3.35,
      door: { x: 0, z: -13.8 },
      name: 'Studio House',
    },
    starter: FIELD_STARTER,
  },
  studio: {
    starter: STUDIO_STARTER,
  },
};
