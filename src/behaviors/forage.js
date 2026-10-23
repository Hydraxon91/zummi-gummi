// Forage behavior: seekFood and eat.
//
// The acquisition order, claim/release path and post-eat cooldown expression
// are the legacy ones. `forageEatScale` keeps the skill effect.

import { forageEatScale } from '../family.js';
import { defineBehaviorModule } from './module.js';

function acquire(ctx) {
  const { actor, ai, p, api } = ctx;
  const food = api.food();
  if (!food || !actor || !ai) return null;
  const exclude = new Set();
  for (let tries = 0; tries < 5; tries++) {
    const source = food.nearestRipe(actor.cx, actor.cz, {
      maxDistance: p.food.searchRadius, bear: actor, exclude, safe: true,
    });
    if (!source) break;
    exclude.add(source.id);
    if (source.id === ai.avoidSourceId && ai.avoidSourceT > 0) continue;
    if (!food.claim(source, actor)) continue;
    const path = api.pathTo(actor, source.approachX, source.approachZ);
    if (!path && Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz) > 1.25) {
      food.release(source, actor);
      continue;
    }
    ai.source = source;
    ai.state = 'seekFood';
    ai.target = { x: source.approachX, z: source.approachZ };
    api.setPath(actor, path || [{ x: source.approachX, z: source.approachZ }]);
    api.face(actor, source.approachX, source.approachZ);
    return source;
  }
  return null;
}

function startEat(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai || !ai.source) return;
  ai.state = 'eat';
  ai.eatT = p.food.eatTime * forageEatScale(actor);
  ai.animT = 0;
  ai.moving = false;
  ai.path = null;
  api.face(actor, ai.source.x, ai.source.z);
}

function finish(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return;
  if (!ai.source) {
    ai.state = 'wander';
    ai.idleT = .5;
    api.clearPath(actor);
    return;
  }
  const source = ai.source;
  const food = api.food();
  if (food && food.consume(source, actor)) {
    actor.hunger = Math.max(0, actor.hunger - source.satiation * forageEatScale(actor));
    api.starsRescue?.(actor, 'food');
  }
  ai.source = null;
  ai.target = null;
  ai.faceYaw = null;
  ai.state = 'wander';
  ai.idleT = .8;
  ai.taskCooldown = p.food.eatTime > 1.2 ? 1.3 : 1.2;
  api.clearPath(actor);
}

function think(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return;
  if (actor.hunger <= p.thresholds.stopHunger) {
    api.releaseFood(actor);
    ai.state = 'wander';
    ai.idleT = .4;
    api.stop(actor);
    return;
  }
  let source = ai.source;
  if (!source || !source.ripe || (source.claim && source.claim !== actor)) {
    api.releaseFood(actor);
    source = acquire(ctx);
  }
  if (!source) {
    if (api.adapterHungerOpportunity(actor, true)) return;
    ai.state = 'wander';
    ai.idleT = .7;
    api.stop(actor);
    return;
  }
  const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
  if (d <= p.food.eatDist) { startEat(ctx); return; }
  if (api.needsReplan(ai)) {
    if (!api.setDestination(actor, source.approachX, source.approachZ)) {
      const food = api.food();
      if (food) food.release(source, actor);
      ai.source = null;
      ai.state = 'wander';
      ai.idleT = .7;
    }
  }
}

function resume(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return false;
  if (ai.state === 'eat') {
    const source = ai.source;
    const food = source && source.ripe ? api.food() : null;
    if (food && food.claim(source, actor)) {
      ai.target = { x: source.approachX, z: source.approachZ };
      const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
      if (d <= p.food.eatDist) {
        ai.eatT = p.food.eatTime * forageEatScale(actor);
        ai.animT = 0;
        ai.moving = false;
        api.face(actor, source.x, source.z);
      } else {
        ai.state = 'seekFood';
        api.setDestination(actor, source.approachX, source.approachZ);
      }
    } else {
      ai.source = null;
      ai.state = 'seekFood';
      ai.nextThink = 0;
    }
    return true;
  }
  if (ai.state === 'seekFood') {
    const source = ai.source;
    const food = source && source.ripe ? api.food() : null;
    if (food && food.claim(source, actor)) {
      ai.target = { x: source.approachX, z: source.approachZ };
      api.setDestination(actor, source.approachX, source.approachZ);
    } else {
      ai.source = null;
      ai.nextThink = 0;
    }
    return true;
  }
  return false;
}

export const forageModule = defineBehaviorModule({
  id: 'forage',
  label: 'Forage and eat',
  states: ['seekFood', 'eat'],
  defaults: { enabled: true, params: {} },
  opportunities: [{
    id: 'forage.seek',
    order: 50,
    canRun: (ctx) => !!ctx.actor && ctx.actor.hunger >= ctx.p.thresholds.seekHunger,
    enter: (ctx) => !!acquire(ctx),
  }, {
    id: 'forage.critical',
    order: 11,
    canRun: (ctx) => !!ctx.ai && !!ctx.ai.moving &&
      ctx.actor.hunger >= ctx.p.thresholds.criticalHunger,
    enter: (ctx) => !!acquire(ctx),
  }],
  acquire,
  startEat,
  think,
  tick(ctx) {
    const { ai, dt } = ctx;
    if (!ai || ai.state !== 'eat') return false;
    ai.animT += dt;
    ai.eatT -= dt;
    if (ai.eatT <= 0) finish(ctx);
  },
  resume,
  isTraveling: (ctx) => !!(ctx.ai && ctx.ai.state === 'seekFood'),
  interrupt(ctx, reason) {
    const { actor, ai, api } = ctx;
    if (!ai || (ai.state !== 'seekFood' && ai.state !== 'eat')) return;
    api.releaseFood(actor);
    ai.source = null;
    ai.target = null;
    ai.state = 'wander';
    ai.idleT = reason === 'grab' ? .4 : .7;
  },
});
