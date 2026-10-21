// Modular life/behavior engine (step 3).
//
// This is the new engine behind the `engine: 'modules'` flag. It keeps the
// legacy frame order and actor-field contract while extracting behaviors into
// modules under src/behaviors/. During step 3 only the hive behavior is a real
// module; the remaining regions are marked TEMPORARY(port) and move out one at
// a time in step 4. The legacy engine in src/behavior.js is the parity oracle.
//
// The engine works on actor fields (cx/cz, hunger, bonds, ...) and never on
// Box3D bodies or three.js objects.

import { PREGNANCY_HUNGER, HOME_CAPACITY } from '../life.js';
import {
  addBond, pairBond, skillsFor, pushHistory,
} from '../family.js';
import {
  cancelTask,
  beginPair, endPair, breakPair as breakSharedPair,
} from '../interactions.js';
import { createBehaviorConfig } from './config.js';
import { hiveModule } from './hive.js';
import { restModule } from './rest.js';
import { forageModule } from './forage.js';
import { waterModule } from './water.js';
import { wanderModule } from './wander.js';
import { socialModule } from './social.js';
import { mateModule } from './mate.js';
import { conflictModule } from './conflict.js';
import { followModule } from './follow.js';
import { stargazeModule } from './stargaze.js';
import { familyTaskModule } from './family.js';
import { fleeModule } from './flee.js';
import { giftingModule } from './gifting.js';
import { pairActivitiesModule } from './affection.js';
import { relationshipsModule } from './relationships.js';
import { groupActivitiesModule } from './groups.js';
import {
  clearPartnership, clearPartnershipUid, clearRivalUid, normalizePartnerUid,
} from '../relationships.js';
import { planReason } from './reason.js';
import { ensureTraits } from './traits.js';
import { moodFor, moodLabel, MOOD_BUCKET, MOOD_TAU, MOOD_UPDATE_INTERVAL } from './mood.js';
import { addMourning, pruneMourning, mourningLabel } from './mourning.js';
import {
  ADOPTION_DEFAULTS, adoptionStatus, guardianCandidate,
} from './adoption.js';
import { createStars } from './stars.js';

const STUCK_DIST2 = .04;

// New interaction states opt in to module-owned cancellation. Legacy states keep
// their existing generic cancelPair path so disabled features remain inert.
const MODULE_CANCELLABLE = new Set([
  'seekGift', 'gift', 'seekChat', 'chat', 'seekCuddle', 'cuddle',
  'seekReconcile', 'reconcile', 'seekPartner', 'partnering', 'group',
]);

function finite(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return n < lo ? lo : (n > hi ? hi : n);
}

export function createBehaviorModules({
  field,
  getActors,
  getHours,
  getDay,
  getPopulationCap,
  getAdapter,
  getKnownActorUids = null,
  getMapId = null,
  rng = Math.random,
  daySeconds = 600,
  onFarewell = null,
  onStarsBlocked = null,
  config: givenConfig = null,
} = {}) {
  const config = givenConfig || createBehaviorConfig();
  const features = config.features;
  const stars = createStars({
    features,
    getActors,
    getDay,
    getCeiling: getPopulationCap,
    daySeconds,
    onFarewell,
    onBlocked: onStarsBlocked,
  });
  const modules = new Map();
  const opportunities = [];
  const activeStates = new Set();
  let configVersion = 0;

  function registerModule(mod) {
    if (!mod || !mod.id) throw new Error('behavior module id required');
    if (modules.has(mod.id)) throw new Error(`behavior module already registered: ${mod.id}`);
    modules.set(mod.id, mod);
    for (const state of mod.activeStates || []) activeStates.add(state);
    for (const opportunity of mod.opportunities || []) {
      if (!Number.isFinite(opportunity.order)) {
        throw new Error(`behavior opportunity ${opportunity.id} needs an order`);
      }
      opportunities.push({ module: mod, ...opportunity });
    }
    opportunities.sort((a, b) => a.order - b.order);
    return mod;
  }

  function moduleStateOwner(state) {
    for (const mod of modules.values()) {
      if (Array.isArray(mod.states) && mod.states.includes(state)) return mod;
    }
    return null;
  }

  // Coverage is diagnostic only: per-state ticks/entries and per-opportunity
  // selections. The parity harness reads it to find rarely exercised branches.
  function noteCoverage(actor) {
    if (!actor || !actor.ai) return;
    const state = actor.ai.state || '(none)';
    coverage.states.set(state, (coverage.states.get(state) || 0) + 1);
    if (lastCoverState.get(actor) !== state) {
      lastCoverState.set(actor, state);
      coverage.entries.set(state, (coverage.entries.get(state) || 0) + 1);
    }
    const task = actor.ai.familyTask;
    if (state === 'familyTask' && task) {
      coverage.taskPhases.set(task.phase, (coverage.taskPhases.get(task.phase) || 0) + 1);
      coverage.tasks.set(task.id, (coverage.tasks.get(task.id) || 0) + 1);
      if (lastCoverTask.get(actor) !== task.id) {
        lastCoverTask.set(actor, task.id);
        coverage.taskEntries.set(task.id, (coverage.taskEntries.get(task.id) || 0) + 1);
      }
    } else {
      lastCoverTask.delete(actor);
    }
  }

  function coverSlot(id) {
    if (!id) return;
    coverage.pipeline.set(id, (coverage.pipeline.get(id) || 0) + 1);
  }

  function coverConflictOutcome(id) {
    if (!id) return;
    coverage.conflictOutcomes.set(id, (coverage.conflictOutcomes.get(id) || 0) + 1);
  }

  function coverHour(kind, hour) {
    const key = `${kind}:${Math.max(0, Math.min(23, Math.floor(hour)))}`;
    coverage.stargazeHours.set(key, (coverage.stargazeHours.get(key) || 0) + 1);
  }

  function coverFlee(id) {
    if (!id) return;
    coverage.fleeOutcomes.set(id, (coverage.fleeOutcomes.get(id) || 0) + 1);
  }

  function coverageSnapshot() {
    const map = (source) => Object.fromEntries([...source.entries()].sort(([a], [b]) => a.localeCompare(b)));
    return {
      states: map(coverage.states),
      entries: map(coverage.entries),
      opportunities: map(coverage.opportunities),
      taskPhases: map(coverage.taskPhases),
      tasks: map(coverage.tasks),
      taskEntries: map(coverage.taskEntries),
      pipeline: map(coverage.pipeline),
      conflictOutcomes: map(coverage.conflictOutcomes),
      stargazeHours: map(coverage.stargazeHours),
      fleeOutcomes: map(coverage.fleeOutcomes),
    };
  }

  const contextFor = (actor, extra = {}) => {
    const ai = actor && actor.ai;
    return {
      actor, ai,
      p: actor ? config.forActor(actor) : null,
      rng,
      api,
      field,
      config,
      features,
      mapId: mapIdNow(),
      ...extra,
    };
  };

  // First-match pipeline. `canRun` must not draw RNG; only the winning `enter`
  // runs, which keeps the legacy random sequence unchanged.
  function runOpportunities(actor) {
    const ctx = contextFor(actor);
    for (const opportunity of opportunities) {
      if (!opportunity.canRun || !opportunity.canRun(ctx)) continue;
      if (opportunity.enter(ctx)) {
        coverage.opportunities.set(opportunity.id,
          (coverage.opportunities.get(opportunity.id) || 0) + 1);
        return opportunity;
      }
    }
    return null;
  }

  // Named slot for places where the legacy cascade has a fixed position.
  function runOpportunity(actor, id) {
    const opportunity = opportunities.find(item => item.id === id);
    if (!opportunity) return null;
    const ctx = contextFor(actor);
    if (opportunity.canRun && !opportunity.canRun(ctx)) return null;
    if (!opportunity.enter(ctx)) return null;
    coverage.opportunities.set(opportunity.id,
      (coverage.opportunities.get(opportunity.id) || 0) + 1);
    return opportunity;
  }

  const actors = () => {
    const list = typeof getActors === 'function' ? getActors() : getActors;
    return Array.isArray(list) ? list : [];
  };
  const adapters = new Map();
  function registerAdapter(kind, adapter) {
    if (kind && adapter) adapters.set(kind, adapter);
    return adapter;
  }
  const adapterOf = (actor) => {
    const kind = actor && actor.kind === 'glass' ? 'skinned' : 'softbody';
    const registered = adapters.get(kind);
    if (registered) return registered;
    return typeof getAdapter === 'function' ? getAdapter(actor) : null;
  };
  function adapterSleepDone(actor) {
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.sleepDone === 'function') {
      return adapter.sleepDone(actor, {
        hours: hoursNow(), day: dayNow(), isDay: isDayFor(actor), isNight: isNightFor(actor),
      });
    }
    const p = profile(actor);
    return !isNightFor(actor) && actor.health >= p.thresholds.healthHurt &&
      actor.energy >= p.thresholds.energyTired;
  }
  function adapterOnSleep(actor, home, restKind) {
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.onSleep === 'function') adapter.onSleep(actor, home, restKind);
  }
  function adapterOnWake(actor) {
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.onWake === 'function') adapter.onWake(actor);
  }
  function adapterHungerOpportunity(actor, ...args) {
    const adapter = adapterOf(actor);
    return !!(adapter && typeof adapter.hungerOpportunity === 'function' &&
      adapter.hungerOpportunity(actor, api, ...args));
  }
  const hoursNow = () => {
    const h = Number(typeof getHours === 'function' ? getHours() : getHours);
    return Number.isFinite(h) ? h : 12;
  };
  const dayNow = () => {
    const d = Number(typeof getDay === 'function' ? getDay() : getDay);
    return Number.isFinite(d) ? Math.max(0, Math.floor(d)) : 0;
  };
  const mapIdNow = () => {
    const id = typeof getMapId === 'function' ? getMapId() : getMapId;
    return id === 'studio' ? 'studio' : 'field';
  };
  const populationCap = () => Math.max(1, Number(typeof getPopulationCap === 'function'
    ? getPopulationCap() : getPopulationCap) || 40);
  const stats = { ticks: 0, ms: 0 };
  let adoptionAssignments = 0;
  const coverage = {
    states: new Map(), entries: new Map(), opportunities: new Map(),
    taskPhases: new Map(), tasks: new Map(), taskEntries: new Map(),
    pipeline: new Map(), conflictOutcomes: new Map(), stargazeHours: new Map(), fleeOutcomes: new Map(),
  };
  const lastCoverState = new WeakMap();
  const lastCoverTask = new WeakMap();
  let enabled = true;

  function profile(actor) {
    return config.forActor(actor);
  }

  function isDayFor(actor) {
    const p = profile(actor);
    const h = hoursNow();
    if (p.rest.mode === 'night') return !isNightFor(actor);
    if (features.singleDayWindow) {
      const w = p.dayWindow || { start: 8, end: 18 };
      return h >= finite(w.start, 8) && h < finite(w.end, 18);
    }
    const start = finite(p.rest.start, 8);
    const end = finite(p.rest.end, 18);
    return h >= start && h < end;
  }

  function isNightFor(actor) {
    const p = profile(actor);
    const h = hoursNow();
    if (p.rest.mode === 'night') {
      const bed = finite(actor && actor.bedtime, p.rest.nightStart);
      const wake = finite(actor && actor.wakeTime, p.rest.nightEnd);
      return h >= bed || h < wake;
    }
    return !isDayFor(actor);
  }

  /* ------------------------------------------------------------- lifecycle */

  function attach(actor) {
    if (!actor) return null;
    if (actor.ai) return actor.ai;
    if (features.personality && ensureTraits(actor)) config.invalidateActor(actor);
    const p = profile(actor);
    actor.hunger = finite(actor.hunger, .30);
    actor.thirst = finite(actor.thirst, .30);
    actor.energy = clamp(finite(actor.energy, 1), 0, 1);
    actor.bold = clamp(finite(actor.bold, .5), 0, 1);
    actor.social = clamp(finite(actor.social, .3), 0, 1);
    actor.affection = clamp(finite(actor.affection, .25), 0, 1);
    const bedtimeBase = features.glassBedtimeMode && p.rest.mode === 'dayShelter'
      ? finite(p.rest.start, 9) : (p.rest.nightStart || 20);
    const wakeBase = features.glassBedtimeMode && p.rest.mode === 'dayShelter'
      ? finite(p.rest.end, 16) : (p.rest.nightEnd || 6);
    actor.bedtime = clamp(finite(actor.bedtime,
      bedtimeBase + rng() * 2.5), 0, 23.99);
    actor.wakeTime = clamp(finite(actor.wakeTime,
      wakeBase - 1 + rng() * 2), 0, 23.99);
    if (!actor.bonds || typeof actor.bonds !== 'object') actor.bonds = {};
    if (!actor.skills || typeof actor.skills !== 'object') actor.skills = {};
    if (!actor.playdates || typeof actor.playdates !== 'object') actor.playdates = {};
    if (actor.stage === 'adult' && Object.values(actor.skills).every(value => !value)) {
      actor.skills = {
        forage: .20 + rng() * .35,
        courage: .15 + clamp(finite(actor.bold, .5), 0, 1) * .35,
        social: .20 + rng() * .35,
      };
    }
    actor.shelteredToday = !!actor.shelteredToday;
    actor.shelterCheckT = finite(actor.shelterCheckT, 0);
    actor.sleeping = !!actor.sleeping;
    actor.ai = {
      state: actor.sleeping ? 'sleep' : 'wander',
      nextThink: rng() * .20,
      target: null,
      source: null,
      waterSpot: null,
      path: null,
      pathIndex: 0,
      moving: false,
      arrived: false,
      idleT: 0,
      interrupted: false,
      faceYaw: null,
      eatT: 0,
      drinkT: 0,
      animT: 0,
      taskCooldown: 0,
      raidT: 0,
      fleeT: 0,
      fleeFrom: null,
      stungT: 0,
      sleepHome: null,
      restKind: null,
      insideT: 0,
      partner: null,
      inviteT: 0,
      inviteAccepted: false,
      socialT: 0,
      socialCooldown: 0,
      familyPlay: false,
      playmateKind: null,
      familyPlayCooldown: 0,
      chatCooldown: 0,
      cuddleCooldown: 0,
      groupCooldown: 0,
      reconcileCooldown: 0,
      activityRole: null,
      activityT: 0,
      group: null,
      groupSlot: null,
      groupRole: null,
      heartT: 0,
      declineT: 0,
      conflictT: 0,
      conflictCooldown: 0,
      conflictSource: null,
      contestBear: null,
      contestSource: null,
      visitHome: null,
      visitRole: null,
      visitPhase: null,
      visitT: 0,
      visitArrived: false,
      visitRetryT: 0,
      follow: null,
      followRetryT: 0,
      mateT: 0,
      shove: null,
      lastX: actor.cx,
      lastZ: actor.cz,
      stuckT: 0,
      progressX: actor.cx,
      progressZ: actor.cz,
      progressTargetX: null,
      progressTargetZ: null,
      progressDist: Infinity,
      progressPathIndex: 0,
      noProgressT: 0,
      recoveries: 0,
      lastStuck: null,
      avoidSourceId: null,
      avoidSourceT: 0,
      restCooldown: 0,
      clock: 0,
      doorEntries: 0,
      doorExits: 0,
      doorFirstAt: 0,
      doorWarned: false,
      directives: [],
      directive: null,
      directiveStatus: null,
      directiveHome: false,
      possessed: false,
      familyTask: null,
      playdate: false,
      playdateHome: null,
      playdateTarget: null,
      lastMealWindow: null,
      shelter: false,
      waitForPartner: false,
      hopState: null,
      hopWait: 0,
      turnWait: 0,
      rippleT: 0,
    };
    if (features.mood) {
      actor.ai.mood = 0;
      actor.ai.moodBucket = 0;
      actor.ai.moodClock = 0;
      actor.ai.moodAt = 0;
    }
    if (features.gifting) {
      actor.ai.giftRetryT = 0;
      actor.ai.giftRole = null;
      actor.ai.giftT = 0;
    }
    if (actor._directiveSave) {
      const saved = actor._directiveSave;
      const clean = (d) => (d && Number.isFinite(d.ttl) ? { ...d } : null);
      if (saved.active) actor.ai.directive = clean(saved.active);
      if (Array.isArray(saved.queue)) actor.ai.directives = saved.queue.map(clean).filter(Boolean);
      delete actor._directiveSave;
    }
    if (!actor.home) assignHome(actor);
    return actor.ai;
  }

  function homeResidents(name) {
    if (!name) return 0;
    let n = 0;
    for (const actor of actors()) if (actor.active && actor.home === name) n++;
    return n;
  }

  function parentFor(actor) {
    if (!actor || !actor.parentUids || !actor.parentUids.length) return null;
    for (const uid of actor.parentUids) {
      const parent = actors().find(other => other.active && other.uid === uid);
      if (parent) return parent;
    }
    return null;
  }

  function gameActorUids() {
    if (typeof getKnownActorUids !== 'function') return null;
    return getKnownActorUids();
  }

  function followTargetFor(actor) {
    if (!actor) return null;
    const parent = parentFor(actor);
    if (parent || !features.adoption) return parent;
    if (!Number.isFinite(actor.guardianUid)) return null;
    return actors().find(other => other && other.active && other.uid === actor.guardianUid &&
      other.stage === 'adult' && other.species === actor.species) || null;
  }

  function dropGuardian(actor, guardianUid) {
    delete actor.guardianUid;
    const ai = actor.ai;
    actor.ai.followRetryT = 0;
    if (ai.follow && ai.follow.uid === guardianUid) {
      ai.follow = null;
      if (ai.state === 'follow') {
        ai.state = 'wander';
        ai.idleT = .5;
        ai.nextThink = 0;
        ai.moving = false;
        ai.path = null;
        ai.target = null;
        stop(actor);
      }
    }
  }

  // Runs on the child's next think. Guardians are assigned only while the child
  // is free of a pair/task; an existing guardian is cleared when a parent is
  // active again or the guardian is no longer a valid same-species adult.
  function reconcileAdoption(actor) {
    if (!features.adoption || !actor || !actor.ai) return false;
    let changed = false;
    if (actor.stage !== 'baby') {
      if (actor.guardianUid !== undefined) {
        delete actor.guardianUid;
        changed = true;
      }
      actor.ai.adoptionRetryAt = 0;
      return changed;
    }

    const list = actors();
    // An active parent settles the question without scanning other maps.
    const knownUids = parentFor(actor) ? null : gameActorUids();
    const status = adoptionStatus(actor, list, { knownUids });
    if (actor.guardianUid !== undefined) {
      const guardian = list.find(other => other && other.active &&
        other.uid === actor.guardianUid && other.stage === 'adult' &&
        other.species === actor.species);
      if (status.activeParent || !guardian) {
        dropGuardian(actor, actor.guardianUid);
        changed = true;
      }
    }
    if (actor.guardianUid !== undefined) return changed;
    if (status.activeParent || status.parentElsewhere || status.rosterUnknown) {
      actor.ai.adoptionRetryAt = 0;
      return changed;
    }

    const now = dayNow() * 24 + hoursNow();
    if (Number.isFinite(actor.ai.adoptionRetryAt) && actor.ai.adoptionRetryAt > now) {
      return changed;
    }
    if (actor.ai.partner || actor.ai.familyTask) return changed;

    const guardian = guardianCandidate(actor, list, { knownUids });
    if (guardian) {
      actor.guardianUid = guardian.uid;
      actor.ai.adoptionRetryAt = 0;
      actor.ai.followRetryT = 0;
      adoptionAssignments++;
      changed = true;
    } else {
      actor.ai.adoptionRetryAt = now + ADOPTION_DEFAULTS.retryHours;
    }
    return changed;
  }

  function adoptionInfo(actor) {
    if (!actor) return null;
    const list = actors();
    const status = adoptionStatus(actor, list, { knownUids: gameActorUids() });
    const target = followTargetFor(actor);
    const guardian = Number.isFinite(actor.guardianUid)
      ? list.find(other => other && other.active && other.uid === actor.guardianUid) : null;
    return {
      enabled: !!features.adoption,
      stage: actor.stage || null,
      guardianUid: Number.isFinite(actor.guardianUid) ? actor.guardianUid : null,
      guardian: guardian ? guardian.uid : null,
      parent: status.activeParent ? status.activeParent.uid : null,
      parentElsewhere: !!status.parentElsewhere,
      rosterUnknown: !!status.rosterUnknown,
      orphan: !!status.orphan,
      retryAt: actor.ai && Number.isFinite(actor.ai.adoptionRetryAt) && actor.ai.adoptionRetryAt > 0
        ? actor.ai.adoptionRetryAt : null,
      target: target ? target.uid : null,
    };
  }

  function assignHome(actor) {
    if (!actor || !field || !Array.isArray(field.homes) || !field.homes.length) return null;
    if (actor.home) {
      const existing = field.homes.find(h => h.name === actor.home);
      if (existing && homeResidents(actor.home) < HOME_CAPACITY) return existing;
    }
    const parent = parentFor(actor);
    if (parent && parent.home) {
      const preferred = field.homes.find(h => h.name === parent.home);
      if (preferred && homeResidents(preferred.name) < HOME_CAPACITY) {
        actor.home = preferred.name;
        return preferred;
      }
    }
    let best = null;
    let bestCount = Infinity;
    for (const home of field.homes) {
      const n = homeResidents(home.name);
      if (n < bestCount) { best = home; bestCount = n; }
    }
    if (!best) return null;
    actor.home = best.name;
    return best;
  }

  function homeFor(actor) {
    if (!actor || !field || !Array.isArray(field.homes) || !field.homes.length) return null;
    return field.homes.find(h => h.name === actor.home) || assignHome(actor);
  }

  /* --------------------------------------------------------------- movement */

  function pathTo(actor, x, z) {
    if (!field || !field.nav) return null;
    return field.nav.findPath(actor.cx, actor.cz, x, z);
  }

  function setPath(actor, path) {
    if (!actor || !actor.ai) return false;
    actor.ai.path = path && path.length ? path : null;
    actor.ai.pathIndex = 0;
    actor.ai.moving = !!actor.ai.path;
    actor.ai.arrived = false;
    actor.ai.lastX = actor.cx;
    actor.ai.lastZ = actor.cz;
    actor.ai.stuckT = 0;
    return actor.ai.moving;
  }

  function clearPath(actor) {
    if (!actor || !actor.ai) return;
    actor.ai.path = null;
    actor.ai.pathIndex = 0;
    actor.ai.moving = false;
    actor.ai.arrived = false;
  }

  function stop(actor) {
    clearPath(actor);
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.onStop === 'function') adapter.onStop(actor);
  }

  function setDestination(actor, x, z) {
    if (!actor || !actor.ai) return false;
    const near = field && field.nav ? field.nav.nearestWalkable(x, z) : { x, z };
    const tx = near ? near.x : x;
    const tz = near ? near.z : z;
    actor.ai.target = { x: tx, z: tz };
    actor.ai.faceYaw = Math.atan2(tx - actor.cx, tz - actor.cz);
    const path = pathTo(actor, tx, tz);
    if (!path && Math.hypot(tx - actor.cx, tz - actor.cz) > 1.25) return false;
    return setPath(actor, path || [{ x: tx, z: tz }]);
  }

  // A path can be present but already exhausted, or an approach can have been
  // stopped by a failed hop. In both cases the next think must replan instead
  // of leaving the actor parked forever in a seek state.
  function needsReplan(ai) {
    return !!ai && (!ai.moving || !ai.path || !ai.path.length);
  }

  function face(actor, x, z) {
    if (!actor || !actor.ai) return;
    actor.ai.faceYaw = Math.atan2(x - actor.cx, z - actor.cz);
  }

  function emit(actor, kind, dy = 1.0) {
    if (!field || typeof field.emote !== 'function' || !actor) return;
    field.emote(actor.cx, finite(actor.cy, 0) + dy, actor.cz, kind);
  }

  function releaseFood(actor) {
    if (!actor || !actor.ai) return;
    if (field && field.food && actor.ai.source) field.food.release(actor.ai.source, actor);
    actor.ai.source = null;
  }

  function cancelPair(actor) {
    if (!actor || !actor.ai) return;
    if (MODULE_CANCELLABLE.has(actor.ai.state)) {
      const owner = moduleStateOwner(actor.ai.state);
      if (owner && typeof owner.interrupt === 'function') {
        owner.interrupt(contextFor(actor, { reason: 'cancel' }), 'cancel');
      }
    }
    const partner = actor.ai.partner;
    releaseFood(actor);
    if (partner) releaseFood(partner);
    breakSharedPair(actor, { stop });
    const pairState = ['social', 'invite', 'decline', 'visit', 'seekCompany', 'seekMate', 'mate', 'familyTask', 'conflict', 'seekGift', 'gift',
      'seekChat', 'chat', 'seekCuddle', 'cuddle', 'seekReconcile', 'reconcile',
      'seekPartner', 'partnering', 'group'].includes(actor.ai.state);
    const seekState = features.cancelPairStateReset &&
      ['seekFood', 'seekHive', 'seekWater', 'seekHome', 'seekConflict'].includes(actor.ai.state);
    if (pairState || seekState) {
      actor.ai.state = 'wander';
      actor.ai.idleT = .4;
      actor.ai.taskCooldown = .6;
    }
  }

  /* ------------------------------------------------------------- utilities */

  function safeFoodCount() {
    return field && field.food && field.food.allRipe
      ? field.food.allRipe({ safe: true }).length : 0;
  }

  function acquireFood(actor) {
    return forageModule.acquire(contextFor(actor));
  }

  function acquireWater(actor) {
    return waterModule.acquire(contextFor(actor));
  }

  /* ------------------------------------------------------------ hive/conflict */

  function acquireHive(actor) {
    return hiveModule.acquire(contextFor(actor));
  }

  function thinkSeekHive(actor) {
    return hiveModule.think(contextFor(actor));
  }

  function startFlee(actor, source) {
    return fleeModule.startFlee(contextFor(actor), source);
  }

  function acquireContest(actor) {
    return conflictModule.acquireContest(contextFor(actor));
  }

  function startConflict(actor, other, source) {
    return conflictModule.startConflict(contextFor(actor), other, source);
  }

  /* ---------------------------------------------------------------- needs */

  function tickNeeds(actor, dt) {
    const p = profile(actor);
    const n = p.needs;
    actor.ai.clock = finite(actor.ai.clock, 0) + dt;
    // The profile value wins; PREGNANCY_HUNGER is the fallback for profiles
    // written before needs.pregnancyHunger existed.
    actor.hunger = Math.min(1, finite(actor.hunger, .3) +
      n.hungerRate * (actor.pregnant ? finite(n.pregnancyHunger, PREGNANCY_HUNGER) : 1) * dt);
    actor.thirst = Math.min(1, finite(actor.thirst, .3) + n.thirstRate * dt);
    actor.health = clamp(finite(actor.health, 100), 1, 100);
    actor.energy = clamp(finite(actor.energy, 1), 0, 1);
    if (actor.ai && actor.ai.state === 'sleep') {
      actor.health = Math.min(100, actor.health + n.healthRest * dt);
      actor.energy = Math.min(1, actor.energy + n.energyRest * dt);
      return;
    }
    actor.health = Math.min(100, actor.health + n.healthRegen * dt);
    actor.energy = Math.max(0, actor.energy - n.energyRate * dt);
    actor.social = Math.min(1, finite(actor.social, .3) + n.socialRate * dt);
    actor.affection = Math.min(1, finite(actor.affection, .25) + n.affectionRate * dt);
    if (actor.hunger >= .95) actor.health = Math.max(1, actor.health - n.healthStarve * dt);
  }

  function needsRest(actor) {
    return restModule.needsRest(contextFor(actor));
  }

  function movementIntent(actor) {
    const ai = actor && actor.ai;
    if (!ai) return false;
    const owner = moduleStateOwner(ai.state);
    if (owner && typeof owner.isTraveling === 'function') {
      return owner.isTraveling(contextFor(actor));
    }

    if (ai.state === 'familyTask' && ai.familyTask && ai.familyTask.phase === 'travel') {
      const anchor = ai.familyTask.anchor;
      return !anchor || Math.hypot(anchor.x - actor.cx, anchor.z - actor.cz) > 1.5;
    }
    if (ai.state === 'visit' && ai.visitPhase !== 'hangout') {
      const target = ai.target;
      return !target || Math.hypot(target.x - actor.cx, target.z - actor.cz) > 1.7;
    }
    return false;
  }

  function noteStall(actor, reason) {
    const ai = actor.ai;
    const source = ai.source || ai.contestSource || null;
    const detail = {
      uid: actor.uid,
      name: actor.name,
      species: actor.species,
      state: ai.state,
      reason,
      moving: !!ai.moving,
      path: ai.path ? ai.path.length : 0,
      pathIndex: ai.pathIndex | 0,
      target: ai.target ? { x: +ai.target.x.toFixed(2), z: +ai.target.z.toFixed(2) } : null,
      at: [+actor.cx.toFixed(2), +actor.cz.toFixed(2)],
      source: source ? source.id : null,
      contacts: actor.contacts,
      airborne: !!actor.airborne,
      rMat4: +(actor.rMat?.[4] || 0).toFixed(2),
      interrupted: !!ai.interrupted,
      familyTask: ai.familyTask ? ai.familyTask.id : null,
      visitPhase: ai.visitPhase || null,
      restKind: ai.restKind || null,
    };
    ai.lastStuck = detail;
    ai.recoveryLog = ai.recoveryLog || [];
    ai.recoveryLog.push(detail);
    if (ai.recoveryLog.length > 8) ai.recoveryLog.shift();
    ai.recoveries = (ai.recoveries || 0) + 1;
    if (typeof console !== 'undefined' && console.warn) console.warn('AI STUCK', JSON.stringify(detail));
  }

  function recoverStall(actor) {
    const ai = actor.ai;
    const source = ai.source || ai.contestSource || null;
    const sourceId = source ? source.id : null;
    noteStall(actor, 'no-progress');
    if (['seekChat', 'chat', 'seekCuddle', 'cuddle', 'seekReconcile', 'reconcile',
      'seekPartner', 'partnering', 'group', 'seekGift', 'gift'].includes(ai.state)) {
      interruptActor(actor, 'no-progress');
      ai.progressX = actor.cx;
      ai.progressZ = actor.cz;
      ai.progressTargetX = null;
      ai.progressTargetZ = null;
      ai.progressDist = Infinity;
      ai.progressPathIndex = 0;
      ai.noProgressT = 0;
      return;
    }
    if (ai.state === 'visit') {
      finishVisitPair(actor);
    } else if (ai.state === 'familyTask') {
      const partner = ai.partner;
      cancelTask(actor, { stop });
      ai.taskCooldown = Math.max(ai.taskCooldown || 0, 2);
      ai.familyPlayCooldown = Math.max(ai.familyPlayCooldown || 0, 30);
      if (partner && partner.ai) {
        partner.ai.taskCooldown = Math.max(partner.ai.taskCooldown || 0, 2);
        partner.ai.familyPlayCooldown = Math.max(partner.ai.familyPlayCooldown || 0, 30);
      }
    } else {
      if (ai.state === 'seekFood' || ai.state === 'seekHive' || ai.state === 'seekConflict') {
        releaseFood(actor);
        ai.source = null;
        ai.contestSource = null;
        ai.contestBear = null;
      }
      ai.waterSpot = null;
      if (ai.state === 'follow') ai.followRetryT = Math.max(ai.followRetryT || 0, 30);
      ai.follow = null;
      ai.target = null;
      ai.path = null;
      ai.pathIndex = 0;
      ai.moving = false;
      if (ai.state === 'seekHome') {
        ai.restCooldown = Math.max(ai.restCooldown || 0, 4);
        ai.restKind = null;
      }
      ai.state = 'wander';
      ai.idleT = .6;
      ai.nextThink = 0;
      ai.taskCooldown = Math.max(ai.taskCooldown || 0, 1.5);
      stop(actor);
    }
    if (sourceId) {
      ai.avoidSourceId = sourceId;
      ai.avoidSourceT = 6;
    }
    actor.ai.progressX = actor.cx;
    actor.ai.progressZ = actor.cz;
    actor.ai.progressTargetX = null;
    actor.ai.progressTargetZ = null;
    actor.ai.progressDist = Infinity;
    actor.ai.progressPathIndex = 0;
    actor.ai.noProgressT = 0;
  }

  function tickStall(actor, dt, ready) {
    const ai = actor.ai;
    if (!ai) return;
    if (ai.avoidSourceT > 0) ai.avoidSourceT = Math.max(0, ai.avoidSourceT - dt);
    if (ai.restCooldown > 0) ai.restCooldown = Math.max(0, ai.restCooldown - dt);
    const blocked = !ready || !movementIntent(actor) || actor.inside || actor.sleeping ||
      actor.grabs > 0 || actor.inPond || ai.possessed || ai.interrupted;
    if (blocked) {
      ai.progressX = actor.cx;
      ai.progressZ = actor.cz;
      ai.progressTargetX = null;
      ai.progressTargetZ = null;
      ai.progressDist = Infinity;
      ai.progressPathIndex = 0;
      ai.noProgressT = 0;
      return;
    }
    const target = ai.target || (ai.familyTask && ai.familyTask.anchor) || null;
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) {
      ai.progressX = actor.cx;
      ai.progressZ = actor.cz;
      ai.progressTargetX = null;
      ai.progressTargetZ = null;
      ai.progressDist = Infinity;
      ai.progressPathIndex = 0;
      ai.noProgressT = 0;
      return;
    }
    const targetMoved = !Number.isFinite(ai.progressTargetX) ||
      !Number.isFinite(ai.progressTargetZ) ||
      Math.hypot(target.x - ai.progressTargetX, target.z - ai.progressTargetZ) > .25;
    const dist = Math.hypot(target.x - actor.cx, target.z - actor.cz);
    if (targetMoved) {
      ai.progressTargetX = target.x;
      ai.progressTargetZ = target.z;
      ai.progressDist = dist;
      ai.progressPathIndex = ai.pathIndex | 0;
      ai.noProgressT = 0;
      return;
    }
    const pathIndex = ai.pathIndex | 0;
    if (pathIndex !== (ai.progressPathIndex | 0)) {
      ai.progressPathIndex = pathIndex;
      ai.progressDist = dist;
      ai.noProgressT = 0;
      return;
    }
    // Use approach to the target, not raw displacement: a crowd can push a
    // stationary actor around without making any route progress.
    if (dist < ai.progressDist - .08) {
      ai.progressDist = dist;
      ai.noProgressT = 0;
      return;
    }
    ai.noProgressT = finite(ai.noProgressT, 0) + dt;
    if (ai.noProgressT >= 6.0) recoverStall(actor);
  }

  function noteDoorTransition(actor, kind) {
    const ai = actor.ai;
    if (!ai) return;
    const now = finite(ai.clock, 0);
    if (!ai.doorFirstAt || now - ai.doorFirstAt > 20) {
      ai.doorFirstAt = now;
      ai.doorEntries = 0;
      ai.doorExits = 0;
      ai.doorWarned = false;
    }
    if (kind === 'enter') ai.doorEntries += 1;
    else ai.doorExits += 1;
    const total = ai.doorEntries + ai.doorExits;
    if (total < 3 || ai.doorWarned) return;
    ai.doorWarned = true;
    const p = profile(actor);
    const detail = {
      uid: actor.uid,
      name: actor.name,
      species: actor.species,
      entries: ai.doorEntries,
      exits: ai.doorExits,
      signal: `${ai.doorEntries}/${ai.doorExits}`,
      inside: !!actor.inside,
      sleeping: !!actor.sleeping,
      state: ai.state,
      restKind: ai.restKind || null,
      insideT: +(ai.insideT || 0).toFixed(1),
      shelteredToday: !!actor.shelteredToday,
      home: actor.home || '',
      familyTask: ai.familyTask ? ai.familyTask.id : null,
      follow: ai.follow ? (ai.follow.name || 'parent') : null,
      hours: +hoursNow().toFixed(1),
      energy: +finite(actor.energy, 0).toFixed(2),
      hunger: +finite(actor.hunger, 0).toFixed(2),
      thirst: +finite(actor.thirst, 0).toFixed(2),
    };
    if (typeof console !== 'undefined' && console.warn) console.warn('DOOR LOOP', JSON.stringify(detail));
    if (p.rest.mode === 'dayShelter') {
      actor.shelteredToday = true;
      ai.shelterCheckT = Math.max(ai.shelterCheckT || 0, 30);
    } else {
      ai.restCooldown = Math.max(ai.restCooldown || 0, 8);
    }
  }

  /* ---------------------------------------------------------- state change */

  function startSeekHome(actor, restKind = null) {
    return restModule.startSeekHome(contextFor(actor), restKind);
  }

  function startSleep(actor, home, restKind = 'night') {
    return restModule.startSleep(contextFor(actor), home, restKind);
  }

  function wake(actor) {
    restModule.wake(contextFor(actor));
  }

  function startEat(actor) {
    forageModule.startEat(contextFor(actor));
  }

  function startDrink(actor) {
    waterModule.startDrink(contextFor(actor));
  }

  /* ----------------------------------------------------------- pair states */

  function acquireCompany(actor) {
    return socialModule.acquireCompany(contextFor(actor));
  }

  function startInvite(actor, partner, acceptedOverride) {
    return socialModule.startInvite(contextFor(actor), partner, acceptedOverride);
  }

  function beginSocialPair(actor, partner, familyPlay = false, playmateKind = null) {
    return socialModule.beginSocialPair(contextFor(actor), partner, familyPlay, playmateKind);
  }

  function startDeclinePair(actor, partner) {
    return socialModule.startDeclinePair(contextFor(actor), partner);
  }

  function startVisit(actor, partner) {
    return socialModule.startVisit(contextFor(actor), partner);
  }

  function finishVisitPair(actor) {
    return socialModule.finishVisit(contextFor(actor));
  }

  /* ---------------------------------------------------------------- follow */

  /* ---------------------------------------------------------------- follow */

  function startFollow(actor, parent) {
    return followModule.startFollow(contextFor(actor), parent);
  }

  /* ----------------------------------------------------------------- mate */

  function canMatePair(actor, other) {
    return mateModule.canMatePair(contextFor(actor), other);
  }

  function acquireMate(actor) {
    return mateModule.acquireMate(contextFor(actor));
  }

  function startSeekMate(actor, partner) {
    return mateModule.startSeekMate(contextFor(actor), partner);
  }

  function startMatePair(actor, partner) {
    return mateModule.startMatePair(contextFor(actor), partner);
  }

  /* -------------------------------------------------------------- playdate */

  /* ----------------------------------------------------------------- tasks */
  function forceLesson(teacher, student) {
    if (!teacher || !student || !teacher.ai || !student.ai) return { ok: false, note: 'no pair' };
    cancelPair(teacher);
    cancelPair(student);
    return { ok: familyTaskModule.startLesson(contextFor(teacher), student, true), state: teacher.ai.state };
  }

  /* -------------------------------------------------------------- thinking */

  function dayShelterCheck(actor) {
    return restModule.dayShelterCheck(contextFor(actor));
  }

  function think(actor) {
    if (!actor || !actor.ai) return;
    if (features.adoption) reconcileAdoption(actor);
    const state = actor.ai.state;
    if (state === 'familyTask') {
      const adapter = adapterOf(actor);
      if (adapter && typeof adapter.preNeeds === 'function' && adapter.preNeeds(actor, api)) return;
      return;
    }
    if (activeStates.has(state)) return;
    if (needsRest(actor) && state !== 'seekHome') { startSeekHome(actor); return; }
    if (dayShelterCheck(actor)) return;
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.preNeeds === 'function' && adapter.preNeeds(actor, api)) return;
    if (actor.ai.directive) return;
    const owner = moduleStateOwner(state);
    if (owner && typeof owner.think === 'function') owner.think(contextFor(actor));
    else if (adapter && typeof adapter.think === 'function') adapter.think(actor, api);
  }

  /* ------------------------------------------------------------- per tick */

  function mournDeparture(departed, info = {}) {
    if (!features.mourning || !departed || info.cause !== 'stars') return 0;
    const day = dayNow();
    const hours = hoursNow();
    let count = 0;
    for (const actor of actors()) {
      if (!actor || actor === departed || actor.active === false) continue;
      if (addMourning(actor, departed, { day, hours })) count++;
    }
    return count;
  }

  function updateMood(actor, dt) {
    if (features.mourning && actor) pruneMourning(actor, dayNow(), hoursNow());
    if (!features.mood || !actor || !actor.ai) return;
    const ai = actor.ai;
    if (!Number.isFinite(ai.mood)) ai.mood = 0;
    if (!Number.isFinite(ai.moodBucket)) ai.moodBucket = 0;
    if (!Number.isFinite(ai.moodClock)) ai.moodClock = 0;
    ai.moodClock += dt;
    if (ai.moodClock < MOOD_UPDATE_INTERVAL) return;
    const elapsed = ai.moodClock;
    ai.moodClock = 0;
    const target = moodFor(actor, { day: dayNow(), hours: hoursNow(), mourning: features.mourning });
    const alpha = 1 - Math.exp(-elapsed / MOOD_TAU);
    ai.mood = clamp(ai.mood + (target - ai.mood) * alpha, -1, 1);
    const bucket = Math.round(ai.mood / MOOD_BUCKET) * MOOD_BUCKET;
    ai.moodAt = dayNow() + hoursNow() / 24;
    if (bucket !== ai.moodBucket) {
      ai.moodBucket = bucket;
      config.invalidateActor(actor);
    }
  }

  function tick(actor, dt, { ready = true } = {}) {
    if (!enabled || !actor || !actor.active) return;
    if (!actor.ai) attach(actor);
    if (!actor.ai) return;
    noteCoverage(actor);
    updateMood(actor, dt);
    const p = profile(actor);
    const ai = actor.ai;
    tickNeeds(actor, dt);
    stars.update(actor, dt);
    if (actor.fading?.committed) return;
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.preTick === 'function') adapter.preTick(actor, dt, api);
    tickStall(actor, dt, ready);
    if (ai.state === 'sleep') {
      const ctx = contextFor(actor);
      if (restModule.sleepDone(ctx)) restModule.wake(ctx);
      return;
    }
    if (!ready || ai.possessed) return;

    if (ai.taskCooldown > 0) ai.taskCooldown = Math.max(0, ai.taskCooldown - dt);
    if (ai.followRetryT > 0) ai.followRetryT = Math.max(0, ai.followRetryT - dt);
    if (features.gifting && ai.giftRetryT > 0) {
      ai.giftRetryT = Math.max(0, ai.giftRetryT - dt);
    }
    if (ai.familyPlayCooldown > 0) ai.familyPlayCooldown = Math.max(0, ai.familyPlayCooldown - dt);
    if (ai.chatCooldown > 0) ai.chatCooldown = Math.max(0, ai.chatCooldown - dt);
    if (ai.cuddleCooldown > 0) ai.cuddleCooldown = Math.max(0, ai.cuddleCooldown - dt);
    if (ai.groupCooldown > 0) ai.groupCooldown = Math.max(0, ai.groupCooldown - dt);
    if (ai.reconcileCooldown > 0) ai.reconcileCooldown = Math.max(0, ai.reconcileCooldown - dt);
    if (ai.idleT > 0) ai.idleT = Math.max(0, ai.idleT - dt);
    if (ai.stungT > 0) ai.stungT = Math.max(0, ai.stungT - dt);
    if (ai.socialCooldown > 0) ai.socialCooldown = Math.max(0, ai.socialCooldown - dt);
    if (ai.conflictCooldown > 0) ai.conflictCooldown = Math.max(0, ai.conflictCooldown - dt);
    if (actor.shelterCheckT > 0) actor.shelterCheckT = Math.max(0, actor.shelterCheckT - dt);
    if (p.rest.mode === 'dayShelter' && !isDayFor(actor)) actor.shelteredToday = false;

    // Ordinary hunger/thirst waits for a short interaction to finish. At the
    // critical thresholds an optional interaction must yield to survival.
    const criticalNeed = actor.thirst >= p.thresholds.criticalThirst ? 'water'
      : actor.hunger >= p.thresholds.criticalHunger ? 'food' : null;
    if (criticalNeed && ['invite', 'social', 'decline', 'mate', 'visit', 'familyTask', 'stargaze',
      'seekHome', 'seekMate', 'seekCompany', 'seekSocial', 'follow', 'seekGift', 'gift',
      'seekChat', 'chat', 'seekCuddle', 'cuddle', 'seekReconcile', 'reconcile',
      'seekPartner', 'partnering', 'group'].includes(ai.state)) {
      cancelPair(actor);
      if (criticalNeed === 'water') acquireWater(actor);
      else if (!acquireFood(actor) && p.conflict) acquireContest(actor);
      if (ai.state === 'wander') { ai.idleT = .3; ai.nextThink = 0; }
      return;
    }

    const stateOwner = moduleStateOwner(ai.state);
    if (stateOwner && stateOwner.id !== 'family' && typeof stateOwner.tick === 'function') {
      if (stateOwner.tick(contextFor(actor, { dt }), dt) !== false) return;
    }
    if (ai.state === 'familyTask' && ai.directives.length) {
      const adapter = adapterOf(actor);
      if (adapter && typeof adapter.preNeeds === 'function' && adapter.preNeeds(actor, api)) return;
    }
    if (ai.state === 'familyTask') {
      familyTaskModule.tick(contextFor(actor, { dt }), dt);
      return;
    }
    if (ai.state === 'raidHive') {
      hiveModule.tick(contextFor(actor, { dt }), dt);
      return;
    }
    if (adapter && typeof adapter.tickState === 'function') {
      if (adapter.tickState(actor, dt, api) !== false) return;
    }

    ai.nextThink -= dt;
    if (ai.nextThink > 0) return;
    ai.nextThink = p.think.min + rng() * (p.think.max - p.think.min);
    think(actor);
    stats.ticks++;
  }

  function endPartnership(actor, reason = 'separated') {
    if (!actor) return false;
    const otherUid = normalizePartnerUid(actor.partnerUid);
    if (otherUid === null) return false;
    const other = actors().find(item => item && item.uid === otherUid) || null;
    clearPartnership(actor, other);
    if (features.interactionHistory) {
      const day = dayNow();
      const hour = hoursNow();
      if (other) pushHistory(other, { kind: 'separated', uid: actor.uid, day, hour });
      pushHistory(actor, { kind: 'separated', uid: otherUid, day, hour });
    }
    return true;
  }

  function commitFarewell(actor) {
    if (!actor || !actor.ai) return false;
    // The farewell is irreversible once committed: drop every shared claim
    // before the visual starts, so feeding/drinking cannot rescue the actor.
    endPartnership(actor, 'departed');
    cancelPair(actor);
    releaseFood(actor);
    stop(actor);
    actor.ai.state = 'wander';
    actor.ai.moving = false;
    actor.ai.path = null;
    actor.ai.target = null;
    actor.ai.source = null;
    actor.ai.waterSpot = null;
    return true;
  }

  function cancelFarewells() {
    stars.cancelAll();
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) {
      for (const actor of actors()) {
        if (!actor.active || !actor.ai) continue;
        cancelPair(actor);
        releaseFood(actor);
        actor.ai.moving = false;
        actor.ai.arrived = false;
        actor.ai.source = null;
        actor.ai.waterSpot = null;
        actor.ai.target = null;
        stop(actor);
      }
    }
    return enabled;
  }

  function onGrab(actor) {
    if (!actor) return;
    if (!actor.ai) attach(actor);
    // Modules expose interrupt(ctx, reason); wiring it here would change the
    // legacy grab/resume path, so the hook lands with each port in step 4.
    cancelPair(actor);
    actor.ai.interrupted = true;
    actor.sleeping = false;
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.onGrab === 'function') adapter.onGrab(actor);
    releaseFood(actor);
  }

  function onRelease(actor) {
    if (!actor || !actor.ai) return;
    actor.ai.nextThink = 0;
    actor.ai.arrived = false;
  }

  function detach(actor) {
    if (!actor) return;
    releaseFood(actor);
    cancelPair(actor);
    if (actor.ai) {
      actor.ai.moving = false;
      actor.ai.path = null;
    }
    actor.ai = null;
  }

  /* --------------------------------------------------------------- debug */

  function plan(actor) {
    if (!actor || !actor.ai) return null;
    let reasonText = actor.fading ? 'feeling faint' : null;
    const out = {
      state: actor.ai.state,
      hunger: +finite(actor.hunger, 0).toFixed(3),
      thirst: +finite(actor.thirst, 0).toFixed(3),
      health: +finite(actor.health, 0).toFixed(1),
      energy: +finite(actor.energy, 0).toFixed(3),
      age: +finite(actor.age, 0).toFixed(1),
      stage: actor.stage,
      pregnant: !!actor.pregnant,
      gestation: +finite(actor.gestation, 0).toFixed(1),
      social: +finite(actor.social, 0).toFixed(3),
      affection: +finite(actor.affection, 0).toFixed(3),
      partner: actor.ai.partner ? (actor.ai.partner.name || 'a friend') : null,
      bond: actor.ai.partner ? +pairBond(actor, actor.ai.partner).toFixed(3) : null,
      familyPlay: !!actor.ai.familyPlay,
      playmateKind: actor.ai.playmateKind || null,
      follow: actor.ai.follow ? (actor.ai.follow.name || 'parent') : null,
      visitHome: actor.ai.visitHome || null,
      visitRole: actor.ai.visitRole || null,
      home: actor.home || '',
      sleeping: !!actor.sleeping,
      fading: !!actor.fading,
      fadingReason: actor.fading ? actor.fading.reason : null,
      interrupted: !!actor.ai.interrupted,
      moving: !!actor.ai.moving,
      noProgressT: +finite(actor.ai.noProgressT, 0).toFixed(2),
      recoveries: actor.ai.recoveries | 0,
      restCooldown: +finite(actor.ai.restCooldown, 0).toFixed(2),
      doorEntries: actor.ai.doorEntries | 0,
      doorExits: actor.ai.doorExits | 0,
      faceYaw: actor.ai.faceYaw === null || actor.ai.faceYaw === undefined ? null : +actor.ai.faceYaw.toFixed(3),
      animT: +finite(actor.ai.animT, 0).toFixed(3),
      source: actor.ai.source ? actor.ai.source.id : null,
      target: actor.ai.target ? { x: +actor.ai.target.x.toFixed(2), z: +actor.ai.target.z.toFixed(2) } : null,
      path: actor.ai.path ? actor.ai.path.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) })) : [],
      lastStuck: actor.ai.lastStuck || null,
      familyTask: actor.ai.familyTask ? { id: actor.ai.familyTask.id, phase: actor.ai.familyTask.phase } : null,
      skills: { ...skillsFor(actor) },
      history: (actor.history || []).slice(-4),
    };
    // Lazy debug/UI field: plan() is not called by the tick, and the phrase is
    // only computed when a debug panel or the thought overlay reads it.
    Object.defineProperty(out, 'reason', {
      enumerable: true,
      configurable: true,
      get() {
        if (reasonText === null) reasonText = planReason(actor);
        return reasonText;
      },
    });
    if (features.mood) {
      let moodValue = null;
      let moodKey = null;
      Object.defineProperty(out, 'mood', {
        enumerable: true,
        configurable: true,
        get() {
          if (moodValue === null) moodValue = finite(actor.ai?.mood, 0);
          return +moodValue.toFixed(3);
        },
      });
      Object.defineProperty(out, 'moodLabel', {
        enumerable: true,
        configurable: true,
        get() {
          if (moodKey === null) moodKey = moodLabel(finite(actor.ai?.mood, 0)).key;
          return moodKey;
        },
      });
    }
    return out;
  }

  function statsNow(filter = null) {
    const list = [];
    for (const actor of actors()) {
      if (!actor.active || !actor.ai) continue;
      if (typeof filter === 'function' && !filter(actor)) continue;
      list.push({ index: list.length, uid: actor.uid, name: actor.name, species: actor.species, ...plan(actor) });
    }
    return {
      enabled, ticks: stats.ticks, ms: +stats.ms.toFixed(3),
      adoptions: adoptionAssignments, actors: list,
    };
  }

  function resumeTask(actor) {
    if (!actor || !actor.ai) return;
    const ai = actor.ai;
    const owner = moduleStateOwner(ai.state);
    if (owner && typeof owner.resume === 'function' && owner.resume(contextFor(actor))) return;
    ai.target = null;
    ai.faceYaw = null;
    ai.idleT = .4;
    stop(actor);
  }

  function debugState(actor, next) {
    if (!actor) return { ok: false, note: 'no actor' };
    if (!actor.ai) attach(actor);
    if (!actor.ai) return { ok: false, note: 'no actor' };
    if (!['wander', 'seekFood', 'seekWater', 'eat', 'drink', 'seekCompany',
      'seekConflict', 'seekHome', 'seekHive', 'seekMate'].includes(next)) {
      return { ok: false, note: 'unknown state' };
    }
    cancelPair(actor);
    releaseFood(actor);
    const ai = actor.ai;
    ai.interrupted = false;
    ai.moving = false;
    ai.arrived = false;
    ai.hopState = null;
    ai.hopWait = 0;
    ai.turnWait = 0;
    ai.raidT = 0;
    ai.fleeT = 0;
    actor.sleeping = false;
    ai.faceYaw = null;
    ai.path = null;
    ai.pathIndex = 0;
    ai.target = null;
    ai.source = null;
    ai.waterSpot = null;
    ai.eatT = 0;
    ai.drinkT = 0;
    ai.inviteT = 0;
    ai.socialT = 0;
    ai.declineT = 0;
    ai.conflictT = 0;
    ai.mateT = 0;
    ai.follow = null;
    ai.contestBear = null;
    ai.contestSource = null;
    ai.conflictSource = null;
    ai.shove = null;
    ai.animT = 0;
    ai.taskCooldown = 0;
    ai.nextThink = 0;

    if (next === 'wander') {
      ai.state = 'wander';
      ai.idleT = 0;
      return { ok: true, state: 'wander', note: 'wandering' };
    }
    if (next === 'seekFood') {
      ai.state = 'seekFood';
      return { ok: true, state: 'seekFood', note: 'looking for food' };
    }
    if (next === 'seekWater') {
      ai.state = 'seekWater';
      return { ok: true, state: 'seekWater', note: 'looking for water' };
    }
    if (next === 'seekCompany') {
      const partner = acquireCompany(actor);
      return { ok: !!partner, state: ai.state, note: partner ? 'seeking a friend' : 'no company target' };
    }
    if (next === 'seekConflict') {
      const source = acquireContest(actor);
      return { ok: !!source, state: ai.state, note: source ? 'looking for a contested snack' : 'no contested snack' };
    }
    if (next === 'seekMate') {
      const partner = acquireMate(actor);
      return { ok: !!partner, state: ai.state, note: partner ? 'seeking a mate' : 'no eligible mate' };
    }
    if (next === 'seekHome') {
      startSeekHome(actor);
      return { ok: true, state: ai.state, note: 'heading home' };
    }
    if (next === 'seekHive') {
      const source = acquireHive(actor);
      return { ok: !!source, state: ai.state, note: source ? 'looking for a hive' : 'no hive target' };
    }
    if (next === 'eat') {
      const source = field.food.nearestRipe(actor.cx, actor.cz, {
        maxDistance: 999, bear: actor, safe: true,
      });
      if (!source || !field.food.claim(source, actor)) {
        ai.state = 'seekFood';
        return { ok: false, state: 'seekFood', note: 'no food target; seeking' };
      }
      ai.source = source;
      ai.target = { x: source.approachX, z: source.approachZ };
      const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
      if (d <= profile(actor).food.eatDist) {
        startEat(actor);
        return { ok: true, state: 'eat', note: 'eating' };
      }
      ai.state = 'seekFood';
      setDestination(actor, source.approachX, source.approachZ);
      return { ok: true, state: 'seekFood', note: 'seeking nearest food' };
    }
    let spot = null;
    let bestD = Infinity;
    for (const candidate of field.waterSpots || []) {
      const d = Math.hypot(candidate.x - actor.cx, candidate.z - actor.cz);
      if (d < bestD) { bestD = d; spot = candidate; }
    }
    if (!spot) {
      ai.state = 'wander';
      return { ok: false, state: 'wander', note: 'no water target' };
    }
    ai.waterSpot = spot;
    ai.target = { x: spot.x, z: spot.z };
    if (bestD <= profile(actor).food.drinkDist) {
      startDrink(actor);
      return { ok: true, state: 'drink', note: 'drinking' };
    }
    ai.state = 'seekWater';
    setDestination(actor, spot.x, spot.z);
    return { ok: true, state: 'seekWater', note: 'seeking nearest water' };
  }

  function setNeed(actor, kind, value) {
    if (!actor || !['hunger', 'thirst', 'social', 'affection'].includes(kind)) return false;
    const n = clamp(Number(value), 0, 1);
    if (!Number.isFinite(n)) return false;
    actor[kind] = n;
    if (actor.ai) actor.ai.nextThink = 0;
    return n;
  }

  function setBond(actor, other, value) {
    if (!actor || !other || actor === other) return false;
    const n = clamp(Number(value), 0, 1);
    if (!Number.isFinite(n)) return false;
    addBond(actor, other, n - pairBond(actor, other));
    return n;
  }

  function forceSocial(actor, partner, accept = true) {
    if (!actor || !partner || !actor.ai || !partner.ai) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    if (!accept) { startDeclinePair(actor, partner); return { ok: true, state: 'decline' }; }
    beginSocialPair(actor, partner);
    return { ok: true, state: actor.ai.state };
  }

  function forceGift(actor, recipient) {
    if (!actor || !recipient || !actor.ai || !recipient.ai) {
      return { ok: false, note: 'no pair' };
    }
    cancelPair(actor);
    cancelPair(recipient);
    // A debug force is an explicit new attempt, not a retry of the pair just
    // cancelled. It clears only the short retry timer, not eligibility.
    if (actor.ai && 'giftRetryT' in actor.ai) actor.ai.giftRetryT = 0;
    const ok = giftingModule.beginGift(contextFor(actor), recipient);
    return {
      ok, state: actor.ai ? actor.ai.state : null,
      sourceId: ok && actor.ai.source ? actor.ai.source.id : null,
      portionId: ok && actor.ai.giftOrigin?.portion ? actor.ai.giftOrigin.portion.id : null,
      phase: ok && actor.ai ? actor.ai.giftPhase : null,
    };
  }

  function forceChat(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    actor.ai.chatCooldown = 0;
    partner.ai.chatCooldown = 0;
    const ok = pairActivitiesModule.beginChat(contextFor(actor), partner);
    return { ok, state: actor.ai.state };
  }

  function forceCuddle(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    actor.ai.cuddleCooldown = 0;
    partner.ai.cuddleCooldown = 0;
    const ok = pairActivitiesModule.beginCuddle(contextFor(actor), partner);
    return { ok, state: actor.ai.state };
  }

  function forceReconcile(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    actor.ai.reconcileCooldown = 0;
    partner.ai.reconcileCooldown = 0;
    const ok = relationshipsModule.beginReconcile(contextFor(actor), partner);
    return { ok, state: actor.ai.state };
  }

  function forcePartnership(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    const ok = relationshipsModule.beginPartnership(contextFor(actor), partner);
    return { ok, state: actor.ai.state };
  }

  function forceGroup(actor, members = null) {
    if (!actor || !actor.ai) return { ok: false, note: 'no actor' };
    if (Array.isArray(members)) {
      const ok = groupActivitiesModule.startGroup(contextFor(actor), [actor, ...members]);
      return { ok, state: actor.ai.state };
    }
    const ok = groupActivitiesModule.acquireGroup(contextFor(actor));
    return { ok, state: actor.ai.state };
  }

  function separatePartnership(actor) {
    if (!actor) return false;
    return endPartnership(actor, 'separated');
  }

  function forceInvite(actor, partner, accept = true) {
    if (!actor || !partner) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    startInvite(actor, partner, accept);
    return { ok: true, state: actor.ai.state };
  }

  function forceVisit(actor, partner) {
    if (!actor || !partner) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    return { ok: startVisit(actor, partner), state: actor.ai.state };
  }

  function forceMate(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    startMatePair(actor, partner);
    return { ok: actor.ai.state === 'mate', state: actor.ai.state };
  }

  function forcePlaydate(actor, partner, kind = 'sibling') {
    if (!actor || !partner) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    return { ok: familyTaskModule.startPlaydate(contextFor(actor), partner, kind), state: actor.ai.state };
  }

  function forceConflict(actor, partner, source = null) {
    if (!actor || !partner || actor === partner) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    const claim = source || (partner.ai && partner.ai.source) || null;
    return { ok: startConflict(actor, partner, claim), state: actor.ai.state };
  }

  function forceMeal(actor) {
    if (!actor || !actor.ai) return { ok: false, note: 'no actor' };
    const ok = familyTaskModule.startFamilyMeal(contextFor(actor), { window: { name: 'meal' }, key: `${dayNow()}:forced` }, true);
    return { ok, state: actor.ai.state };
  }

  registerModule(hiveModule);
  registerModule(restModule);
  registerModule(forageModule);
  registerModule(waterModule);
  registerModule(wanderModule);
  registerModule(socialModule);
  registerModule(mateModule);
  registerModule(conflictModule);
  registerModule(followModule);
  registerModule(stargazeModule);
  registerModule(familyTaskModule);
  registerModule(fleeModule);
  registerModule(giftingModule);
  registerModule(pairActivitiesModule);
  registerModule(relationshipsModule);
  registerModule(groupActivitiesModule);

  function setModuleEnabled(id, value, scope = null) {
    const result = config.setModuleEnabled(id, value, scope);
    configVersion++;
    return result;
  }

  function setModuleParams(id, patch, scope = null) {
    const result = config.setModuleParams(id, patch, scope);
    configVersion++;
    return result;
  }

  function setActorConfig(uid, patch) {
    const result = config.setActorConfig(uid, patch);
    configVersion++;
    return result;
  }

  function suspendGuardianFollows() {
    for (const actor of actors()) {
      const ai = actor && actor.ai;
      if (!ai || !ai.follow || !Number.isFinite(actor.guardianUid)) continue;
      if (ai.follow.uid !== actor.guardianUid) continue;
      ai.follow = null;
      ai.followRetryT = 0;
      ai.moving = false;
      ai.path = null;
      ai.target = null;
      if (ai.state === 'follow') {
        ai.state = 'wander';
        ai.idleT = .5;
        ai.nextThink = 0;
        stop(actor);
      }
    }
  }

  function setFeature(name, value) {
    const changed = config.setFeature(name, value);
    if (changed && name === 'farewells' && !value) stars.cancelAll();
    if (changed && name === 'adoption' && !value) suspendGuardianFollows();
    if (changed && name === 'gifting' && !value) {
      for (const actor of actors()) {
        if (!actor.ai) continue;
        if (actor.ai.state === 'seekGift' || actor.ai.state === 'gift') {
          giftingModule.cancel(contextFor(actor));
        } else if (actor.carriedFood) {
          giftingModule.dropCarried(actor, field, contextFor(actor));
        }
        actor.ai.giftRetryT = 0;
      }
    }
    if (changed && name === 'pairActivities' && !value) {
      for (const actor of actors()) {
        if (actor.ai && ['seekChat', 'chat', 'seekCuddle', 'cuddle'].includes(actor.ai.state)) {
          pairActivitiesModule.cancel(contextFor(actor));
        }
      }
    }
    if (changed && name === 'reconciliation' && !value) {
      for (const actor of actors()) {
        if (actor.ai && ['seekReconcile', 'reconcile'].includes(actor.ai.state)) {
          relationshipsModule.cancel(contextFor(actor), 'reconcile');
        }
      }
    }
    if (changed && name === 'partnership' && !value) {
      for (const actor of actors()) {
        if (actor.ai && ['seekPartner', 'partnering'].includes(actor.ai.state)) {
          relationshipsModule.cancel(contextFor(actor), 'partner');
        }
      }
    }
    if (changed && name === 'groupActivities' && !value) {
      for (const actor of actors()) {
        if (actor.ai && actor.ai.state === 'group' && actor.ai.group) {
          groupActivitiesModule.cancel(contextFor(actor));
        }
      }
    }
    return changed;
  }

  function interruptActor(actor, reason) {
    if (!actor || !actor.ai) return null;
    const owner = moduleStateOwner(actor.ai.state);
    if (owner && typeof owner.interrupt === 'function') {
      owner.interrupt(contextFor(actor, { reason }), reason);
      return owner.id;
    }
    return null;
  }

  const api = {
    field, profile, actors, hoursNow, dayNow, mapId: mapIdNow, rng,
    pathTo, setPath, setDestination, clearPath, stop, face, emit, releaseFood,
    homeFor, assignHome, parentFor, followTargetFor, adoption: adoptionInfo,
    reconcileAdoption, adoptionActive: () => !!features.adoption,
    safeFoodCount, needsReplan, populationCap,
    startEat,
    acquireFood, acquireWater, acquireHive, acquireContest,
    acquireFamilyPlaymate: (actor) => familyTaskModule.acquireFamilyPlaymate(contextFor(actor)),
    acquireMate, acquireCompany, startFollow, parentFor,
    mealWindow: (actor) => familyTaskModule.mealWindow(contextFor(actor)),
    startFamilyMeal: (actor, meal, immediate) => familyTaskModule.startFamilyMeal(contextFor(actor), meal, immediate),
    lessonCandidate: (actor) => familyTaskModule.lessonCandidate(contextFor(actor)),
    startLesson: (actor, student, immediate) => familyTaskModule.startLesson(contextFor(actor), student, immediate),
    findDuePlaydate: (actor) => familyTaskModule.findDuePlaydate(contextFor(actor)),
    startSeekHome, startSleep, wake, cancelPair, startInvite,
    canMatePair, startMatePair, startSeekMate, startFlee,
    startVisit, startPlaydate: (actor, partner, kind) => familyTaskModule.startPlaydate(contextFor(actor), partner, kind), startConflict,
    isDayFor, isNightFor, needsRest,
    config, features, modules, opportunities, runOpportunities, runOpportunity, interruptActor,
    starsRescue: (actor, kind) => stars.onRescue(actor, kind),
    starsSting: (actor) => stars.onSting(actor),
    starsState: (actor) => stars.state(actor),
    starsBlockReason: (actor) => stars.blockReason(actor),
    starsUpdate: (actor, dt) => stars.update(actor, dt),
    commitFarewell,
    cancelFarewell: (actor) => stars.cancel(actor),
    cancelFarewells,
    ensureTraits, invalidateActor: (actor) => config.invalidateActor(actor),
    mood: (actor) => actor && actor.ai ? {
      value: finite(actor.ai.mood, 0),
      bucket: finite(actor.ai.moodBucket, 0),
      at: finite(actor.ai.moodAt, 0),
      label: moodLabel(finite(actor.ai.mood, 0)).key,
      target: moodFor(actor, { day: dayNow(), hours: hoursNow(), mourning: features.mourning }),
    } : null,
    mournDeparture,
    mourning: (actor) => actor ? (actor.mourning || []).map(record => ({ ...record })) : [],
    mourningLabel: (actor) => mourningLabel(actor, { day: dayNow(), hours: hoursNow() }),
    coverSlot, coverConflictOutcome, coverHour, coverFlee,
    adapterSleepDone, adapterOnSleep, adapterOnWake, adapterHungerOpportunity,
    noteDoorTransition,
    setModuleEnabled, setModuleParams, setActorConfig, setFeature,
    feature: (name) => !!features[name],
    coverage: coverageSnapshot,
  };

  return {
    attach, tick, plan, stats: statsNow, registerAdapter,
    setEnabled, onGrab, onRelease, detach, resumeTask, debugState,
    setNeed, setBond, forceSocial, forceInvite, forceVisit, forceMate, forcePlaydate, forceConflict, forceMeal, forceLesson, forceGift,
    forceChat, forceCuddle, forceReconcile, forcePartnership, forceGroup, separatePartnership, cancelPair,
    dropCarried: (actor) => actor && actor.carriedFood
      ? giftingModule.dropCarried(actor, field, contextFor(actor)) : null,
    startSeekHome, startPlaydate: (actor, partner, kind) => familyTaskModule.startPlaydate(contextFor(actor), partner, kind),
    setModuleEnabled, setModuleParams, setActorConfig, setFeature, interruptActor,
    invalidateActor: (actor) => config.invalidateActor(actor),
    stars,
    adoption: adoptionInfo,
    followTargetFor,
    commitFarewell,
    cancelFarewells,
    get enabled() { return enabled; },
    get actors() { return actors(); },
    get configVersion() { return configVersion; },
    coverage: coverageSnapshot,
    api,
  };
}
