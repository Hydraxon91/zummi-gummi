# Translation target decision (M18b)

**Status: selected for M18b; G1 harness and G2 pure-rule port complete.** This
document records the target language and runtime for the executable translation
pilot. It does not claim that the bounded adapter port exists or that the pilot
proves whole-game portability.

Baseline: `HEAD 80ebd3f`, clean working tree before the G1 change. Fixture date
`2026-10-23`.

## 1. Decision

| Item | Decision |
| --- | --- |
| Target language/runtime | **CPython 3.14.6** |
| Interpreter used on the development host | `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3` |
| Dependencies | **Standard library only** — no pip, virtualenv package, native extension or game runtime dependency |
| Independent execution | `python3 tools/translation-pilot-py/run.py validate` and `--self-test`; later G2/G3 runners must be direct target commands |
| Artifact location | `tools/translation-pilot-py/` (fixtures and runner), scratch evidence under `.dev-shots/g1/` |
| Repository baseline | `80ebd3f` |
| Fixture specification | [`translation-fixtures.md`](translation-fixtures.md) §4–§5 |

`python3 --version` currently reports `3.14.6` on the development host. The
absolute interpreter path is recorded so a later run can prove it used the
selected runtime rather than an incidental shell alias.

## 2. Why this is a cross-language runtime but not a game engine

Python is a **different language and runtime** from the JavaScript game. It has
independent string handling, numeric formatting, dictionary ordering rules
(explicitly canonicalized here), module loading and process execution. Running a
Python oracle demonstrates behavior outside the JavaScript runtime.

It is **not** a game engine and is not proposed as one:

- The pilot does not run Three.js, Box3D, WASM physics, the browser, asset
  loaders, metaballs/surface nets or the game loop.
- The G1 harness validates fixture **data**; it executes no game rule. G2/G3 will
  implement only the two bounded rules named in §4 below.
- Python's numbers are IEEE-754 doubles for these inputs, which is useful for the
  pinned values but does not establish JavaScript engine identity, `Math.sin`,
  `Math.imul` overflow, `localeCompare`, object-key order, `Math.random` or
  single-precision behavior.
- Native physics, rendering, whole-game determinism and frame-rate independence
  are **excluded** from this decision and require a separate host/physics scope.
  Passing a pure-rule or adapter fixture does not imply them (C23 in
  `translation-fixtures.md` §7).

## 3. Exact/tolerance policy

The policy is pinned per field in the manifests:

- **Exact:** species keys and values, `genes.color`, `genes.material`,
  `hybridTarget`, `phenotype`, draw count, parent-unchanged state, UIDs,
  actor-record version/key presence, reciprocal reference outcomes, prune
  booleans and validation errors.
- **Absolute `1e-12`:** `genes.size`, `genes.rigidity`, `genes.softness`,
  `genes.stretch`, `genes.hopPace[0]` and `genes.hopPace[1]`. These expected
  values are exact binary midpoints in JavaScript; the tolerance acknowledges a
  target may evaluate in a different order. It is not permission to use single
  precision or a looser comparison.
- **Adapter rounding:** `x`/`z` are compared exactly **after** the documented
  three-decimal `snapshotActor` rounding. Raw object key order is not compared
  (`translation-fixtures.md` G16).
- **No post-failure widening.** A tolerance change requires an explicit decision,
  a new fixture baseline and a regenerated canonical hash.
- **Single precision stops the pilot.** If a target computes these values in
  single precision and cannot meet `1e-12`, record the precision decision rather
  than silently widening the tolerance.

## 4. Failure negatives

Each fixture family lists deliberate negatives that must be rejected by the
target comparator. A target that "passes" a perturbation it cannot detect is not
a valid comparator.

- **Genome inheritance:** draw count `9` or `11`; a numeric gene off by `1e-6`;
  wrong `hybridTarget`; a mutated parent; phenotype `skinned` instead of
  `softbody-bear`.
- **Wire UID adapter:** non-reciprocal partner; partner UID with no actor;
  duplicate UID across maps; adopting saved `ai`/`mesh` handles; pruning a
  partner that exists on the inactive map.

The G1 `--self-test` already proves the **manifest validator** rejects in-memory
case mutations, hash tampering and a semantically mutated case whose hash was
regenerated. It does not prove a future port comparator yet.

## 5. Provenance and canonical hash

Each manifest records the repository path, exact source case names, baseline
commit `80ebd3f`, fixture date, relevant format constants (`DNA_VERSION = 1`;
`ACTOR_SAVE_VERSION = 9`, `SAVE_VERSION = 1`, fixture record `actorVersion = 8`)
and a canonical SHA-256 hash.

Hash rule: omit `manifestHash`, serialize UTF-8 with
`json.dumps(payload, sort_keys=True, separators=(',', ':'))`, SHA-256 the UTF-8
bytes, and store lowercase hex. Any pinned-input change invalidates the hash; a
G2/G3 result against an old hash is stale. G2/G3 must not edit pinned fixtures
without a new baseline and an explicitly recorded hash.

## 6. Independent artifact location

The target project is `tools/translation-pilot-py/`:

- `fixtures/genome_inheritance.json` — pure-rule pilot data and negatives.
- `fixtures/wire_uid.json` — bounded adapter pilot data and negatives.
- `run.py` — schema/provenance/hash validator, self-test and G2 `genome` command.
- `genome.py` — G2 bear/msn `combineGenomes` port with constant and LCG RNGs.
- `README.md` — target decision summary, usage, evidence rules and non-goals.

Scratch tamper copies and future captures belong in `.dev-shots/g1/` (ignored
scratch, never committed). A JavaScript test invoking Python is not independent
execution evidence; the target command and its exit code must be captured.

## 7. JS-vs-JS parity is not cross-language proof

`tests/behavior-parity.test.mjs`, the seeded directive stress cases and the
navigation/preferences traces compare two JavaScript engines. They share
IEEE-754 doubles, `Math.imul`, `Array.prototype.sort`, `localeCompare`,
`Math.random` and engine string behavior. Agreement there cannot establish a
Python runtime's integer width, float evaluation order, collation, key order,
NaN/Infinity behavior or RNG sequence. They remain useful regression oracles for
the JavaScript game, not evidence for this target.

## 8. Planned G2/G3 scope

**G2 — pure rule port (`combineGenomes` pilot).** Implement only the inheritance
arithmetic and the two injected RNG modes (constant `.5` and the pinned 32-bit
LCG at seed `11`), compare against the literal fixtures, exercise the negative
list, and record draw order/count. No species registry, Three.js, asset or app
code is imported.

**G3 — bounded actor/world adapter port.** Implement only the snapshot subset
(`actorVersion`/UID/relations/carried record fields), reciprocal-reference
validation, common restore semantics that preserve live handles, and pruning
with a game-wide UID set. No DOM, renderer, physics body, save file or live app
object is required.

Both remain separately approved steps. G1 stops after creating and validating the
fixture harness.

## 8a. G2 result (M18c)

Baseline `HEAD 7cb8d55`, clean working tree. `genome.py` implements only the
bear/msn subset of `normalizeWeights`, `dominantSpecies`, the seven gene
definitions, `defaultGenome`, `normalizeGenome`, `blendColor`, `combineGenomes`
and `hybridTargetFor`. Mutation stays at `0.04`.

`python3 tools/translation-pilot-py/run.py genome` exits `0`, verifies the pinned
manifest hash `e6712b76…44ecb`, and matches both fixture cases in constant-`.5`
and LCG seed-`11` modes under the exact/`1e-12` policy. Each case consumes ten
draws in registration order: three for colour, then size, rigidity, softness,
stretch, material and two for hop pace. Colour uses `Math.round` semantics
(halves toward positive infinity), not Python's bankers rounding. All six
manifest negatives (draw 9, draw 11, a numeric gene off by `1e-6`, wrong hybrid
target, mutated parent, wrong phenotype) are rejected by the comparator. The
parents are unchanged and no JavaScript, game runtime or third-party package is
imported. Evidence is scratch-only under `.dev-shots/g2/`.

## 9. Stop conditions

Return to the parent/user without starting the next step when any of these is
true:

- The selected target runtime is missing or is not Python 3.14.6.
- A fixture change, precision change or tolerance change is needed. That requires
  a new decision and baseline/hash, not a silent edit.
- A game behavior, API, save-shape or identity decision is unresolved. Fixture
  data cannot settle product behavior.
- The port would need single precision, third-party packages, a game runtime
  dependency, a CI change or a JavaScript execution bridge.
- Physics/rendering/whole-game determinism is claimed from these pilots.
- Required files fall outside the approved write set.

## 10. Related documents

- [`translation-fixtures.md`](translation-fixtures.md) — M18a fixture inventory,
  §4 pilot specification, §5 evidence requirements, §7 coverage/gap table.
- [`../tools/translation-pilot-py/README.md`](../tools/translation-pilot-py/README.md)
  — harness usage and hash rule.
- [`actor-session-lifecycle.md`](actor-session-lifecycle.md) — live-object versus
  UID identity and pruning contract.
- [`scheduler-rng-contract.md`](scheduler-rng-contract.md) — RNG domains and the
  limits of seeded traces.
- [`system-modularity-roadmap.md`](system-modularity-roadmap.md#m18--executable-translation-specification-and-target-pilot-m-m0)
  — M18a–M18d scope and batch gates.
