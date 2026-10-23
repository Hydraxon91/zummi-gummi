# Species and representation extension recipe

Status: **reviewed runtime-admission contract and extension recipe.**
This step adds a bounded fixture proof, a narrow central runtime-admission guard
and documentation. It does not ship a species, rig, model, asset, representation
split, JSON species format or plugin framework.

Registration remains permissive for definitions that are not yet hosted. Save
validation and the spawn/restore boundaries reject unregistered, unsupported or
malformed representations before game-state mutation. The admitted hosts are the
shipped Bear/MSN soft-body path (a usable rig whose species marker matches and
whose required host fields are valid) and the shipped Glass skinned adapter.
This is a **minimum host-contract guard, not a universal representation
validator**: passing it does not make a new rig, new physics shape or new
skinned adapter supported.

Baseline: `HEAD 0126d2a`; the parent-owned dirty ROADMAP files and the four B3
paths were preserved. Evidence includes source inspection, focused Node tests, a
browser invalid-load probe, HTTP smoke, development parity and browser
regression. Final M4 acceptance belongs to the parent.

Evidence labels:

- **Inspected** — the named source and its relevant callers were read directly.
- **Host-run** — the Node process was executed in this step.
- **Unverified** — no executed check exists in this step, or the path is not
  importable without the app's DOM/WebGL/physics boot.
- **Fixture** — the definition exists only in a test; it is not shipped content.

Existing tests remain the primary coverage; this recipe links them rather than
duplicating their cases. See [species template](species-template.md),
[asset contract](../assets/README.md), and
[system ownership](system-ownership-contracts.md) for the general rules.

## 1. Separate the three responsibilities

| Responsibility | Current owner | What an extension changes |
| --- | --- | --- |
| Biology and capabilities | `src/species.js` registry, `src/dna.js` genes | Species identity, breed/cast groups, reciprocal compatibility, capability flags, growth/life eligibility, genetics and declared hybrid targets. |
| Representation | `src/config.js` Bear rig, `src/msnrig.js`/`src/buddyrig.js`, `src/glass.js`, `src/msn.js`, `assets/` | The executable rig or authored skinned asset and the host that creates, poses, saves and disposes it. A new body is authored/representational scope, not a registry entry. |
| Balance | `src/behaviorprofiles.js`, `scripts/behavior-parity.mjs` | Per-species rates, thresholds, states, module capabilities and parity scenarios. Reusing a rig does not select a balance profile. |

These can share data, but they are not one file format. `species.js` imports
executable rig modules; genetics is therefore a rules layer with a
representation dependency, not neutral JSON. Balance is read separately by
`behaviorprofiles.js`; a registered species without a profile currently falls
back to the Bear profile (§6).

## 2. Supported path: a new soft body on the existing Bear representation

A supported extension can register a new soft-body species that reuses the
shipped Bear rig, pooled Bear host and metaball/surface-nets path. The required
edits are:

1. **Create a representation marker.** Reuse the Bear rig arrays and add the
   species ID:
   `const rig = { ...BEAR_RIG, species: 'my-species' }`.
   `rig.species` is not decorative: `speciesForRig()` and `spawn()` route by it.
   A rig without `species` is the Bear identity and will not resolve your species.
2. **Register biology/capabilities.** Add `registerSpecies({...})` in
   `src/species.js` (or a source module evaluated with the registry) with
   `kind: 'softbody'`, the marked rig, reciprocal `compatibility`, deliberate
   `canBreed`/`canReproduce`, capabilities and genetics. Duplicate IDs throw.
3. **Add balance separately.** Add a profile in `src/behaviorprofiles.js` with
   the same ID and `species` entry, then add the race/scenario to
   `scripts/behavior-parity.mjs` when its branches differ. Cloning Bear for a
   deliberately zero-divergence start is acceptable; silently relying on the
   unknown-species fallback is not.
4. **Add genes only if needed.** New gene types need `registerGene()` in
   `src/dna.js`, a species `genetics.loci` reference/default and a fixture test.
5. **Keep asset edits separate.** A Bear-representation soft body needs no GLB
   or manifest. A skinned species needs an authored asset, catalog entry,
   manifest and a matching adapter; see [asset contract](../assets/README.md).

## 3. Minimum representation operations

There is no adapter interface for the soft-body path. The app reads these rig
members directly; a distinct replacement rig must satisfy all of them or the
host must be changed. The fixture deliberately reuses the Bear arrays instead of
copying them.

| Operation | Fields read by the current host |
| --- | --- |
| Species routing and slot size | `rig.species`, `NP` |
| Rest pose / geometry | `RIG`, `PTS`, `REST`, `TOTAL_M`, `REST_H`, `REST_COM_Y`, `REST_DY` |
| Physics bodies and joints | `MASS`, `RSURF`, `RCOLL`, `PARENT`, `PARENT_LEN`, `JOINT_HZ`, `BRACES` |
| Surface capsules | `CAPS` |
| Landmarks for eyes/grab/forces | `P_HEAD`, `P_SNOUT`, `P_EARL`, `P_EARR`, `P_CHEST`, `P_BELLY`, `P_HANDL`, `P_HANDR`, `P_FOOTL`, `P_FOOTR` |

The narrow runtime guard verifies `NP`, array lengths and finite/positive values,
`RIG`/`PTS` shape, `CAPS`/`BRACES` indices, and the per-rig landmarks the host
reads (`P_HEAD`, `P_CHEST`, `P_BELLY`, `P_HANDL`, `P_HANDR`, `P_FOOTL`,
`P_FOOTR`). Face animation and eye setup also use module-level config landmark
indices (`P_SNOUT`, `P_EARL`, `P_EARR`) for the shipped hosts; the guard does not
turn that into a general rig-size or silhouette validator.

Typed-array identity matters. `MASS`, `REST`, `RSURF`, `RCOLL`, `PARENT`,
`PARENT_LEN`, `JOINT_HZ` and the other Bear arrays are shared read-only rig data;
per-actor position/velocity buffers and Box3D handles belong to the pooled
`Bear` instance and are created/reused by `app.js`. Do not clone the typed arrays
per actor or create a second metaball path.

The app also imports `RIGCFG` directly for some module-level surface bounds,
eye/instance setup and global appearance. A genuinely different vertex count,
landmarks or silhouette is therefore not covered by merely registering a rig;
that needs a host/surface audit and authored representation work.

## 4. Actual app touchpoints

| Path | Current behavior |
| --- | --- |
| Runtime admission (`src/species.js`) | `speciesRuntimeIssue()`/`requireSpeciesRuntime()` classify a species plus the rig it will use. `glassRestoreIssue()` classifies a saved skinned record. Registration itself is unchanged and stays permissive. |
| `spawn()` / `getFreeBear()` / `Bear` constructor (`src/app.js`) | Resolves an explicit `opts.species` or infers the marker from `opts.rig`; rejects unregistered ids, mismatched markers and unsupported/malformed soft-body rigs **before** ceiling eviction. Then selects a pooled slot by `rig.species`, sizes actor arrays from `NP`, and places/poses from the rig arrays. |
| `birthSpecies()` / `birthChild()` (`src/app.js`) | Eligibility is `canReproduce` plus parent species, then the child form is one of the parents' existing species. Birth additionally requires an active pregnant mother, held-food/airborne clearance, at least `MATE_FOOD_MIN` safe ripe food, room under `bearCeiling`, a home/nav position and the representation's spawn path. No hybrid form is created. The child rig goes through `spawn()` admission. |
| `spawnFromState()` (`src/app.js`) | The soft-body save-restore caller. Missing `species` keeps the legacy Bear default; explicit non-string/empty/unknown ids and unsupported kinds or rigs throw before restore work. It chooses `speciesDef.rig` directly (no `RIGCFG` fallback), passes only `rig`, then calls `applyCommonActorState()`. This is where species and rig are restored. |
| `activateMap()` / `applySavePayload()` (`src/app.js`) | Restores saved soft bodies by calling `spawnFromState()` for each saved `bears` record; Glass records go through `glassColony.restore()`. |
| `snapshotBear()` (`src/app.js`) / `snapshotActor()` (`src/actorrecord.js`) | The saved record carries `species` and the genome; a soft-body record has no rig object, mesh or position buffers. |
| `stepLife()` (`src/app.js`) | Advances age/pregnancy only for `speciesOf(b).hasLife`; reproduction eligibility still comes from `life.js` and `dna.js`. |
| `createActorView()` (`src/npc.js`) | Returns original live actor objects; `active()`/`byUid()` filter only on `active`, and soft-body detection is `kind !== 'glass'` plus an `px` array. |
| `glassColony.restore()` / `makeActor()` (`src/glass.js`) | Glass-specific: `restore()` prevalidates every supplied record before constructing any actor; non-Glass kinds/species and malformed records throw instead of being skipped. `makeActor()` admits only the shipped Glass adapter. Registering another skinned species does not add a second skinned adapter. |

The birth eligibility split is important: `life.canMate()` checks adult,
opposite-sex, needs/health/cooldown/sleep/grab/pond/room/food conditions, and
`dna.canSpeciesBreed()` checks reciprocal compatibility plus
`canReproduce`/`canBreed`; actual orchestration additionally checks food,
population and representation spawn. A passing pair gate is not proof of a live
birth.

## 5. Save, migration and restore boundaries

- `snapshotActor()` writes `species`, `genome`, life/family state and `x`/`z`.
  For Glass it adds `kind: 'glass'` and `species: 'glass'`; soft-body records rely
  on the `bears` collection for their kind.
- `validateActorWorld()`/`validateCommon()` (`src/actorsave.js`) look up the
  species with `getSpecies(species, null)`. An unregistered species is rejected
  as `species is unknown`; a registered species whose `kind` does not match the
  collection (`bears` → softbody, `glass` → skinned) is rejected. After those
  checks it calls `speciesRuntimeIssue()` so a matching registry kind is not
  enough: the host must have a usable rig matching the species marker, or be the
  shipped Glass skinned adapter. Genomes are optional for legacy saves but a
  present genome must use the current version. Future actor versions and
  malformed versioned fields are rejected.
- All admission errors are appended to the validation list before
  `normalizeSave()` validates, migrates and clones both worlds. A rejected
  payload therefore never reaches `applySavePayload()`, UID reservation, map
  activation or actor creation. `migrateActorRecord()` preserves species, genome
  and unknown fields while filling family defaults; it does not choose a new
  representation.
- A missing `species` field keeps the legacy behavior: soft-body `bears` records
  default to Bear and `glass` records default to the Glass collection. Explicit
  `null`, empty or unknown species do not silently default; save validation
  rejects them, and `spawn()`/`spawnFromState()` throw for them.
- `applyCommonActorState()` (`src/actorrecord.js`) deliberately restores only
  shared life/family fields. It does **not** restore `species`, `rig`, `uid`,
  name, sex, stage, age, scale, genome, position or visuals. The soft-body
  restore caller that does restore species/rig is `spawnFromState()`; Glass uses
  `glassColony.restore()`. A new actor collection needs its own capture/restore
  host, not just a validator.
- **Rigless or malformed soft-body records now fail explicitly.**
  `registerSpecies()` still accepts a definition without a rig, but save
  validation rejects it because no usable host representation exists.
  `spawnFromState()` admits before restore work and uses `speciesDef.rig`
  directly; the former `RIGCFG` fallback is gone. Fresh `spawn()` with an
  explicit species or an inferred `rig.species` marker rejects unknown,
  mismatched or malformed rigs before ceiling eviction, UID allocation or body
  creation.
- **Registered skinned species other than Glass now fail explicitly.**
  Registration remains possible, but save validation rejects the record and
  `glassColony.makeActor()` admits only the shipped Glass identity/asset.
  `glassColony.restore()` prevalidates the complete supplied list with
  `glassRestoreIssue()` before constructing any actor; non-Glass kinds/species
  and malformed entries throw instead of being silently skipped. This is a
  minimum host guard, not support for a second skinned adapter.

## 6. Remaining unsupported and unchecked combinations

These remain unsupported; the difference is that save validation and the
approved runtime boundaries now reject the representation cases below before
mutation instead of silently falling back or skipping.

- **New body/rig/silhouette:** a registry entry plus the admission guard is
  still insufficient. The app-level rig assumptions, module-level surface/eye
  setup and authored asset pipeline need separate design/authoring approval. The
  guard checks the current host contract, not that a new silhouette is correct.
- **New skinned species:** registration is allowed, but save validation and
  `glassColony.restore()`/`makeActor()` reject it. Only the shipped Glass
  identity and asset are hosted. Asset/manifest existence and a real second
  adapter are still outside this guard.
- **Missing or malformed rig definition:** registration stays permissive for
  unhosted definitions. Save validation rejects a rigless/malformed soft-body
  record, and `spawn()`/`spawnFromState()` throw before eviction, UID allocation,
  restore or body creation. Arbitrary `kind` values also register but are
  rejected when a soft-body or skinned host is required.
- **Capabilities:** flags such as `canPossess`, `canGrab`, `hasEyes`, `hasTells`
  and `hasLife` are trusted booleans. Registration does not verify that the
  chosen representation implements them.
- **Balance:** `behaviorProfile()`/`profileFor()` fall back to `BEAR_PROFILE` for
  a species without a profile. `src/behaviors/config.js` snapshots
  `listSpecies()` at import; `warnUnknown()` logs once per unknown species name,
  so a species registered after that import can still warn even though
  `getSpecies()` resolves it. The fallback is documented existing behavior, not
  an approved new-species profile.
- **Hybrids:** `hybrids` only declares a target/status. Current birth chooses an
  existing parent form and does not build `bear-msn`, `bear-glass` or another
  authored hybrid. Authored hybrid geometry is separate work.
- **Compatibility:** `canSpeciesBreed()` requires reciprocal lists and known
  definitions; registration does not enforce reciprocity or that listed IDs
  exist. Unknown partner IDs simply fail the gate.

## 7. Fixture proof and requirement map

The fixture is `fixture-bear-representation` in
`tests/species-extension.test.mjs`. It shares the Bear typed arrays by identity,
adds only the species marker, and is disposable test content. The admission
fixture and malformed/unsupported definitions are disposable fixtures in
`tests/species-admission.test.mjs`.

| Requirement | Check | Result |
| --- | --- | --- |
| Register through the public registry, strict lookup, duplicate rejection | `fixture registers strictly...` | Host-run pass |
| Rig/typed-array identity and `speciesForRig` routing | same test | Host-run pass |
| Genetics/expression stays softbody | `fixture genome expression...` | Host-run pass |
| Birth eligibility for same-species opposite-sex adults; no accidental Bear compatibility | `fixture birth eligibility...` | Host-run pass |
| Actor view returns original fixture identity | `actor view resolves...` | Host-run pass |
| Snapshot and save validation recognize the registered fixture; unknown/mismatched saves fail | `fixture snapshots validate...`; `tests/species-admission.test.mjs` | Host-run pass |
| Migration and common-state restore preserve fixture data; representation is not restored by `applyCommonActorState` | `migration preserves...` | Host-run pass |
| Registration stays permissive for rigless, arbitrary-kind and unsupported skinned definitions | `registration stays permissive...` | Host-run pass |
| Save validation rejects rigless, arbitrary, unsupported skinned, malformed and marker-mismatched records before normalize | `save validation rejects...`, `explicit null or empty...` | Host-run pass |
| Supported fixture, shipped Bear/MSN/Glass and legacy omission still validate | `supported fixture...` | Host-run pass |
| Runtime spawn/spawnFromState reject before ceiling/UID/body mutation | Source inspection of `spawn()`/`spawnFromState()`; browser fixture load and invalid-import probe | Source-inspected; browser probe pass |
| Glass restore prevalidates every entry before construction | `glassRestoreIssue()` source + `glass restore entries...`; `restore()` two-pass structure | Host-run helper pass; source-inspected |
| Missing balance profile falls back to Bear (recorded gap) | `fixture has no balance profile...` | Host-run pass |
| Live app mixed save/load/Studio roundtrip | `STUDIO=1 node scripts/browser-regression.mjs` | Host-run pass |
| A new authored body/rig, skinned adapter or asset | Not implemented | **Out of scope** |

**Overall M4: reviewed runtime-admission contract; focused/host admission checks pass.**
The supported fixture path and the explicit
rejection paths now have pure tests plus a browser invalid-load probe. Direct
`glassColony.restore()` was not driven through a public debug hook; its
all-before-create structure and `glassRestoreIssue()` are source-inspected, and
the save-level invalid Glass payload was browser-tested for no roster/map/world
mutation before apply.

Existing coverage referenced instead of duplicated: `tests/species.test.mjs`
(registry baseline and registration-only fixture), `tests/dna.test.mjs`
(inheritance and reproduction gates), `tests/actor.test.mjs` and
`tests/actorrecord.test.mjs` (view and shared record), `tests/actorsave.test.mjs`
and `tests/save.test.mjs` (validation/migration), and
`tests/behavior-profile-completeness.test.mjs` plus
`tests/behavior-config.test.mjs` (profile ownership and warning policy).

## 8. Verification boundary and acceptance

This round used a real browser profile, owned server, save slot and the existing
browser regression. Commands and checked outcomes:

- `node --test tests/species-admission.test.mjs` — 7 pass.
- Focused species/DNA/actor/save group — 49 pass.
- `node --test tests` — 448 pass, 0 fail.
- `node scripts/smoke.mjs http://localhost:8000` — 68 HTTP checks pass.
- `node scripts/check-behavior-contracts.mjs` —
  `{"ok":true,"errors":[],"modules":17,"states":34,"opportunities":20}`.
- `node scripts/parity-matrix.mjs --jobs 2` — 9 cases pass, `fresh:true`,
  development tier.
- Scratch browser probe — registered fixture soft-body loads visibly; rigless,
  good-Glass-then-unsupported-skinned, null and empty species are rejected with
  roster/map/worlds unchanged; baseline restore returns 8 bears/2 Glass; zero
  page errors.
- `STUDIO=1 LOW_QUALITY=1 node scripts/browser-regression.mjs` — roster 10
  (8 bears/2 Glass), Studio 3 meshes/9 bones/10 clips, one GLB load, errors 0.
  The harness checks asset refs against its live Glass count; an isolated
  Meadow→Studio→Meadow probe reported refs 3 with 2 Meadow Glass actors.

The browser fixture exists only in the scratch probe. No shipped species, asset,
schema version or production test hook was added. Direct
`glassColony.restore()` was not invoked through a public debug hook; its
prevalidation is source-inspected and its per-record classifier is host-tested.
The direct `spawn()` negative path is source-inspected, while positive fixture
spawn and save-boundary rejection were exercised in the browser.

Final M4 acceptance remains parent-owned. This document records the implemented
contract and evidence, not independent approval.
