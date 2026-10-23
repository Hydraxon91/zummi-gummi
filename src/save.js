// Versioned save payloads and IndexedDB slots.
//
// Format validation/normalization lives in saveformat.js so it can be imported
// without a browser. This module owns the storage boundary; a corrupt or
// future-version save must be rejected before anything is applied.

import { validateSave } from './saveformat.js';

export { SAVE_FORMAT, SAVE_VERSION, normalizeSave, validateSave } from './saveformat.js';

export const SLOT_IDS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'autosave'];
export const AUTOSAVE_ID = 'autosave';

const DB_NAME = 'gummy-saves';
const DB_VERSION = 1;
const STORE = 'slots';

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
