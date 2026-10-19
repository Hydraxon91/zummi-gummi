// Meadow needs and the small autonomous state machine.
//
// app.js owns the rigid bodies, hop impulses and pose targets. This module only
// decides what a bear wants and which navigation point it should hop toward.
// That separation keeps user grabbing/throwing authoritative over the AI.

import {
  canMate, HOME_CAPACITY, MATE_TIME, MATE_COOLDOWN, MATE_FOOD_MIN,
  GESTATION_TIME, PREGNANCY_HUNGER,
} from './life.js';

const WANDER_MIN = 3.0;
const WANDER_MAX = 12.0;
const LONG_WANDER_CHANCE = 0.25;
const LONG_WANDER_MIN = 24.0;
const LONG_WANDER_MAX = 40.0;
const HUNGER_RATE = 0.0045;         // per second
const THIRST_RATE = 0.0065;         // per second
const SEEK_HUNGER = 0.70;
const STOP_HUNGER = 0.40;
const SEEK_THIRST = 0.76;
const STOP_THIRST = 0.30;
const CRITICAL_HUNGER = 0.90;
const CRITICAL_THIRST = 0.92;
const EAT_TIME = 1.25;
const DRINK_TIME = 1.35;
const EAT_DIST = 0.62;
const DRINK_DIST = 0.62;
const THINK_MIN = 0.18;
const THINK_MAX = 0.28;
const STUCK_TIME = 1.9;

// Player directives are proposals, not forced states: the AI can refuse, and
// critical needs still pre-empt an accepted directive.
const DIRECTIVE_TTL = 45;
const DIRECTIVE_MAX = 3;
const DIRECTIVE_KINDS = ['go', 'eat', 'drink', 'home', 'social'];
const DIRECTIVE_LABELS = { go: 'Go here', eat: 'Eat', drink: 'Drink', home: 'Home', social: 'Socialize' };

// Health, rest and night. Health is in points (0–100), never reaches zero.
const HEALTH_REGEN = 0.6 / 60;      // awake, points per second
const HEALTH_REST = 4.0 / 60;       // sleeping/resting
const HEALTH_STARVE = 0.02;         // at hunger >= 0.95
const HEALTH_HURT = 35;
const HEALTH_WOOZY = 15;
const HEALTH_RECOVERED = 70;
const ENERGY_RATE = 0.0025;         // awake
const ENERGY_REST = 0.012;          // sleeping
const ENERGY_TIRED = 0.18;
const ENERGY_RESTED = 0.35;
const NIGHT_START = 20;
const NIGHT_END = 6;
const HOME_DIST = 1.15;
const WOOZY_SPEED = 0.65;

// Socialising is a slow need. Company is preferred over a random wander once
// either need crosses its threshold; a successful greeting relieves both and
// raises the pair's bond. Visits stay at the door for now; interiors are a
// later home pass.
const SOCIAL_RATE = 0.0018;         // per second, awake
const AFFECTION_RATE = 0.0012;      // per second, awake
const SEEK_SOCIAL = 0.60;
const SEEK_AFFECTION = 0.64;
const STOP_SOCIAL = 0.30;
const SOCIAL_RADIUS = 22;
const SOCIAL_DIST = 1.45;
const INVITE_TIME = 0.70;
const SOCIAL_TIME = 4.2;
const DECLINE_TIME = 0.90;
const SOCIAL_COOLDOWN = 14;
const VISIT_BOND = 0.16;
const VISIT_CHANCE = 0.45;
const VISIT_TIME = 4.8;
const VISIT_DIST = 1.55;
const CONFLICT_DIST = 1.20;
const CONFLICT_TIME = 0.85;
const CONFLICT_COOLDOWN = 12;
const CONFLICT_RADIUS = 8;

const MATE_RADIUS = 22;
const MATE_DIST = 1.25;
const FOLLOW_DIST = 2.15;

// Hives are high-value and risky. The threshold shifts with boldness; hunger
// can push a desperate bear a little lower, never below the hard floor.
const HIVE_HUNGER = 0.95;
const HIVE_HEALTH = 45;
const HIVE_HARD_FLOOR = 25;
const HIVE_DAMAGE = 15;
const HIVE_STING_CHANCE = 0.5;
const HIVE_DIST = 1.25;
const HIVE_RAID_TIME = 1.25;
const FLEE_TIME = 1.4;

const SAFE_FOOD = ['flower', 'fruit'];

function finite(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

export function createBearAI({ field, getBears, getHours, getPopulationCap, rng = Math.random } = {}) {
  const bears = getBears ? getBears() : [];
  let enabled = true;
  const stats = { ticks: 0, ms: 0 };
  const hoursNow = typeof getHours === 'function' ? getHours : () => 12;
  const populationCap = typeof getPopulationCap === 'function'
    ? () => Math.max(1, Number(getPopulationCap()) || 40)
    : () => 40;
  const isNight = () => {
    const h = Number(hoursNow());
    return Number.isFinite(h) && (h >= NIGHT_START || h < NIGHT_END);
  };
  const isNightFor = (b) => {
    const h = Number(hoursNow());
    if (!Number.isFinite(h)) return false;
    const bed = finite(b && b.bedtime, NIGHT_START);
    const wake = finite(b && b.wakeTime, NIGHT_END);
    return h >= bed || h < wake;
  };

  function unit(v) {
    return Math.max(0, Math.min(1, finite(v, 0)));
  }

  function bondKey(other) {
    return String(other && (other.uid !== undefined ? other.uid : other.slot));
  }

  function bondOf(a, b) {
    if (!a || !b || !a.bonds) return 0;
    const v = Number(a.bonds[bondKey(b)]);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }

  function pairBond(a, b) {
    return (bondOf(a, b) + bondOf(b, a)) * 0.5;
  }

  function addBond(a, b, amount) {
    if (!a || !b || a === b) return 0;
    if (!a.bonds || typeof a.bonds !== 'object') a.bonds = {};
    if (!b.bonds || typeof b.bonds !== 'object') b.bonds = {};
    const next = Math.max(0, Math.min(1, pairBond(a, b) + amount));
    a.bonds[bondKey(b)] = next;
    b.bonds[bondKey(a)] = next;
    return next;
  }

  function partnerName(b) {
    return b && b.ai && b.ai.partner ? (b.ai.partner.name || 'a friend') : '';
  }

  function breakPair(b) {
    if (!b || !b.ai) return;
    if (b.ai.source && field && field.food) field.food.release(b.ai.source, b);
    const p = b.ai.partner;
    if (p && p.ai && p.ai.partner === b) {
      if (p.ai.source && field && field.food) field.food.release(p.ai.source, p);
      p.ai.partner = null;
      p.ai.moving = false;
      p.ai.path = null;
      p.ai.visitHome = null;
      p.ai.visitRole = null;
      p.ai.visitPhase = null;
      p.ai.visitArrived = false;
      if (['social', 'invite', 'decline', 'visit', 'conflict', 'mate'].includes(p.ai.state)) {
        p.ai.state = 'wander';
        p.ai.idleT = 0.5;
        p.ai.taskCooldown = 0.8;
      }
      p.ai.source = null;
      p.ai.follow = null;
      p.ai.contestBear = null;
      p.ai.contestSource = null;
      p.ai.conflictSource = null;
    }
    b.ai.follow = null;
    b.ai.partner = null;
    b.ai.visitHome = null;
    b.ai.visitRole = null;
    b.ai.visitPhase = null;
    b.ai.visitArrived = false;
    b.ai.contestBear = null;
    b.ai.contestSource = null;
    b.ai.conflictSource = null;
  }

  function homeResidents(name) {
    if (!name) return 0;
    let n = 0;
    for (const b of bears) if (b.active && b.home === name) n++;
    return n;
  }

  function parentFor(b) {
    if (!b || !b.parentUids || !b.parentUids.length) return null;
    for (const uid of b.parentUids) {
      const p = bears.find(x => x.active && x.uid === uid);
      if (p) return p;
    }
    return null;
  }

  function assignHome(b) {
    if (!b || !field || !field.homes || !field.homes.length) return null;
    if (b.home) {
      const existing = field.homes.find(h => h.name === b.home);
      if (existing && homeResidents(b.home) < HOME_CAPACITY) return existing;
    }
    const parent = parentFor(b);
    if (parent && parent.home) {
      const preferred = field.homes.find(h => h.name === parent.home);
      if (preferred && homeResidents(preferred.name) < HOME_CAPACITY) {
        b.home = preferred.name;
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
    b.home = best.name;
    return best;
  }

  function homeFor(b) {
    if (!b || !field || !field.homes || !field.homes.length) return null;
    return field.homes.find(h => h.name === b.home) || assignHome(b);
  }

  function hiveThreshold(b) {
    const bold = finite(b.bold, 0.5);
    const desperation = b.hunger >= 0.92 ? 5 : 0;
    return Math.max(HIVE_HARD_FLOOR,
      HIVE_HEALTH + (0.5 - bold) * 30 - desperation);
  }

  function canRaidHive(b) {
    return !!b && !b.sleeping && b.health > hiveThreshold(b) && b.hunger >= HIVE_HUNGER;
  }

  function attach(b) {
    if (b.ai) return b.ai;
    b.hunger = finite(b.hunger, 0.30);
    b.thirst = finite(b.thirst, 0.30);
    b.energy = Math.max(0, Math.min(1, finite(b.energy, 1)));
    b.bold = Math.max(0, Math.min(1, finite(b.bold, 0.5)));
    b.social = Math.max(0, Math.min(1, finite(b.social, 0.3)));
    b.affection = Math.max(0, Math.min(1, finite(b.affection, 0.25)));
    b.bedtime = Math.max(0, Math.min(23.99, finite(b.bedtime, 20 + rng() * 2.5)));
    b.wakeTime = Math.max(0, Math.min(23.99, finite(b.wakeTime, 5 + rng() * 2)));
    if (!b.bonds || typeof b.bonds !== 'object') b.bonds = {};
    b.sleeping = !!b.sleeping;
    b.ai = {
      state: 'wander',
      nextThink: rng() * 0.20,
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
      hopState: null,
      hopWait: 0,
      turnWait: 0,
      eatT: 0,
      drinkT: 0,
      animT: 0,
      taskCooldown: 0,
      raidT: 0,
      fleeT: 0,
      fleeFrom: null,
      stungT: 0,
      sleepHome: null,
      partner: null,
      inviteT: 0,
      inviteAccepted: false,
      socialT: 0,
      socialCooldown: 0,
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
      lastX: b.cx,
      lastZ: b.cz,
      stuckT: 0,
      directives: [],
      directive: null,
      directiveStatus: null,
      directiveHome: false,
      possessed: false,
    };
    if (b._directiveSave) {
      const saved = b._directiveSave;
      const clean = (d) => (d && DIRECTIVE_KINDS.includes(d.kind))
        ? { kind: d.kind, target: d.kind === 'go' && d.target &&
            Number.isFinite(d.target.x) && Number.isFinite(d.target.z)
            ? { x: d.target.x, z: d.target.z } : null,
            ttl: Math.max(0, Math.min(DIRECTIVE_TTL, Number(d.ttl) || DIRECTIVE_TTL)) }
        : null;
      if (saved.active) b.ai.directive = clean(saved.active);
      if (Array.isArray(saved.queue)) b.ai.directives = saved.queue.map(clean).filter(Boolean).slice(-DIRECTIVE_MAX);
      delete b._directiveSave;
    }
    if (!b.home) assignHome(b);
    return b.ai;
  }

  function releaseFood(b) {
    if (!field || !field.food || !b.ai) return;
    if (b.ai.source) field.food.release(b.ai.source, b);
  }

  function clearPath(b) {
    if (!b.ai) return;
    b.ai.path = null;
    b.ai.pathIndex = 0;
    b.ai.moving = false;
    b.ai.arrived = false;
  }

  function onGrab(b) {
    if (!b.ai) attach(b);
    if (!b.ai) return;
    breakPair(b);
    b.ai.interrupted = true;
    b.ai.moving = false;
    b.ai.arrived = false;
    b.ai.hopState = null;
    b.ai.hopWait = 0;
    b.ai.turnWait = 0;
    b.ai.faceYaw = null;
    b.ai.raidT = 0;
    b.ai.fleeT = 0;
    b.ai.inviteT = 0;
    b.ai.socialT = 0;
    b.ai.declineT = 0;
    b.ai.conflictT = 0;
    b.ai.mateT = 0;
    b.ai.follow = null;
    b.ai.shove = null;
    b.sleeping = false;
    if (['sleep', 'social', 'invite', 'decline', 'visit', 'conflict', 'mate', 'follow', 'seekMate'].includes(b.ai.state)) {
      b.ai.state = 'wander';
    }
    b.ai.path = null;
    b.ai.pathIndex = 0;
    // Do not hold a food reservation while the player is carrying the bear.
    releaseFood(b);
  }

  function onRelease(b) {
    if (!b.ai) return;
    b.ai.nextThink = 0;
    b.ai.arrived = false;
    b.ai.hopState = null;
    b.ai.hopWait = 0;
    b.ai.turnWait = 0;
    b.ai.faceYaw = null;
  }

  function detach(b) {
    releaseFood(b);
    breakPair(b);
    if (b.ai) {
      b.ai.moving = false;
      b.ai.path = null;
      b.ai.hopState = null;
      b.ai.partner = null;
      b.ai.follow = null;
      b.ai.mateT = 0;
      b.sleeping = false;
    }
    b.ai = null;
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) {
      for (const b of bears) {
        if (!b.active || !b.ai) continue;
        releaseFood(b);
        breakPair(b);
        b.ai.moving = false;
        b.ai.arrived = false;
        b.ai.source = null;
        b.ai.waterSpot = null;
        b.ai.target = null;
        b.ai.eatT = 0;
        b.ai.drinkT = 0;
        b.ai.path = null;
        b.ai.hopState = null;
        b.ai.hopWait = 0;
        b.ai.turnWait = 0;
        b.ai.faceYaw = null;
        b.ai.raidT = 0;
        b.ai.fleeT = 0;
        b.ai.inviteT = 0;
        b.ai.socialT = 0;
        b.ai.declineT = 0;
        b.ai.conflictT = 0;
        b.ai.mateT = 0;
        b.ai.follow = null;
        b.ai.shove = null;
        b.sleeping = false;
        if (['sleep', 'social', 'invite', 'decline', 'visit', 'conflict', 'mate', 'follow', 'seekMate'].includes(b.ai.state)) {
          b.ai.state = 'wander';
        }
      }
    }
    return enabled;
  }

  function pathTo(b, x, z) {
    if (!field || !field.nav) return null;
    return field.nav.findPath(b.cx, b.cz, x, z);
  }

  function setPath(b, path) {
    if (!b.ai) return false;
    b.ai.path = path && path.length ? path : null;
    b.ai.pathIndex = 0;
    b.ai.moving = !!b.ai.path;
    b.ai.arrived = false;
    b.ai.lastX = b.cx;
    b.ai.lastZ = b.cz;
    b.ai.stuckT = 0;
    return b.ai.moving;
  }

  function acquireFood(b) {
    if (!field || !field.food || !b.ai) return null;
    const exclude = new Set();
    for (let tries = 0; tries < 5; tries++) {
      const source = field.food.nearestRipe(b.cx, b.cz, {
        maxDistance: 46,
        bear: b,
        exclude,
        kinds: SAFE_FOOD,
      });
      if (!source) break;
      exclude.add(source.id);
      if (!field.food.claim(source, b)) continue;
      const path = pathTo(b, source.approachX, source.approachZ);
      if (!path && Math.hypot(source.approachX - b.cx, source.approachZ - b.cz) > 1.25) {
        field.food.release(source, b);
        continue;
      }
      b.ai.source = source;
      b.ai.state = 'seekFood';
      b.ai.target = { x: source.approachX, z: source.approachZ };
      setPath(b, path || [{ x: source.approachX, z: source.approachZ }]);
      b.ai.faceYaw = Math.atan2(source.approachX - b.cx, source.approachZ - b.cz);
      return source;
    }
    return null;
  }

  function acquireHive(b) {
    if (!field || !field.food || !b.ai || !canRaidHive(b)) return null;
    const exclude = new Set();
    for (let tries = 0; tries < 3; tries++) {
      const source = field.food.nearestRipe(b.cx, b.cz, {
        maxDistance: 52,
        bear: b,
        exclude,
        kinds: ['hive'],
      });
      if (!source) break;
      exclude.add(source.id);
      if (!field.food.claim(source, b)) continue;
      const path = pathTo(b, source.approachX, source.approachZ);
      if (!path && Math.hypot(source.approachX - b.cx, source.approachZ - b.cz) > 1.25) {
        field.food.release(source, b);
        continue;
      }
      b.ai.source = source;
      b.ai.state = 'seekHive';
      b.ai.target = { x: source.approachX, z: source.approachZ };
      setPath(b, path || [{ x: source.approachX, z: source.approachZ }]);
      b.ai.faceYaw = Math.atan2(source.approachX - b.cx, source.approachZ - b.cz);
      return source;
    }
    return null;
  }

  function acquireWater(b) {
    if (!field || !field.waterSpots || !b.ai) return null;
    let best = null;
    let bestD = Infinity;
    for (const spot of field.waterSpots) {
      const d = Math.hypot(spot.x - b.cx, spot.z - b.cz);
      if (d < bestD) { bestD = d; best = spot; }
    }
    if (!best) return null;
    const path = pathTo(b, best.x, best.z);
    if (!path && bestD > 1.25) return null;
    b.ai.waterSpot = best;
    b.ai.state = 'seekWater';
    b.ai.target = { x: best.x, z: best.z };
    setPath(b, path || [{ x: best.x, z: best.z }]);
    b.ai.faceYaw = Math.atan2(best.x - b.cx, best.z - b.cz);
    return best;
  }

  function wanderCandidate(b, minR, maxR, maxShift, requireDistance) {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const r = minR + rng() * (maxR - minR);
      const x = b.cx + Math.cos(a) * r;
      const z = b.cz + Math.sin(a) * r;
      const p = field.nav.nearestWalkable(x, z);
      if (!p) continue;
      if (Math.hypot(p.x - x, p.z - z) > maxShift) continue;
      if (field.pond && field.pond.contains(p.x, p.z)) continue;
      const d = Math.hypot(p.x - b.cx, p.z - b.cz);
      if (d < requireDistance) continue;
      const path = pathTo(b, p.x, p.z);
      if (!path) continue;
      return { x: p.x, z: p.z, path };
    }
    return null;
  }

  function pickWanderTarget(b) {
    if (!field || !field.nav) return null;
    let target = null;
    // Most legs are local. Occasionally take a long diagonal/cross-meadow
    // excursion; the destination is still nav-validated and never forced to
    // an edge.
    if (rng() < LONG_WANDER_CHANCE) {
      target = wanderCandidate(b, LONG_WANDER_MIN, LONG_WANDER_MAX, 4.0, LONG_WANDER_MIN * 0.8);
    }
    if (!target) {
      target = wanderCandidate(b, WANDER_MIN, WANDER_MAX, 2.0, 0);
    }
    if (!target) return null;
    b.ai.target = { x: target.x, z: target.z };
    b.ai.faceYaw = Math.atan2(target.x - b.cx, target.z - b.cz);
    setPath(b, target.path);
    return b.ai.target;
  }

  function finishFood(b) {
    if (!b.ai || !b.ai.source) {
      if (b.ai) { b.ai.state = 'wander'; b.ai.idleT = 0.5; }
      clearPath(b);
      return;
    }
    const source = b.ai.source;
    if (field.food.consume(source, b)) {
      b.hunger = Math.max(0, b.hunger - source.satiation);
    }
    b.ai.source = null;
    b.ai.target = null;
    b.ai.faceYaw = null;
    b.ai.state = 'wander';
    b.ai.idleT = 0.8;
    b.ai.taskCooldown = 1.3;
    clearPath(b);
  }

  function finishWater(b) {
    if (!b.ai) return;
    b.thirst = Math.max(0, b.thirst - 0.55);
    b.ai.waterSpot = null;
    b.ai.target = null;
    b.ai.faceYaw = null;
    b.ai.state = 'wander';
    b.ai.idleT = 0.8;
    b.ai.taskCooldown = 1.0;
    clearPath(b);
  }

  function startEat(b) {
    if (!b.ai || !b.ai.source) return;
    b.ai.state = 'eat';
    b.ai.eatT = EAT_TIME;
    b.ai.animT = 0;
    b.ai.moving = false;
    b.ai.path = null;
    b.ai.faceYaw = Math.atan2(b.ai.source.x - b.cx, b.ai.source.z - b.cz);
  }

  function startDrink(b) {
    if (!b.ai || !b.ai.waterSpot) return;
    const spot = b.ai.waterSpot;
    b.ai.state = 'drink';
    b.ai.drinkT = DRINK_TIME;
    b.ai.animT = 0;
    b.ai.rippleT = 0;
    b.ai.moving = false;
    b.ai.path = null;
    b.ai.faceYaw = Math.atan2(spot.waterX - b.cx, spot.waterZ - b.cz);
    if (field && field.splash) field.splash(spot.waterX, spot.waterZ, 0.45);
  }

  function resumeTask(b) {
    if (!b.ai) return;
    const state = b.ai.state;
    if (state === 'eat') {
      const source = b.ai.source;
      if (source && source.ripe && field.food.claim(source, b)) {
        b.ai.target = { x: source.approachX, z: source.approachZ };
        const d = Math.hypot(source.approachX - b.cx, source.approachZ - b.cz);
        if (d <= EAT_DIST) {
          b.ai.eatT = EAT_TIME;
          b.ai.animT = 0;
          b.ai.moving = false;
          b.ai.faceYaw = Math.atan2(source.x - b.cx, source.z - b.cz);
        } else {
          // The player threw the bear away from its meal. Keep the intent and
          // hop back to the source instead of nibbling at thin air.
          b.ai.state = 'seekFood';
          setPath(b, pathTo(b, source.approachX, source.approachZ) || [{ x: source.approachX, z: source.approachZ }]);
        }
      } else {
        b.ai.source = null;
        b.ai.state = 'seekFood';
        b.ai.nextThink = 0;
      }
      return;
    }
    if (state === 'drink') {
      const spot = b.ai.waterSpot;
      const d = spot ? Math.hypot(spot.x - b.cx, spot.z - b.cz) : Infinity;
      if (spot && d <= DRINK_DIST) {
        b.ai.drinkT = Math.max(0.7, b.ai.drinkT);
        b.ai.animT = 0;
        b.ai.moving = false;
        b.ai.faceYaw = Math.atan2(spot.waterX - b.cx, spot.waterZ - b.cz);
      } else {
        b.ai.state = 'seekWater';
        b.ai.moving = false;
      }
      return;
    }
    if (state === 'seekFood') {
      const source = b.ai.source;
      if (source && source.ripe && field.food.claim(source, b)) {
        b.ai.target = { x: source.approachX, z: source.approachZ };
        const path = pathTo(b, source.approachX, source.approachZ);
        setPath(b, path || [{ x: source.approachX, z: source.approachZ }]);
      } else {
        b.ai.source = null;
        b.ai.nextThink = 0;
      }
      return;
    }
    if (state === 'seekWater') {
      const spot = b.ai.waterSpot;
      if (spot) {
        const path = pathTo(b, spot.x, spot.z);
        b.ai.target = { x: spot.x, z: spot.z };
        setPath(b, path || [{ x: spot.x, z: spot.z }]);
      }
      return;
    }
    // Wandering is positional; after a throw, choose a fresh target.
    b.ai.target = null;
    b.ai.faceYaw = null;
    b.ai.idleT = 0.4;
    clearPath(b);
  }

  function canCompany(b, other) {
    if (!b || !other || b === other || !other.active || !other.ai) return false;
    if (other.grabs > 0 || other.inPond || other.sleeping) return false;
    if (other.health < HEALTH_WOOZY) return false;
    if (!['wander', 'seekCompany'].includes(other.ai.state)) return false;
    if (other.ai.partner && other.ai.partner !== b) return false;
    return true;
  }

  function acquireCompany(b) {
    if (!b || !b.ai || b.ai.socialCooldown > 0) return null;
    if (b.social < SEEK_SOCIAL && b.affection < SEEK_AFFECTION) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const other of bears) {
      if (!canCompany(b, other)) continue;
      const d = Math.hypot(other.cx - b.cx, other.cz - b.cz);
      if (d > SOCIAL_RADIUS) continue;
      const bond = pairBond(b, other);
      const need = unit(other.social);
      const score = bond * 1.3 + need * .7 - d * .025 +
        (other.ai.state === 'wander' && !other.ai.moving ? .18 : 0) +
        (rng() - .5) * .08;
      if (score > bestScore) { bestScore = score; best = other; }
    }
    if (!best) {
      b.ai.socialCooldown = 3.0;
      return null;
    }
    startSeekCompany(b, best);
    return best;
  }

  function startSeekCompany(b, partner) {
    if (!b || !b.ai || !partner) return false;
    releaseFood(b);
    b.ai.source = null;
    b.ai.waterSpot = null;
    b.ai.partner = partner;
    b.ai.state = 'seekCompany';
    b.ai.target = { x: partner.cx, z: partner.cz };
    b.ai.faceYaw = Math.atan2(partner.cx - b.cx, partner.cz - b.cz);
    b.ai.moving = false;
    setPath(b, pathTo(b, partner.cx, partner.cz) || [{ x: partner.cx, z: partner.cz }]);
    return true;
  }

  function thinkSeekCompany(b) {
    if (!b || !b.ai) return;
    const p = b.ai.partner;
    if (!canCompany(b, p)) {
      // A partner that started socialising with someone else is no longer ours.
      if (p && p.ai && p.ai.partner === b) breakPair(b);
      b.ai.partner = null;
      b.ai.state = 'wander';
      b.ai.idleT = .5;
      b.ai.socialCooldown = Math.max(b.ai.socialCooldown, 3.0);
      clearPath(b);
      return;
    }
    if (b.social < STOP_SOCIAL && b.affection < STOP_SOCIAL) {
      breakPair(b);
      b.ai.state = 'wander';
      b.ai.idleT = .5;
      clearPath(b);
      return;
    }
    const d = Math.hypot(p.cx - b.cx, p.cz - b.cz);
    if (d <= SOCIAL_DIST) {
      startInvite(b, p);
      return;
    }
    b.ai.target = { x: p.cx, z: p.cz };
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, p.cx, p.cz);
      if (!path) {
        if (d > 2.2) {
          b.ai.partner = null;
          b.ai.state = 'wander';
          b.ai.idleT = .7;
          b.ai.socialCooldown = Math.max(b.ai.socialCooldown, 3.0);
          clearPath(b);
        }
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function decideAccept(initiator, partner) {
    const need = unit(partner.social);
    const bond = pairBond(initiator, partner);
    let chance = .30 + need * .55 + bond * .30 + (partner.ai.state === 'wander' ? .12 : 0);
    if (partner.health < HEALTH_HURT) chance -= .18;
    if (partner.energy < ENERGY_TIRED) chance -= .12;
    chance = Math.max(.15, Math.min(.94, chance));
    return rng() < chance;
  }

  function startInvite(b, partner, acceptedOverride) {
    if (!b || !b.ai || !partner || !partner.ai) return false;
    if (!canCompany(b, partner)) return false;
    const accepted = acceptedOverride === undefined ? decideAccept(b, partner) : !!acceptedOverride;
    b.ai.state = 'invite';
    b.ai.partner = partner;
    b.ai.inviteAccepted = accepted;
    b.ai.inviteT = INVITE_TIME;
    b.ai.moving = false;
    b.ai.path = null;
    b.ai.target = { x: partner.cx, z: partner.cz };
    b.ai.faceYaw = Math.atan2(partner.cx - b.cx, partner.cz - b.cz);
    partner.ai.partner = b;
    partner.ai.inviteAccepted = accepted;
    partner.ai.inviteT = INVITE_TIME;
    partner.ai.declineT = DECLINE_TIME;
    partner.ai.moving = false;
    partner.ai.path = null;
    partner.ai.target = { x: b.cx, z: b.cz };
    partner.ai.faceYaw = Math.atan2(b.cx - partner.cx, b.cz - partner.cz);
    partner.ai.state = accepted ? 'invite' : 'decline';
    if (field && field.emote) field.emote(b.cx, b.cy + 1.08, b.cz, 'question');
    return true;
  }

  function beginSocialPair(a, b) {
    if (!a || !b || !a.ai || !b.ai || a === b) return false;
    a.ai.state = 'social';
    b.ai.state = 'social';
    a.ai.partner = b;
    b.ai.partner = a;
    a.ai.socialT = SOCIAL_TIME;
    b.ai.socialT = SOCIAL_TIME;
    a.ai.inviteT = 0;
    b.ai.inviteT = 0;
    a.ai.heartT = 0;
    b.ai.heartT = .22;
    a.ai.animT = 0;
    b.ai.animT = 0;
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.path = null;
    b.ai.path = null;
    a.ai.target = { x: b.cx, z: b.cz };
    b.ai.target = { x: a.cx, z: a.cz };
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    if (field && field.emote) field.emote(a.cx, a.cy + .9, a.cz, 'heart');
    return true;
  }

  function settleSocial(b) {
    if (!b || !b.ai) return;
    b.social = Math.max(0, b.social - .50);
    b.affection = Math.max(0, b.affection - .38);
    b.ai.socialCooldown = SOCIAL_COOLDOWN;
  }

  function endSocialPair(a) {
    if (!a || !a.ai || a.ai.state !== 'social') return;
    const b = a.ai.partner;
    settleSocial(a);
    if (b && b.ai && b.ai.state === 'social' && b.ai.partner === a) settleSocial(b);
    addBond(a, b, .16 + rng() * .08);
    a.ai.state = 'wander';
    a.ai.idleT = .55;
    a.ai.taskCooldown = 1.0;
    a.ai.partner = null;
    clearPath(a);
    if (b && b.ai && b.ai.state === 'social' && b.ai.partner === a) {
      b.ai.state = 'wander';
      b.ai.idleT = .55;
      b.ai.taskCooldown = 1.0;
      b.ai.partner = null;
      clearPath(b);
    }
    const canVisit = b && b.ai && !isNight() && pairBond(a, b) >= VISIT_BOND &&
      rng() < VISIT_CHANCE;
    if (canVisit) startVisit(a, b);
  }

  function startDeclinePair(a, b) {
    if (!a || !a.ai || !b || !b.ai) return;
    a.ai.state = 'decline';
    b.ai.state = 'decline';
    a.ai.partner = b;
    b.ai.partner = a;
    a.ai.declineT = DECLINE_TIME;
    b.ai.declineT = DECLINE_TIME;
    a.ai.inviteT = 0;
    b.ai.inviteT = 0;
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.path = null;
    b.ai.path = null;
    a.ai.socialCooldown = Math.max(a.ai.socialCooldown, 4.0);
    b.ai.socialCooldown = Math.max(b.ai.socialCooldown, 2.5);
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    if (field && field.emote) {
      field.emote(a.cx, a.cy + 1.08, a.cz, 'no');
      field.emote(b.cx, b.cy + 1.08, b.cz, 'no');
    }
  }

  function finishDeclinePair(b) {
    if (!b || !b.ai || b.ai.state !== 'decline') return;
    const p = b.ai.partner;
    b.ai.state = 'wander';
    b.ai.idleT = .55;
    b.ai.partner = null;
    clearPath(b);
    if (p && p.ai && p.ai.state === 'decline' && p.ai.partner === b) {
      p.ai.state = 'wander';
      p.ai.idleT = .55;
      p.ai.partner = null;
      clearPath(p);
    }
  }

  function resolveInvite(b) {
    if (!b || !b.ai || b.ai.state !== 'invite' || b.ai.inviteT > 0) return;
    const p = b.ai.partner;
    if (!p || !p.ai) {
      b.ai.state = 'wander';
      b.ai.partner = null;
      clearPath(b);
      return;
    }
    if (b.ai.inviteAccepted) beginSocialPair(b, p);
    else startDeclinePair(b, p);
  }

  // Door-level visit: the host leads a friend to its villa and both hang out
  // outside. Interiors are deliberately a later pass; the visit fields keep the
  // host/home identity so an enter/exit transition can be added without a new
  // state.
  function startVisit(a, b) {
    if (!a || !b || !a.ai || !b.ai || a === b) return false;
    const home = homeFor(a);
    if (!home || isNight() || !field || !field.nav) return false;
    const dx = home.door.x - home.x;
    const dz = home.door.z - home.z;
    const len = Math.hypot(dx, dz) || 1;
    let gx = home.door.x - dz / len * .72;
    let gz = home.door.z + dx / len * .72;
    const p = field.nav.nearestWalkable(gx, gz);
    if (p && !(field.pond && field.pond.contains(p.x, p.z))) {
      gx = p.x; gz = p.z;
    } else {
      gx = home.door.x; gz = home.door.z;
    }
    a.ai.state = 'visit';
    b.ai.state = 'visit';
    a.ai.partner = b;
    b.ai.partner = a;
    a.ai.visitHome = home.name;
    b.ai.visitHome = home.name;
    a.ai.visitRole = 'host';
    b.ai.visitRole = 'guest';
    a.ai.visitPhase = 'travel';
    b.ai.visitPhase = 'travel';
    a.ai.visitT = 0;
    b.ai.visitT = 0;
    a.ai.visitArrived = false;
    b.ai.visitArrived = false;
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.target = { x: home.door.x, z: home.door.z };
    b.ai.target = { x: gx, z: gz };
    a.ai.faceYaw = Math.atan2(home.door.x - a.cx, home.door.z - a.cz);
    b.ai.faceYaw = Math.atan2(gx - b.cx, gz - b.cz);
    setPath(a, pathTo(a, home.door.x, home.door.z) || [{ x: home.door.x, z: home.door.z }]);
    setPath(b, pathTo(b, gx, gz) || [{ x: gx, z: gz }]);
    if (field.emote) field.emote(a.cx, a.cy + .95, a.cz, 'heart');
    return true;
  }

  function beginVisitHangout(a, b) {
    if (!a || !b || !a.ai || !b.ai) return;
    a.ai.visitPhase = 'hangout';
    b.ai.visitPhase = 'hangout';
    a.ai.visitT = VISIT_TIME;
    b.ai.visitT = VISIT_TIME;
    a.ai.animT = 0;
    b.ai.animT = 0;
    a.ai.heartT = .3;
    b.ai.heartT = 1.0;
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.path = null;
    b.ai.path = null;
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    if (field && field.emote) field.emote(a.cx, a.cy + .95, a.cz, 'heart');
  }

  function finishVisitPair(a) {
    if (!a || !a.ai || a.ai.state !== 'visit') return;
    const b = a.ai.partner;
    addBond(a, b, .08);
    a.social = Math.max(0, a.social - .22);
    a.affection = Math.max(0, a.affection - .16);
    a.ai.state = 'wander';
    a.ai.idleT = .6;
    a.ai.taskCooldown = 1.2;
    a.ai.socialCooldown = 8;
    a.ai.partner = null;
    a.ai.visitHome = null;
    a.ai.visitRole = null;
    a.ai.visitPhase = null;
    a.ai.visitArrived = false;
    clearPath(a);
    if (b && b.ai && b.ai.state === 'visit' && b.ai.partner === a) {
      b.social = Math.max(0, b.social - .22);
      b.affection = Math.max(0, b.affection - .16);
      b.ai.state = 'wander';
      b.ai.idleT = .6;
      b.ai.taskCooldown = 1.2;
      b.ai.socialCooldown = 8;
      b.ai.partner = null;
      b.ai.visitHome = null;
      b.ai.visitRole = null;
      b.ai.visitPhase = null;
      b.ai.visitArrived = false;
      clearPath(b);
    }
  }

  function thinkVisit(b) {
    if (!b || !b.ai || b.ai.state !== 'visit') return;
    const p = b.ai.partner;
    if (!p || !p.ai || p.ai.partner !== b || p.ai.state !== 'visit' || isNight()) {
      finishVisitPair(b);
      return;
    }
    if (b.ai.visitPhase === 'hangout') return;
    b.ai.visitT = (b.ai.visitT || 0) + .22;
    if (b.ai.visitT > 12) { finishVisitPair(b); return; }
    const home = field.homes.find(h => h.name === b.ai.visitHome);
    if (!home) { finishVisitPair(b); return; }
    const target = b.ai.target;
    if (!target) { finishVisitPair(b); return; }
    const d = Math.hypot(target.x - b.cx, target.z - b.cz);
    if (d <= VISIT_DIST) {
      b.ai.visitArrived = true;
      b.ai.moving = false;
      b.ai.path = null;
      if (p.ai.visitArrived) {
        const host = b.ai.visitRole === 'host' ? b : p;
        const guest = host === b ? p : b;
        beginVisitHangout(host, guest);
      }
      return;
    }
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, target.x, target.z);
      if (!path) {
        if (d > 2.2) { finishVisitPair(b); return; }
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function safeFoodCount() {
    if (!field || !field.food || !field.food.allRipe) return 0;
    return field.food.allRipe({ kinds: SAFE_FOOD }).length;
  }

  function canMatePair(a, b) {
    // Species isolation until the DNA/hybrid-model pass. Cross-species social
    // bonds and visits stay enabled; only reproduction is same-species for now.
    if (!a || !b || a.species !== b.species) return false;
    return canMate(a, b, {
      room: bears.length < populationCap(),
      food: safeFoodCount() >= MATE_FOOD_MIN,
    });
  }

  function acquireMate(b) {
    if (!b || !b.ai || b.stage !== 'adult' || b.mateCooldown > 0) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const other of bears) {
      if (!canMatePair(b, other) || !other.ai) continue;
      if (!['wander', 'seekMate'].includes(other.ai.state)) continue;
      if (other.ai.partner && other.ai.partner !== b) continue;
      const d = Math.hypot(other.cx - b.cx, other.cz - b.cz);
      if (d > MATE_RADIUS) continue;
      const score = pairBond(b, other) * .4 - d * .02 + (rng() - .5) * .05;
      if (score > bestScore) { bestScore = score; best = other; }
    }
    if (!best) return null;
    startSeekMate(b, best);
    return best;
  }

  function startSeekMate(b, partner) {
    if (!b || !b.ai || !partner || !partner.ai) return false;
    releaseFood(b);
    b.ai.source = null;
    b.ai.waterSpot = null;
    b.ai.partner = partner;
    b.ai.state = 'seekMate';
    b.ai.target = { x: partner.cx, z: partner.cz };
    b.ai.faceYaw = Math.atan2(partner.cx - b.cx, partner.cz - b.cz);
    b.ai.moving = false;
    setPath(b, pathTo(b, partner.cx, partner.cz) || [{ x: partner.cx, z: partner.cz }]);
    return true;
  }

  function thinkSeekMate(b) {
    if (!b || !b.ai) return;
    const p = b.ai.partner;
    if (!p || !p.ai || !canMatePair(b, p) || !['wander', 'seekMate'].includes(p.ai.state) ||
        (p.ai.partner && p.ai.partner !== b)) {
      b.ai.partner = null;
      b.ai.state = 'wander';
      b.ai.idleT = .5;
      b.ai.taskCooldown = Math.max(b.ai.taskCooldown, 1.2);
      clearPath(b);
      return;
    }
    const d = Math.hypot(p.cx - b.cx, p.cz - b.cz);
    if (d <= MATE_DIST) { startMatePair(b, p); return; }
    b.ai.target = { x: p.cx, z: p.cz };
    b.ai.faceYaw = Math.atan2(p.cx - b.cx, p.cz - b.cz);
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, p.cx, p.cz);
      if (!path) {
        b.ai.partner = null;
        b.ai.state = 'wander';
        b.ai.idleT = .6;
        b.ai.taskCooldown = Math.max(b.ai.taskCooldown, 1.5);
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function startMatePair(a, b) {
    if (!a || !b || !a.ai || !b.ai || a === b) return false;
    a.ai.state = 'mate';
    b.ai.state = 'mate';
    a.ai.partner = b;
    b.ai.partner = a;
    a.ai.mateT = MATE_TIME;
    b.ai.mateT = MATE_TIME;
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.path = null;
    b.ai.path = null;
    a.ai.target = { x: b.cx, z: b.cz };
    b.ai.target = { x: a.cx, z: a.cz };
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    a.ai.animT = 0;
    b.ai.animT = 0;
    if (field && field.emote) {
      field.emote(a.cx, a.cy + 1.05, a.cz, 'heart');
      field.emote(b.cx, b.cy + 1.05, b.cz, 'heart');
    }
    return true;
  }

  function finishMatePair(a) {
    if (!a || !a.ai || a.ai.state !== 'mate') return;
    const b = a.ai.partner;
    if (!b || !b.ai) {
      a.ai.state = 'wander';
      a.ai.partner = null;
      a.ai.mateT = 0;
      clearPath(a);
      return;
    }
    const female = a.sex === 'F' ? a : b;
    const male = female === a ? b : a;
    if (!female.pregnant) {
      female.pregnant = true;
      female.gestation = GESTATION_TIME;
      female.fatherUid = male.uid;
      female.birthRetryT = 0;
    }
    a.mateCooldown = MATE_COOLDOWN;
    b.mateCooldown = MATE_COOLDOWN;
    addBond(a, b, .12);
    a.ai.mateT = 0;
    b.ai.mateT = 0;
    a.ai.state = 'wander';
    b.ai.state = 'wander';
    a.ai.idleT = .7;
    b.ai.idleT = .7;
    a.ai.taskCooldown = 2.0;
    b.ai.taskCooldown = 2.0;
    a.ai.partner = null;
    b.ai.partner = null;
    clearPath(a);
    clearPath(b);
    if (field && field.emote) field.emote(female.cx, female.cy + 1.1, female.cz, 'heart');
  }

  function startFollow(b, parent) {
    if (!b || !b.ai || !parent || !parent.ai) return false;
    releaseFood(b);
    b.ai.source = null;
    b.ai.waterSpot = null;
    b.ai.follow = parent;
    b.ai.state = 'follow';
    b.ai.target = { x: parent.cx, z: parent.cz };
    b.ai.faceYaw = Math.atan2(parent.cx - b.cx, parent.cz - b.cz);
    b.ai.moving = false;
    setPath(b, pathTo(b, parent.cx, parent.cz) || [{ x: parent.cx, z: parent.cz }]);
    return true;
  }

  function thinkFollow(b) {
    if (!b || !b.ai) return;
    const p = b.ai.follow;
    if (!p || !p.ai || !p.active || p.sleeping || p.grabs > 0 || p.inPond) {
      b.ai.follow = null;
      b.ai.state = 'wander';
      b.ai.idleT = .5;
      clearPath(b);
      return;
    }
    const d = Math.hypot(p.cx - b.cx, p.cz - b.cz);
    if (d <= FOLLOW_DIST) {
      b.ai.moving = false;
      b.ai.path = null;
      b.ai.faceYaw = Math.atan2(p.cx - b.cx, p.cz - b.cz);
      return;
    }
    b.ai.target = { x: p.cx, z: p.cz };
    b.ai.faceYaw = Math.atan2(p.cx - b.cx, p.cz - b.cz);
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, p.cx, p.cz);
      if (!path) {
        b.ai.follow = null;
        b.ai.state = 'wander';
        b.ai.idleT = .6;
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function findContest(b) {
    if (!b || !b.ai || !field || !field.food || !field.food.sources) return null;
    if (b.hunger < SEEK_HUNGER || b.health < HEALTH_WOOZY || b.ai.conflictCooldown > 0) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const source of field.food.sources) {
      if (!source.ripe || !source.claim || source.claim === b) continue;
      if (!SAFE_FOOD.includes(source.kind)) continue;
      const other = source.claim;
      if (!other || !other.active || other.sleeping || other.health < HEALTH_WOOZY) continue;
      if (!other.ai || !['wander', 'seekFood', 'eat', 'drink', 'seekWater', 'seekCompany'].includes(other.ai.state)) continue;
      if (other.grabs > 0 || other.inPond) continue;
      const d = Math.hypot(source.approachX - b.cx, source.approachZ - b.cz);
      if (d > CONFLICT_RADIUS) continue;
      const dc = Math.hypot(other.cx - source.approachX, other.cz - source.approachZ);
      if (dc > 3.5) continue;
      if (b.bold < .30 && other.scale > b.scale * 1.06) continue;
      const score = (1 - d / CONFLICT_RADIUS) * .6 + b.hunger * .5 +
        (b.scale >= other.scale ? .08 : 0) - pairBond(b, other) * .25;
      if (score > bestScore) { bestScore = score; best = { source, bear: other }; }
    }
    return best;
  }

  function acquireContest(b) {
    const contest = findContest(b);
    if (!contest) return null;
    releaseFood(b);
    b.ai.source = null;
    b.ai.contestSource = contest.source;
    b.ai.contestBear = contest.bear;
    b.ai.state = 'seekConflict';
    b.ai.target = { x: contest.source.approachX, z: contest.source.approachZ };
    b.ai.faceYaw = Math.atan2(contest.source.approachX - b.cx, contest.source.approachZ - b.cz);
    setPath(b, pathTo(b, contest.source.approachX, contest.source.approachZ) ||
      [{ x: contest.source.approachX, z: contest.source.approachZ }]);
    return contest.source;
  }

  function thinkSeekConflict(b) {
    if (!b || !b.ai) return;
    const source = b.ai.contestSource;
    const other = source ? source.claim : b.ai.contestBear;
    if (!source || !source.ripe || !other || !other.active || other.sleeping ||
        other.grabs > 0 || other.inPond || !other.ai) {
      b.ai.contestSource = null;
      b.ai.contestBear = null;
      b.ai.state = 'wander';
      b.ai.idleT = .6;
      b.ai.conflictCooldown = Math.max(b.ai.conflictCooldown, 2);
      clearPath(b);
      return;
    }
    const d = Math.hypot(other.cx - b.cx, other.cz - b.cz);
    if (d <= CONFLICT_DIST) {
      startConflict(b, other, source);
      return;
    }
    b.ai.target = { x: source.approachX, z: source.approachZ };
    b.ai.faceYaw = Math.atan2(source.approachX - b.cx, source.approachZ - b.cz);
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, source.approachX, source.approachZ);
      if (!path) {
        b.ai.contestSource = null;
        b.ai.contestBear = null;
        b.ai.state = 'wander';
        b.ai.idleT = .6;
        b.ai.conflictCooldown = Math.max(b.ai.conflictCooldown, 3);
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function startConflict(a, b, source) {
    if (!a || !b || !a.ai || !b.ai || a === b) return false;
    a.ai.state = 'conflict';
    b.ai.state = 'conflict';
    a.ai.partner = b;
    b.ai.partner = a;
    a.ai.conflictT = CONFLICT_TIME;
    b.ai.conflictT = CONFLICT_TIME;
    a.ai.conflictSource = source;
    b.ai.conflictSource = source;
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.path = null;
    b.ai.path = null;
    a.ai.target = { x: b.cx, z: b.cz };
    b.ai.target = { x: a.cx, z: a.cz };
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    a.ai.animT = 0;
    b.ai.animT = 0;
    if (field && field.emote) {
      field.emote(a.cx, a.cy + 1.14, a.cz, 'exclaim');
      field.emote(b.cx, b.cy + 1.14, b.cz, 'exclaim');
    }
    return true;
  }

  function finishConflict(b) {
    if (!b || !b.ai || b.ai.state !== 'conflict') return;
    const other = b.ai.partner;
    const source = b.ai.conflictSource || (other && other.ai ? other.ai.conflictSource : null);
    if (!other || !other.ai) {
      b.ai.state = 'wander';
      b.ai.partner = null;
      b.ai.conflictSource = null;
      b.ai.conflictT = 0;
      clearPath(b);
      return;
    }
    const weight = (bear) => (bear.scale || 1) * 1.05 + unit(bear.hunger) * .75 +
      unit(bear.bold) * .35 + unit(bear.energy) * .15 + rng() * .20;
    const winner = weight(b) >= weight(other) ? b : other;
    const loser = winner === b ? other : b;
    const claimant = source ? source.claim : null;
    const claimOk = !!source && source.ripe;

    b.ai.partner = null;
    other.ai.partner = null;
    b.ai.conflictSource = null;
    other.ai.conflictSource = null;
    b.ai.contestSource = null;
    other.ai.contestSource = null;
    b.ai.contestBear = null;
    other.ai.contestBear = null;
    b.ai.conflictT = 0;
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
    loser.ai.conflictCooldown = CONFLICT_COOLDOWN;
    loser.ai.socialCooldown = Math.max(loser.ai.socialCooldown, 4.0);
    clearPath(loser);
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
      if (d <= EAT_DIST) {
        startEat(winner);
      } else {
        winner.ai.state = 'seekFood';
        setPath(winner, pathTo(winner, source.approachX, source.approachZ) ||
          [{ x: source.approachX, z: source.approachZ }]);
      }
    } else {
      winner.ai.source = null;
      winner.ai.state = 'wander';
      winner.ai.idleT = .5;
      clearPath(winner);
    }
    addBond(b, other, -.08);
    if (field && field.emote) field.emote(loser.cx, loser.cy + 1.05, loser.cz, 'no');
  }

  function emitHeart(b) {
    if (field && field.emote && b) field.emote(b.cx, b.cy + .92, b.cz, 'heart');
  }

  function thinkWander(b) {
    if (b.ai.state !== 'wander') return;
    if (b.ai.moving) {
      // Finish the leg instead of diverting at the first hungry/thirsty tick.
      // A genuinely critical need still wins over the remaining walk.
      if (b.thirst >= CRITICAL_THIRST && acquireWater(b)) return;
      if (b.hunger >= CRITICAL_HUNGER && acquireFood(b)) return;
      if (b.ai.target && Math.hypot(b.ai.target.x - b.cx, b.ai.target.z - b.cz) < 0.58) {
        b.ai.moving = false;
        b.ai.target = null;
        b.ai.faceYaw = null;
        b.ai.idleT = 0.9 + rng() * 1.9;
      }
      return;
    }
    if (b.ai.taskCooldown > 0) return;
    if (b.thirst >= SEEK_THIRST) {
      if (acquireWater(b)) return;
    }
    if (b.hunger >= HIVE_HUNGER && acquireHive(b)) return;
    if (b.hunger >= CRITICAL_HUNGER && acquireContest(b)) return;
    if (b.hunger >= SEEK_HUNGER) {
      if (acquireFood(b)) return;
      if (acquireContest(b)) return;
    }
    if (b.stage === 'adult' && b.mateCooldown <= 0 && acquireMate(b)) return;
    if (b.stage === 'baby') {
      const parent = parentFor(b);
      if (parent && !parent.sleeping && !parent.inPond && parent.grabs === 0 &&
          Math.hypot(parent.cx - b.cx, parent.cz - b.cz) > FOLLOW_DIST) {
        if (startFollow(b, parent)) return;
      }
    }
    if (b.social >= SEEK_SOCIAL || b.affection >= SEEK_AFFECTION) {
      if (acquireCompany(b)) return;
    }
    if (b.ai.arrived) {
      b.ai.arrived = false;
      b.ai.idleT = 0.9 + rng() * 1.9;
    }
    if (b.ai.idleT > 0) return;
    if (!pickWanderTarget(b)) b.ai.idleT = 0.7;
  }

  function thinkSeekFood(b) {
    if (b.hunger <= STOP_HUNGER) {
      releaseFood(b);
      b.ai.source = null;
      b.ai.state = 'wander';
      b.ai.idleT = 0.4;
      clearPath(b);
      return;
    }
    let source = b.ai.source;
    if (!source || !source.ripe || (source.claim && source.claim !== b)) {
      releaseFood(b);
      b.ai.source = null;
      source = acquireFood(b);
    }
    if (!source) {
      if (acquireHive(b)) return;
      b.ai.state = 'wander';
      b.ai.idleT = 0.7;
      clearPath(b);
      return;
    }
    const d = Math.hypot(source.approachX - b.cx, source.approachZ - b.cz);
    if (d <= EAT_DIST) { startEat(b); return; }
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, source.approachX, source.approachZ);
      if (!path) {
        field.food.release(source, b);
        b.ai.source = null;
        b.ai.state = 'wander';
        b.ai.idleT = 0.7;
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function thinkSeekWater(b) {
    if (b.thirst <= STOP_THIRST) {
      b.ai.waterSpot = null;
      b.ai.state = 'wander';
      b.ai.idleT = 0.4;
      clearPath(b);
      return;
    }
    if (!b.ai.waterSpot) {
      if (!acquireWater(b)) {
        b.ai.state = 'wander';
        b.ai.idleT = 0.8;
        return;
      }
    }
    const spot = b.ai.waterSpot;
    const d = Math.hypot(spot.x - b.cx, spot.z - b.cz);
    if (d <= DRINK_DIST) { startDrink(b); return; }
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, spot.x, spot.z);
      if (!path) {
        b.ai.waterSpot = null;
        b.ai.state = 'wander';
        b.ai.idleT = 0.8;
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function thinkSeekHive(b) {
    if (!b.ai) return;
    let source = b.ai.source;
    if (!source || !source.ripe || (source.claim && source.claim !== b) || !canRaidHive(b)) {
      releaseFood(b);
      b.ai.source = null;
      b.ai.state = 'seekFood';
      b.ai.nextThink = 0;
      clearPath(b);
      return;
    }
    const d = Math.hypot(source.approachX - b.cx, source.approachZ - b.cz);
    if (d <= HIVE_DIST) { startHiveRaid(b); return; }
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, source.approachX, source.approachZ);
      if (!path) {
        releaseFood(b);
        b.ai.source = null;
        b.ai.state = 'seekFood';
        b.ai.idleT = 0.7;
        clearPath(b);
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function startHiveRaid(b) {
    if (!b.ai || !b.ai.source) return;
    const source = b.ai.source;
    b.ai.state = 'raidHive';
    b.ai.raidT = HIVE_RAID_TIME;
    b.ai.moving = false;
    b.ai.path = null;
    b.ai.faceYaw = Math.atan2(source.x - b.cx, source.z - b.cz);
  }

  function finishHiveRaid(b) {
    if (!b.ai) return;
    const source = b.ai.source;
    if (!source) {
      b.ai.state = 'wander';
      b.ai.idleT = 0.5;
      return;
    }
    if (rng() < HIVE_STING_CHANCE) {
      b.health = Math.max(1, b.health - HIVE_DAMAGE);
      b.ai.stungT = 2.0;
      releaseFood(b);
      b.ai.source = null;
      if (field && field.sting) field.sting(source.x, source.z, source.y);
      startFlee(b, source);
      return;
    }
    if (field.food.consume(source, b)) {
      b.hunger = Math.max(0, b.hunger - source.satiation);
    }
    b.ai.source = null;
    b.ai.target = null;
    b.ai.faceYaw = null;
    b.ai.state = 'wander';
    b.ai.idleT = 0.9;
    b.ai.taskCooldown = 1.3;
    clearPath(b);
  }

  function startFlee(b, source) {
    if (!b.ai) return;
    breakPair(b);
    releaseFood(b);
    b.ai.source = null;
    b.ai.follow = null;
    b.ai.target = null;
    b.ai.faceYaw = null;
    b.ai.state = 'flee';
    b.ai.fleeT = FLEE_TIME;
    b.ai.fleeFrom = source ? { x: source.x, z: source.z } : null;
    clearPath(b);
    if (!field || !field.nav) return;
    const dx = b.cx - (source ? source.x : b.cx);
    const dz = b.cz - (source ? source.z : b.cz);
    const len = Math.hypot(dx, dz) || 1;
    const p = field.nav.nearestWalkable(b.cx + dx / len * 4.5, b.cz + dz / len * 4.5);
    if (!p) return;
    b.ai.target = { x: p.x, z: p.z };
    const path = pathTo(b, p.x, p.z);
    if (path) setPath(b, path);
    else b.ai.moving = false;
    b.ai.faceYaw = Math.atan2(p.x - b.cx, p.z - b.cz);
  }

  function needsHome(b) {
    if (!b || !b.ai || !homeFor(b)) return false;
    if (b.health < HEALTH_WOOZY) return true;
    if (b.hunger >= CRITICAL_HUNGER || b.thirst >= CRITICAL_THIRST) return false;
    return isNightFor(b) || b.health < HEALTH_HURT || b.energy < ENERGY_TIRED;
  }

  function startSeekHome(b) {
    if (!b.ai) return false;
    breakPair(b);
    releaseFood(b);
    b.ai.source = null;
    b.ai.waterSpot = null;
    b.ai.follow = null;
    b.ai.target = null;
    b.ai.faceYaw = null;
    b.ai.state = 'seekHome';
    b.ai.idleT = 0;
    b.ai.moving = false;
    clearPath(b);
    return true;
  }

  function startSleep(b, home) {
    if (!b.ai || !home) return;
    b.ai.directiveHome = false;
    b.ai.state = 'sleep';
    b.ai.sleepHome = home.name;
    b.ai.moving = false;
    b.ai.path = null;
    b.ai.pathIndex = 0;
    b.ai.faceYaw = Math.atan2(home.door.x - b.cx, home.door.z - b.cz);
    b.sleeping = true;
  }

  function wake(b) {
    if (!b.ai) return;
    b.sleeping = false;
    b.needsBuild = true;
    b.ai.state = 'wander';
    b.ai.sleepHome = null;
    b.ai.idleT = 0.5;
    b.ai.taskCooldown = 0.8;
    b.ai.nextThink = 0;
  }

  function thinkSeekHome(b) {
    if (!b.ai) return;
    const home = homeFor(b);
    if (!home) {
      b.ai.state = 'wander';
      b.ai.idleT = 0.8;
      return;
    }
    if (!needsHome(b) && !b.ai.directiveHome) {
      b.ai.state = 'wander';
      b.ai.idleT = 0.5;
      return;
    }
    const d = Math.hypot(home.door.x - b.cx, home.door.z - b.cz);
    if (d <= HOME_DIST) { startSleep(b, home); return; }
    if (!b.ai.path || !b.ai.path.length) {
      const path = pathTo(b, home.door.x, home.door.z);
      if (!path) {
        b.ai.state = 'wander';
        b.ai.idleT = 0.8;
        return;
      }
      setPath(b, path);
    }
    b.ai.moving = true;
  }

  function directiveSnapshot(d) {
    if (!d) return null;
    return {
      kind: d.kind,
      target: d.target ? { x: d.target.x, z: d.target.z } : null,
      ttl: +d.ttl.toFixed(2),
    };
  }

  function directiveStatus(b, text, kind) {
    b.ai.directiveStatus = { text, kind: kind || null, t: 4.5 };
  }

  function issueDirective(b, kind, target) {
    if (!b || !b.ai || !enabled) return null;
    if (!DIRECTIVE_KINDS.includes(kind)) return null;
    if (kind === 'go' && (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z))) return null;
    if (b.ai.directives.length >= DIRECTIVE_MAX) b.ai.directives.shift();
    const d = {
      kind,
      target: kind === 'go' ? { x: +target.x, z: +target.z } : null,
      ttl: DIRECTIVE_TTL,
    };
    b.ai.directives.push(d);
    b.ai.nextThink = 0;
    directiveStatus(b, `${DIRECTIVE_LABELS[kind]} — asked`, kind);
    return { ...d, queued: b.ai.directives.length };
  }

  function releaseToNormal(b) {
    if (!b || !b.ai) return;
    b.ai.directiveHome = false;
    const ai = b.ai;
    if (ai.state === 'seekHome' || ai.state === 'seekFood' || ai.state === 'seekWater') {
      if (ai.state === 'seekFood') releaseFood(b);
      ai.source = null;
      ai.waterSpot = null;
      ai.target = null;
      ai.path = null;
      ai.pathIndex = 0;
      ai.moving = false;
      ai.state = 'wander';
      ai.idleT = 0.4;
      ai.nextThink = 0;
    } else if (ai.state === 'wander' && !ai.moving) {
      ai.target = null;
    }
  }

  function setPossessed(b, on) {
    if (!b) return false;
    if (!b.ai) attach(b);
    if (!b.ai) return false;
    b.ai.possessed = !!on;
    if (on) {
      breakPair(b);
      releaseFood(b);
      b.ai.source = null;
      b.ai.waterSpot = null;
      b.ai.partner = null;
      b.ai.target = null;
      b.ai.path = null;
      b.ai.pathIndex = 0;
      b.ai.moving = false;
      b.ai.faceYaw = null;
      b.ai.hopState = null;
      b.ai.directives.length = 0;
      b.ai.directive = null;
      b.ai.directiveStatus = null;
      if (b.sleeping) wake(b);
      b.ai.state = 'wander';
      b.ai.idleT = 0;
      b.ai.nextThink = 0;
    } else {
      b.ai.state = 'wander';
      b.ai.idleT = 0.3;
      b.ai.nextThink = 0;
      b.ai.faceYaw = null;
      b.ai.hopState = null;
      b.ai.moving = false;
      b.ai.path = null;
    }
    return true;
  }

  function cancelDirectives(b) {
    if (!b || !b.ai) return false;
    const had = b.ai.directives.length + (b.ai.directive ? 1 : 0);
    b.ai.directives.length = 0;
    b.ai.directive = null;
    releaseToNormal(b);
    directiveStatus(b, had ? 'cleared' : 'no directives');
    return true;
  }

  function nearestCompanyFor(b) {
    let best = null, bestD = SOCIAL_RADIUS * SOCIAL_RADIUS;
    for (const o of bears) {
      if (o === b || !o.active || !o.ai || o.sleeping || o.inPond) continue;
      const d = (o.cx - b.cx) ** 2 + (o.cz - b.cz) ** 2;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  function applyDirective(b, d) {
    if (d.kind === 'go') {
      const path = pathTo(b, d.target.x, d.target.z);
      if (!path) return false;
      clearPath(b);
      setPath(b, path);
      b.ai.target = { x: d.target.x, z: d.target.z };
      b.ai.state = 'wander';
      b.ai.idleT = 0;
      b.ai.moving = true;
      return true;
    }
    if (d.kind === 'eat') {
      if (!acquireFood(b)) return false;
      b.ai.state = 'seekFood';
      b.ai.nextThink = 0;
      return true;
    }
    if (d.kind === 'drink') {
      if (!acquireWater(b)) return false;
      b.ai.state = 'seekWater';
      b.ai.nextThink = 0;
      return true;
    }
    if (d.kind === 'home') {
      if (!homeFor(b)) return false;
      startSeekHome(b);
      b.ai.directiveHome = true;
      return true;
    }
    if (d.kind === 'social') {
      const other = nearestCompanyFor(b);
      if (!other || !startInvite(b, other)) return false;
      return true;
    }
    return false;
  }

  function directiveRefusal(b, d) {
    if (b.health < 28) return 'too hurt';
    if (b.energy < 0.10) return 'too tired';
    if (d.kind !== 'drink' && b.thirst >= 0.94) return 'too thirsty';
    if (d.kind !== 'eat' && b.hunger >= 0.94) return 'too hungry';
    if (d.kind === 'eat' && b.hunger < 0.28) return 'not hungry';
    if (d.kind === 'drink' && b.thirst < 0.28) return 'not thirsty';
    if (d.kind === 'home' && !homeFor(b)) return 'no home';
    // Unmet needs make a bear less willing to take orders. These are soft
    // penalties on top of the hard refusals above, so the same command can be
    // accepted or refused depending on the bear's state.
    const pressures = [];
    if (d.kind !== 'eat' && b.hunger > 0.50) pressures.push('hungry');
    if (d.kind !== 'drink' && b.thirst > 0.50) pressures.push('thirsty');
    if (d.kind !== 'social' && b.stage === 'adult' && b.mateCooldown <= 0 &&
        (b.social >= SEEK_SOCIAL || b.affection >= SEEK_AFFECTION || b.ai.state === 'seekMate')) {
      pressures.push('looking for company');
    }
    if (b.ai.state === 'seekMate' && d.kind !== 'social') pressures.push('busy courting');
    let willing = d.kind === 'social' ? 0.50 + b.bold * 0.35 : 0.84 + b.bold * 0.08;
    if (d.kind !== 'eat') willing -= Math.max(0, b.hunger - 0.50) * 0.55;
    if (d.kind !== 'drink') willing -= Math.max(0, b.thirst - 0.50) * 0.65;
    if (pressures.length) willing -= 0.18;
    willing = Math.max(0.08, Math.min(0.96, willing));
    return rng() < willing ? null : (pressures[0] || 'not right now');
  }

  function finishDirective(b, text) {
    if (!b || !b.ai) return;
    if (b.ai.directive) directiveStatus(b, `${DIRECTIVE_LABELS[b.ai.directive.kind]} — ${text}`, b.ai.directive.kind);
    b.ai.directive = null;
    releaseToNormal(b);
  }

  function startNextDirective(b) {
    if (!b.ai || !b.ai.directives.length) return false;
    const d = b.ai.directives.shift();
    const refusal = directiveRefusal(b, d);
    if (refusal) {
      directiveStatus(b, `${DIRECTIVE_LABELS[d.kind]} — ${refusal}`, d.kind);
      if (field && field.emote) field.emote(b.cx, b.cy + 1.08, b.cz, 'no');
      if (field && field.emoteHouse) field.emoteHouse(homeFor(b), 'refuse');
      b.ai.nextThink = 0.5;
      return false;
    }
    if (!applyDirective(b, d)) {
      directiveStatus(b, `${DIRECTIVE_LABELS[d.kind]} — cannot do that here`, d.kind);
      if (field && field.emote) field.emote(b.cx, b.cy + 1.08, b.cz, 'no');
      if (field && field.emoteHouse) field.emoteHouse(homeFor(b), 'refuse');
      b.ai.nextThink = 0.6;
      return false;
    }
    b.ai.directive = d;
    directiveStatus(b, `${DIRECTIVE_LABELS[d.kind]} — on it`, d.kind);
    if (field && field.emote) field.emote(b.cx, b.cy + 1.08, b.cz, 'yes');
    return true;
  }

  function checkDirective(b) {
    const d = b.ai.directive;
    if (!d) return;
    if (d.kind === 'go' && d.target &&
        Math.hypot(d.target.x - b.cx, d.target.z - b.cz) < 0.9) {
      finishDirective(b, 'arrived');
      return;
    }
    if (d.kind === 'eat' && b.hunger <= 0.36) { finishDirective(b, 'fed'); return; }
    if (d.kind === 'drink' && b.thirst <= 0.36) { finishDirective(b, 'watered'); return; }
    if (d.kind === 'home' && b.ai.state === 'sleep') { finishDirective(b, 'home'); return; }
    if (d.kind === 'social' && b.ai.state === 'social') { finishDirective(b, 'nuzzling'); return; }
  }

  function think(b) {
    if (!b.ai) return;
    if (['sleep', 'invite', 'social', 'decline', 'conflict', 'mate'].includes(b.ai.state)) return;
    if (needsHome(b) && b.ai.state !== 'seekHome') {
      startSeekHome(b);
      return;
    }
    if (b.ai.directive) checkDirective(b);
    if (!b.ai.directive && b.ai.directives.length && startNextDirective(b)) return;
    if (b.ai.state === 'wander') thinkWander(b);
    else if (b.ai.state === 'seekFood') thinkSeekFood(b);
    else if (b.ai.state === 'seekWater') thinkSeekWater(b);
    else if (b.ai.state === 'seekHive') thinkSeekHive(b);
    else if (b.ai.state === 'seekHome') thinkSeekHome(b);
    else if (b.ai.state === 'seekCompany') thinkSeekCompany(b);
    else if (b.ai.state === 'seekConflict') thinkSeekConflict(b);
    else if (b.ai.state === 'seekMate') thinkSeekMate(b);
    else if (b.ai.state === 'visit') thinkVisit(b);
    else if (b.ai.state === 'follow') thinkFollow(b);
    // eat/drink/raid are timer states; update() finishes them.
  }

  function setNeed(b, kind, value) {
    if (!b || !['hunger', 'thirst', 'social', 'affection'].includes(kind)) return false;
    const n = Math.max(0, Math.min(1, Number(value)));
    if (!Number.isFinite(n)) return false;
    b[kind] = n;
    if (b.ai) b.ai.nextThink = 0;
    return n;
  }

  // Force a state from the debug panel. Eat/drink are only entered when a real
  // target is available/in range; otherwise they degrade to the matching seek
  // task rather than nibbling at empty air.
  function debugState(b, state) {
    if (!b) return { ok: false, note: 'no bear' };
    if (!b.ai) attach(b);
    if (!['wander', 'seekFood', 'seekWater', 'eat', 'drink', 'seekCompany', 'seekConflict', 'seekHome', 'seekHive', 'seekMate'].includes(state)) {
      return { ok: false, note: 'unknown state' };
    }
    breakPair(b);
    releaseFood(b);
    b.ai.interrupted = false;
    b.ai.moving = false;
    b.ai.arrived = false;
    b.ai.hopState = null;
    b.ai.hopWait = 0;
    b.ai.turnWait = 0;
    b.ai.raidT = 0;
    b.ai.fleeT = 0;
    b.sleeping = false;
    b.ai.faceYaw = null;
    b.ai.path = null;
    b.ai.pathIndex = 0;
    b.ai.target = null;
    b.ai.source = null;
    b.ai.waterSpot = null;
    b.ai.eatT = 0;
    b.ai.drinkT = 0;
    b.ai.inviteT = 0;
    b.ai.socialT = 0;
    b.ai.declineT = 0;
    b.ai.conflictT = 0;
    b.ai.mateT = 0;
    b.ai.follow = null;
    b.ai.contestBear = null;
    b.ai.contestSource = null;
    b.ai.conflictSource = null;
    b.ai.shove = null;
    b.ai.animT = 0;
    b.ai.taskCooldown = 0;
    b.ai.nextThink = 0;

    if (state === 'wander') {
      b.ai.state = 'wander';
      b.ai.idleT = 0;
      return { ok: true, state: 'wander', note: 'wandering' };
    }
    if (state === 'seekFood') {
      b.ai.state = 'seekFood';
      return { ok: true, state: 'seekFood', note: 'looking for food' };
    }
    if (state === 'seekWater') {
      b.ai.state = 'seekWater';
      return { ok: true, state: 'seekWater', note: 'looking for water' };
    }
    if (state === 'seekCompany') {
      const p = acquireCompany(b);
      return {
        ok: !!p, state: b.ai.state,
        note: p ? `seeking ${p.name || 'a friend'}` : 'no company target',
      };
    }
    if (state === 'seekConflict') {
      const source = acquireContest(b);
      return {
        ok: !!source, state: b.ai.state,
        note: source ? 'looking for a contested snack' : 'no contested snack',
      };
    }
    if (state === 'seekMate') {
      const partner = acquireMate(b);
      return {
        ok: !!partner, state: b.ai.state,
        note: partner ? `seeking ${partner.name || 'a mate'}` : 'no eligible mate',
      };
    }
    if (state === 'seekHome') {
      startSeekHome(b);
      return { ok: true, state: b.ai.state, note: 'heading home' };
    }
    if (state === 'seekHive') {
      b.ai.state = 'seekHive';
      return { ok: true, state: 'seekHive', note: 'looking for a hive' };
    }
    if (state === 'eat') {
      const source = field.food.nearestRipe(b.cx, b.cz, { maxDistance: 999, bear: b, kinds: SAFE_FOOD });
      if (!source || !field.food.claim(source, b)) {
        b.ai.state = 'seekFood';
        return { ok: false, state: 'seekFood', note: 'no food target; seeking' };
      }
      b.ai.source = source;
      b.ai.target = { x: source.approachX, z: source.approachZ };
      const d = Math.hypot(source.approachX - b.cx, source.approachZ - b.cz);
      if (d <= EAT_DIST) {
        startEat(b);
        return { ok: true, state: 'eat', note: 'eating' };
      }
      b.ai.state = 'seekFood';
      setPath(b, pathTo(b, source.approachX, source.approachZ) || [{ x: source.approachX, z: source.approachZ }]);
      return { ok: true, state: 'seekFood', note: 'seeking nearest food' };
    }

    let spot = null;
    let bestD = Infinity;
    for (const s of field.waterSpots || []) {
      const d = Math.hypot(s.x - b.cx, s.z - b.cz);
      if (d < bestD) { bestD = d; spot = s; }
    }
    if (!spot) {
      b.ai.state = 'wander';
      return { ok: false, state: 'wander', note: 'no water target' };
    }
    b.ai.waterSpot = spot;
    b.ai.target = { x: spot.x, z: spot.z };
    if (bestD <= DRINK_DIST) {
      startDrink(b);
      return { ok: true, state: 'drink', note: 'drinking' };
    }
    b.ai.state = 'seekWater';
    setPath(b, pathTo(b, spot.x, spot.z) || [{ x: spot.x, z: spot.z }]);
    return { ok: true, state: 'seekWater', note: 'seeking nearest water' };
  }

  function setBond(a, b, value) {
    if (!a || !b || a === b) return false;
    const n = Math.max(0, Math.min(1, Number(value)));
    if (!Number.isFinite(n)) return false;
    if (!a.bonds || typeof a.bonds !== 'object') a.bonds = {};
    if (!b.bonds || typeof b.bonds !== 'object') b.bonds = {};
    a.bonds[bondKey(b)] = n;
    b.bonds[bondKey(a)] = n;
    return n;
  }

  function debugMate(a, b) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    if (!a.ai) attach(a);
    if (!b.ai) attach(b);
    if (a.stage !== 'adult' || b.stage !== 'adult') return { ok: false, note: 'adults only' };
    if (a.sex === b.sex) return { ok: false, note: 'opposite sexes required' };
    if (a.pregnant || b.pregnant) return { ok: false, note: 'already pregnant' };
    breakPair(a);
    breakPair(b);
    releaseFood(a);
    releaseFood(b);
    a.ai.source = null;
    b.ai.source = null;
    a.ai.state = 'wander';
    b.ai.state = 'wander';
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.path = null;
    b.ai.path = null;
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    startMatePair(a, b);
    return { ok: true, state: a.ai.state, partner: b.name || 'bear' };
  }

  function debugSocial(a, b, accept = true) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    if (!a.ai) attach(a);
    if (!b.ai) attach(b);
    breakPair(a);
    breakPair(b);
    releaseFood(a);
    releaseFood(b);
    a.ai.source = null;
    b.ai.source = null;
    a.ai.state = 'wander';
    b.ai.state = 'wander';
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.path = null;
    b.ai.path = null;
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    if (accept) {
      beginSocialPair(a, b);
      return { ok: true, accepted: true, state: a.ai.state, partner: b.name || 'bear' };
    }
    startDeclinePair(a, b);
    return { ok: true, accepted: false, state: a.ai.state, partner: b.name || 'bear' };
  }

  function debugInvite(a, b, accept = true) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    if (!a.ai) attach(a);
    if (!b.ai) attach(b);
    breakPair(a);
    breakPair(b);
    releaseFood(a);
    releaseFood(b);
    a.ai.source = null;
    b.ai.source = null;
    a.ai.state = 'wander';
    b.ai.state = 'wander';
    a.ai.moving = false;
    b.ai.moving = false;
    a.ai.path = null;
    b.ai.path = null;
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    const ok = startInvite(a, b, !!accept);
    return { ok, accepted: !!accept, state: a.ai.state, partner: b.name || 'bear' };
  }

  function debugVisit(a, b) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    if (!a.ai) attach(a);
    if (!b.ai) attach(b);
    breakPair(a);
    breakPair(b);
    releaseFood(a);
    releaseFood(b);
    a.ai.source = null;
    b.ai.source = null;
    a.ai.state = 'wander';
    b.ai.state = 'wander';
    const ok = startVisit(a, b);
    return { ok, state: a.ai.state, home: a.ai.visitHome || null, partner: b.name || 'bear' };
  }

  function debugConflict(a, b) {
    if (!a || !b || a === b || !a.active || !b.active || !field || !field.food) {
      return { ok: false, note: 'need two active bears and food' };
    }
    if (!a.ai) attach(a);
    if (!b.ai) attach(b);
    breakPair(a);
    breakPair(b);
    releaseFood(a);
    releaseFood(b);
    let source = null;
    for (const s of field.food.sources) {
      if (s.ripe && s.claim === b && SAFE_FOOD.includes(s.kind)) { source = s; break; }
    }
    if (!source) {
      let best = null;
      let bestD = Infinity;
      for (const s of field.food.sources) {
        if (!s.ripe || !SAFE_FOOD.includes(s.kind)) continue;
        const d = Math.hypot(s.approachX - b.cx, s.approachZ - b.cz);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (!best) return { ok: false, note: 'no ripe food source' };
      field.food.release(best, best.claim);
      if (!field.food.claim(best, b)) return { ok: false, note: 'could not claim a source' };
      source = best;
    }
    a.ai.source = null;
    a.ai.contestSource = source;
    a.ai.contestBear = b;
    a.ai.state = 'wander';
    b.ai.state = 'wander';
    startConflict(a, b, source);
    return { ok: true, source: source.id, state: a.ai.state, partner: b.name || 'bear' };
  }

  function plan(b) {
    if (!b || !b.ai) return null;
    return {
      state: b.ai.state,
      hunger: +b.hunger.toFixed(3),
      thirst: +b.thirst.toFixed(3),
      health: +b.health.toFixed(1),
      energy: +b.energy.toFixed(3),
      age: +b.age.toFixed(1),
      stage: b.stage,
      pregnant: !!b.pregnant,
      gestation: +(b.gestation || 0).toFixed(1),
      social: +b.social.toFixed(3),
      affection: +b.affection.toFixed(3),
      partner: partnerName(b) || null,
      bond: b.ai.partner ? +pairBond(b, b.ai.partner).toFixed(3) : null,
      follow: b.ai.follow ? (b.ai.follow.name || 'parent') : null,
      visitHome: b.ai.visitHome || null,
      visitRole: b.ai.visitRole || null,
      home: b.home || '',
      sleeping: !!b.sleeping,
      interrupted: !!b.ai.interrupted,
      moving: !!b.ai.moving,
      faceYaw: b.ai.faceYaw === null || b.ai.faceYaw === undefined ? null : +b.ai.faceYaw.toFixed(3),
      animT: +(b.ai.animT || 0).toFixed(3),
      source: b.ai.source ? b.ai.source.id : null,
      contest: b.ai.contestSource ? b.ai.contestSource.id : null,
      target: b.ai.target ? { x: +b.ai.target.x.toFixed(2), z: +b.ai.target.z.toFixed(2) } : null,
      path: b.ai.path ? b.ai.path.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) })) : [],
    };
  }

  function update(dt) {
    if (!enabled || !field || !bears.length) return;
    const t0 = performance.now();
    for (const b of bears) {
      if (!b.active) continue;
      if (!b.ai) attach(b);
      const ai = b.ai;
      if (!ai) continue;

      b.hunger = Math.min(1, finite(b.hunger, 0.3) +
        HUNGER_RATE * (b.pregnant ? PREGNANCY_HUNGER : 1) * dt);
      b.thirst = Math.min(1, finite(b.thirst, 0.3) + THIRST_RATE * dt);
      if (ai.taskCooldown > 0) ai.taskCooldown = Math.max(0, ai.taskCooldown - dt);
      if (ai.directive) {
        ai.directive.ttl = Math.max(0, ai.directive.ttl - dt);
        if (ai.directive.ttl <= 0) finishDirective(b, 'expired');
      }
      if (ai.directiveStatus && ai.directiveStatus.t > 0) {
        ai.directiveStatus.t = Math.max(0, ai.directiveStatus.t - dt);
      }
      if (ai.idleT > 0) ai.idleT = Math.max(0, ai.idleT - dt);
      if (ai.stungT > 0) ai.stungT = Math.max(0, ai.stungT - dt);
      if (ai.socialCooldown > 0) ai.socialCooldown = Math.max(0, ai.socialCooldown - dt);
      if (ai.conflictCooldown > 0) ai.conflictCooldown = Math.max(0, ai.conflictCooldown - dt);

      b.health = Math.max(1, Math.min(100, finite(b.health, 100)));
      b.energy = Math.max(0, Math.min(1, finite(b.energy, 1)));
      if (ai.state === 'sleep') {
        b.health = Math.min(100, b.health + HEALTH_REST * dt);
        b.energy = Math.min(1, b.energy + ENERGY_REST * dt);
        if (!isNightFor(b) && b.health >= HEALTH_HURT && b.energy >= ENERGY_TIRED) wake(b);
        continue;
      }
      b.health = Math.min(100, b.health + HEALTH_REGEN * dt);
      b.energy = Math.max(0, b.energy - ENERGY_RATE * dt);
      b.social = Math.min(1, finite(b.social, 0.3) + SOCIAL_RATE * dt);
      b.affection = Math.min(1, finite(b.affection, 0.25) + AFFECTION_RATE * dt);
      if (b.hunger >= 0.95) b.health = Math.max(1, b.health - HEALTH_STARVE * dt);

      // Possession keeps needs and vitals ticking but suspends decisions and
      // hop locomotion for this bear; app.js drives movement instead.
      if (ai.possessed) continue;

      const grounded = !b.airborne && b.contacts > 0 && (b.rMat[4] || 0) > 0.62;
      if (b.grabs > 0 || b.inPond) {
        if (!ai.interrupted) {
          ai.interrupted = true;
          ai.moving = false;
          ai.hopState = null;
          releaseFood(b);
        }
        continue;
      }
      if (!grounded && ai.interrupted) continue;
      if (ai.interrupted) {
        ai.interrupted = false;
        ai.nextThink = 0;
        ai.hopState = null;
        ai.path = null;
        resumeTask(b);
      }
      if (!grounded) continue;

      // Check for a hop that never made progress (a tree/root or a bad path).
      if (ai.moving) {
        const dx = b.cx - ai.lastX;
        const dz = b.cz - ai.lastZ;
        if (dx * dx + dz * dz > 0.04) {
          ai.lastX = b.cx;
          ai.lastZ = b.cz;
          ai.stuckT = 0;
        } else {
          ai.stuckT += dt;
          if (ai.stuckT > STUCK_TIME) {
            ai.stuckT = 0;
            if (ai.state === 'seekFood') releaseFood(b);
            ai.source = ai.state === 'seekFood' ? null : ai.source;
            ai.target = null;
            ai.path = null;
            ai.moving = false;
            ai.nextThink = 0;
          }
        }
      }

      if (ai.state === 'invite') {
        ai.animT += dt;
        ai.inviteT -= dt;
        if (ai.inviteT <= 0) resolveInvite(b);
        continue;
      }
      if (ai.state === 'social') {
        ai.animT += dt;
        ai.socialT -= dt;
        ai.heartT -= dt;
        if (ai.heartT <= 0) {
          ai.heartT = .72;
          emitHeart(b);
        }
        if (ai.socialT <= 0) endSocialPair(b);
        continue;
      }
      if (ai.state === 'decline') {
        ai.animT += dt;
        ai.declineT -= dt;
        if (ai.declineT <= 0) finishDeclinePair(b);
        continue;
      }
      if (ai.state === 'conflict') {
        ai.animT += dt;
        ai.conflictT -= dt;
        if (ai.conflictT <= 0) finishConflict(b);
        continue;
      }
      if (ai.state === 'mate') {
        ai.animT += dt;
        ai.mateT -= dt;
        if (ai.mateT <= 0) finishMatePair(b);
        continue;
      }
      if (ai.state === 'visit' && ai.visitPhase !== 'hangout') ai.animT += dt;
      if (ai.state === 'visit' && ai.visitPhase === 'hangout') {
        ai.animT += dt;
        ai.heartT -= dt;
        ai.visitT -= dt;
        if (ai.heartT <= 0) {
          ai.heartT = 1.0;
          emitHeart(b);
        }
        if (ai.visitT <= 0) finishVisitPair(b);
        continue;
      }
      if (ai.state === 'eat') {
        ai.animT += dt;
        ai.eatT -= dt;
        if (ai.eatT <= 0) finishFood(b);
        continue;
      }
      if (ai.state === 'drink') {
        ai.animT += dt;
        ai.drinkT -= dt;
        ai.rippleT = (ai.rippleT || 0) - dt;
        if (ai.rippleT <= 0 && b.ai.waterSpot && field.splash) {
          field.splash(b.ai.waterSpot.waterX, b.ai.waterSpot.waterZ, 0.30);
          ai.rippleT = 0.55;
        }
        if (ai.drinkT <= 0) finishWater(b);
        continue;
      }
      if (ai.state === 'raidHive') {
        ai.animT += dt;
        ai.raidT -= dt;
        if (ai.raidT <= 0) finishHiveRaid(b);
        continue;
      }
      if (ai.state === 'flee') {
        ai.fleeT -= dt;
        if (ai.fleeT <= 0) {
          ai.state = 'seekFood';
          ai.nextThink = 0;
          ai.moving = false;
          clearPath(b);
        }
        continue;
      }

      ai.nextThink -= dt;
      if (ai.nextThink > 0) continue;
      ai.nextThink = THINK_MIN + rng() * (THINK_MAX - THINK_MIN);
      think(b);
    }
    stats.ticks++;
    stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;
  }

  function statsNow() {
    const list = [];
    for (let i = 0; i < bears.length; i++) {
      const b = bears[i];
      if (!b.active || !b.ai) continue;
      list.push({
        index: i,
        state: b.ai.state,
        hunger: +b.hunger.toFixed(3),
        thirst: +b.thirst.toFixed(3),
        health: +b.health.toFixed(1),
        energy: +b.energy.toFixed(3),
        age: +b.age.toFixed(1),
        stage: b.stage,
        pregnant: !!b.pregnant,
        gestation: +(b.gestation || 0).toFixed(1),
        social: +b.social.toFixed(3),
        affection: +b.affection.toFixed(3),
        partner: partnerName(b) || null,
        bond: b.ai.partner ? +pairBond(b, b.ai.partner).toFixed(3) : null,
        follow: b.ai.follow ? (b.ai.follow.name || 'parent') : null,
        visitHome: b.ai.visitHome || null,
        visitRole: b.ai.visitRole || null,
        visitPhase: b.ai.visitPhase || null,
        home: b.home || '',
        sleeping: !!b.sleeping,
        woozy: b.health < HEALTH_WOOZY,
        stungT: +(b.ai.stungT || 0).toFixed(2),
        moving: !!b.ai.moving,
        interrupted: !!b.ai.interrupted,
        hopState: b.ai.hopState,
        faceYaw: b.ai.faceYaw === null || b.ai.faceYaw === undefined ? null : +b.ai.faceYaw.toFixed(3),
        animT: +(b.ai.animT || 0).toFixed(3),
        source: b.ai.source ? b.ai.source.id : null,
        contest: b.ai.contestSource ? b.ai.contestSource.id : null,
        target: b.ai.target ? [+b.ai.target.x.toFixed(2), +b.ai.target.z.toFixed(2)] : null,
        path: b.ai.path ? b.ai.path.length : 0,
      });
    }
    return { enabled, ticks: stats.ticks, ms: +stats.ms.toFixed(3), bears: list };
  }

  function directiveState(index) {
    const b = bears[index];
    if (!b || !b.active || !b.ai) return null;
    return {
      index,
      name: b.name || '',
      active: directiveSnapshot(b.ai.directive),
      queue: b.ai.directives.map(directiveSnapshot),
      status: b.ai.directiveStatus ? { ...b.ai.directiveStatus } : null,
      state: b.ai.state,
      hunger: +b.hunger.toFixed(2),
      thirst: +b.thirst.toFixed(2),
      energy: +b.energy.toFixed(2),
      health: +b.health.toFixed(1),
    };
  }

  return {
    update, onGrab, onRelease, detach, setEnabled,
    setNeed, setBond, debugState, debugSocial, debugInvite, debugVisit, debugConflict, debugMate,
    plan, stats: statsNow,
    issueDirective, cancelDirectives, directiveState, setPossessed,
    get enabled() { return enabled; },
  };
}
