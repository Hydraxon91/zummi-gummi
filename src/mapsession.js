// Map-session leave sequencing.
//
// This module owns only the portable order for leaving the current map before a
// new map is activated. The host supplies every concrete side effect (input and
// possession release, pointer/drop-queue clearing, actor despawn and Glass
// colony clearing) through explicit callbacks, so the app wrapper remains
// authoritative for app/THREE/physics state.
//
// Activation, saves, UIDs, portions, camera and spawn/restore work stay with
// the caller. The leave itself is not transactional: if a host callback throws,
// the remaining steps do not run and no rollback is attempted. There is no
// internal latch; repeated calls invoke the caller-supplied steps again.

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
