import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_BOUNDS, FIELD_RADIUS, fieldRadiusAt, fieldInside, fieldClamp,
} from '../src/fieldshape.js';

const TOL = 1e-9;

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= TOL,
    `${label}: ${actual} is not within ${TOL} of ${expected}`);
}

test('translation fixtures: meadow radius is the authored wobble', () => {
  assert.equal(FIELD_RADIUS, 65);
  assert.deepEqual(FIELD_BOUNDS, { shape: 'circle', radius: 65, hx: 65, hz: 65 });
  const fixtures = [
    { angle: 0, expected: 65.141354768386 },
    { angle: Math.PI / 2, expected: 64.182597498616 },
    { angle: Math.PI, expected: 64.858645231614 },
    { angle: 3 * Math.PI / 2, expected: 65.817402501384 },
  ];
  for (const { angle, expected } of fixtures) {
    near(fieldRadiusAt(angle), expected, `radius at ${angle}`);
  }
});

test('translation fixtures: origin, asymmetric interior and exterior points', () => {
  assert.equal(fieldInside(0, 0), true, 'the origin is always inside');
  assert.equal(fieldInside(64, 0), true);
  assert.equal(fieldInside(66, 0), false);
  assert.equal(fieldInside(0, 64), true);
  assert.equal(fieldInside(0, 65), false,
    'the local radius at +z is smaller than at +x');
  assert.equal(fieldInside(64, 0, 2), false);
  assert.equal(fieldInside(64, 0, 1), true);
  assert.equal(fieldInside(66, 0, -1), true);
});

test('translation fixtures: clamp preserves direction and enforces padding', () => {
  const plusX = fieldClamp(80, 0);
  near(plusX.x, 65.141354768386, 'clamped x');
  near(plusX.z, 0, 'clamped z');
  const plusZ = fieldClamp(0, 70);
  near(plusZ.x, 0, 'clamped z-point x');
  near(plusZ.z, 64.182597498616, 'clamped z-point z');
  const padded = fieldClamp(80, 0, 5);
  near(padded.x, 60.141354768386, 'padded x');
  near(padded.z, 0, 'padded z');
  const minimum = fieldClamp(2, 0, 1000);
  assert.deepEqual(minimum, { x: .25, z: 0 });
  assert.deepEqual(fieldClamp(0, 0), { x: 0, z: 0 });
  assert.deepEqual(fieldClamp(12, -7), { x: 12, z: -7 });
});
