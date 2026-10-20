// Rest behavior: home travel, night sleep and Glass daytime shelter.
//
// Owns seekHome/sleep. The night/day-shelter policies, door transitions and
// adapter sleep/wake hand-off are copied from the legacy engine; the engine's
// rest gate calls needsRest before directives, as before.

import { defineBehaviorModule } from './module.js';

function needsRest(ctx) {
  const { actor, ai, p, api } = ctx;
  if (p.rest.mode !== 'night') return false;
  if (ai && ai.restCooldown > 0) return false;
  if (!api.homeFor(actor)) return false;
  if (actor.health < p.thresholds.healthWoozy) return true;
  if (actor.hunger >= p.thresholds.criticalHunger || actor.thirst >= p.thresholds.criticalThirst) return false;
  return api.isNightFor(actor) || actor.health < p.thresholds.healthHurt ||
    actor.energy < p.thresholds.energyTired;
}

function startSeekHome(ctx, restKind = null) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return false;
  api.cancelPair(actor);
  api.releaseFood(actor);
  ai.source = null;
  ai.waterSpot = null;
  ai.follow = null;
  ai.target = null;
  ai.faceYaw = null;
  ai.state = 'seekHome';
  ai.restKind = restKind || (p.rest.mode === 'night' ? 'night' : 'shelter');
  ai.idleT = 0;
  api.stop(actor);
  return true;
}

function startSleep(ctx, home, restKind = 'night') {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || !home) return false;
  ai.directiveHome = false;
  ai.state = 'sleep';
  ai.restKind = restKind;
  ai.sleepHome = home.name;
  api.stop(actor);
  api.face(actor, home.door.x, home.door.z);
  actor.sleeping = true;
  api.adapterOnSleep(actor, home, restKind);
  api.noteDoorTransition(actor, 'enter');
  return true;
}

function wake(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai) return;
  actor.sleeping = false;
  actor.needsBuild = true;
  ai.state = 'wander';
  ai.restKind = null;
  ai.sleepHome = null;
  ai.idleT = .5;
  ai.taskCooldown = .8;
  ai.nextThink = 0;
  api.adapterOnWake(actor);
  api.noteDoorTransition(actor, 'exit');
}

function thinkSeekHome(ctx) {
  const { actor, ai, p, api } = ctx;
  if (!actor || !ai) return;
  const home = api.homeFor(actor);
  if (!home) {
    ai.state = 'wander';
    ai.idleT = .8;
    return;
  }
  if (!needsRest(ctx) && !ai.directiveHome && ai.restKind !== 'shelter') {
    ai.state = 'wander';
    ai.idleT = .5;
    return;
  }
  const d = Math.hypot(home.door.x - actor.cx, home.door.z - actor.cz);
  if (d <= p.rest.homeDist) {
    startSleep(ctx, home, ai.restKind || 'night');
    return;
  }
  if (api.needsReplan(ai)) {
    if (!api.setDestination(actor, home.door.x, home.door.z)) {
      ai.state = 'wander';
      ai.idleT = .8;
    }
  }
}

function dayShelterCheck(ctx) {
  const { actor, ai, p, api, rng } = ctx;
  if (p.rest.mode !== 'dayShelter' || !ai) return false;
  const hours = api.hoursNow();
  if (!api.isDayFor(actor) || hours < p.rest.start || hours >= p.rest.end) return false;
  if (actor.shelteredToday || !actor.home || actor.shelterCheckT > 0) return false;
  actor.shelterCheckT = 24 + rng() * 24;
  if (rng() < p.rest.chance) {
    return startSeekHome(ctx, 'shelter');
  }
  return false;
}

export const restModule = defineBehaviorModule({
  id: 'rest',
  label: 'Home and sleep',
  states: ['seekHome', 'sleep'],
  activeStates: ['sleep'],
  defaults: { enabled: true, params: {} },
  needsRest,
  sleepDone: (ctx) => ctx.api.adapterSleepDone(ctx.actor),
  wake,
  startSeekHome,
  startSleep,
  dayShelterCheck,
  think: thinkSeekHome,
  isTraveling: (ctx) => !!(ctx.ai && ctx.ai.state === 'seekHome'),
  interrupt(ctx, reason) {
    const { actor, ai, api } = ctx;
    if (!ai || (ai.state !== 'seekHome' && ai.state !== 'sleep')) return;
    if (ai.state === 'sleep') wake(ctx);
    api.releaseFood(actor);
    ai.target = null;
    ai.restKind = null;
    ai.state = 'wander';
    ai.idleT = reason === 'grab' ? .4 : .6;
  },
  debugEnter(ctx) {
    startSeekHome(ctx);
    return { ok: true, state: ctx.ai.state, note: 'heading home' };
  },
});
