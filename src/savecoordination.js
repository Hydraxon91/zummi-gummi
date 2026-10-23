// Save capture/apply phase coordination.
//
// This module owns only the order of the existing save capture and apply
// phases. The app supplies every concrete side effect (live-world capture,
// payload construction, UID reservation, world installation, reference
// pruning, portion replacement, map activation, carried/field food, sky,
// launcher, persistence and UI sync) through explicit callbacks, so validation,
// storage, UID and portion implementations stay with their current owners.
//
// Neither sequence is transactional: a callback that throws propagates, the
// remaining callbacks do not run for that invocation and no rollback is
// attempted. There is no internal latch; a later call invokes its callbacks
// again. This module has no imports, RNG draws or asynchronous behavior.

export function captureSavePayload({ captureActive, build } = {}) {
  captureActive?.();
  return build?.();
}

export function applySavePayloadPhases(payload, {
  onReserveUids,
  onInstallWorlds,
  onPrune,
  onPortions,
  onActivate,
  onRestoreCarried,
  onRestoreFood,
  onRestoreSky,
  onRestoreLauncher,
  onFinish,
} = {}) {
  onReserveUids?.(payload);
  onInstallWorlds?.(payload);
  onPrune?.(payload);
  onPortions?.(payload);
  onActivate?.(payload);
  onRestoreCarried?.(payload);
  onRestoreFood?.(payload);
  onRestoreSky?.(payload);
  onRestoreLauncher?.(payload);
  return onFinish?.(payload);
}
