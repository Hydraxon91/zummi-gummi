// Per-actor save validation and collection registration.
//
// saveformat.js owns the save envelope; save.js owns storage. This module owns
// the shape of an actor record, its version and the deliberate handling of
// unknown content.

import { DNA_VERSION } from './dna.js';
import { getSpecies } from './species.js';
import {
  normalizeSkills, normalizeHistory, normalizePlaydates, historyHasBondDelta,
} from './family.js';
import { normalizeTraits, TRAIT_AXES } from './behaviors/traits.js';
import { normalizeMourning } from './behaviors/mourning.js';
import { normalizePartnerUid, normalizeRivals } from './relationships.js';
import { normalizeCarriedFood } from './foodportions.js';
import { normalizePreferences, normalizeHabits, validActivityValues } from './behaviors/preferences.js';

// 2 is trait/grief/guardian/delta-free, 3 carries traits, 4 carries per-save
// mourning, 5 carries a baby's guardian, 6 carries bond-delta history, 7
// carries a persisted daily gift day, and 8 carries rivalry, partnership or a
// carried gift portion; 9 carries activity preferences/habits (older fields may ride along).
export const ACTOR_SAVE_VERSION = 9;

const STAGES = new Set(['baby', 'teen', 'adult']);
const SUPPORTED_VERSIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const NUMERIC_FIELDS = [
  'scale', 'health', 'hunger', 'thirst', 'energy', 'age',
  'gestation', 'mateCooldown', 'social', 'affection', 'bold',
];
const collections = new Map();

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => Number.isFinite(v);

function validateCommon(a, where, errors, { kind, requireFlavor }) {
  if (!isObj(a)) { errors.push(`${where} is not an object`); return; }
  if (a.actorVersion !== undefined && !SUPPORTED_VERSIONS.has(a.actorVersion)) {
    errors.push(`${where}.actorVersion ${a.actorVersion} is unsupported`);
  }
  if (!isNum(a.uid) || a.uid <= 0) errors.push(`${where}.uid is invalid`);
  if (!isNum(a.x) || !isNum(a.z)) errors.push(`${where} position is invalid`);
  if (requireFlavor && (!isNum(a.flavor) || a.flavor < 0)) errors.push(`${where}.flavor is invalid`);
  if (requireFlavor || a.stage !== undefined) {
    if (!STAGES.has(a.stage)) errors.push(`${where}.stage is invalid`);
  }
  for (const key of NUMERIC_FIELDS) {
    if (a[key] !== undefined && !isNum(a[key])) errors.push(`${where}.${key} is invalid`);
  }
  if (a.pregnant !== undefined && typeof a.pregnant !== 'boolean') errors.push(`${where}.pregnant is invalid`);
  if (a.parentUids !== undefined && (!Array.isArray(a.parentUids) || a.parentUids.some(u => !isNum(u)))) {
    errors.push(`${where}.parentUids is invalid`);
  }
  if (a.guardianUid !== undefined) {
    if (!isNum(a.guardianUid) || a.guardianUid <= 0) {
      errors.push(`${where}.guardianUid is invalid`);
    } else if (a.stage !== 'baby') {
      errors.push(`${where}.guardianUid requires stage baby`);
    }
    if (a.actorVersion !== 5 && a.actorVersion !== 6 && a.actorVersion !== 7 &&
        a.actorVersion !== 8 && a.actorVersion !== 9) {
      errors.push(`${where}.guardianUid requires actorVersion 5, 6, 7, 8 or 9`);
    }
  }
  if (a.lastGiftDay !== undefined) {
    if (!isNum(a.lastGiftDay) || a.lastGiftDay < 0) {
      errors.push(`${where}.lastGiftDay is invalid`);
    }
    if (a.actorVersion !== 7 && a.actorVersion !== 8 && a.actorVersion !== 9) {
      errors.push(`${where}.lastGiftDay requires actorVersion 7 or 8 or 9`);
    }
  }
  if (a.actorVersion === 7 && !isNum(a.lastGiftDay)) {
    errors.push(`${where}.lastGiftDay is required for actorVersion 7`);
  }
  if (a.actorVersion === 5 && !isNum(a.guardianUid)) {
    errors.push(`${where}.guardianUid is required for actorVersion 5`);
  }
  if (a.partnerUid !== undefined) {
    if (!isNum(a.partnerUid) || a.partnerUid <= 0 || Math.floor(a.partnerUid) !== a.partnerUid) {
      errors.push(`${where}.partnerUid is invalid`);
    } else if (a.partnerUid === a.uid) {
      errors.push(`${where}.partnerUid cannot reference the same actor`);
    } else if (a.stage !== 'adult') {
      errors.push(`${where}.partnerUid requires stage adult`);
    }
    if (a.actorVersion !== 8 && a.actorVersion !== 9) errors.push(`${where}.partnerUid requires actorVersion 8 or 9`);
  }
  if (a.rivals !== undefined) {
    if (!isObj(a.rivals)) errors.push(`${where}.rivals is invalid`);
    else for (const [uid, record] of Object.entries(a.rivals)) {
      if (!isNum(Number(uid)) || Number(uid) <= 0 || Number(uid) === a.uid ||
          !isObj(record) || !isNum(record.sinceDay) || record.sinceDay < 0 ||
          !isNum(record.sinceHour) || record.sinceHour < 0 || record.sinceHour > 24) {
        errors.push(`${where}.rivals.${uid} is invalid`);
      }
    }
    if (a.actorVersion !== 8 && a.actorVersion !== 9) errors.push(`${where}.rivals requires actorVersion 8 or 9`);
  }
  if (a.carriedFood !== undefined) {
    if (!isObj(a.carriedFood)) errors.push(`${where}.carriedFood is invalid`);
    else {
      const c = a.carriedFood;
      if (typeof c.id !== 'string' || !c.id ||
          typeof c.kind !== 'string' || !c.kind ||
          !isNum(c.satiation) || c.satiation <= 0) {
        errors.push(`${where}.carriedFood is invalid`);
      }
    }
    if (a.actorVersion !== 8 && a.actorVersion !== 9) errors.push(`${where}.carriedFood requires actorVersion 8 or 9`);
  }
  if (a.actorVersion === 8 &&
      a.partnerUid === undefined && a.rivals === undefined && a.carriedFood === undefined) {
    errors.push(`${where} has actorVersion 8 but no version-8 field`);
  }
  if (a.bonds !== undefined && !isObj(a.bonds)) errors.push(`${where}.bonds is invalid`);
  for (const key of ['preferences', 'habits']) {
    if (a[key] === undefined) continue;
    if (!validActivityValues(a[key])) errors.push(`${where}.${key} is invalid`);
    if (a.actorVersion !== 9) errors.push(`${where}.${key} requires actorVersion 9`);
  }
  if (a.actorVersion === 9 && a.preferences === undefined && a.habits === undefined) {
    errors.push(`${where} has actorVersion 9 but no version-9 field`);
  }

  if (a.actorVersion === 3 && !isObj(a.traits)) {
    errors.push(`${where}.traits is required for actorVersion 3`);
  }
  if (a.traits !== undefined) {
    if (!isObj(a.traits)) errors.push(`${where}.traits is invalid`);
    else for (const axis of TRAIT_AXES) {
      if (!isNum(a.traits[axis]) || a.traits[axis] < 0 || a.traits[axis] > 1) {
        errors.push(`${where}.traits.${axis} is invalid`);
      }
    }
  }

  if (a.skills !== undefined) {
    if (!isObj(a.skills)) errors.push(`${where}.skills is invalid`);
    else for (const [key, value] of Object.entries(a.skills)) {
      if (!isNum(value) || value < 0 || value > 1) errors.push(`${where}.skills.${key} is invalid`);
    }
  }
  let historyDeltas = 0;
  if (a.history !== undefined) {
    if (!Array.isArray(a.history)) errors.push(`${where}.history is invalid`);
    else a.history.forEach((event, index) => {
      if (!isObj(event) || typeof event.kind !== 'string') {
        errors.push(`${where}.history[${index}] is invalid`);
      } else {
        if (event.uid !== undefined && !isNum(event.uid)) errors.push(`${where}.history[${index}].uid is invalid`);
        if (event.day !== undefined && !isNum(event.day)) errors.push(`${where}.history[${index}].day is invalid`);
        if (event.hour !== undefined && !isNum(event.hour)) errors.push(`${where}.history[${index}].hour is invalid`);
        if (event.bondBefore !== undefined || event.bondAfter !== undefined) {
          if (!isNum(event.bondBefore) || !isNum(event.bondAfter) ||
              event.bondBefore < 0 || event.bondBefore > 1 ||
              event.bondAfter < 0 || event.bondAfter > 1) {
            errors.push(`${where}.history[${index}].bondDelta is invalid`);
          } else {
            historyDeltas++;
          }
        }
      }
    });
  }
  if (historyDeltas && a.actorVersion !== 6 && a.actorVersion !== 7 && a.actorVersion !== 8 && a.actorVersion !== 9) {
    errors.push(`${where}.bondDelta requires actorVersion 6, 7, 8 or 9`);
  }
  if (a.actorVersion === 6 && !historyDeltas) {
    errors.push(`${where}.bondDelta is required for actorVersion 6`);
  }
  if (a.playdates !== undefined) {
    if (!isObj(a.playdates)) errors.push(`${where}.playdates is invalid`);
    else for (const [uid, record] of Object.entries(a.playdates)) {
      if (!isNum(Number(uid)) || !isObj(record) ||
          !isNum(record.day) || !isNum(record.hour)) {
        errors.push(`${where}.playdates.${uid} is invalid`);
      }
    }
  }

  if (a.mourning !== undefined) {
    if (!Array.isArray(a.mourning)) errors.push(`${where}.mourning is invalid`);
    else a.mourning.forEach((record, index) => {
      if (!isObj(record) || !isNum(record.uid) || record.uid <= 0 ||
          record.cause !== 'stars' || !isNum(record.day) ||
          !isNum(record.hours) || record.hours < 0 || record.hours > 24 ||
          !isNum(record.untilDay) || record.untilDay <= record.day ||
          !isNum(record.duration) || record.duration <= 0 ||
          !isNum(record.closeness) || record.closeness < 0 || record.closeness > 1 ||
          record.name !== undefined && typeof record.name !== 'string' ||
          record.species !== undefined && typeof record.species !== 'string' ||
          record.lastComfortDay !== undefined && record.lastComfortDay !== null &&
            !isNum(record.lastComfortDay)) {
        errors.push(`${where}.mourning[${index}] is invalid`);
      }
    });
    if (a.actorVersion !== 4 && a.actorVersion !== 5 && a.actorVersion !== 6 &&
        a.actorVersion !== 7 && a.actorVersion !== 8 && a.actorVersion !== 9) {
      errors.push(`${where}.mourning requires actorVersion 4-9`);
    }
  }
  if (a.actorVersion === 4 && !Array.isArray(a.mourning)) {
    errors.push(`${where}.mourning is required for actorVersion 4`);
  }

  if (a.kind !== undefined && a.kind !== kind &&
      !(kind === 'softbody' && a.kind === 'bear') &&
      !(kind === 'skinned' && a.kind === 'glass')) {
    errors.push(`${where}.kind is invalid`);
  }
  if (a.species !== undefined) {
    const def = typeof a.species === 'string' ? getSpecies(a.species, null) : null;
    if (!def) errors.push(`${where}.species is unknown`);
    else if (def.kind !== kind) errors.push(`${where}.species is not ${kind}`);
  }

  // Genome is optional for v1 saves created before the DNA pass; spawn supplies
  // the species default when it is absent.
  if (a.genome !== undefined) {
    if (!isObj(a.genome) || !isNum(a.genome.version) || !isObj(a.genome.species) || !isObj(a.genome.genes)) {
      errors.push(`${where}.genome is invalid`);
    } else if (a.genome.version !== DNA_VERSION) {
      errors.push(`${where}.genome version ${a.genome.version} is unsupported`);
    }
  }
}

export function validateSoftBody(a, where, errors) {
  validateCommon(a, where, errors, { kind: 'softbody', requireFlavor: true });
}

export function validateSkinned(a, where, errors) {
  validateCommon(a, where, errors, { kind: 'skinned', requireFlavor: false });
}

// Migrate a saved actor in place-safe form. Unknown fields survive; new family
// fields are filled with defaults so a v1 save keeps loading.
export function migrateActorRecord(record) {
  if (!isObj(record)) return record;
  const version = Number.isFinite(record.actorVersion) ? record.actorVersion : 1;
  if (version > ACTOR_SAVE_VERSION) return record;
  const hasTraits = isObj(record.traits);
  const mourning = normalizeMourning(record.mourning);
  const history = normalizeHistory(record.history);
  const hasDelta = historyHasBondDelta(history);
  const giftDay = isNum(record.lastGiftDay) && record.lastGiftDay >= 0
    ? Math.floor(record.lastGiftDay) : null;
  const guardianUid = record.stage === 'baby' && isNum(record.guardianUid) && record.guardianUid > 0
    ? record.guardianUid : null;
  const partnerUid = normalizePartnerUid(record.partnerUid);
  const rivals = normalizeRivals(record.rivals);
  const carriedFood = normalizeCarriedFood(record.carriedFood);
  const advanced = partnerUid !== null || Object.keys(rivals).length > 0 || carriedFood !== null;
  const preferences = normalizePreferences(record.preferences);
  const habits = normalizeHabits(record.habits);
  const hasPreferences = Object.keys(preferences).length > 0;
  const hasHabits = Object.keys(habits).length > 0;
  const versioned = hasPreferences || hasHabits ? 9 : advanced ? 8
    : (giftDay !== null ? 7
      : (hasDelta ? 6 : (guardianUid ? 5 : (mourning.length ? 4 : (hasTraits ? 3 : 2)))));
  const migrated = {
    ...record,
    actorVersion: versioned,
    ...(hasTraits ? { traits: normalizeTraits(record.traits) } : {}),
    skills: normalizeSkills(record.skills),
    history,
    playdates: normalizePlaydates(record.playdates),
  };
  if (guardianUid) migrated.guardianUid = guardianUid;
  else delete migrated.guardianUid;
  if (giftDay !== null) migrated.lastGiftDay = giftDay;
  else delete migrated.lastGiftDay;
  if (partnerUid !== null) migrated.partnerUid = partnerUid;
  else delete migrated.partnerUid;
  if (Object.keys(rivals).length) migrated.rivals = rivals;
  else delete migrated.rivals;
  if (carriedFood) migrated.carriedFood = carriedFood;
  else delete migrated.carriedFood;
  if (hasPreferences) migrated.preferences = preferences;
  else delete migrated.preferences;
  if (hasHabits) migrated.habits = habits;
  else delete migrated.habits;
  if (mourning.length) migrated.mourning = mourning;
  else delete migrated.mourning;
  return migrated;
}

export function migrateActorWorld(world) {
  if (!isObj(world)) return world;
  for (const collection of collections.values()) {
    const value = world[collection.key];
    if (Array.isArray(value)) world[collection.key] = value.map(migrateActorRecord);
  }
  return world;
}

export function registerActorCollection(def) {
  if (!def || typeof def.key !== 'string' || !def.key) throw new Error('actor collection key required');
  if (collections.has(def.key)) throw new Error(`actor collection already registered: ${def.key}`);
  if (typeof def.validate !== 'function') throw new Error(`actor collection ${def.key} validator required`);
  const collection = Object.freeze({
    key: def.key,
    kind: def.kind || null,
    required: !!def.required,
    validate: def.validate,
  });
  collections.set(collection.key, collection);
  return collection;
}

export function listActorCollections() {
  return [...collections.values()];
}

// Highest actor uid across a loaded game. Used to reserve the shared allocator
// before restored actors are spawned, including actors on an inactive map.
export function maxActorUid(worlds) {
  let max = 0;
  for (const id of ['field', 'studio']) {
    const world = worlds && worlds[id];
    if (!world || typeof world !== 'object') continue;
    for (const collection of collections.values()) {
      const list = world[collection.key];
      if (!Array.isArray(list)) continue;
      for (const actor of list) {
        if (actor && isNum(actor.uid) && actor.uid > max) max = actor.uid;
      }
    }
  }
  return max;
}

export function validateActorWorld(world, where, errors) {
  for (const collection of collections.values()) {
    const value = world[collection.key];
    if (value === undefined) {
      if (collection.required) errors.push(`${where}.${collection.key} is not an array`);
      continue;
    }
    if (!Array.isArray(value)) {
      errors.push(`${where}.${collection.key} is not an array`);
      continue;
    }
    value.forEach((actor, index) => {
      collection.validate(actor, `${where}.${collection.key}[${index}]`, errors);
    });
  }
}

// Partnership and rivalry are reciprocal records. A save that references a
// missing actor, or only one side of a pair, is rejected before restore touches
// the live session.
export function validateGameRelationships(worlds, errors) {
  const byUid = new Map();
  if (!isObj(worlds)) return;
  for (const id of ['field', 'studio']) {
    const world = worlds[id];
    if (!isObj(world)) continue;
    for (const collection of collections.values()) {
      const list = world[collection.key];
      if (!Array.isArray(list)) continue;
      for (const actor of list) {
        if (isObj(actor) && isNum(actor.uid)) byUid.set(actor.uid, actor);
      }
    }
  }
  for (const [uid, actor] of byUid) {
    const partnerUid = normalizePartnerUid(actor.partnerUid);
    if (partnerUid !== null) {
      const partner = byUid.get(partnerUid);
      if (!partner) {
        errors.push(`actor ${uid}.partnerUid references missing actor ${partnerUid}`);
      } else {
        if (normalizePartnerUid(partner.partnerUid) !== uid) {
          errors.push(`actor ${uid}.partnerUid is not reciprocal`);
        }
        if (actor.stage !== 'adult' || partner.stage !== 'adult') {
          errors.push(`actor ${uid}.partnerUid requires adult partners`);
        }
      }
    }
    for (const [key, record] of Object.entries(normalizeRivals(actor.rivals))) {
      const otherUid = Number(key);
      const other = byUid.get(otherUid);
      if (!other) {
        errors.push(`actor ${uid}.rivals references missing actor ${otherUid}`);
      } else if (!normalizeRivals(other.rivals)[String(uid)]) {
        errors.push(`actor ${uid}.rivals.${otherUid} is not reciprocal`);
      } else if (!record) {
        errors.push(`actor ${uid}.rivals.${otherUid} is invalid`);
      }
    }
  }
}

registerActorCollection({
  key: 'bears', kind: 'softbody', required: true, validate: validateSoftBody,
});
registerActorCollection({
  key: 'glass', kind: 'skinned', required: false, validate: validateSkinned,
});
