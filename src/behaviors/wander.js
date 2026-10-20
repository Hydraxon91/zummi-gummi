// Wander behavior and the opportunity pipeline.
//
// Owns `wander`: the ordered decision cascade, arrival idling and target
// selection. Opportunity orders 10-140 stay in their existing positions; other
// modules own the entries this module invokes (water/forage/hive/social/mate).

import { defineBehaviorModule } from './module.js';

function wanderCandidate(ctx, minR, maxR, maxShift, requireDistance) {
  const { actor, p, api, field, rng } = ctx;
  if (!field || !field.nav) return null;
  for (let i = 0; i < 12; i++) {
    const angle = rng() * Math.PI * 2;
    const r = minR + rng() * (maxR - minR);
    const x = actor.cx + Math.cos(angle) * r;
    const z = actor.cz + Math.sin(angle) * r;
    const near = field.nav.nearestWalkable(x, z);
    if (!near) continue;
    if (Math.hypot(near.x - x, near.z - z) > maxShift) continue;
    if (field.pond && field.pond.contains && field.pond.contains(near.x, near.z)) continue;
    if (Math.hypot(near.x - actor.cx, near.z - actor.cz) < requireDistance) continue;
    const path = api.pathTo(actor, near.x, near.z);
    if (!path) continue;
    return { x: near.x, z: near.z, path };
  }
  return null;
}

function pickWanderTarget(ctx) {
  const { actor, ai, p, api, field, rng } = ctx;
  if (!field || !field.nav) return null;
  const w = p.wander;
  let target = null;
  if (w.longChance > 0 && rng() < w.longChance) {
    target = wanderCandidate(ctx, w.longMin, w.longMax, w.longShift, w.longMin * w.longSnapFloor);
  }
  if (!target) target = wanderCandidate(ctx, w.min, w.max, w.shortShift, 0);
  if (!target) return null;
  ai.target = { x: target.x, z: target.z };
  api.face(actor, target.x, target.z);
  api.setPath(actor, target.path);
  return ai.target;
}

function think(ctx) {
  const { actor, ai, p, api, rng } = ctx;
  if (!actor || !ai || ai.state !== 'wander') return false;
  if (ai.moving) {
    if (api.runOpportunity(actor, 'water.critical')) return true;
    if (api.runOpportunity(actor, 'forage.critical')) return true;
    if (ai.target && Math.hypot(ai.target.x - actor.cx, ai.target.z - actor.cz) < .58) {
      ai.moving = false;
      ai.target = null;
      ai.faceYaw = null;
      ai.idleT = .9 + rng() * 1.9;
    }
    return true;
  }
  if (ai.taskCooldown > 0) return true;
  if (api.runOpportunity(actor, 'water.seek')) return true;
  const meal = api.mealWindow(actor);
  if (meal && api.startFamilyMeal(actor, meal)) return true;
  if (api.runOpportunity(actor, 'hive.seek')) return true;
  if (p.conflict && actor.hunger >= p.thresholds.criticalHunger && api.acquireContest(actor)) return true;
  if (actor.hunger >= p.thresholds.seekHunger) {
    if (api.runOpportunity(actor, 'forage.seek')) return true;
    if (p.conflict && api.acquireContest(actor)) return true;
  }
  const lesson = api.lessonCandidate(actor);
  if (lesson && api.startLesson(actor, lesson.student)) return true;
  const due = api.findDuePlaydate(actor);
  if (due && api.startPlaydate(actor, due.other, 'friend')) return true;
  if (api.runOpportunity(actor, 'mate.seek')) return true;
  if (actor.stage === 'baby') {
    const parent = api.parentFor(actor);
    if (parent && !parent.inPond && parent.grabs === 0 &&
        Math.hypot(parent.cx - actor.cx, parent.cz - actor.cz) > p.mate.followDist) {
      if (api.startFollow(actor, parent)) return true;
    }
  }
  const family = api.acquireFamilyPlaymate(actor);
  if (family && api.startPlaydate(actor, family.actor, family.kind)) return true;
  if (api.runOpportunity(actor, 'social.company')) return true;
  // TEMPORARY(port): stargaze
  let stargazeWindow = !api.isDayFor(actor);
  if (api.feature('glassNightWindow')) {
    const nightStart = Number.isFinite(p.rest.nightStart) ? p.rest.nightStart : 18;
    const nightEnd = Number.isFinite(p.rest.nightEnd) ? p.rest.nightEnd : 6;
    const h = api.hoursNow();
    stargazeWindow = h >= nightStart || h < nightEnd;
  }
  if (p.stargaze && stargazeWindow && rng() < p.stargaze.chance) {
    ai.state = 'stargaze';
    ai.idleT = p.stargaze.min + rng() * (p.stargaze.max - p.stargaze.min);
    api.stop(actor);
    return true;
  }
  if (api.runOpportunity(actor, 'wander.arrive')) return true;
  if (ai.idleT > 0) return true;
  api.runOpportunity(actor, 'wander.target');
  return true;
}

export const wanderModule = defineBehaviorModule({
  id: 'wander',
  label: 'Wander and the decision pipeline',
  states: ['wander'],
  defaults: { enabled: true, params: {} },
  opportunities: [
    {
      id: 'wander.arrive',
      order: 130,
      canRun: (ctx) => !!ctx.ai && !!ctx.ai.arrived,
      enter: (ctx) => {
        ctx.ai.arrived = false;
        ctx.ai.idleT = .9 + ctx.rng() * 1.9;
        return true;
      },
    },
    {
      id: 'wander.target',
      order: 140,
      canRun: (ctx) => !!ctx.actor && !!ctx.ai,
      enter: (ctx) => {
        if (!pickWanderTarget(ctx)) ctx.ai.idleT = .7;
        return true;
      },
    },
  ],
  think,
  pickWanderTarget,
  debugEnter(ctx) {
    ctx.ai.state = 'wander';
    ctx.ai.idleT = 0;
    return { ok: true, state: 'wander', note: 'wandering' };
  },
});
