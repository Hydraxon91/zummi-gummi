// Soft-body life-stage growth orchestration.
//
// This module owns the portable part of a stage change: eligibility, deferred
// state, growth around the centre of mass and the relationship/behavior cleanup
// that happens when an actor leaves baby stage. The host supplies representation
// rebuild and stage-up side effects, keeping renderer, physics and history out of
// this module.

import { STAGE_ORDER, scaleForStage } from './life.js';

export function applyStageGrowth(actor, nextStage, {
  isLifeActor = () => false,
  represent,
  onStageUp,
} = {}) {
  if (!actor || !actor.active || !isLifeActor(actor) ||
      !STAGE_ORDER.includes(nextStage) || actor.stage === nextStage) {
    if (actor) actor.pendingStage = null;
    return false;
  }
  if (actor.grabs > 0 || actor.airborne || actor.inPond) {
    actor.pendingStage = nextStage;
    return false;
  }

  const oldScale = actor.scale || 1;
  const genomeSize = actor.genome && Number.isFinite(actor.genome.genes?.size)
    ? actor.genome.genes.size
    : 1;
  const nextScale = scaleForStage(nextStage) * genomeSize;
  const factor = nextScale / oldScale;
  for (let i = 0; i < actor.np; i++) {
    actor.px[i] = actor.cx + (actor.px[i] - actor.cx) * factor;
    actor.py[i] = actor.cy + (actor.py[i] - actor.cy) * factor;
    actor.pz[i] = actor.cz + (actor.pz[i] - actor.cz) * factor;
    actor.vx[i] *= factor;
    actor.vy[i] *= factor;
    actor.vz[i] *= factor;
    actor.snap[i * 3] = actor.px[i];
    actor.snap[i * 3 + 1] = actor.py[i];
    actor.snap[i * 3 + 2] = actor.pz[i];
  }
  actor.scale = nextScale;
  actor.stage = nextStage;
  actor.pendingStage = null;
  if (nextStage !== 'baby') {
    delete actor.guardianUid;
    if (actor.ai) actor.ai.adoptionRetryAt = 0;
  }
  if (nextStage !== 'baby' && actor.ai && actor.ai.state === 'follow') {
    actor.ai.follow = null;
    actor.ai.state = 'wander';
    actor.ai.idleT = .5;
    actor.ai.path = null;
    actor.ai.moving = false;
  }

  if (typeof represent === 'function') represent(actor);
  if (typeof onStageUp === 'function') onStageUp(actor);
  return true;
}
