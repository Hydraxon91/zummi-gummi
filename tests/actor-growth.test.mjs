import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStageGrowth } from '../src/actorlife.js';
import { scaleForStage } from '../src/life.js';

const EPSILON = 1e-6;

function makeActor(overrides = {}) {
  return {
    active: true,
    stage: 'baby',
    scale: scaleForStage('baby'),
    pendingStage: null,
    np: 4,
    cx: 2,
    cy: 1,
    cz: -1,
    px: Float32Array.from([1, 2.5, 3, 4]),
    py: Float32Array.from([0.5, 1.5, 2, -0.5]),
    pz: Float32Array.from([-2, -1, 0, 1]),
    vx: Float32Array.from([0.1, -0.2, 0.3, -0.4]),
    vy: Float32Array.from([0.5, -0.5, 0.25, -0.25]),
    vz: Float32Array.from([1, -1, 2, -2]),
    snap: new Float32Array(12),
    genome: { genes: { size: 1 } },
    guardianUid: 7,
    ai: null,
    ...overrides,
  };
}

function callbacks() {
  const events = [];
  return {
    events,
    opts: {
      isLifeActor: () => true,
      represent(actor) {
        events.push({
          kind: 'represent',
          stage: actor.stage,
          scale: actor.scale,
          pending: actor.pendingStage,
          guardian: 'guardianUid' in actor,
          aiState: actor.ai ? actor.ai.state : null,
        });
      },
      onStageUp(actor) {
        events.push({ kind: 'stageUp', stage: actor.stage });
      },
    },
  };
}

function assertPointsUnchanged(actor, px, py, pz, vx, vy, vz) {
  assert.deepEqual(Array.from(actor.px), px);
  assert.deepEqual(Array.from(actor.py), py);
  assert.deepEqual(Array.from(actor.pz), pz);
  assert.deepEqual(Array.from(actor.vx), vx);
  assert.deepEqual(Array.from(actor.vy), vy);
  assert.deepEqual(Array.from(actor.vz), vz);
}

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${label}: ${actual} != ${expected}`);
}

test('invalid, inactive, non-life and same-stage requests clear pending without growth or callbacks', () => {
  const { events, opts } = callbacks();
  assert.equal(applyStageGrowth(null, 'teen', opts), false);

  const cases = [
    { label: 'inactive', actor: makeActor({ active: false }), next: 'teen', life: true },
    { label: 'non-life', actor: makeActor(), next: 'teen', life: false },
    { label: 'invalid stage', actor: makeActor(), next: 'elder', life: true },
    { label: 'same stage', actor: makeActor({ stage: 'teen' }), next: 'teen', life: true },
  ];
  for (const { label, actor, next, life } of cases) {
    actor.pendingStage = next;
    const px = Array.from(actor.px);
    const py = Array.from(actor.py);
    const pz = Array.from(actor.pz);
    const vx = Array.from(actor.vx);
    const vy = Array.from(actor.vy);
    const vz = Array.from(actor.vz);
    const stage = actor.stage;
    const scale = actor.scale;
    const result = applyStageGrowth(actor, next, { ...opts, isLifeActor: () => life });
    assert.equal(result, false, label);
    assert.equal(actor.pendingStage, null, `${label} clears pending`);
    assert.equal(actor.stage, stage, `${label} preserves stage`);
    assert.equal(actor.scale, scale, `${label} preserves scale`);
    assertPointsUnchanged(actor, px, py, pz, vx, vy, vz);
  }
  assert.deepEqual(events, []);
});

test('grab, airborne and pond growth defers without representation or stage-up callbacks', () => {
  const states = [
    ['grab', { grabs: 1 }],
    ['airborne', { airborne: true }],
    ['pond', { inPond: true }],
  ];
  for (const [label, state] of states) {
    const { events, opts } = callbacks();
    const actor = makeActor(state);
    const px = Array.from(actor.px);
    const py = Array.from(actor.py);
    const pz = Array.from(actor.pz);
    const vx = Array.from(actor.vx);
    const vy = Array.from(actor.vy);
    const vz = Array.from(actor.vz);

    assert.equal(applyStageGrowth(actor, 'teen', opts), false, label);
    assert.equal(actor.pendingStage, 'teen', `${label} records pending stage`);
    assert.equal(actor.stage, 'baby', `${label} preserves stage`);
    assert.equal(actor.scale, scaleForStage('baby'), `${label} preserves scale`);
    assertPointsUnchanged(actor, px, py, pz, vx, vy, vz);
    assert.deepEqual(events, [], `${label} does not represent or record stage-up`);
  }
});

test('valid growth scales around COM, updates snap, clears leaving-baby state and orders callbacks', () => {
  const follow = { uid: 7 };
  const target = { x: 8, z: 9 };
  const actor = makeActor({
    stage: 'baby',
    scale: 0.5,
    genome: { genes: { size: 1.25 } },
    guardianUid: 7,
    ai: {
      adoptionRetryAt: 99,
      state: 'follow',
      follow,
      idleT: 2,
      path: [{ x: 1, z: 2 }],
      moving: true,
      target,
      nextThink: 9,
    },
  });
  const oldPx = Array.from(actor.px);
  const oldPy = Array.from(actor.py);
  const oldPz = Array.from(actor.pz);
  const oldVx = Array.from(actor.vx);
  const oldVy = Array.from(actor.vy);
  const oldVz = Array.from(actor.vz);
  const factor = (scaleForStage('teen') * 1.25) / 0.5;
  const { events, opts } = callbacks();

  assert.equal(applyStageGrowth(actor, 'teen', opts), true);
  assert.equal(actor.stage, 'teen');
  assert.equal(actor.scale, scaleForStage('teen') * 1.25);
  assert.equal(actor.pendingStage, null);
  assert.equal('guardianUid' in actor, false);
  assert.equal(actor.ai.adoptionRetryAt, 0);
  assert.equal(actor.ai.follow, null);
  assert.equal(actor.ai.state, 'wander');
  assert.equal(actor.ai.idleT, 0.5);
  assert.equal(actor.ai.path, null);
  assert.equal(actor.ai.moving, false);
  assert.equal(actor.ai.target, target, 'unrelated follow fields are preserved');
  assert.equal(actor.ai.nextThink, 9);

  for (let i = 0; i < actor.np; i++) {
    assertClose(actor.px[i], actor.cx + (oldPx[i] - actor.cx) * factor, `px ${i}`);
    assertClose(actor.py[i], actor.cy + (oldPy[i] - actor.cy) * factor, `py ${i}`);
    assertClose(actor.pz[i], actor.cz + (oldPz[i] - actor.cz) * factor, `pz ${i}`);
    assertClose(actor.vx[i], oldVx[i] * factor, `vx ${i}`);
    assertClose(actor.vy[i], oldVy[i] * factor, `vy ${i}`);
    assertClose(actor.vz[i], oldVz[i] * factor, `vz ${i}`);
    assertClose(actor.snap[i * 3], actor.px[i], `snap x ${i}`);
    assertClose(actor.snap[i * 3 + 1], actor.py[i], `snap y ${i}`);
    assertClose(actor.snap[i * 3 + 2], actor.pz[i], `snap z ${i}`);
  }

  assert.deepEqual(events, [
    {
      kind: 'represent',
      stage: 'teen',
      scale: scaleForStage('teen') * 1.25,
      pending: null,
      guardian: false,
      aiState: 'wander',
    },
    { kind: 'stageUp', stage: 'teen' },
  ]);

  // The same-stage request after a successful change is inert apart from
  // clearing stale pending state; it must not scale or re-run side effects.
  const settledPx = Array.from(actor.px);
  const settledScale = actor.scale;
  actor.pendingStage = 'adult';
  assert.equal(applyStageGrowth(actor, 'teen', opts), false);
  assert.equal(actor.pendingStage, null);
  assert.equal(actor.scale, settledScale);
  assert.deepEqual(Array.from(actor.px), settledPx);
  assert.equal(events.length, 2);
});

test('a transition back to baby preserves guardian, adoption retry and follow state', () => {
  const follow = { uid: 3 };
  const actor = makeActor({
    stage: 'teen',
    scale: scaleForStage('teen'),
    guardianUid: 3,
    ai: {
      adoptionRetryAt: 42,
      state: 'follow',
      follow,
      idleT: 1.75,
      path: [{ x: 4, z: 5 }],
      moving: true,
    },
  });
  const { events, opts } = callbacks();

  assert.equal(applyStageGrowth(actor, 'baby', opts), true);
  assert.equal(actor.stage, 'baby');
  assert.equal(actor.scale, scaleForStage('baby'));
  assert.equal(actor.guardianUid, 3);
  assert.equal(actor.ai.adoptionRetryAt, 42);
  assert.equal(actor.ai.state, 'follow');
  assert.equal(actor.ai.follow, follow);
  assert.equal(actor.ai.idleT, 1.75);
  assert.deepEqual(actor.ai.path, [{ x: 4, z: 5 }]);
  assert.equal(actor.ai.moving, true);
  assert.deepEqual(events.map((event) => event.kind), ['represent', 'stageUp']);
});
