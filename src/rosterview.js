// Read-only roster rows for the Meadow buddy panel.
//
// This module copies the values the panel displays. It never keeps live actor
// references, mutates actors, reads storage, consumes randomness, touches the
// DOM or imports three.js. The app keeps keyed row ownership, formatting and
// all click/selection side effects.

function copyParentUids(value) {
  return Array.isArray(value) ? value.slice() : value;
}

function isSelectedUid(uid, selectedUid) {
  if (selectedUid === null || selectedUid === undefined) return false;
  if (uid === null || uid === undefined) return false;
  return String(uid) === String(selectedUid);
}

// Build plain display rows for the active roster, in input order.
//
// `isRosterActor(actor)` filters the input. `statusFor`, `familyFor` and
// `colorFor` are called once per accepted actor with that original actor. The
// signature fields (`kind`, `species`, `scale`, `flavor`, `parentUids`) are
// copied because the panel's refresh sensitivity depends on them. `health` is
// the raw actor value; the app still computes the health label/style through
// `syncBuddyHealth`.
export function buildRosterRows(actors, {
  isRosterActor,
  selectedUid = null,
  statusFor,
  familyFor,
  colorFor,
} = {}) {
  const rows = [];
  for (const actor of Array.isArray(actors) ? actors : []) {
    if (!isRosterActor(actor)) continue;
    rows.push({
      uid: actor.uid,
      key: String(actor.uid),
      name: actor.name,
      sex: actor.sex,
      stage: actor.stage,
      home: actor.home,
      health: actor.health,
      status: statusFor(actor),
      family: familyFor(actor),
      color: colorFor(actor),
      selected: isSelectedUid(actor.uid, selectedUid),
      kind: actor.kind,
      species: actor.species,
      scale: actor.scale,
      flavor: actor.flavor,
      parentUids: copyParentUids(actor.parentUids),
    });
  }
  return rows;
}

// Preserve the existing buddy-panel refresh sensitivity EXACTLY.
//
// Only kind||species, name, sex, stage, scale, home, flavor and the joined
// parent UIDs participate. Health, status, selected, family and color are
// deliberately excluded: they update through the status tick and keyed row
// refresh without forcing a full roster rebuild.
export function rosterSignature(rows) {
  return rows
    .map(row => `${row.kind || row.species}:${row.name}:${row.sex}:${row.stage}:${row.scale}:${row.home}:${row.flavor}:${(row.parentUids || []).join(',')}`)
    .join('|');
}
