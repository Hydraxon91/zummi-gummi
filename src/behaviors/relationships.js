// Persistent relationship behavior: rivalry reconciliation and partnership.
//
// Rivalry itself is recorded by the conflict module. This module owns the two
// voluntary repair/commitment interactions that use those records. Both reuse
// the shared pair protocol and the initiator owns completion effects.

import { canSpeciesBreed } from '../dna.js';
import {
  addBond, bondOf, familyRelation, pairBond, pushHistory,
} from '../family.js';
import { beginPair, endPair, pairAvailable } from '../interactions.js';
import {
  PARTNERSHIP_BOND, RECONCILE_BOND_GAIN, clearRival, hasPartnership,
  hasRival, partnershipBondReady, setPartnership,
} from '../relationships.js';
import { defineBehaviorModule } from './module.js';

const RECONCILE_STATES = ['seekReconcile', 'reconcile'];
const PARTNER_STATES = ['seekPartner', 'partnering'];
const RELATION_STATES = [...RECONCILE_STATES, ...PARTNER_STATES];

function params(ctx, kind) {
  return (ctx.p.behaviorModules?.relationships?.params || {})[kind] || {};
}

function distance(a, b) {
  return Math.hypot(a.cx - b.cx, a.cz - b.cz);
}

function availablePair(actor, other, health) {
  return pairAvailable(actor, other, { states: ['wander'], health });
}

function cancellation(ctx, kind) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai) return false;
  const partner = ai.partner;
  const p = params(ctx, kind);
  if (partner && partner.ai) {
    partner.ai.activityRole = null;
    partner.ai.activityT = 0;
    if (kind === 'reconcile') {
      partner.ai.reconcileCooldown = Math.max(partner.ai.reconcileCooldown || 0, p.failedCooldown || 30);
    }
  }
  if (kind === 'reconcile') {
    ai.reconcileCooldown = Math.max(ai.reconcileCooldown || 0, p.failedCooldown || 30);
  }
  ai.activityRole = null;
  ai.activityT = 0;
  if (partner) endPair(actor, { stop: api.stop, next: 'wander', idleT: .55, taskCooldown: .8 });
  else {
    ai.state = 'wander';
    ai.idleT = .45;
    api.stop(actor);
  }
  return false;
}

function rivalCandidate(ctx) {
  const { actor, api } = ctx;
  const p = params(ctx, 'reconcile');
  if ((actor.ai.reconcileCooldown || 0) > 0) return null;
  const candidates = [];
  for (const other of api.actors()) {
    if (!other || other === actor || !hasRival(actor, other) || !hasRival(other, actor)) continue;
    if (!availablePair(actor, other, p.health)) continue;
    if ((other.ai.reconcileCooldown || 0) > 0) continue;
    const d = distance(actor, other);
    if (d > p.radius) continue;
    candidates.push({ other, d });
  }
  candidates.sort((a, b) => pairBond(actor, b.other) - pairBond(actor, a.other) ||
    a.d - b.d || a.other.uid - b.other.uid);
  return candidates.length ? candidates[0].other : null;
}

function partnerPairReady(actor, other) {
  if (!actor || !other || actor === other) return false;
  if (actor.stage !== 'adult' || other.stage !== 'adult') return false;
  if (hasPartnership(actor) || hasPartnership(other)) return false;
  if (actor.sex === other.sex) return false;
  if (!partnershipBondReady(actor, other)) return false;
  if (!canSpeciesBreed(actor.species, other.species, { current: true }).ok) return false;
  if (['sibling', 'parent', 'child', 'grandparent'].includes(familyRelation(actor, other))) return false;
  return true;
}

function partnerCandidate(ctx) {
  const { actor, api } = ctx;
  const p = params(ctx, 'partner');
  if (actor.stage !== 'adult' || hasPartnership(actor)) return null;
  if (stateBusy(actor)) return null;
  const candidates = [];
  for (const other of api.actors()) {
    if (!other || other === actor) continue;
    if (hasPartnership(other)) continue;
    if (!availablePair(actor, other, p.health)) continue;
    if (!partnerPairReady(actor, other)) continue;
    const d = distance(actor, other);
    if (d > p.radius) continue;
    candidates.push({ other, d });
  }
  candidates.sort((a, b) => pairBond(actor, b.other) - pairBond(actor, a.other) ||
    a.d - b.d || a.other.uid - b.other.uid);
  return candidates.length ? candidates[0].other : null;
}

function stateBusy(actor) {
  return !!(actor && actor.ai && (actor.ai.partner || actor.ai.familyTask));
}

function beginRelation(ctx, kind, other) {
  const { actor, ai, api, features } = ctx;
  if (!actor || !ai || !other || !other.ai) return false;
  if (kind === 'reconcile' && (!features?.reconciliation || !hasRival(actor, other) || !hasRival(other, actor))) return false;
  if (kind === 'partner' && (!features?.partnership || !partnerPairReady(actor, other))) return false;
  const p = params(ctx, kind);
  if (!availablePair(actor, other, p.health)) return false;
  const state = kind === 'reconcile' ? 'seekReconcile' : 'seekPartner';
  if (!beginPair(actor, other, state, { stop: api.stop, face: api.face })) return false;
  ai.activityRole = 'initiator';
  ai.activityT = p.approachTimeout;
  other.ai.activityRole = 'receiver';
  other.ai.activityT = p.approachTimeout;
  ai.target = { x: other.cx, z: other.cz };
  other.ai.target = { x: actor.cx, z: actor.cz };
  if (!api.setDestination(actor, other.cx, other.cz)) {
    cancellation(ctx, kind);
    return false;
  }
  api.face(actor, other.cx, other.cz);
  api.face(other, actor.cx, actor.cz);
  api.emit(actor, kind === 'reconcile' ? 'heart' : 'question', 1.0);
  return true;
}

function thinkRelation(ctx, kind) {
  const { actor, ai, api } = ctx;
  const p = params(ctx, kind);
  if (!actor || !ai) return;
  const other = ai.partner;
  if (!other || !other.ai || !other.active || other.ai.partner !== actor) {
    cancellation(ctx, kind);
    return;
  }
  if (ai.activityRole === 'receiver') {
    api.face(actor, other.cx, other.cz);
    return;
  }
  const d = distance(actor, other);
  if (d <= p.arriveDist) {
    ai.state = kind === 'reconcile' ? 'reconcile' : 'partnering';
    other.ai.state = ai.state;
    ai.activityT = p.duration;
    other.ai.activityT = p.duration;
    ai.moving = false;
    ai.path = null;
    other.ai.moving = false;
    other.ai.path = null;
    api.face(actor, other.cx, other.cz);
    api.face(other, actor.cx, actor.cz);
    return;
  }
  if (api.needsReplan(ai) && !api.setDestination(actor, other.cx, other.cz)) {
    cancellation(ctx, kind);
  }
}

function finishReconcile(ctx) {
  const { actor, ai, api, features } = ctx;
  const other = ai.partner;
  if (!other || !other.ai || other.ai.partner !== actor ||
      !hasRival(actor, other) || !hasRival(other, actor)) {
    return cancellation(ctx, 'reconcile');
  }
  const beforeActor = bondOf(actor, other);
  const beforeOther = bondOf(other, actor);
  clearRival(actor, other);
  addBond(actor, other, RECONCILE_BOND_GAIN);
  ai.reconcileCooldown = 0;
  other.ai.reconcileCooldown = 0;
  ai.activityRole = null;
  other.ai.activityRole = null;
  ai.activityT = 0;
  other.ai.activityT = 0;
  if (features.interactionHistory) {
    const day = api.dayNow();
    const hour = api.hoursNow();
    pushHistory(actor, {
      kind: 'reconcile', uid: other.uid, day, hour,
      bondBefore: beforeActor, bondAfter: bondOf(actor, other),
    });
    pushHistory(other, {
      kind: 'reconcile', uid: actor.uid, day, hour,
      bondBefore: beforeOther, bondAfter: bondOf(other, actor),
    });
  }
  api.emit(actor, 'heart', 1.0);
  api.emit(other, 'heart', 1.0);
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .55, taskCooldown: 1.0 });
  return true;
}

function finishPartnership(ctx) {
  const { actor, ai, api, features } = ctx;
  const other = ai.partner;
  if (!other || !other.ai || other.ai.partner !== actor ||
      actor.stage !== 'adult' || other.stage !== 'adult' ||
      actor.sex === other.sex || hasPartnership(actor) || hasPartnership(other) ||
      !partnershipBondReady(actor, other) ||
      !canSpeciesBreed(actor.species, other.species, { current: true }).ok) {
    return cancellation(ctx, 'partner');
  }
  setPartnership(actor, other);
  ai.activityRole = null;
  other.ai.activityRole = null;
  ai.activityT = 0;
  other.ai.activityT = 0;
  if (features.interactionHistory) {
    const day = api.dayNow();
    const hour = api.hoursNow();
    pushHistory(actor, { kind: 'partnered', uid: other.uid, day, hour });
    pushHistory(other, { kind: 'partnered', uid: actor.uid, day, hour });
  }
  api.emit(actor, 'heart', 1.0);
  api.emit(other, 'heart', 1.0);
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .6, taskCooldown: 1.2 });
  return true;
}

function tickRelation(ctx, kind) {
  const { ai, dt } = ctx;
  const states = kind === 'reconcile' ? RECONCILE_STATES : PARTNER_STATES;
  const seekState = kind === 'reconcile' ? 'seekReconcile' : 'seekPartner';
  if (!ai || !states.includes(ai.state)) return false;
  if (ai.activityRole === 'receiver') return true;
  ai.activityT -= dt;
  if (ai.state === seekState) {
    if (ai.activityT <= 0) {
      cancellation(ctx, kind);
      return true;
    }
    thinkRelation(ctx, kind);
    return true;
  }
  if (ai.activityT <= 0) {
    if (kind === 'reconcile') finishReconcile(ctx);
    else finishPartnership(ctx);
  }
  return true;
}

export const relationshipsModule = defineBehaviorModule({
  cancel: cancellation,
  id: 'relationships',
  label: 'Reconciliation and partnership',
  states: RELATION_STATES,
  activeStates: ['reconcile', 'partnering'],
  defaults: {
    enabled: true,
    params: {
      reconcile: {
        radius: 9, arriveDist: 1.2, duration: 6, approachTimeout: 18,
        failedCooldown: 30, health: 15, bond: RECONCILE_BOND_GAIN,
      },
      partner: {
        radius: 9, arriveDist: 1.15, duration: 6, approachTimeout: 18,
        health: 20, bond: PARTNERSHIP_BOND,
      },
    },
  },
  opportunities: [{
    id: 'relationship.reconcile',
    order: 108,
    canRun: (ctx) => !!ctx.features?.reconciliation && !!ctx.actor &&
      !ctx.ai.partner && !ctx.ai.familyTask,
    enter: (ctx) => {
      const other = rivalCandidate(ctx);
      return !!other && beginRelation(ctx, 'reconcile', other);
    },
  }, {
    id: 'relationship.partner',
    order: 109,
    canRun: (ctx) => !!ctx.features?.partnership && !!ctx.actor &&
      ctx.actor.stage === 'adult' && !ctx.actor.partnerUid,
    enter: (ctx) => {
      const other = partnerCandidate(ctx);
      return !!other && beginRelation(ctx, 'partner', other);
    },
  }],
  beginReconcile: (ctx, other) => beginRelation(ctx, 'reconcile', other),
  beginPartnership: (ctx, other) => beginRelation(ctx, 'partner', other),
  finishReconcile,
  finishPartnership,
  think(ctx) {
    if (!ctx.ai) return false;
    if (RECONCILE_STATES.includes(ctx.ai.state)) {
      thinkRelation(ctx, 'reconcile');
      return true;
    }
    if (PARTNER_STATES.includes(ctx.ai.state)) {
      thinkRelation(ctx, 'partner');
      return true;
    }
    return false;
  },
  tick(ctx) {
    if (RECONCILE_STATES.includes(ctx.ai?.state)) return tickRelation(ctx, 'reconcile');
    if (PARTNER_STATES.includes(ctx.ai?.state)) return tickRelation(ctx, 'partner');
    return false;
  },
  isTraveling: (ctx) => !!(ctx.ai &&
    (ctx.ai.state === 'seekReconcile' || ctx.ai.state === 'seekPartner') &&
    ctx.ai.activityRole === 'initiator'),
  interrupt(ctx) {
    if (!ctx.ai) return;
    if (RECONCILE_STATES.includes(ctx.ai.state)) cancellation(ctx, 'reconcile');
    else if (PARTNER_STATES.includes(ctx.ai.state)) cancellation(ctx, 'partner');
  },
});
