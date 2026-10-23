# Save/map overlap contract

Status: **D6/M12 policy decision and D7/M12a reject-gate implementation.** The
chosen policy is **reject-and-preserve**: while one session-mutating operation is
active, another is rejected before mutation; there is no queue, cancellation,
rollback or transaction. D7 adds the single-flight gate and busy UI. Capture/apply
phase extraction, queueing and the rest of M12 remain pending; this note does not
claim M12 complete or transactional behavior.

Baseline: `HEAD b3b42be` with a clean working tree for the D6/M11 audit; D7 ran
from `HEAD cca2ce2` and preserved one pre-existing parent edit to the autosave
rule in this file. Evidence labels:

- **Inspected** — the named source and callers were read.
- **Host-run** — the D7 checks and browser probe were executed in this checkout;
  prior D4/D5 map evidence is retained only where named.
- **Unverified** — no executed check exists for that failure path here.

## 1. Pre-D7 overlap facts

These facts describe the source before the D7 gate and are retained as the
motivation for the policy, not as the current behavior.

| Operation | Current behavior |
| --- | --- |
| Manual save (`saveToSlot`) | Captures `buildSavePayload()` synchronously, then awaits `writeSave()`. It has no busy gate. |
| Export (`exportSaveFile`) | Captures `buildSavePayload()` synchronously and downloads it. It has no busy gate. |
| Load (`loadFromSlot`) | Sets `loadingSave = true`, awaits `readSave()`, then applies. It does not check `mapSwitching` or another load. |
| Map switch (`requestMapSwitch`) | Guards only `mapSwitching` and same-map. It does not check `loadingSave`, a save write, or New Game. |
| New Game (`resetNewGame`) | Synchronously despawns/resets/activates with no busy gate. |
| Autosave (`autosaveNow`) | Skips when `loadingSave`, `mapSwitching`, or not booted; it already behaves as a best-effort background save. |
| Save UI | `saveButton` disables only the clicked button while its action runs; map/export/import/New Game controls are not globally disabled. |

`applySavePayload()` validates and normalizes before mutation, then installs
snapshots, prunes references, replaces portions, activates the map, restores
carried food/sky/launcher and persists. It sets `loadingSave` in a `try/finally`,
but it is not transactional: a failure after mutation has no rollback guarantee.
`requestMapSwitch()` saves, activates inside a `try`, catches activation errors,
then releases its guard after the wipe delay; it also has no rollback.

This is the overlap that M12 must make explicit, not silently "fix" with a hidden
queue or transaction.

## 2. Approved policy: reject-and-preserve

There is one logical **session operation** at a time. Acquisition happens before
any mutation. If another operation is active, the new operation is rejected with
no mutation.

Operation kinds:

- `save` — manual slot save, including the write await.
- `export` — JSON snapshot capture/download.
- `load` — slot or imported save read/validation/apply.
- `import` — file or debug import that applies a save payload.
- `map-switch` — the whole guarded switch, save-before-activate and wipe window.
- `new-game` — reset and reseed.

Rules:

1. `autosave` attempts to acquire the gate like any other operation. If the gate
   is busy it skips rather than waiting; it is never queued and never replaces an
   active operation.
2. Manual Save, Export, Load, Import, New Game and Map switch acquire the gate
   first. `requestMapSwitch()` becomes a no-op (returns false) when busy; the UI
   exposes the busy reason.
3. A rejected async operation throws/returns a clear `Session busy: <kind>` result
   before reading or mutating game state. A rejected map switch does not add the
   wipe, set `mapSwitching`, save, or activate.
4. The gate is released in `finally` after success or failure. A storage failure
   does not leave the session permanently busy.
5. The gate excludes overlap only. It does **not** make `applySavePayload()` or
   `requestMapSwitch()` transactional, does not add rollback, and does not
   replace the existing format/UID validation.
6. The public/debug entry points use the same gate; a debug import cannot bypass
   a live load or switch.
7. UI Save/Export/Import/Load/New Game/Map controls are disabled while the gate
   is held, with the busy reason shown through the existing save note/menu note.
   Autosave remains silent.
8. No queue is added. A user retries after the active operation finishes.

### Why reject rather than queue

Rejecting is explicit, minimal and testable. It preserves current synchronous
capture and async storage boundaries without inventing hidden ordering,
cancellation or a task scheduler. A queue would change timing and still need
cancellation/failure policy; the current app has no such policy.

## 3. Ownership

| Concern | Owner after M12 |
| --- | --- |
| Single-flight gate | A small portable `src/sessiongate.js` (new in D7); app composes it. |
| Payload capture | App `buildSavePayload()` remains the capture caller; no second save cache. |
| Format/normalization/storage | `saveformat.js`, `save.js`, `actorsave.js` remain unchanged. |
| Apply ordering | App `applySavePayload()` remains the concrete apply owner; M12 may extract ordering only with callbacks, not a new transaction. |
| Map switch scheduling/guard | App `requestMapSwitch()` remains async; the gate wraps it, `mapSwitching` remains the visual/guard flag. |
| UI state | App disables controls; no new UI framework. |

## 4. M11 two-map/failure audit

The current contract supports exactly two map IDs:

- `world.js` defines `MAPS = { studio, field }` and validates active IDs.
- `saveformat.js` rejects any active map or gift map other than `field`/`studio`.
- `actorsave.maxActorUid()` and the app save/index/prune loops hardcode
  `['field', 'studio']`.
- `activateMap()` and `requestMapSwitch()` contain the same two-map assumptions.
- The UI exposes only Meadow and Studio.

A third map or dynamic map registry is **not implemented** and requires an explicit
save-validation, UID-reservation and activation decision. M11 does not add one.

Host-run evidence covers repeated field/Studio/field switches, same-map no-op,
guarded reentry, stable UIDs, active-only roster/Glass state and a Studio save →
field → load round trip. Failure-path behavior remains source-inspected: an
activation failure is caught by `requestMapSwitch`, the wipe guard is released,
but there is no rollback of already-captured/saved state. The reject gate prevents
overlap; it does not claim failure atomicity.

## 5. D7 implementation evidence

D7 adds the reject gate without changing save format, UID reservation, apply
ordering, map activation order, autosave cadence, slot semantics or failure
non-atomicity.

- `src/sessiongate.js` exports `createSessionGate({ onChange })` and the frozen
  kind list (`save`, `export`, `load`, `import`, `map-switch`, `new-game`,
  `autosave`). One kind is active at a time; `begin` returns false when busy or
  invalid; `end` clears only the matching kind; `onChange` fires once per
  transition. The module has no imports, RNG draws, async work or queue.
- `src/app.js` composes one gate. `saveToSlot` boots, acquires `save`, captures and
  writes, and releases in `finally`. `exportSaveFile` acquires `export` around the
  synchronous payload capture and releases before the download starts.
  `loadFromSlot` acquires `load` before `readSave`, keeps `loadingSave`, applies
  the core, and releases in `finally`.
- `applySavePayloadCore` is the unchanged validation/apply body. The public
  `applySavePayload(raw, operation = 'import')` wrapper covers file Import and
  `__gummy.importSave`; `loadFromSlot` calls the core while holding `load` and
  does not nest acquisitions.
- Menu Continue uses `continueFromAutosave()`: it acquires one `load` lease before
  `readSave(AUTOSAVE_ID)`, applies the core while holding it, releases in
  `finally`, and returns whether a record was applied. A missing record returns
  false after release, and `startFromMenu` then calls the guarded `resetNewGame()`.
  The autosave read is not outside the gate and there is no nested acquisition.
- `resetNewGame` acquires `new-game` before despawn/reset and releases in
  `finally`. `startFromMenu` reaches the same guarded apply/reset paths.
- `requestMapSwitch` returns false without wipe/save/activation when there is no
  field, it is the same map, `mapSwitching` is set or the gate is busy. Otherwise
  it acquires `map-switch`, keeps the existing 220 ms save/activate and 260 ms wipe
  sequence, and releases `mapSwitching` and the gate in the inner completion,
  including a caught activation failure. `__gummy.setMap` still returns the active
  map.
- `autosaveNow` keeps its legacy `loadingSave`/`mapSwitching`/boot checks, then
  attempts `autosave`; when busy it returns null and never queues. Release is in
  `finally`, so a storage failure does not leave the session busy.
- `syncSessionBusyUI` disables `#saveExport`, `#saveImportFile`, `#newGame`,
  `#mapMeadow`, `#mapStudio` and the buttons inside `#savesList`, and exposes the
  reason through `body.session-busy`/`data-session-busy`. It runs on every gate
  transition and after `refreshSavesUI` rebuilds slot buttons.

Evidence run from `HEAD cca2ce2` in this checkout:

| Check | Result |
| --- | --- |
| `node --test tests/session-gate.test.mjs` | 8 pass, 0 fail (fixture) |
| `node --test tests` | 579 pass, 0 fail |
| `node scripts/check-behavior-contracts.mjs` | ok, 17 modules |
| `node scripts/behavior-parity.mjs --days 2 --seeds 1,2,3` | `PARITY PASS` |
| `node scripts/smoke.mjs http://localhost:8000` | 68 checks passed |
| D7 busy-overlap browser probe | 31/31 checks, 0 page errors, busy screenshot inspected |
| R1 menu Continue browser probe | 12/12 checks, 0 page errors |
| D5 map-session browser probe rerun | 27/27 checks, 0 page errors |

The browser probe started a real field→Studio switch, then synchronously attempted
save, load, New Game and import: each rejected with `Session busy: map-switch`, the
map/roster/UIDs were unchanged, and all session controls were disabled. After the
switch completed the gate released, controls re-enabled, save and New Game
succeeded, and same-map stayed a no-op. A load racing another switch rejected and
then succeeded after release. A forced IndexedDB `put` failure surfaced the error
but released the gate; the next save succeeded. These are **host-run browser
probe** results using public hooks plus a scratch method monkeypatch, not
independent review.

One probe-only assertion was corrected during the run (the settings sheet had not
opened, so no slot buttons existed yet); source repairs were 0.

R1 closes the menu Continue read gap: the targeted browser probe created a Studio
autosave, reloaded the un-booted menu, clicked Continue, and observed the same
Studio map and UIDs with the gate released; deleting the autosave then exercised
the false return and guarded New Game fallback. The fallback click force-enabled
the normally disabled button in scratch only; no production hook was added.

Remaining M12 work: capture/apply phase extraction, any queue/rollback decision
(not approved) and final completion review. U-003, U-006 and U-011 remain open.

## 6. M12 implementation gate

The implementation slice must prove:

- busy rejection before mutation for save/export/load/import/map-switch/new-game;
- release after success and storage failure;
- autosave skip, no queue, no hidden second cache;
- map switch no-op while busy, preserving `mapSwitching`/wipe behavior when not
  busy;
- invalid save input before mutation, sparse versions, cross-map UIDs, carried
  portions, unrelated slots and current storage failures;
- no schema bump, no generic transaction/rollback claim;
- affected browser evidence for the rejected overlap, not just unit fakes.

Until that slice passes, M11/M12 and Batch D remain incomplete. U-003, U-006 and
U-011 remain open in the unresolved register.

D7 satisfies the overlap-specific bullets above (busy rejection, release after
success/storage failure, autosave skip, no queue, map-switch no-op, affected
browser evidence). The invalid-input/cross-map/version/storage-failure matrix and
capture/apply phase extraction remain for the rest of M12.
