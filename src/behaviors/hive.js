// Hive raid behavior (first module port).
//
// Owns seekHive/raidHive. The numbers and the short-circuit order are the
// legacy Bear values; Glass disables the module through the profile capability
// (`hive: null` today, an `enabled` flag at step 5).

import { courageHiveBonus } from '../family.js';
import { defineBehaviorModule } from './module.js';

export const HIVE_DEFAULTS = Object.freeze({
  hunger: .95, health: 45, hardFloor: 25, damage: 15,
  stingChance: .5, dist: 1.25, raidTime: 1.25, fleeTime: 1.4,
});

function threshold(actor, hive) {
  const bold = Number.isFinite(actor.bold) ? actor.bold : .5;
  const desperation = (Number.isFinite(actor.hunger) ? actor.hunger : 0) >= .92 ? 5 : 0;
  return Math.max(hive.hardFloor,
    hive.health + (.5 - bold) * 30 - desperation - courageHiveBonus(actor));
}

function canRaid(ctx) {
  const hive = ctx.p.hive;
  if (!hive || !ctx.actor) return false;
  if (ctx.actor.sleeping) return false;
  const health = Number.isFinite(ctx.actor.health) ? ctx.actor.health : 100;
  const hunger = Number.isFinite(ctx.actor.hunger) ? ctx.actor.hunger : 0;
  return health > threshold(ctx.actor, hive) && hunger >= hive.hunger;
}

function acquire(ctx) {
  const { actor, ai, api, field } = ctx;
  const hive = ctx.p.hive;
  if (!hive || !field || !field.food || !ai || !canRaid(ctx)) return null;
  const exclude = new Set();
  for (let tries = 0; tries < 3; tries++) {
    const source = field.food.nearestRipe(actor.cx, actor.cz, {
      maxDistance: 52, bear: actor, exclude, kinds: ['hive'],
    });
    if (!source) break;
    exclude.add(source.id);
    if (source.id === ai.avoidSourceId && ai.avoidSourceT > 0) continue;
    if (!field.food.claim(source, actor)) continue;
    const path = api.pathTo(actor, source.approachX, source.approachZ);
    if (!path && Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz) > 1.25) {
      field.food.release(source, actor);
      continue;
    }
    ai.source = source;
    ai.state = 'seekHive';
    ai.target = { x: source.approachX, z: source.approachZ };
    api.setPath(actor, path || [{ x: source.approachX, z: source.approachZ }]);
    api.face(actor, source.approachX, source.approachZ);
    return source;
  }
  return null;
}

function startRaid(ctx) {
  const { actor, ai, api } = ctx;
  const hive = ctx.p.hive;
  if (!hive || !ai || !ai.source) return;
  ai.state = 'raidHive';
  ai.raidT = hive.raidTime;
  ai.moving = false;
  ai.path = null;
  api.face(actor, ai.source.x, ai.source.z);
}

function finish(ctx) {
  const { actor, ai, api, field, rng } = ctx;
  const hive = ctx.p.hive;
  if (!hive || !ai) return;
  const source = ai.source;
  if (!source) {
    ai.state = 'wander';
    ai.idleT = .5;
    return;
  }
  if (rng() < hive.stingChance) {
    actor.health = Math.max(1, actor.health - hive.damage);
    ai.stungT = 2.0;
    api.releaseFood(actor);
    if (field && field.sting) field.sting(source.x, source.z, source.y);
    api.startFlee(actor, source);
    return;
  }
  if (field.food.consume(source, actor)) {
    actor.hunger = Math.max(0, actor.hunger - source.satiation);
  }
  ai.source = null;
  ai.target = null;
  ai.faceYaw = null;
  ai.state = 'wander';
  ai.idleT = .9;
  ai.taskCooldown = 1.3;
  api.stop(actor);
}

export const hiveModule = defineBehaviorModule({
  id: 'hive',
  label: 'Hive raid',
  states: ['seekHive', 'raidHive'],
  activeStates: ['raidHive'],
  defaults: { enabled: true, params: HIVE_DEFAULTS },
  opportunities: [{
    id: 'hive.seek',
    order: 40,
    // Same short-circuit as legacy thinkWander: the cheap hunger check runs
    // first and acquire() re-checks health/sleep/claims.
    canRun: (ctx) => !!ctx.p.hive && !!ctx.actor && ctx.actor.hunger >= ctx.p.hive.hunger,
    enter: acquire,
  }],
  acquire,
  threshold: (ctx) => (ctx.p.hive ? threshold(ctx.actor, ctx.p.hive) : Infinity),
  think(ctx) {
    const { actor, ai, api } = ctx;
    const hive = ctx.p.hive;
    if (!hive || !ai) return;
    const source = ai.source;
    if (!source || !source.ripe || (source.claim && source.claim !== actor) || !canRaid(ctx)) {
      api.releaseFood(actor);
      ai.state = 'seekFood';
      ai.nextThink = 0;
      api.stop(actor);
      return;
    }
    const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
    if (d <= hive.dist) { startRaid(ctx); return; }
    if (api.needsReplan(ai)) {
      if (!api.setDestination(actor, source.approachX, source.approachZ)) {
        api.releaseFood(actor);
        ai.state = 'seekFood';
        ai.idleT = .7;
      }
    }
  },
  tick(ctx) {
    const { ai, dt } = ctx;
    if (!ai || ai.state !== 'raidHive') return false;
    ai.animT += dt;
    ai.raidT -= dt;
    if (ai.raidT <= 0) finish(ctx);
  },
  isTraveling(ctx) {
    return !!(ctx.ai && ctx.ai.state === 'seekHive');
  },
  interrupt(ctx, reason) {
    const { ai, api } = ctx;
    if (!ai) return;
    if (ai.state !== 'seekHive' && ai.state !== 'raidHive') return;
    api.releaseFood(ctx.actor);
    ai.source = null;
    ai.target = null;
    ai.raidT = 0;
    ai.state = 'wander';
    ai.idleT = reason === 'grab' ? .4 : .6;
  },
  debugEnter(ctx) {
    const source = acquire(ctx);
    return {
      ok: !!source,
      state: ctx.ai.state,
      note: source ? 'looking for a hive' : 'no hive target',
    };
  },
});
