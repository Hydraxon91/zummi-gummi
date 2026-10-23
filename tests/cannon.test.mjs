import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CANNON, clampToCannonBounds, cannonPlacementProblem, cannonAimSolution,
  cannonAimArc, cannonCooldownBlock, cannonShotPlacement,
} from '../src/cannonaim.js';

const TABLE = Object.freeze({ hx: 3, hz: 2.5 });
const TOL = 1e-12;

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= TOL,
    `${label}: ${actual} is not within ${TOL} of ${expected}`);
}

function nearPoint(actual, expected, label) {
  near(actual.x, expected.x, `${label}.x`);
  near(actual.z, expected.z, `${label}.z`);
  if ('y' in expected) near(actual.y, expected.y, `${label}.y`);
}

test('CANNON constants are frozen and match the launcher values', () => {
  assert.ok(Object.isFrozen(CANNON));
  assert.deepEqual({ ...CANNON }, {
    pivotY: 0.43, muzzleZ: 0.44, angle: 0.56, landY: 0.60, gravity: 12,
    minSpeed: 5, maxSpeed: 22, baseMargin: 0.45,
  });
});

test('clampToCannonBounds gives the injected clamp precedence', () => {
  const calls = [];
  const result = clampToCannonBounds(9, -9, {
    table: TABLE,
    margin: 0.2,
    clampBounds: (x, z, margin) => {
      calls.push({ x, z, margin });
      return { x: x * 0.5, z: z * 0.5 };
    },
  });
  assert.deepEqual(result, { x: 4.5, z: -4.5 });
  assert.deepEqual(calls, [{ x: 9, z: -9, margin: 0.2 }]);
});

test('clampToCannonBounds uses the exact table fallback and base margin', () => {
  assert.deepEqual(clampToCannonBounds(10, -10, { table: TABLE }), { x: 2.55, z: -2.05 });
  assert.deepEqual(clampToCannonBounds(-10, 10, { table: TABLE, margin: 0.1 }), { x: -2.9, z: 2.4 });
  assert.deepEqual(clampToCannonBounds(0.4, 0.2, { table: TABLE }), { x: 0.4, z: 0.2 });
});

test('placement rejects non-finite input before touching bounds or callbacks', () => {
  const reason = cannonPlacementProblem(NaN, 0, {
    table: TABLE,
    insideBounds: () => { throw new Error('bounds must not run'); },
    bears: [{ get active() { throw new Error('bears must not run'); } }],
    placementExtra: () => { throw new Error('extra must not run'); },
  });
  assert.equal(reason, 'invalid');
  assert.equal(cannonPlacementProblem(0, Infinity, { table: TABLE }), 'invalid');
});

test('placement bounds precede bears and extra', () => {
  const seen = [];
  const reason = cannonPlacementProblem(2, 2, {
    table: TABLE,
    insideBounds: () => false,
    bears: [{ get active() { seen.push('bear'); return true; } }],
    placementExtra: () => { seen.push('extra'); return true; },
  });
  assert.equal(reason, 'bounds');
  assert.deepEqual(seen, []);

  assert.equal(cannonPlacementProblem(3.2, 0, { table: TABLE }), 'bounds');
  assert.equal(cannonPlacementProblem(0, -2.4, { table: TABLE }), 'bounds');
});

test('placement applies active-bear clearance with scale and default scale', () => {
  const scaleTwo = [{ active: true, cx: 1, cz: 0, scale: 2 }];
  assert.equal(cannonPlacementProblem(1.95, 0, { table: TABLE, bears: scaleTwo }), 'bear');
  assert.equal(cannonPlacementProblem(2.02, 0, { table: TABLE, bears: scaleTwo }), null);

  const defaultScale = [{ active: true, cx: 1, cz: 0 }];
  assert.equal(cannonPlacementProblem(1.75, 0, { table: TABLE, bears: defaultScale }), 'bear');
  assert.equal(cannonPlacementProblem(1.85, 0, { table: TABLE, bears: defaultScale }), null);

  const inactive = [{ active: false, cx: 0, cz: 0, scale: 4 }];
  assert.equal(cannonPlacementProblem(0, 0, { table: TABLE, bears: inactive }), null);
});

test('placement extra runs last and can short-circuit to extra', () => {
  const seen = [];
  const reason = cannonPlacementProblem(0.4, 0.2, {
    table: TABLE,
    bears: [{ active: true, cx: 8, cz: 8 }],
    insideBounds: (x, z, margin) => { seen.push(['bounds', x, z, margin]); return true; },
    placementExtra: (x, z) => { seen.push(['extra', x, z]); return false; },
  });
  assert.equal(reason, 'extra');
  assert.deepEqual(seen, [
    ['bounds', 0.4, 0.2, 0.45],
    ['extra', 0.4, 0.2],
  ]);
  assert.equal(cannonPlacementProblem(0.4, 0.2, {
    table: TABLE, insideBounds: () => true, placementExtra: () => true,
  }), null);
});

test('aim fixture: clamped table target, formula values and no mutation', () => {
  const from = Object.freeze({ x: -0.7, z: 0.9 });
  const to = Object.freeze({ x: 1.1, z: -1.3 });
  const sol = cannonAimSolution(from, to, { table: TABLE });
  // Formula fixture documented in the boundary contract: base (-0.7, 0.9) to
  // target (1.1, -1.3) on table hx=3, hz=2.5.
  near(sol.yaw, 2.455863142683507, 'yaw');
  near(sol.pitch, -0.56, 'pitch');
  nearPoint(sol.muzzle, { x: -0.46393386011578475, y: 0.6637219270851886, z: 0.6114747179192925 }, 'muzzle');
  nearPoint(sol.dir, { x: 0.5365139542823073, y: 0.5311861979208834, z: -0.6557392774561536 }, 'dir');
  near(sol.speed, 5.623588997414371, 'speed');
  nearPoint(sol.velocity, {
    x: 3.0171339702612605, y: 2.9871728582062524, z: -3.687608185874875,
  }, 'velocity');
  nearPoint(sol.target, { x: 1.1, z: -1.3 }, 'target');
  assert.deepEqual(from, { x: -0.7, z: 0.9 });
  assert.deepEqual(to, { x: 1.1, z: -1.3 });
});

test('aim clamps through the injected bounds with margin 0.16', () => {
  const calls = [];
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: 99, z: -99 }, {
    table: TABLE,
    clampBounds: (x, z, margin) => {
      calls.push({ x, z, margin });
      return { x: 2.7, z: -2.2 };
    },
  });
  assert.deepEqual(calls, [{ x: 99, z: -99, margin: 0.16 }]);
  assert.deepEqual(sol.target, { x: 2.7, z: -2.2 });
});

test('aim table fallback clamps target and keeps the 0.8 minimum distance push', () => {
  const out = cannonAimSolution({ x: 0, z: 0 }, { x: 10, z: -10 }, { table: TABLE });
  assert.deepEqual(out.target, { x: 2.84, z: -2.34 });
  near(out.yaw, Math.atan2(2.84, -2.34), 'clamped yaw');

  const pushed = cannonAimSolution({ x: 0, z: 0 }, { x: 0.2, z: 0 }, { table: TABLE });
  assert.deepEqual(pushed.target, { x: 0.8, z: 0 });
  near(pushed.yaw, Math.PI / 2, 'pushed yaw');

  const atBase = cannonAimSolution({ x: 0, z: 0 }, { x: 0, z: 0 }, { table: TABLE });
  assert.deepEqual(atBase.target, { x: 0, z: 0 });
  assert.equal(atBase.speed, 5);
});

test('aim clamps speed between minimum and maximum', () => {
  const min = cannonAimSolution({ x: 0, z: 0 }, { x: 0.5, z: 0 }, { table: TABLE });
  assert.equal(min.speed, 5);
  const max = cannonAimSolution({ x: 0, z: 0 }, { x: 200, z: 0 }, {
    table: TABLE, clampBounds: () => ({ x: 200, z: 0 }),
  });
  assert.equal(max.speed, 22);
  near(Math.hypot(max.dir.x, max.dir.y, max.dir.z), 1, 'dir length');
  nearPoint(max.velocity, { x: max.dir.x * 22, y: max.dir.y * 22, z: max.dir.z * 22 }, 'velocity');
});

test('aim preserves Number(x)||0 target normalization', () => {
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: '2', z: '' }, { table: TABLE });
  assert.deepEqual(sol.target, { x: 2, z: 0 });
  const zero = cannonAimSolution({ x: 0, z: 0 }, { x: NaN, z: undefined }, { table: TABLE });
  assert.deepEqual(zero.target, { x: 0, z: 0 });
});

test('aim arc writes the 44-dot order, break landing and three markers', () => {
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: 1.2, z: -0.8 }, { table: TABLE });
  const arc = cannonAimArc(sol, { count: 44 });
  assert.equal(arc.dots.length, 16);
  for (let i = 0; i < 13; i++) {
    const t = (i + 1) * 0.035;
    nearPoint(arc.dots[i], {
      x: sol.muzzle.x + sol.velocity.x * t,
      y: sol.muzzle.y + sol.velocity.y * t - 0.5 * 12 * t * t,
      z: sol.muzzle.z + sol.velocity.z * t,
    }, `dot ${i}`);
  }
  nearPoint(arc.dots[13], { x: arc.land.x, y: 0.6 - (0.6 - 0.05) / 3.15, z: arc.land.z }, 'marker 1');
  nearPoint(arc.dots[14], { x: arc.land.x, y: 0.6 - (0.6 - 0.05) * 2 / 3.15, z: arc.land.z }, 'marker 2');
  nearPoint(arc.dots[15], { x: arc.land.x, y: 0.6 - (0.6 - 0.05) * 3 / 3.15, z: arc.land.z }, 'marker 3');
  nearPoint(arc.land, { x: 2.037331118399091, y: 0.6, z: -1.3582207455993944 }, 'land');
});

test('aim arc falls back to target and respects custom count and step', () => {
  const sol = {
    muzzle: { x: 0, y: 0.66, z: 0 },
    velocity: { x: 0, y: 20, z: 0 },
    target: { x: 1.5, z: -1.5 },
  };
  const short = cannonAimArc(sol, { count: 4, step: 0.05 });
  assert.equal(short.dots.length, 4);
  nearPoint(short.dots[0], { x: 0, y: 0.66 + 20 * 0.05 - 0.5 * 12 * 0.05 * 0.05, z: 0 }, 'custom dot');
  assert.deepEqual(short.land, { x: 1.5, y: 0.6, z: -1.5 });

  const capped = cannonAimArc(sol, { count: 5 });
  assert.equal(capped.dots.length, 5);
  assert.deepEqual(capped.land, { x: 1.5, y: 0.6, z: -1.5 });
});

test('aim arc fills only the available marker slots', () => {
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: 1.2, z: -0.8 }, { table: TABLE });
  const arc = cannonAimArc(sol, { count: 14 });
  assert.equal(arc.dots.length, 14);
  nearPoint(arc.dots[13], { x: arc.land.x, y: 0.6 - (0.6 - 0.05) / 3.15, z: arc.land.z }, 'single marker');
});

test('cooldown blocks strictly before the boundary only', () => {
  assert.equal(cannonCooldownBlock(99.999, 0, 100), true);
  assert.equal(cannonCooldownBlock(100, 0, 100), false);
  assert.equal(cannonCooldownBlock(100.001, 0, 100), false);
  assert.equal(cannonCooldownBlock(259, 0, 260), true);
  assert.equal(cannonCooldownBlock(260, 0, 260), false);
});

test('shot placement accepts the primary muzzle point then landing', () => {
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: 1.2, z: -0.8 }, { table: TABLE });
  const land = { x: 0.5, y: 0.6, z: 0.2 };
  const calls = [];
  const shot = cannonShotPlacement(sol, land, (...args) => { calls.push(args); return true; });
  const expected = {
    x: sol.muzzle.x + sol.dir.x * 0.36,
    y: sol.muzzle.y + sol.dir.y * 0.36,
    z: sol.muzzle.z + sol.dir.z * 0.36,
  };
  assert.deepEqual(shot, { ok: true, block: null, origin: expected });
  assert.deepEqual(calls, [
    [expected.x, expected.z, 0.40, true],
    [0.5, 0.2, 0.45, false],
  ]);
});

test('shot placement retries one short step along the shot line', () => {
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: 1.2, z: -0.8 }, { table: TABLE });
  const land = { x: 0.5, y: 0.6, z: 0.2 };
  const calls = [];
  const shot = cannonShotPlacement(sol, land, (x, z, r, includeBears) => {
    calls.push({ x, z, r, includeBears });
    return calls.length !== 1;
  });
  const primary = {
    x: sol.muzzle.x + sol.dir.x * 0.36,
    y: sol.muzzle.y + sol.dir.y * 0.36,
    z: sol.muzzle.z + sol.dir.z * 0.36,
  };
  const retry = {
    x: primary.x + sol.dir.x * 0.60,
    y: primary.y + sol.dir.y * 0.60,
    z: primary.z + sol.dir.z * 0.60,
  };
  assert.deepEqual(shot, { ok: true, block: null, origin: retry });
  assert.deepEqual(calls, [
    { x: primary.x, z: primary.z, r: 0.40, includeBears: true },
    { x: retry.x, z: retry.z, r: 0.40, includeBears: true },
    { x: 0.5, z: 0.2, r: 0.45, includeBears: false },
  ]);
});

test('shot placement reports muzzle refusal without testing the landing', () => {
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: 1.2, z: -0.8 }, { table: TABLE });
  const calls = [];
  const shot = cannonShotPlacement(sol, { x: 0.5, y: 0.6, z: 0.2 }, (x, z, r, includeBears) => {
    calls.push({ x, z, r, includeBears });
    return false;
  });
  assert.equal(shot.ok, false);
  assert.equal(shot.block, 'muzzle');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.r === 0.40 && c.includeBears === true));
});

test('shot placement reports landing refusal and keeps the chosen origin', () => {
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: 1.2, z: -0.8 }, { table: TABLE });
  const calls = [];
  const shot = cannonShotPlacement(sol, { x: 0.5, y: 0.6, z: 0.2 }, (x, z, r, includeBears) => {
    calls.push({ x, z, r, includeBears });
    return !(r === 0.45);
  });
  const primary = {
    x: sol.muzzle.x + sol.dir.x * 0.36,
    y: sol.muzzle.y + sol.dir.y * 0.36,
    z: sol.muzzle.z + sol.dir.z * 0.36,
  };
  assert.deepEqual(shot, { ok: false, block: 'landing', origin: primary });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { x: 0.5, z: 0.2, r: 0.45, includeBears: false });
});

test('shot placement is a pure accepted shot when no spawn guard is supplied', () => {
  const sol = cannonAimSolution({ x: 0, z: 0 }, { x: 1.2, z: -0.8 }, { table: TABLE });
  const land = Object.freeze({ x: 0.5, y: 0.6, z: 0.2 });
  const beforeSol = JSON.stringify(sol);
  assert.deepEqual(cannonShotPlacement(sol, land), {
    ok: true, block: null, origin: {
      x: sol.muzzle.x + sol.dir.x * 0.36,
      y: sol.muzzle.y + sol.dir.y * 0.36,
      z: sol.muzzle.z + sol.dir.z * 0.36,
    },
  });
  assert.equal(JSON.stringify(sol), beforeSol);
  assert.deepEqual(land, { x: 0.5, y: 0.6, z: 0.2 });
});

test('cannonaim source has no renderer, DOM, storage, randomness or clock access', async () => {
  const source = await readFile(new URL('../src/cannonaim.js', import.meta.url), 'utf8');
  for (const banned of [
    /^\s*import\b/m, /\brequire\s*\(/, /\bdocument\b/, /\bwindow\b/, /localStorage/,
    /\bthree\b/i, /Math\.random/, /\bperformance\b/, /\bDate\b/, /\bsetTimeout\b/,
  ]) {
    assert.equal(banned.test(source), false, `unexpected ${banned}`);
  }
});
