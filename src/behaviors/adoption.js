// Automatic guardians for orphaned babies.
//
// This module is pure: the engine owns ticking, follow targets and save fields.
// A baby is an orphan only when no parent is active on this map and no parent
// UID appears in the current game's saved roster for the other map. A parent
// record is never rewritten and the child's home is never moved.

import { bondOf, familyRelation } from '../family.js';

export const ADOPTION_DEFAULTS = Object.freeze({
  maxDependents: 2,  // exclude guardians already holding MORE than this
  minBond: .35,
  retryHours: 1,
});

const active = actor => !!actor && actor.active !== false;

function knownUidSet(knownUids) {
  if (knownUids instanceof Set) return knownUids;
  if (Array.isArray(knownUids)) return new Set(knownUids);
  return null;
}

function isRelative(child, candidate) {
  // Only immediate family is recoverable for an orphan: a sibling shares stored
  // parent UIDs, while a grandparent needs the absent parent's own record.
  return familyRelation(child, candidate);
}

export function adoptionStatus(child, actors, { knownUids = null } = {}) {
  const list = Array.isArray(actors) ? actors.filter(active) : [];
  const byUid = new Map(list.map(actor => [actor.uid, actor]));
  const uids = knownUidSet(knownUids);
  const parents = child && Array.isArray(child.parentUids) ? child.parentUids : [];
  let activeParent = null;
  for (const uid of parents) {
    const parent = byUid.get(uid);
    if (parent) { activeParent = parent; break; }
  }
  const parentElsewhere = !activeParent && !!uids && parents.some(uid => uids.has(uid));
  const rosterUnknown = !uids && parents.length > 0;
  return {
    orphan: !!child && child.stage === 'baby' && !activeParent && !parentElsewhere && !rosterUnknown,
    activeParent,
    parentElsewhere,
    rosterUnknown,
    known: !!uids,
  };
}

export function guardianCandidate(child, actors, { knownUids = null } = {}) {
  if (!child || child.stage !== 'baby') return null;
  const status = adoptionStatus(child, actors, { knownUids });
  if (!status.orphan) return null;

  const list = Array.isArray(actors) ? actors.filter(active) : [];
  // Capacity is about active babies an adult is responsible for: biological
  // children and adopted dependents count once each, even if both apply.
  const dependents = new Map();
  const addDependent = (adultUid, babyUid) => {
    const uid = Number(adultUid);
    if (!Number.isFinite(uid)) return;
    if (!dependents.has(uid)) dependents.set(uid, new Set());
    dependents.get(uid).add(babyUid);
  };
  for (const actor of list) {
    if (actor === child || actor.stage !== 'baby') continue;
    if (Number.isFinite(actor.guardianUid)) addDependent(actor.guardianUid, actor.uid);
    for (const parentUid of actor.parentUids || []) addDependent(parentUid, actor.uid);
  }

  let best = null;
  for (const candidate of list) {
    if (candidate === child || candidate.stage !== 'adult') continue;
    if (candidate.species !== child.species) continue;
    if (candidate.fading) continue;
    if ((dependents.get(candidate.uid)?.size || 0) > ADOPTION_DEFAULTS.maxDependents) continue;

    const relation = isRelative(child, candidate);
    const household = !!child.home && candidate.home === child.home;
    const childBond = bondOf(child, candidate);
    const bond = Math.max(childBond, bondOf(candidate, child));
    if (!relation && !household && bond < ADOPTION_DEFAULTS.minBond) continue;

    const rank = relation ? 3 : (household ? 2 : 1);
    if (!best || rank > best.rank || (rank === best.rank && bond > best.bond) ||
        (rank === best.rank && bond === best.bond && candidate.uid < best.actor.uid)) {
      best = { actor: candidate, rank, bond };
    }
  }
  return best ? best.actor : null;
}
