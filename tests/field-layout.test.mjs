import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFieldLayout } from '../src/fieldlayout.js';
import { createNavMesh } from '../src/navmesh.js';
import { fieldInside } from '../src/fieldshape.js';

// These fixtures are synthetic data for the pure boundary. They are not a
// claim about the authored meadow layout; browser fieldInfo()/nav covers that.
const WORLD_SCALE = {
  house: 1.55,
  houseRadius: 1.10 * 1.55,
  houseDoor: 1.86 * 1.55,
  tree: 1.20,
  prop: 1.15,
};

function home({ x = 0, z = 0, name = 'Thimble Cottage', door } = {}) {
  return {
    x, z, r: WORLD_SCALE.houseRadius, name,
    door: door || { x, z: z + 1.2 },
  };
}

function pondAt(x = -40, z = 0, rx = 3, rz = 2) {
  return {
    x, z, rx, rz,
    contains(px, pz) {
      const dx = (px - x) / rx, dz = (pz - z) / rz;
      return dx * dx + dz * dz < 1;
    },
  };
}

function pondInputs(geometry) {
  return {
    pondGeometry: geometry,
    pondContains: (x, z) => geometry.contains(x, z),
  };
}

function makeNav(solids = []) {
  const nav = createNavMesh({
    minX: -65, maxX: 65, minZ: -65, maxZ: 65,
    cell: 0.8, agentRadius: 0.38, extraClearance: 0.10,
    insideBounds: (x, z, edge) => fieldInside(x, z, edge),
  });
  for (const s of solids) nav.addSolid(s);
  nav.bake();
  return nav;
}

function fixtures(overrides = {}) {
  return {
    homes: [home()],
    doorClearance: [{ name: 'Thimble Cottage', top: 2.0 }],
    trees: [],
    rocks: [],
    worldScale: WORLD_SCALE,
    ...pondInputs(pondAt()),
    fieldInside,
    cannonHome: { x: 30, z: 30 },
    studioHouse: { x: 30, z: -30, r: 1.5, door: { x: 30, z: -27.5 }, name: 'Studio House' },
    nav: makeNav(),
    foodSources: [],
    food: null,
    waterSpots: [{ x: -36, z: 0 }],
    ...overrides,
  };
}

test('headless: valid asymmetric layout produces no errors', () => {
  const input = fixtures({
    homes: [
      home({ x: 0, z: 0, name: 'Thimble Cottage' }),
      home({ x: 10, z: 0, name: 'Mossy Nook' }),
    ],
    doorClearance: [
      { name: 'Thimble Cottage', top: 2.0 },
      { name: 'Mossy Nook', top: 1.9 },
    ],
    trees: [{ x: -20, z: 10, s: 1.0 }, { x: 20, z: -20, s: 0.9 }],
    rocks: [{ x: -30, z: 10, s: 0.55 }, { x: 30, z: 10, s: 0.42 }],
    foodSources: [{ id: 'flower-1', x: 5, z: 5, approachX: 6, approachZ: 5 }],
    waterSpots: [{ x: -36, z: 0 }, { x: -36, z: 2 }],
  });
  assert.deepEqual(validateFieldLayout(input), []);
});

test('door clearance: below adult bear headroom is rejected', () => {
  const input = fixtures({
    doorClearance: [{ name: 'Thimble Cottage', top: 1.5 }],
  });
  assert.deepEqual(validateFieldLayout(input), [
    'Thimble Cottage doorframe is below bear headroom',
  ]);
});

const walkableNav = { isWalkable: () => true, validate: () => [] };

test('home: outside the field is reported', () => {
  const input = fixtures({
    homes: [home({ x: 70, z: 0, name: 'Far Lodge' })],
    nav: walkableNav,
  });
  assert.deepEqual(validateFieldLayout(input), ['Far Lodge outside the field']);
});

test('home: overlaps report both directions in home order', () => {
  const input = fixtures({
    homes: [
      home({ x: 0, z: 0, name: 'A' }),
      home({ x: 1, z: 0, name: 'B' }),
    ],
  });
  assert.deepEqual(validateFieldLayout(input), ['A clips B', 'B clips A']);
});

test('home: tree, pond, cannon home and blocked door each report', () => {
  assert.deepEqual(
    validateFieldLayout(fixtures({ trees: [{ x: 2, z: 0, s: 1.0 }] })),
    ['Thimble Cottage clips tree at 2,0']);
  assert.deepEqual(
    validateFieldLayout(fixtures(pondInputs(pondAt(2, 0, 3, 2)))),
    ['Thimble Cottage clips the pond']);
  assert.deepEqual(
    validateFieldLayout(fixtures({ cannonHome: { x: 1, z: 0 } })),
    ['Thimble Cottage blocks the cannon home']);
  const blockedDoor = makeNav([{ kind: 'rock', x: 0, z: 1.2, r: 2 }]);
  assert.deepEqual(
    validateFieldLayout(fixtures({ nav: blockedDoor })),
    ['Thimble Cottage door approach is blocked']);
});

test('tree: outside, pond and cannon home each report', () => {
  assert.deepEqual(
    validateFieldLayout(fixtures({ trees: [{ x: 70, z: 0, s: 1.0 }] })),
    ['tree at 70,0 outside']);
  assert.deepEqual(
    validateFieldLayout(fixtures({ trees: [{ x: -40, z: 0, s: 1.0 }] })),
    ['tree at -40,0 clips the pond']);
  assert.deepEqual(
    validateFieldLayout(fixtures({ trees: [{ x: 30, z: 30, s: 1.0 }] })),
    ['tree blocks cannon home']);
});

test('rock: cannon home placement is checked', () => {
  assert.deepEqual(
    validateFieldLayout(fixtures({ rocks: [{ x: 30, z: 30, s: 0.5 }] })),
    ['rock blocks cannon home']);
});

test('Studio House: outside, home, tree, pond, cannon and door each report', () => {
  assert.deepEqual(
    validateFieldLayout(fixtures({
      studioHouse: { x: 70, z: 0, r: 1.5, door: { x: 70, z: 3 }, name: 'Studio House' },
      nav: walkableNav,
    })),
    ['Studio House outside the field']);
  assert.deepEqual(
    validateFieldLayout(fixtures({
      studioHouse: { x: 0, z: 2, r: 1.5, door: { x: 0, z: 4.5 }, name: 'Studio House' },
    })),
    ['Studio House clips Thimble Cottage']);
  assert.deepEqual(
    validateFieldLayout(fixtures({ trees: [{ x: 30, z: -26, s: 1.0 }] })),
    ['Studio House clips a tree']);
  assert.deepEqual(
    validateFieldLayout(fixtures(pondInputs(pondAt(30, -30, 3, 2)))),
    ['Studio House clips the pond']);
  assert.deepEqual(
    validateFieldLayout(fixtures({ cannonHome: { x: 30, z: -30 } })),
    ['Studio House blocks the cannon home']);
  const blockedDoor = makeNav([{ kind: 'rock', x: 30, z: -27.5, r: 2 }]);
  assert.deepEqual(
    validateFieldLayout(fixtures({ nav: blockedDoor })),
    ['Studio House door approach is blocked']);
});

test('food: blocked approach, bad position and registry validation forward', () => {
  const blocked = makeNav([{ kind: 'rock', x: 6, z: 5, r: 2 }]);
  assert.deepEqual(
    validateFieldLayout(fixtures({
      nav: blocked,
      foodSources: [{ id: 'flower-1', x: 5, z: 5, approachX: 6, approachZ: 5 }],
    })),
    ['flower-1 food approach is blocked']);
  assert.deepEqual(
    validateFieldLayout(fixtures({
      foodSources: [{ id: 'flower-1', x: NaN, z: 5, approachX: 6, approachZ: 5 }],
    })),
    ['flower-1 has a bad position']);
  assert.deepEqual(
    validateFieldLayout(fixtures({
      food: { validate: () => ['food registry rejected source'] },
    })),
    ['food registry rejected source']);
});

test('water: no approach, blocked approach and in-water approach report', () => {
  assert.deepEqual(
    validateFieldLayout(fixtures({ waterSpots: [] })),
    ['pond has no walkable drinking approach']);
  const blocked = makeNav([{ kind: 'rock', x: 0, z: 5, r: 2 }]);
  assert.deepEqual(
    validateFieldLayout(fixtures({ nav: blocked, waterSpots: [{ x: 0, z: 5 }] })),
    ['pond drinking approach is blocked']);
  assert.deepEqual(
    validateFieldLayout(fixtures({ waterSpots: [{ x: -40, z: 0 }] })),
    ['pond drinking approach is in the water']);
});

test('pond: authored geometry and runtime water query remain separate inputs', () => {
  // The overlap formulas must read authored POND geometry while the drinking
  // approach must use the current runtime contains query. If either helper
  // substitution leaks across, one of these two errors disappears.
  const input = fixtures({
    ...pondInputs(pondAt(2, 0, 3, 2)),
    pondContains: (x, z) => x === 0 && z === 5,
    waterSpots: [{ x: 0, z: 5 }],
  });
  assert.deepEqual(validateFieldLayout(input), [
    'Thimble Cottage clips the pond',
    'pond drinking approach is in the water',
  ]);
});

test('nav: real out-of-bounds door error is forwarded unchanged', () => {
  const outOfBoundsDoor = makeNav([{
    kind: 'house', x: 0, z: 0, r: 1, name: 'OutOfBounds',
    door: { x: 100, z: 0 },
  }]);
  assert.deepEqual(validateFieldLayout(fixtures()), []);
  assert.deepEqual(
    validateFieldLayout(fixtures({ homes: [], nav: outOfBoundsDoor })),
    ['door OutOfBounds approach is blocked']);
});

test('nav: fixture errors retain layout-then-nav order', () => {
  const nav = {
    isWalkable: () => true,
    validate: () => ['nav error A', 'nav error B'],
  };
  const input = fixtures({ waterSpots: [], nav });
  assert.deepEqual(validateFieldLayout(input), [
    'pond has no walkable drinking approach',
    'nav error A',
    'nav error B',
  ]);
});

test('nav: split components refuse cross path while same-side path works', () => {
  // nav.validate checks obstacles and doors, not connectivity. Path queries
  // refuse a cross-component route; the layout validator forwards the existing
  // checks and is therefore not an editor reachability validator.
  const nav = createNavMesh({
    minX: -10, maxX: 10, minZ: -10, maxZ: 10,
    cell: 0.5, agentRadius: 0.38, extraClearance: 0.10,
  });
  nav.addSolid({ kind: 'wall', x: 0, z: 0, rx: 12, rz: 0.8 });
  nav.bake();
  assert.equal(nav.stats.components, 2);
  assert.equal(nav.isWalkable(-5, -5), true);
  assert.equal(nav.isWalkable(5, 5), true);
  assert.equal(nav.findPath(-5, -5, 5, 5), null);
  const sameSide = nav.findPath(-5, -5, -2, -5);
  assert.ok(Array.isArray(sameSide) && sameSide.length > 1);
  assert.deepEqual(nav.validate(), []);

  const input = fixtures({
    homes: [home({ x: 0, z: 5, name: 'North Home', door: { x: 0, z: 6.2 } })],
    studioHouse: { x: 5, z: -5, r: 1.5, door: { x: 5, z: -3.5 }, name: 'Studio House' },
    cannonHome: { x: 5, z: 5 },
    waterSpots: [{ x: -5, z: 8 }],
    nav,
  });
  assert.deepEqual(validateFieldLayout(input), []);
});

test('errors retain the extracted cross-category order', () => {
  const nav = {
    isWalkable: () => true,
    validate: () => ['nav error'],
  };
  const input = fixtures({
    homes: [home({ x: 70, z: 0, name: 'Far Lodge' })],
    doorClearance: [{ name: 'Thimble Cottage', top: 1.5 }],
    trees: [{ x: 80, z: 0, s: 1.0 }],
    rocks: [{ x: 30, z: 30, s: 0.5 }],
    studioHouse: { x: 0, z: -50, r: 1.5, door: { x: 0, z: -47.5 }, name: 'Studio House' },
    foodSources: [{ id: 'flower-1', x: NaN, z: 5, approachX: 6, approachZ: 5 }],
    waterSpots: [],
    nav,
  });
  assert.deepEqual(validateFieldLayout(input), [
    'Thimble Cottage doorframe is below bear headroom',
    'Far Lodge outside the field',
    'tree at 80,0 outside',
    'rock blocks cannon home',
    'flower-1 has a bad position',
    'pond has no walkable drinking approach',
    'nav error',
  ]);
});

test('inputs are read, never mutated', () => {
  const input = fixtures({
    homes: [home({ x: 0, z: 0, name: 'A' }), home({ x: 1, z: 0, name: 'B' })],
    trees: [{ x: 2, z: 0, s: 1.0 }],
    rocks: [{ x: 30, z: 30, s: 0.5 }],
    foodSources: [{ id: 'flower-1', x: NaN, z: 5, approachX: 6, approachZ: 5 }],
    waterSpots: [{ x: -40, z: 0 }],
  });
  const snapshot = structuredClone({
    homes: input.homes,
    doorClearance: input.doorClearance,
    trees: input.trees,
    rocks: input.rocks,
    pondGeometry: {
      x: input.pondGeometry.x, z: input.pondGeometry.z,
      rx: input.pondGeometry.rx, rz: input.pondGeometry.rz,
    },
    cannonHome: input.cannonHome,
    studioHouse: input.studioHouse,
    foodSources: input.foodSources,
    waterSpots: input.waterSpots,
  });
  validateFieldLayout(input);
  assert.deepEqual(snapshot.homes, input.homes);
  assert.deepEqual(snapshot.doorClearance, input.doorClearance);
  assert.deepEqual(snapshot.trees, input.trees);
  assert.deepEqual(snapshot.rocks, input.rocks);
  assert.deepEqual(snapshot.pondGeometry, {
    x: input.pondGeometry.x, z: input.pondGeometry.z,
    rx: input.pondGeometry.rx, rz: input.pondGeometry.rz,
  });
  assert.deepEqual(snapshot.cannonHome, input.cannonHome);
  assert.deepEqual(snapshot.studioHouse, input.studioHouse);
  assert.deepEqual(snapshot.foodSources, input.foodSources);
  assert.deepEqual(snapshot.waterSpots, input.waterSpots);
});
