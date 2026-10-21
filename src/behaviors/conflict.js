// Conflict behavior: contested food, seekConflict and conflict.
//
// The tie still goes to the acting actor, weights draw two RNG values in fixed
// actor order, the bond loss is symmetric and the shove stays 1.15. The
// profile's damage/healthFloor/shove fields remain reserved and unused. Flee
// stays in the engine as a threat response shared with the hive.

import { isSafeFood } from '../foodtypes.js';
import { addBond, pairBond, pushHistory } from '../family.js';
import { beginPair } from '../interactions.js';
import { defineBehaviorModule } from './module.js';

function clamp(n, lo, hi) {
  return n < lo ? lo : (n > hi ? hi : n);
}

function unit(value) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function findContest(ctx) {
  const { actor, ai, p, api, field } = ctx;
  const conflict = p.conflict;
  if (!conflict || !actor || !ai || !field || !field.food || !field.food.sources) return null;
  if (actor.hunger < p.thresholds.seekHunger ||
      actor.health < p.thresholds.healthWoozy ||
      ai.conflictCooldown > 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const source of field.food.sources) {
    if (!source.ripe || !source.claim || source.claim === actor) continue;
    if (!isSafeFood(source)) continue;
    const other = source.claim;
    if (!other || !other.active || other.sleeping ||
        other.health < api.profile(other).thresholds.healthWoozy) {
      if (other && other.active && !other.sleeping) api.coverConflictOutcome('healthFloor');
      continue;
    }
    if (!other.ai || !['wander', 'seekFood', 'eat', 'drink', 'seekWater', 'seekCompany'].includes(other.ai.state)) continue;
    if (other.grabs > 0 || other.inPond) continue;
    const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
    if (d > conflict.radius) continue;
    const dc = Math.hypot(other.cx - source.approachX, other.cz - source.approachZ);
    if (dc > 3.5) continue;
    if (actor.bold < .30 && other.scale > actor.scale * 1.06) continue;
    const score = (1 - d / conflict.radius) * .6 + actor.hunger * .5 +
      (actor.scale >= other.scale ? .08 : 0) - pairBond(actor, other) * .25;
    if (score > bestScore) { bestScore = score; best = { source, actor: other }; }
  }
  return best;
}

function acquireContest(ctx) {
  const { actor, ai, api } = ctx;
  if (!ctx.p.conflict) return null;
  const contest = findContest(ctx);
  if (!contest) return null;
  api.releaseFood(actor);
  ai.source = null;
  ai.contestSource = contest.source;
  ai.contestBear = contest.actor;
  ai.state = 'seekConflict';
  ai.target = { x: contest.source.approachX, z: contest.source.approachZ };
  api.face(actor, contest.source.approachX, contest.source.approachZ);
  api.setDestination(actor, contest.source.approachX, contest.source.approachZ);
  return contest.source;
}

function thinkSeekConflict(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return;
  const source = ai.contestSource;
  const other = source ? source.claim : ai.contestBear;
  if (!source || !source.ripe || !other || !other.active || other.sleeping ||
      other.grabs > 0 || other.inPond || !other.ai) {
    ai.contestSource = null;
    ai.contestBear = null;
    ai.state = 'wander';
    ai.idleT = .6;
    ai.conflictCooldown = Math.max(ai.conflictCooldown, 2);
    api.stop(actor);
    return;
  }
  const d = Math.hypot(other.cx - actor.cx, other.cz - actor.cz);
  if (d <= p.conflict.dist) {
    startConflict(ctx, other, source);
    return;
  }
  ai.target = { x: source.approachX, z: source.approachZ };
  api.face(actor, source.approachX, source.approachZ);
  if (api.needsReplan(ai)) {
    if (!api.setDestination(actor, source.approachX, source.approachZ)) {
      ai.contestSource = null;
      ai.contestBear = null;
      ai.state = 'wander';
      ai.idleT = .6;
      ai.conflictCooldown = Math.max(ai.conflictCooldown, 3);
    }
  }
}

function startConflict(ctx, other, source) {
  const { actor, ai, p, api } = ctx;
  const conflict = p.conflict;
  if (!conflict || !actor || !other || !ai || !other.ai || actor === other) return false;
  beginPair(actor, other, 'conflict', { stop: api.stop, face: api.face });
  ai.conflictT = conflict.time;
  other.ai.conflictT = conflict.time;
  ai.conflictSource = source;
  other.ai.conflictSource = source;
  ai.target = { x: other.cx, z: other.cz };
  other.ai.target = { x: actor.cx, z: actor.cz };
  ai.animT = 0;
  other.ai.animT = 0;
  api.emit(actor, 'exclaim', 1.14);
  api.emit(other, 'exclaim', 1.14);
  return true;
}

function finishConflict(ctx) {
  const { actor, ai, p, api, rng } = ctx;
  const conflict = p.conflict;
  if (!conflict || !actor || !ai || ai.state !== 'conflict') return;
  const other = ai.partner;
  const source = ai.conflictSource || (other && other.ai ? other.ai.conflictSource : null);
  if (!other || !other.ai) {
    ai.state = 'wander';
    ai.partner = null;
    ai.conflictSource = null;
    ai.conflictT = 0;
    api.stop(actor);
    return;
  }
  const weight = (bear) => (bear.scale || 1) * 1.05 + unit(bear.hunger) * .75 +
    unit(bear.bold) * .35 + unit(bear.energy) * .15 + rng() * .20;
  const weightActor = weight(actor);
  const weightOther = weight(other);
  if (Math.abs(weightActor - weightOther) < 1e-9) api.coverConflictOutcome('tie');
  else if (weightActor > weightOther) api.coverConflictOutcome('actor');
  else api.coverConflictOutcome('opponent');
  const winner = weightActor >= weightOther ? actor : other;
  const loser = winner === actor ? other : actor;
  const claimant = source ? source.claim : null;
  const claimOk = !!source && source.ripe;
  const day = typeof api.dayNow === 'function' ? api.dayNow() : 0;
  const hour = typeof api.hoursNow === 'function' ? api.hoursNow() : 0;
  pushHistory(actor, { kind: 'conflict', uid: other.uid, day, hour });
  pushHistory(other, { kind: 'conflict', uid: actor.uid, day, hour });

  actor.ai.partner = null;
  other.ai.partner = null;
  actor.ai.conflictSource = null;
  other.ai.conflictSource = null;
  actor.ai.contestSource = null;
  other.ai.contestSource = null;
  actor.ai.contestBear = null;
  other.ai.contestBear = null;
  actor.ai.conflictT = 0;
  other.ai.conflictT = 0;

  if (claimOk && winner !== claimant) {
    api.field.food.release(source, claimant);
    api.field.food.claim(source, winner);
  }

  const loserWasClaimant = loser === claimant;
  if (loserWasClaimant && source) api.field.food.release(source, loser);
  api.releaseFood(loser);
  loser.ai.source = null;
  loser.ai.state = 'wander';
  loser.ai.idleT = .8;
  loser.ai.taskCooldown = 2.4;
  loser.ai.conflictCooldown = conflict.cooldown;
  loser.ai.socialCooldown = Math.max(loser.ai.socialCooldown, 4.0);
  api.stop(loser);
  const dx = loser.cx - winner.cx;
  const dz = loser.cz - winner.cz;
  const len = Math.hypot(dx, dz) || 1;
  loser.ai.shove = { x: dx / len * 1.15, z: dz / len * 1.15 };

  winner.ai.taskCooldown = .35;
  winner.ai.conflictCooldown = 5;
  winner.ai.idleT = .2;
  if (claimOk && source.claim === winner) {
    winner.ai.source = source;
    winner.ai.target = { x: source.approachX, z: source.approachZ };
    const d = Math.hypot(source.approachX - winner.cx, source.approachZ - winner.cz);
    if (d <= api.profile(winner).food.eatDist) {
      api.startEat(winner);
    } else {
      winner.ai.state = 'seekFood';
      api.setDestination(winner, source.approachX, source.approachZ);
    }
  } else {
    winner.ai.source = null;
    winner.ai.state = 'wander';
    winner.ai.idleT = .5;
    api.stop(winner);
  }
  addBond(actor, other, -.08);
  api.emit(loser, 'no', 1.05);
}

export const conflictModule = defineBehaviorModule({
  id: 'conflict',
  label: 'Contested food and conflict',
  states: ['seekConflict', 'conflict'],
  activeStates: ['conflict'],
  defaults: { enabled: true, params: {} },
  opportunities: [{
    id: 'conflict.critical',
    order: 45,
    canRun: (ctx) => {
      if (!ctx.p.conflict || !ctx.actor || ctx.actor.hunger < ctx.p.thresholds.criticalHunger) return false;
      ctx.api.coverSlot('conflict.critical');
      return true;
    },
    enter: (ctx) => !!acquireContest(ctx),
  }, {
    id: 'conflict.fallback',
    order: 55,
    canRun: (ctx) => {
      if (!ctx.p.conflict || !ctx.actor || ctx.actor.hunger < ctx.p.thresholds.seekHunger) return false;
      ctx.api.coverSlot('conflict.fallback');
      return true;
    },
    enter: (ctx) => !!acquireContest(ctx),
  }],
  findContest,
  acquireContest,
  startConflict,
  finishConflict,
  think(ctx) {
    if (!ctx.ai || ctx.ai.state !== 'seekConflict') return false;
    thinkSeekConflict(ctx);
    return true;
  },
  tick(ctx) {
    const { ai, dt } = ctx;
    if (!ai || ai.state !== 'conflict') return false;
    ai.animT += dt;
    ai.conflictT -= dt;
    if (ai.conflictT <= 0) finishConflict(ctx);
    return true;
  },
  isTraveling: (ctx) => !!(ctx.ai && ctx.ai.state === 'seekConflict'),
});
