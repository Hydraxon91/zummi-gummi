// Persistent, read-only-friendly relationship records.
//
// Bonds remain the continuous affinity value. This module adds two small,
// independent records on top of them:
//   - `rivals`: a symmetric unresolved conflict record keyed by actor uid;
//   - `partnerUid`: one reciprocal adult partnership.
//
// The module is pure so save validation, the behavior modules and the
// relationship view can share the same normalization and thresholds.

export const FRIENDSHIP_TIERS = Object.freeze({
  close: .65,
  friend: .35,
  familiar: .18,
});

export const PARTNERSHIP_BOND = FRIENDSHIP_TIERS.close;
export const RECONCILE_BOND_GAIN = .04;

const clamp01 = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};

function uid(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && Math.floor(n) === n ? n : null;
}

export function friendshipLabel(value) {
  const bond = clamp01(value);
  if (bond >= FRIENDSHIP_TIERS.close) return 'close friend';
  if (bond >= FRIENDSHIP_TIERS.friend) return 'friend';
  if (bond >= FRIENDSHIP_TIERS.familiar) return 'familiar';
  return 'acquaintance';
}

export function normalizePartnerUid(value) {
  return uid(value);
}

export function normalizeRivals(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input)) {
    const other = uid(key);
    if (!other || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const sinceDay = Number(value.sinceDay);
    const sinceHour = Number(value.sinceHour);
    if (!Number.isFinite(sinceDay) || sinceDay < 0 ||
        !Number.isFinite(sinceHour) || sinceHour < 0 || sinceHour > 24) continue;
    out[String(other)] = {
      sinceDay: Math.floor(sinceDay),
      sinceHour: +sinceHour.toFixed(3),
    };
  }
  return out;
}

export function rivalOf(actor, other) {
  if (!actor || !other || !actor.rivals) return null;
  const record = actor.rivals[String(other.uid !== undefined ? other.uid : other)];
  return record && Number.isFinite(Number(record.sinceDay)) ? { ...record } : null;
}

export function hasRival(actor, other) {
  return !!rivalOf(actor, other);
}

export function setRival(a, b, { day = 0, hour = 0 } = {}) {
  if (!a || !b || a === b || !uid(a.uid) || !uid(b.uid) || a.uid === b.uid) return false;
  const record = {
    sinceDay: Math.max(0, Math.floor(Number(day) || 0)),
    sinceHour: +Math.max(0, Math.min(24, Number(hour) || 0)).toFixed(3),
  };
  if (!a.rivals || typeof a.rivals !== 'object') a.rivals = {};
  if (!b.rivals || typeof b.rivals !== 'object') b.rivals = {};
  a.rivals[String(b.uid)] = { ...record };
  b.rivals[String(a.uid)] = { ...record };
  return true;
}

export function clearRival(a, b) {
  if (!a || !b) return false;
  const keyA = String(b.uid !== undefined ? b.uid : b);
  const keyB = String(a.uid !== undefined ? a.uid : a);
  let changed = false;
  if (a.rivals && a.rivals[keyA]) { delete a.rivals[keyA]; changed = true; }
  if (b && b.rivals && b.rivals[keyB]) { delete b.rivals[keyB]; changed = true; }
  return changed;
}

export function clearRivalUid(actor, otherUid) {
  if (!actor || !actor.rivals) return false;
  const key = String(otherUid);
  if (!actor.rivals[key]) return false;
  delete actor.rivals[key];
  return true;
}

export function hasPartnership(actor) {
  return !!normalizePartnerUid(actor && actor.partnerUid);
}

export function partnerUidOf(actor) {
  return normalizePartnerUid(actor && actor.partnerUid);
}

export function setPartnership(a, b) {
  if (!a || !b || a === b || !uid(a.uid) || !uid(b.uid)) return false;
  a.partnerUid = b.uid;
  b.partnerUid = a.uid;
  return true;
}

export function clearPartnership(a, b = null) {
  let changed = false;
  if (a && normalizePartnerUid(a.partnerUid)) {
    delete a.partnerUid;
    changed = true;
  }
  if (b && normalizePartnerUid(b.partnerUid)) {
    delete b.partnerUid;
    changed = true;
  }
  return changed;
}

export function clearPartnershipUid(actor, otherUid) {
  if (!actor) return false;
  if (otherUid === undefined || String(actor.partnerUid) === String(otherUid)) {
    if (actor.partnerUid === undefined) return false;
    delete actor.partnerUid;
    return true;
  }
  return false;
}

export function partnershipBondReady(a, b) {
  if (!a || !b) return false;
  const aValue = clamp01(a.bonds && a.bonds[String(b.uid)]);
  const bValue = clamp01(b.bonds && b.bonds[String(a.uid)]);
  return aValue >= PARTNERSHIP_BOND && bValue >= PARTNERSHIP_BOND;
}

export function enemiesOf(actor) {
  const rivals = normalizeRivals(actor && actor.rivals);
  return Object.keys(rivals).map(Number).sort((a, b) => a - b);
}
