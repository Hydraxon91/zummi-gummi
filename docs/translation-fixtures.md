# Translation fixture inventory

**Status: M18a documentation only. No runtime, test, fixture, configuration,
roadmap or package-metadata change is included.** This document inventories the
translation-relevant literal fixtures that already exist, names what each one
actually proves, and identifies observable rules that are not yet pinned down.
It does not select a target engine, engine version or implementation language,
does not create a target project, and does not add a fixture framework.

Baseline: `HEAD 3436ece`, clean working tree before this document was added.
This step adds exactly one new file, `docs/translation-fixtures.md`.

**M18b target update (2026-10-23, baseline `80ebd3f`):** the target is selected
as **CPython 3.14.6, standard library only**, and the fixture harness lives in
[`tools/translation-pilot-py/`](../tools/translation-pilot-py/README.md). The
decision, limits and G2/G3 scope are recorded in
[`translation-target-decision.md`](translation-target-decision.md). The M18a
inventory below remains historical: it did not select a target, add a runner or
change a test.

Evidence labels used below:

- **Inspected** — the named test case and the source it exercises were read
  directly in this pass.
- **Sampled** — representative cases were read; every branch or consumer was not
  traced.
- **Unverified** — no executed check exists in this step, or the behavior is not
  importable outside the browser host. It is not a correctness claim.
- **Host-run** — a named command was executed for this document (see §8).

Test names are existing repository coverage. Unless a case is marked Host-run in
§8, reading its source is not a fresh execution result.

## 1. Scope and limits

"Literal fixture" here means a committed test case that states concrete inputs
and concrete expected values in its own source (numbers, strings, orderings,
draw counts), rather than only comparing two live runs to each other. The
strongest existing examples are the cases literally named `translation
fixtures` in `tests/dna.test.mjs`, `tests/fieldshape.test.mjs` and
`tests/family.test.mjs`, plus the literal ranking, conflict-draw, UID-tie and
save-migration cases listed below.

Two limits are explicit:

1. **JS-vs-JS legacy parity is not cross-language proof.** `tests/behavior-parity.test.mjs`
   compares two JavaScript engines that share the same number model, string
   comparison, array/sort semantics and RNG implementation. Agreement there does
   not establish agreement with another runtime, language, sort comparator,
   integer width or floating-point precision.
2. **No target engine is selected.** The pilot sketch in §4 is a fixture
   specification to compare against later; it is not a port, a project layout or
   an approval to create one.

This inventory is not a claim that the listed behaviors are correct, complete or
stable. A missing fixture means "not pinned down", not "known broken". A
source-inspected behavior with no executed check is reported as Unverified.

## 2. Existing fixture inventory

### 2.1 Numbers, clamps, tolerances and rounding

| Rule / boundary | Fixture | What the fixture proves | What it does not prove |
| --- | --- | --- | --- |
| Meadow wobble radius and bounds | `tests/fieldshape.test.mjs` :: `translation fixtures: meadow radius is the authored wobble` | Four literal angles produce four literal radii within an explicit `1e-9` absolute tolerance; `FIELD_RADIUS` and `FIELD_BOUNDS` are the authored values. | Cross-language `Math.sin` bit equality; Float32 accuracy; NaN/Infinity input. |
| Inside/outside and padding | `tests/fieldshape.test.mjs` :: `translation fixtures: origin, asymmetric interior and exterior points` | Origin is always inside; +X and +Z edges differ; positive/negative padding changes the result at literal coordinates. | Behavior at `-0`, NaN, Infinity, or a `pad` that exceeds the local radius beyond the covered case. |
| Clamp direction and floor | `tests/fieldshape.test.mjs` :: `translation fixtures: clamp preserves direction and enforces padding` | A far point is projected to a literal radius, padding reduces it, and a huge pad floors at `0.25`; in-radius points are returned unchanged. | Exact sign preservation of `-0`, rounding direction at the floor, non-finite inputs. |
| Genome normalization clamps and ordering | `tests/dna.test.mjs` :: `genome normalization clamps and orders inherited traits` | Literal out-of-range inputs clamp to authored bounds and reversed `hopPace` is ordered. | Float precision at a bound; NaN/Infinity inputs. |
| Genome inheritance literals and RNG count | `tests/dna.test.mjs` :: `translation fixtures: fixed inheritance outputs and RNG draw counts` | A constant RNG of `.5` produces literal gene values, species weights, hybrid target and exactly ten draws in a stated order (colour 3, five genes 1 each, `hopPace` 2). | Cross-language exact float equality; default `Math.random`; seed wrapping. |
| Seeded genome inheritance | `tests/dna.test.mjs` :: `translation fixtures: seeded inheritance outputs and draw order` | A local 32-bit LCG at seed `11` produces literal double outputs for same-species and mixed-species cases, ten draws per case, and does not mutate parents. | That another language's LCG/`imul` matches; tolerance policy for a non-JS target. |
| Bond averaging and clamp | `tests/family.test.mjs` :: `translation fixtures: asymmetric bonds average, then update symmetrically` | Directional `.8`/`.2` average to `.5`, `addBond` writes both sides, unrelated records are untouched, and clamps are literal `0..1`. | Float32 storage; NaN/Infinity bond values. |
| Family/social literal effects | `tests/behavior-family.test.mjs` :: `meal relief .28, bond .05 and radius 2.6`; `tests/behavior-social.test.mjs` :: `quirk 26: visit completion keeps the hardcoded bond/relief values, per race` | Named constants are applied to literal need/bond values within `1e-9`. | A single repository-wide tolerance; non-finite input. |
| Activity score tolerance | `tests/behavior-chooser.test.mjs` :: `translation fixtures: literal scores, authored-order ties and eligibility` | Literal scores rank in the stated order, exact ties keep authored order, ineligible items are excluded, and ranking does not mutate candidates. | Tie behaviour below the `1e-4` test tolerance; non-finite scores. |
| Preference/habit decimals | `tests/behavior-preferences.test.mjs` :: `translation fixtures: sparse records, saturation and fractional-day decay` | Literal sparse records, saturation at `1`, and fractional-day decay are compared within `1e-10`; inputs are not mutated. | Float32; exact decimal serialization. |
| Save-record rounding | `tests/actorrecord.test.mjs` :: `snapshotActor writes the shared v2 life record` | `x`/`z` and common life fields survive the rounded record shape at ordinary values. | Rounding at a `toFixed` boundary, `-0`, NaN/Infinity, or very large magnitudes. `snapshotActor` rounds to 2–4 decimals and maps non-finite to `0` (Inspected). |
| Food balance/respawn | `tests/food.test.mjs` :: `food definitions preserve existing balance and seeded respawn draws` | Literal satiation/respawn values and a `.5` RNG midpoint respawn timer of `15`; source order and safe-food filtering. | A different RNG sequence; Float32 timer drift. |
| Authored content order | `tests/content.test.mjs` :: `flora IDs are unique and the authored tree order resolves completely`; `home styles have a stable ID sequence and complete definitions` | Stable IDs, counts and authored order in the content registries. | Locale/string-comparator equivalence in another language. |

No fixture covers a Float32 boundary value in a game rule. `src/navmesh.js` uses
`Float32Array` for `gScore`/`fScore` (Inspected), but its fixture
`tests/nav-debug.test.mjs` :: `debug rendering leaves the asymmetric path
fixture unchanged` asserts path coordinates, not precision at a Float32 rounding
boundary. Box3D geometry/physics numerics are host-only here; no Node test file
imports the physics bridge.

### 2.2 Null, undefined, missing fields, defaults and invalid values

| Boundary | Fixture | What the fixture proves | What it does not prove |
| --- | --- | --- | --- |
| Path result `null` vs empty vs non-empty | `tests/behavior-path-query.test.mjs` :: `null, empty and nonempty callback results keep identity without field fallback` | A supplied callback's `null` is returned as `null`, an empty array keeps identity, and a non-empty array/node keeps identity; no field fallback runs. | Whether an omitted result and an explicit `null` differ for every consumer. |
| Omitted callback vs explicit `findPath: null` | `tests/behavior-path-query.test.mjs` :: `omitting the callback keeps the missing field/nav null fallback`; `findPath:null uses the field fallback with receiver and path identity` | Omission and explicit `null` both select the field fallback; field/nav receiver is preserved. | Other options whose `null` and omission may differ. |
| Navigation provider `null` is authoritative | `tests/behavior-navigation.test.mjs` :: `a provider result of null is authoritative and never falls back to field.nav`; `a callback null result does not fall back to the provider` | A `null` provider result blocks fallback; provider and explicit callback precedence are covered. | The same distinction for every behavior module. |
| Missing actor collections | `tests/actorsave.test.mjs` :: `a required actor collection is still required`; `a fixture actor collection validates through the registry` | Missing required collection is an error; optional/registered collections are validated when present. | Sparse `worlds` with one map missing, or `null` map objects. |
| Absent genome stays absent | `tests/save.test.mjs` :: `a v1 save without genomes still validates and stays genome-free in storage` | An absent genome is accepted and remains absent in storage. | `genome: null` versus omitted, or a present-but-partial genome. |
| Unknown top-level keys | `tests/save.test.mjs` :: `normalization strips unknown top-level keys and preserves the map payload` | `normalizeSave` drops unknown top-level keys and preserves `mapId`/UID. | Unknown keys inside a world or actor record; key order. |
| Migration defaults | `tests/actorsave.test.mjs` :: `a v1 actor migrates to v2 with family defaults and no traits` | Missing v2 fields gain literal empty skill/history/playdate defaults; input is not mutated. | Whether repeated migration is idempotent; `null` versus missing. |
| Invalid v2 family fields | `tests/actorsave.test.mjs` :: `v2 family fields validate and malformed values are rejected` | Literal invalid skills/history/playdates are rejected. | Boundary values such as `NaN`, `Infinity`, `-0` or numeric strings. |
| Optional save fields | `tests/relationship-save.test.mjs` :: `v8 fields require version 8 and a version 8 record needs one` | A version-8 field without version 8 and a version-8 record without any version-8 field are both rejected. | `null` values, which are not covered as a separate case. |
| Preference/habit invalid values | `tests/behavior-preferences.test.mjs` :: `portable definitions, strict input validation and sparse normalization` | `null`, arrays, unknown keys, `NaN`, out-of-range and string values are rejected by `validActivityValues`; sparse normalization returns `{}`. | The same invalid domain in saved records beyond the v9 cases. |
| Sparse v9 record fields | `tests/behavior-preferences.test.mjs` :: `v9 validation rejects bad fields and older versions carrying new state` | `Infinity`, unknown habits, arrays and older versions carrying v9 state are rejected. | Non-finite number fields outside preferences/habits. |

`applyCommonActorState` deletes absent optional live fields (for example
`carriedFood`, `partnerUid`, `rivals`) rather than writing `null` (Inspected,
`src/actorrecord.js`). No fixture distinguishes `undefined`, `null` and `0` for
each UID field.

### 2.3 Unsigned/32-bit hashing, LCG seeds, draw order and deterministic sequences

| Boundary | Fixture | What the fixture proves | What it does not prove |
| --- | --- | --- | --- |
| FNV-1a founder traits | `tests/behavior-traits.test.mjs` :: `founder traits are deterministic, bounded and RNG-free`; `tests/behavior-traits-save.test.mjs` :: `an old no-trait save loads to the same hashed founder traits` | The same species/UID produces the same trait values, values stay in `.15...85`, no RNG is drawn, and an old save reloads the same hash. | Literal FNV outputs, `Math.imul` overflow vectors, non-ASCII input, and unsigned reconstruction. |
| UID-hashed lifespan | `tests/stars.test.mjs` :: `stars are off by default and lifespan is uid-hash only` | Lifespan is a pure function of UID/species, repeated calls match, different UIDs differ, and the threshold formula is literal. | Literal hash values; UID `0`, negative, fractional or very large inputs. |
| Seeded genome draws | `tests/dna.test.mjs` :: `translation fixtures: fixed inheritance outputs and RNG draw counts`; `translation fixtures: seeded inheritance outputs and draw order` | Exact draw count (10) and order for inheritance; seeded values reproducible with a local LCG. | The game's `g.seed` implementation, unsigned wrap at 32 bits, or non-finite seed handling. |
| Conflict draw order | `tests/behavior-conflict.test.mjs` :: `the two weight draws are fixed actor-then-opponent`; `conflict tie goes to the acting actor and both weights draw in actor order` | Two draws occur in actor-then-opponent order; a `.5`/`.5` pair yields the `tie` outcome. | The `1e-9` weight-difference boundary; RNG values at 0/1; draw order under other actors. |
| Blended trait draws | `tests/behavior-traits.test.mjs` :: `blendTraits draws after the existing flavor/pace/sex birth draws`; `blendTraits draws exactly once per axis and clamps` | Three trait draws occur after the existing birth draws, once per axis, with clamping. | A target's RNG implementation or float-to-unit scaling. |
| Seeded directive sequences | `tests/behavior-directives-stress.test.mjs` :: `600 seeded directive sequences match between legacy and modules` (name interpolates `SEQUENCES`) | 600 sequences, at least 10,800 steps, with overflow/refusal/possession coverage, match JS-vs-JS. | Cross-language proof; legacy and modules share the same semantics. |
| Seeded resources/conflicts | `tests/behavior-world-resources.test.mjs` :: `provider and field conflict routes draw the same seeded RNG sequence` | Two provider routes consume the same seeded sequence and produce the same result. | A literal expected sequence; any non-JS RNG. |
| Navigation RNG order | `tests/behavior-navigation.test.mjs` :: `wander keeps seeded RNG order, draws and paths versus the original field fixture`; `enabled group activities preserve seeded RNG order against the field fixture` | Provider and field routes produce equal draws/paths for seeds `1`, `0x12345678`, `99991`. | Literal paths; cross-language math. |
| No-draw rules | `tests/behavior-path-query.test.mjs` :: `pathTo adds no RNG draws on either route`; `tests/gifting.test.mjs` :: `gifting consumes no RNG and is deterministic for the same seed`; `tests/stars.test.mjs` :: `stars state machine consumes no RNG`; `tests/mourning-determinism.test.mjs` :: `mourning helpers consume no Math.random` | These helpers consume zero draws in the covered paths. | That every caller/branch is draw-free. |
| Scheduler RNG timing | `tests/scheduler-rng-contract.test.mjs` :: `the behavior host resolves the global RNG at call time` | The host passes `rng: () => Math.random()`, so the current global function is resolved at call time. | The LCG's numeric output, seed normalization or a whole-game trace. |
| Deterministic mourning trace | `tests/mourning-determinism.test.mjs` :: `enabled mourning is deterministic for the same seed and departure` | Same seed and departure produce the same rounded trace and draw count within that harness. | Cross-language or frame-rate independence. |

`src/app.js` `hashUid` (FNV-1a, `>>> 0`) and `src/sky.js` farewell-star placement
hash are source-inspected but have no literal fixture (Unverified). The two
`hash32` helpers in `src/behaviors/traits.js` and `src/behaviors/stars.js` are
duplicated FNV-1a implementations; no fixture asserts they agree with each other
or with `src/app.js`.

### 2.4 Ordering and ties

| Boundary | Fixture | What the fixture proves | What it does not prove |
| --- | --- | --- | --- |
| Proposal score ties | `tests/behavior-chooser.test.mjs` :: `exact score ties keep the authored order`; `translation fixtures: literal scores, authored-order ties and eligibility` | Equal scores keep authored order (social before stargazing), and eligibility filters independently of score. | `localeCompare` fallback ties, non-ASCII IDs, or equal `order` + equal score. |
| Guardian selection tie | `tests/adoption.test.mjs` :: `guardian selection is same-species only and deterministic on ties` | Lowest UID (`30` before `31`) breaks a household tie; wrong-species candidate is excluded. | UID `0`, negative or fractional ordering; more than two tied candidates. |
| Conflict outcome tie | `tests/behavior-conflict.test.mjs` :: `conflict tie goes to the acting actor and both weights draw in actor order` | An exact `.5`/`.5` weight pair records `tie`, not `actor`/`opponent`. | Difference exactly at the `1e-9` threshold; Float32 inputs. |
| Conflict draw order | `tests/behavior-conflict.test.mjs` :: `the two weight draws are fixed actor-then-opponent` | `.1` then `.9` gives the opponent the win, so the actor consumes the first draw. | Order when actor/opponent are derived from a sorted roster. |
| Routine offsets | `tests/family.test.mjs` :: `routine windows use a deterministic per-home offset` | The same home name yields the same offset in `0...84`; the routine window shifts. | A literal offset value; signed-32-bit hash boundary; non-ASCII home names. |
| Group leader (lowest UID) | No fixture found. `src/behaviors/groups.js` sorts member UIDs ascending (Inspected). | — | The observable `leaderUid`/`groupRole` tie-break is not pinned by a test. |
| Map/actor iteration order | No fixture found that asserts roster iteration order as a contract. | — | Whether a target iterates actors in the same order for draws or tie resolution. |

`rankProposals` falls back to `String(a.id).localeCompare(String(b.id))` after
score and authored order (Inspected, `src/behaviors/proposals.js`). No fixture
covers a comparator tie or locale-sensitive ordering. `Map`/object key iteration
in save validation is also unconstrained by a fixture.

### 2.5 Live identity, wire UIDs, reciprocal references and pruning

| Boundary | Fixture | What the fixture proves | What it does not prove |
| --- | --- | --- | --- |
| Live object vs saved record | `tests/actor-lifecycle-contract.test.mjs` :: `saved records keep persistent UID references and omit live handles` | Records keep `uid`, `partnerUid`, `bonds`, `rivals` and `carriedFood`, and omit `ai`, `mesh`, `handles`, `body`, `groups`, `active`, `partner`; JSON round-trip keeps this. | Key order/canonical JSON; every live field the app might add later. |
| Common restore does not adopt pointers | `tests/actor-lifecycle-contract.test.mjs` :: `common restore applies UID references without adopting saved live pointers` | `partnerUid` is restored, live `ai`/`mesh`/`body` are preserved, and a saved `partner` object is not adopted. | App-level spawn/remove/pool reuse, which is not Node-importable. |
| Actor view liveness and slot reuse | `tests/actor-lifecycle-contract.test.mjs` :: `actor view exposes live objects and drops removed slot identities` | `byUid` returns the live object, hides inactive actors, and a reused slot resolves only under its new UID. | A stale held reference throwing or being invalidated; it is observational. |
| UID reservation across collections/maps | `tests/actor-lifecycle-contract.test.mjs` :: `reservation scans every registered collection across both maps`; `tests/save.test.mjs` :: `the loader reserves the highest uid across both maps and Glass` | `maxActorUid` scans registered collections and both maps, ignores `null`, non-numeric and zero UIDs, and returns the highest finite value (`500000` / `900000` fixtures). | Fractional/negative UIDs as valid identities; app allocator reset. |
| Game-wide duplicate UIDs | `tests/save.test.mjs` :: `a duplicate actor uid anywhere in the game is rejected` | Duplicate numeric UIDs across maps and Glass are rejected before normalization. | Duplicate `"1"` vs `1`; duplicate UIDs in non-actor collections. |
| Reciprocal partner/rival validation | `tests/relationship-save.test.mjs` :: `partnership and rivalry references must be reciprocal and present` | Missing partner, non-reciprocal partner and non-reciprocal rival are rejected. | Self-partner (`uid` with itself), duplicate keys, or adult-stage checks beyond the fixture. |
| Save-boundary pruning | `tests/relationship-save.test.mjs` :: `game-wide pruning preserves a partner on the inactive map`; `tests/family.test.mjs` :: `pruneActorRefs removes stale bond and playdate keys but keeps ancestry` | Live-UID sets preserve a partner/rival on the inactive map; stale bond/playdate keys are removed while `parentUids` survives. | History event scopes, guardian/rival pruning combinations, or pruning idempotence. |
| Guardian pruning | `tests/adoption-save.test.mjs` :: `a departed guardian is pruned from the saved reference set`; `migration keeps a valid guardian and drops an invalid one` | A departed guardian is removed; migration keeps a valid guardian and drops an invalid one. | Cross-map guardian restore ordering. |

### 2.6 Save versions, migrations, sparse/old records and normalization

| Boundary | Fixture | What the fixture proves | What it does not prove |
| --- | --- | --- | --- |
| Top-level version and genome version | `tests/save.test.mjs` :: `a future top-level save version is rejected before normalization`; `a future genome version is rejected instead of being silently downgraded` | Future top-level/genome versions fail validation and normalization throws before mutation. | Missing or non-numeric version; version `0`; version as a string. |
| Actor version forward guard | `tests/actorsave.test.mjs` :: `a future actor version is rejected instead of being silently downgraded` | `ACTOR_SAVE_VERSION + 1` is rejected. | Negative/fractional/string versions. |
| v1 → v2 migration | `tests/actorsave.test.mjs` :: `a v1 actor migrates to v2 with family defaults and no traits` | Literal defaults and non-mutation of the input record. | Repeated-migration idempotence. |
| Optional feature migrations | `tests/history-delta-save.test.mjs` :: `migration promotes old records with deltas to v6 without renumbering`; `tests/adoption-save.test.mjs` :: `migration keeps a valid guardian and drops an invalid one`; `tests/behavior-traits-save.test.mjs` :: `a v2 record carrying traits migrates to v3; a v3 without traits falls back to v2`; `tests/relationship-save.test.mjs` :: `migration promotes new fields without dropping existing version data`; `tests/behavior-preferences.test.mjs` :: `v9 coexists with earlier optional fields; trait inheritance/save contracts stay intact` | The current migration ladder (through `ACTOR_SAVE_VERSION = 9`) promotes/drops optional fields as stated and preserves older data. | Migration order across every combination of all nine versions; idempotence; normalization after repeated calls. |
| Sparse/old records | `tests/history-delta-save.test.mjs` :: `deltas require v6 and v6 requires at least one delta`; `tests/relationship-save.test.mjs` :: `v8 fields require version 8 and a version 8 record needs one`; `tests/behavior-traits-save.test.mjs` :: `v3 validation requires complete bounded traits` | Field/version coupling is enforced for v3, v6 and v8. | v4/v5/v7/v9 coupling beyond their own fixtures; null values. |
| Normalization preserves input-world side effect | `tests/save.test.mjs` :: `normalization preserves the existing input-world migration side effect` | `migrateActorWorld` mutates the input world's actor array/record while `normalizeSave` returns a cloned world; literal v2 is written to both. | Whether this side effect is intended for every caller; it is pinned, not justified. |
| Unknown top-level keys | `tests/save.test.mjs` :: `normalization strips unknown top-level keys and preserves the map payload` | Unknown top-level keys are dropped; the map payload survives. | Unknown world/actor keys. |
| Dropped-portion IDs | `tests/save.test.mjs` :: `dropped gift portions validate and duplicate ids are rejected` | Gift IDs round-trip and duplicate IDs across maps are rejected. | Duplicate carried-food IDs across maps (partially source-inspected, no direct fixture). |

The save envelope is `SAVE_FORMAT = 'gummy-save'`, `SAVE_VERSION = 1`; actor
records are versioned up to `ACTOR_SAVE_VERSION = 9`; DNA is `DNA_VERSION = 1`
(Inspected). These constants are part of fixture provenance.

### 2.7 Pathfinding/navigation coordinates

| Boundary | Fixture | What the fixture proves | What it does not prove |
| --- | --- | --- | --- |
| Asymmetric path fixture | `tests/nav-debug.test.mjs` :: `debug rendering leaves the asymmetric path fixture unchanged` | Literal `nearestWalkable` results (`-1.5,-1.5`, `1.5,1.5` with cell indices), a literal three-node path around a blocking rock, a same-cell path, and deterministic re-query. | Equal-distance tie selection; Float32 cost boundaries; paths on larger grids. |
| Debug mesh contract | `tests/nav-debug.test.mjs` :: `the isolated debug builder keeps the existing mesh contract` | Debug geometry attribute shape, material settings and integer cell coordinates; the debug builder does not mutate the path. | Rendering appearance; platform float differences. |
| Path identity and null semantics | `tests/behavior-path-query.test.mjs`; `tests/behavior-navigation.test.mjs` | Returned path/node identity, `null`/empty handling, provider precedence, receiver binding and absent-navigation policy. | The nav algorithm's tie-break or numeric costs. |
| Same seeded trace | `tests/behavior-path-query.test.mjs` :: `callback and fallback keep the same fixed-RNG social trace and draw count` | Callback and field fallback produce an identical 80-tick social trace, draws and nav-call count. | Cross-language equality. |

`src/navmesh.js` uses `Float32Array` for path costs and a `MinHeap`; equal-cost
entries are resolved by heap push/pop order (Inspected). `nearestWalkable`
scans rings from `dx = -r` upward and keeps the first point with strictly
smaller squared distance, so equal-distance cells retain scan order (Inspected).
Neither rule has a fixture.

### 2.8 Behavior parity/contract fixtures that are JS-vs-JS only

These cases are valuable regression oracles but cannot be presented as
cross-language evidence:

- `tests/behavior-parity.test.mjs` :: `legacy and modules engines match for every race`
  compares legacy and modular engines for `bear`, `gummy` and `glass`, including
  draw and transition counts.
- `tests/behavior-parity.test.mjs` :: `legacy-vs-legacy is deterministic and a perturbation is detected`
  proves the comparator catches a changed need value; it does not prove a target
  runtime would be detected by the same comparator.
- `tests/behavior-parity.test.mjs` :: `JSON snapshots are compared every tick, not only at verbose samples`
  proves sample-interval hiding is prevented inside this harness.
- `tests/behavior-directives-stress.test.mjs` :: `600 seeded directive sequences match between legacy and modules`
  is a broad JS-vs-JS sequence comparison, not a language-neutral specification.
- `tests/behavior-contracts.test.mjs` :: `live engine/config inventory matches explicit support declarations`
  checks module/config declarations inside this repository.
- `tests/behavior-preferences.test.mjs` :: `enabled traces/RNG reproduce; disabled state does not change decisions or draws`
  and `tests/mourning-determinism.test.mjs` :: `enabled mourning is deterministic for the same seed and departure`
  reproduce traces within the same JS runtime.
- `tests/behavior-navigation.test.mjs` :: `wander keeps seeded RNG order, draws and paths versus the original field fixture`
  compares two JS routes, not two languages.

Any target port must be compared to the literal fixtures, not only to these
JS-vs-JS traces.

## 3. Gap analysis

The cases below are observable from source and, unless marked Unverified, are
importable in Node. "Missing fixture" means the behavior exists but no committed
case pins it. "Unverified behavior" means this pass did not establish the
behavior at all, usually because it lives in the browser host.

### Numeric boundaries

- **G1 — signed zero in `fieldshape`.** `fieldClamp(-0, 0)` returns `{ x: -0, z: 0 }`
  because the zero-radius early return preserves the input (`src/fieldshape.js`,
  Inspected). No fixture asserts `Object.is(result.x, -0)` or its serialized
  form. Missing fixture.
- **G2 — non-finite geometry input.** `fieldInside(NaN, 0)` computes `NaN` and
  returns `false`; `fieldClamp(Infinity, 0)` computes `limit / Infinity` and
  returns `{ x: NaN, z: 0 }` (Inspected). No fixture covers NaN/Infinity.
  Missing fixture.
- **G3 — Float32 path costs.** `navmesh.findPath` stores `gScore`/`fScore` in
  `Float32Array` (Inspected). A path whose costs sit near a Float32 step has no
  fixture; the existing path is small-integer cost. Missing fixture, but only
  observable through a crafted nav grid.
- **G4 — save-record rounding.** `snapshotActor` rounds with `toFixed(2..4)` and
  converts non-finite values to `0` (Inspected). No fixture covers `0.00005`,
  `-0.00005`, `1e21`, `NaN`, `Infinity`, or values that round differently under
  target-language formatting. Missing fixture.
- **G5 — tolerance policy.** The repository currently uses `1e-9`
  (`fieldshape`, family/social), `1e-10` (preferences), `1e-4` (chooser) and
  exact `deepEqual` (DNA, save/UID tests). There is no documented per-domain
  tolerance policy, so a target could pass one area and fail another without the
  requirement being stated. Missing policy, not a missing assertion.

### Null/undefined and invalid values

- **G6 — `null` versus omitted UID fields.** `snapshotActor` emits optional keys
  only when meaningful (`partnerUid`, `rivals`, `guardianUid`, `lastGiftDay`,
  `mourning`, `preferences`, `habits`) and `applyCommonActorState` deletes them
  otherwise (Inspected). No fixture contrasts `{ partnerUid: null }`,
  `{ partnerUid: 0 }` and `{}`. Missing fixture.
- **G7 — null actor entries and sparse maps.** `maxActorUid` ignores `null`
  actors and a test covers that fixture, but `validateActorWorld`/`validateSave`
  do not have a fixture for `worlds.field = null`, `worlds.studio` missing, or
  an actor entry that is `null`/non-object. Partial (the `maxActorUid` half is
  covered; validation half is missing).
- **G8 — non-finite saved numbers.** JSON serialization turns `NaN`/`Infinity`
  into `null`. No fixture exercises a record containing a non-finite numeric
  field through `snapshotActor`/`JSON.stringify`/`normalizeSave`; only
  preferences validation explicitly rejects `Infinity`. Missing fixture.

### Unsigned hashing and RNG

- **G9 — FNV-1a literal vectors.** `hashUid` (`src/app.js`), `hash32`
  (`traits.js`, `stars.js`) and the farewell-star hash all use the same FNV-1a
  shape (Inspected), but no fixture states expected unsigned outputs for `''`,
  `'a'`, a long string, a non-ASCII string or a string whose intermediate value
  exceeds 32 bits. Missing fixture.
- **G10 — `g.seed` normalization and sequence.** The scheduler contract records
  floor/wrap/zero/non-finite behavior and the LCG recurrence (Inspected,
  `src/app.js`), but `g.seed` is an app debug hook and is not Node-importable.
  No fixture gives the first N outputs for seed `0`, `-1`, `1.5`, `2^32` or
  `2^32 + 7`. Unverified behavior; host probe needed.
- **G11 — draw-order contract beyond covered paths.** Draw order is pinned for
  genome inheritance, conflict weights and trait blending, and equality is
  pinned for several routes. There is no single inventory of every global
  consumer or a fixture asserting a whole-frame draw sequence. Partial.
- **G12 — duplicate helper implementations.** `mulberry32` is redefined in
  several tests/scripts and the LCG appears both as `imul` and as
  `* 1664525` (`src/backdrop.js`, `src/field.js`, `src/sky.js`, `src/bushes.js`,
  `src/trees.js`, `src/horizon.js`; Inspected). No fixture asserts those
  helpers produce the same sequence or that 32-bit wrap is intentional in each.
  Missing fixture; relevant before using any helper as target provenance.

### Ordering, ties and serialization

- **G13 — group leader lowest UID.** `chooseLeader` sorts by `uid` ascending
  (`src/behaviors/groups.js`, Inspected), but no test asserts `leaderUid` or
  `groupRole` for a tie. Missing fixture.
- **G14 — navigation equal-distance tie.** `nearestWalkable` keeps scan-order
  ties and `findPath` inherits heap ordering (Inspected). No fixture places two
  walkable cells at exactly equal distance from a blocked query point. Missing
  fixture.
- **G15 — proposal comparator fallback.** `rankProposals` uses
  `localeCompare` after score and authored order (Inspected). No fixture covers
  two candidates with equal score/order and non-ASCII IDs, or documents whether
  byte order, code-point order or locale order is required. Missing fixture.
- **G16 — serialization key order.** `snapshotActor`, `normalizeSave` and
  `actorrecord` construct objects by assignment, so JSON key order is insertion
  order (Inspected). No fixture or contract states whether key order is
  canonical, and no target should assume `JSON.stringify` byte equality without
  a canonicalizer. Missing contract; `JSON.stringify` equality is used for parent
  non-mutation in DNA tests but not for record ordering.
- **G17 — conflict epsilon boundary.** `finishConflict` declares a tie when the
  absolute weight difference is `< 1e-9` (`src/behaviors/conflict.js`,
  Inspected). The fixture uses identical weights; a difference of exactly `1e-9`
  or `1e-9 - ε` is not covered. Missing fixture.

### Identity and save migration

- **G18 — UID numeric domain.** `maxActorUid` accepts any finite `uid`
  (`Number.isFinite`), while save validation only requires a finite positive
  number (Inspected). No fixture covers fractional `1.5`, negative `-7`,
  numeric string `"7"`, or `Number.MAX_SAFE_INTEGER`. Missing fixture.
- **G19 — migration idempotence and ordering.** Existing cases cover individual
  version steps, but no fixture applies `migrateActorRecord` twice or migrates a
  record carrying fields from several versions in a deliberately unusual order
  and asserts the result is unchanged. Missing fixture.
- **G20 — missing map objects.** `validateSave` calls `validateWorld` for both
  `field` and `studio`; a missing map is reported as "not an object", but no
  fixture asserts the error text or normalization behavior for a missing map.
  Missing fixture (the required actor collection case is adjacent but not the
  same).
- **G21 — duplicate IDs across representations.** A duplicate numeric actor UID
  is covered. A duplicate carried-food ID across maps is only source-inspected;
  a duplicate string actor UID versus numeric UID is impossible to observe
  through save validation because UIDs must be numeric. Partial.

### Navigation and physics

- **G22 — physics/geometry tolerance.** There is no Node fixture for Box3D
  mass/shape/solver numerics, metaball surface positions or Glass rigid-body
  transforms; those paths require the browser/WASM host. Unverified behavior;
  outside a pure-rule pilot and a separately gated physics scope.
- **G23 — nav coordinates beyond the toy grid.** The nav fixture uses a 9×9
  grid, cell `1`, radius `0.1` (Inspected). No fixture covers the authored
  meadow scale, `cell` rounding, or the `maxCells = 20` failure boundary.
  Missing fixture; may be host-dependent.

### Explicitly not relevant to this inventory

- Three.js material/shader appearance, lighting, post-processing, GLB
  animation, batching/instancing performance, DOM/UI layout, audio, asset
  loading and disposal. These are host/presentation scopes and cannot be
  specified by pure arithmetic fixtures. They are not "covered" by the tests
  above and are not proposed as pilot content.
- Whole-game determinism, frame-rate independence and wall-clock timing. The
  scheduler contract already marks these out of scope; JS-vs-JS traces do not
  establish them.

## 4. Proposed minimal target-pilot fixture set

This was the M18a specification for the later M18b step. M18b selected the
target (CPython 3.14.6, standard library only) and created the fixture manifests
and validator under `tools/translation-pilot-py/`; see
[`translation-target-decision.md`](translation-target-decision.md). The rules,
tolerances and negatives below remain the pinned fixture specification.

### 4.1 Pure rule: genome inheritance (`combineGenomes`)

Use the already-literal fixture in
`tests/dna.test.mjs` :: `translation fixtures: fixed inheritance outputs and RNG
draw counts`. It is pure with respect to the host: `src/dna.js` imports only the
species registry, accepts an injected RNG and returns plain data.

**Input (same as the existing case):**

```text
parentA = defaultGenome('bear', { genes: {
  color: '#102030', size: .75, rigidity: .25, softness: .5,
  stretch: .5, material: 'bearGummy', hopPace: [.5, 1.5]
}})
parentB = defaultGenome('bear', { genes: {
  color: '#80c0e0', size: 1.25, rigidity: .5, softness: .75,
  stretch: 1.5, material: 'bearGummy', hopPace: [.75, 1.25]
}})
options = { mutation: .04, rng: () => .5 }
```

**Expected output:**

```text
species     = { bear: 1 }
genes.color = '#487088'
genes.size  = 1
genes.rigidity = .375
genes.softness = .625
genes.stretch = 1
genes.hopPace = [.625, 1.375]
genes.material = 'bearGummy'
hybridTarget = null
phenotype = 'softbody-bear'
rng draws = 10
parents unchanged
```

**Tolerance:** exact for `species` keys/values, `color`, `material`,
`hybridTarget`, `phenotype`, draw count and the parent-unchanged check; absolute
`1e-12` for the five numeric genes and both `hopPace` values. These numbers are
exact binary midpoints in JS, but the tolerance acknowledges a target may
evaluate in a different order. If a candidate target uses single precision, this
tolerance is not achievable: stop and record the precision decision rather than
silently widening the tolerance.

**Provenance:** `tests/dna.test.mjs`, case name above, baseline `3436ece`,
`DNA_VERSION = 1`. Add the seeded variant (seed `11`) from `translation
fixtures: seeded inheritance outputs and draw order` only if the target also
implements the LCG; its expected values are already literal.

**Failure negatives that must fail:** draw count `9` or `11`; a changed gene by
`1e-6`; `hybridTarget = 'bear-msn'`; a mutated parent; `phenotype = 'skinned'`.

### 4.2 Bounded actor/world adapter slice: wire UID round-trip

Use the existing cases `tests/relationship-save.test.mjs` :: `v8 persists
rivalry, partnership and a carried portion`, `partnership and rivalry references
must be reciprocal and present`, and `tests/actor-lifecycle-contract.test.mjs` ::
`common restore applies UID references without adopting saved live pointers`.
This slice covers the live-object ↔ saved-UID boundary without requiring DOM,
three.js or Box3D.

**Input:** two live fixtures, `A(uid 1)` and `B(uid 2)`, with `A.partnerUid = 2`,
`B.partnerUid = 1`, `A.rivals = { 3: { sinceDay: 2, sinceHour: 9.5 } }`,
`A.bonds = { 2: .7 }`, and `A.carriedFood = { id: 'gift-1', kind: 'flower',
satiation: .2 }`; a third adult record `C(uid 3)` with the reciprocal
`C.rivals = { 1: { sinceDay: 2, sinceHour: 9.5 } }`.

**Expected output:**

- `snapshotActor(A)` has `actorVersion = 8`, `uid = 1`, `partnerUid = 2`,
  `rivals`/`bonds`/`carriedFood` as above, and no `ai`, `mesh`, `body`,
  `handles`, `groups`, `active` or `partner` key.
- `validateActorWorld` and `validateGameRelationships` return no errors for the
  three-record world `A`, `B`, `C`.
- `applyCommonActorState(freshActor1, recordA)` sets `partnerUid` and `rivals`,
  deletes `carriedFood`, preserves the live `ai`/`mesh`/`body`, and does not
  adopt a saved `partner` object.
- `pruneActorRefs(record1, new Set([1, 2, 3]))` returns `false` and changes
  nothing; `pruneActorRefs(record1, new Set([1]))` returns `true` and removes
  `partnerUid`, `bonds['2']` and `rivals['3']`.

**Tolerance:** exact for UIDs, version, key presence/absence, `partnerUid`,
`rivals`, `bonds`, `carriedFood` and booleans; exact for `x`/`z` only after the
documented 3-decimal record rounding. Do not compare raw object key order; see
G16.

**Provenance:** the two case names above, baseline `3436ece`,
`ACTOR_SAVE_VERSION = 9` and `SAVE_VERSION = 1`.

**Failure negatives that must fail:** a non-reciprocal partner; a partner UID
with no actor; a duplicate UID across maps; a record that adopts saved `ai` or
`mesh`; pruning a partner that exists on the inactive map.

## 5. Evidence requirements for a future target port

A later target result is acceptable only when all of the following are recorded:

1. **Independent execution.** The target fixture runs in the target runtime and
   its own command/exit code/output are captured. A JavaScript test importing
   the target is not independent execution. A target result copied from the JS
   oracle is not evidence.
2. **Explicit exact/tolerance policy.** Each field is marked exact or
   tolerance-based, with the numeric tolerance, rounding mode and comparison
   method (absolute/relative/ULP) stated before the run. A tolerance may not be
   widened after a failure without an explicit decision and a new baseline.
3. **Failure negatives.** At least one deliberately wrong input/expected value
   per fixture family must fail in the target. A target that "passes" a
   perturbation check it cannot detect is not a comparator.
4. **Provenance and versioning.** Record repository path, case name, baseline
   commit, fixture date, format/DNA/actor/save version constants, and a hash of
   the fixture input. If the fixture changes, the target result is stale.
5. **Independent artifact inspection.** Captures/logs stay in `.dev-shots/` (or
   the approved temporary directory) and are inspected, not merely summarized.
6. **No JS-vs-JS substitution.** `tests/behavior-parity.test.mjs` and the seeded
   parity harnesses are regression oracles for two JS engines. They share
   `Math.sin`, `Math.imul`, IEEE-754 doubles, `Array.prototype.sort`,
   `localeCompare` and `Math.random`; they cannot prove a target's integer
   width, float precision, string collation, object key order, NaN/Infinity
   handling or RNG sequence.
7. **Separate scope for physics/rendering.** Native physics, metaball surface
   fidelity and whole-game determinism require their own evaluation; passing the
   pure and adapter fixtures does not imply them.

The target engine/version/language and success criteria were selected in M18b:
CPython 3.14.6, standard library only, with exact/`1e-12` policies and required
failure negatives as recorded in
[`translation-target-decision.md`](translation-target-decision.md). The M18a
evidence requirements above still govern G2/G3.

## 6. Related contracts

- [Scheduler and RNG contract](scheduler-rng-contract.md) — frame/clock domains,
  global `Math.random` ownership, `g.seed` normalization and the limits of
  seeded traces.
- [Actor and session identity/lifecycle contract](actor-session-lifecycle.md) —
  live object identity versus game-wide UIDs, snapshots, reservation, removal,
  pool reuse and pruning.
- [Interaction ownership inventory](interaction-ownership.md) — pair/task/claim
  owners, reciprocal references and cleanup scopes.
- [Future-system admission checklist](future-system-admission.md) — identity,
  persistence, interruption and evidence questions for new systems.
- [System modularity roadmap](system-modularity-roadmap.md#m18--executable-translation-specification-and-target-pilot-m-m0)
  — M18a–M18d scope and the Batch A/G gates.
- [Modularity and portability roadmap](../MODULARITY_PORTABILITY_ROADMAP.md#translation-hazards)
  — prior translation-hazard table and P1 fixture evidence.

## 7. Coverage/gap table for M18b/M18c

Status values: **covered** (literal contract exists), **partial** (some cases,
boundary unpinned), **missing fixture** (observable but unpinned), **unverified**
(host-only or not established), **not relevant** (host/presentation scope).

| ID | Area / observable case | Existing evidence | Status | Candidate M18b/M18c action |
| --- | --- | --- | --- | --- |
| C1 | Meadow radius, inside/outside, clamp at ordinary values | `fieldshape` 3 literal cases, `1e-9` | covered | Reuse as pure numeric fixture reference. |
| C2 | `-0`, NaN, Infinity in field geometry | none | missing fixture | Add literal cases; decide serialization of `-0`. |
| C3 | Genome inheritance midpoints, draws and seeded values | `dna` two translation cases | covered | Use as pure-rule pilot (§4.1). |
| C4 | Save-record rounding boundaries and non-finite fields | `actorrecord` ordinary snapshot only | missing fixture | Add `toFixed` boundary and NaN/Infinity cases. |
| C5 | FNV-1a literal unsigned vectors (all hash users) | traits/stars determinism+bounds only | missing fixture | Add shared vectors: empty, ASCII, non-ASCII, >32-bit intermediate. |
| C6 | `g.seed` floor/wrap/zero/non-finite and first outputs | scheduler contract source only | unverified | Host probe with fixed seed; record environment. |
| C7 | Whole-frame draw order across global consumers | per-rule counts/order only | partial | Inventory consumers; do not claim one fixture. |
| C8 | Duplicate RNG helpers agree or differ intentionally | none | missing fixture | Compare helper sequences; document each variant. |
| C9 | Proposal ties including `localeCompare` fallback | equal score/order literal cases | missing fixture | Add non-ASCII/equal-order comparator case; declare collation. |
| C10 | Group leader lowest-UID tie | source only (groups.js) | missing fixture | Add `leaderUid`/`groupRole` tie case. |
| C11 | Conflict weight difference at `1e-9` | equal-weight tie only | missing fixture | Add just-below/at/above threshold cases. |
| C12 | Nav equal-distance scan/heap ties | nav path only at unique distances | missing fixture | Add symmetric obstacle fixture; record tie rule. |
| C13 | Nav Float32 cost boundary and large-grid scale | toy grid, literal path | partial/missing | Add Float32 boundary fixture; host check for authored scale. |
| C14 | Serialization key order / canonical JSON | none | missing contract | Declare canonical comparison or forbid byte-order assertions. |
| C15 | `null` vs omitted vs `0` for UID/optional fields | sparse v8/v9 and path-null cases | partial | Add paired cases for `partnerUid`, `rivals`, `carriedFood`. |
| C16 | Numeric UID domain (fractional, negative, string, max-safe) | `maxActorUid` ignores null/zero/non-numeric | missing fixture | Add validation/reservation cases; decide allowed domain. |
| C17 | Game-wide duplicate UIDs and carried-food IDs | duplicate UID case; gift-ID case | covered/partial | Add duplicate carried-food across maps if behavior is intended. |
| C18 | Partner/rival reciprocity and missing-actor rejection | `relationship-save` literal cases | covered | Reuse in adapter pilot (§4.2). |
| C19 | Pruning inactive-map partner, ancestry retention | `relationship-save`, `family` cases | covered | Reuse; add history/guardian combinations only if needed. |
| C20 | Actor version ladder v1–v9 and field/version coupling | many focused cases | covered/partial | Add idempotence and unusual cross-version order. |
| C21 | Missing map object / null actor entry normalization | required-collection and maxActorUid cases | partial/missing | Add `worlds.field = null`, missing `studio`, null entry. |
| C22 | Migration idempotence | none | missing fixture | Apply migration twice; assert unchanged. |
| C23 | Box3D / metaball / Glass numeric fidelity | no Node physics fixture | unverified | Separate host/physics scope; do not use JS parity as proof. |
| C24 | Behavior engine parity | `behavior-parity`, directives stress, navigation/preferences traces | covered as JS-vs-JS only | Use as regression oracle, never as cross-language evidence. |
| C25 | Rendering/UI/assets/audio/async lifetime | host checks elsewhere | not relevant | Exclude from translation pilot; keep in M15/M20 scopes. |

## 8. Verification of this document

The checks below were run in this pass at baseline `3436ece`. They are
documentation checks plus focused Node tests over the cited fixtures; they are
not browser, gameplay, physics, whole-game or cross-language evidence.

- `git diff --check` — exit 0, no tracked-file whitespace errors.
- Untracked-file whitespace scan over the new document — no trailing
  whitespace and no tab indentation.
- Link/path verification — 6 relative links, 0 broken; 47 exact cited
  test/source paths, 0 missing. The `tests/*.test.mjs` and `src/*.js` prose
  wildcards are not counted as paths.
- Test-name verification — 84 inline test-file :: case citations, 0 missing.
  The generated stress-case name is checked against `SEQUENCES = 600`.
- `git status --short` — only `?? docs/translation-fixtures.md`; no tracked
  file changed.
- Focused Node tests — **Host-run** at `3436ece` with this exact command:

  ```sh
  node --test tests/dna.test.mjs tests/fieldshape.test.mjs tests/family.test.mjs tests/behavior-chooser.test.mjs tests/behavior-conflict.test.mjs tests/adoption.test.mjs tests/actorrecord.test.mjs tests/actorsave.test.mjs tests/save.test.mjs tests/relationship-save.test.mjs tests/history-delta-save.test.mjs tests/adoption-save.test.mjs tests/behavior-traits-save.test.mjs tests/behavior-preferences.test.mjs tests/behavior-family.test.mjs tests/behavior-social.test.mjs tests/nav-debug.test.mjs tests/behavior-path-query.test.mjs tests/stars.test.mjs tests/behavior-traits.test.mjs tests/food.test.mjs tests/content.test.mjs tests/scheduler-rng-contract.test.mjs
  ```

  Result: `tests 180`, `pass 180`, `fail 0`, `cancelled 0`, `skipped 0`,
  `todo 0`, `duration_ms 783.197042`.

These focused tests execute existing repository fixtures. They do not test a
target language, do not establish the gaps in §3, and do not replace a browser
or full-suite check.

No browser, smoke, parity-matrix or full-suite run is part of M18a. No target
engine was selected and no Batch B work was started.
