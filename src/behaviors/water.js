// Water behavior: seekWater and drink.
//
// The pond/water-spot choice, ripple cadence and Glass drink relief are the
// legacy values (the Glass branch is preserved, not cleaned up in this pass).

import { defineBehaviorModule } from './module.js';

function acquire(ctx) {
  const { actor, ai, api, field } = ctx;
  if (!field || !Array.isArray(field.waterSpots) || !field.waterSpots.length || !ai) return null;
  let best = null;
  let bestD = Infinity;
  for (const spot of field.waterSpots) {
    const d = Math.hypot(spot.x - actor.cx, spot.z - actor.cz);
    if (d < bestD) { bestD = d; best = spot; }
  }
  if (!best) return null;
  const path = api.pathTo(actor, best.x, best.z);
  ai.waterSpot = best;
  ai.state = 'seekWater';
  ai.target = { x: best.x, z: best.z };
  api.setPath(actor, path || [{ x: best.x, z: best.z }]);
  api.face(actor, best.x, best.z);
  return best;
}

function startDrink(ctx) {
  const { actor, ai, p, api, field } = ctx;
  if (!actor || !ai || !ai.waterSpot) return;
  const spot = ai.waterSpot;
  ai.state = 'drink';
  ai.drinkT = p.food.drinkTime;
  ai.animT = 0;
  ai.rippleT = 0;
  ai.moving = false;
  ai.path = null;
  api.face(actor, spot.waterX, spot.waterZ);
  if (field && field.splash) field.splash(spot.waterX, spot.waterZ, .45);
}

function finish(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return;
  actor.thirst = Math.max(0, actor.thirst - (p.id === 'glass' ? .52 : .55));
  ai.waterSpot = null;
  ai.target = null;
  ai.faceYaw = null;
  ai.state = 'wander';
  ai.idleT = .8;
  ai.taskCooldown = 1.0;
  api.clearPath(actor);
}

function think(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return;
  if (actor.thirst <= p.thresholds.stopThirst) {
    ai.waterSpot = null;
    ai.state = 'wander';
    ai.idleT = .4;
    api.stop(actor);
    return;
  }
  if (!ai.waterSpot && !acquire(ctx)) {
    ai.state = 'wander';
    ai.idleT = .8;
    return;
  }
  const spot = ai.waterSpot;
  if (!spot) return;
  const d = Math.hypot(spot.x - actor.cx, spot.z - actor.cz);
  if (d <= p.food.drinkDist) { startDrink(ctx); return; }
  if (api.needsReplan(ai)) {
    if (!api.setDestination(actor, spot.x, spot.z)) {
      ai.waterSpot = null;
      ai.state = 'wander';
      ai.idleT = .8;
    }
  }
}

function resume(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return false;
  if (ai.state === 'drink') {
    const spot = ai.waterSpot;
    const d = spot ? Math.hypot(spot.x - actor.cx, spot.z - actor.cz) : Infinity;
    if (spot && d <= p.food.drinkDist) {
      ai.drinkT = Math.max(.7, ai.drinkT);
      ai.animT = 0;
      ai.moving = false;
      api.face(actor, spot.waterX, spot.waterZ);
    } else {
      ai.state = 'seekWater';
      ai.moving = false;
    }
    return true;
  }
  if (ai.state === 'seekWater') {
    const spot = ai.waterSpot;
    if (spot) api.setDestination(actor, spot.x, spot.z);
    return true;
  }
  return false;
}

export const waterModule = defineBehaviorModule({
  id: 'water',
  label: 'Water and drink',
  states: ['seekWater', 'drink'],
  defaults: { enabled: true, params: {} },
  opportunities: [{
    id: 'water.seek',
    order: 20,
    canRun: (ctx) => !!ctx.actor && ctx.actor.thirst >= ctx.p.thresholds.seekThirst,
    enter: (ctx) => !!acquire(ctx),
  }],
  acquire,
  startDrink,
  think,
  tick(ctx) {
    const { ai, dt, field } = ctx;
    if (!ai || ai.state !== 'drink') return false;
    ai.animT += dt;
    ai.drinkT -= dt;
    ai.rippleT = (ai.rippleT || 0) - dt;
    if (ai.rippleT <= 0 && ai.waterSpot && field.splash) {
      field.splash(ai.waterSpot.waterX, ai.waterSpot.waterZ, .30);
      ai.rippleT = .55;
    }
    if (ai.drinkT <= 0) finish(ctx);
  },
  resume,
  isTraveling: (ctx) => !!(ctx.ai && ctx.ai.state === 'seekWater'),
  interrupt(ctx, reason) {
    const { actor, ai, api } = ctx;
    if (!ai || (ai.state !== 'seekWater' && ai.state !== 'drink')) return;
    ai.waterSpot = null;
    ai.target = null;
    ai.state = 'wander';
    ai.idleT = reason === 'grab' ? .4 : .7;
    api.stop(actor);
  },
});
