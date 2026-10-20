// Per-actor personality traits.
//
// Traits are life state, not genes. Founders get deterministic hash-derived
// values so no RNG is drawn at attach time; children inherit via blendTraits.
// The whole feature is gated by FEATURE_DEFAULTS.personality.

export const TRAIT_AXES = Object.freeze(['bold', 'greed', 'curiosity']);
export const TRAIT_NEUTRAL = 0.5;

const clamp = (n, lo, hi) => n < lo ? lo : (n > hi ? hi : n);
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;

function hash32(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 0.15..0.85 keeps founders away from the hard edges while remaining fully
// deterministic. No RNG draw, so attach-time draw counts stay unchanged.
export function founderTraits(uid, species = 'bear') {
  const key = String(species || 'bear');
  const id = Number.isFinite(Number(uid)) ? String(Number(uid)) : '0';
  const out = {};
  for (const axis of TRAIT_AXES) {
    const unit = hash32(`${key}|${id}|${axis}`) / 4294967296;
    out[axis] = +(.15 + unit * .70).toFixed(4);
  }
  return out;
}

export function normalizeTraits(input, fallback = null) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const axis of TRAIT_AXES) {
    const value = finite(source[axis], fallback && Number.isFinite(fallback[axis])
      ? fallback[axis] : TRAIT_NEUTRAL);
    out[axis] = +clamp(value, 0, 1).toFixed(4);
  }
  return out;
}

export function ensureTraits(actor) {
  if (!actor || typeof actor !== 'object') return false;
  if (actor.traits && TRAIT_AXES.every(axis => Number.isFinite(actor.traits[axis]))) return false;
  actor.traits = founderTraits(actor.uid, actor.species);
  return true;
}

function copyModuleParams(out, id) {
  const modules = out.behaviorModules;
  if (!modules || !modules[id]) return null;
  const params = { ...(modules[id].params || {}) };
  modules[id] = { ...modules[id], params };
  return params;
}

// Applies bounded offsets to a resolved profile copy. A neutral trait set
// returns the exact input object (no clamps, no copies).
export function applyTraitOffsets(profile, traits) {
  const t = normalizeTraits(traits);
  const d = {
    bold: 2 * (t.bold - TRAIT_NEUTRAL),
    greed: 2 * (t.greed - TRAIT_NEUTRAL),
    curiosity: 2 * (t.curiosity - TRAIT_NEUTRAL),
  };
  if (!d.bold && !d.greed && !d.curiosity) return profile;

  const out = { ...profile };
  if (profile.behaviorModules) out.behaviorModules = { ...profile.behaviorModules };

  if (profile.wander) {
    const wander = { ...profile.wander };
    // Long wanders are disabled for Glass (base 0); never turn them on or
    // produce a zero-length long leg.
    if (wander.longChance > 0 && (d.bold || d.curiosity)) {
      wander.longChance = +clamp(wander.longChance + .10 * d.bold + .10 * d.curiosity, 0, .60).toFixed(4);
    }
    if (d.curiosity) {
      wander.min = +clamp(wander.min + .5 * d.curiosity, 2, 6).toFixed(4);
      wander.max = +clamp(wander.max + 2.0 * d.curiosity, 8, 18).toFixed(4);
    }
    out.wander = wander;
  }

  if (profile.thresholds) {
    const thresholds = { ...profile.thresholds };
    if (d.bold) {
      thresholds.seekSocial = +clamp(thresholds.seekSocial - .03 * d.bold, .52, .70).toFixed(4);
    }
    if (d.greed) {
      thresholds.seekHunger = +clamp(thresholds.seekHunger - .04 * d.greed, .55, .80).toFixed(4);
      thresholds.stopHunger = +clamp(thresholds.stopHunger + .03 * d.greed, .30, .55).toFixed(4);
    }
    out.thresholds = thresholds;
  }

  if (profile.social) {
    const social = { ...profile.social };
    if (d.bold) social.cooldown = +clamp(social.cooldown - 1.5 * d.bold, 10, 18).toFixed(4);
    if (d.curiosity) social.radius = +clamp(social.radius + 2.0 * d.curiosity, 16, 28).toFixed(4);
    out.social = social;
  }

  if (profile.food && d.greed) {
    const food = { ...profile.food };
    food.searchRadius = +clamp(food.searchRadius + 4.0 * d.greed, 36, 54).toFixed(4);
    out.food = food;
  }

  if (profile.hive && (d.bold || d.greed)) {
    const hive = { ...profile.hive };
    if (d.bold) hive.health = +clamp(hive.health - 5.0 * d.bold, 35, 55).toFixed(4);
    if (d.greed) hive.hunger = +clamp(hive.hunger - .03 * d.greed, .88, .98).toFixed(4);
    out.hive = hive;
    const params = copyModuleParams(out, 'hive');
    if (params) {
      if (d.bold) params.health = hive.health;
      if (d.greed) params.hunger = hive.hunger;
    }
  }

  if (profile.stargaze && d.curiosity) {
    const stargaze = { ...profile.stargaze };
    stargaze.chance = +clamp(stargaze.chance + .04 * d.curiosity, .02, .25).toFixed(4);
    out.stargaze = stargaze;
    const params = copyModuleParams(out, 'stargaze');
    if (params) params.chance = stargaze.chance;
  }

  out.traits = t;
  return out;
}
