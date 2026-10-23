import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SURFACE_LATTICE_LIMITS,
  surfaceBounds,
  chooseSurfaceLattice,
} from '../src/surfacelattice.js';

const approx = (actual, expected, epsilon = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

function box(min, max) {
  return {
    minX: min, minY: min, minZ: min,
    maxX: max, maxY: max, maxZ: max,
    maxR: 0.1,
  };
}

test('limits are frozen and match the historical allocation caps', () => {
  assert.deepEqual(SURFACE_LATTICE_LIMITS, { maxDim: 54, maxCells: 157464 });
  assert.equal(Object.isFrozen(SURFACE_LATTICE_LIMITS), true);
});

test('surfaceBounds uses point ± radius*scale with the radius floor', () => {
  const px = [0, 2, -1];
  const py = [0, -1, 3];
  const pz = [0, 1, 0.5];
  const radii = [0.1, 0.2, 0.05];

  assert.deepEqual(surfaceBounds(px, py, pz, radii, 3, 2), {
    minX: -1.1, minY: -1.4, minZ: -0.2,
    maxX: 2.4, maxY: 3.1, maxZ: 1.4,
    maxR: 0.4,
  });

  // All radii below 0.02 keep the historical maxR floor.
  assert.equal(surfaceBounds([1], [2], [3], [0.001], 1, 1).maxR, 0.02);
  assert.equal(surfaceBounds(px, py, pz, radii, 0, 1), null);
});

test('pinned asymmetric lattice fixture', () => {
  const px = [0.12, 0.60, -0.35, -0.15, 0.05, 0.30];
  const py = [-0.40, 0.10, 0.25, -0.55, 0.48, -0.10];
  const pz = [0.05, -0.20, 0.42, -0.30, 0.10, 0.55];
  const radii = [0.235, 0.252, 0.15, 0.225, 0.118, 0.138];

  const bounds = surfaceBounds(px, py, pz, radii, 6, 1.08);
  assert.deepEqual(bounds, {
    minX: -0.512, minY: -0.793, minZ: -0.543,
    maxX: 0.87216, maxY: 0.60744, maxZ: 0.6990400000000001,
    maxR: 0.27216,
  });

  const lattice = chooseSurfaceLattice({ bounds, tier: 42 });
  assert.equal(lattice.nx, 50);
  assert.equal(lattice.ny, 50);
  assert.equal(lattice.nz, 45);
  assert.equal(lattice.total, 112500);
  approx(lattice.cell, 0.0339456738992222);
  approx(lattice.ox, -0.6449678040852218);
  approx(lattice.oy, -0.9165331952789993);
  approx(lattice.oz, -0.678913477984444);
});

test('tier clamp and 1.13 cell ladder rounding', () => {
  const min = chooseSurfaceLattice({ bounds: box(0, 0.1), tier: 100 });
  assert.equal(min.cell, 0.012);

  const middle = chooseSurfaceLattice({ bounds: box(0, 1), tier: 10 });
  approx(middle.cell, 0.10197422800640137);

  const max = chooseSurfaceLattice({ bounds: box(0, 10), tier: 8 });
  approx(max.cell, 0.44200964691796024);
  assert.ok(max.cell <= 0.5);
});

test('hysteresis reuses a fitting previous lattice exactly', () => {
  const previous = { cell: 0.1, ox: -2, oy: -2, oz: -2, nx: 40, ny: 40, nz: 40 };
  const result = chooseSurfaceLattice({ bounds: box(0, 1), tier: 10, previous });
  assert.deepEqual(result, {
    cell: 0.1, ox: -2, oy: -2, oz: -2, nx: 40, ny: 40, nz: 40, total: 64000,
  });
});

test('outside the 6% window the ladder recomputes instead of reusing', () => {
  const previous = { cell: 0.2, ox: -2, oy: -2, oz: -2, nx: 40, ny: 40, nz: 40 };
  const result = chooseSurfaceLattice({ bounds: box(0, 1), tier: 10, previous });
  approx(result.cell, 0.10197422800640137);
  assert.notEqual(result.cell, previous.cell);
  assert.notEqual(result.nx, previous.nx);
});

test('too-tight bounds recompute even inside the 6% cell window', () => {
  const previous = { cell: 0.1, ox: -2, oy: -2, oz: -2, nx: 10, ny: 10, nz: 10 };
  const result = chooseSurfaceLattice({ bounds: box(0, 1), tier: 10, previous });
  assert.equal(result.cell, 0.1);
  approx(result.ox, -0.3);
  assert.equal(result.nx, 17);
});

test('the 0.9-cell reuse margins are load-bearing', () => {
  const previous = { cell: 0.1, ox: -2, oy: -2, oz: -2, nx: 40, ny: 40, nz: 40 };
  const bounds = box(0.6, 1.65); // ext 1.05 -> want 0.105, inside the 6% window
  const result = chooseSurfaceLattice({ bounds, tier: 10, previous });
  assert.equal(result.cell, 0.1);
  // max padded bound 1.87 is inside the old lattice edge 1.9 but not inside
  // edge - 0.9*cell (1.81), so the previous lattice must not be reused.
  approx(result.ox, 0.3);
  assert.equal(result.nx, 17);
  assert.notEqual(result.nx, previous.nx);
});

test('four-pass 1.15 expansion fits under a small maxDim', () => {
  const result = chooseSurfaceLattice({
    bounds: box(0, 1), tier: 100, maxDim: 80, maxCells: 1_000_000_000,
  });
  approx(result.cell, 0.01587);
  approx(result.ox, -0.04761);
  assert.equal(result.nx, 70);
  assert.equal(result.ny, 70);
  assert.equal(result.nz, 70);
  assert.equal(result.total, 343000);
});

test('returns null after four passes cannot fit maxDim', () => {
  assert.equal(chooseSurfaceLattice({
    bounds: box(0, 1), tier: 100, maxDim: 60, maxCells: 1_000_000_000,
  }), null);
});

test('total > maxCells returns null on both reuse and recompute paths', () => {
  const previous = { cell: 0.1, ox: -2, oy: -2, oz: -2, nx: 40, ny: 40, nz: 40 };
  assert.equal(chooseSurfaceLattice({
    bounds: box(0, 1), tier: 10, previous, maxCells: 1000,
  }), null);
  assert.equal(chooseSurfaceLattice({
    bounds: box(0, 1), tier: 10, maxCells: 10,
  }), null);
});

test('inputs are not mutated and repeats are deterministic', () => {
  const bounds = box(0, 1);
  const previous = { cell: 0.1, ox: -2, oy: -2, oz: -2, nx: 40, ny: 40, nz: 40 };
  const boundsSnapshot = JSON.stringify(bounds);
  const previousSnapshot = JSON.stringify(previous);
  const first = chooseSurfaceLattice({ bounds, tier: 10, previous });
  const second = chooseSurfaceLattice({ bounds, tier: 10, previous });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(bounds), boundsSnapshot);
  assert.equal(JSON.stringify(previous), previousSnapshot);
  assert.equal('total' in previous, false);

  const px = [0, 1], py = [0, 1], pz = [0, 1], radii = [0.1, 0.2];
  const pxSnapshot = JSON.stringify(px);
  const b1 = surfaceBounds(px, py, pz, radii, 2, 1);
  const b2 = surfaceBounds(px, py, pz, radii, 2, 1);
  assert.deepEqual(b1, b2);
  assert.equal(JSON.stringify(px), pxSnapshot);
});

test('source guard: no three.js, DOM, storage, RNG or clock access', async () => {
  const source = await readFile(new URL('../src/surfacelattice.js', import.meta.url), 'utf8');
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const forbidden = [
    [/\bthree\b/i, 'three'],
    [/\bdocument\b/, 'document'],
    [/\bwindow\b/, 'window'],
    [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, 'storage'],
    [/Math\.random/, 'RNG'],
    [/\bDate\b|performance\.now|requestAnimationFrame|setTimeout|setInterval/, 'clock'],
    [/^\s*import\s/m, 'import'],
  ];
  for (const [pattern, label] of forbidden) {
    assert.equal(pattern.test(code), false, `unexpected ${label} access`);
  }
});
