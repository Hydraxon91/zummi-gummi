// Read-only relationship view model for the selected actor.
//
// The app supplies the selected live actor plus the current game's known actor
// records (live actors and inactive-map snapshots). This module never writes
// simulation state, never invents a missing name and never averages asymmetric
// bonds silently.

import {
  friendshipLabel, normalizeRivals, partnerUidOf,
} from './relationships.js';

const RELATION_ORDER = { Parent: 0, Sibling: 1, Child: 2, Grandparent: 3, Guardian: 4, Dependent: 5, Partner: 6, Rival: 7 };
const PAIR_EXCLUDED = new Set(['born', 'stage', 'home', 'moved']);

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
const uidOf = entry => entry && entry.actor ? Number(entry.actor.uid) : null;

function sortRows(rows) {
  return rows.sort((a, b) => {
    if (a.missing !== b.missing) return a.missing ? 1 : -1;
    const byRelation = (RELATION_ORDER[a.relation] ?? 9) - (RELATION_ORDER[b.relation] ?? 9);
    if (byRelation) return byRelation;
    const byName = String(a.name || '').localeCompare(String(b.name || ''));
    return byName || a.uid - b.uid;
  });
}

export function pairEvents(history, uid, limit = 3) {
  const wanted = Number(uid);
  if (!Number.isFinite(wanted)) return [];
  return (Array.isArray(history) ? history : [])
    .filter(event => event && Number(event.uid) === wanted && !PAIR_EXCLUDED.has(event.kind))
    .slice(-Math.max(0, limit | 0))
    .reverse()
    .map(event => ({ ...event }));
}

function rowFor(uid, entry, relation) {
  const actor = entry && entry.actor ? entry.actor : null;
  return {
    uid: Number(uid),
    name: actor && typeof actor.name === 'string' ? actor.name : null,
    species: actor && typeof actor.species === 'string' ? actor.species : null,
    mapId: entry && entry.mapId ? entry.mapId : null,
    missing: !actor,
    relation,
    interactions: [],
  };
}

function withInteractions(row, history, pairLimit) {
  row.interactions = pairEvents(history, row.uid, pairLimit);
  return row;
}

export function buildRelationshipView(actor, known, { pairLimit = 3, eventLimit = 5 } = {}) {
  if (!actor) return { actor: null, family: [], care: [], bonds: [], events: [] };
  const entries = new Map();
  for (const entry of Array.isArray(known) ? known : []) {
    const uid = uidOf(entry);
    if (Number.isFinite(uid)) entries.set(uid, entry);
  }
  const byUid = uid => entries.get(Number(uid));
  const decorate = (uid, relation) => withInteractions(
    rowFor(uid, byUid(uid), relation), actor.history, pairLimit);

  const parentUids = Array.isArray(actor.parentUids) ? actor.parentUids.map(Number) : [];
  const parentSet = new Set(parentUids);
  const parents = parentUids.map(uid => decorate(uid, 'Parent'));
  const siblings = [];
  const children = [];
  for (const entry of entries.values()) {
    const other = entry.actor;
    if (!other || other.uid === actor.uid) continue;
    const otherParents = Array.isArray(other.parentUids) ? other.parentUids.map(Number) : [];
    if (otherParents.some(uid => parentSet.has(uid))) {
      siblings.push(decorate(other.uid, 'Sibling'));
    }
    if (otherParents.includes(actor.uid)) children.push(decorate(other.uid, 'Child'));
  }
  const grandparentUids = new Set();
  for (const uid of parentUids) {
    const parent = byUid(uid);
    if (!parent || !parent.actor) continue;
    for (const grandparentUid of parent.actor.parentUids || []) {
      const id = Number(grandparentUid);
      if (!parentSet.has(id) && id !== actor.uid) grandparentUids.add(id);
    }
  }
  const grandparents = [...grandparentUids].map(uid => decorate(uid, 'Grandparent'));

  const family = sortRows([...parents, ...siblings, ...children, ...grandparents]);
  const care = [];
  if (Number.isFinite(actor.guardianUid)) care.push(decorate(actor.guardianUid, 'Guardian'));
  for (const entry of entries.values()) {
    const other = entry.actor;
    if (other && other.uid !== actor.uid && other.guardianUid === actor.uid) {
      care.push(decorate(other.uid, 'Dependent'));
    }
  }
  sortRows(care);

  const bondRows = [];
  for (const [key, raw] of Object.entries(actor.bonds || {})) {
    const uid = Number(key);
    if (!Number.isFinite(uid) || uid === actor.uid) continue;
    const value = clamp01(raw);
    if (value <= 0) continue;
    const entry = byUid(uid);
    const other = entry && entry.actor ? entry.actor : null;
    const reverseRaw = other && other.bonds ? Number(other.bonds[String(actor.uid)]) : null;
    const reverse = Number.isFinite(reverseRaw) ? clamp01(reverseRaw) : null;
    bondRows.push({
      ...rowFor(uid, entry, 'Bond'),
      bond: value,
      reverse,
      asymmetric: reverse !== null && Math.abs(value - reverse) > 1e-4,
      friendship: friendshipLabel(value),
      friendshipReverse: reverse === null ? null : friendshipLabel(reverse),
      interactions: pairEvents(actor.history, uid, pairLimit),
    });
  }
  bondRows.sort((a, b) => b.bond - a.bond || (a.missing !== b.missing ? (a.missing ? 1 : -1) : 0) ||
    String(a.name || '').localeCompare(String(b.name || '')) || a.uid - b.uid);

  const partnerUid = partnerUidOf(actor);
  const partner = partnerUid === null ? null : decorate(partnerUid, 'Partner');
  if (partner) {
    partner.bond = clamp01(actor.bonds && actor.bonds[String(partnerUid)]);
    const entry = byUid(partnerUid);
    const other = entry && entry.actor ? entry.actor : null;
    partner.reverse = other && other.bonds ? clamp01(other.bonds[String(actor.uid)]) : null;
    partner.friendship = friendshipLabel(partner.bond);
    partner.friendshipReverse = partner.reverse === null ? null : friendshipLabel(partner.reverse);
  }

  const rivals = [];
  for (const [key, record] of Object.entries(normalizeRivals(actor.rivals))) {
    const uid = Number(key);
    const row = decorate(uid, 'Rival');
    row.sinceDay = record.sinceDay;
    row.sinceHour = record.sinceHour;
    rivals.push(row);
  }
  sortRows(rivals);

  const events = (Array.isArray(actor.history) ? actor.history : [])
    .slice(-Math.max(0, eventLimit | 0))
    .reverse()
    .map(event => ({ ...event }));

  return {
    actor: { uid: actor.uid, name: actor.name || null, species: actor.species || null },
    family,
    care,
    partner,
    rivals,
    bonds: bondRows,
    events,
  };
}
