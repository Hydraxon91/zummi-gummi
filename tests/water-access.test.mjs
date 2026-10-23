import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPondQuery, buildWaterSpots, pondEscapeDue } from '../src/wateraccess.js';

const approx = (actual, expected, epsilon = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

const POND = { x: 0, z: 0, rx: 4, rz: 2, waterY: .5 };
const HOLE = { hx: 3.12, hz: 1.56, floorY: -1.6 };

test('createPondQuery preserves the authored pond shape without mutation', () => {
  const before = structuredClone(POND);
  const pond = createPondQuery(POND, HOLE);

  assert.equal(pond.x, POND.x);
  assert.equal(pond.z, POND.z);
  assert.equal(pond.rx, POND.rx);
  assert.equal(pond.rz, POND.rz);
  assert.equal(pond.waterY, POND.waterY);
  assert.equal(pond.hole, HOLE);
  assert.equal(typeof pond.contains, 'function');
  assert.equal(typeof pond.nearestShore, 'function');
  assert.deepEqual(POND, before);
  assert.deepEqual(HOLE, { hx: 3.12, hz: 1.56, floorY: -1.6 });
});

test('createPondQuery accepts a pond carrying its own hole', () => {
  const source = { ...POND, hole: HOLE };
  const pond = createPondQuery(source);
  assert.equal(pond.hole, HOLE);
});

test('contains uses the exact normalized ellipse boundary', () => {
  const pond = createPondQuery(POND, HOLE);
  assert.equal(pond.contains(0, 0), true);
  assert.equal(pond.contains(3.9, 0), true);
  assert.equal(pond.contains(0, 1.9), true);
  // Exactly on either axis is the boundary, not the interior.
  assert.equal(pond.contains(4, 0), false);
  assert.equal(pond.contains(0, 2), false);
  assert.equal(pond.contains(-4, 0), false);
  assert.equal(pond.contains(0, -2), false);
  // Outside one axis while the combined normalized radius is over 1.
  assert.equal(pond.contains(2.9, 1.5), false);
  assert.equal(pond.contains(2.5, 1.5), true);
});

test('nearestShore uses atan2 and the 1.12 radius factors', () => {
  const pond = createPondQuery(POND, HOLE);
  const shore = (x, z) => pond.nearestShore(x, z);

  let p = shore(10, 0);
  approx(p.x, 4 * 1.12);
  approx(p.z, 0);

  p = shore(0, 10);
  approx(p.x, 0);
  approx(p.z, 2 * 1.12);

  p = shore(-10, 0);
  approx(p.x, -4 * 1.12);
  approx(p.z, 0);

  p = shore(0, -10);
  approx(p.x, 0);
  approx(p.z, -2 * 1.12);

  p = shore(3, 3);
  const a = Math.atan2(3, 3);
  approx(p.x, Math.cos(a) * 4 * 1.12);
  approx(p.z, Math.sin(a) * 2 * 1.12);

  // The legacy centre case resolves atan2(0, 0) === 0.
  p = shore(0, 0);
  approx(p.x, 4 * 1.12);
  approx(p.z, 0);
});

test('buildWaterSpots keeps the exact count, order and positions', () => {
  const pond = createPondQuery({ x: 0, z: 0, rx: 10, rz: 10, waterY: 1 }, HOLE);
  const spots = buildWaterSpots({
    pond,
    count: 4,
    fieldInside: () => true,
    nearestWalkable: (x, z) => ({ x, z }),
  });

  assert.equal(spots.length, 4);
  const expected = [
    { x: 12.2, z: 0, waterX: 9.4, waterZ: 0, y: 1 },
    { x: 0, z: 12.2, waterX: 0, waterZ: 9.4, y: 1 },
    { x: -12.2, z: 0, waterX: -9.4, waterZ: 0, y: 1 },
    { x: 0, z: -12.2, waterX: 0, waterZ: -9.4, y: 1 },
  ];
  for (let i = 0; i < expected.length; i++) {
    approx(spots[i].x, expected[i].x);
    approx(spots[i].z, expected[i].z);
    approx(spots[i].waterX, expected[i].waterX);
    approx(spots[i].waterZ, expected[i].waterZ);
    assert.equal(spots[i].y, expected[i].y);
    assert.deepEqual(Object.keys(spots[i]), ['x', 'z', 'waterX', 'waterZ', 'y']);
  }
});

test('buildWaterSpots defaults to the 16 historical approaches', () => {
  const pond = createPondQuery({ x: 0, z: 0, rx: 10, rz: 10, waterY: 1 }, HOLE);
  const spots = buildWaterSpots({
    pond,
    fieldInside: () => true,
    nearestWalkable: (x, z) => ({ x, z }),
  });

  assert.equal(spots.length, 16);
  approx(spots[0].x, 12.2);
  approx(spots[0].z, 0);
  // The last approach follows i / count * 2π, not a special-cased angle.
  const a = 15 / 16 * Math.PI * 2;
  approx(spots[15].x, Math.cos(a) * 12.2);
  approx(spots[15].z, Math.sin(a) * 12.2);
});

test('fieldInside rejection skips the raw point before any nav query', () => {
  const pond = createPondQuery({ x: 0, z: 0, rx: 10, rz: 10, waterY: 1 }, HOLE);
  const calls = [];
  const spots = buildWaterSpots({
    pond,
    count: 4,
    fieldInside: (x, z, edge) => {
      calls.push(['fieldInside', x, z, edge]);
      return !(x > 0 && Math.abs(z) < 1e-9);
    },
    nearestWalkable: (x, z) => {
      calls.push(['nearestWalkable', x, z]);
      return { x, z };
    },
  });

  assert.equal(spots.length, 3);
  assert.deepEqual(calls.map(c => c[0]), [
    'fieldInside',
    'fieldInside', 'nearestWalkable',
    'fieldInside', 'nearestWalkable',
    'fieldInside', 'nearestWalkable',
  ]);
  assert.equal(calls[0][3], .8);
});

test('null nearestWalkable results are rejected', () => {
  const pond = createPondQuery({ x: 0, z: 0, rx: 10, rz: 10, waterY: 1 }, HOLE);
  const spots = buildWaterSpots({
    pond,
    count: 4,
    fieldInside: () => true,
    nearestWalkable: (x, z) => z > 1 ? null : { x, z },
  });
  assert.equal(spots.length, 3);
  approx(spots[0].x, 12.2);
  approx(spots[0].z, 0);
  approx(spots[1].x, -12.2);
  approx(spots[1].z, 0);
  approx(spots[2].x, 0);
  approx(spots[2].z, -12.2);
});

test('snapped distances over maxSnap are rejected', () => {
  const pond = createPondQuery({ x: 0, z: 0, rx: 10, rz: 10, waterY: 1 }, HOLE);
  let spots = buildWaterSpots({
    pond,
    count: 1,
    fieldInside: () => true,
    nearestWalkable: (x, z) => ({ x: x + 2.2000001, z }),
  });
  assert.deepEqual(spots, []);

  spots = buildWaterSpots({
    pond,
    count: 1,
    fieldInside: () => true,
    nearestWalkable: (x, z) => ({ x: x + 2.2, z }),
  });
  assert.equal(spots.length, 1);
});

test('a snapped point inside the pond is rejected', () => {
  const pond = createPondQuery({ x: 0, z: 0, rx: 10, rz: 10, waterY: 1 }, HOLE);
  const spots = buildWaterSpots({
    pond,
    count: 4,
    fieldInside: () => true,
    nearestWalkable: () => ({ x: .5, z: .5 }),
  });
  assert.deepEqual(spots, []);
});

test('spots closer than minSpacing collapse to the first one', () => {
  const pond = createPondQuery({ x: 0, z: 0, rx: 1, rz: 1, waterY: 1 }, HOLE);
  const spots = buildWaterSpots({
    pond,
    count: 4,
    fieldInside: () => true,
    nearestWalkable: () => ({ x: 1.1, z: 0 }),
  });
  assert.equal(spots.length, 1);
  approx(spots[0].x, 1.1);
  approx(spots[0].waterX, .94);
  assert.equal(spots[0].y, 1);
});

test('buildWaterSpots is deterministic and does not mutate its inputs', () => {
  const pond = createPondQuery(POND, HOLE);
  const pondBefore = {
    x: pond.x, z: pond.z, rx: pond.rx, rz: pond.rz,
    waterY: pond.waterY, hole: pond.hole,
  };
  const args = {
    pond,
    count: 8,
    fieldInside: () => true,
    nearestWalkable: (x, z) => ({ x, z }),
  };
  const first = buildWaterSpots(args);
  const second = buildWaterSpots(args);
  assert.deepEqual(first, second);
  assert.deepEqual({
    x: pond.x, z: pond.z, rx: pond.rx, rz: pond.rz,
    waterY: pond.waterY, hole: pond.hole,
  }, pondBefore);
});

test('pondEscapeDue accumulates only while a free bear is stalled in the pond', () => {
  let state = { timer: 0, due: false };
  for (let i = 0; i < 3; i++) {
    state = pondEscapeDue({
      timer: state.timer, dt: .5, inPond: true, inside: true,
      grabs: 0, speed: .1,
    });
  }
  approx(state.timer, 1.5);
  assert.equal(state.due, true);
});

test('pondEscapeDue resets on each non-progress condition', () => {
  const base = {
    timer: 1.4, dt: .5, inPond: true, inside: true, grabs: 0, speed: .1,
  };
  for (const override of [
    { inPond: false },
    { inside: false },
    { grabs: 1 },
    { speed: .16 },
    { speed: .5 },
  ]) {
    assert.deepEqual(pondEscapeDue({ ...base, ...override }), { timer: 0, due: false });
  }
});

test('pondEscapeDue triggers exactly at the threshold', () => {
  let out = pondEscapeDue({
    timer: 1, dt: .499, inPond: true, inside: true, grabs: 0, speed: .1,
  });
  approx(out.timer, 1.499);
  assert.equal(out.due, false);

  out = pondEscapeDue({
    timer: 1, dt: .5, inPond: true, inside: true, grabs: 0, speed: .1,
  });
  approx(out.timer, 1.5);
  assert.equal(out.due, true);

  out = pondEscapeDue({ timer: 0, dt: 2, inPond: true, inside: true, grabs: 0, speed: .1 });
  approx(out.timer, 1.5);
  assert.equal(out.due, true);
});

test('pondEscapeDue does not mutate its input and has stable defaults', () => {
  const input = Object.freeze({
    timer: .75, dt: .25, inPond: true, inside: true, grabs: 0, speed: .1,
  });
  const out = pondEscapeDue(input);
  assert.deepEqual(input, {
    timer: .75, dt: .25, inPond: true, inside: true, grabs: 0, speed: .1,
  });
  assert.notEqual(out, input);
  assert.deepEqual(pondEscapeDue(), { timer: 0, due: false });
});

test('pondEscapeDue draws no RNG and touches no DOM', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('pondEscapeDue drew RNG'); };
  try {
    const out = pondEscapeDue({
      timer: 1.4, dt: .5, inPond: true, inside: true, grabs: 0, speed: .1,
    });
    assert.equal(out.due, true);
  } finally {
    Math.random = originalRandom;
  }
});

test('wateraccess has no three.js, host, storage, RNG or clock access or import cycle', async () => {
  const source = await readFile(new URL('../src/wateraccess.js', import.meta.url), 'utf8');
  for (const forbidden of [
    /\bthree\b/i,
    /\bdocument\b/,
    /\bwindow\b/,
    /\blocalStorage\b/,
    /\bindexedDB\b/,
    /\bMath\.random\b/,
    /\bDate\b/,
    /\bperformance\b/,
    /\brequestAnimationFrame\b/,
    /\bimport\s/,
    /\brequire\s*\(/,
  ]) {
    assert.equal(forbidden.test(source), false, `unexpected ${forbidden} in wateraccess.js`);
  }

  const field = await readFile(new URL('../src/field.js', import.meta.url), 'utf8');
  assert.match(field, /from '\.\/wateraccess\.js'/);
});
