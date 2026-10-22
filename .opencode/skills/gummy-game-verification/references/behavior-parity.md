# Behaviour acceptance and parity

Extracted project procedure; use alongside the parent skill's mandatory acceptance
stages and [browser prerequisites](browser-harness.md). Paths are repo-relative.

## Batch acceptance contract

Follow `AGENTS.md` sections 5 (Efficient feature batches) and 6 (Fix-Classification
Gate). Before implementation, map approved requirements to named tests/assertions.
For an interaction, cover eligibility and natural opportunity selection, acceptance
and refusal, exactly-once resource/need/bond effects, essential-needs interruption,
grab/removal/map-switch/disable cleanup, save/load and game isolation, supported
species/representations, plus enabled determinism and RNG accounting. Record deliberate
exclusions and missing evidence explicitly. One bounded approval covers in-scope
mechanical repairs, not new gameplay or retention policies.

Use deterministic fixtures to establish prerequisites, then run the real transition
being verified. Do not count a forced pair/state as proof of eligibility or natural
selection. Verify a failed helper before changing production behavior, and stop on a
reproducible failure rather than retrying until green.

## Module conformance

Before extending a module, inspect its declared configuration support and disable
policy. Distinguish an engine state owner, a config-only capability and a profile-only
behavior; registration in one list does not prove registration in the others.

Validate contracts with both known-good fixtures and deliberate failures: missing
registration/defaults, duplicate IDs/state/opportunity ownership and invalid schemas.
For supported toggles, exercise global, species and actor scope, an unaffected control,
admission/refusal, existing activity completion or cancellation, reciprocal participant
cleanup and re-enable. Use real transitions and observable claims/pairs, not forced
states. Check persistence and RNG when applicable; declare unsupported cases rather
than treating absent tests as conformance. Essential needs retain their own policy.

Run `node scripts/check-behavior-contracts.mjs` and the corresponding Node tests
before reporting registration/configuration consistency. Consult
`src/behaviors/contracts.js` for explicit support limits. Reuse
`tests/helpers/behavior-conformance.mjs` for real scope controls and pair fixtures;
an inventory or config-resolution pass is not admission/cleanup evidence.

Trait/preset additions must preserve trait order, defaults, normalization, inheritance
draw order and old-save migration unless explicitly approved otherwise. Validate input
before normalization can hide malformed definitions. Test presets as opt-in data;
loading their definitions must not enable personality or assign them to live actors.

## Distinct claims

Treat these as separate lanes:

| Claim | Required evidence |
| --- | --- |
| Disabled compatibility | Exact legacy/modules parity with the feature off |
| Enabled reproducibility | Same-seed feature-on traces and actual instrumented RNG draws |
| Functional correctness | Feature-on assertions for outcomes, interruptions and persistence |

Do not describe a feature-off matrix as enabled acceptance, or weaken comparator
coverage to hide a mismatch. Unintended history eviction or timing changes can affect
other readers even when the new metadata is nominally display-only.

## Parity tiers

Use three parity tiers, without repeatedly running the long matrix mid-edit:

1. **Edit loop:** affected Node tests plus one targeted parity case, for example
   `node scripts/behavior-parity.mjs --race bear --days 1 --seed 1` or an existing
   `--scenario` pack. Choose the race/branch affected; do not substitute this for
   all-race review.
2. **Feature review:** `node scripts/parity-matrix.mjs --jobs 2` (two days,
   three seeds, all races). This is development evidence, not long acceptance.
3. **Final acceptance:** once the feature and focused checks are complete, run
   `node scripts/parity-matrix.mjs --long --jobs 2` once, fresh. A subsequent edit
   that invalidates that evidence requires re-verification; unrelated documentation
   changes do not. Resume output never counts as fresh acceptance.

Matrix reports distinguish `fresh`, `tier` and `acceptance`; a fresh short run
must not be described as a long acceptance pass.

Parity iteration: use `node scripts/parity-matrix.mjs --jobs 2` for the two-day,
three-seed, all-race baseline. `--long` retains 20 days × five seeds × three races
and exact per-tick JSON comparison. `--jobs 1` is the low-contention default;
workers keep both engines of each case together. The matrix stops scheduling at
the first mismatch and terminates other workers. Existing targeted branch packs
remain in `behavior-parity.mjs --scenario ...`.

`--resume` is explicitly developmental, never fresh acceptance: completed cases
are reused only with matching source, harness, Node/V8, flags and case options.
Caches live in `.dev-shots/parity-cache/`. `--comparator validate` cross-checks
the candidate structural comparator against JSON each tick; `exact` is experimental
and not the default; the initial projected comparator was slower, while the newer
direct-field implementation passed its long matrix and reference cross-check.
Use `--comparator exact` explicitly to benchmark it. `node scripts/behavior-parity.mjs
--validate --race bear,gummy,glass` also runs that agreement check on both an equal
and a +0.001 perturbed pair, so a pass covers detection and comparator agreement.
Never use reduced tick frequency, larger timesteps or hash-only comparisons as
parity acceptance.

## Feature-specific coverage

Preferences/habits: run `node --test tests/behavior-preferences.test.mjs` for pure
translation fixtures, strict validation, cache freshness, active-time decay,
completion/interruption, RNG reproducibility and actor v9 migration. With the app
served, `node scripts/preferences-test.mjs` verifies real natural stargazing and
learning (no forced entry/completion), disabled freeze/re-enable, save/load,
inactive-map isolation, non-inheritance and another-game restore. These features
are independent, global, modules-only and default off. Keep enabled functional/RNG
evidence separate from the default disabled short/long parity matrices. Pair/claim
effects are not part of this solo-activity prototype; existing survival priority,
activity eligibility and timing remain protected.

Optional activity chooser: `node --test tests/behavior-chooser.test.mjs` covers the
portable proposal rules, RNG-free evaluation, score/tie behaviour, refusal fallback,
essential-need/directive priority, disable cleanup, enabled determinism and save
isolation. With the app served, `node scripts/chooser-test.mjs` verifies real natural
selection with both candidates eligible, the explanation snapshot, both rankings, the
runtime-only decision, disable cleanup and another-game restore. The flag is modules-only
and off by default, so the disabled short/long parity matrices remain the compatibility
lane; run enabled evidence separately. It only reorders existing social/stargazing
slots and adds no save field.

Stars/mourning: `node scripts/stars-test.mjs` covers the farewell lifecycle and
`node scripts/mourning-test.mjs` covers departure, grief, comfort, save/load
isolation and a Glass-survivor round trip. `mourning-test.mjs` exits non-zero when
any recorded check fails, so inspect both the exit code and its report. Both browser
scripts need a served build (`GAME_URL`). Mourning is off by default and
modules-only; browser checks must enable the Farewells master, the stars reason and
Mourning in the Settings panel (or dispatch those change events).
`node --test tests/mourning-determinism.test.mjs` proves same-seed trace identity
with enabled mourning and zero RNG draws for the departure/pruning path.
`node scripts/mourning-profile.mjs` records the focused CPU profile (not a frame
rate); state the observed machine load when reporting it.

Read [species/assets/save](species-assets-save.md) when behavior affects persistence,
actor identity or multiple representations, and [physics/world](physics-world.md)
when it affects movement, navigation or map state. Enabled acceptance cannot be
replaced by an unrelated passing suite.
