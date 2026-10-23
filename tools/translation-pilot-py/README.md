# Translation pilot — Python 3.14.6 fixture harness

This directory is the independent G1/M18b target project for the two pilot
fixtures specified in [`docs/translation-fixtures.md`](../../docs/translation-fixtures.md)
§4. G1 is fixture data plus a validator. G2/M18c adds an independent Python port
of the pure `combineGenomes` bear/msn rule exercised against the pinned genome
fixture. The wire/UID adapter remains G3 scope.

## Target decision

The selected target is **CPython 3.14.6, standard library only**. The decision
and its limits are recorded in
[`docs/translation-target-decision.md`](../../docs/translation-target-decision.md).

```sh
/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 --version
# Python 3.14.6
```

`python3` on the development host currently resolves to the same interpreter.
No pip package, game runtime dependency, JavaScript import or CI job is involved.

## Scope

| File | Purpose |
| --- | --- |
| `fixtures/genome_inheritance.json` | Pure `combineGenomes` pilot: parents, constant-RNG `.5` expected values, seeded-LCG seed `11` expected values, draw counts, exact/tolerance policy and deliberate failure negatives. |
| `fixtures/wire_uid.json` | Bounded live-object ↔ saved-UID adapter pilot for records A(1), B(2), C(3): snapshot, validation, apply and prune expectations plus failure negatives. |
| `run.py` | Standard-library CLI that validates schema, provenance, coverage and canonical hashes, self-tests that rejection is real, and runs the G2 genome command. |
| `genome.py` | G2 pure `combineGenomes` port for bear/msn only: normalization, colour blending, gene inheritance, hybrid target and the constant/LCG RNG interfaces. |

G2 (pure-rule port) is **complete**. G3 (bounded adapter port) is **not
started**; the wire/UID adapter function bodies remain a separate decision and
approval gate.

## Usage

Run from the repository root:

```sh
python3 tools/translation-pilot-py/run.py validate
python3 tools/translation-pilot-py/run.py --self-test
python3 tools/translation-pilot-py/run.py genome
```

`validate` exits `0` only when both manifests load, match their declared schema
and provenance, cover their required cases/negatives and match their canonical
hash. It exits `1` otherwise and prints a JSON summary.

`--self-test` loads the manifests, mutates a case and a hash **in memory**, and
confirms that validation rejects each mutation. It never writes the fixtures.
It also rehashes one semantic mutation to prove the schema checks are active
independently of the hash check.

`genome` verifies the pinned genome manifest hash through the same validator,
reconstructs the three fixture parents from `default_genome`, runs both cases
with the constant `.5` RNG and the pinned 32-bit LCG at seed `11`, compares every
field under the manifest exact/`1e-12` policy, checks ten draws and parent
non-mutation, and proves every manifest negative is rejected by the comparator.
It exits `0` only when all comparisons and negatives pass. It imports no
JavaScript, game module, browser API or third-party package.

`--fixture-dir DIR` is a tamper-check aid. It reads both manifest filenames from
`DIR`; it is not a second fixture source of truth.

## Canonical JSON hash

Each manifest has a `manifestHash`. It is computed as:

1. Serialize UTF-8 JSON with the `manifestHash` field omitted.
2. Use `json.dumps(payload, sort_keys=True, separators=(',', ':'))`.
3. Hash the resulting UTF-8 bytes with SHA-256.
4. Write the lowercase 64-character hex digest into `manifestHash`.

Changing any pinned value therefore invalidates the manifest until the hash is
deliberately regenerated. **G2/G3 and later steps must not edit a pinned fixture
without a new baseline and an explicitly recorded new hash.** A target run that
does not match the pinned hash is stale evidence.

## Evidence rules

A future G2/G3 result is acceptable only when it records all of the following:

- **Independent target execution** — the Python command, exit code and output
  are captured; a JavaScript test importing Python, or a result copied from the
  JS oracle, is not evidence.
- **Per-field exact/tolerance policy** — numeric genes and both `hopPace` values
  use absolute `1e-12`; species keys/values, colour, material, `hybridTarget`,
  phenotype, draw count, parent non-mutation, UIDs, key presence and booleans are
  exact. Do not widen a tolerance after a failure without a new decision.
- **Failure negatives** — the listed mutations must be rejected by the target
  comparator; a "passing" perturbation it cannot detect is not a comparator.
- **Provenance** — repository path, source case names, baseline commit, fixture
  date, format constants and the canonical hash are already in each manifest.
  If any pinned input changes, the target result is stale.
- **No JS-vs-JS substitution** — `tests/behavior-parity.test.mjs` and the seeded
  JS traces share one number model and are not cross-language proof.
- **Scratch evidence in `.dev-shots/g1/`** (never committed), inspected rather
  than merely summarized.

## Non-goals

- No game runtime dependency, bundler, package metadata, third-party package or
  CI workflow.
- No JavaScript import/execution. G1 exercises no game rule; G2 ports only the
  bear/msn `combineGenomes` subset, not the whole of `src/dna.js`. The
  `src/actorrecord.js`, `src/family.js` and `src/actorsave.js` ports remain G3.
- No source-authoring changes (AssetWorkshop owns that scope).
- No native physics, Box3D/WASM, metaball, Three.js/rendering, whole-game
  determinism or frame-rate claims.
- No claim that these fixtures cover the whole game, save format or species
  contract. They are the minimal §4 pilot set.
