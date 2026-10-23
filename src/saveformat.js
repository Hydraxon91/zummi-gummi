// Versioned save payload validation, migration and normalization.
//
// Storage lives in save.js so these format rules stay importable without a
// browser or IndexedDB. A corrupt or future-version save must be rejected
// before anything is applied.

import {
  listActorCollections, validateActorWorld, validateGameRelationships, migrateActorWorld,
} from './actorsave.js';

export const SAVE_FORMAT = 'gummy-save';
export const SAVE_VERSION = 1;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => Number.isFinite(v);
const isVec3 = v => Array.isArray(v) && v.length === 3 && v.every(isNum);

function validateWorld(w, where, errors) {
  if (!isObj(w)) { errors.push(`${where} is not an object`); return; }
  validateActorWorld(w, where, errors);
  if (w.camera != null) {
    const c = w.camera;
    if (!isObj(c) || !isNum(c.yaw) || !isNum(c.pitch) || !isNum(c.dist) ||
        !isVec3(c.target) || !isVec3(c.goal)) errors.push(`${where}.camera is invalid`);
  }
  if (w.launcher != null && (!isObj(w.launcher) || !isNum(w.launcher.x) || !isNum(w.launcher.z))) {
    errors.push(`${where}.launcher is invalid`);
  }
  if (w.food !== undefined) {
    if (!Array.isArray(w.food)) errors.push(`${where}.food is not an array`);
    else w.food.forEach((f, i) => {
      if (!isObj(f) || typeof f.id !== 'string') errors.push(`${where}.food[${i}] is invalid`);
      else if (typeof f.ripe !== 'boolean' || !isNum(f.timer)) errors.push(`${where}.food[${i}] state is invalid`);
    });
  }
  if (w.gifts !== undefined) {
    if (!Array.isArray(w.gifts)) errors.push(`${where}.gifts is not an array`);
    else w.gifts.forEach((portion, i) => {
      if (!isObj(portion) || typeof portion.id !== 'string' || !portion.id ||
          typeof portion.kind !== 'string' || !portion.kind ||
          !isNum(portion.satiation) || portion.satiation <= 0 ||
          !isNum(portion.x) || !isNum(portion.z) ||
          (portion.y !== undefined && !isNum(portion.y)) ||
          (portion.mapId !== 'field' && portion.mapId !== 'studio')) {
        errors.push(`${where}.gifts[${i}] is invalid`);
      }
    });
  }
}

export function validateSave(data) {
  const errors = [];
  if (!isObj(data)) return { ok: false, errors: ['save is not an object'] };
  if (data.format !== SAVE_FORMAT) errors.push('unknown save format');
  if (data.version !== SAVE_VERSION) errors.push(`unsupported save version ${data.version}`);
  if (data.mapId !== 'field' && data.mapId !== 'studio') errors.push('unknown active map');
  if (!isNum(data.savedAt)) errors.push('savedAt is invalid');
  if (!isObj(data.worlds)) errors.push('worlds is invalid');
  else {
    validateWorld(data.worlds.field, 'worlds.field', errors);
    validateWorld(data.worlds.studio, 'worlds.studio', errors);
    validateGameRelationships(data.worlds, errors);
    // UIDs are game-wide identities: parents, bonds, guardians and lineage all
    // reference them. Reject duplicates instead of silently merging two actors.
    const seen = new Map();
    for (const id of ['field', 'studio']) {
      const world = data.worlds[id];
      if (!isObj(world)) continue;
      for (const collection of listActorCollections()) {
        const list = world[collection.key];
        if (!Array.isArray(list)) continue;
        for (let index = 0; index < list.length; index++) {
          const actor = list[index];
          if (!isObj(actor) || !isNum(actor.uid) || actor.uid <= 0) continue;
          const where = `worlds.${id}.${collection.key}[${index}]`;
          const previous = seen.get(actor.uid);
          if (previous) errors.push(`duplicate actor uid ${actor.uid} at ${where} and ${previous}`);
          else seen.set(actor.uid, where);
        }
      }
    }
    const giftIds = new Set();
    for (const id of ['field', 'studio']) {
      const gifts = data.worlds[id] && data.worlds[id].gifts;
      if (!Array.isArray(gifts)) continue;
      for (const gift of gifts) {
        if (!isObj(gift) || typeof gift.id !== 'string') continue;
        if (giftIds.has(gift.id)) errors.push(`duplicate gift portion id ${gift.id}`);
        else giftIds.add(gift.id);
      }
    }
    for (const id of ['field', 'studio']) {
      const world = data.worlds[id];
      if (!isObj(world)) continue;
      for (const collection of listActorCollections()) {
        const list = world[collection.key];
        if (!Array.isArray(list)) continue;
        for (const actor of list) {
          const carriedId = actor && actor.carriedFood && actor.carriedFood.id;
          if (typeof carriedId !== 'string') continue;
          if (giftIds.has(carriedId)) errors.push(`duplicate gift portion id ${carriedId}`);
          else giftIds.add(carriedId);
        }
      }
    }
  }
  if (data.sky != null) {
    const s = data.sky;
    if (!isObj(s) || !isNum(s.hours) || s.hours < 0 || s.hours > 24 ||
        typeof s.auto !== 'boolean' || !isNum(s.speed) || s.speed <= 0) {
      errors.push('sky is invalid');
    }
    if (s && s.day !== undefined && (!isNum(s.day) || s.day < 0)) errors.push('sky.day is invalid');
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeSave(data) {
  const check = validateSave(data);
  if (!check.ok) throw new Error('Invalid save: ' + check.errors.slice(0, 3).join('; '));
  // Return a structured clone with the expected shape and no extra top-level keys.
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: data.savedAt,
    mapId: data.mapId,
    sky: data.sky ? { hours: data.sky.hours, auto: data.sky.auto, speed: data.sky.speed,
      day: isNum(data.sky.day) ? Math.max(0, Math.floor(data.sky.day)) : 0,
      look: typeof data.sky.look === 'string' ? data.sky.look : null } : null,
    worlds: {
      field: cloneWorld(migrateActorWorld(data.worlds.field)),
      studio: cloneWorld(migrateActorWorld(data.worlds.studio)),
    },
  };
}

function cloneWorld(w) {
  const out = {};
  for (const collection of listActorCollections()) {
    if (Array.isArray(w[collection.key])) out[collection.key] = w[collection.key];
    else if (collection.required) out[collection.key] = [];
  }
  out.camera = w.camera || null;
  out.launcher = w.launcher || null;
  out.time = isNum(w.time) ? w.time : null;
  out.auto = !!w.auto;
  out.speed = isNum(w.speed) ? w.speed : 1;
  out.initialized = !!w.initialized;
  if (Array.isArray(w.food)) out.food = w.food;
  if (Array.isArray(w.gifts)) out.gifts = w.gifts;
  return JSON.parse(JSON.stringify(out));
}
