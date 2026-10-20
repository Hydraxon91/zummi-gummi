// Social behavior: company, invite/decline, hangout and home visits.
//
// These states stay one module because end-of-social chains directly into a
// visit. The legacy values and asymmetries are preserved: acceptance uses the
// partner's thresholds with the initiator's bond, decline cooldowns 4.0/2.5, and
// a visit always uses the initiator's home.

import {
  addBond, pairBond, familyRelation, socialAcceptBonus, schedulePlaydate,
  nextPlaydateDay, PLAYDATE_WINDOW,
} from '../family.js';
import { pairAvailable, beginPair, endPair } from '../interactions.js';
import { defineBehaviorModule } from './module.js';

const COMPANY_STATES = ['wander', 'seekCompany', 'stargaze', 'seekSocial'];

function clamp(n, lo, hi) {
  return n < lo ? lo : (n > hi ? hi : n);
}

function unit(value) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function dist(a, b) {
  return Math.hypot(a.cx - b.cx, a.cz - b.cz);
}

function canCompany(ctx, other) {
  const { actor, p } = ctx;
  if (!pairAvailable(actor, other, { states: COMPANY_STATES })) return false;
  if (!COMPANY_STATES.includes(other.ai.state)) return false;
  if (other.health < p.thresholds.healthWoozy) return false;
  return true;
}

function startSeekCompany(ctx, partner) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || !partner || !partner.ai) return false;
  api.releaseFood(actor);
  ai.waterSpot = null;
  beginPair(actor, partner, 'seekCompany', { stop: api.stop, face: api.face });
  ai.target = { x: partner.cx, z: partner.cz };
  api.setDestination(actor, partner.cx, partner.cz);
  return true;
}

function acquireCompany(ctx) {
  const { actor, ai, p, api, rng } = ctx;
  if (!actor || !ai || ai.socialCooldown > 0) return null;
  if (actor.social < p.thresholds.seekSocial && actor.affection < p.thresholds.seekAffection) return null;
  ai.familyPlay = false;
  ai.playmateKind = null;
  let best = null;
  let bestScore = -Infinity;
  for (const other of api.actors()) {
    if (!canCompany(ctx, other)) continue;
    const d = dist(actor, other);
    if (d > p.social.radius) continue;
    const bond = pairBond(actor, other);
    const need = unit(other.social);
    const relation = familyRelation(actor, other);
    const familyBonus = ai.familyPlayCooldown > 0 ? 0
      : relation === 'sibling' ? .35 : (relation === 'parent' || relation === 'child') ? .2 : 0;
    const score = bond * 1.3 + need * .7 - d * .025 + familyBonus +
      (other.ai.state === 'wander' && !other.ai.moving ? .18 : 0) +
      (rng() - .5) * .08;
    if (score > bestScore) { bestScore = score; best = other; }
  }
  if (!best) {
    ai.socialCooldown = 3.0;
    return null;
  }
  const relation = familyRelation(actor, best);
  ai.familyPlay = ai.familyPlayCooldown <= 0 &&
    (relation === 'sibling' || relation === 'parent' || relation === 'child');
  ai.playmateKind = ai.familyPlay ? relation : null;
  startSeekCompany(ctx, best);
  return best;
}

function thinkSeekCompany(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return;
  const partner = ai.partner;
  if (!canCompany(ctx, partner)) {
    if (partner && partner.ai && partner.ai.partner === actor) api.cancelPair(actor);
    ai.state = 'wander';
    ai.idleT = .5;
    ai.socialCooldown = Math.max(ai.socialCooldown, 3.0);
    api.stop(actor);
    return;
  }
  if (actor.social < p.thresholds.stopSocial && actor.affection < p.thresholds.stopSocial) {
    api.cancelPair(actor);
    ai.state = 'wander';
    ai.idleT = .5;
    api.stop(actor);
    return;
  }
  const d = dist(actor, partner);
  if (d <= p.social.dist) { startInvite(ctx, partner); return; }
  if (api.needsReplan(ai)) {
    if (!api.setDestination(actor, partner.cx, partner.cz) && d > 2.2) {
      api.cancelPair(actor);
      ai.state = 'wander';
      ai.idleT = .7;
      ai.socialCooldown = Math.max(ai.socialCooldown, 3.0);
    }
  }
}

function decideAccept(ctx, partner) {
  const { actor, ai, api, rng } = ctx;
  const p = api.profile(partner);
  const need = unit(partner.social);
  const bond = pairBond(actor, partner);
  let chance = .30 + need * .55 + bond * .30 + (partner.ai.state === 'wander' ? .12 : 0) +
    socialAcceptBonus(partner);
  if (partner.health < p.thresholds.healthHurt) chance -= .18;
  if (partner.energy < p.thresholds.energyTired) chance -= .12;
  chance = clamp(chance, .15, .94);
  return rng() < chance;
}

function startInvite(ctx, partner, acceptedOverride) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || !partner || !partner.ai) return false;
  if (!canCompany(ctx, partner)) return false;
  const accepted = acceptedOverride === undefined ? decideAccept(ctx, partner) : !!acceptedOverride;
  ai.state = 'invite';
  ai.partner = partner;
  ai.inviteAccepted = accepted;
  ai.inviteT = ctx.p.social.inviteTime;
  ai.moving = false;
  ai.path = null;
  ai.target = { x: partner.cx, z: partner.cz };
  api.face(actor, partner.cx, partner.cz);
  partner.ai.partner = actor;
  partner.ai.inviteAccepted = accepted;
  partner.ai.inviteT = api.profile(partner).social.inviteTime;
  partner.ai.declineT = api.profile(partner).social.declineTime;
  partner.ai.moving = false;
  partner.ai.path = null;
  partner.ai.target = { x: actor.cx, z: actor.cz };
  api.face(partner, actor.cx, actor.cz);
  partner.ai.state = accepted ? 'invite' : 'decline';
  api.emit(actor, 'question', 1.08);
  return true;
}

function beginSocialPair(ctx, partner, familyPlay = false, playmateKind = null) {
  const { actor, ai, api } = ctx;
  if (!actor || !partner || !ai || !partner.ai) return false;
  const p = ctx.p;
  const family = !!(familyPlay || ai.familyPlay || partner.ai.familyPlay);
  const kind = playmateKind || ai.playmateKind || partner.ai.playmateKind || 'family';
  const duration = family ? p.social.familySocialTime : p.social.socialTime;
  beginPair(actor, partner, 'social', { stop: api.stop, face: api.face });
  ai.socialT = duration;
  partner.ai.socialT = duration;
  ai.familyPlay = family;
  partner.ai.familyPlay = family;
  ai.playmateKind = family ? kind : null;
  partner.ai.playmateKind = family ? kind : null;
  ai.inviteT = 0;
  partner.ai.inviteT = 0;
  ai.heartT = 0;
  partner.ai.heartT = .22;
  ai.animT = 0;
  partner.ai.animT = 0;
  ai.target = { x: partner.cx, z: partner.cz };
  partner.ai.target = { x: actor.cx, z: actor.cz };
  api.emit(actor, 'heart', .9);
  return true;
}

function settleSocial(ctx) {
  const { actor, p } = ctx;
  if (!actor || !ctx.ai) return;
  actor.social = Math.max(0, actor.social - p.social.relief);
  actor.affection = Math.max(0, actor.affection - p.social.affectionRelief);
  ctx.ai.socialCooldown = p.social.cooldown;
}

function scheduleNextPlaydate(ctx, partner) {
  if (!ctx.actor || !partner) return;
  const next = { day: nextPlaydateDay(ctx.api.dayNow()), hour: PLAYDATE_WINDOW.start };
  schedulePlaydate(ctx.actor, partner, next);
}

function endSocialPair(ctx) {
  const { actor, ai, p, api, rng } = ctx;
  if (!actor || !ai || ai.state !== 'social') return;
  const partner = ai.partner;
  const familyPlay = !!(ai.familyPlay || (partner && partner.ai && partner.ai.familyPlay));
  settleSocial(ctx);
  if (partner && partner.ai && partner.ai.state === 'social' && partner.ai.partner === actor) {
    settleSocial({ actor: partner, ai: partner.ai, p: api.profile(partner) });
  }
  addBond(actor, partner, (familyPlay ? p.social.familyBondBase : p.social.bondBase) + rng() * p.social.bondJitter);
  if (familyPlay) {
    addBond(actor, partner, p.social.familyBondExtra);
    ai.familyPlayCooldown = 18;
    if (partner && partner.ai) partner.ai.familyPlayCooldown = 18;
    scheduleNextPlaydate(ctx, partner);
  }
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .55, taskCooldown: 1.0 });
  const canVisit = partner && api.isDayFor(actor) &&
    pairBond(actor, partner) >= p.social.visitBond && rng() < p.social.visitChance;
  if (canVisit) startVisit(ctx, partner);
}

function startDeclinePair(ctx, partner) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || !partner || !partner.ai) return;
  const p = ctx.p;
  beginPair(actor, partner, 'decline', { stop: api.stop, face: api.face });
  ai.declineT = p.social.declineTime;
  partner.ai.declineT = api.profile(partner).social.declineTime;
  ai.inviteT = 0;
  partner.ai.inviteT = 0;
  ai.socialCooldown = Math.max(ai.socialCooldown, 4.0);
  partner.ai.socialCooldown = Math.max(partner.ai.socialCooldown, 2.5);
  api.emit(actor, 'no', 1.08);
  api.emit(partner, 'no', 1.08);
}

function finishDeclinePair(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || ai.state !== 'decline') return;
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .55 });
}

function resolveInvite(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || ai.state !== 'invite' || ai.inviteT > 0) return;
  const partner = ai.partner;
  if (!partner || !partner.ai) {
    ai.state = 'wander';
    ai.partner = null;
    api.stop(actor);
    return;
  }
  if (ai.inviteAccepted) beginSocialPair(ctx, partner);
  else startDeclinePair(ctx, partner);
}

function startVisit(ctx, partner) {
  const { actor, ai, api, field } = ctx;
  if (!actor || !partner || !ai || !partner.ai || actor === partner) return false;
  if (!api.isDayFor(actor)) return false;
  const home = api.homeFor(actor);
  if (!home || !field || !field.nav) return false;
  const dx = home.door.x - home.x;
  const dz = home.door.z - home.z;
  const len = Math.hypot(dx, dz) || 1;
  let gx = home.door.x - dz / len * .72;
  let gz = home.door.z + dx / len * .72;
  const near = field.nav.nearestWalkable(gx, gz);
  if (near && !(field.pond && field.pond.contains(near.x, near.z))) {
    gx = near.x; gz = near.z;
  } else {
    gx = home.door.x; gz = home.door.z;
  }
  ai.state = 'visit';
  partner.ai.state = 'visit';
  ai.partner = partner;
  partner.ai.partner = actor;
  ai.visitHome = home.name;
  partner.ai.visitHome = home.name;
  ai.visitRole = 'host';
  partner.ai.visitRole = 'guest';
  ai.visitPhase = 'travel';
  partner.ai.visitPhase = 'travel';
  ai.visitT = 0;
  partner.ai.visitT = 0;
  ai.visitArrived = false;
  partner.ai.visitArrived = false;
  ai.moving = false;
  partner.ai.moving = false;
  ai.target = { x: home.door.x, z: home.door.z };
  partner.ai.target = { x: gx, z: gz };
  api.face(actor, home.door.x, home.door.z);
  api.face(partner, gx, gz);
  api.setPath(actor, api.pathTo(actor, home.door.x, home.door.z) || [{ x: home.door.x, z: home.door.z }]);
  api.setPath(partner, api.pathTo(partner, gx, gz) || [{ x: gx, z: gz }]);
  api.emit(actor, 'heart', .95);
  return true;
}

function beginVisitHangout(ctx, partner) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !partner || !ai || !partner.ai) return;
  ai.visitPhase = 'hangout';
  partner.ai.visitPhase = 'hangout';
  ai.visitT = p.social.visitTime;
  partner.ai.visitT = p.social.visitTime;
  ai.animT = 0;
  partner.ai.animT = 0;
  ai.heartT = .3;
  partner.ai.heartT = 1.0;
  ai.moving = false;
  partner.ai.moving = false;
  ai.path = null;
  partner.ai.path = null;
  api.face(actor, partner.cx, partner.cz);
  api.face(partner, actor.cx, actor.cz);
  api.emit(actor, 'heart', .95);
}

function finishVisitPair(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || ai.state !== 'visit') return;
  const partner = ai.partner;
  addBond(actor, partner, .08);
  actor.social = Math.max(0, actor.social - .22);
  actor.affection = Math.max(0, actor.affection - .16);
  ai.socialCooldown = 8;
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .6, taskCooldown: 1.2, socialCooldown: 8 });
  if (partner && partner.ai) {
    partner.social = Math.max(0, partner.social - .22);
    partner.affection = Math.max(0, partner.affection - .16);
  }
}

function tickVisit(ctx, dt) {
  const { actor, ai, api, field } = ctx;
  if (!actor || !ai || ai.state !== 'visit') return;
  const partner = ai.partner;
  if (!partner || !partner.ai || partner.ai.partner !== actor || partner.ai.state !== 'visit' || !api.isDayFor(actor)) {
    finishVisitPair(ctx);
    return;
  }
  if (ai.visitPhase === 'hangout') return;
  ai.visitT = (ai.visitT || 0) + dt;
  if (ai.visitT > 12) { finishVisitPair(ctx); return; }
  const home = field.homes.find(h => h.name === ai.visitHome);
  if (!home || !ai.target) { finishVisitPair(ctx); return; }
  const target = ai.target;
  const d = Math.hypot(target.x - actor.cx, target.z - actor.cz);
  if (d <= ctx.p.social.visitDist) {
    ai.visitArrived = true;
    ai.moving = false;
    ai.path = null;
    if (partner.ai.visitArrived) {
      const host = ai.visitRole === 'host' ? actor : partner;
      const guest = host === actor ? partner : actor;
      beginVisitHangout({ actor: host, ai: host.ai, p: api.profile(host), api }, guest);
    }
    return;
  }
  if (api.needsReplan(ai)) {
    if (!api.setDestination(actor, target.x, target.z) && d > 2.2) finishVisitPair(ctx);
  }
}

function tick(ctx, dt) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai) return false;
  if (ai.state === 'invite') {
    ai.animT += dt;
    ai.inviteT -= dt;
    if (ai.inviteT <= 0) resolveInvite(ctx);
    return true;
  }
  if (ai.state === 'social') {
    ai.animT += dt;
    ai.socialT -= dt;
    ai.heartT -= dt;
    if (ai.heartT <= 0) {
      ai.heartT = .72;
      api.emit(actor, 'heart', .95);
    }
    if (ai.socialT <= 0) endSocialPair(ctx);
    return true;
  }
  if (ai.state === 'decline') {
    ai.animT += dt;
    ai.declineT -= dt;
    if (ai.declineT <= 0) finishDeclinePair(ctx);
    return true;
  }
  if (ai.state === 'visit') {
    if (ai.visitPhase === 'hangout') {
      ai.animT += dt;
      ai.heartT -= dt;
      ai.visitT -= dt;
      if (ai.heartT <= 0) { ai.heartT = 1.0; api.emit(actor, 'heart', .95); }
      if (ai.visitT <= 0) finishVisitPair(ctx);
    } else {
      ai.animT += dt;
      tickVisit(ctx, dt);
    }
    return true;
  }
  return false;
}

export const socialModule = defineBehaviorModule({
  id: 'social',
  label: 'Company, social and visits',
  states: ['seekCompany', 'invite', 'social', 'decline', 'visit'],
  defaults: { enabled: true, params: {} },
  opportunities: [{
    id: 'social.company',
    order: 110,
    canRun: (ctx) => !!ctx.actor &&
      (ctx.actor.social >= ctx.p.thresholds.seekSocial ||
        ctx.actor.affection >= ctx.p.thresholds.seekAffection),
    enter: (ctx) => !!acquireCompany(ctx),
  }],
  acquireCompany,
  startInvite,
  beginSocialPair,
  startDeclinePair,
  startVisit,
  finishVisit: finishVisitPair,
  think(ctx) {
    if (!ctx.ai || ctx.ai.state !== 'seekCompany') return false;
    thinkSeekCompany(ctx);
    return true;
  },
  tick,
  isTraveling(ctx) {
    const ai = ctx.ai;
    if (!ai) return false;
    if (ai.state === 'seekCompany') return true;
    if (ai.state === 'visit') {
      if (ai.visitPhase === 'hangout') return false;
      const target = ai.target;
      return !target || Math.hypot(target.x - ctx.actor.cx, target.z - ctx.actor.cz) > 1.7;
    }
    return false;
  },
});
