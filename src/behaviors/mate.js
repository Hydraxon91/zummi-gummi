// Mate behavior: courtship, pairing and gestation kickoff.
//
// Preserves the legacy asymmetries: the per-tick mate.chance gate draws before
// acquisition, acquireMate keeps its bare-number health/hunger/thirst/energy
// gates, and startSeekMate pairs both actors before pathing succeeds.

import {
  canMate, GESTATION_TIME, MATE_COOLDOWN, MATE_TIME, MATE_FOOD_MIN,
} from '../life.js';
import { canSpeciesBreed } from '../dna.js';
import { pairBond, addBond, pushHistory } from '../family.js';
import { actorAvailable, beginPair, endPair } from '../interactions.js';
import { defineBehaviorModule } from './module.js';

function dist(a, b) {
  return Math.hypot(a.cx - b.cx, a.cz - b.cz);
}

function canMatePair(ctx, other) {
  const { actor, ai, p, api } = ctx;
  if (!actorAvailable(actor) || !actorAvailable(other)) return false;
  if (actor === other) return false;
  if (actor.inside || other.inside) return false;
  if (!['wander', 'seekMate', 'stargaze', 'seekCompany'].includes(other.ai?.state)) return false;
  const gate = canSpeciesBreed(actor.species, other.species, { current: true });
  if (!gate.ok) return false;
  const softCount = api.actors().filter(a => a.active && a.kind !== 'glass').length;
  const room = p.mate.requiresRoom !== false ? softCount < api.populationCap() : true;
  return canMate(actor, other, { room, food: api.safeFoodCount() >= MATE_FOOD_MIN });
}

function startSeekMate(ctx, partner) {
  const { actor, ai, api } = ctx;
  if (!actor || !partner || !ai || !partner.ai) return false;
  beginPair(actor, partner, 'seekMate', { stop: api.stop, face: api.face });
  ai.target = { x: partner.cx, z: partner.cz };
  if (api.setDestination(actor, partner.cx, partner.cz)) return true;
  // Quirk flag: today the pair stays set when pathing fails.
  if (ctx.features.matePairOnPathFailure) {
    ai.partner = null;
    if (partner.ai.partner === actor) partner.ai.partner = null;
    ai.state = 'wander';
    partner.ai.state = 'wander';
    ai.idleT = .4;
    partner.ai.idleT = .4;
  }
  return false;
}

function acquireMate(ctx) {
  const { actor, ai, p, api, rng } = ctx;
  if (!actor || actor.pregnant || actor.stage !== 'adult' || actor.mateCooldown > 0) return null;
  if (actor.health < 70 || actor.hunger > .40 || actor.thirst > .60 || actor.energy < .30) return null;
  if (api.safeFoodCount() < MATE_FOOD_MIN) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const other of api.actors()) {
    if (!canMatePair(ctx, other)) continue;
    const d = dist(actor, other);
    if (d > p.mate.radius) continue;
    const score = pairBond(actor, other) * .4 - d * .02 + (rng() - .5) * .05;
    if (score > bestScore) { bestScore = score; best = other; }
  }
  if (!best) return null;
  return startSeekMate(ctx, best) ? best : null;
}

function thinkSeekMate(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai) return;
  const partner = ai.partner;
  if (!partner || !partner.ai || !partner.active || partner.ai.partner !== actor) {
    ai.partner = null;
    ai.state = 'wander';
    api.stop(actor);
    return;
  }
  const d = dist(actor, partner);
  if (d <= ctx.p.mate.dist) { startMatePair(ctx, partner); return; }
  if (api.needsReplan(ai)) api.setDestination(actor, partner.cx, partner.cz);
}

function startMatePair(ctx, partner) {
  const { actor, ai, api } = ctx;
  if (!actor || !partner || !ai || !partner.ai) return false;
  beginPair(actor, partner, 'mate', { stop: api.stop, face: api.face });
  ai.mateT = MATE_TIME;
  partner.ai.mateT = MATE_TIME;
  ai.waitForPartner = false;
  partner.ai.waitForPartner = false;
  api.emit(actor, 'heart', 1.0);
  api.emit(partner, 'heart', 1.0);
  return true;
}

function finishMatePair(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || ai.state !== 'mate') return;
  const partner = ai.partner;
  if (!partner || !partner.ai) {
    ai.state = 'wander';
    ai.partner = null;
    ai.mateT = 0;
    api.stop(actor);
    return;
  }
  const female = actor.sex === 'F' ? actor : partner;
  const male = female === actor ? partner : actor;
  if (!female.pregnant) {
    female.pregnant = true;
    female.gestation = GESTATION_TIME;
    female.fatherUid = male.uid;
    female.birthRetryT = 0;
  }
  actor.mateCooldown = MATE_COOLDOWN;
  partner.mateCooldown = MATE_COOLDOWN;
  addBond(actor, partner, .12);
  pushHistory(actor, { kind: 'mated', uid: partner.uid, day: api.dayNow(), hour: api.hoursNow() });
  pushHistory(partner, { kind: 'mated', uid: actor.uid, day: api.dayNow(), hour: api.hoursNow() });
  endPair(actor, { stop: api.stop, next: 'wander', idleT: .7, taskCooldown: 2.0 });
  ai.mateT = 0;
  partner.ai.mateT = 0;
  api.emit(female, 'heart', 1.1);
}

export const mateModule = defineBehaviorModule({
  id: 'mate',
  label: 'Courtship and mating',
  states: ['seekMate', 'mate'],
  activeStates: ['mate'],
  defaults: { enabled: true, params: {} },
  opportunities: [{
    id: 'mate.seek',
    order: 80,
    canRun: (ctx) => !!ctx.actor && ctx.actor.stage === 'adult' && ctx.actor.mateCooldown <= 0,
    enter: (ctx) => {
      const chance = ctx.p.mate.chance;
      if (chance < 1 && ctx.rng() >= chance) return false;
      return !!acquireMate(ctx);
    },
  }],
  canMatePair,
  acquireMate,
  startSeekMate,
  startMatePair,
  think(ctx) {
    if (!ctx.ai || ctx.ai.state !== 'seekMate') return false;
    thinkSeekMate(ctx);
    return true;
  },
  tick(ctx) {
    const { ai, dt } = ctx;
    if (!ai || ai.state !== 'mate') return false;
    ai.animT += dt;
    ai.mateT -= dt;
    if (ai.mateT <= 0) finishMatePair(ctx);
    return true;
  },
  isTraveling: (ctx) => !!(ctx.ai && ctx.ai.state === 'seekMate'),
});
