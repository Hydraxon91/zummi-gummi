# Map session contract

Status: **D5/M11b portable activation-phase slice.** D4 added
`src/mapsession.js` and the portable non-initial leave order. D5 adds
`enterMapSession` and moves only the activation phase order there; the app keeps
every concrete activation action. The asynchronous switch guard, saves, debug
hook, two-map audit and M11/M12 completion are not claimed. Parent review,
acceptance and commits are separate.

Baseline: `HEAD 7e83ca6` with a clean working tree. Evidence labels:

- **Inspected** — the named source and its immediate callers were read.
- **Host-run** — a command or browser probe was executed for this step.
- **Fixture** — a Node test drives the real exported module with fakes.
- **Unverified** — no executed check covers that host path here.

The maintained ownership table is
[system ownership and extension contracts](system-ownership-contracts.md).
Roadmap status remains parent-owned.

## 1. Owners and non-owners

| Concern | Owner | Boundary |
| --- | --- | --- |
| Portable non-initial leave order | `src/mapsession.js` `leaveCurrentMap` | `initial` gate, optional possession exit, and the ordered callbacks for grabs, pointers, drop queue, actor despawn and Glass clear. No app, three.js or DOM imports. |
| Portable activation phase order | `src/mapsession.js` `enterMapSession` | Ordered, optional callbacks: enter, configure, camera, reserve UIDs, restore portions, spawn actors, sync Glass, sync UI. No app, three.js or DOM imports, no state and no RNG. |
| Activation, visuals, spawn/restore | `src/app.js` `activateMap` callbacks | Map lookup, active-map switch, table/bounds, portal/MSN layout, ceiling, colliders, camera, UID reservation, portions, Bear/Gummy and Glass restoration, UI/cast/shadow synchronisation. |
| Switch scheduling and guard | `src/app.js` `requestMapSwitch` | Same-map no-op, `mapSwitching` guard, wipe timing, save-before-activate and guard release. Unchanged by this slice. |
| Possession, grabs, pointers, drop queue | `src/app.js` | `exitPossession`, `releaseAllGrabs`, `pointers.clear`, `dropQueue.length = 0` are passed to the portable leave as concrete callbacks. |
| Actor roster and Glass colony | `src/app.js` `despawnAll`, `src/glass.js` colony `clear` | The host callbacks keep every concrete side effect; the portable module only decides order. |
| Save capture/apply | `src/app.js` `saveCurrentWorld`, `applySavePayload` | Not moved. A load still calls `activateMap(payload.mapId)` without `initial`, so it takes the same non-initial leave path as before. |

The portable module does **not** own map state, saves, UIDs, portions, camera,
visuals, spawn/restore, pause/wipe timing or the asynchronous switch guard.

## 2. Leave sequence

`leaveCurrentMap({ initial, possessed, onExitPossession, onReleaseGrabs,
onClearPointers, onClearDropQueue, onDespawnActors, onClearGlass })`:

1. Returns `false` and calls nothing when `initial` is true.
2. Calls `onExitPossession` only when `possessed` is true.
3. Calls `onReleaseGrabs`, `onClearPointers`, `onClearDropQueue`,
   `onDespawnActors`, then `onClearGlass`, in that order.
4. Returns `true`.

This matches the previous inline order in `activateMap` for a non-initial
activation. Possession is checked by the caller and passed as a boolean, so the
module does not read app state. Callbacks are optional; a missing callback is a
no-op and the remaining steps still run.

The leave is not transactional. If a callback throws, later callbacks are skipped
and earlier mutations are not rolled back. There is no internal latch: repeated
calls run the supplied callbacks again, and the caller remains responsible for
deciding whether a leave is needed.

## 3. Entry sequence

`enterMapSession({ onEnter, onConfigure, onCamera, onReserveUids,
onRestorePortions, onSpawnActors, onSyncGlass, onSyncUi })` calls each supplied
callback once, in that order, then returns `true`:

1. **Enter** — set the active map, apply map visuals and read back the active map.
2. **Configure** — table bounds, Studio table, return portal, MSN layout,
   per-map ceiling, world bounds, launcher map state and cannon collider.
3. **Camera** — apply the saved map camera for a non-initial activation,
   otherwise reset the camera.
4. **Reserve UIDs** — select the target world and reserve its saved identities.
5. **Restore portions** — merge the target map's saved gifts with the other
   map's portions.
6. **Spawn actors** — restore saved actors or seed the Meadow/Studio roster.
7. **Sync Glass** — restore or seed Meadow Glass, or clear and disable the colony
   outside the Meadow.
8. **Sync UI** — Studio cast physics, race control UI, the world initialized
   flag, selection/directive state, directive panel, map buttons, aero
   visibility/UI, shadows and the debug `lastMap` assignment.

The entry is not transactional. If a callback throws, later phases are skipped
and earlier mutations are not rolled back. There is no internal latch: repeated
calls run the supplied callbacks again, and the caller remains responsible for
deciding whether an entry is needed. Callbacks are optional; a missing callback
is a no-op and the remaining phases still run.

The phase groups preserve the previous inline order. The app still owns every
concrete action and every `target`/`map`/`w` value; the module only decides
which phase runs next.

## 4. App wiring

`activateMap` first passes the concrete leave callbacks once, before the active
map changes:

```js
leaveCurrentMap({
  initial: !!opts.initial,
  possessed: !!possessedBear,
  onExitPossession: exitPossession,
  onReleaseGrabs: releaseAllGrabs,
  onClearPointers: () => pointers.clear(),
  onClearDropQueue: () => { dropQueue.length = 0; },
  onDespawnActors: despawnAll,
  onClearGlass: () => { if (glassColony) glassColony.clear(); },
});
```

It then computes `target`, declares `map`/`w` for the callbacks and calls
`enterMapSession` with one callback per phase. The `!opts.initial` camera branch,
`worlds[id]` reads, the debug hook and every existing activation action remain in
the app. `requestMapSwitch` still ignores the same map and reentry while
`mapSwitching` is true; save-before-activate, wipe/pause timing, saves, UID and
portion implementations, spawn/seed and Glass restore/seed are unchanged.

## 5. Checks

Focused fixture checks (host-run):

- `node --test tests/map-session-leave.test.mjs tests/map-session-activate.test.mjs`
  — 12 pass, 0 fail (6 leave, 6 activation). Exact results in
  `.dev-shots/d5/LEDGER.md`.
- The leave fixture covers initial no-op, exact order and one call per callback,
  unpossessed leave, throwing-callback partial failure without rollback, repeated
  caller-controlled calls, zero RNG draws and unrelated-state preservation.
- The activation fixture covers exact phase order and one call per phase, missing
  callbacks, setup visibility between phases, throwing-callback partial failure
  without rollback or latch, repeated caller-controlled calls, zero RNG draws and
  unrelated-state preservation.

Downstream checks (host-run; exact results in `.dev-shots/d5/LEDGER.md`):

- `node --check src/mapsession.js tests/map-session-*.test.mjs src/app.js` — exit 0.
- full `node --test tests` — 571 pass, 0 fail.
- `node scripts/check-behavior-contracts.mjs` — `ok`, 0 errors.
- `node scripts/behavior-parity.mjs --days 2 --seeds 1,2,3` — `PARITY PASS`.
- `node scripts/smoke.mjs <owned-server-url>` — 68 checks passed.
- the D4 browser map-switch probe, rerun after the activation restructure against
  the owned server — 27/27 checks, zero page errors. It drives repeated field →
  Studio → field `__gummy.setMap` calls, same-map no-op and guarded reentry,
  active-only roster/Glass state via `__gummy.map()`/`__gummy.roster()`, and a
  Studio save → field switch → load round trip via `__gummy.save`/`load`/`traits`.

The probe uses only existing public hooks; no production hook was added. It does
not establish async resource completion, save-overlap policy, the M11 two-map
audit or M6/M11/M12 completion.

## 6. Limits and follow-ups

- The M11 two-map/save-validation and failure audit is recorded in
  [the save/map overlap contract](save-overlap-contract.md). Current maps remain
  exactly `field` and `studio`; a third/dynamic map requires an explicit future
  validation/activation decision. Activation failure is caught but not rolled
  back.
- M12's approved policy is **reject-and-preserve** (single-flight gate, no queue,
  no overlap mutation); implementation remains pending in the next slice.
- U-003 (app-internal pool/spawn/removal and partial cleanup) and U-011 (real
  Glass late completion/effects teardown) remain open and were not changed by
  this slice.
