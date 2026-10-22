// Portable activity dispositions: plain records in, new records out. No actors,
// clocks, renderer, physics, RNG or storage access. The host supplies elapsed days
// and completion events. Traits and temporary mood remain separate systems.
export const ACTIVITY_DISPOSITIONS = Object.freeze([
  Object.freeze({ id: 'stargaze', neutral: .5, preferenceEffect: .04,
    habitEffect: .02, learning: .1, decayPerDay: .05, chanceMin: .02, chanceMax: .25 }),
]);

const clamp = n => Math.max(0, Math.min(1, n));
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);

export function validActivityValues(value) {
  return isRecord(value) && Object.entries(value).every(([id, n]) =>
    ACTIVITY_DISPOSITIONS.some(def => def.id === id) && Number.isFinite(n) && n >= 0 && n <= 1);
}

function normalize(input, habit) {
  const out = {};
  if (!isRecord(input)) return out;
  for (const def of ACTIVITY_DISPOSITIONS) {
    const n = input[def.id];
    if (!Number.isFinite(n)) continue;
    const value = clamp(n);
    if (value !== (habit ? 0 : def.neutral)) out[def.id] = value;
  }
  return out;
}

export const normalizePreferences = input => normalize(input, false);
export const normalizeHabits = input => normalize(input, true);

export function reinforceHabit(input, id) {
  const def = ACTIVITY_DISPOSITIONS.find(item => item.id === id);
  const out = normalizeHabits(input);
  if (def) out[id] = clamp((out[id] || 0) + def.learning);
  return out;
}

export function decayHabits(input, elapsedDays) {
  const out = normalizeHabits(input);
  if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) return out;
  for (const def of ACTIVITY_DISPOSITIONS) {
    if (out[def.id] === undefined) continue;
    const value = Math.max(0, out[def.id] - def.decayPerDay * elapsedDays);
    if (value > 0) out[def.id] = value;
    else delete out[def.id];
  }
  return out;
}

export function activityOffset(def, preferences, habits, features) {
  const preference = features.preferences && Number.isFinite(preferences?.[def.id])
    ? clamp(preferences[def.id]) : def.neutral;
  const habit = features.habits && Number.isFinite(habits?.[def.id]) ? clamp(habits[def.id]) : 0;
  return +(2 * (preference - def.neutral) * def.preferenceEffect + habit * def.habitEffect).toFixed(4);
}

// Same precision as the existing trait/mood profile effects. Sub-resolution decay
// is retained in saved state but does not rebuild a profile every frame.
export function activityCacheKey(preferences, habits, features) {
  return ACTIVITY_DISPOSITIONS.map(def => activityOffset(def, preferences, habits, features)).join('|');
}

export function applyActivityOffsets(profile, preferences, habits, features) {
  let out = profile;
  for (const def of ACTIVITY_DISPOSITIONS) {
    if (!profile[def.id]) continue; // Never grant an unsupported/disabled activity.
    const offset = activityOffset(def, preferences, habits, features);
    if (!offset) continue;
    const params = { ...profile[def.id], chance: +Math.max(def.chanceMin,
      Math.min(def.chanceMax, profile[def.id].chance + offset)).toFixed(4) };
    if (out === profile) out = { ...profile, behaviorModules: { ...profile.behaviorModules } };
    out[def.id] = params;
    if (out.behaviorModules[def.id]) {
      out.behaviorModules[def.id] = { ...out.behaviorModules[def.id], params };
    }
  }
  return out;
}
