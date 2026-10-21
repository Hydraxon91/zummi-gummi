// Versioned save payloads and IndexedDB slots.
//
// The game owns capture/restore (bears, camera, sky, food); this module only
// validates a payload before anything is applied and stores it. A corrupt or
// future-version save must be rejected without touching the live session.

import { listActorCollections, validateActorWorld, migrateActorWorld } from './actorsave.js';

export const SAVE_FORMAT = 'gummy-save';
export const SAVE_VERSION = 1;
export const SLOT_IDS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'autosave'];
export const AUTOSAVE_ID = 'autosave';

const DB_NAME = 'gummy-saves';
const DB_VERSION = 1;
const STORE = 'slots';

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
  return JSON.parse(JSON.stringify(out));
}

/* ------------------------------------------------------------------ storage */

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    try { result = fn(store); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error || new Error('IndexedDB transaction failed'));
    t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
  });
}

export async function listSaves() {
  const db = await openDb();
  try {
    const records = await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return records
      .map(r => ({
        id: r.id,
        name: typeof r.name === 'string' ? r.name : 'Save',
        savedAt: Number.isFinite(r.savedAt) ? r.savedAt : 0,
        mapId: r.payload && r.payload.mapId ? r.payload.mapId : null,
        bears: r.payload && r.payload.worlds && r.payload.worlds[r.payload.mapId]
          ? (r.payload.worlds[r.payload.mapId].bears || []).length : 0,
      }))
      .sort((a, b) => (a.id === AUTOSAVE_ID ? 1 : b.id === AUTOSAVE_ID ? -1 : a.id.localeCompare(b.id)));
  } finally { db.close(); }
}

export async function readSave(id) {
  const db = await openDb();
  try {
    const record = await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!record) return null;
    return { id: record.id, name: record.name, savedAt: record.savedAt, payload: record.payload };
  } finally { db.close(); }
}

export async function writeSave(id, payload, name = '') {
  if (!SLOT_IDS.includes(id)) throw new Error('Unknown save slot: ' + id);
  const check = validateSave(payload);
  if (!check.ok) throw new Error('Invalid save: ' + check.errors.slice(0, 3).join('; '));
  const db = await openDb();
  try {
    await tx(db, 'readwrite', store => store.put({
      id,
      name: String(name || '').slice(0, 40) || (id === AUTOSAVE_ID ? 'Autosave' : 'Save'),
      savedAt: Number.isFinite(payload.savedAt) ? payload.savedAt : Date.now(),
      payload,
    }));
  } finally { db.close(); }
}

export async function removeSave(id) {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', store => store.delete(id));
  } finally { db.close(); }
}
