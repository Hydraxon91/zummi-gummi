// Derived mood: needs + bonds + recent history, with no RNG and no save state.
//
// `moodFor` is pure. The engine smooths it into runtime-only ai.mood/ai.mood*
// fields; those fields are deliberately excluded from actor snapshots.

export const MOOD_TAU = 8;
export const MOOD_UPDATE_INTERVAL = 0.25;
export const MOOD_BUCKET = 0.05;

const EVENT_WEIGHTS = Object.freeze({
  born: .12, child: .12, mated: .10, playdate: .08,
  lesson: .06, taught: .06, visit: .05, stage: .05,
  meal: .04, bond: .04, home: .03, moved: .01,
});

const clamp = (n, lo, hi) => n < lo ? lo : (n > hi ? hi : n);
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;

export function moodLabel(value) {
  const v = finite(value, 0);
  if (v < -.35) return { key: 'miserable', label: 'miserable' };
  if (v < -.10) return { key: 'low', label: 'out of sorts' };
  if (v < .20) return { key: 'settled', label: 'settled' };
  if (v < .50) return { key: 'content', label: 'content' };
  return { key: 'cheerful', label: 'cheerful' };
}

export function moodFor(actor, { day = 0, hours = 12 } = {}) {
  if (!actor) return 0;
  let target = 0;
  target -= .35 * clamp((finite(actor.hunger, .3) - .55) / .40, 0, 1);
  target -= .30 * clamp((finite(actor.thirst, .3) - .55) / .40, 0, 1);
  target -= .20 * clamp((.30 - finite(actor.energy, 1)) / .30, 0, 1);
  target -= .35 * clamp((50 - finite(actor.health, 100)) / 50, 0, 1);
  target -= .15 * clamp((.55 - finite(actor.social, .3)) / .35, 0, 1);
  target -= .10 * clamp((.55 - finite(actor.affection, .25)) / .35, 0, 1);

  const bonds = Object.values(actor.bonds || {}).filter(Number.isFinite);
  const bestBond = bonds.length ? Math.max(...bonds) : 0;
  target += .10 * clamp(bestBond / .70, 0, 1);
  if (actor.ai && (actor.ai.partner || actor.ai.familyTask)) target += .05;

  let eventMood = 0;
  for (const event of actor.history || []) {
    if (!event || !Object.hasOwn(EVENT_WEIGHTS, event.kind)) continue;
    const eventDay = finite(event.day, day);
    const eventHour = finite(event.hour, hours);
    const ageDays = Math.max(0, (day - eventDay) + (hours - eventHour) / 24);
    if (ageDays > 12) continue;
    eventMood += EVENT_WEIGHTS[event.kind] * Math.exp(-ageDays / 2);
  }
  target += clamp(eventMood, -.20, .20);
  return +clamp(target, -1, 1).toFixed(3);
}

function copyModuleParams(profile, id) {
  const modules = profile.behaviorModules;
  if (!modules || !modules[id]) return null;
  const params = { ...(modules[id].params || {}) };
  modules[id] = { ...modules[id], params };
  return params;
}

// Stacked after trait offsets. A zero mood returns the exact input object.
export function applyMoodOffsets(profile, moodValue) {
  const mood = clamp(finite(moodValue, 0), -1, 1);
  if (!mood) return profile;

  const out = { ...profile };
  if (profile.behaviorModules) out.behaviorModules = { ...profile.behaviorModules };

  if (profile.wander) {
    const wander = { ...profile.wander };
    if (wander.longChance > 0) {
      wander.longChance = +clamp(wander.longChance + .06 * mood, 0, .60).toFixed(4);
    }
    wander.min = +clamp(wander.min + .3 * mood, 2, 6).toFixed(4);
    wander.max = +clamp(wander.max + 1.2 * mood, 8, 18).toFixed(4);
    out.wander = wander;
  }

  if (profile.thresholds) {
    const thresholds = { ...profile.thresholds };
    thresholds.seekSocial = +clamp(thresholds.seekSocial - .02 * mood, .52, .70).toFixed(4);
    out.thresholds = thresholds;
  }

  if (profile.social) {
    const social = { ...profile.social };
    social.cooldown = +clamp(social.cooldown - 1.2 * mood, 10, 18).toFixed(4);
    out.social = social;
  }

  if (profile.food) {
    const food = { ...profile.food };
    food.searchRadius = +clamp(food.searchRadius + 2.0 * mood, 36, 54).toFixed(4);
    out.food = food;
  }

  if (profile.stargaze) {
    const stargaze = { ...profile.stargaze };
    stargaze.chance = +clamp(stargaze.chance + .03 * mood, .02, .25).toFixed(4);
    out.stargaze = stargaze;
    const params = copyModuleParams(out, 'stargaze');
    if (params) params.chance = stargaze.chance;
  }

  out.mood = mood;
  return out;
}
