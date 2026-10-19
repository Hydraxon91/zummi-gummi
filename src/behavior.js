// Shared life/behavior engine.
//
// One engine decides needs, utilities, state transitions, pair interactions and
// family tasks for every Meadow actor. Representations supply a small adapter
// for gating and visual hand-off; they do not own a second copy of the rules.
//
// The engine deliberately works on actor fields (cx/cz, hunger, bonds, ...) and
// never on Box3D bodies or three.js objects.

import {
  canMate, GESTATION_TIME, MATE_COOLDOWN, MATE_TIME, MATE_FOOD_MIN, PREGNANCY_HUNGER, HOME_CAPACITY,
} from './life.js';
import { profileFor } from './behaviorprofiles.js';
import { canSpeciesBreed } from './dna.js';
import { isSafeFood } from './foodtypes.js';
import {
  familyRelation, addBond, pairBond, skillsFor, forageEatScale,
  socialAcceptBonus, pushHistory, playdateDue, schedulePlaydate,
  nextPlaydateDay, teachSkill, PLAYDATE_WINDOW,
} from './family.js';
import {
  INTERACTIONS, interactionFor, startTask, cancelTask,
  pairAvailable, actorAvailable, beginPair, endPair, breakPair as breakSharedPair,
} from './interactions.js';

const STUCK_DIST2 = .04;
const HEART_INTERVAL = .72;

function finite(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return n < lo ? lo : (n > hi ? hi : n);
}

function unit(v) {
  return clamp(finite(v, 0), 0, 1);
}

function dist(a, b) {
  return Math.hypot(a.cx - b.cx, a.cz - b.cz);
}

export function createBehavior({
  field,
  getActors,
  getHours,
  getDay,
  getPopulationCap,
  getAdapter,
  rng = Math.random,
} = {}) {
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
  const hoursNow = () => {
    const h = Number(typeof getHours === 'function' ? getHours() : getHours);
    return Number.isFinite(h) ? h : 12;
  };
  const dayNow = () => {
    const d = Number(typeof getDay === 'function' ? getDay() : getDay);
    return Number.isFinite(d) ? Math.max(0, Math.floor(d)) : 0;
  };
  const populationCap = () => Math.max(1, Number(typeof getPopulationCap === 'function'
    ? getPopulationCap() : getPopulationCap) || 40);
  const stats = { ticks: 0, ms: 0 };
  let enabled = true;

  function profile(actor) {
    return profileFor(actor);
  }

  function isDayFor(actor) {
    const p = profile(actor);
    const h = hoursNow();
    if (p.rest.mode === 'night') return !isNightFor(actor);
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
    const p = profile(actor);
    actor.hunger = finite(actor.hunger, .30);
    actor.thirst = finite(actor.thirst, .30);
    actor.energy = clamp(finite(actor.energy, 1), 0, 1);
    actor.bold = clamp(finite(actor.bold, .5), 0, 1);
    actor.social = clamp(finite(actor.social, .3), 0, 1);
    actor.affection = clamp(finite(actor.affection, .25), 0, 1);
    actor.bedtime = clamp(finite(actor.bedtime,
      (p.rest.nightStart || 20) + rng() * 2.5), 0, 23.99);
    actor.wakeTime = clamp(finite(actor.wakeTime,
      (p.rest.nightEnd || 6) - 1 + rng() * 2), 0, 23.99);
    if (!actor.bonds || typeof actor.bonds !== 'object') actor.bonds = {};
    if (!actor.skills || typeof actor.skills !== 'object') actor.skills = {};
    if (!actor.playdates || typeof actor.playdates !== 'object') actor.playdates = {};
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
      directives: [],
      directive: null,
      directiveStatus: null,
      directiveHome: false,
      possessed: false,
      familyTask: null,
      playdate: false,
      playdateHome: null,
      playdateTarget: null,
      shelter: false,
      waitForPartner: false,
      hopState: null,
      hopWait: 0,
      turnWait: 0,
      rippleT: 0,
    };
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
    const partner = actor.ai.partner;
    releaseFood(actor);
    if (partner) releaseFood(partner);
    breakSharedPair(actor, { stop });
    if (['social', 'invite', 'decline', 'visit', 'seekCompany', 'seekMate', 'mate', 'familyTask', 'conflict'].includes(actor.ai.state)) {
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

  function wanderCandidate(actor, minR, maxR, maxShift, requireDistance) {
    if (!field || !field.nav) return null;
    const p = profile(actor);
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
      const path = pathTo(actor, near.x, near.z);
      if (!path) continue;
      return { x: near.x, z: near.z, path };
    }
    return null;
  }

  function pickWanderTarget(actor) {
    if (!field || !field.nav) return null;
    const p = profile(actor);
    const w = p.wander;
    let target = null;
    if (w.longChance > 0 && rng() < w.longChance) {
      target = wanderCandidate(actor, w.longMin, w.longMax, w.longShift, w.longMin * w.longSnapFloor);
    }
    if (!target) target = wanderCandidate(actor, w.min, w.max, w.shortShift, 0);
    if (!target) return null;
    actor.ai.target = { x: target.x, z: target.z };
    face(actor, target.x, target.z);
    setPath(actor, target.path);
    return actor.ai.target;
  }

  function acquireFood(actor) {
    if (!field || !field.food || !actor || !actor.ai) return null;
    const p = profile(actor);
    const exclude = new Set();
    for (let tries = 0; tries < 5; tries++) {
      const source = field.food.nearestRipe(actor.cx, actor.cz, {
        maxDistance: p.food.searchRadius, bear: actor, exclude, safe: true,
      });
      if (!source) break;
      exclude.add(source.id);
      if (!field.food.claim(source, actor)) continue;
      const path = pathTo(actor, source.approachX, source.approachZ);
      if (!path && Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz) > 1.25) {
        field.food.release(source, actor);
        continue;
      }
      actor.ai.source = source;
      actor.ai.state = 'seekFood';
      actor.ai.target = { x: source.approachX, z: source.approachZ };
      setPath(actor, path || [{ x: source.approachX, z: source.approachZ }]);
      face(actor, source.approachX, source.approachZ);
      return source;
    }
    return null;
  }

  function acquireWater(actor) {
    if (!field || !Array.isArray(field.waterSpots) || !field.waterSpots.length || !actor.ai) return null;
    let best = null;
    let bestD = Infinity;
    for (const spot of field.waterSpots) {
      const d = Math.hypot(spot.x - actor.cx, spot.z - actor.cz);
      if (d < bestD) { bestD = d; best = spot; }
    }
    if (!best) return null;
    const path = pathTo(actor, best.x, best.z);
    actor.ai.waterSpot = best;
    actor.ai.state = 'seekWater';
    actor.ai.target = { x: best.x, z: best.z };
    setPath(actor, path || [{ x: best.x, z: best.z }]);
    face(actor, best.x, best.z);
    return best;
  }

  /* ------------------------------------------------------------ hive/conflict */

  function hiveThreshold(actor) {
    const hive = profile(actor).hive;
    if (!hive) return Infinity;
    const bold = finite(actor.bold, .5);
    const desperation = finite(actor.hunger, 0) >= .92 ? 5 : 0;
    return Math.max(hive.hardFloor,
      hive.health + (.5 - bold) * 30 - desperation);
  }

  function canRaidHive(actor) {
    const hive = profile(actor).hive;
    return !!hive && !!actor && !actor.sleeping &&
      finite(actor.health, 100) > hiveThreshold(actor) &&
      finite(actor.hunger, 0) >= hive.hunger;
  }

  function acquireHive(actor) {
    const hive = profile(actor).hive;
    if (!hive || !field || !field.food || !actor.ai || !canRaidHive(actor)) return null;
    const exclude = new Set();
    for (let tries = 0; tries < 3; tries++) {
      const source = field.food.nearestRipe(actor.cx, actor.cz, {
        maxDistance: 52, bear: actor, exclude, kinds: ['hive'],
      });
      if (!source) break;
      exclude.add(source.id);
      if (!field.food.claim(source, actor)) continue;
      const path = pathTo(actor, source.approachX, source.approachZ);
      if (!path && Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz) > 1.25) {
        field.food.release(source, actor);
        continue;
      }
      actor.ai.source = source;
      actor.ai.state = 'seekHive';
      actor.ai.target = { x: source.approachX, z: source.approachZ };
      setPath(actor, path || [{ x: source.approachX, z: source.approachZ }]);
      face(actor, source.approachX, source.approachZ);
      return source;
    }
    return null;
  }

  function thinkSeekHive(actor) {
    const hive = profile(actor).hive;
    if (!hive || !actor.ai) return;
    let source = actor.ai.source;
    if (!source || !source.ripe || (source.claim && source.claim !== actor) || !canRaidHive(actor)) {
      releaseFood(actor);
      actor.ai.state = 'seekFood';
      actor.ai.nextThink = 0;
      stop(actor);
      return;
    }
    const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
    if (d <= hive.dist) { startHiveRaid(actor); return; }
    if (!actor.ai.path || !actor.ai.path.length) {
      if (!setDestination(actor, source.approachX, source.approachZ)) {
        releaseFood(actor);
        actor.ai.state = 'seekFood';
        actor.ai.idleT = .7;
      }
    }
  }

  function startHiveRaid(actor) {
    const hive = profile(actor).hive;
    if (!hive || !actor.ai || !actor.ai.source) return;
    actor.ai.state = 'raidHive';
    actor.ai.raidT = hive.raidTime;
    actor.ai.moving = false;
    actor.ai.path = null;
    face(actor, actor.ai.source.x, actor.ai.source.z);
  }

  function finishHiveRaid(actor) {
    const hive = profile(actor).hive;
    if (!hive || !actor.ai) return;
    const source = actor.ai.source;
    if (!source) {
      actor.ai.state = 'wander';
      actor.ai.idleT = .5;
      return;
    }
    if (rng() < hive.stingChance) {
      actor.health = Math.max(1, actor.health - hive.damage);
      actor.ai.stungT = 2.0;
      releaseFood(actor);
      if (field && field.sting) field.sting(source.x, source.z, source.y);
      startFlee(actor, source);
      return;
    }
    if (field.food.consume(source, actor)) {
      actor.hunger = Math.max(0, actor.hunger - source.satiation);
    }
    actor.ai.source = null;
    actor.ai.target = null;
    actor.ai.faceYaw = null;
    actor.ai.state = 'wander';
    actor.ai.idleT = .9;
    actor.ai.taskCooldown = 1.3;
    stop(actor);
  }

  function startFlee(actor, source) {
    if (!actor || !actor.ai) return;
    const hive = profile(actor).hive;
    cancelPair(actor);
    releaseFood(actor);
    actor.ai.follow = null;
    actor.ai.target = null;
    actor.ai.faceYaw = null;
    actor.ai.state = 'flee';
    actor.ai.fleeT = hive ? hive.fleeTime : 1.4;
    actor.ai.fleeFrom = source ? { x: source.x, z: source.z } : null;
    if (!field || !field.nav) return;
    const dx = actor.cx - (source ? source.x : actor.cx);
    const dz = actor.cz - (source ? source.z : actor.cz);
    const len = Math.hypot(dx, dz) || 1;
    const p = field.nav.nearestWalkable(actor.cx + dx / len * 4.5, actor.cz + dz / len * 4.5);
    if (!p) return;
    actor.ai.target = { x: p.x, z: p.z };
    face(actor, p.x, p.z);
    const path = pathTo(actor, p.x, p.z);
    if (path) setPath(actor, path);
    else actor.ai.moving = false;
  }

  function findContest(actor) {
    const conflict = profile(actor).conflict;
    if (!conflict || !actor || !actor.ai || !field || !field.food || !field.food.sources) return null;
    if (actor.hunger < profile(actor).thresholds.seekHunger ||
        actor.health < profile(actor).thresholds.healthWoozy ||
        actor.ai.conflictCooldown > 0) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const source of field.food.sources) {
      if (!source.ripe || !source.claim || source.claim === actor) continue;
      if (!isSafeFood(source)) continue;
      const other = source.claim;
      if (!other || !other.active || other.sleeping ||
          other.health < profile(other).thresholds.healthWoozy) continue;
      if (!other.ai || !['wander', 'seekFood', 'eat', 'drink', 'seekWater', 'seekCompany'].includes(other.ai.state)) continue;
      if (other.grabs > 0 || other.inPond) continue;
      const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
      if (d > conflict.radius) continue;
      const dc = Math.hypot(other.cx - source.approachX, other.cz - source.approachZ);
      if (dc > 3.5) continue;
      if (actor.bold < .30 && other.scale > actor.scale * 1.06) continue;
      const score = (1 - d / conflict.radius) * .6 + actor.hunger * .5 +
        (actor.scale >= other.scale ? .08 : 0) - pairBond(actor, other) * .25;
      if (score > bestScore) { bestScore = score; best = { source, actor: other }; }
    }
    return best;
  }

  function acquireContest(actor) {
    if (!profile(actor).conflict) return null;
    const contest = findContest(actor);
    if (!contest) return null;
    releaseFood(actor);
    actor.ai.source = null;
    actor.ai.contestSource = contest.source;
    actor.ai.contestBear = contest.actor;
    actor.ai.state = 'seekConflict';
    actor.ai.target = { x: contest.source.approachX, z: contest.source.approachZ };
    face(actor, contest.source.approachX, contest.source.approachZ);
    setDestination(actor, contest.source.approachX, contest.source.approachZ);
    return contest.source;
  }

  function thinkSeekConflict(actor) {
    if (!actor || !actor.ai) return;
    const source = actor.ai.contestSource;
    const other = source ? source.claim : actor.ai.contestBear;
    if (!source || !source.ripe || !other || !other.active || other.sleeping ||
        other.grabs > 0 || other.inPond || !other.ai) {
      actor.ai.contestSource = null;
      actor.ai.contestBear = null;
      actor.ai.state = 'wander';
      actor.ai.idleT = .6;
      actor.ai.conflictCooldown = Math.max(actor.ai.conflictCooldown, 2);
      stop(actor);
      return;
    }
    const d = Math.hypot(other.cx - actor.cx, other.cz - actor.cz);
    if (d <= profile(actor).conflict.dist) {
      startConflict(actor, other, source);
      return;
    }
    actor.ai.target = { x: source.approachX, z: source.approachZ };
    face(actor, source.approachX, source.approachZ);
    if (!actor.ai.path || !actor.ai.path.length) {
      if (!setDestination(actor, source.approachX, source.approachZ)) {
        actor.ai.contestSource = null;
        actor.ai.contestBear = null;
        actor.ai.state = 'wander';
        actor.ai.idleT = .6;
        actor.ai.conflictCooldown = Math.max(actor.ai.conflictCooldown, 3);
      }
    }
  }

  function startConflict(actor, other, source) {
    const conflict = profile(actor).conflict;
    if (!conflict || !actor || !other || !actor.ai || !other.ai || actor === other) return false;
    beginPair(actor, other, 'conflict', { stop, face });
    actor.ai.conflictT = conflict.time;
    other.ai.conflictT = conflict.time;
    actor.ai.conflictSource = source;
    other.ai.conflictSource = source;
    actor.ai.target = { x: other.cx, z: other.cz };
    other.ai.target = { x: actor.cx, z: actor.cz };
    actor.ai.animT = 0;
    other.ai.animT = 0;
    emit(actor, 'exclaim', 1.14);
    emit(other, 'exclaim', 1.14);
    return true;
  }

  function finishConflict(actor) {
    const conflict = profile(actor).conflict;
    if (!conflict || !actor || !actor.ai || actor.ai.state !== 'conflict') return;
    const other = actor.ai.partner;
    const source = actor.ai.conflictSource || (other && other.ai ? other.ai.conflictSource : null);
    if (!other || !other.ai) {
      actor.ai.state = 'wander';
      actor.ai.partner = null;
      actor.ai.conflictSource = null;
      actor.ai.conflictT = 0;
      stop(actor);
      return;
    }
    const weight = (bear) => (bear.scale || 1) * 1.05 + unit(bear.hunger) * .75 +
      unit(bear.bold) * .35 + unit(bear.energy) * .15 + rng() * .20;
    const winner = weight(actor) >= weight(other) ? actor : other;
    const loser = winner === actor ? other : actor;
    const claimant = source ? source.claim : null;
    const claimOk = !!source && source.ripe;

    actor.ai.partner = null;
    other.ai.partner = null;
    actor.ai.conflictSource = null;
    other.ai.conflictSource = null;
    actor.ai.contestSource = null;
    other.ai.contestSource = null;
    actor.ai.contestBear = null;
    other.ai.contestBear = null;
    actor.ai.conflictT = 0;
    other.ai.conflictT = 0;

    if (claimOk && winner !== claimant) {
      field.food.release(source, claimant);
      field.food.claim(source, winner);
    }

    const loserWasClaimant = loser === claimant;
    if (loserWasClaimant && source) field.food.release(source, loser);
    releaseFood(loser);
    loser.ai.source = null;
    loser.ai.state = 'wander';
    loser.ai.idleT = .8;
    loser.ai.taskCooldown = 2.4;
    loser.ai.conflictCooldown = conflict.cooldown;
    loser.ai.socialCooldown = Math.max(loser.ai.socialCooldown, 4.0);
    stop(loser);
    const dx = loser.cx - winner.cx;
    const dz = loser.cz - winner.cz;
    const len = Math.hypot(dx, dz) || 1;
    loser.ai.shove = { x: dx / len * 1.15, z: dz / len * 1.15 };

    winner.ai.taskCooldown = .35;
    winner.ai.conflictCooldown = 5;
    winner.ai.idleT = .2;
    if (claimOk && source.claim === winner) {
      winner.ai.source = source;
      winner.ai.target = { x: source.approachX, z: source.approachZ };
      const d = Math.hypot(source.approachX - winner.cx, source.approachZ - winner.cz);
      if (d <= profile(winner).food.eatDist) {
        startEat(winner);
      } else {
        winner.ai.state = 'seekFood';
        setDestination(winner, source.approachX, source.approachZ);
      }
    } else {
      winner.ai.source = null;
      winner.ai.state = 'wander';
      winner.ai.idleT = .5;
      stop(winner);
    }
    addBond(actor, other, -.08);
    emit(loser, 'no', 1.05);
  }

  /* ---------------------------------------------------------------- needs */

  function tickNeeds(actor, dt) {
    const p = profile(actor);
    const n = p.needs;
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
    const p = profile(actor);
    if (p.rest.mode !== 'night') return false;
    if (!homeFor(actor)) return false;
    if (actor.health < p.thresholds.healthWoozy) return true;
    if (actor.hunger >= p.thresholds.criticalHunger || actor.thirst >= p.thresholds.criticalThirst) return false;
    return isNightFor(actor) || actor.health < p.thresholds.healthHurt ||
      actor.energy < p.thresholds.energyTired;
  }

  function sleepDone(actor) {
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.sleepDone === 'function') return adapter.sleepDone(actor, {
      hours: hoursNow(), day: dayNow(), isDay: isDayFor(actor), isNight: isNightFor(actor),
    });
    const p = profile(actor);
    return !isNightFor(actor) && actor.health >= p.thresholds.healthHurt &&
      actor.energy >= p.thresholds.energyTired;
  }

  /* ---------------------------------------------------------- state change */

  function startSeekHome(actor, restKind = null) {
    if (!actor || !actor.ai) return false;
    cancelPair(actor);
    releaseFood(actor);
    actor.ai.source = null;
    actor.ai.waterSpot = null;
    actor.ai.follow = null;
    actor.ai.target = null;
    actor.ai.faceYaw = null;
    actor.ai.state = 'seekHome';
    actor.ai.restKind = restKind || (profile(actor).rest.mode === 'night' ? 'night' : 'shelter');
    actor.ai.idleT = 0;
    stop(actor);
    return true;
  }

  function startSleep(actor, home, restKind = 'night') {
    if (!actor || !actor.ai || !home) return false;
    actor.ai.directiveHome = false;
    actor.ai.state = 'sleep';
    actor.ai.restKind = restKind;
    actor.ai.sleepHome = home.name;
    stop(actor);
    face(actor, home.door.x, home.door.z);
    actor.sleeping = true;
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.onSleep === 'function') adapter.onSleep(actor, home, restKind);
    return true;
  }

  function wake(actor) {
    if (!actor || !actor.ai) return;
    actor.sleeping = false;
    actor.needsBuild = true;
    actor.ai.state = 'wander';
    actor.ai.restKind = null;
    actor.ai.sleepHome = null;
    actor.ai.idleT = .5;
    actor.ai.taskCooldown = .8;
    actor.ai.nextThink = 0;
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.onWake === 'function') adapter.onWake(actor);
  }

  function finishFood(actor) {
    if (!actor || !actor.ai) return;
    if (!actor.ai.source) {
      actor.ai.state = 'wander';
      actor.ai.idleT = .5;
      clearPath(actor);
      return;
    }
    const source = actor.ai.source;
    const p = profile(actor);
    if (field.food.consume(source, actor)) {
      actor.hunger = Math.max(0, actor.hunger - source.satiation * forageEatScale(actor));
    }
    actor.ai.source = null;
    actor.ai.target = null;
    actor.ai.faceYaw = null;
    actor.ai.state = 'wander';
    actor.ai.idleT = .8;
    actor.ai.taskCooldown = p.food.eatTime > 1.2 ? 1.3 : 1.2;
    clearPath(actor);
  }

  function finishWater(actor) {
    if (!actor || !actor.ai) return;
    const p = profile(actor);
    actor.thirst = Math.max(0, actor.thirst - (p.id === 'glass' ? .52 : .55));
    actor.ai.waterSpot = null;
    actor.ai.target = null;
    actor.ai.faceYaw = null;
    actor.ai.state = 'wander';
    actor.ai.idleT = .8;
    actor.ai.taskCooldown = 1.0;
    clearPath(actor);
  }

  function startEat(actor) {
    if (!actor || !actor.ai || !actor.ai.source) return;
    const p = profile(actor);
    actor.ai.state = 'eat';
    actor.ai.eatT = p.food.eatTime * forageEatScale(actor);
    actor.ai.animT = 0;
    actor.ai.moving = false;
    actor.ai.path = null;
    face(actor, actor.ai.source.x, actor.ai.source.z);
  }

  function startDrink(actor) {
    if (!actor || !actor.ai || !actor.ai.waterSpot) return;
    const p = profile(actor);
    const spot = actor.ai.waterSpot;
    actor.ai.state = 'drink';
    actor.ai.drinkT = p.food.drinkTime;
    actor.ai.animT = 0;
    actor.ai.rippleT = 0;
    actor.ai.moving = false;
    actor.ai.path = null;
    face(actor, spot.waterX, spot.waterZ);
    if (field && field.splash) field.splash(spot.waterX, spot.waterZ, .45);
  }

  /* ----------------------------------------------------------- pair states */

  function canCompany(actor, other) {
    if (!pairAvailable(actor, other, { states: ['wander', 'seekCompany', 'stargaze', 'seekSocial'] })) return false;
    if (!['wander', 'seekCompany', 'stargaze', 'seekSocial'].includes(other.ai.state)) return false;
    const p = profile(actor);
    if (other.health < p.thresholds.healthWoozy) return false;
    return true;
  }

  function acquireCompany(actor) {
    if (!actor || !actor.ai || actor.ai.socialCooldown > 0) return null;
    const p = profile(actor);
    if (actor.social < p.thresholds.seekSocial && actor.affection < p.thresholds.seekAffection) return null;
    actor.ai.familyPlay = false;
    actor.ai.playmateKind = null;
    let best = null;
    let bestScore = -Infinity;
    for (const other of actors()) {
      if (!canCompany(actor, other)) continue;
      const d = dist(actor, other);
      if (d > p.social.radius) continue;
      const bond = pairBond(actor, other);
      const need = unit(other.social);
      const relation = familyRelation(actor, other);
      const familyBonus = actor.ai.familyPlayCooldown > 0 ? 0
        : relation === 'sibling' ? .35 : (relation === 'parent' || relation === 'child') ? .2 : 0;
      const score = bond * 1.3 + need * .7 - d * .025 + familyBonus +
        (other.ai.state === 'wander' && !other.ai.moving ? .18 : 0) +
        (rng() - .5) * .08;
      if (score > bestScore) { bestScore = score; best = other; }
    }
    if (!best) {
      actor.ai.socialCooldown = 3.0;
      return null;
    }
    const relation = familyRelation(actor, best);
    actor.ai.familyPlay = actor.ai.familyPlayCooldown <= 0 &&
      (relation === 'sibling' || relation === 'parent' || relation === 'child');
    actor.ai.playmateKind = actor.ai.familyPlay ? relation : null;
    startSeekCompany(actor, best);
    return best;
  }

  function startSeekCompany(actor, partner) {
    if (!actor || !actor.ai || !partner || !partner.ai) return false;
    releaseFood(actor);
    actor.ai.waterSpot = null;
    beginPair(actor, partner, 'seekCompany', { stop, face });
    actor.ai.target = { x: partner.cx, z: partner.cz };
    setDestination(actor, partner.cx, partner.cz);
    return true;
  }

  function thinkSeekCompany(actor) {
    if (!actor || !actor.ai) return;
    const p = profile(actor);
    const partner = actor.ai.partner;
    if (!canCompany(actor, partner)) {
      if (partner && partner.ai && partner.ai.partner === actor) cancelPair(actor);
      actor.ai.state = 'wander';
      actor.ai.idleT = .5;
      actor.ai.socialCooldown = Math.max(actor.ai.socialCooldown, 3.0);
      stop(actor);
      return;
    }
    if (actor.social < p.thresholds.stopSocial && actor.affection < p.thresholds.stopSocial) {
      cancelPair(actor);
      actor.ai.state = 'wander';
      actor.ai.idleT = .5;
      stop(actor);
      return;
    }
    const d = dist(actor, partner);
    if (d <= p.social.dist) { startInvite(actor, partner); return; }
    if (!actor.ai.path || !actor.ai.path.length) {
      if (!setDestination(actor, partner.cx, partner.cz) && d > 2.2) {
        cancelPair(actor);
        actor.ai.state = 'wander';
        actor.ai.idleT = .7;
        actor.ai.socialCooldown = Math.max(actor.ai.socialCooldown, 3.0);
      }
    }
  }

  function decideAccept(initiator, partner) {
    const p = profile(partner);
    const need = unit(partner.social);
    const bond = pairBond(initiator, partner);
    let chance = .30 + need * .55 + bond * .30 + (partner.ai.state === 'wander' ? .12 : 0) +
      socialAcceptBonus(partner);
    if (partner.health < p.thresholds.healthHurt) chance -= .18;
    if (partner.energy < p.thresholds.energyTired) chance -= .12;
    chance = clamp(chance, .15, .94);
    return rng() < chance;
  }

  function startInvite(actor, partner, acceptedOverride) {
    if (!actor || !actor.ai || !partner || !partner.ai) return false;
    if (!canCompany(actor, partner)) return false;
    const accepted = acceptedOverride === undefined ? decideAccept(actor, partner) : !!acceptedOverride;
    actor.ai.state = 'invite';
    actor.ai.partner = partner;
    actor.ai.inviteAccepted = accepted;
    actor.ai.inviteT = profile(actor).social.inviteTime;
    actor.ai.moving = false;
    actor.ai.path = null;
    actor.ai.target = { x: partner.cx, z: partner.cz };
    face(actor, partner.cx, partner.cz);
    partner.ai.partner = actor;
    partner.ai.inviteAccepted = accepted;
    partner.ai.inviteT = profile(partner).social.inviteTime;
    partner.ai.declineT = profile(partner).social.declineTime;
    partner.ai.moving = false;
    partner.ai.path = null;
    partner.ai.target = { x: actor.cx, z: actor.cz };
    face(partner, actor.cx, actor.cz);
    partner.ai.state = accepted ? 'invite' : 'decline';
    emit(actor, 'question', 1.08);
    return true;
  }

  function beginSocialPair(actor, partner, familyPlay = false, playmateKind = null) {
    if (!actor || !partner || !actor.ai || !partner.ai) return false;
    const p = profile(actor);
    const family = !!(familyPlay || actor.ai.familyPlay || partner.ai.familyPlay);
    const kind = playmateKind || actor.ai.playmateKind || partner.ai.playmateKind || 'family';
    const duration = family ? p.social.familySocialTime : p.social.socialTime;
    beginPair(actor, partner, 'social', { stop, face });
    actor.ai.socialT = duration;
    partner.ai.socialT = duration;
    actor.ai.familyPlay = family;
    partner.ai.familyPlay = family;
    actor.ai.playmateKind = family ? kind : null;
    partner.ai.playmateKind = family ? kind : null;
    actor.ai.inviteT = 0;
    partner.ai.inviteT = 0;
    actor.ai.heartT = 0;
    partner.ai.heartT = .22;
    actor.ai.animT = 0;
    partner.ai.animT = 0;
    actor.ai.target = { x: partner.cx, z: partner.cz };
    partner.ai.target = { x: actor.cx, z: actor.cz };
    emit(actor, 'heart', .9);
    return true;
  }

  function settleSocial(actor) {
    if (!actor || !actor.ai) return;
    const p = profile(actor);
    actor.social = Math.max(0, actor.social - p.social.relief);
    actor.affection = Math.max(0, actor.affection - p.social.affectionRelief);
    actor.ai.socialCooldown = p.social.cooldown;
  }

  function endSocialPair(actor) {
    if (!actor || !actor.ai || actor.ai.state !== 'social') return;
    const p = profile(actor);
    const partner = actor.ai.partner;
    const familyPlay = !!(actor.ai.familyPlay || (partner && partner.ai && partner.ai.familyPlay));
    settleSocial(actor);
    if (partner && partner.ai && partner.ai.state === 'social' && partner.ai.partner === actor) settleSocial(partner);
    addBond(actor, partner, (familyPlay ? p.social.familyBondBase : p.social.bondBase) + rng() * p.social.bondJitter);
    if (familyPlay) {
      addBond(actor, partner, p.social.familyBondExtra);
      actor.ai.familyPlayCooldown = 18;
      if (partner && partner.ai) partner.ai.familyPlayCooldown = 18;
      scheduleNextPlaydate(actor, partner);
    }
    endPair(actor, { stop, next: 'wander', idleT: .55, taskCooldown: 1.0 });
    const canVisit = partner && isDayFor(actor) &&
      pairBond(actor, partner) >= p.social.visitBond && rng() < p.social.visitChance;
    if (canVisit) startVisit(actor, partner);
  }

  function startDeclinePair(actor, partner) {
    if (!actor || !actor.ai || !partner || !partner.ai) return;
    const p = profile(actor);
    beginPair(actor, partner, 'decline', { stop, face });
    actor.ai.declineT = p.social.declineTime;
    partner.ai.declineT = profile(partner).social.declineTime;
    actor.ai.inviteT = 0;
    partner.ai.inviteT = 0;
    actor.ai.socialCooldown = Math.max(actor.ai.socialCooldown, 4.0);
    partner.ai.socialCooldown = Math.max(partner.ai.socialCooldown, 2.5);
    emit(actor, 'no', 1.08);
    emit(partner, 'no', 1.08);
  }

  function finishDeclinePair(actor) {
    if (!actor || !actor.ai || actor.ai.state !== 'decline') return;
    endPair(actor, { stop, next: 'wander', idleT: .55 });
  }

  function resolveInvite(actor) {
    if (!actor || !actor.ai || actor.ai.state !== 'invite' || actor.ai.inviteT > 0) return;
    const partner = actor.ai.partner;
    if (!partner || !partner.ai) {
      actor.ai.state = 'wander';
      actor.ai.partner = null;
      stop(actor);
      return;
    }
    if (actor.ai.inviteAccepted) beginSocialPair(actor, partner);
    else startDeclinePair(actor, partner);
  }

  /* ---------------------------------------------------------------- visits */

  function startVisit(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai || actor === partner) return false;
    if (!isDayFor(actor)) return false;
    const home = homeFor(actor);
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
    actor.ai.state = 'visit';
    partner.ai.state = 'visit';
    actor.ai.partner = partner;
    partner.ai.partner = actor;
    actor.ai.visitHome = home.name;
    partner.ai.visitHome = home.name;
    actor.ai.visitRole = 'host';
    partner.ai.visitRole = 'guest';
    actor.ai.visitPhase = 'travel';
    partner.ai.visitPhase = 'travel';
    actor.ai.visitT = 0;
    partner.ai.visitT = 0;
    actor.ai.visitArrived = false;
    partner.ai.visitArrived = false;
    actor.ai.moving = false;
    partner.ai.moving = false;
    actor.ai.target = { x: home.door.x, z: home.door.z };
    partner.ai.target = { x: gx, z: gz };
    face(actor, home.door.x, home.door.z);
    face(partner, gx, gz);
    setPath(actor, pathTo(actor, home.door.x, home.door.z) || [{ x: home.door.x, z: home.door.z }]);
    setPath(partner, pathTo(partner, gx, gz) || [{ x: gx, z: gz }]);
    emit(actor, 'heart', .95);
    return true;
  }

  function beginVisitHangout(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai) return;
    const p = profile(actor);
    actor.ai.visitPhase = 'hangout';
    partner.ai.visitPhase = 'hangout';
    actor.ai.visitT = p.social.visitTime;
    partner.ai.visitT = p.social.visitTime;
    actor.ai.animT = 0;
    partner.ai.animT = 0;
    actor.ai.heartT = .3;
    partner.ai.heartT = 1.0;
    actor.ai.moving = false;
    partner.ai.moving = false;
    actor.ai.path = null;
    partner.ai.path = null;
    face(actor, partner.cx, partner.cz);
    face(partner, actor.cx, actor.cz);
    emit(actor, 'heart', .95);
  }

  function finishVisitPair(actor) {
    if (!actor || !actor.ai || actor.ai.state !== 'visit') return;
    const partner = actor.ai.partner;
    addBond(actor, partner, .08);
    actor.social = Math.max(0, actor.social - .22);
    actor.affection = Math.max(0, actor.affection - .16);
    actor.ai.socialCooldown = 8;
    endPair(actor, { stop, next: 'wander', idleT: .6, taskCooldown: 1.2, socialCooldown: 8 });
    if (partner && partner.ai) {
      partner.social = Math.max(0, partner.social - .22);
      partner.affection = Math.max(0, partner.affection - .16);
    }
  }

  function tickVisit(actor, dt) {
    if (!actor || !actor.ai || actor.ai.state !== 'visit') return;
    const partner = actor.ai.partner;
    if (!partner || !partner.ai || partner.ai.partner !== actor || partner.ai.state !== 'visit' || !isDayFor(actor)) {
      finishVisitPair(actor);
      return;
    }
    if (actor.ai.visitPhase === 'hangout') return;
    actor.ai.visitT = (actor.ai.visitT || 0) + dt;
    if (actor.ai.visitT > 12) { finishVisitPair(actor); return; }
    const home = field.homes.find(h => h.name === actor.ai.visitHome);
    if (!home || !actor.ai.target) { finishVisitPair(actor); return; }
    const target = actor.ai.target;
    const d = Math.hypot(target.x - actor.cx, target.z - actor.cz);
    if (d <= profile(actor).social.visitDist) {
      actor.ai.visitArrived = true;
      actor.ai.moving = false;
      actor.ai.path = null;
      if (partner.ai.visitArrived) {
        const host = actor.ai.visitRole === 'host' ? actor : partner;
        const guest = host === actor ? partner : actor;
        beginVisitHangout(host, guest);
      }
      return;
    }
    if (!actor.ai.path || !actor.ai.path.length) {
      if (!setDestination(actor, target.x, target.z) && d > 2.2) finishVisitPair(actor);
    }
  }

  /* ---------------------------------------------------------------- follow */

  function parentTarget(parent) {
    if (!parent) return null;
    if (parent.inside || parent.sleeping) {
      const home = field && Array.isArray(field.homes)
        ? field.homes.find(h => h.name === parent.home) : null;
      if (home) return { x: home.door.x, z: home.door.z };
    }
    return { x: parent.cx, z: parent.cz };
  }

  function startFollow(actor, parent) {
    if (!actor || !actor.ai || !parent || !parent.ai) return false;
    const target = parentTarget(parent);
    if (!target) return false;
    releaseFood(actor);
    actor.ai.source = null;
    actor.ai.waterSpot = null;
    actor.ai.follow = parent;
    actor.ai.state = 'follow';
    actor.ai.target = { x: target.x, z: target.z };
    face(actor, target.x, target.z);
    actor.ai.moving = false;
    setPath(actor, pathTo(actor, target.x, target.z) || [{ x: target.x, z: target.z }]);
    return true;
  }

  function thinkFollow(actor) {
    if (!actor || !actor.ai) return;
    const parent = actor.ai.follow;
    if (!parent || !parent.ai || !parent.active || parent.grabs > 0 || parent.inPond) {
      actor.ai.follow = null;
      actor.ai.state = 'wander';
      actor.ai.idleT = .5;
      stop(actor);
      return;
    }
    const target = parentTarget(parent);
    if (!target) return;
    const d = Math.hypot(target.x - actor.cx, target.z - actor.cz);
    const followDist = profile(actor).mate.followDist;
    if (d <= followDist) {
      actor.ai.moving = false;
      actor.ai.path = null;
      face(actor, parent.cx, parent.cz);
      return;
    }
    if (!actor.ai.path || !actor.ai.path.length) setDestination(actor, target.x, target.z);
  }

  /* ----------------------------------------------------------------- mate */

  function canMatePair(actor, other) {
    if (!actorAvailable(actor) || !actorAvailable(other)) return false;
    if (actor === other) return false;
    if (actor.inside || other.inside) return false;
    if (!['wander', 'seekMate', 'stargaze', 'seekCompany'].includes(other.ai?.state)) return false;
    const gate = canSpeciesBreed(actor.species, other.species, { current: true });
    if (!gate.ok) return false;
    const p = profile(actor);
    const softCount = actors().filter(a => a.active && a.kind !== 'glass').length;
    const room = p.mate.requiresRoom !== false ? softCount < populationCap() : true;
    return canMate(actor, other, { room, food: safeFoodCount() >= MATE_FOOD_MIN });
  }

  function acquireMate(actor) {
    if (!actor || actor.pregnant || actor.stage !== 'adult' || actor.mateCooldown > 0) return null;
    const p = profile(actor);
    if (actor.health < 70 || actor.hunger > .40 || actor.thirst > .60 || actor.energy < .30) return null;
    if (safeFoodCount() < MATE_FOOD_MIN) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const other of actors()) {
      if (!canMatePair(actor, other)) continue;
      const d = dist(actor, other);
      if (d > p.mate.radius) continue;
      const score = pairBond(actor, other) * .4 - d * .02 + (rng() - .5) * .05;
      if (score > bestScore) { bestScore = score; best = other; }
    }
    if (!best) return null;
    return startSeekMate(actor, best) ? best : null;
  }

  function startSeekMate(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai) return false;
    beginPair(actor, partner, 'seekMate', { stop, face });
    actor.ai.target = { x: partner.cx, z: partner.cz };
    return setDestination(actor, partner.cx, partner.cz);
  }

  function thinkSeekMate(actor) {
    if (!actor || !actor.ai) return;
    const partner = actor.ai.partner;
    if (!partner || !partner.ai || !partner.active || partner.ai.partner !== actor) {
      actor.ai.partner = null;
      actor.ai.state = 'wander';
      stop(actor);
      return;
    }
    const d = dist(actor, partner);
    if (d <= profile(actor).mate.dist) { startMatePair(actor, partner); return; }
    if (!actor.ai.path || !actor.ai.path.length) setDestination(actor, partner.cx, partner.cz);
  }

  function startMatePair(actor, partner) {
    if (!actor || !partner || !actor.ai || !partner.ai) return false;
    beginPair(actor, partner, 'mate', { stop, face });
    actor.ai.mateT = MATE_TIME;
    partner.ai.mateT = MATE_TIME;
    actor.ai.waitForPartner = false;
    partner.ai.waitForPartner = false;
    emit(actor, 'heart', 1.0);
    emit(partner, 'heart', 1.0);
    return true;
  }

  function finishMatePair(actor) {
    if (!actor || !actor.ai || actor.ai.state !== 'mate') return;
    const partner = actor.ai.partner;
    if (!partner || !partner.ai) {
      actor.ai.state = 'wander';
      actor.ai.partner = null;
      actor.ai.mateT = 0;
      stop(actor);
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
    pushHistory(actor, { kind: 'mated', uid: partner.uid, day: dayNow(), hour: hoursNow() });
    pushHistory(partner, { kind: 'mated', uid: actor.uid, day: dayNow(), hour: hoursNow() });
    endPair(actor, { stop, next: 'wander', idleT: .7, taskCooldown: 2.0 });
    actor.ai.mateT = 0;
    partner.ai.mateT = 0;
    emit(female, 'heart', 1.1);
  }

  /* -------------------------------------------------------------- playdate */

  function playdateAnchor(actor, partner) {
    if (!field || !Array.isArray(field.homes)) return { x: (actor.cx + partner.cx) * .5, z: (actor.cz + partner.cz) * .5 };
    const names = [actor.home, partner.home].filter(Boolean);
    const home = field.homes.find(candidate => names.includes(candidate.name));
    if (home) return { x: home.door.x, z: home.door.z, home: home.name };
    return { x: (actor.cx + partner.cx) * .5, z: (actor.cz + partner.cz) * .5 };
  }

  function acquireFamilyPlaymate(actor) {
    if (!actor || !actor.ai || actor.ai.familyPlayCooldown > 0 || actor.ai.socialCooldown > 0) return null;
    if (!actor.parentUids || !actor.parentUids.length) return null;
    if (!isDayFor(actor)) return null;
    const p = profile(actor);
    let best = null;
    let bestScore = -Infinity;
    for (const other of actors()) {
      if (!pairAvailable(actor, other, { states: ['wander', 'seekCompany', 'stargaze', 'seekSocial'] })) continue;
      const kind = familyRelation(actor, other);
      if (!kind || (kind !== 'sibling' && kind !== 'parent' && kind !== 'child')) continue;
      const d = dist(actor, other);
      if (d > 12) continue;
      const score = (kind === 'sibling' ? .35 : .2) + pairBond(actor, other) * .8 - d * .03;
      if (score > bestScore) { bestScore = score; best = { actor: other, kind }; }
    }
    return best;
  }

  function startPlaydate(actor, partner, kind) {
    if (!actor || !partner || !actor.ai || !partner.ai) return false;
    releaseFood(actor);
    releaseFood(partner);
    const anchor = playdateAnchor(actor, partner);
    const id = INTERACTIONS.familyPlaydate;
    startTask(actor, id, { role: 'host', partner, anchor, phase: 'travel' });
    actor.ai.familyPlay = true;
    actor.ai.playmateKind = kind;
    actor.ai.playdate = true;
    actor.ai.playdateHome = anchor.home || null;
    actor.ai.playdateTarget = { x: anchor.x, z: anchor.z };
    startTask(partner, id, { role: 'guest', partner: actor, anchor, phase: 'travel' });
    partner.ai.familyPlay = true;
    partner.ai.playmateKind = kind;
    partner.ai.playdate = true;
    partner.ai.playdateHome = anchor.home || null;
    partner.ai.playdateTarget = { x: anchor.x, z: anchor.z };
    setDestination(actor, anchor.x, anchor.z);
    setDestination(partner, anchor.x, anchor.z);
    const next = { day: nextPlaydateDay(dayNow()), hour: PLAYDATE_WINDOW.start };
    schedulePlaydate(actor, partner, next);
    return true;
  }

  function findDuePlaydate(actor) {
    if (!actor || !actor.playdates) return null;
    if (!isDayFor(actor)) return null;
    const day = dayNow();
    const hour = hoursNow();
    for (const [uid, record] of Object.entries(actor.playdates)) {
      if (!playdateDue(record, day, hour)) continue;
      const other = actors().find(candidate => candidate.active && String(candidate.uid) === String(uid));
      if (!other) { delete actor.playdates[uid]; continue; }
      if (!pairAvailable(actor, other, { states: ['wander', 'seekCompany', 'stargaze', 'seekSocial'] })) continue;
      return { other, record };
    }
    return null;
  }

  function scheduleNextPlaydate(actor, partner) {
    if (!actor || !partner) return;
    const next = { day: nextPlaydateDay(dayNow()), hour: PLAYDATE_WINDOW.start };
    schedulePlaydate(actor, partner, next);
  }

  /* ----------------------------------------------------------- family task */

  function finishFamilyTask(actor) {
    if (!actor || !actor.ai || !actor.ai.familyTask) return;
    const task = actor.ai.familyTask;
    const partner = actor.ai.partner;
    const day = dayNow();
    const hour = hoursNow();
    if (task.id === INTERACTIONS.familyPlaydate) {
      if (partner && partner.ai) {
        addBond(actor, partner, .18);
        actor.social = Math.max(0, actor.social - .42);
        actor.affection = Math.max(0, actor.affection - .30);
        partner.social = Math.max(0, partner.social - .42);
        partner.affection = Math.max(0, partner.affection - .30);
        pushHistory(actor, { kind: 'playdate', uid: partner.uid, day, hour });
        pushHistory(partner, { kind: 'playdate', uid: actor.uid, day, hour });
        actor.ai.familyPlayCooldown = 18;
        partner.ai.familyPlayCooldown = 18;
        scheduleNextPlaydate(actor, partner);
        emit(actor, 'heart', .95);
      }
      endPair(actor, { stop, next: 'wander', idleT: .6, taskCooldown: 1.0, socialCooldown: 8 });
    } else if (task.id === INTERACTIONS.familyLesson) {
      const teacher = task.role === 'teacher' ? actor : partner;
      const student = teacher === actor ? partner : actor;
      if (teacher && student) {
        const result = teachSkill(student, teacher);
        pushHistory(student, { kind: 'taught', uid: teacher.uid, day, hour });
        pushHistory(teacher, { kind: 'lesson', uid: student.uid, day, hour });
        emit(student, result.ok ? 'sparkle' : 'question', .95);
        endPair(actor, { stop, next: 'wander', idleT: .6, taskCooldown: 1.5 });
      } else {
        cancelTask(actor, { stop });
      }
    } else if (task.id === INTERACTIONS.familyMeal) {
      actor.hunger = Math.max(0, actor.hunger - .28);
      actor.social = Math.max(0, actor.social - .10);
      pushHistory(actor, { kind: 'meal', uid: 0, day, hour });
      cancelTask(actor, { stop });
    } else {
      cancelTask(actor, { stop });
    }
    actor.ai.familyPlay = false;
    actor.ai.playmateKind = null;
    actor.ai.playdate = false;
    actor.ai.playdateHome = null;
    actor.ai.playdateTarget = null;
  }

  /* -------------------------------------------------------------- thinking */

  function thinkWander(actor) {
    if (!actor || !actor.ai || actor.ai.state !== 'wander') return;
    const p = profile(actor);
    if (actor.ai.moving) {
      if (actor.thirst >= p.thresholds.criticalThirst && acquireWater(actor)) return;
      if (actor.hunger >= p.thresholds.criticalHunger && acquireFood(actor)) return;
      if (actor.ai.target && Math.hypot(actor.ai.target.x - actor.cx, actor.ai.target.z - actor.cz) < .58) {
        actor.ai.moving = false;
        actor.ai.target = null;
        actor.ai.faceYaw = null;
        actor.ai.idleT = .9 + rng() * 1.9;
      }
      return;
    }
    if (actor.ai.taskCooldown > 0) return;
    if (actor.thirst >= p.thresholds.seekThirst && acquireWater(actor)) return;
    if (p.hive && actor.hunger >= p.hive.hunger && acquireHive(actor)) return;
    if (p.conflict && actor.hunger >= p.thresholds.criticalHunger && acquireContest(actor)) return;
    if (actor.hunger >= p.thresholds.seekHunger) {
      if (acquireFood(actor)) return;
      if (p.conflict && acquireContest(actor)) return;
    }
    const due = findDuePlaydate(actor);
    if (due && startPlaydate(actor, due.other, 'friend')) return;
    if (actor.stage === 'adult' && actor.mateCooldown <= 0 &&
        (p.mate.chance >= 1 || rng() < p.mate.chance) && acquireMate(actor)) return;
    if (actor.stage === 'baby') {
      const parent = parentFor(actor);
      if (parent && !parent.inPond && parent.grabs === 0 &&
          Math.hypot(parent.cx - actor.cx, parent.cz - actor.cz) > p.mate.followDist) {
        if (startFollow(actor, parent)) return;
      }
    }
    const family = acquireFamilyPlaymate(actor);
    if (family && startPlaydate(actor, family.actor, family.kind)) return;
    if (actor.social >= p.thresholds.seekSocial || actor.affection >= p.thresholds.seekAffection) {
      if (acquireCompany(actor)) return;
    }
    if (p.stargaze && !isDayFor(actor) && rng() < p.stargaze.chance) {
      actor.ai.state = 'stargaze';
      actor.ai.idleT = p.stargaze.min + rng() * (p.stargaze.max - p.stargaze.min);
      stop(actor);
      return;
    }
    if (actor.ai.arrived) {
      actor.ai.arrived = false;
      actor.ai.idleT = .9 + rng() * 1.9;
    }
    if (actor.ai.idleT > 0) return;
    if (!pickWanderTarget(actor)) actor.ai.idleT = .7;
  }

  function dayShelterCheck(actor) {
    const p = profile(actor);
    if (p.rest.mode !== 'dayShelter' || !actor.ai) return false;
    const hours = hoursNow();
    if (!isDayFor(actor) || hours < p.rest.start || hours >= p.rest.end) return false;
    if (actor.shelteredToday || !actor.home || actor.shelterCheckT > 0) return false;
    actor.shelterCheckT = 24 + rng() * 24;
    if (rng() < p.rest.chance) {
      return startSeekHome(actor, 'shelter');
    }
    return false;
  }

  function think(actor) {
    if (!actor || !actor.ai) return;
    const state = actor.ai.state;
    if (['sleep', 'invite', 'social', 'decline', 'conflict', 'mate', 'familyTask', 'raidHive', 'flee'].includes(state)) return;
    if (needsRest(actor) && state !== 'seekHome') { startSeekHome(actor); return; }
    if (dayShelterCheck(actor)) return;
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.preNeeds === 'function' && adapter.preNeeds(actor, api)) return;
    if (state === 'wander') thinkWander(actor);
    else if (state === 'seekFood') thinkSeekFood(actor);
    else if (state === 'seekWater') thinkSeekWater(actor);
    else if (state === 'seekHive') thinkSeekHive(actor);
    else if (state === 'seekConflict') thinkSeekConflict(actor);
    else if (state === 'seekHome') thinkSeekHome(actor);
    else if (state === 'seekCompany') thinkSeekCompany(actor);
    else if (state === 'seekMate') thinkSeekMate(actor);
    else if (state === 'follow') thinkFollow(actor);
    else if (adapter && typeof adapter.think === 'function') adapter.think(actor, api);
  }

  function thinkSeekFood(actor) {
    if (!actor || !actor.ai) return;
    const p = profile(actor);
    if (actor.hunger <= p.thresholds.stopHunger) {
      releaseFood(actor);
      actor.ai.state = 'wander';
      actor.ai.idleT = .4;
      stop(actor);
      return;
    }
    let source = actor.ai.source;
    if (!source || !source.ripe || (source.claim && source.claim !== actor)) {
      releaseFood(actor);
      source = acquireFood(actor);
    }
    if (!source) {
      const adapter = adapterOf(actor);
      if (adapter && typeof adapter.hungerOpportunity === 'function' && adapter.hungerOpportunity(actor, api, true)) return;
      actor.ai.state = 'wander';
      actor.ai.idleT = .7;
      stop(actor);
      return;
    }
    const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
    if (d <= p.food.eatDist) { startEat(actor); return; }
    if (!actor.ai.path || !actor.ai.path.length) {
      if (!setDestination(actor, source.approachX, source.approachZ)) {
        field.food.release(source, actor);
        actor.ai.source = null;
        actor.ai.state = 'wander';
        actor.ai.idleT = .7;
      }
    }
  }

  function thinkSeekWater(actor) {
    if (!actor || !actor.ai) return;
    const p = profile(actor);
    if (actor.thirst <= p.thresholds.stopThirst) {
      actor.ai.waterSpot = null;
      actor.ai.state = 'wander';
      actor.ai.idleT = .4;
      stop(actor);
      return;
    }
    if (!actor.ai.waterSpot && !acquireWater(actor)) {
      actor.ai.state = 'wander';
      actor.ai.idleT = .8;
      return;
    }
    const spot = actor.ai.waterSpot;
    if (!spot) return;
    const d = Math.hypot(spot.x - actor.cx, spot.z - actor.cz);
    if (d <= p.food.drinkDist) { startDrink(actor); return; }
    if (!actor.ai.path || !actor.ai.path.length) {
      if (!setDestination(actor, spot.x, spot.z)) {
        actor.ai.waterSpot = null;
        actor.ai.state = 'wander';
        actor.ai.idleT = .8;
      }
    }
  }

  function thinkSeekHome(actor) {
    if (!actor || !actor.ai) return;
    const p = profile(actor);
    const home = homeFor(actor);
    if (!home) {
      actor.ai.state = 'wander';
      actor.ai.idleT = .8;
      return;
    }
    if (!needsRest(actor) && !actor.ai.directiveHome && actor.ai.restKind !== 'shelter') {
      actor.ai.state = 'wander';
      actor.ai.idleT = .5;
      return;
    }
    const d = Math.hypot(home.door.x - actor.cx, home.door.z - actor.cz);
    if (d <= p.rest.homeDist) {
      startSleep(actor, home, actor.ai.restKind || 'night');
      return;
    }
    if (!actor.ai.path || !actor.ai.path.length) {
      if (!setDestination(actor, home.door.x, home.door.z)) {
        actor.ai.state = 'wander';
        actor.ai.idleT = .8;
      }
    }
  }

  /* ------------------------------------------------------------- per tick */

  function tick(actor, dt, { ready = true } = {}) {
    if (!enabled || !actor || !actor.active) return;
    if (!actor.ai) attach(actor);
    if (!actor.ai) return;
    const p = profile(actor);
    const ai = actor.ai;
    tickNeeds(actor, dt);
    const adapter = adapterOf(actor);
    if (adapter && typeof adapter.preTick === 'function') adapter.preTick(actor, dt, api);
    if (ai.state === 'sleep') {
      if (sleepDone(actor)) wake(actor);
      return;
    }
    if (!ready || ai.possessed) return;

    if (ai.taskCooldown > 0) ai.taskCooldown = Math.max(0, ai.taskCooldown - dt);
    if (ai.familyPlayCooldown > 0) ai.familyPlayCooldown = Math.max(0, ai.familyPlayCooldown - dt);
    if (ai.idleT > 0) ai.idleT = Math.max(0, ai.idleT - dt);
    if (ai.stungT > 0) ai.stungT = Math.max(0, ai.stungT - dt);
    if (ai.socialCooldown > 0) ai.socialCooldown = Math.max(0, ai.socialCooldown - dt);
    if (ai.conflictCooldown > 0) ai.conflictCooldown = Math.max(0, ai.conflictCooldown - dt);
    if (actor.shelterCheckT > 0) actor.shelterCheckT = Math.max(0, actor.shelterCheckT - dt);
    if (p.rest.mode === 'dayShelter' && !isDayFor(actor)) actor.shelteredToday = false;

    if (ai.state === 'invite') {
      ai.animT += dt;
      ai.inviteT -= dt;
      if (ai.inviteT <= 0) resolveInvite(actor);
      return;
    }
    if (ai.state === 'social') {
      ai.animT += dt;
      ai.socialT -= dt;
      ai.heartT -= dt;
      if (ai.heartT <= 0) {
        ai.heartT = HEART_INTERVAL;
        emit(actor, 'heart', .95);
      }
      if (ai.socialT <= 0) endSocialPair(actor);
      return;
    }
    if (ai.state === 'decline') {
      ai.animT += dt;
      ai.declineT -= dt;
      if (ai.declineT <= 0) finishDeclinePair(actor);
      return;
    }
    if (ai.state === 'mate') {
      ai.animT += dt;
      ai.mateT -= dt;
      if (ai.mateT <= 0) finishMatePair(actor);
      return;
    }
    if (ai.state === 'visit') {
      if (ai.visitPhase === 'hangout') {
        ai.animT += dt;
        ai.heartT -= dt;
        ai.visitT -= dt;
        if (ai.heartT <= 0) { ai.heartT = 1.0; emit(actor, 'heart', .95); }
        if (ai.visitT <= 0) finishVisitPair(actor);
      } else {
        ai.animT += dt;
        tickVisit(actor, dt);
      }
      return;
    }
    if (ai.state === 'eat') {
      ai.animT += dt;
      ai.eatT -= dt;
      if (ai.eatT <= 0) finishFood(actor);
      return;
    }
    if (ai.state === 'drink') {
      ai.animT += dt;
      ai.drinkT -= dt;
      ai.rippleT = (ai.rippleT || 0) - dt;
      if (ai.rippleT <= 0 && ai.waterSpot && field.splash) {
        field.splash(ai.waterSpot.waterX, ai.waterSpot.waterZ, .30);
        ai.rippleT = .55;
      }
      if (ai.drinkT <= 0) finishWater(actor);
      return;
    }
    if (ai.state === 'familyTask') {
      const task = ai.familyTask;
      if (!task) { ai.state = 'wander'; return; }
      const def = interactionFor(task.id);
      const arriveDist = def ? def.arriveDist : 1.4;
      if (task.phase === 'travel') {
        if (!task.anchor) task.phase = 'act';
        else {
          const d = Math.hypot(task.anchor.x - actor.cx, task.anchor.z - actor.cz);
          if (d <= arriveDist) {
            task.phase = 'act';
            ai.moving = false;
            ai.path = null;
          } else if (!ai.path || !ai.path.length) {
            setDestination(actor, task.anchor.x, task.anchor.z);
          }
        }
      }
      if (task.phase === 'act') {
        task.t = Math.max(0, finite(task.t, 0) - dt);
        if (task.t <= 0) finishFamilyTask(actor);
      }
      return;
    }
    if (ai.state === 'flee') {
      ai.fleeT -= dt;
      if (ai.fleeT <= 0) {
        ai.state = 'seekFood';
        ai.nextThink = 0;
        ai.moving = false;
        stop(actor);
      }
      return;
    }
    if (ai.state === 'raidHive') {
      ai.animT += dt;
      ai.raidT -= dt;
      if (ai.raidT <= 0) finishHiveRaid(actor);
      return;
    }
    if (ai.state === 'conflict') {
      ai.animT += dt;
      ai.conflictT -= dt;
      if (ai.conflictT <= 0) finishConflict(actor);
      return;
    }
    if (ai.state === 'stargaze') {
      ai.idleT = Math.max(0, ai.idleT - dt);
      if (ai.idleT <= 0 || actor.hunger > .85 || actor.thirst > .88) {
        ai.state = 'wander';
        ai.idleT = 0;
        ai.nextThink = 0;
      }
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
    return {
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
      interrupted: !!actor.ai.interrupted,
      moving: !!actor.ai.moving,
      faceYaw: actor.ai.faceYaw === null || actor.ai.faceYaw === undefined ? null : +actor.ai.faceYaw.toFixed(3),
      animT: +finite(actor.ai.animT, 0).toFixed(3),
      source: actor.ai.source ? actor.ai.source.id : null,
      target: actor.ai.target ? { x: +actor.ai.target.x.toFixed(2), z: +actor.ai.target.z.toFixed(2) } : null,
      path: actor.ai.path ? actor.ai.path.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) })) : [],
      familyTask: actor.ai.familyTask ? { id: actor.ai.familyTask.id, phase: actor.ai.familyTask.phase } : null,
      skills: { ...skillsFor(actor) },
      history: (actor.history || []).slice(-4),
    };
  }

  function statsNow(filter = null) {
    const list = [];
    for (const actor of actors()) {
      if (!actor.active || !actor.ai) continue;
      if (typeof filter === 'function' && !filter(actor)) continue;
      list.push({ index: list.length, uid: actor.uid, name: actor.name, species: actor.species, ...plan(actor) });
    }
    return { enabled, ticks: stats.ticks, ms: +stats.ms.toFixed(3), actors: list };
  }

  function resumeTask(actor) {
    if (!actor || !actor.ai) return;
    const p = profile(actor);
    const ai = actor.ai;
    if (ai.state === 'eat') {
      const source = ai.source;
      if (source && source.ripe && field.food.claim(source, actor)) {
        ai.target = { x: source.approachX, z: source.approachZ };
        const d = Math.hypot(source.approachX - actor.cx, source.approachZ - actor.cz);
        if (d <= p.food.eatDist) {
          ai.eatT = p.food.eatTime * forageEatScale(actor);
          ai.animT = 0;
          ai.moving = false;
          face(actor, source.x, source.z);
        } else {
          ai.state = 'seekFood';
          setDestination(actor, source.approachX, source.approachZ);
        }
      } else {
        ai.source = null;
        ai.state = 'seekFood';
        ai.nextThink = 0;
      }
      return;
    }
    if (ai.state === 'drink') {
      const spot = ai.waterSpot;
      const d = spot ? Math.hypot(spot.x - actor.cx, spot.z - actor.cz) : Infinity;
      if (spot && d <= p.food.drinkDist) {
        ai.drinkT = Math.max(.7, ai.drinkT);
        ai.animT = 0;
        ai.moving = false;
        face(actor, spot.waterX, spot.waterZ);
      } else {
        ai.state = 'seekWater';
        ai.moving = false;
      }
      return;
    }
    if (ai.state === 'seekFood') {
      const source = ai.source;
      if (source && source.ripe && field.food.claim(source, actor)) {
        ai.target = { x: source.approachX, z: source.approachZ };
        setDestination(actor, source.approachX, source.approachZ);
      } else {
        ai.source = null;
        ai.nextThink = 0;
      }
      return;
    }
    if (ai.state === 'seekWater') {
      const spot = ai.waterSpot;
      if (spot) setDestination(actor, spot.x, spot.z);
      return;
    }
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
    if (!actor || !partner) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    startMatePair(actor, partner);
    return { ok: actor.ai.state === 'mate', state: actor.ai.state };
  }

  function forcePlaydate(actor, partner, kind = 'sibling') {
    if (!actor || !partner) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    return { ok: startPlaydate(actor, partner, kind), state: actor.ai.state };
  }

  function forceConflict(actor, partner, source = null) {
    if (!actor || !partner || actor === partner) return { ok: false, note: 'no pair' };
    cancelPair(actor);
    cancelPair(partner);
    const claim = source || (partner.ai && partner.ai.source) || null;
    return { ok: startConflict(actor, partner, claim), state: actor.ai.state };
  }

  const api = {
    field, profile, actors, hoursNow, dayNow, rng,
    pathTo, setPath, setDestination, clearPath, stop, face, emit, releaseFood,
    homeFor, assignHome, parentFor, safeFoodCount,
    acquireFood, acquireWater, acquireHive, acquireContest, acquireFamilyPlaymate,
    startSeekHome, startSleep, wake, cancelPair, startInvite,
    canMatePair, startMatePair, startSeekMate,
    startVisit, startPlaydate, startConflict,
    isDayFor, isNightFor, needsRest,
  };

  return {
    attach, tick, plan, stats: statsNow, registerAdapter,
    setEnabled, onGrab, onRelease, detach, resumeTask, debugState,
    setNeed, setBond, forceSocial, forceInvite, forceVisit, forceMate, forcePlaydate, forceConflict,
    startSeekHome, startPlaydate,
    get enabled() { return enabled; },
    get actors() { return actors(); },
    api,
  };
}
