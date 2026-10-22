// Wander behavior and the opportunity pipeline.
//
// Owns `wander`: the ordered decision cascade, arrival idling and target
// selection. Opportunity orders 10-140 stay in their existing positions; other
// modules own the entries this module invokes (water/forage/hive/social/mate).
// The optional `wander.activity` slot (order 115) only exists while the
// `activityChooser` feature is on; with it off the cascade calls the social and
// stargazing slots in their authored order exactly as before.

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
  const { actor, ai, p, api, rng, features } = ctx;
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
  if (meal && api.startFamilyMeal(actor, meal)) { api.coverSlot('meal'); return true; }
  if (api.runOpportunity(actor, 'hive.seek')) return true;
  if (api.runOpportunity(actor, 'conflict.critical')) return true;
  if (actor.hunger >= p.thresholds.seekHunger) {
    if (api.runOpportunity(actor, 'forage.seek')) return true;
    if (api.runOpportunity(actor, 'conflict.fallback')) return true;
  }
  const lesson = api.lessonCandidate(actor);
  if (lesson && api.startLesson(actor, lesson.student)) { api.coverSlot('lesson'); return true; }
  const due = api.findDuePlaydate(actor);
  if (due && api.startPlaydate(actor, due.other, 'friend')) { api.coverSlot('playdate'); return true; }
  if (api.runOpportunity(actor, 'mate.seek')) return true;
  if (api.runOpportunity(actor, 'follow.seek')) return true;
  const family = api.acquireFamilyPlaymate(actor);
  if (family && api.startPlaydate(actor, family.actor, family.kind)) { api.coverSlot('familyPlaymate'); return true; }
  if (api.runOpportunity(actor, 'relationship.reconcile')) return true;
  if (api.runOpportunity(actor, 'relationship.partner')) return true;
  if (api.runOpportunity(actor, 'affection.cuddle')) return true;
  if (api.runOpportunity(actor, 'affection.chat')) return true;
  if (api.runOpportunity(actor, 'group.seek')) return true;
  if (api.runOpportunity(actor, 'gifting.offer')) return true;
  if (features && features.activityChooser) {
    if (api.runOpportunity(actor, 'wander.activity')) return true;
  } else {
    if (api.runOpportunity(actor, 'social.company')) return true;
    if (api.runOpportunity(actor, 'stargaze.seek')) return true;
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
      id: 'wander.activity',
      order: 115,
      canRun: (ctx) => !!ctx.actor && !!ctx.ai && !!ctx.features && !!ctx.features.activityChooser,
      enter: (ctx) => !!ctx.api.chooseActivity(ctx.actor),
    },
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
