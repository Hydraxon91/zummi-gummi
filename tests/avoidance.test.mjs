import test from 'node:test';
import assert from 'node:assert/strict';
import { avoidanceYaw } from '../src/avoidance.js';

function actor(uid, x, z, extra = {}) {
  return { uid, active: true, cx: x, cz: z, grabs: 0, inPond: false, ...extra };
}

test('avoidance steers away from an actor ahead on the right', () => {
  const a = actor(1, 0, 0);
  const b = actor(2, .5, .8);
  const yaw = avoidanceYaw(a, 0, [a, b]);
  assert.ok(yaw < 0, `expected a left turn, got ${yaw}`);
});

test('avoidance steers away from an actor ahead on the left', () => {
  const a = actor(1, 0, 0);
  const b = actor(2, -.5, .8);
  const yaw = avoidanceYaw(a, 0, [a, b]);
  assert.ok(yaw > 0, `expected a right turn, got ${yaw}`);
});

test('avoidance ignores actors behind, outside the radius, grabbed or in the pond', () => {
  const a = actor(1, 0, 0);
  const behind = actor(2, .2, -.8);
  const far = actor(3, 2, 2);
  const grabbed = actor(4, .3, .5, { grabs: 1 });
  const pond = actor(5, -.3, .5, { inPond: true });
  assert.equal(avoidanceYaw(a, 0, [a, behind, far, grabbed, pond]), 0);
});

test('avoidance keeps the requested heading without neighbors', () => {
  const a = actor(1, 0, 0);
  assert.equal(avoidanceYaw(a, 1.234, [a]), 1.234);
});
