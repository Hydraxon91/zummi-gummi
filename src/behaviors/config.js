// Layered per-actor behavior config.
//
// Resolution order (later wins):
//   module defaults -> race profile -> per-actor override -> runtime override
//
// The resolved object keeps the legacy profile shape (`food`, `hive`, `mate`,
// ...) so the engine can read it exactly like behaviorprofiles.js while modules
// consume `behaviorModules.<id>.{enabled, params}`. Resolution happens once per
// actor and is cached by config version; nothing here touches the RNG.

import { profileFor } from '../behaviorprofiles.js';
import { listSpecies } from '../species.js';
import { hiveModule } from './hive.js';
import { mateModule } from './mate.js';
import { directivesModule } from './directives.js';
import { conflictModule } from './conflict.js';
import { stargazeModule } from './stargaze.js';
import { giftingModule } from './gifting.js';
import { pairActivitiesModule } from './affection.js';
import { relationshipsModule } from './relationships.js';
import { groupActivitiesModule } from './groups.js';
import { applyTraitOffsets, founderTraits, normalizeTraits } from './traits.js';
import { applyMoodOffsets } from './mood.js';

// Feature flags for known quirks. Every flag is off by default, so the engine
// behaves exactly like the legacy path until a flag is deliberately enabled.
export const FEATURE_DEFAULTS = Object.freeze({
  glassNightWindow: false,     // Glass stargaze: use real night, not "outside 09-16"
  glassBedtimeMode: false,     // Glass draws daytime shelter bedtime/wake, not night defaults
  singleDayWindow: false,      // One Glass day window; glass.js adoption lands with the fix
  cancelPairStateReset: false, // cancelPair also resets seek* states
  matePairOnPathFailure: false,// startSeekMate clears the pair when pathing fails
  glassEngineRng: false,       // glass.js insideT uses the engine RNG
  thoughtBubbles: false,       // UI-only plan().reason overlay; no simulation reads
  personality: false,          // trait offsets; modules engine only, no reads while off
  mood: false,                 // derived mood offsets; modules engine only, runtime-only
  departures: false,           // runtime-only departure capture; no mourning or save fields
  farewells: false,            // stars master switch; modules engine only
  starsOldAge: false,          // old-age fading
  starsStarvation: false,      // starvation fading
  starsStings: false,          // sting acceleration while already fading
  mourning: false,             // per-save grief after stars departures
  adoption: false,             // automatic guardians for parentless babies
  gifting: false,              // offer ripe food to another actor
  pairActivities: false,       // chat and cuddle pair activities
  rivalry: false,              // persistent unresolved conflict records
  reconciliation: false,       // repair an unresolved rivalry
  partnership: false,          // persistent adult partnerships
  groupActivities: false,      // spaced three-to-five actor activities
  interactionHistory: false,   // completion-only social/visit/conflict history
});

const MODULE_DEFAULTS = Object.freeze({
  mate: mateModule.defaults,
  hive: hiveModule.defaults,
  conflict: conflictModule.defaults,
  directives: directivesModule.defaults,
  stargaze: stargazeModule.defaults,
  gifting: giftingModule.defaults,
  pairActivities: pairActivitiesModule.defaults,
  relationships: relationshipsModule.defaults,
  groupActivities: groupActivitiesModule.defaults,
});

// Profiles written before the modules reshape still used flat capability keys.
// They remain a fallback for callers that build a profile by hand.
const LEGACY_CAPABILITY = new Set(['hive', 'conflict', 'directives', 'stargaze']);
const LEGACY_MODULE_SECTIONS = new Set(['hive', 'conflict', 'directives', 'stargaze', 'gifting']);

const SPECIES = new Map(listSpecies().map(def => [def.id, def]));

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeParams(...sources) {
  const out = {};
  for (const source of sources) {
    if (!isObject(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (isObject(value)) out[key] = mergeParams(out[key], value);
      else out[key] = value;
    }
  }
  return out;
}

function moduleOverrideFrom(patch) {
  if (!isObject(patch)) return null;
  return isObject(patch.modules) ? patch.modules : patch;
}

export function createBehaviorConfig({ features: featureOverrides = null } = {}) {
  const features = { ...FEATURE_DEFAULTS, ...(isObject(featureOverrides) ? featureOverrides : {}) };
  const warnedSpecies = new Set();
  const actorModules = new Map();     // uid -> { [moduleId]: { enabled?, params? } }
  const speciesModules = new Map();   // species -> { [moduleId]: ... }
  const runtimeModules = new Map();   // moduleId -> { enabled?, params? }
  const cache = new WeakMap();        // actor -> { version, value }
  let version = 1;
  let hasUnknown = false;
  let invalidations = 0;

  function bump() {
    version++;
    return version;
  }

  function warnUnknown(actor) {
    if (!actor) return;
    const species = actor.species;
    if (!species || SPECIES.has(species) || warnedSpecies.has(species)) return;
    warnedSpecies.add(species);
    hasUnknown = true;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`behavior: unknown species "${species}" — using the BEAR fallback profile`);
    }
  }

  // Per-module config before actor/runtime overrides.
  function baseModule(id, base) {
    const def = MODULE_DEFAULTS[id] || { enabled: true, params: {} };
    const profileBlock = isObject(base.modules) && isObject(base.modules[id]) ? base.modules[id] : null;
    let enabled = profileBlock && profileBlock.enabled !== undefined
      ? !!profileBlock.enabled
      : def.enabled;
    if (!profileBlock && LEGACY_CAPABILITY.has(id)) enabled = !!base[id];
    return {
      enabled,
      params: mergeParams(def.params, base[id], profileBlock && profileBlock.params),
    };
  }

  // Runtime layers in precedence order: species, actor, global.
  function layeredModule(id, base, actor) {
    const initial = baseModule(id, base);
    const uid = actor && Number.isFinite(actor.uid) ? String(actor.uid) : null;
    const species = actor && actor.species;
    const layers = [
      species && speciesModules.get(species),
      uid && actorModules.get(uid),
      runtimeModules.get(id) ? { [id]: runtimeModules.get(id) } : null,
    ];
    let enabled = initial.enabled;
    let params = initial.params;
    for (const layer of layers) {
      const entry = layer && (isObject(layer.modules) ? layer.modules[id] : layer[id]);
      if (!isObject(entry)) continue;
      if (entry.enabled !== undefined) enabled = !!entry.enabled;
      if (isObject(entry.params)) params = mergeParams(params, entry.params);
    }
    return { enabled, params };
  }

  function resolve(actor) {
    warnUnknown(actor);
    const base = profileFor(actor);
    const resolved = { ...base };
    const modules = {};
    for (const id of Object.keys(MODULE_DEFAULTS)) {
      const config = layeredModule(id, base, actor);
      modules[id] = config;
      if (LEGACY_MODULE_SECTIONS.has(id)) {
        resolved[id] = config.enabled ? config.params : null;
      }
    }
    resolved.behaviorModules = modules;
    let out = resolved;
    if (features.personality && actor) {
      const traits = actor.traits
        ? normalizeTraits(actor.traits)
        : founderTraits(actor.uid, actor.species);
      out = applyTraitOffsets(out, traits);
    }
    if (features.mood && actor) {
      const mood = Number.isFinite(actor.ai?.moodBucket) ? actor.ai.moodBucket : 0;
      out = applyMoodOffsets(out, mood);
    }
    return out;
  }

  function invalidateActor(actor) {
    if (!actor) return false;
    cache.delete(actor);
    invalidations += 1;
    return true;
  }

  function forActor(actor) {
    if (!actor) return resolve(actor);
    const cached = cache.get(actor);
    if (cached && cached.version === version) return cached.value;
    const value = resolve(actor);
    cache.set(actor, { version, value });
    return value;
  }

  function scopeTarget(scope) {
    if (!scope) return { kind: 'global' };
    if (Number.isFinite(Number(scope.uid))) return { kind: 'actor', key: String(Number(scope.uid)) };
    if (typeof scope.species === 'string') return { kind: 'species', key: scope.species };
    return { kind: 'global' };
  }

  function moduleLayer(map, id, target) {
    let layer;
    if (target.kind === 'actor') {
      layer = map.actorModules;
      let entry = layer.get(target.key) || {};
      if (!isObject(entry.modules)) entry = { modules: entry };
      return { set(value) { layer.set(target.key, { ...entry, modules: { ...entry.modules, [id]: value } }); } };
    }
    if (target.kind === 'species') {
      layer = map.speciesModules;
      let entry = layer.get(target.key) || {};
      if (!isObject(entry.modules)) entry = { modules: entry };
      return { set(value) { layer.set(target.key, { ...entry, modules: { ...entry.modules, [id]: value } }); } };
    }
    return { set(value) { map.runtimeModules.set(id, value); } };
  }

  const map = { actorModules, speciesModules, runtimeModules };

  function setModuleEnabled(id, value, scope = null) {
    if (!id) return false;
    const target = scopeTarget(scope);
    const current = target.kind === 'global'
      ? runtimeModules.get(id) || {}
      : moduleOverrideFrom(target.kind === 'actor'
        ? actorModules.get(target.key)
        : speciesModules.get(target.key))?.[id] || {};
    moduleLayer(map, id, target).set({ ...current, enabled: !!value });
    bump();
    return true;
  }

  function setModuleParams(id, patch, scope = null) {
    if (!id || !isObject(patch)) return false;
    const target = scopeTarget(scope);
    const current = target.kind === 'global'
      ? runtimeModules.get(id) || {}
      : moduleOverrideFrom(target.kind === 'actor'
        ? actorModules.get(target.key)
        : speciesModules.get(target.key))?.[id] || {};
    moduleLayer(map, id, target).set({
      ...current,
      params: mergeParams(current.params, patch),
    });
    bump();
    return true;
  }

  function setActorConfig(uid, patch) {
    const key = String(Number(uid));
    if (!Number.isFinite(Number(uid)) || !isObject(patch)) return false;
    const incoming = moduleOverrideFrom(patch) || {};
    let entry = actorModules.get(key) || {};
    if (!isObject(entry.modules)) entry = { modules: entry };
    const modules = { ...entry.modules };
    for (const [id, value] of Object.entries(incoming)) {
      if (!isObject(value)) continue;
      const current = isObject(modules[id]) ? modules[id] : {};
      modules[id] = {
        ...current,
        ...value,
        params: mergeParams(current.params, value.params),
      };
    }
    actorModules.set(key, { ...entry, modules });
    bump();
    return true;
  }

  function setFeature(name, value) {
    if (!(name in FEATURE_DEFAULTS)) return false;
    if (features[name] !== !!value) bump();
    features[name] = !!value;
    return true;
  }

  function reset() {
    actorModules.clear();
    speciesModules.clear();
    runtimeModules.clear();
    for (const key of Object.keys(features)) features[key] = FEATURE_DEFAULTS[key];
    bump();
    return true;
  }

  return {
    features,
    forActor,
    profileFor: forActor,
    setModuleEnabled,
    setModuleParams,
    setActorConfig,
    setFeature,
    invalidateActor,
    reset,
    getVersion: () => version,
    getInvalidations: () => invalidations,
    resetInvalidations: () => { invalidations = 0; },
    get hasUnknownSpecies() { return hasUnknown; },
    defaults: MODULE_DEFAULTS,
  };
}
