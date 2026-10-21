# Behavior modules

The Meadow runs one behavior engine for Bear, Gummy and Glass. The modular
engine in `engine.js` is the default. The legacy oracle in `src/behavior.js`
remains selectable with `?behaviors=legacy` or `engine: 'legacy'` and is kept
in parity by the harness.

## Layout

| File | Owns |
| --- | --- |
| `index.js` | facade and `?behaviors=` selection (`modules` default, `legacy` opt-in) |
| `engine.js` | tick order, needs, coverage, module registry, public `api` |
| `config.js` | layered config: module defaults → race profile → actor → runtime |
| `module.js` | `defineBehaviorModule` contract and freezing/validation |
| `wander.js` | `wander` and the ordered opportunity pipeline |
| `rest.js` | `seekHome` / `sleep` |
| `forage.js` / `water.js` | food and water seek/eat/drink |
| `social.js` | seek/invite/social/decline/visit |
| `mate.js` | seek/mate |
| `conflict.js` | contested food and conflict |
| `hive.js` | hive seek/raid |
| `flee.js` | hive sting response; exits to `seekFood` (quirk 9) |
| `follow.js` | baby/parent follow |
| `stargaze.js` | Glass stargazing |
| `family.js` | family meals, lessons and playdates |
| `directives.js` | player directive queue/refusal/apply, separate RNG |

`src/behaviorprofiles.js` holds race data. The capability modules (`hive`,
`conflict`, `directives`, `stargaze`) are declared as
`modules.<id>.{ enabled, params }`; a derived flat view keeps the legacy engine
working. Other balance blocks (`wander`, `needs`, `social`, …) stay flat.

## Add a behavior

1. Define a module with `defineBehaviorModule`:
   - `id` and `states` (the `ai.state` values it owns);
   - `activeStates` for states where the top-level `think()` must not run
     (the engine derives its suppression set from these);
   - `defaults: { enabled, params }`;
   - ordered `opportunities` (`order` is the existing pipeline position, and
     `canRun` must not draw RNG);
   - `think`, `tick`, `interrupt` and other hooks as needed.
2. Register it in `engine.js` with `registerModule(...)`.
3. Read race values from `ctx.p`; do not merge config per tick.
4. Add the module to `MODULE_DEFAULTS` in `config.js` if it has a profile
   capability block.
5. Add pure tests for its gates/outcomes and a scenario pack if the branch is
   rare in open-world runs.
6. Run the parity gates below. A new state or opportunity must show up in the
   coverage report before it is accepted.

## Add a race

1. Add the species definition in `src/species.js` (cast/breed groups, rig,
   capabilities, assets).
2. Add a behavior profile in `src/behaviorprofiles.js` with `id`, `species`,
   `kind`, balance blocks and `modules` capabilities. Clone an existing profile
   only for a deliberate zero-divergence start; deep-copy nested data.
3. Add the race to `RACE_SPECIES` and `RACES` in
   `scripts/behavior-parity.mjs` and give it a scenario if its branches are
   species-specific (as Glass stargazing is).
4. Add the species to the roster/asset tests and run
   `node --test tests` plus the browser regression.
5. Do not route a new race through the BEAR fallback; the fallback is only for
   unknown species and logs one warning.

## Personality (off by default)

`personality` is a modules-engine feature flag. It is **off by default** and is
ignored by `?behaviors=legacy`.

Three axes, each `0..1` and neutral at `0.5`: `bold` (shy → bold), `greed`
(generous → greedy), and `curiosity` (homebody → curious). Founders receive
deterministic FNV-1a hash values in `0.15..0.85` from `species|uid|axis`; this
draws no RNG, so attach-time draw counts are unchanged. Enabling the feature
therefore changes existing actors' behavior: hashed founders are **not**
neutral. Children inherit via `blendTraits` (parent mean + ±0.06 per axis,
clamped `0.02..0.98`); those three draws occur only when the flag is on and
after the existing birth draws.

The bounded offsets are documented in `traits.js`; Glass keeps
`wander.longChance` at 0, so bold/curiosity never create zero-length long
wanders. Because Glass cannot use long wander legs, its curiosity short-wander
span uses a 2× step so the effect is measurable rather than inert. Personality
is applied once in `config.resolve()`, cached like every other per-actor layer,
and invalidated when traits change.

Trait-free actor records stay `actorVersion: 2` for older-build compatibility;
records with traits use `actorVersion: 3`; records carrying mourning use
`actorVersion: 4`; a baby carrying a guardian uses `actorVersion: 5`; and any
record carrying an interaction bond delta uses `actorVersion: 6` (mourning,
traits and a guardian may ride along). `guardianUid` is stored only on baby-stage
actors and never rewrites `parentUids`. Old saves load without traits and get the
same hashed founder values once personality is enabled.

## Mood (off by default)

`mood` is a modules-only, **off-by-default** derived layer. It is not stored in
actor saves. `ai.mood`/`ai.moodBucket`/`ai.moodAt` are runtime-only and are
rebuilt from needs/bonds/history after load or map switch. The engine computes a
target at 4 Hz, smooths it with an 8 s time constant, quantizes to 0.05, and
invalidates the actor's config only when that bucket changes. No RNG is used.

Mood offsets stack after trait offsets and share the same clamps. Neutral mood
is an exact no-op; Glass long wanders stay disabled. Only existing history
kinds contribute (born, mated, child, meal, lesson, taught, playdate, visit,
stage, home, moved, bond); there are no conflict/sting history kinds. Thought
bubbles use the derived mood for a tint only, via a lazy `plan().mood` field.
`?behaviors=legacy` ignores mood.

## Departure hook (off by default)

`departures` is a modules-only, runtime-only capture layer. It records a
departure before the actor is detached and before `pruneActorRefs` runs, using
`bondOf` for every active survivor. Causes are `removed` and `stars`; `stars`
requires `oldAge`, `starvation` or `sting`. Ceiling culling reports `removed`
but does not mourn until a later module is approved. Map switches, new games
and save restoration are teardown, not departures.

Snapshots live in a `WeakMap` keyed by survivor and contain no save fields.
The hook consumes no RNG. `?behaviors=legacy` and the default off state are
inert.

## Stars / farewells (off by default)

`farewells` is the modules-only master switch, with independent `starsOldAge`,
`starsStarvation` and `starsStings` causes. The app day is **600 seconds**; the
parity harness uses 240. Old age uses a deterministic uid/species hash for a
15-25 game-day lifespan after adulthood and compares it with the saved `age`;
there is no new stage. Starvation needs 120 seconds at hunger >= 0.95 and the
unchanged health floor of 1, followed by a 30-second fading timer. Stings only
shorten an already-fading actor's timer and only at health 1.

A fading actor shows the lazy `plan().reason` text “feeling faint”. Eating or
drinking (including a family meal) clears fading. A player rescue during
old-age fading grants a one-game-day reprieve; ordinary eating does not.
Pregnant actors, sole adults with a baby-stage household child, the
`min(6, ceiling)` population floor, the last actor of a species, and a runtime
`stay` override block departure. A blocked departure clears fading and retries
after one game day, so it never leaves a permanent faint bubble.

Fading is runtime-only and absent from actor saves; timers rebuild empty after
load. The terminal departure is irreversible once committed: existing pair and
food/water claims are released before the glow/rise/fade visual starts. Stars
are transient objects under the sky group, queued until night, positioned and
tinted only from a uid hash. No new history kind, no save-version change, and no
RNG are used. `?behaviors=legacy` leaves farewells disabled.

## Mourning (off by default)

`mourning` is a modules-only, **off-by-default** layer triggered only by a
committed stars farewell. A survivor qualifies when they are immediate family
(parent/child/sibling) or have a bond of at least `0.18` to the departed actor.
Closeness sets both the initial sadness and its duration: `0.2` days at the
floor up to `14` days for an exceptionally close bond. Family without a bond
still gets a small floor; distant acquaintances are unaffected.

Each record stores the departed uid/name/species, start day/hour, absolute
`untilDay`, duration and closeness. Records are **per saved actor**, so Game 1
does not inherit Game 2's grief; a new game starts clean and loading restores
only that save's records. Expired records are pruned at the first update after
their deadline. Mood reads a bounded mourning penalty (`<= 0.55`), and grief
does not change needs, health or departure eligibility.

Successful social contact between a grieving actor and a close family member
or bonded friend (bond `>= 0.35`) shortens the remaining grief by up to six
game-hours, at most once per game day, clamped to the current time. Nearly
expired grief can therefore end immediately; comfort never extends a deadline.
This layer consumes no RNG and is inert in the legacy engine or with the feature off;
turning Mourning off suppresses the mood penalty and comfort without deleting the
saved records, so re-enabling it resumes the same grief. `actorVersion: 4` records
are emitted only when a mourning list is present.

## Adoption (off by default)

`adoption` is a modules-only, **off-by-default** layer for baby-stage actors with
no surviving parent. A baby is an orphan when no parent is active on its map and
no parent UID appears in the current game's roster for the other map. The active
map uses live actors; an inactive map uses the snapshot taken when it was left.
If the roster cannot be read while the baby has parent UIDs, assignment is
deferred instead of treating the baby as an orphan.

An automatic guardian is a same-species adult. Preference is immediate family
(a sibling sharing stored parent UIDs), then a same-household adult, then an
adult with a bond of at least `0.35`; ties use the stronger bond and then the
lowest UID. A grandparent cannot be recovered while the linking parent record is
absent. Candidates already holding more than two other active baby dependents
are skipped; biological children and adopted babies both count, deduplicated per
baby. A guardian is assigned on the baby's next think, only while it is free of a
pair or family task; with no candidate the baby keeps its normal behavior and
retries after one game-hour. The retry field is created only while the feature is
enabled. Turning the feature off cancels an active guardian follow, preserves
`guardianUid`, and leaves parent-follow and unrelated tasks untouched.

`guardianUid` is separate from `parentUids`; ancestry and home are never
rewritten. It clears when a parent is active again, when the guardian departs or
is no longer a valid adult, and on stage-up. `follow.seek` stays at order 90 but
targets the guardian when no parent is active. Adoption consumes no RNG.
`actorVersion: 5` is written for a baby carrying `guardianUid`; a record that also
has a bond-delta history entry uses version 6. Turning the feature off suppresses
assignment and guardian following without deleting the saved field.

## Interaction history and the relationship view

Completed social pairs, home visits, declined invitations and food conflicts append
to the existing bounded actor history (16 entries); no new save field or actor
version is introduced. Visits use `visit` for the guest and `hosted` for the host,
and declines use `decline` for the inviter and `declined` for the responder.
Interrupted/unfinished visits and interrupted social pairs are not recorded.
The `interactionHistory` feature is off in the engine defaults and enabled by
`app.js` when the relationship panel is available; the parity harness leaves it
off so the legacy oracle has no extra history eviction. Legacy does not write
these module-only history kinds, so the parity comparator also excludes only this
explicit set while still comparing state, needs, bonds, playdates, RNG and the
rest of history. At the 16-entry cap, an interaction record is evicted before a
`lesson`/`taught` record so display logging cannot reopen same-day teaching.
Interaction kinds are not mood inputs; `visit` was removed from `EVENT_WEIGHTS`.
Completed social, visit and conflict records also carry optional
`bondBefore`/`bondAfter` values; a record with a delta is saved as actor version 6
and rendered as a directional before/after percentage.

`relationshipview.js` is the pure read-only model behind the selected-actor
**Relationships** tab. It resolves active and inactive-map records for the current
game, keeps guardian/dependent links separate from ancestry, shows missing records
as unavailable, and never averages asymmetric bonds. Pair-specific recent
interactions come from the selected actor’s own history, so the panel does not
claim a complete shared timeline.

## Config layers

Later layers win:

1. module defaults (`defineBehaviorModule.defaults`);
2. race profile (`modules.<id>.{enabled,params}` or flat balance blocks);
3. per-actor override (`setActorConfig`);
4. runtime override (`setModuleEnabled`, `setModuleParams`, species/actor scope).

The resolved object is cached per actor by config version, so modules never
merge config in the hot loop.

## Quirks

All flags default off. They are documented, not permission to change behavior.

| Flag | Current behavior |
| --- | --- |
| `glassNightWindow` | Glass stargazing uses “outside 09:00–16:00”, not real night. |
| `glassBedtimeMode` | Glass draws night `bedtime`/`wakeTime` despite daytime shelter. |
| `singleDayWindow` | Behavior uses 09:00–16:00; `glass.js` uses 08:00–18:00. |
| `cancelPairStateReset` | `cancelPair` leaves non-listed states selected after cleanup. |
| `matePairOnPathFailure` | `startSeekMate` pairs before the path succeeds. |
| `glassEngineRng` | `glass.js` `insideT` uses `Math.random`, not the engine RNG. |

Other fixed quirks retained by the port: directives use their own RNG stream
(quirk 18); a lesson candidate ignores queued directives (quirk 22); family
tasks use the hardcoded `.28`/`.05`/`2.6` values and quirk 22; follow retries
after 30 s; stargazing uses the outside-09:00–16:00 window. `conflict.damage`,
`conflict.healthFloor` and `conflict.shove` are reserved and are **not** wired.

## Verification

```bash
node scripts/behavior-parity.mjs --days 2 --seeds 1,2,3
node scripts/behavior-parity.mjs --long
node scripts/behavior-parity.mjs --validate
node scripts/behavior-parity.mjs --race glass --scenario glassBaseline
node scripts/behavior-browser-parity.mjs
node --test tests
node scripts/check-port-markers.mjs --expected scripts/port-markers.txt
```

`?behaviors=legacy` and `?behaviors=modules` both run the same browser
regression and Glass suite (`BEHAVIORS=legacy|modules`). The marker list must
stay empty; any `TEMPORARY(port)` marker fails CI.

## Changelog

- **Step 3 (Oct 2026):** facade, layered config, hive module, parity harness,
  coverage and scenario packs. Legacy remained the default.
- **Step 4:** rest, forage, water, wander, social, mate, conflict, follow,
  stargaze, family, flee and directives ported; zero markers; seeded browser
  traces.
- **Step 5:** GUMMY profile split from Bear; modules became the default with
  legacy selectable; approved cleanups; `modules.<id>.{enabled,params}` profile
  reshape; this guide.
- **Personality (Oct 2026):** off-by-default modules-only traits, hash-derived
  founders, inherited children, bounded profile offsets, actorVersion 2/3 save
  split, trait-extreme scenario pack. Enabling it intentionally changes
  existing actors' behavior; hashed founders are not neutral.
- **Mood (Oct 2026):** off-by-default, derived, runtime-only mood with smoothing,
  bounded profile nudges stacked after traits, config-bucket invalidation, and
  mood-tinted thought bubbles. No save fields, no RNG, no death system.
- **Open follow-up:** `interactions.js` is not yet the only writer of
  `ai.partner`/`ai.familyTask`; direct assignments remain in `social.js`,
  `mate.js`, `conflict.js`, `glass.js`, `ai.js` and legacy `behavior.js`.
