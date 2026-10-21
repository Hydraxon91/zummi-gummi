// Baby follow behavior.
//
// Babies only; target selection uses mate.followDist. The retry throttle is the
// current engine value (30s after the b7f5fea stall change; the older 8s literal
// is historical). Stage-up cancellation stays in app.js applyBearStage().

import { defineBehaviorModule } from './module.js';

function parentTarget(ctx, parent) {
  const { api, field } = ctx;
  if (!parent) return null;
  if (parent.inside || parent.sleeping) {
    const home = field && Array.isArray(field.homes)
      ? field.homes.find(h => h.name === parent.home) : null;
    if (home) return { x: home.door.x, z: home.door.z };
  }
  return { x: parent.cx, z: parent.cz };
}

function startFollow(ctx, parent) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai || !parent || !parent.ai) return false;
  if (parent.inside || parent.sleeping) return false;
  if (ai.followRetryT > 0) return false;
  const target = parentTarget(ctx, parent);
  if (!target) return false;
  api.releaseFood(actor);
  ai.source = null;
  ai.waterSpot = null;
  ai.follow = parent;
  ai.state = 'follow';
  ai.target = { x: target.x, z: target.z };
  api.face(actor, target.x, target.z);
  ai.moving = false;
  api.setPath(actor, api.pathTo(actor, target.x, target.z) || [{ x: target.x, z: target.z }]);
  return true;
}

function thinkFollow(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return;
  const parent = ai.follow;
  if (!parent || !parent.ai || !parent.active || parent.grabs > 0 || parent.inPond) {
    ai.follow = null;
    ai.state = 'wander';
    ai.idleT = .5;
    api.stop(actor);
    return;
  }
  // Adoption can swap the target while the child is already following: a
  // returning parent replaces the guardian, and a new guardian replaces a
  // departed one. The off path never enters this branch.
  if (ctx.api.adoptionActive && ctx.api.adoptionActive()) {
    const nextTarget = ctx.api.followTargetFor(actor);
    if (nextTarget && nextTarget !== parent) {
      ai.follow = null;
      ai.state = 'wander';
      ai.idleT = .5;
      ai.nextThink = 0;
      ai.followRetryT = 0;
      api.stop(actor);
      return;
    }
  }
  if (parent.inside || parent.sleeping) {
    ai.follow = null;
    ai.state = 'wander';
    ai.idleT = .6;
    ai.followRetryT = 30;
    api.stop(actor);
    return;
  }
  const target = parentTarget(ctx, parent);
  if (!target) return;
  const d = Math.hypot(target.x - actor.cx, target.z - actor.cz);
  const followDist = p.mate.followDist;
  if (d <= followDist) {
    ai.moving = false;
    ai.path = null;
    api.face(actor, parent.cx, parent.cz);
    return;
  }
  if (!ai.path || !ai.path.length || !ai.moving) {
    if (!api.setDestination(actor, target.x, target.z)) {
      ai.follow = null;
      ai.state = 'wander';
      ai.idleT = .6;
      ai.taskCooldown = Math.max(ai.taskCooldown || 0, 1.0);
      ai.followRetryT = 30;
      api.stop(actor);
    }
  }
}

export const followModule = defineBehaviorModule({
  id: 'follow',
  label: 'Baby follow',
  states: ['follow'],
  defaults: { enabled: true, params: {} },
  opportunities: [{
    id: 'follow.seek',
    order: 90,
    canRun: (ctx) => {
      const { actor, p } = ctx;
      if (!actor || actor.stage !== 'baby') return false;
      const parent = ctx.api.followTargetFor ? ctx.api.followTargetFor(actor)
        : ctx.api.parentFor(actor);
      if (!parent || parent.inPond || parent.grabs > 0) return false;
      const far = Math.hypot(parent.cx - actor.cx, parent.cz - actor.cz) > p.mate.followDist;
      if (far) ctx.api.coverSlot('follow');
      return far;
    },
    enter: (ctx) => {
      const parent = ctx.api.followTargetFor ? ctx.api.followTargetFor(ctx.actor)
        : ctx.api.parentFor(ctx.actor);
      return parent ? startFollow(ctx, parent) : false;
    },
  }],
  parentTarget,
  startFollow,
  think(ctx) {
    if (!ctx.ai || ctx.ai.state !== 'follow') return false;
    thinkFollow(ctx);
    return true;
  },
  isTraveling(ctx) {
    const { ai, actor, p } = ctx;
    if (!ai || ai.state !== 'follow') return false;
    const parent = ai.follow;
    if (!parent || parent.inside || parent.sleeping) return false;
    const target = parentTarget(ctx, parent);
    if (!target) return false;
    return Math.hypot(target.x - actor.cx, target.z - actor.cz) > p.mate.followDist + .2;
  },
});
