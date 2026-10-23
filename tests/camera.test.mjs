import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cameraHomeFor, cameraPositionFor } from '../src/camera.js';

const LIFE_CAMERA = Object.freeze({
  target: Object.freeze([0, 1.7, 0]),
  yaw: 0.30,
  pitch: 0.07,
  dist: 27,
  minDist: 3.2,
  maxDist: 88,
});
const STUDIO_TARGET = Object.freeze({ x: 0.36, y: 0.62, z: 0 });
const STUDIO_HOME = Object.freeze({ yaw: 0.3, pitch: 0.4, dist: 8 });
const STUDIO_DEFAULTS = Object.freeze({ minDist: 4.2, maxDist: 18 });

test('life home descriptor preserves the map camera and wide-aspect distance', () => {
  assert.deepEqual(cameraHomeFor({
    mapKind: 'life', mapCamera: LIFE_CAMERA, camTarget: STUDIO_TARGET,
    camHome: STUDIO_HOME, aspect: 1.2,
  }), {
    target: [0, 1.7, 0],
    yaw: 0.30,
    pitch: 0.07,
    dist: 27,
    minDist: 3.2,
    maxDist: 88,
  });
});

test('life home adds exactly 8 distance below the narrow-aspect threshold', () => {
  const narrow = cameraHomeFor({
    mapKind: 'life', mapCamera: LIFE_CAMERA, camTarget: STUDIO_TARGET,
    camHome: STUDIO_HOME, aspect: 0.949,
  });
  assert.deepEqual(narrow, {
    target: [0, 1.7, 0],
    yaw: 0.30,
    pitch: 0.07,
    dist: 35,
    minDist: 3.2,
    maxDist: 88,
  });
  const threshold = cameraHomeFor({
    mapKind: 'life', mapCamera: LIFE_CAMERA, camTarget: STUDIO_TARGET,
    camHome: STUDIO_HOME, aspect: 0.95,
  });
  assert.equal(threshold.dist, 27);
});

test('studio home uses the passed target/home and the fixed zoom limits', () => {
  assert.deepEqual(cameraHomeFor({
    mapKind: 'studio', mapCamera: LIFE_CAMERA, camTarget: STUDIO_TARGET,
    camHome: STUDIO_HOME, aspect: 1.2,
  }), {
    target: [0.36, 0.62, 0],
    yaw: 0.3,
    pitch: 0.4,
    dist: 8,
    minDist: 4.2,
    maxDist: 18,
  });
});

test('studio narrow aspect lowers only the target y and leaves clear order intact', () => {
  const home = cameraHomeFor({
    mapKind: 'sandbox', mapCamera: LIFE_CAMERA, camTarget: { x: 1.25, y: 0.62, z: -2.5 },
    camHome: STUDIO_HOME, aspect: 0.5,
  });
  assert.deepEqual(home.target, [1.25, 0.62 - 0.30, -2.5]);
  assert.equal(home.yaw, STUDIO_HOME.yaw);
  assert.equal(home.pitch, STUDIO_HOME.pitch);
  assert.equal(home.dist, STUDIO_HOME.dist);
  assert.deepEqual({ minDist: home.minDist, maxDist: home.maxDist }, STUDIO_DEFAULTS);
  assert.equal(cameraHomeFor({
    mapKind: 'studio', mapCamera: LIFE_CAMERA, camTarget: STUDIO_TARGET,
    camHome: STUDIO_HOME, aspect: 0.95,
  }).target[1], 0.62);
});

test('home inputs are not mutated and target arrays are fresh copies', () => {
  const mapCamera = { target: [0.1, 0.2, 0.3], yaw: 1, pitch: 2, dist: 3, minDist: 4, maxDist: 5 };
  const camTarget = { x: 0.4, y: 0.5, z: 0.6 };
  const camHome = { yaw: 6, pitch: 7, dist: 8 };
  const snapshot = JSON.stringify({ mapCamera, camTarget, camHome });
  const life = cameraHomeFor({ mapKind: 'life', mapCamera, camTarget, camHome, aspect: 2 });
  const studio = cameraHomeFor({ mapKind: 'studio', mapCamera, camTarget, camHome, aspect: 2 });
  assert.equal(JSON.stringify({ mapCamera, camTarget, camHome }), snapshot);
  assert.notEqual(life.target, mapCamera.target);
  assert.deepEqual(life.target, [0.1, 0.2, 0.3]);
  assert.deepEqual(studio.target, [0.4, 0.5, 0.6]);
  assert.equal(Object.getPrototypeOf(life), Object.prototype);
  assert.equal(Object.getPrototypeOf(studio), Object.prototype);
});

test('zero values are preserved instead of being replaced by defaults', () => {
  const life = cameraHomeFor({
    mapKind: 'life',
    mapCamera: { target: [0, 0, 0], yaw: 0, pitch: 0, dist: 0, minDist: 0, maxDist: 0 },
    camTarget: STUDIO_TARGET, camHome: STUDIO_HOME, aspect: 1,
  });
  assert.deepEqual(life, {
    target: [0, 0, 0], yaw: 0, pitch: 0, dist: 0, minDist: 0, maxDist: 0,
  });
  assert.deepEqual(cameraHomeFor({
    mapKind: 'studio', mapCamera: LIFE_CAMERA,
    camTarget: { x: 0, y: 0, z: 0 }, camHome: { yaw: 0, pitch: 0, dist: 0 }, aspect: 1,
  }), {
    target: [0, 0, 0], yaw: 0, pitch: 0, dist: 0, minDist: 4.2, maxDist: 18,
  });
});

test('missing required records fail as the app helpers did instead of inventing values', () => {
  assert.throws(() => cameraHomeFor({
    mapKind: 'life', camTarget: STUDIO_TARGET, camHome: STUDIO_HOME, aspect: 1,
  }), TypeError);
  assert.throws(() => cameraHomeFor({ mapKind: 'studio', camHome: STUDIO_HOME, aspect: 1 }), TypeError);
  assert.throws(() => cameraHomeFor({
    mapKind: 'studio', camTarget: STUDIO_TARGET, aspect: 1,
  }), TypeError);
});

test('spherical position keeps the previous target-relative formula', () => {
  const target = { x: 0.36, y: 0.62, z: 0 };
  const yaw = 0.3, pitch = 0.4, dist = 8;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  assert.deepEqual(cameraPositionFor({ target, yaw, pitch, dist }), {
    x: target.x + Math.sin(yaw) * cp * dist,
    y: target.y + sp * dist,
    z: target.z + Math.cos(yaw) * cp * dist,
  });
  const snapshot = JSON.stringify(target);
  cameraPositionFor({ target, yaw, pitch, dist });
  assert.equal(JSON.stringify(target), snapshot);
});

test('spherical position handles zero pitch/dist and representative orbit values', () => {
  assert.deepEqual(cameraPositionFor({
    target: { x: 1, y: 2, z: 3 }, yaw: 0, pitch: 0, dist: 0,
  }), { x: 1, y: 2, z: 3 });
  const behind = cameraPositionFor({
    target: { x: 0, y: 0, z: 0 }, yaw: Math.PI, pitch: 0, dist: 10,
  });
  assert.equal(behind.x, Math.sin(Math.PI) * 10);
  assert.equal(behind.y, 0);
  assert.equal(behind.z, -10);
  const top = cameraPositionFor({
    target: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: Math.PI / 2, dist: 5,
  });
  assert.ok(Math.abs(top.x) < 1e-12);
  assert.equal(top.y, 5);
  assert.ok(Math.abs(top.z) < 1e-12);
  assert.throws(() => cameraPositionFor({ yaw: 0, pitch: 0, dist: 1 }), TypeError);
});

test('the pure module has no imports, DOM, three.js or RNG access', async () => {
  const source = await readFile(new URL('../src/camera.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\b(document|window|localStorage|performance|requestAnimationFrame)\b/);
  assert.doesNotMatch(source, /\bTHREE\b/);
  assert.doesNotMatch(source, /\bMath\.random\b/);
  assert.doesNotMatch(source, /\bDate\b/);
});
