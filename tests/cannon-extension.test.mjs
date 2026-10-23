import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANNON, cannonAimSolution, cannonAimArc, cannonCooldownBlock,
  cannonShotPlacement,
} from '../src/cannonaim.js';

// Fixture-only representative extension proof for the M21 toy seam. It uses the
// existing pure contracts and an injected sink; it does not boot the app, touch
// three.js or write any production/global state.

const TABLE = Object.freeze({ hx: 3, hz: 2.5 });
const FROM = Object.freeze({ x: -0.7, z: 0.9 });
const TO = Object.freeze({ x: 1.1, z: -1.3 });

function makeFixture() {
  const calls = [];
  const sink = {
    shots: [],
    deliver(solution, shot) {
      this.shots.push({
        velocity: Object.freeze({ ...solution.velocity }),
        origin: Object.freeze({ ...shot.origin }),
      });
    },
  };
  return { calls, sink };
}

test('fixture extension reuses aim, arc, placement and an injected sink', () => {
  const { calls, sink } = makeFixture();
  const solution = cannonAimSolution(FROM, TO, { table: TABLE });
  const arc = cannonAimArc(solution, { count: 44 });
  assert.ok(arc.dots.length > 0);
  assert.equal(arc.land.y, CANNON.landY);

  const canSpawnAt = (x, z, radius, muzzle) => {
    calls.push({ x, z, radius, muzzle });
    return true;
  };
  const shot = cannonShotPlacement(solution, arc.land, canSpawnAt);
  assert.equal(shot.ok, true);
  assert.equal(shot.block, null);
  assert.deepEqual(shot.origin, {
    x: solution.muzzle.x + solution.dir.x * 0.36,
    y: solution.muzzle.y + solution.dir.y * 0.36,
    z: solution.muzzle.z + solution.dir.z * 0.36,
  });

  sink.deliver(solution, shot);
  assert.equal(sink.shots.length, 1);
  assert.deepEqual(sink.shots[0].velocity, solution.velocity);
  assert.deepEqual(sink.shots[0].origin, shot.origin);

  // The fixture only asked the injected callback: one muzzle probe and one
  // landing probe for this clear path.
  assert.deepEqual(calls.map(c => c.muzzle), [true, false]);
  assert.deepEqual(calls.map(c => c.radius), [0.40, 0.45]);
  assert.equal(calls[1].x, arc.land.x);
  assert.equal(calls[1].z, arc.land.z);
  assert.deepEqual(FROM, { x: -0.7, z: 0.9 });
  assert.deepEqual(TO, { x: 1.1, z: -1.3 });
  assert.ok(Object.isFrozen(CANNON));
});

test('fixture extension refuses a blocked muzzle without delivering', () => {
  const { calls, sink } = makeFixture();
  const solution = cannonAimSolution(FROM, TO, { table: TABLE });
  const arc = cannonAimArc(solution, { count: 44 });
  const canSpawnAt = (x, z, radius, muzzle) => {
    calls.push({ x, z, radius, muzzle });
    return false;
  };

  const shot = cannonShotPlacement(solution, arc.land, canSpawnAt);
  assert.deepEqual(shot, { ok: false, block: 'muzzle', origin: shot.origin });
  assert.equal(shot.block, 'muzzle');
  assert.equal(sink.shots.length, 0);
  // First muzzle probe fails, the pushed alternative muzzle probe fails, and
  // landing is never evaluated.
  assert.deepEqual(calls.map(c => c.muzzle), [true, true]);
});

test('fixture extension refuses a blocked landing after a clear muzzle', () => {
  const { calls, sink } = makeFixture();
  const solution = cannonAimSolution(FROM, TO, { table: TABLE });
  const arc = cannonAimArc(solution, { count: 44 });
  const canSpawnAt = (x, z, radius, muzzle) => {
    calls.push({ x, z, radius, muzzle });
    return muzzle;
  };

  const shot = cannonShotPlacement(solution, arc.land, canSpawnAt);
  assert.equal(shot.ok, false);
  assert.equal(shot.block, 'landing');
  assert.equal(sink.shots.length, 0);
  assert.deepEqual(calls.map(c => c.muzzle), [true, false]);
});

test('fixture extension observes the existing cooldown boundary', () => {
  const { sink } = makeFixture();
  assert.equal(cannonCooldownBlock(149, 100, 50), true);
  assert.equal(cannonCooldownBlock(150, 100, 50), false);
  assert.equal(cannonCooldownBlock(151, 100, 50), false);
  assert.equal(sink.shots.length, 0);
});

test('fixture leaves production exports and ambient globals untouched', () => {
  const globalKeys = ['window', 'document', 'localStorage', 'sessionStorage', 'THREE', '__gummy'];
  const before = globalKeys.map(key => globalThis[key]);
  const randomBefore = Math.random;

  const { sink } = makeFixture();
  const solution = cannonAimSolution(FROM, TO, { table: TABLE });
  const arc = cannonAimArc(solution, { count: 44 });
  const shot = cannonShotPlacement(solution, arc.land, () => true);
  sink.deliver(solution, shot);
  cannonCooldownBlock(0, 0, 1);

  assert.deepEqual(globalKeys.map(key => globalThis[key]), before);
  assert.equal(Math.random, randomBefore);
  assert.deepEqual({ ...CANNON }, {
    pivotY: 0.43, muzzleZ: 0.44, angle: 0.56, landY: 0.60, gravity: 12,
    minSpeed: 5, maxSpeed: 22, baseMargin: 0.45,
  });
  assert.deepEqual(Object.keys(sink), ['shots', 'deliver']);
  assert.equal(sink.shots.length, 1);
});
