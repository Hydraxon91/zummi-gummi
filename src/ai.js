// Meadow needs and the small autonomous state machine.
//
// app.js owns the rigid bodies, hop impulses and pose targets. This module only
// decides what a bear wants and which navigation point it should hop toward.
// That separation keeps user grabbing/throwing authoritative over the AI.

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

export function createBearAI({ field, getBears, getHours, rng = Math.random } = {}) {
  const bears = getBears ? getBears() : [];
  let enabled = true;
  const stats = { ticks: 0, ms: 0 };
  const hoursNow = typeof getHours === 'function' ? getHours : () => 12;
  const isNight = () => {
    const h = Number(hoursNow());
    return Number.isFinite(h) && (h >= NIGHT_START || h < NIGHT_END);
  };

  function assignHome(b) {
    if (!b || !field || !field.homes || !field.homes.length) return null;
    if (b.home) {
      const existing = field.homes.find(h => h.name === b.home);
      if (existing) return existing;
    }
    const i = Math.max(0, bears.indexOf(b));
    const home = field.homes[i % field.homes.length];
    b.home = home.name;
    return home;
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
      lastX: b.cx,
      lastZ: b.cz,
      stuckT: 0,
    };
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
    b.ai.interrupted = true;
    b.ai.moving = false;
    b.ai.arrived = false;
    b.ai.hopState = null;
    b.ai.hopWait = 0;
    b.ai.turnWait = 0;
    b.ai.faceYaw = null;
    b.ai.raidT = 0;
    b.ai.fleeT = 0;
    b.sleeping = false;
    if (b.ai.state === 'sleep') b.ai.state = 'wander';
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
    if (b.ai) {
      b.ai.moving = false;
      b.ai.path = null;
      b.ai.hopState = null;
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
        b.sleeping = false;
        if (b.ai.state === 'sleep') b.ai.state = 'wander';
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
    if (b.hunger >= SEEK_HUNGER) {
      if (acquireFood(b)) return;
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
    releaseFood(b);
    b.ai.source = null;
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
    return isNight() || b.health < HEALTH_HURT || b.energy < ENERGY_TIRED;
  }

  function startSeekHome(b) {
    if (!b.ai) return false;
    releaseFood(b);
    b.ai.source = null;
    b.ai.waterSpot = null;
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
    if (!needsHome(b)) {
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

  function think(b) {
    if (!b.ai) return;
    if (b.ai.state === 'sleep') return;
    if (needsHome(b) && b.ai.state !== 'seekHome') {
      startSeekHome(b);
      return;
    }
    if (b.ai.state === 'wander') thinkWander(b);
    else if (b.ai.state === 'seekFood') thinkSeekFood(b);
    else if (b.ai.state === 'seekWater') thinkSeekWater(b);
    else if (b.ai.state === 'seekHive') thinkSeekHive(b);
    else if (b.ai.state === 'seekHome') thinkSeekHome(b);
    // eat/drink/raid are timer states; update() finishes them.
  }

  function setNeed(b, kind, value) {
    if (!b || (kind !== 'hunger' && kind !== 'thirst')) return false;
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
    if (!['wander', 'seekFood', 'seekWater', 'eat', 'drink'].includes(state)) {
      return { ok: false, note: 'unknown state' };
    }
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

  function plan(b) {
    if (!b || !b.ai) return null;
    return {
      state: b.ai.state,
      hunger: +b.hunger.toFixed(3),
      thirst: +b.thirst.toFixed(3),
      health: +b.health.toFixed(1),
      energy: +b.energy.toFixed(3),
      home: b.home || '',
      sleeping: !!b.sleeping,
      interrupted: !!b.ai.interrupted,
      moving: !!b.ai.moving,
      faceYaw: b.ai.faceYaw === null || b.ai.faceYaw === undefined ? null : +b.ai.faceYaw.toFixed(3),
      animT: +(b.ai.animT || 0).toFixed(3),
      source: b.ai.source ? b.ai.source.id : null,
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

      b.hunger = Math.min(1, finite(b.hunger, 0.3) + HUNGER_RATE * dt);
      b.thirst = Math.min(1, finite(b.thirst, 0.3) + THIRST_RATE * dt);
      if (ai.taskCooldown > 0) ai.taskCooldown = Math.max(0, ai.taskCooldown - dt);
      if (ai.idleT > 0) ai.idleT = Math.max(0, ai.idleT - dt);
      if (ai.stungT > 0) ai.stungT = Math.max(0, ai.stungT - dt);

      b.health = Math.max(1, Math.min(100, finite(b.health, 100)));
      b.energy = Math.max(0, Math.min(1, finite(b.energy, 1)));
      if (ai.state === 'sleep') {
        b.health = Math.min(100, b.health + HEALTH_REST * dt);
        b.energy = Math.min(1, b.energy + ENERGY_REST * dt);
        if (!isNight() && b.health >= HEALTH_HURT && b.energy >= ENERGY_TIRED) wake(b);
        continue;
      }
      b.health = Math.min(100, b.health + HEALTH_REGEN * dt);
      b.energy = Math.max(0, b.energy - ENERGY_RATE * dt);
      if (b.hunger >= 0.95) b.health = Math.max(1, b.health - HEALTH_STARVE * dt);

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
        target: b.ai.target ? [+b.ai.target.x.toFixed(2), +b.ai.target.z.toFixed(2)] : null,
        path: b.ai.path ? b.ai.path.length : 0,
      });
    }
    return { enabled, ticks: stats.ticks, ms: +stats.ms.toFixed(3), bears: list };
  }

  return {
    update, onGrab, onRelease, detach, setEnabled,
    setNeed, debugState, plan, stats: statsNow,
    get enabled() { return enabled; },
  };
}
