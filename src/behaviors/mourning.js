// Mourning state for a stars farewell.
//
// Records are per survivor and per saved actor. They store an absolute game-day
// deadline so a loaded save resumes the same grief, while a different save keeps
// its own records. This module is pure; the app owns the trigger and the engine
// owns tick-time pruning.

import { bondOf, familyRelation } from '../family.js';

export const MOURNING_DEFAULTS = Object.freeze({
  minBond: .18,
  familyFloor: .30,
  minDays: .20,
  maxDays: 14,
  moodWeight: .55,
  maxRecords: 8,
  comfortDays: .25,
  comfortBond: .35,
});

const clamp = (n, lo, hi) => n < lo ? lo : (n > hi ? hi : n);
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 4) => +Number(value).toFixed(digits);

export function normalizeMourning(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list.slice(-MOURNING_DEFAULTS.maxRecords)) {
    if (!isObject(entry)) continue;
    const uid = finite(entry.uid, 0);
    const day = finite(entry.day, 0);
    const hours = clamp(finite(entry.hours, 0), 0, 24);
    const untilDay = finite(entry.untilDay, day);
    const duration = finite(entry.duration, untilDay - day);
    const closeness = clamp(finite(entry.closeness, 0), 0, 1);
    if (uid <= 0 || untilDay <= day || duration <= 0 || closeness <= 0) continue;
    out.push({
      uid: uid | 0,
      name: typeof entry.name === 'string' ? entry.name.slice(0, 40) : '',
      species: typeof entry.species === 'string' ? entry.species : 'bear',
      cause: 'stars',
      day: round(day),
      hours: round(hours),
      untilDay: round(untilDay),
      duration: round(duration),
      closeness: round(closeness),
      lastComfortDay: Number.isFinite(entry.lastComfortDay)
        ? round(entry.lastComfortDay) : null,
    });
  }
  return out;
}

export function mourningOverlap(actor, departed) {
  if (!actor || !departed || actor === departed) return null;
  const relation = familyRelation(actor, departed);
  const bond = bondOf(actor, departed);
  if (!relation && bond < MOURNING_DEFAULTS.minBond) return null;
  return {
    relation,
    bond,
    closeness: round(Math.max(bond, relation ? MOURNING_DEFAULTS.familyFloor : 0)),
  };
}

export function mourningDuration(closeness) {
  const c = clamp(finite(closeness, 0), 0, 1);
  return MOURNING_DEFAULTS.minDays +
    (MOURNING_DEFAULTS.maxDays - MOURNING_DEFAULTS.minDays) * c * c;
}

export function addMourning(actor, departed, { day = 0, hours = 0 } = {}) {
  const overlap = mourningOverlap(actor, departed);
  if (!overlap) return false;
  const now = finite(day, 0) + clamp(finite(hours, 0), 0, 24) / 24;
  const duration = mourningDuration(overlap.closeness);
  const record = {
    uid: departed.uid,
    name: departed.name || '',
    species: departed.species || 'bear',
    cause: 'stars',
    day: round(now),
    hours: round(clamp(finite(hours, 0), 0, 24)),
    untilDay: round(now + duration),
    duration: round(duration),
    closeness: round(overlap.closeness),
    lastComfortDay: null,
  };
  const list = normalizeMourning(Array.isArray(actor.mourning) ? actor.mourning : [])
    .filter(item => item.uid !== record.uid);
  list.push(record);
  actor.mourning = list.slice(-MOURNING_DEFAULTS.maxRecords);
  return true;
}

export function pruneMourning(actor, day = 0, hours = 0) {
  if (!actor || !Array.isArray(actor.mourning)) return false;
  const now = finite(day, 0) + clamp(finite(hours, 0), 0, 24) / 24;
  const before = actor.mourning.length;
  actor.mourning = normalizeMourning(actor.mourning)
    .filter(record => record.untilDay > now);
  if (!actor.mourning.length) delete actor.mourning;
  return actor.mourning ? actor.mourning.length !== before : before > 0;
}

export function mourningMood(actor, { day = 0, hours = 0 } = {}) {
  if (!actor || !Array.isArray(actor.mourning) || !actor.mourning.length) return 0;
  const now = finite(day, 0) + clamp(finite(hours, 0), 0, 24) / 24;
  let value = 0;
  for (const record of normalizeMourning(actor.mourning)) {
    const remaining = clamp((record.untilDay - now) / record.duration, 0, 1);
    value += record.closeness * remaining;
  }
  return round(clamp(value * MOURNING_DEFAULTS.moodWeight, 0, MOURNING_DEFAULTS.moodWeight));
}

export function comfortMourning(actor, comforter, { day = 0, hours = 0 } = {}) {
  if (!actor || !comforter || actor === comforter || !Array.isArray(actor.mourning)) return false;
  const relation = familyRelation(actor, comforter);
  const bond = Math.max(bondOf(actor, comforter), bondOf(comforter, actor));
  if (!relation && bond < MOURNING_DEFAULTS.comfortBond) return false;
  const now = finite(day, 0) + clamp(finite(hours, 0), 0, 24) / 24;
  let changed = false;
  for (const record of actor.mourning) {
    if (record.untilDay <= now) continue;
    if (Number.isFinite(record.lastComfortDay) && now - record.lastComfortDay < 1 - 1e-6) continue;
    record.untilDay = round(Math.max(now, record.untilDay - MOURNING_DEFAULTS.comfortDays));
    record.lastComfortDay = round(now, 6);
    changed = true;
  }
  return changed;
}

export function mourningLabel(actor, { day = 0, hours = 0 } = {}) {
  if (!actor || !Array.isArray(actor.mourning) || !actor.mourning.length) return null;
  const now = finite(day, 0) + clamp(finite(hours, 0), 0, 24) / 24;
  const current = normalizeMourning(actor.mourning)
    .filter(record => record.untilDay > now)
    .sort((a, b) => b.closeness - a.closeness)[0];
  return current ? `missing ${current.name || 'someone'}` : null;
}
