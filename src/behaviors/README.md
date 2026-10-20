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
- **Open follow-up:** `interactions.js` is not yet the only writer of
  `ai.partner`/`ai.familyTask`; direct assignments remain in `social.js`,
  `mate.js`, `conflict.js`, `glass.js`, `ai.js` and legacy `behavior.js`.
