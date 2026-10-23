# Map session contract

Status: **D4/M11a portable leave-sequencing slice.** This step adds
`src/mapsession.js`, `tests/map-session-leave.test.mjs`, a live map-switch probe
and this note, and updates the M11 facts in the maintained ownership table. It
does not extract map activation, change the asynchronous switch guard, or claim
M11/M12 completion. Parent review, acceptance and commits are separate.

Baseline: `HEAD 02d10c6` with a clean working tree. Evidence labels:

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
| Activation, visuals, spawn/restore | `src/app.js` `activateMap` | Map lookup, active-map switch, table/bounds, portal/MSN layout, ceiling, colliders, camera, UID reservation, portions, Bear/Gummy and Glass restoration, UI/cast/shadow synchronisation. |
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

## 3. App wiring

`activateMap` passes the concrete callbacks once, before `setActiveMap`:

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

The activation body below the call is unchanged, including `opts.initial` camera
handling, `worlds[id]` use, `mapSwitching`, wipe timing, saves and the debug map
hook. `requestMapSwitch` still ignores the same map and reentry while
`mapSwitching` is true.

## 4. Checks

Focused fixture checks (host-run):

- `node --test tests/map-session-leave.test.mjs` — 6 pass, 0 fail.
- Covers initial no-op, exact order and one call per callback, unpossessed leave,
  throwing-callback partial failure without rollback, repeated caller-controlled
  calls, zero RNG draws and unrelated-state preservation.

Downstream checks (host-run; exact results in `.dev-shots/d4/LEDGER.md`):

- `node --check src/mapsession.js tests/map-session-leave.test.mjs src/app.js`
- full `node --test tests` — 565 pass, 0 fail.
- `node scripts/behavior-parity.mjs --days 2 --seeds 1,2,3` — `PARITY PASS`.
- `node scripts/smoke.mjs <owned-server-url>` — 68 checks passed.
- affected browser map-switch probe against the owned server — 27/27 checks,
  zero page errors. It drives repeated field → Studio → field `__gummy.setMap`
  calls, same-map no-op and guarded reentry, active-only roster/Glass state via
  `__gummy.map()`/`__gummy.roster()`, and a Studio save → field switch → load
  round trip via `__gummy.save`/`load`/`traits`.

The probe uses only existing public hooks; no production hook was added. It does
not establish activation-extraction correctness, async resource completion,
save-overlap policy, or M6/M11/M12 completion.

## 5. Limits and follow-ups

- M11 still owns activation extraction and the two-map/save-validation audit.
- M12 still owns save capture/apply coordination and concurrent save/map policy.
- U-003 (app-internal pool/spawn/removal and partial cleanup) and U-011 (real
  Glass late completion/effects teardown) remain open and were not changed by
  this slice.
