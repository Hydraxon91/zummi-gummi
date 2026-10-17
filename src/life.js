// Life-stage and family rules.
//
// This module is deliberately data-only: app.js owns physics bodies, surfaces
// and spawning, ai.js owns deciding when a bear wants to court or follow a
// parent. Keeping the thresholds and inheritance math here gives the save/schema
// work one place to read and lets the headless checks exercise the rules without
// a renderer.

export const STAGE_ORDER = ['baby', 'teen', 'adult'];
export const STAGE_SCALE = { baby: 0.58, teen: 0.78, adult: 1.00 };
export const STAGE_AGE = { baby: 0, teen: 180, adult: 420 };       // seconds
export const STAGE_START_AGE = { baby: 30, teen: 240, adult: 600 };

export const MATE_HEALTH = 70;
export const MATE_HUNGER = 0.40;
export const MATE_THIRST = 0.60;
export const MATE_ENERGY = 0.30;
export const MATE_FOOD_MIN = 18;
export const MATE_COOLDOWN = 90;            // seconds, both parents
export const MATE_TIME = 3.0;               // readable courtship beat
export const GESTATION_TIME = 25;           // seconds
export const PREGNANCY_HUNGER = 1.35;       // hunger-rate multiplier
export const HOME_CAPACITY = 4;
export const FLAVOR_MUTATION = 0.08;

function finite(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return n < lo ? lo : (n > hi ? hi : n);
}

export function stageForAge(age) {
  const a = Math.max(0, finite(age, 0));
  if (a < STAGE_AGE.teen) return 'baby';
  if (a < STAGE_AGE.adult) return 'teen';
  return 'adult';
}

export function ageForStage(stage) {
  return STAGE_START_AGE[stage] !== undefined ? STAGE_START_AGE[stage] : STAGE_START_AGE.adult;
}

export function scaleForStage(stage) {
  return STAGE_SCALE[stage] !== undefined ? STAGE_SCALE[stage] : STAGE_SCALE.adult;
}

export function advanceAge(b, dt) {
  if (!b) return 'adult';
  b.age = Math.max(0, finite(b.age, 0) + Math.max(0, finite(dt, 0)));
  return stageForAge(b.age);
}

export function advanceGestation(b, dt) {
  if (!b || !b.pregnant) return false;
  b.gestation = Math.max(0, finite(b.gestation, 0) - Math.max(0, finite(dt, 0)));
  return b.gestation <= 0;
}

export function canMate(a, b, { room = true, food = true } = {}) {
  if (!a || !b || a === b || !a.active || !b.active) return false;
  if (a.stage !== 'adult' || b.stage !== 'adult') return false;
  if (a.sex === b.sex) return false;
  if (a.pregnant || b.pregnant) return false;
  if (a.sleeping || b.sleeping || a.grabs > 0 || b.grabs > 0 || a.inPond || b.inPond) return false;
  if (!room || !food) return false;
  if ((a.mateCooldown || 0) > 0 || (b.mateCooldown || 0) > 0) return false;
  if (finite(a.health, 0) < MATE_HEALTH || finite(b.health, 0) < MATE_HEALTH) return false;
  if (finite(a.hunger, 1) > MATE_HUNGER || finite(b.hunger, 1) > MATE_HUNGER) return false;
  if (finite(a.thirst, 1) > MATE_THIRST || finite(b.thirst, 1) > MATE_THIRST) return false;
  if (finite(a.energy, 0) < MATE_ENERGY || finite(b.energy, 0) < MATE_ENERGY) return false;
  return true;
}

// Children average the parents' pace ranges and receive a small mutation. The
// result always stays inside the same safe bounds as a naturally spawned bear.
export function blendPace(a, b, rng = Math.random) {
  const left = a || {};
  const right = b || {};
  const min = clamp(
    (finite(left.hopSpeedMin, 0.80) + finite(right.hopSpeedMin, 0.80)) * 0.5 +
      (rng() - 0.5) * 0.08,
    0.60, 0.95,
  );
  let max = clamp(
    (finite(left.hopSpeedMax, 1.65) + finite(right.hopSpeedMax, 1.65)) * 0.5 +
      (rng() - 0.5) * 0.12,
    1.35, 1.90,
  );
  if (max < min + 0.25) max = clamp(min + 0.25, 1.35, 1.90);
  return { min: +min.toFixed(4), max: +max.toFixed(4) };
}

export function inheritedFlavor(motherFlavor, flavorCount, rng = Math.random) {
  const count = Math.max(1, flavorCount | 0);
  if (!Number.isFinite(motherFlavor) || motherFlavor < 0 || rng() < FLAVOR_MUTATION) {
    return Math.floor(rng() * count);
  }
  return Math.floor(motherFlavor) % count;
}
