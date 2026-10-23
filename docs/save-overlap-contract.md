# Save/map overlap contract

Status: **D6/M12 policy decision and M11 two-map/failure audit.** The chosen
policy is **reject-and-preserve**: while one session-mutating operation is active,
another is rejected before mutation; there is no queue, cancellation, rollback or
transaction. Implementation is the next M12 slice. This note records the current
behavior and the approved target behavior; it does not claim M12 extraction
complete.

Baseline: `HEAD b3b42be` with a clean working tree. Evidence labels:

- **Inspected** — the named source and callers were read.
- **Host-run** — a prior D4/D5 probe exercised the public map path.
- **Unverified** — no executed check exists for that failure path here.

## 1. Current overlap facts

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

1. `autosave` does not acquire the gate. It skips when the gate is busy, as it
   already does for `loadingSave`/`mapSwitching`.
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
| Single-flight gate | A small portable `src/sessiongate.js` (new in the implementation slice); app composes it. |
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

## 5. M12 implementation gate

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
