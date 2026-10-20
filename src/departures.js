// Runtime-only departure hook.
//
// This captures who left and how strongly each survivor was bonded *before*
// the actor is detached or the save boundary prunes references. It deliberately
// does not decide whether a survivor mourns: that belongs to a later module.
// Nothing here is written to an actor save, and no RNG is consumed.

import { bondOf } from './family.js';

export const DEPARTURE_CAUSES = Object.freeze(['removed', 'stars']);
export const STAR_REASONS = Object.freeze(['oldAge', 'starvation', 'sting']);

function validCause(cause) {
  return DEPARTURE_CAUSES.includes(cause);
}

function validReason(reason) {
  return reason === null || reason === undefined || STAR_REASONS.includes(reason);
}

export function departureTuple(record) {
  return [
    record.departedUid,
    record.cause,
    record.reason || '',
    record.map || '',
    record.at ?? '',
  ];
}

export function createDepartureHook({
  isEnabled = () => true,
  getActors = () => [],
  getMapId = () => '',
  getTime = () => null,
} = {}) {
  const records = [];
  const bySurvivor = new WeakMap();
  let count = 0;

  function enabled() {
    return !!isEnabled();
  }

  function snapshot(actor, cause, details = {}) {
    if (!enabled() || !actor || !validCause(cause)) return [];
    const reason = cause === 'stars' ? (details.reason ?? null) : null;
    if (!validReason(reason)) return [];
    if (cause === 'stars' && reason === null) return [];

    const survivors = (getActors() || [])
      .filter(other => other && other !== actor && other.active !== false);
    const map = details.map ?? getMapId();
    const at = details.at ?? getTime();
    const rows = survivors.map(survivor => ({
      departedUid: actor.uid,
      name: actor.name || '',
      species: actor.species || 'bear',
      cause,
      reason,
      bond: bondOf(survivor, actor),
      home: actor.home || '',
      map,
      at,
    }));

    for (let i = 0; i < rows.length; i++) {
      const survivor = survivors[i];
      const list = bySurvivor.get(survivor) || [];
      list.push(rows[i]);
      bySurvivor.set(survivor, list);
    }

    const event = {
      departedUid: actor.uid,
      name: actor.name || '',
      species: actor.species || 'bear',
      cause,
      reason,
      map,
      at,
      survivors: rows,
    };
    records.push(event);
    count += 1;
    return rows;
  }

  function list() {
    return records.slice();
  }

  function forSurvivor(survivor) {
    return (bySurvivor.get(survivor) || []).slice();
  }

  function clear() {
    records.length = 0;
    count = 0;
  }

  return {
    enabled,
    snapshot,
    list,
    forSurvivor,
    clear,
    get count() { return count; },
  };
}
