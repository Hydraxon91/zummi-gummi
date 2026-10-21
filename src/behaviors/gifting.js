// Gifting behavior: offer a nearby ripe food source to another actor.
//
// The source stays reserved by the giver during the approach. It is consumed
// once, at a successful handover, and the recipient receives the normal
// satiation effect. A refused or interrupted offer releases the claim.

import {
  addBond, bondOf, forageEatScale, pairBond, pushHistory,
} from '../family.js';
import { actorAvailable, beginPair, endPair } from '../interactions.js';
import { defineBehaviorModule } from './module.js';

const GIFT_STATES = ['seekGift', 'gift'];

function params(ctx) {
  return ctx.p.gifting || ctx.p.behaviorModules?.gifting?.params || {};
}

function miss(actor, p) {
  if (actor && actor.ai) actor.ai.giftRetryT = p.retryT;
  return false;
}

function candidateFor(ctx, forced = null) {
  const { actor, api } = ctx;
  const p = params(ctx);
  if (!forced) {
    const list = api.actors()
      .filter(other => other !== actor && other.active && actorAvailable(other) &&
        !other.fading && other.ai.state === 'wander' && !other.ai.partner &&
        !other.ai.familyTask && other.hunger >= p.receiverHunger &&
        other.health >= p.recipientHealth)
      .map(other => ({
        other,
        d: Math.hypot(other.cx - actor.cx, other.cz - actor.cz),
      }))
      .filter(entry => entry.d <= p.recipientRadius)
      .sort((a, b) => pairBond(actor, b.other) - pairBond(actor, a.other) ||
        a.d - b.d || a.other.uid - b.other.uid);
    return list.length ? list[0].other : null;
  }
  const d = Math.hypot(forced.cx - actor.cx, forced.cz - actor.cz);
  if (forced === actor || !actorAvailable(forced) || forced.fading ||
      forced.ai.state !== 'wander' || forced.ai.partner || forced.ai.familyTask ||
      forced.hunger < p.receiverHunger || forced.health < p.recipientHealth ||
      d > p.recipientRadius) return null;
  return forced;
}

function cancelGift(ctx) {
  const { actor, ai, api, field } = ctx;
  const p = params(ctx);
  if (!actor || !ai) return;
  const partner = ai.partner;
  const giver = ai.giftRole === 'giver' ? actor : partner;
  if (giver && giver.ai && giver.ai.source) {
    if (field && field.food) field.food.release(giver.ai.source, giver);
    giver.ai.source = null;
  }
  if (ai.giftRole) ai.giftRole = null;
  if (ai.giftT) ai.giftT = 0;
  ai.giftRetryT = p.retryT;
  if (partner && partner.ai) {
    partner.ai.giftRole = null;
    partner.ai.giftT = 0;
  }
  if (partner) endPair(actor, { stop: api.stop, next: 'wander', idleT: .55, taskCooldown: .8 });
  else {
    ai.state = 'wander';
    ai.idleT = .5;
    api.stop(actor);
  }
}

function beginGift(ctx, forced = null) {
  const { actor, ai, api, field, features } = ctx;
  const p = params(ctx);
  if (!features || !features.gifting || !actor || !ai || !field || !field.food) return false;
  if (actor.stage !== 'adult' || actor.health < p.giverHealth ||
      actor.hunger > p.giverHunger || actor.thirst > p.giverThirst) return miss(actor, p);
  if (actor.lastGiftDay === api.dayNow()) return miss(actor, p);
  if (actor.ai.giftRetryT > 0 || actor.ai.partner || actor.ai.familyTask) return miss(actor, p);

  const recipient = candidateFor(ctx, forced);
  if (!recipient) return miss(actor, p);
  const source = field.food.nearestRipe(actor.cx, actor.cz, {
    maxDistance: p.searchRadius, bear: actor, safe: true,
  });
  if (!source || !field.food.claim(source, actor)) return miss(actor, p);

  if (!beginPair(actor, recipient, 'seekGift', { stop: api.stop, face: api.face })) {
    field.food.release(source, actor);
    return miss(actor, p);
  }
  ai.source = source;
  ai.giftRole = 'giver';
  ai.giftT = 0;
  ai.target = { x: recipient.cx, z: recipient.cz };
  recipient.ai.giftRole = 'receiver';
  recipient.ai.giftT = 0;
  recipient.ai.target = { x: actor.cx, z: actor.cz };
  const path = api.pathTo(actor, recipient.cx, recipient.cz);
  if (path) api.setPath(actor, path);
  api.face(actor, recipient.cx, recipient.cz);
  api.face(recipient, actor.cx, actor.cz);
  api.emit(actor, 'question', 1.05);
  return true;
}

function finishGift(ctx) {
  const { actor, ai, api, field, features } = ctx;
  const p = params(ctx);
  if (!actor || !ai || ai.giftRole !== 'giver') return false;
  const recipient = ai.partner;
  const source = ai.source;
  if (!recipient || !recipient.ai || !recipient.active || recipient.ai.partner !== actor ||
      !source || !source.ripe || source.claim !== actor ||
      recipient.hunger < p.receiverHunger) {
    cancelGift(ctx);
    return false;
  }
  const beforeActor = bondOf(actor, recipient);
  const beforeRecipient = bondOf(recipient, actor);
  if (!field.food.consume(source, actor)) {
    cancelGift(ctx);
    return false;
  }
  recipient.hunger = Math.max(0, recipient.hunger - source.satiation * forageEatScale(recipient));
  api.starsRescue?.(recipient, 'food');
  addBond(actor, recipient, p.bond);
  actor.lastGiftDay = api.dayNow();
  if (features.interactionHistory) {
    const day = api.dayNow();
    const hour = api.hoursNow();
    pushHistory(actor, {
      kind: 'gift', uid: recipient.uid, day, hour,
      bondBefore: beforeActor, bondAfter: bondOf(actor, recipient),
    });
    pushHistory(recipient, {
      kind: 'receivedGift', uid: actor.uid, day, hour,
      bondBefore: beforeRecipient, bondAfter: bondOf(recipient, actor),
    });
  }
  ai.source = null;
  ai.giftRole = null;
  ai.giftT = 0;
  recipient.ai.giftRole = null;
  recipient.ai.giftT = 0;
  api.emit(recipient, 'heart', 1.05);
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .55, taskCooldown: 1.2 });
  return true;
}

function thinkGift(ctx) {
  const { actor, ai, api } = ctx;
  const p = params(ctx);
  if (!actor || !ai) return;
  const recipient = ai.partner;
  if (!recipient || !recipient.ai || !recipient.active || recipient.ai.partner !== actor) {
    cancelGift(ctx);
    return;
  }
  if (ai.giftRole === 'receiver') {
    api.face(actor, recipient.cx, recipient.cz);
    return;
  }
  const source = ai.source;
  if (!source || !source.ripe || source.claim !== actor ||
      recipient.hunger < p.receiverHunger || recipient.health < p.recipientHealth) {
    cancelGift(ctx);
    return;
  }
  const d = Math.hypot(recipient.cx - actor.cx, recipient.cz - actor.cz);
  if (d <= p.arriveDist) {
    ai.state = 'gift';
    recipient.ai.state = 'gift';
    ai.giftT = p.duration;
    recipient.ai.giftT = p.duration;
    ai.moving = false;
    ai.path = null;
    recipient.ai.moving = false;
    recipient.ai.path = null;
    api.face(actor, recipient.cx, recipient.cz);
    api.face(recipient, actor.cx, actor.cz);
    return;
  }
  if (api.needsReplan(ai)) api.setDestination(actor, recipient.cx, recipient.cz);
}

export const giftingModule = defineBehaviorModule({
  id: 'gifting',
  label: 'Offer food',
  states: GIFT_STATES,
  activeStates: GIFT_STATES,
  defaults: {
    enabled: true,
    params: {
      searchRadius: 16,
      recipientRadius: 10,
      arriveDist: 1.25,
      duration: 2.2,
      bond: .04,
      receiverHunger: .28,
      giverHunger: .55,
      giverThirst: .60,
      giverHealth: 35,
      recipientHealth: 15,
      retryT: 30,
    },
  },
  opportunities: [{
    id: 'gifting.offer',
    order: 120,
    canRun: (ctx) => !!ctx.features?.gifting && !!ctx.actor &&
      ctx.actor.stage === 'adult' && (ctx.actor.ai.giftRetryT || 0) <= 0 &&
      ctx.actor.lastGiftDay !== ctx.api.dayNow(),
    enter: (ctx) => beginGift(ctx),
  }],
  beginGift,
  finishGift,
  think(ctx) {
    if (!ctx.ai || (ctx.ai.state !== 'seekGift')) return false;
    thinkGift(ctx);
    return true;
  },
  tick(ctx) {
    const { ai, dt } = ctx;
    if (!ai || !GIFT_STATES.includes(ai.state)) return false;
    if (ai.giftRole === 'receiver') return true;
    if (ai.state === 'seekGift') {
      thinkGift(ctx);
      return true;
    }
    ai.giftT -= dt;
    if (ai.giftT <= 0) finishGift(ctx);
    return true;
  },
  isTraveling: (ctx) => !!(ctx.ai && ctx.ai.state === 'seekGift' &&
    ctx.ai.giftRole === 'giver'),
  interrupt(ctx) {
    if (ctx.ai && GIFT_STATES.includes(ctx.ai.state)) cancelGift(ctx);
  },
});
