# Future-system admission checklist

Status: **design checklist only (roadmap M23)**. Baseline `HEAD 7237e63`, clean
working tree before this document. This document adds no runtime API, test,
fixture, configuration, registry, generated output, roadmap change or package
metadata, and it was not exercised by a browser or Node run.

This checklist is a proposal filter, not approval. Reading it does **not**
authorize any future gameplay feature. It does not approve equipment, shops or
currency, goals/planners, audio, authored interiors, editor/village/jobs, general
inventory, additional maps, or a reusable framework for any of those families.
Each actual feature still needs its own scoped approval and verification. It also
does not replace the current ownership facts in the linked contracts below.

## 1. Scope and how to use this document

The checklist exists so that a future system proposal is admitted for review with
enough design detail to judge ownership, identity, persistence, lifecycle and
presentation boundaries before implementation. It is derived from the current
repository state:

- [System ownership and extension contracts](system-ownership-contracts.md) —
  authoritative owners, state classes, lifecycle and supported extension seams.
- [Interaction ownership inventory](interaction-ownership.md) — current pair,
  task, claim and reservation writers and cleanup.
- [Actor and session identity/lifecycle contract](actor-session-lifecycle.md) —
  live identity, game-wide UIDs, snapshots, removal and reset behavior.
- [System modularity roadmap](system-modularity-roadmap.md) — M23's place among
  the proposed steps and the associated decision gates.
- [Scheduler and RNG contract](scheduler-rng-contract.md) — frame, fixed-step,
  clock and RNG ordering.

Those documents remain the source of truth for existing systems; this file does
not duplicate their tables. If this checklist and an existing contract disagree,
the existing contract wins, and the discrepancy is a blocker to resolve before
proceeding.

Evidence labels used in a proposal:

- **Inspected** — the named source path and immediate caller were read.
- **Host-run** — executed in the real browser/game host.
- **Fixture** — a focused, committed or disposable check with stated inputs and
  expected outputs.
- **Captured** — an inspected screenshot or recording from `.dev-shots/`.
- **Measured** — timing/count evidence collected with the established method.
- **Unverified** — no executed check exists. It must be listed honestly, never
  inferred from a module boundary or from a green adjacent test.

## 2. When this checklist is required

Apply it before:

- starting editor/village/jobs, general inventory, audio or an additional map;
- adding a new activity or system family that owns state across frames, maps or
  saves;
- creating a reusable registry, framework or extension point for such a family;
- introducing a new persistent identity, resource reservation, time source or
  input route, even if the visible feature looks small.

Apply it proportionally: a one-off read-only UI addition may satisfy a subset, but
any persistent, interruptible or resource-owning behavior must answer every
field in §3. A reusable registry is never the first step; see §5.

## 3. Required admission fields

Each field below names the questions a proposal must answer and the evidence
expected. "None" is an acceptable answer only when paired with the reason it is
inapplicable.

### 3.1 State and resource owners

- Which module owns each authoritative value, and is it **persistent**, **runtime
  session** or **render/host** state under the ownership contract's classes?
- Which owner mutates it? Which owners only read or mirror it?
- Does simulation, the renderer, or a persistence module hold the authority? Name
  the transition points between them.
- Which runtime resources (meshes, materials, bodies, handles, DOM nodes,
  listeners, leases, buffers, timers) are created, and who destroys or releases
  them?

Evidence: an owner table with source paths/symbols, the current callers read, and
the state class for every field. A proposal that cannot name one authoritative
writer is not admissible.

### 3.2 Stable instance IDs

- What identifies an instance across frames, maps, save/load, removal and a New
  Game? Is it live object identity, a game-wide UID, a new family-local ID, a
  stable authored name or a resource lease ID?
- How does the new ID relate to actor UIDs and existing game-wide identities? Is
  it unique across both maps and both actor representations?
- Which references are live (reciprocal runtime links) and which are persistent
  (saved UID/string keys)? Persistent links must be validated and pruned.
- What happens on removal, pool reuse, map despawn, restore and ID exhaustion?

Evidence: identity table, allocation/reservation path, save validation and prune
path, plus focused tests for duplicate, missing and cross-map references. Live
references must never be saved, and a pooled-object reference is stale after
removal even if the slot is later reused.

### 3.3 Commands, queries and mutation entry points

- What are the public commands (mutations) and queries (reads) of the system?
- Which entry points are allowed to mutate, and which paths are deliberately
  read-only?
- Are command preconditions and failure returns explicit? Are rejected commands
  side-effect free?
- Do callers use an existing seam (behavior API, actor view, registry factory) or
  introduce a parallel one?

Evidence: an operation list with owner, caller, mutation/read classification and
negative cases. Do not present a module export as a stable API unless the
lifecycle and supported-use limits are stated.

### 3.4 Time domain

- Which clock does the system read: the rAF frame, simulated seconds, the Meadow
  day/hour clock, saved visual time, or wall-clock time?
- Does it advance on `frameTick`, the fixed physics accumulator, `simulateSeconds`
  or its own timer? What is the ordering relative to existing simulation?
- How does it behave when paused, hidden, frozen, on the Studio map or during a
  map switch? Only the active map simulates today.
- Does it consume RNG? If so, where in the draw order, and can it change existing
  draws?

Evidence: the cadence/order in the scheduler contract, explicit pause/hidden/
map-active expectations, and fixtures for boundary values and RNG order. A new
cadence, independent RNG stream or fixed-step gameplay change is a decision gate,
not a mechanical edit.

### 3.5 Persistence

- What is saved, at which save version, and which fields are deliberately excluded
  (live pointers, handles, render resources)?
- How is old data migrated, and how are unknown/extra fields treated? Is a schema
  change actually required, or can the feature remain session-only?
- What is the capture/apply order, and what happens on validation failure before
  mutation?
- What does New Game/reset do to this system's state, IDs and storage? Does it
  reset only the session or also change the schema?

Evidence: field list, version/migration tests, invalid-input and sparse-version
cases, New Game behavior, and preservation of unrelated saves. A save-schema
change without migration and compatibility evidence is a stop condition.

### 3.6 Interruption, cancellation, undo and failure

- Which operations can be interrupted (grab, map switch, save/load, actor removal,
  UI dismissal, async load completion)? What state is released?
- Is cancellation idempotent, and are reciprocal links/claims/reservations cleaned
  exactly once?
- Does the system support undo/rollback? If not, say so explicitly and define the
  safe partial-failure state instead of implying atomicity.
- What happens when creation fails halfway, a load completes late, or a consumer
  disappears before completion?

Evidence: lifecycle transition list create → activate → interrupt → cancel →
remove/leave → restore → release, with tests or host probes for each supported
transition. Unsupported transitions are listed, not hidden behind a fallback.

### 3.7 Presentation boundary

- What does simulation own versus what do DOM, three.js and physics adapters own?
- Which modules may the simulation import? It must not import DOM events, three.js
  objects, renderer-owned resources, storage side effects or physics handles.
- How are input intents, read models and commands passed across the boundary?
- Which values are copies/read models rather than live renderer objects?

Evidence: import direction and adapter boundary, plus tests that pure rules run
without scene construction where applicable. Renderer objects must not appear in
simulation claims or saved state.

### 3.8 Assets, catalog and leases

- Which existing catalog/manifest entries and asset IDs are reused?
- Who acquires the `assetStore` lease, who clones instances and who releases on
  removal/failure/late completion?
- Does teardown preserve shared geometry/textures and avoid disposing another
  consumer's source?
- What is the behavior when the asset is missing, fails to load, or completes
  after the owning actor/system is gone?

Evidence: catalog/manifest change, lease acquire/release paths, failed-load and
late-completion cases, and no second cache. New authored assets require the
intake route and separately approved destination changes; source authoring is not
runtime acceptance.

### 3.9 Navigation, placement, reservations and resource claims

- Does the system need walkability, path queries, placement validation, authored
  lots/colliders or occupancy?
- Which reservations/claims exist, what authorizes them (live identity or stable
  ID), and who releases them on cancel/removal/map change?
- Does placement need a nav re-bake or field collider update? Is dynamic layout
  editing actually supported, or is the proposal assuming an unimplemented seam?
- Are home/capacity/overflow rules reused rather than reimplemented?

Evidence: nav/placement queries and validation, claim ownership and release
tests, and explicit statements for unsupported dynamic rebuild or editing.

### 3.10 Feature toggles, configuration and unknown state

- Is the system enabled by default, optional, or experiment-only? What is the
  cleanup when disabled or reconfigured?
- Where do defaults live, and how are layered config/settings resolved?
- What is the unknown-state policy: fail closed, ignore with a warning, or use a
  documented fallback? Is that consistent with existing unknown-ID behavior?
- Does a toggle change save contents, simulation cadence or existing RNG draws?

Evidence: default/enable path, disable cleanup, invalid/unknown values and
migration of stored preferences. A generic toggle is not assumed for modules that
declare themselves essential or `legacy-unverified`.

### 3.11 Tests and evidence

- Which focused contract/fixture tests cover the rules and negative cases?
- Which host behaviors need browser checks (input, visuals, save/load, map
  switch, focus loss, mobile/touch)?
- Which visual, input and performance checks are affected? Performance claims
  require measurement with the established method, not inference.
- What remains unsupported or unverified, and is that stated in the proposal?

Evidence: requirement → check mapping, exact commands and results, inspected
captures under `.dev-shots/`, and an honest unsupported list. A green adjacent
suite is not evidence for a new boundary.

### 3.12 Observability and documentation

- Which `window.__gummy` debug hooks or read-only diagnostics expose the system,
  and does each have a concrete consumer and contract test?
- Is the system discoverable from the owning module README or ownership contract,
  with a copyable recipe and its lifecycle?
- Are log/error paths observable without making debug hooks a production
  dependency?

Evidence: hook inventory and `debug-api` coverage, documentation update plan, and
the owner doc that will be amended when the system becomes real.

## 4. Reuse rules

Prefer existing, proven seams before designing anything new:

- **Navigation/spatial:** `field.nav` (`createNavMesh` queries) and the behavior
  navigation/path providers.
- **Reservations and claims:** the live-identity claim/release model used by food
  and portions; persistent links use UIDs.
- **Assets:** `assets/catalog.json`, the manifest and `assetStore.acquire`/release
  with consumer-owned clones.
- **Behavior modules:** `defineBehaviorModule`/`createBehaviorModules`, per-actor
  state in `actor.ai`, declared disable policy.
- **Actor identity/view:** `createActorView`, shared `actorrecord`/`actorsave`
  shape and game-wide UIDs.
- **Interaction protocol:** `registerInteraction` with existing pair/task cleanup.
- **UI read models:** the relationship-view/thought-bubble precedent (simulation
  supplies data and commands; panels own DOM and listener cleanup).
- **World/save seams:** `world.js` snapshots and `saveformat`/`save` validation,
  not a second world or save store.

Do **not** introduce a universal ECS, dependency-injection container, plugin
loader, general event bus, engine-neutral scene graph, generalized physics facade,
or a second cache/registry merely for symmetry. If a new abstraction is proposed,
name the concrete duplicated consumer it removes and the evidence that the
existing seam is insufficient.

## 5. Proof sequence

For a new family, implement **one representative feature end-to-end** before
designing a reusable registry or framework for that family:

1. Name one bounded feature that exercises the family's identity, commands,
   time, persistence and lifecycle.
2. Build it on existing seams, with the smallest new surface that the feature
   actually needs.
3. Verify it at its affected layers: focused contracts, host behavior, and visual/
   input/performance checks where affected.
4. Review the diff and evidence, then decide whether a second feature is needed
   before extracting a shared registry.
5. Only after two or more real consumers demonstrate the same seam should a
   registry be proposed, with its ownership, unknown-ID policy, lifecycle and
   tests.

Acceptance questions for the representative proof:

- Can one owner be named for every piece of state, and does the renderer only
  mirror it?
- Are stable IDs used for every persistent or cross-map reference, and validated
  on save apply?
- Are commands/queries explicit, with rejected commands side-effect free?
- Is the time domain and pause/map-active behavior stated and observed?
- Is save/reset behavior covered by focused cases, including invalid input?
- Is interruption/removal/cancellation cleanup exactly once, or is absence
  explicitly documented?
- Does simulation avoid DOM, three.js, storage and physics imports?
- Are asset leases released on success, failure and late completion?
- Are navigation/placement/reservations handled or declared inapplicable?
- Are unsupported cases and unverified checks listed?

## 6. Anti-patterns and stop conditions

Stop and return the proposal to review if it includes any of:

- a hidden second owner or a renderer/DOM object treated as simulation authority;
- copied app globals or private helpers instead of using the current seam;
- unvalidated new map IDs or assumptions that merely adding a registry entry makes
  a map, collider or save path valid (the current save/world format accepts only
  `field` and `studio`);
- a save-schema/version change without migration, compatibility and New Game
  decisions;
- per-frame foliage or per-instance CPU loops, or bypassing batching/instancing;
- a second input stack or DOM events inside simulation rules;
- renderer objects, handles or listener references inside simulation claims or
  saved records;
- a second cache, save store, world store or asset registry;
- teardown inferred from module boundaries without release evidence;
- silent fallbacks, empty catches or fabricated success to hide failure;
- treating a fixture, source inspection or adjacent green suite as independent
  acceptance;
- more than one roadmap step combined in a single implementation chunk.

## 7. Proposal checklist table

A future proposal should fill this in before implementation:

| Area | Required answer | Evidence expected |
| --- | --- | --- |
| State/resource owners | Owner per field; persistent/session/render class | Source/caller map; no mirror as owner |
| Instance IDs | Stable ID kind; relationship to UIDs; validation/prune | Identity and duplicate/missing cases |
| Commands/queries | Mutation entry points; read-only paths; failure returns | Operation list and negative cases |
| Time domain | Clock/cadence; pause/hidden/freeze/map-active behavior | Scheduler-order reference and boundary cases |
| Persistence | Saved fields, version/migration, capture/apply, New Game | Migration, invalid-input and reset cases |
| Interruption/undo | Cancellation points, idempotent release, rollback or absence | Lifecycle transitions and cleanup tests |
| Presentation boundary | Simulation imports and adapter/read-model split | Import direction; pure-rule test |
| Assets/leases | Reused catalog IDs; acquire/clone/release; failure/late load | Lease and failed-load evidence |
| Navigation/claims | Queries, placement validation, reservations and release | Claim/placement and unsupported-edit statement |
| Toggles/config | Defaults, enable/disable cleanup, unknown-state policy | Config resolution and invalid-value cases |
| Tests/evidence | Requirement → check mapping; host/visual/input/perf needs | Command results and inspected captures |
| Observability/docs | Debug hooks with consumers; owner doc/recipe update | `debug-api` coverage and doc plan |

## 8. Decision gates

These require explicit, separate approval and are not implied by admitting a
design or by a passing representative feature:

| Gate | Why it is separate |
| --- | --- |
| New map IDs | Save validation, world snapshots, activation, camera/launcher and content currently assume `field`/`studio`; a new ID needs a validation and lifecycle design. |
| Save schema/version | Migration, compatibility, duplicate-ID validation, New Game and cross-map references are save-contract changes. |
| Target engine/portability | M18 requires a chosen engine/version/language and independently executed target results; JS-vs-JS parity is not cross-language proof. |
| Audio | No general audio subsystem exists; adding one is new-system design, not an extension of animation calls. |
| Authored assets/interiors | Source authoring belongs to AssetWorkshop; game-side intake and destination integration are separately approved. Authored interiors also need nav/collider and save decisions. |
| Physics/WASM changes | Box3D/WASM changes are separately gated; no generalized physics facade. |
| Dependencies, bundler or test framework | The project is dependency-free ES modules with Node's test runner and no build step. |
| CI/CD or agent configuration | Separate approval is required even inside an approved chunk. |

Additional unresolved design items that must be decided per proposal, not assumed:
unknown module/system ID policy (M3), concurrent save/map-switch policy (M11–M12)
and clock/RNG ownership (M13). Their current status is in the linked contracts and
roadmap; this checklist does not settle them.

## 9. Relationship to existing contracts

Use these documents rather than restating them:

- [System ownership and extension contracts](system-ownership-contracts.md) for
  owners, state classes, extension recipes and unsupported operations.
- [Interaction ownership inventory](interaction-ownership.md) for reciprocal
  pair/task links, persistent relationship fields and claim/reservation writers.
- [Actor and session identity/lifecycle contract](actor-session-lifecycle.md) for
  live identity vs UIDs, pool reuse, birth/removal/map despawn, save restore and
  New Game.
- [System modularity roadmap](system-modularity-roadmap.md) for proposed M-steps,
  batch ordering and their gates.
- [Scheduler and RNG contract](scheduler-rng-contract.md) for frame order, fixed
  physics, clock and RNG behavior.

When a future system is approved and implemented, update the owning contract and
module README in the same change; this checklist is not a substitute for that
maintenance.
