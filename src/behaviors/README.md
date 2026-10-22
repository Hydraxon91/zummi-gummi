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
| `contracts.js` | auditable registration/configuration/disable support declarations and inventory checks; not runtime arbitration |
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
| `gifting.js` | physical gift collection, carrying and handover |
| `affection.js` | chat and cuddle pair states |
| `relationships.js` | reconciliation and partnership formation |
| `groups.js` | spaced three-to-five actor group activities |

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

### Configuration and conformance foundation

Declare each engine module or config-only capability in `BEHAVIOR_CONTRACTS`.
`configuration: layered` means defaults resolve through config; `profile-only`
means balance remains in the existing flat profile. `disable` deliberately
distinguishes `finish-current` (mate), `feature-only` (activity feature flags),
`legacy-unverified` (existing capability configuration, not full toggle acceptance)
and `unsupported`. Essential rest/food/water do not acquire generic disable behavior.
These declarations document support; they do not make existing setters stricter or
rewrite dispatch. Do not expose an unsupported module flag as an effective toggle.

Run `node scripts/check-behavior-contracts.mjs`. It inspects the actual engine map
and config IDs, plus the directives config-only capability; duplicate module/state/
opportunity ownership and missing or inconsistent declarations fail. The Node suite
runs the same check and deliberate negative fixtures. An inventory pass is not
functional toggle conformance.

`tests/helpers/behavior-conformance.mjs` provides real layered-config scope checks
with unaffected controls and a real engine/pair fixture. Module-specific tests must
exercise actual admission, in-flight policy, re-enable and cleanup. The mate tests
prove these paths; other policies remain explicitly limited as declared. Validate
global override precedence rather than weakening it to make scoped tests pass.

`defineBehaviorModule` rejects invalid IDs, parameter/default shapes, duplicate
states/opportunities and active states not owned by the module. Existing valid
definitions retain their order and execution semantics. Cross-module inventory
checks run in tooling/tests rather than adding per-tick work.

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
`actorVersion: 4`; a baby carrying a guardian uses `actorVersion: 5`; any record
carrying an interaction bond delta uses `actorVersion: 6`; a giver carrying
`lastGiftDay` alone uses `actorVersion: 7`; and rivalry, partnership or a carried
gift portion uses `actorVersion: 8`; non-neutral activity preferences or learned
habits use `actorVersion: 9` (older fields may ride along). `guardianUid` is stored only on baby-stage
actors and never rewrites `parentUids`. Old saves load without traits and get the
same hashed founder values once personality is enabled.

### Opt-in preset definitions

`TRAIT_DEFINITIONS` is the immutable ordered definition list; `TRAIT_AXES` derives
from it without changing order. Adding an axis still requires approved effects,
inheritance, validation and save-migration work; this foundation adds none.
`definePersonalityPreset` strictly validates complete finite bounded values and
rejects unknown axes before normalization. `PERSONALITY_PRESETS` contains immutable
definitions only, in bold/greed/curiosity order:

| ID | Values | Existing effect emphasized |
| --- | --- | --- |
| `shy` | 0.2 / 0.5 / 0.5 | reduced boldness/social seeking |
| `adventurous` | 0.8 / 0.5 / 0.8 | boldness and exploration |
| `food-motivated` | 0.5 / 0.8 / 0.5 | food-seeking motivation, not a complete generosity model |

Importing these values neither assigns actors nor enables personality. No preset
application UI/API or preset ID persistence is introduced. Opt-in consumers would
use ordinary trait values and the existing cache/save contract; integrating such
assignment is a separately approved change. Founder hashing, normalization and
inheritance remain unchanged. Preferences/habits are the separate layer below;
activity proposals and goals remain future chunks in `ROADMAP.md`.

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

## Preferences and habits (off by default)

`preferences` and `habits` are independent, global, modules-only feature flags.
There is no new settings UI, random founder assignment or automatic preset application.
Stable traits, derived temporary mood, explicitly assigned likes and learned habits
have separate records and lifecycles. Neither preferences nor habits are inherited;
the existing trait axes, founder hashing and inheritance draws are unchanged.

The first supported activity is Glass stargazing. `preferences.js` owns immutable
activity definitions and pure validation/normalization, learning, decay and bounded
offset functions. It accepts plain records and elapsed simulation days, never live
engine objects, wall time, storage, rendering, physics or RNG. `engine.js` is the
host adapter for actors, elapsed `dt / daySeconds` and completion/cancellation;
`config.js` composes trait → mood → activity offsets and owns cached profiles.
The input/output fixtures in `tests/behavior-preferences.test.mjs` are translation
checks for a future Godot implementation, not a promise of JavaScript reuse.

| Rule | Stargazing prototype |
| --- | --- |
| Saved preference | `actor.preferences.stargaze`, `0..1`, absent means neutral `.5` |
| Preference effect | `2 × (preference − .5) × .04` on the existing chance |
| Saved habit | `actor.habits.stargaze`, `0..1`, absent means zero |
| Habit effect | `strength × .02` on the existing chance |
| Learning | +`.1`, capped at 1, once per uninterrupted completed session |
| Decay | −`.05` per active simulated day; host supplies day length |
| Final chance | Existing `0.02–0.25` clamps; effect rounded to 4 decimals |

At the unchanged base chance `.10`, dislike = `.06`, neutral = `.10`, like = `.14`,
and like + full habit = `.16`. Durations, ordered selection, eligibility and survival
priorities stay unchanged; no new selection or inheritance RNG draws are introduced.
Only existing supported/enabled activity sections receive effects. Bear/Gummy do
not acquire stargazing through a preference. Existing module configuration scopes
still resolve before these offsets; the two new feature flags themselves are global,
not per-species/per-actor toggles.

Disable removes that layer's effect immediately. Disabling habits freezes learned
strength and invalidates any current learning token, without cancelling/changing the
existing activity. Re-enable resumes stored effects/decay but cannot reward the
partially observed session. Grab, explicit interruption, detachment, survival exits,
map/save teardown and global AI disable cannot award completion learning. Paused,
inactive-map and offline time do not decay habits. Active sleeping/possessed actors
still accrue simulated time, as needs already do. No pair, claim, bond or resource
effects are added by this prototype.

Runtime setters reject unknown activities, non-numeric/non-finite/out-of-range values
before normalization. Save validation likewise rejects malformed new fields. Sparse
normalization omits neutral preferences and zero habits; old actors get empty records
semantically without adding fields or changing their previous record versions. Only
actors with meaningful saved disposition state emit v9. Older builds cannot read v9.
The save boundary clones records; no module-level UID cache or learning token is saved.
Cache signatures use the same rounded offset as profile composition, so continuous
sub-resolution decay survives saves without rebuilding the profile every frame.

Debug hooks: `__gummy.activityPreference(uid, 'stargaze', value)` assigns a liking;
`__gummy.dispositions(uid)` returns detached values and the resolved chance.
`__gummy.setBehaviorFeature('preferences'|'habits', boolean)` enables either layer.
Assigning a preference while disabled saves the value but has no behavioral effect.
The flags are runtime configuration, not actor-save fields. For verification, run
`node --test tests/behavior-preferences.test.mjs` and, with `launch.py` serving,
`node scripts/preferences-test.mjs`. The browser check observes natural selection
and completion, then save/load, inactive-map isolation, birth and another-game restore.

## Optional activity chooser (off by default)

`activityChooser` is a modules-only, **off-by-default** feature flag; `?behaviors=legacy`
ignores it. With the flag off, `wander.think` calls `social.company` and `stargaze.seek` in
their authored order exactly as before. With it on, the slot `wander.activity` (order 115)
ranks those same two activities instead. No other opportunity is proposed yet.

`proposals.js` owns the portable part: immutable activity definitions, candidate
validation, score summation, ranking and the explanation snapshot. It is plain data in and
records out — no actors, clocks, storage, renderer, physics or RNG. `engine.js` builds
candidates from actors and executes the winner; `social.js`/`stargaze.js` own their
eligibility and score rules.

| Rule | Chooser prototype |
| --- | --- |
| Candidates | `social.company` (order 110), `stargaze.seek` (order 120) |
| Social score | `(need − seekThreshold) / (1 − seekThreshold)`, per axis, max of social/affection, clipped `0..1` |
| Stargazing score | resolved `stargaze.chance / .25`, clipped `0..1` |
| Tie-break | authored pipeline order: social before stargazing |
| Attempts | each ranked candidate is tried once, in order, through its existing `canRun`/`enter` |
| Fallback | unchanged arrival/idling/wandering when nothing starts |

Eligibility mirrors the cheap gates of the owning activity without its random partner
scoring: social requires need, no cooldown and a `canCompany` actor inside
`social.radius`; stargazing requires a supported profile and an open window. Gathering
candidates draws no RNG, changes no cooldown and reserves no partner; admission rolls are
drawn only when a candidate is executed, so batch 2 preference/habit effects apply exactly
once. The chooser runs at the existing think cadence with at most two candidates and one
bounded nearby scan.

Essential needs, family routines, mating, following, existing relationship activities,
gifting and player directives are evaluated before the chooser and remain authoritative.
Only existing eligibility and interruption rules apply to a started activity; disabling the
chooser never replaces an activity already in progress.

The latest decision per actor is runtime-only (`ai.activityDecision`): day, hour,
candidates with eligibility/reason/score/contributions, ranked order, chosen, started,
refused and outcome (`started`, `refused`, `no-eligible`). It is not saved, not inherited
and not shared across maps, and disabling the flag clears it. Debug hooks:
`__gummy.activityProposals(uid)` returns RNG-free candidates and
`__gummy.activityDecision(uid)` returns a detached copy of the last decision. The flag is set
with `__gummy.setBehaviorFeature('activityChooser', true)`.

No new activity, pairing rule, bond/resource effect, UI, save field or actor-record version
is introduced. For verification, run `node --test tests/behavior-chooser.test.mjs` and, with
`launch.py` serving, `node scripts/chooser-test.mjs`. The browser check observes real
selection, both rankings, explanation shape, save isolation, disable cleanup and another
game's restore.

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
has a bond-delta history entry uses version 6, and a persisted gift day uses
version 7. Turning the feature off suppresses assignment and guardian following
without deleting the saved field.

## Gifting (off by default)

`gifting` is a modules-only, **off-by-default** physical gift interaction. An adult
giver with enough health and a low enough hunger/thirst selects a nearby actor
(baby, teen or adult; any species) with hunger above the receiver threshold, then
reserves the nearest safe ripe food source or recoverable dropped portion. The
giver travels to the origin, collects it once into a carried portion, approaches
the receiver and hands it over. Accepted gifts consume the carried identity once,
apply the normal satiation and `forageEatScale` effect, add the configured small
bond amount, record `gift` / `receivedGift` history with bond deltas, and set the
giver's `lastGiftDay`. Refusal before collection leaves the source untouched.

Successful gifts set `lastGiftDay` (`actorVersion: 7` when alone). Carried or
dropped portions and other v8 fields use `actorVersion: 8`. A carried portion is
dropped at the giver's position on interruption, disabling, departure or a map
switch; a recipient refusal after collection also drops rather than destroys it.
Dropped portions remain recoverable by a later giver and stay on their originating
map. Saving a carried portion converts it to a dropped portion on load; active
offers never resume. Critical needs, grabs, departure, feature disable and map
switches release both participants, and unreachable offers time out. Two givers
cannot claim one source. Glass can give as well as receive. The first physical
version supports one carried portion and one successful gift per giver per day;
preferences, multiple servings and a general inventory remain future work.

## Pair activities: chat and cuddle (off by default)

`pairActivities` is modules-only and off by default. Chat is available to every
stage and species; cuddle additionally requires a reciprocal bond of at least
`.35`. Both use the shared pair protocol, travel to the partner, run a timed act,
apply the existing social/affection relief and one bond gain per completion
(chat `.02`, cuddle `.04`), then set a 30/60-second participant cooldown. The
initiator owns the timer and completion effects. Critical needs, grabs, removal,
map switches and disabling the feature cancel the pair. The receiver's refusal is
expressed by ineligibility (busy, unavailable, unhealthy or below the cuddle
bond threshold), not by a punishment. Glass and every soft-body species can chat.

## Rivalry, reconciliation and partnership (off by default)

`rivalry` records a completed conflict as a reciprocal unresolved grievance with
`sinceDay`/`sinceHour`; it adds no new aggression and does not erase itself when
the bond changes. `reconciliation` lets two idle, healthy rivals run a six-second
repair, clear both records and add `.04` bond. Refusal or interruption has no
penalty beyond a 30-second failed-attempt cooldown. `partnership` forms exclusive,
reciprocal adult partnerships from a six-second completion when both directional
bonds are at least `.65`, the species can breed, the pair is opposite-sex and not
immediate family. Partnerships persist through map switches and save/load, do not
auto-end from low bonds, and end through the relationship panel's explicit
separation control or a committed departure. Disabling rivalry/partnership
suppresses new behavior without deleting saved records. These records use
`actorVersion: 8`; contradictions such as a non-reciprocal partner or missing
rival are rejected before load.

## Group activities (off by default)

`groupActivities` is modules-only and off by default. An idle leader claims two to
four nearby idle actors (three to five participants), assigns each a spaced
navigable slot around the group centroid, allows a five-second joining window and
runs a ten-second `groupGather` (adult leader) or `groupPlay` (young leader).
Completion applies existing social relief and one `.01` bond per participating
pair exactly once, then cooldowns all participants for 45 seconds. Leaving removes
only that member; below three participants the group dissolves without effects.
Critical needs, grabs, departure, map switch and feature disable release every
participant. No late joining or parallel scheduler is used.

## Interaction history and the relationship view

Completed pair activities, group activities, social pairs, home visits, declined
invitations, reconciliations, gifts and food conflicts append to the existing
bounded actor history (16 entries). Partner formation/separation are persistent
relationship events and do not consume interaction slots. Interaction records may
recycle only other interaction slots; they never displace a non-interaction
record. If no slot is available, the display event is skipped. This keeps mood,
same-day lesson checks and the non-interaction history sequence identical with
logging on or off. Interaction kinds are not mood inputs.
`bondBefore`/`bondAfter` deltas are saved as actor version 6 (or 7/8 when a gift
day or a version-8 record also applies) and rendered directionally.

`relationshipview.js` is the pure read-only model behind the selected-actor
**Relationships** tab. It resolves active and inactive-map records for the current
game, keeps guardian/dependent links separate from ancestry, shows missing records
as unavailable, and never averages asymmetric bonds. Bond rows carry display-only
directional friendship labels (`acquaintance`, `familiar`, `friend`, `close
friend`); partnership and rivalry rows are separate from ancestry/care. The
partnership section offers the explicit end-partnership action. Pair-specific
recent interactions come from the selected actor’s own history, so the panel does
not claim a complete shared timeline.

## Config layers

Later layers win:

1. module defaults (`defineBehaviorModule.defaults`);
2. race profile (`modules.<id>.{enabled,params}` or flat balance blocks);
3. per-actor override (`setActorConfig`);
4. runtime override (`setModuleEnabled`, `setModuleParams`, species/actor scope).

The resolved object is cached per actor by config version, so modules never
merge config in the hot loop.

The `mate` module is registered in layered config. Disabling it prevents new
courtship selection (including recruitment of a disabled recipient), but existing
courtship/mating completes normally. Re-enabling restores admission. This changes
neither default-enabled behavior nor the physics timestep, and adds no save fields.

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

## Post-gifting expansion

Implemented in this batch: directional friendship labels, persistent rivalry and
reconciliation, persistent partnerships with explicit separation, chat/cuddle,
spaced group activities, and physical gifting with carried/recoverable portions.
These remain optional modules/features and are off by default.

Still planned, each requiring its own design decision and save review:

1. richer group activity variants (tag, dancing, distinct gatherings) and late
   joining policies;
2. gift preferences, multiple servings and a general inventory beyond one carried
   portion;
3. additional reconciliation/comfort interactions beyond the rivalry repair;
4. broader pair-activity variants and deeper friendship-tier effects.

Use the existing opportunity/state/pair protocol for these; do not add a parallel
scheduler or silently redefine bond semantics.
