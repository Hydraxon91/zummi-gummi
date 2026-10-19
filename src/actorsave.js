// Per-actor save validation and collection registration.
//
// save.js owns the save envelope and storage. This module owns the shape of an
// actor record, its version and the deliberate handling of unknown content.

import { DNA_VERSION } from './dna.js';
import { getSpecies } from './species.js';

export const ACTOR_SAVE_VERSION = 1;

const STAGES = new Set(['baby', 'teen', 'adult']);
const NUMERIC_FIELDS = [
  'scale', 'health', 'hunger', 'thirst', 'energy', 'age',
  'gestation', 'mateCooldown', 'social', 'affection', 'bold',
];
const collections = new Map();

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => Number.isFinite(v);

function validateCommon(a, where, errors, { kind, requireFlavor }) {
  if (!isObj(a)) { errors.push(`${where} is not an object`); return; }
  if (a.actorVersion !== undefined && a.actorVersion !== ACTOR_SAVE_VERSION) {
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
  if (a.bonds !== undefined && !isObj(a.bonds)) errors.push(`${where}.bonds is invalid`);

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
