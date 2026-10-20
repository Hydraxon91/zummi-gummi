// Stars farewell state machine (modules-only, off by default).
//
// Fading is runtime-only actor state. It never changes the health floor (1),
// never writes a save field, and never draws RNG. The app owns visuals and the
// actual actor removal; this module only decides when a farewell is eligible
// and when a survivor should be released.

import { STAGE_AGE } from '../life.js';

export const STAR_DEFAULTS = Object.freeze({
  oldAgeMinDays: 15,
  oldAgeMaxDays: 25,
  starvationSeconds: 120,
  fadeSeconds: 30,
  stingSeconds: 5,
  minimumFadeSeconds: 10,
  retryDays: 1,
  reprieveDays: 1,
  minimumPopulation: 6,
});

const FINITE = value => Number.isFinite(value);

function hash32(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function lifespanDays(uid, species = 'bear', {
  min = STAR_DEFAULTS.oldAgeMinDays,
  max = STAR_DEFAULTS.oldAgeMaxDays,
} = {}) {
  const key = `${species || 'bear'}|${Number.isFinite(Number(uid)) ? Number(uid) : 0}|stars`;
  const unit = hash32(key) / 4294967296;
  return +(min + unit * (max - min)).toFixed(4);
}

export function oldAgeThreshold(uid, species, daySeconds, options = {}) {
  const seconds = FINITE(daySeconds) && daySeconds > 0 ? daySeconds : STAR_DEFAULTS.fadeSeconds;
  return STAGE_AGE.adult + lifespanDays(uid, species, options) * seconds;
}

export function starFeature(features, reason) {
  if (!features || !features.farewells) return false;
  if (reason === 'oldAge') return !!features.starsOldAge;
  if (reason === 'starvation') return !!features.starsStarvation;
  if (reason === 'sting') return !!features.starsStings;
  return false;
}

export function createStars({
  features,
  getActors = () => [],
  getDay = () => 0,
  getCeiling = () => 40,
  daySeconds = 600,
  onFarewell = null,
  onBlocked = null,
} = {}) {
  const defaults = STAR_DEFAULTS;
  let blockedCount = 0;
  let farewellCount = 0;

  function activeActors() {
    return (getActors() || []).filter(actor => actor && actor.active !== false);
  }

  function cancel(actor) {
    if (!actor) return false;
    if (!actor.fading && actor.starveT === undefined &&
      actor.starsRetryDay === undefined && actor.starsAgeReprieveUntil === undefined) return false;
    delete actor.fading;
    delete actor.starveT;
    delete actor.starsRetryDay;
    delete actor.starsAgeReprieveUntil;
    return true;
  }

  function cancelAll() {
    for (const actor of activeActors()) cancel(actor);
  }

  function householdBlocked(actor) {
    if (!actor || actor.stage !== 'adult') return false;
    const children = activeActors().filter(other =>
      other !== actor && other.stage === 'baby' &&
      ((other.parentUids || []).includes(actor.uid) || other.fatherUid === actor.uid) &&
      other.home === actor.home);
    if (!children.length) return false;
    const otherAdult = activeActors().some(other =>
      other !== actor && other.stage === 'adult' && other.home === actor.home);
    return !otherAdult;
  }

  function blockReason(actor) {
    if (!actor) return 'missing';
    if (actor.stay) return 'stay';
    if (actor.pregnant) return 'pregnant';
    if (householdBlocked(actor)) return 'baby';
    const actors = activeActors();
    const floor = Math.min(defaults.minimumPopulation, Math.max(1, getCeiling() | 0));
    if (actors.length - 1 < floor) return 'population';
    const sameSpecies = actors.filter(other => other.species === actor.species).length;
    if (sameSpecies <= 1) return 'lastSpecies';
    if (!FINITE(actor.age) || actor.stage !== 'adult') return 'notAdult';
    return null;
  }

  function block(actor, reason) {
    const day = getDay();
    cancel(actor);
    actor.starsRetryDay = day + defaults.retryDays;
    blockedCount++;
    if (typeof onBlocked === 'function') onBlocked(actor, reason);
    return false;
  }

  function start(actor, reason) {
    actor.fading = {
      cause: 'stars',
      reason,
      remaining: defaults.fadeSeconds,
      startedDay: getDay(),
      committed: false,
    };
    return true;
  }

  function oldAgeReady(actor, day) {
    if (actor.stage !== 'adult') return false;
    if (FINITE(actor.starsAgeReprieveUntil) && day < actor.starsAgeReprieveUntil) return false;
    return FINITE(actor.age) &&
      actor.age >= oldAgeThreshold(actor.uid, actor.species, daySeconds);
  }

  function update(actor, dt) {
    if (!actor || actor.active === false) return false;
    if (!features.farewells) {
      cancel(actor);
      return false;
    }
    if (actor.fading?.committed) return false;
    if (actor.fading && !starFeature(features, actor.fading.reason)) {
      cancel(actor);
      return false;
    }
    if (actor.stay) {
      if (actor.fading) cancel(actor);
      return false;
    }

    const day = getDay();
    if (FINITE(actor.starsRetryDay) && day < actor.starsRetryDay) return false;
    if (FINITE(actor.starsRetryDay) && day >= actor.starsRetryDay) delete actor.starsRetryDay;

    // Starvation accumulates only at the unchanged health floor.
    if (features.starsStarvation && actor.hunger >= .95 && actor.health <= 1.0001) {
      actor.starveT = (FINITE(actor.starveT) ? actor.starveT : 0) + dt;
    } else if (actor.starveT !== undefined) {
      actor.starveT = 0;
    }

    if (!actor.fading) {
      if (blockReason(actor)) return false;
      let reason = null;
      if (features.starsOldAge && oldAgeReady(actor, day)) reason = 'oldAge';
      else if (features.starsStarvation && actor.starveT >= defaults.starvationSeconds) reason = 'starvation';
      if (!reason) return false;
      return start(actor, reason);
    }

    actor.fading.remaining = Math.max(0, actor.fading.remaining - dt);
    if (actor.fading.remaining > 0) return true;

    const blocked = blockReason(actor);
    if (blocked) return block(actor, blocked);

    actor.fading.committed = true;
    farewellCount++;
    if (typeof onFarewell === 'function') {
      onFarewell(actor, {
        cause: 'stars',
        reason: actor.fading.reason,
        remaining: actor.fading.remaining,
      });
    }
    return true;
  }

  function onRescue(actor, kind = 'food') {
    if (!actor || !actor.fading || actor.fading.committed) return false;
    const reason = actor.fading.reason;
    cancel(actor);
    if (reason === 'oldAge') {
      actor.starsAgeReprieveUntil = getDay() + defaults.reprieveDays;
    }
    if (reason === 'starvation') actor.starveT = 0;
    return true;
  }

  function onSting(actor) {
    if (!actor || !features.farewells || !features.starsStings) return false;
    if (!actor.fading || actor.fading.committed) return false;
    if (!FINITE(actor.health) || actor.health > 1.0001) return false;
    actor.fading.reason = 'sting';
    actor.fading.remaining = Math.max(
      defaults.minimumFadeSeconds,
      actor.fading.remaining - defaults.stingSeconds,
    );
    return true;
  }

  function state(actor) {
    if (!actor) return null;
    return {
      fading: !!actor.fading,
      committed: !!actor.fading?.committed,
      reason: actor.fading?.reason || null,
      remaining: actor.fading ? +actor.fading.remaining.toFixed(3) : null,
      starvingFor: FINITE(actor.starveT) ? +actor.starveT.toFixed(3) : 0,
      retryDay: FINITE(actor.starsRetryDay) ? actor.starsRetryDay : null,
      reprieveUntil: FINITE(actor.starsAgeReprieveUntil) ? actor.starsAgeReprieveUntil : null,
      stay: !!actor.stay,
    };
  }

  function stats() {
    return { farewells: farewellCount, blocked: blockedCount };
  }

  return {
    update, onRescue, onSting, cancel, cancelAll, state, stats,
    blockReason, oldAgeReady, lifespanDays,
    setEnabled(value) {
      if (!value) cancelAll();
      return !!value;
    },
  };
}
