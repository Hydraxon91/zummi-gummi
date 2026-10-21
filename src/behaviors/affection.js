// Richer pair activities: chat and cuddle.
//
// Both reuse the shared pair protocol. Chat is open to every stage and species;
// cuddle requires a reciprocal bond of at least 0.35. The initiator owns the
// timer so completion effects happen exactly once, even though both actors tick.

import {
  addBond, bondOf, pairBond, pushHistory,
} from '../family.js';
import { actorAvailable, beginPair, endPair } from '../interactions.js';
import { defineBehaviorModule } from './module.js';

const CHAT_STATES = ['seekChat', 'chat'];
const CUDDLE_STATES = ['seekCuddle', 'cuddle'];
const ACTIVITY_STATES = [...CHAT_STATES, ...CUDDLE_STATES];

function activityParams(ctx, kind) {
  return (ctx.p.behaviorModules?.pairActivities?.params || {})[kind] || {};
}

function candidateFor(ctx, kind, forced = null) {
  const { actor, api } = ctx;
  const params = activityParams(ctx, kind);
  const minBond = kind === 'cuddle' ? params.bondMin : 0;
  const list = (forced ? [forced] : api.actors())
    .filter(other => other !== actor && other.active && actorAvailable(other) &&
      !other.fading && other.ai.state === 'wander' && !other.ai.partner &&
      !other.ai.familyTask && other.health >= params.health &&
      (other.ai[kind === 'cuddle' ? 'cuddleCooldown' : 'chatCooldown'] || 0) <= 0 &&
      (minBond <= 0 ||
        (bondOf(actor, other) >= minBond && bondOf(other, actor) >= minBond)))
    .map(other => ({
      other,
      d: Math.hypot(other.cx - actor.cx, other.cz - actor.cz),
    }))
    .filter(entry => entry.d <= params.radius)
    .sort((a, b) => pairBond(actor, b.other) - pairBond(actor, a.other) ||
      a.d - b.d || a.other.uid - b.other.uid);
  return list.length ? list[0].other : null;
}

function cancelActivity(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai) return false;
  const partner = ai.partner;
  if (partner && partner.ai) {
    partner.ai.activityRole = null;
    partner.ai.activityT = 0;
  }
  ai.activityRole = null;
  ai.activityT = 0;
  ai.chatT = 0;
  ai.cuddleT = 0;
  if (partner) endPair(actor, { stop: api.stop, next: 'wander', idleT: .5, taskCooldown: .8 });
  else {
    ai.state = 'wander';
    ai.idleT = .4;
    api.stop(actor);
  }
  return false;
}

function beginActivity(ctx, kind, forced = null) {
  const { actor, ai, api, features } = ctx;
  if (!features?.pairActivities || !actor || !ai) return false;
  const params = activityParams(ctx, kind);
  if ((ai[kind === 'cuddle' ? 'cuddleCooldown' : 'chatCooldown'] || 0) > 0) return false;
  if (ai.partner || ai.familyTask) return false;
  const partner = candidateFor(ctx, kind, forced);
  if (!partner) return false;
  const state = kind === 'cuddle' ? 'seekCuddle' : 'seekChat';
  if (!beginPair(actor, partner, state, { stop: api.stop, face: api.face })) return false;
  ai.activityRole = 'initiator';
  ai.activityT = params.approachTimeout;
  partner.ai.activityRole = 'receiver';
  partner.ai.activityT = params.approachTimeout;
  ai.target = { x: partner.cx, z: partner.cz };
  partner.ai.target = { x: actor.cx, z: actor.cz };
  if (!api.setDestination(actor, partner.cx, partner.cz)) {
    cancelActivity(ctx);
    return false;
  }
  api.face(actor, partner.cx, partner.cz);
  api.face(partner, actor.cx, actor.cz);
  api.emit(actor, kind === 'cuddle' ? 'heart' : 'question', 1.0);
  return true;
}

function finishActivity(ctx, kind) {
  const { actor, ai, api, features } = ctx;
  const partner = ai.partner;
  if (!partner || !partner.ai || !partner.active || partner.ai.partner !== actor) {
    cancelActivity(ctx);
    return false;
  }
  const p = api.profile(actor);
  const partnerP = api.profile(partner);
  const beforeActor = bondOf(actor, partner);
  const beforePartner = bondOf(partner, actor);
  for (const [member, profile] of [[actor, p], [partner, partnerP]]) {
    member.social = Math.max(0, member.social - profile.social.relief);
    member.affection = Math.max(0, member.affection - profile.social.affectionRelief);
  }
  const params = activityParams(ctx, kind);
  addBond(actor, partner, params.bond);
  const cooldown = params.cooldown;
  ai[kind === 'cuddle' ? 'cuddleCooldown' : 'chatCooldown'] = cooldown;
  partner.ai[kind === 'cuddle' ? 'cuddleCooldown' : 'chatCooldown'] = cooldown;
  ai.activityRole = null;
  partner.ai.activityRole = null;
  ai.activityT = 0;
  partner.ai.activityT = 0;
  ai.chatT = 0;
  ai.cuddleT = 0;
  partner.ai.chatT = 0;
  partner.ai.cuddleT = 0;
  if (features.interactionHistory) {
    const day = api.dayNow();
    const hour = api.hoursNow();
    pushHistory(actor, {
      kind, uid: partner.uid, day, hour,
      bondBefore: beforeActor, bondAfter: bondOf(actor, partner),
    });
    pushHistory(partner, {
      kind, uid: actor.uid, day, hour,
      bondBefore: beforePartner, bondAfter: bondOf(partner, actor),
    });
  }
  api.emit(partner, kind === 'cuddle' ? 'heart' : 'chat', 1.0);
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .55, taskCooldown: 1.0 });
  return true;
}

function thinkActivity(ctx, kind) {
  const { actor, ai, api } = ctx;
  const params = activityParams(ctx, kind);
  if (!actor || !ai) return;
  const partner = ai.partner;
  if (!partner || !partner.ai || !partner.active || partner.ai.partner !== actor) {
    cancelActivity(ctx);
    return;
  }
  if (ai.activityRole === 'receiver') {
    api.face(actor, partner.cx, partner.cz);
    return;
  }
  const d = Math.hypot(partner.cx - actor.cx, partner.cz - actor.cz);
  if (d <= params.arriveDist) {
    ai.state = kind === 'cuddle' ? 'cuddle' : 'chat';
    partner.ai.state = ai.state;
    ai.activityT = params.duration;
    partner.ai.activityT = params.duration;
    ai.moving = false;
    ai.path = null;
    partner.ai.moving = false;
    partner.ai.path = null;
    api.face(actor, partner.cx, partner.cz);
    api.face(partner, actor.cx, actor.cz);
    return;
  }
  if (api.needsReplan(ai) && !api.setDestination(actor, partner.cx, partner.cz)) {
    cancelActivity(ctx);
  }
}

function tickActivity(ctx, kind) {
  const { ai, dt } = ctx;
  const states = kind === 'cuddle' ? CUDDLE_STATES : CHAT_STATES;
  const seekState = kind === 'cuddle' ? 'seekCuddle' : 'seekChat';
  if (!ai || !states.includes(ai.state)) return false;
  if (ai.activityRole === 'receiver') return true;
  ai.activityT -= dt;
  if (ai.state === seekState) {
    if (ai.activityT <= 0) {
      cancelActivity(ctx);
      return true;
    }
    thinkActivity(ctx, kind);
    return true;
  }
  if (ai.activityT <= 0) finishActivity(ctx, kind);
  return true;
}

export const pairActivitiesModule = defineBehaviorModule({
  cancel: cancelActivity,
  id: 'pairActivities',
  label: 'Chat and cuddle',
  states: ACTIVITY_STATES,
  activeStates: ['chat', 'cuddle'],
  defaults: {
    enabled: true,
    params: {
      chat: {
        radius: 9, arriveDist: 1.2, duration: 4, approachTimeout: 15,
        bond: .02, cooldown: 30, health: 15,
      },
      cuddle: {
        radius: 7, arriveDist: 1.1, duration: 5, approachTimeout: 15,
        bond: .04, cooldown: 60, health: 15, bondMin: .35,
      },
    },
  },
  opportunities: [{
    id: 'affection.cuddle',
    order: 111,
    canRun: (ctx) => !!ctx.features?.pairActivities && !!ctx.actor &&
      (ctx.actor.ai.cuddleCooldown || 0) <= 0,
    enter: (ctx) => !!beginActivity(ctx, 'cuddle'),
  }, {
    id: 'affection.chat',
    order: 112,
    canRun: (ctx) => !!ctx.features?.pairActivities && !!ctx.actor &&
      (ctx.actor.ai.chatCooldown || 0) <= 0,
    enter: (ctx) => !!beginActivity(ctx, 'chat'),
  }],
  beginChat: (ctx, forced) => beginActivity(ctx, 'chat', forced),
  beginCuddle: (ctx, forced) => beginActivity(ctx, 'cuddle', forced),
  finishActivity,
  think(ctx) {
    if (!ctx.ai) return false;
    if (CHAT_STATES.includes(ctx.ai.state)) {
      thinkActivity(ctx, 'chat');
      return true;
    }
    if (CUDDLE_STATES.includes(ctx.ai.state)) {
      thinkActivity(ctx, 'cuddle');
      return true;
    }
    return false;
  },
  tick(ctx) {
    if (CHAT_STATES.includes(ctx.ai?.state)) return tickActivity(ctx, 'chat');
    if (CUDDLE_STATES.includes(ctx.ai?.state)) return tickActivity(ctx, 'cuddle');
    return false;
  },
  isTraveling: (ctx) => !!(ctx.ai &&
    (ctx.ai.state === 'seekChat' || ctx.ai.state === 'seekCuddle') &&
    ctx.ai.activityRole === 'initiator'),
  interrupt(ctx) {
    if (ctx.ai && ACTIVITY_STATES.includes(ctx.ai.state)) cancelActivity(ctx);
  },
});
