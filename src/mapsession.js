// Map-session leave and activation sequencing.
//
// This module owns only the portable order for leaving the current map and for
// entering the target map. The host supplies every concrete side effect (input
// and possession release, pointer/drop-queue clearing, actor despawn and Glass
// colony clearing for a leave; active-map/visual switch, configuration, camera,
// UID reservation, portions, spawn, Glass and UI synchronisation for an entry)
// through explicit callbacks, so the app wrapper remains authoritative for
// app/THREE/physics state.
//
// Saves, UIDs, portions, camera and spawn/restore implementations stay with the
// caller. Neither sequence is transactional: if a host callback throws, the
// remaining steps do not run and no rollback is attempted. There is no internal
// latch; repeated calls invoke the caller-supplied steps again.

export function leaveCurrentMap({
  initial = false,
  possessed = false,
  onExitPossession,
  onReleaseGrabs,
  onClearPointers,
  onClearDropQueue,
  onDespawnActors,
  onClearGlass,
} = {}) {
  if (initial) return false;

  if (possessed) onExitPossession?.();
  onReleaseGrabs?.();
  onClearPointers?.();
  onClearDropQueue?.();
  onDespawnActors?.();
  onClearGlass?.();
  return true;
}

export function enterMapSession({
  onEnter,
  onConfigure,
  onCamera,
  onReserveUids,
  onRestorePortions,
  onSpawnActors,
  onSyncGlass,
  onSyncUi,
} = {}) {
  onEnter?.();
  onConfigure?.();
  onCamera?.();
  onReserveUids?.();
  onRestorePortions?.();
  onSpawnActors?.();
  onSyncGlass?.();
  onSyncUi?.();
  return true;
}
