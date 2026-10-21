// Per-actor save validation and collection registration.
//
// save.js owns the save envelope and storage. This module owns the shape of an
// actor record, its version and the deliberate handling of unknown content.

import { DNA_VERSION } from './dna.js';
import { getSpecies } from './species.js';
import { normalizeSkills, normalizeHistory, normalizePlaydates } from './family.js';
import { normalizeTraits, TRAIT_AXES } from './behaviors/traits.js';
import { normalizeMourning } from './behaviors/mourning.js';

// 2 is trait/grief/guardian-free, 3 carries traits, 4 carries per-save mourning
// and 5 carries a baby's guardian (mourning and traits may ride along).
export const ACTOR_SAVE_VERSION = 5;

const STAGES = new Set(['baby', 'teen', 'adult']);
const SUPPORTED_VERSIONS = new Set([1, 2, 3, 4, 5]);
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
    if (a.actorVersion !== 5) errors.push(`${where}.guardianUid requires actorVersion 5`);
  }
  if (a.actorVersion === 5 && !isNum(a.guardianUid)) {
    errors.push(`${where}.guardianUid is required for actorVersion 5`);
  }
  if (a.bonds !== undefined && !isObj(a.bonds)) errors.push(`${where}.bonds is invalid`);

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
  if (a.history !== undefined) {
    if (!Array.isArray(a.history)) errors.push(`${where}.history is invalid`);
    else a.history.forEach((event, index) => {
      if (!isObj(event) || typeof event.kind !== 'string') {
        errors.push(`${where}.history[${index}] is invalid`);
      } else {
        if (event.uid !== undefined && !isNum(event.uid)) errors.push(`${where}.history[${index}].uid is invalid`);
        if (event.day !== undefined && !isNum(event.day)) errors.push(`${where}.history[${index}].day is invalid`);
        if (event.hour !== undefined && !isNum(event.hour)) errors.push(`${where}.history[${index}].hour is invalid`);
      }
    });
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
    if (a.actorVersion !== 4 && a.actorVersion !== 5) {
      errors.push(`${where}.mourning requires actorVersion 4 or 5`);
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
  const guardianUid = record.stage === 'baby' && isNum(record.guardianUid) && record.guardianUid > 0
    ? record.guardianUid : null;
  const versioned = guardianUid ? 5 : (mourning.length ? 4 : (hasTraits ? 3 : 2));
  const migrated = {
    ...record,
    actorVersion: versioned,
    ...(hasTraits ? { traits: normalizeTraits(record.traits) } : {}),
    skills: normalizeSkills(record.skills),
    history: normalizeHistory(record.history),
    playdates: normalizePlaydates(record.playdates),
  };
  if (guardianUid) migrated.guardianUid = guardianUid;
  else delete migrated.guardianUid;
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

registerActorCollection({
  key: 'bears', kind: 'softbody', required: true, validate: validateSoftBody,
});
registerActorCollection({
  key: 'glass', kind: 'skinned', required: false, validate: validateSkinned,
});
