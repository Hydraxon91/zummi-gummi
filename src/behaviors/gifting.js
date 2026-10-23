// Physical gifting: collect one safe ripe food portion, carry it, hand it over.
//
// The source is consumed once when the giver picks it up; the carried portion is
// consumed once at a successful handover. An interrupted collected gift is
// dropped as a recoverable portion instead of disappearing. A dropped portion can
// itself be reserved and carried by a later offer.
//
// Gifting is modules-only and off by default. Nothing here draws RNG.

import {
  addBond, bondOf, forageEatScale, pairBond, pushHistory,
} from '../family.js';
import { actorAvailable, beginPair, endPair } from '../interactions.js';
import { defineBehaviorModule } from './module.js';

const GIFT_STATES = ['seekGift', 'gift'];

function params(ctx) {
  return ctx.p.gifting || ctx.p.behaviorModules?.gifting?.params || {};
}

function mapId(ctx) {
  return ctx.mapId || 'field';
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

function dropCarried(actor, field, ctx) {
  if (!actor || !actor.carriedFood) return null;
  const carried = actor.carriedFood;
  actor.carriedFood = null;
  if (!field || !field.portions) return null;
  const record = {
    id: carried.id,
    kind: carried.kind,
    satiation: carried.satiation,
    x: actor.cx,
    y: Math.max(.04, Number.isFinite(actor.cy) ? actor.cy - .12 : .04),
    z: actor.cz,
    mapId: mapId(ctx),
  };
  const dropped = field.portions.add(record) ||
    field.portions.add({ ...record, id: field.portions.nextId() });
  return dropped || null;
}

function releaseOrigin(actor, field, api) {
  if (!actor || !actor.ai) return;
  const ai = actor.ai;
  if (ai.source) {
    const food = api.food();
    if (food) food.release(ai.source, actor);
    ai.source = null;
  }
  if (ai.giftOrigin?.portion) {
    if (field && field.portions) field.portions.release(ai.giftOrigin.portion, actor);
    ai.giftOrigin = null;
  }
  ai.giftPhase = null;
}

function clearGiftActor(actor, retryT) {
  if (!actor || !actor.ai) return;
  actor.ai.giftRole = null;
  actor.ai.giftT = 0;
  actor.ai.giftPhase = null;
  actor.ai.giftOrigin = null;
  actor.ai.source = null;
  if (actor.ai.giftRetryT !== undefined) actor.ai.giftRetryT = retryT;
}

function cancelGift(ctx) {
  const { actor, ai, api, field } = ctx;
  if (!actor || !ai) return;
  const p = params(ctx);
  const partner = ai.partner;
  const giver = ai.giftRole === 'giver' ? actor : partner;
  if (giver && giver.ai) {
    releaseOrigin(giver, field, api);
    dropCarried(giver, field, ctx);
    giver.ai.giftRetryT = p.retryT;
  }
  clearGiftActor(actor, p.retryT);
  if (partner && partner.ai) clearGiftActor(partner, p.retryT);
  if (partner) endPair(actor, { stop: api.stop, next: 'wander', idleT: .55, taskCooldown: .8 });
  else {
    ai.state = 'wander';
    ai.idleT = .5;
    api.stop(actor);
  }
}

function originFor(ctx) {
  const { actor, api, field } = ctx;
  const p = params(ctx);
  if (!field) return null;
  // Recover a dropped portion before looking for a fresh source.
  if (field.portions) {
    const portion = field.portions.nearest(actor.cx, actor.cz, {
      maxDistance: p.searchRadius, mapId: mapId(ctx), bear: actor,
    });
    if (portion && field.portions.claim(portion, actor)) {
      return { type: 'portion', portion, x: portion.x, z: portion.z };
    }
  }
  const food = api.food();
  const source = food ? food.nearestRipe(actor.cx, actor.cz, {
    maxDistance: p.searchRadius, bear: actor, safe: true,
  }) : null;
  if (!source || !food.claim(source, actor)) return null;
  return { type: 'source', source, x: source.approachX, z: source.approachZ };
}

function pathToOrigin(ctx, origin) {
  const { actor, api } = ctx;
  const d = Math.hypot(origin.x - actor.cx, origin.z - actor.cz);
  if (d <= params(ctx).arriveDist) return true;
  return api.setDestination(actor, origin.x, origin.z);
}

function beginGift(ctx, forced = null) {
  const { actor, ai, api, field, features } = ctx;
  const p = params(ctx);
  if (!features || !features.gifting || !actor || !ai || !field) return false;
  if (actor.stage !== 'adult' || actor.health < p.giverHealth ||
      actor.hunger > p.giverHunger || actor.thirst > p.giverThirst) return miss(actor, p);
  if (actor.lastGiftDay === api.dayNow()) return miss(actor, p);
  if (actor.ai.giftRetryT > 0 || actor.ai.partner || actor.ai.familyTask) return miss(actor, p);

  const recipient = candidateFor(ctx, forced);
  if (!recipient) return miss(actor, p);

  let origin = null;
  if (!actor.carriedFood) {
    origin = originFor(ctx);
    if (!origin) return miss(actor, p);
  }

  if (!beginPair(actor, recipient, 'seekGift', { stop: api.stop, face: api.face })) {
    if (origin) {
      if (origin.type === 'source') {
        const food = api.food();
        if (food) food.release(origin.source, actor);
      } else if (origin.type === 'portion') field.portions.release(origin.portion, actor);
    }
    return miss(actor, p);
  }
  ai.giftRole = 'giver';
  ai.giftT = p.approachTimeout;
  ai.giftOrigin = origin;
  ai.source = origin?.type === 'source' ? origin.source : null;
  ai.giftPhase = actor.carriedFood ? 'deliver' : 'collect';
  ai.target = { x: recipient.cx, z: recipient.cz };
  recipient.ai.giftRole = 'receiver';
  recipient.ai.giftT = p.approachTimeout;
  recipient.ai.target = { x: actor.cx, z: actor.cz };

  const target = ai.giftPhase === 'collect' ? origin : { x: recipient.cx, z: recipient.cz };
  if (!pathToOrigin(ctx, target)) {
    cancelGift(ctx);
    return false;
  }
  api.face(actor, target.x, target.z);
  api.face(recipient, actor.cx, actor.cz);
  api.emit(actor, 'question', 1.05);
  return true;
}

function collect(ctx) {
  const { actor, ai, api, field } = ctx;
  const origin = ai.giftOrigin;
  if (!origin || !field) return false;
  if (origin.type === 'source') {
    if (!origin.source || !origin.source.ripe || origin.source.claim !== actor) return false;
    const food = api.food();
    if (!food || !food.consume(origin.source, actor)) return false;
    actor.carriedFood = {
      id: field.portions ? field.portions.nextId() : `gift-${actor.uid}-${Math.floor(actor.ai.clock || 0)}`,
      kind: origin.source.kind,
      satiation: origin.source.satiation,
    };
    ai.source = null;
  } else {
    if (!field.portions) return false;
    const carried = field.portions.take(origin.portion, actor);
    if (!carried) return false;
    actor.carriedFood = carried;
  }
  ai.giftOrigin = null;
  ai.giftPhase = 'deliver';
  ai.giftT = params(ctx).approachTimeout;
  return true;
}

function finishGift(ctx) {  const { actor, ai, api, features } = ctx;
  const p = params(ctx);
  if (!actor || !ai || ai.giftRole !== 'giver') return false;
  const recipient = ai.partner;
  const carried = actor.carriedFood;
  if (!recipient || !recipient.ai || !recipient.active || recipient.ai.partner !== actor ||
      !carried || recipient.hunger < p.receiverHunger) {
    cancelGift(ctx);
    return false;
  }
  const beforeActor = bondOf(actor, recipient);
  const beforeRecipient = bondOf(recipient, actor);
  actor.carriedFood = null;
  recipient.hunger = Math.max(0, recipient.hunger - carried.satiation * forageEatScale(recipient));
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
  ai.giftRole = null;
  ai.giftT = 0;
  ai.giftPhase = null;
  recipient.ai.giftRole = null;
  recipient.ai.giftT = 0;
  api.emit(recipient, 'heart', 1.05);
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .55, taskCooldown: 1.2 });
  return true;
}

function thinkGift(ctx) {
  const { actor, ai, api, field } = ctx;
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
  if (recipient.hunger < p.receiverHunger || recipient.health < p.recipientHealth) {
    cancelGift(ctx);
    return;
  }

  if (ai.giftPhase === 'collect') {
    const origin = ai.giftOrigin;
    if (!origin ||
        (origin.type === 'source' && (!origin.source || !origin.source.ripe || origin.source.claim !== actor)) ||
        (origin.type === 'portion' && !origin.portion)) {
      cancelGift(ctx);
      return;
    }
    const d = Math.hypot(origin.x - actor.cx, origin.z - actor.cz);
    if (d <= p.arriveDist) {
      if (!collect(ctx)) cancelGift(ctx);
      if (!actor.ai || !actor.carriedFood) return;
      if (!api.setDestination(actor, recipient.cx, recipient.cz)) cancelGift(ctx);
      return;
    }
    if (api.needsReplan(ai) && !api.setDestination(actor, origin.x, origin.z)) {
      cancelGift(ctx);
    }
    return;
  }

  if (!actor.carriedFood) {
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
  if (api.needsReplan(ai) && !api.setDestination(actor, recipient.cx, recipient.cz)) {
    cancelGift(ctx);
  }
}

export const giftingModule = defineBehaviorModule({
  // Exposed so the engine can cancel active offers when the feature is disabled.
  cancel: cancelGift,
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
      approachTimeout: 18,
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
  collect,
  dropCarried,
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
      ai.giftT -= dt;
      if (ai.giftT <= 0) {
        cancelGift(ctx);
        return true;
      }
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
