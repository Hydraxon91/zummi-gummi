// Actor removal sequencing.
//
// This module owns only the ordering and portable roster state of a real
// removal. The host supplies the concrete side effects (departure snapshots,
// carried food, portion/food claims, behavior detach, bodies, grabs, persistent
// reference clearing and presentation) through explicit callbacks, so the app
// wrapper remains authoritative for app/THREE/physics state.
//
// Removal is not transactional: if a host callback throws, the remaining steps
// do not run and no rollback is attempted. Callers must treat a partial removal
// as a partial mutation of the live roster.

export function removeSoftActor(actor, {
  actors,
  preserveRefs = false,
  departure,
  onDeparture,
  onDropCarried,
  onReleasePortions,
  onDetach,
  onReleaseFood,
  onClearFarewell,
  onDestroyBodies,
  onClearReferences,
  onEndGrabs,
  onDeactivate,
} = {}) {
  if (!actor || !Array.isArray(actors)) return false;
  const index = actors.indexOf(actor);
  if (index < 0) return false;

  if (departure) onDeparture?.(actor, departure);
  onDropCarried?.(actor);
  onReleasePortions?.(actor);
  onDetach?.(actor);
  onReleaseFood?.(actor);
  actor.ai = null;
  onClearFarewell?.(actor);
  onDestroyBodies?.(actor);
  actors.splice(index, 1);
  if (!preserveRefs) onClearReferences?.(actor);
  onEndGrabs?.(actor);
  actor.active = false;
  actor.grabs = 0;
  onDeactivate?.(actor);
  return true;
}

export function removeGlassActor(actor, {
  departure,
  onDeparture,
  onClearFarewell,
  onDropCarried,
  onReleasePortions,
  onReleaseFood,
  removeFromColony,
  onDetach,
  onClearReferences,
} = {}) {
  if (!actor) return false;

  if (departure) onDeparture?.(actor, departure);
  onClearFarewell?.(actor);
  onDropCarried?.(actor);
  onReleasePortions?.(actor);
  onReleaseFood?.(actor);
  const removed = typeof removeFromColony === 'function' ? removeFromColony(actor) : false;
  if (removed) {
    onDetach?.(actor);
    onClearReferences?.(actor);
  }
  return !!removed;
}
