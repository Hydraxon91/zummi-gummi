# Clock and RNG ownership decision (M13a)

Status: M13a investigation and decision memo only. This document records the
current ownership, the P5 baseline, evaluated options and a recommendation. **No
redesign is approved by this memo**, and no production runtime, test, config,
generated-file, roadmap or package metadata changed in this step.

Scope: the browser scheduler, the Meadow sky/life clock, the global RNG stream and
the save-time fields that carry clock state. Source authoring, physics internals
and cross-engine porting are out of scope.

Baseline: `HEAD = 552c2b5`, working tree clean before this document was added.
Line references below are baseline references and will drift.

Evidence labels used in this memo:

- **Inspected**: the named source or document was read in this run.
- **Sampled**: a grep/scan was used; the result is not a proof of exhaustiveness.
- **Unverified**: not rerun or not established by evidence in this run.

No game runtime or browser check was performed for this memo. The P5 results
quoted below are prior evidence from `docs/scheduler-rng-contract.md`, not
measurements by this run. The one test command executed here was the focused
source-order suite, listed under "Checks for this memo".

## 1. Current ownership map

### 1.1 Browser frame schedule and gates

| Concern | Owner and symbols | Current behavior |
| --- | --- | --- |
| rAF schedule | `animate(now)` in `src/app.js:5886`, first call `requestAnimationFrame(animate)` at `src/app.js:5887`, boot schedule at `src/app.js:7086` | The callback schedules the next frame before doing work. `frameTicks` counts callbacks. |
| Frame delta | `lastNow` (`src/app.js:5878`), `dtMsRaw`, `dtMs`, `dt` | `dtMsRaw = now - lastNow`; `lastNow` is assigned before the hidden/pause returns; `dtMs` is clamped to 1-50 ms. |
| Pause gate | `paused` (`src/app.js:7104`), `setPaused` (`src/app.js:7123`) | `if (paused) return;` after `lastNow` is updated. No frame tick, field update, physics, camera update or render in a paused frame. |
| Hidden gate | `document.hidden` in `animate`, `visibilitychange` listener at `src/app.js:7085` | Hidden returns after `lastNow` is updated; visibility changes also reset `lastNow` and `acc`. This is browser lifecycle, distinct from the pause menu. |
| Freeze gate | debug `frozen` (`src/app.js:5287`) | Stops `stepMeadowAI`, idle hops and the quality governor. It does not stop `frameTick` as a whole, `stepGummyBehavior`, `field.update`, physics, render or the sky clock. |
| Map-active gate | `isMeadow()` (`src/app.js:109`), `activeWorld.mapId`, `field.update` call at `src/app.js:5902` | `field.update` runs only for the Meadow. Studio does not advance the sky clock through this path. |
| Meadow tick | `frameTick(dt)` (`src/app.js:5420`), `stepMeadowAI(dt)` (`src/app.js:5396`) | `stepMeadowAI` returns when the map is not the Meadow, when `field` is absent, or when `frozen`. Food, AI, life, Glass, shove handling and locomotion run in source order. |
| Fixed physics | `FIXED_DT` (`src/app.js:195`), `MAX_STEPS` (`src/app.js:197`), `acc` (`src/app.js:5879`), `physicsStep` (`src/app.js:1752`), accumulator at `src/app.js:5911-5914` | Accumulates the clamped frame `dt`, runs 1/60 s steps up to eight per frame, then resets the accumulator if it would exceed the ceiling. |
| Harness cadence | `simulateSeconds(sec, rebuildEverySubsteps)` (`src/app.js:7257`), exposed as `__gummy.sim` | Runs `round(sec / FIXED_DT)` physics steps; every fourth substep calls `frameTick(FIXED_DT * 4)`. It skips `field.update`, sky advancement, surfaces, camera, effects and render. |

Two cadences must remain distinct:

- `frameTick` receives the variable clamped frame `dt` (1-50 ms) on the normal
  path.
- Physics receives fixed `1/60` s steps.
- `simulateSeconds` calls `frameTick` at a synthetic 4/60 s cadence, not once per
  physics step. It does not itself check the active map: `stepMeadowAI` still
  returns for a non-Meadow map, while the other `frameTick` work can run. This is
  a harness-only path.

P5 documents this split in
[scheduler-rng-contract.md](scheduler-rng-contract.md#frame-path).

### 1.2 Meadow sky clock and saved visual time

| Concern | Owner and symbols | Current behavior |
| --- | --- | --- |
| Clock state | `createSky` (`src/sky.js:202`); `hours`, `totalHours`, `dayIndex`, `auto`, `speed` (`src/sky.js:592-596`) | One authoritative hour accumulator. Initial `hours = 6.8`; `dayIndex` starts at 0; `auto` starts true; `speed` starts 1. |
| Day length | `DAY_SECONDS` (`src/sky.js:9`) | 600 real seconds per in-game day at 1x. |
| Advancement | `sky.update(dt)` (`src/sky.js:697`) | When `auto`, `totalHours += dt * 24 / DAY_SECONDS * speed`; `hours = totalHours % 24`; `dayIndex` follows the day boundary. Visual time (`stars.rotation.y`, cloud time, aurora time) advances regardless of `auto`. |
| Visual update caller | `field.update(dt, activeBears)` (`src/field.js:2620`), `if (sky) sky.update(dt)` (`src/field.js:2621`) | Sky advances first, before wind, horizon and the remaining field systems. Called from `animate` only when the Meadow is active. |
| Read-only getters | `hours`, `day`, `totalHours`, `auto`, `speed`, `look`, `exposure`, `night`, `fogColor`, `sunDir`, `moonDir` | Getters only. `sunDir` and `moonDir` return clones. |
| Mutators | `setTime`, `setDay`, `setAuto`, `setSpeed`, `setLook`, `setVisible`, `setShadows`, `setCloudsVisible`, `setMistOverride` | `setLook` sets the hour, disables auto, and applies palette/mist/exposure. `setTime` clears a named look. |
| In-memory per-map snapshot | `worlds.field.time`, `worlds.field.auto`, `worlds.field.speed` in `src/world.js`; written by `saveCurrentWorld` (`src/app.js:6194`, clock fields at `src/app.js:6208-6210`) | Leaving the Meadow stores the hour, auto flag and speed. |
| Map return | `applyMapVisuals` (`src/app.js:6217`), restore at `src/app.js:6231-6233` | Restores `time`, `auto` and `speed`. A saved named look, if present, wins over the stored hour and disables auto (`src/app.js:6234-6241`). |
| Save payload | `savedSkyState` (`src/app.js:6424`), `buildSavePayload` (`src/app.js:6478`), `sky` field at `src/app.js:6487` | Saves `hours`, `day`, `auto`, `speed` and the named look. `worlds.field.time` is separately saved through `worldSaveState`. |
| Save restore | load path around `src/app.js:6569-6584` | Restores a saved look or time/auto/speed, then applies `sky.day` when finite; mirrors the values into `worlds.field`. |
| New Game | `resetNewGame` (`src/app.js:6600`), reset at `src/app.js:6617` and `src/app.js:6629` | Resets the field snapshot to 07:00, auto true, speed 1 and applies the same to the sky. |
| UI | `syncAeroUI`/settings controls around `src/app.js:4791-4813`, `setMeadowTime` (`src/app.js:6827`), `toggleMeadowAuto` (`src/app.js:6835`), `cycleMeadowSpeed` (`src/app.js:6843`) | UI reads the getters and mutates through the sky API; it also mirrors changes into `worlds.field`. |

The saved clock has two layers: the per-map quick-resume snapshot in
`worlds.field`, and the save payload's `sky` record. The named look is also kept
under `SKY_LOOK_KEY` (`gummy.skyLook`, `src/app.js:3894`). These are
presentation/restore values; none is a separate simulation clock.

`sky.hours` is consumed by both presentation and behavior:

- presentation: `effects.setTimeOfDay(sky.hours)` and the effects object,
  UI clock/slider, sky palette, `field.js` fireflies/visual phases, `sunlight.js`
  through the injected sky object;
- behavior host: `getHours` and `getDay` callbacks, listed next.

### 1.3 Global RNG and behavior resolution

| Concern | Owner and symbols | Current behavior |
| --- | --- | --- |
| Native reference | `nativeRandom = Math.random` (`src/app.js:37`) | Used to restore the original function. |
| Seed | `__gummy.seed(value)` (`src/app.js:7271`) | Replaces `Math.random` with a 32-bit LCG: `state = (imul(state, 1664525) + 1013904223) >>> 0`. Finite input is floored and wrapped; zero becomes 1. Non-finite restores native and returns `null`. |
| Unseed | `__gummy.unseed()` (`src/app.js:7284`) | Restores `Math.random = nativeRandom` and returns true. |
| Behavior host | `createBehavior` call at `src/app.js:6936`; `rng: () => Math.random()` at `src/app.js:6956` | The callback resolves the current global function at call time, so `g.seed()` and `g.unseed()` affect behavior-engine draws. |
| Behavior engine | `createBehavior({ rng = Math.random })` (`src/behaviors/engine.js:86`), context construction at `src/behaviors/engine.js:210`, `api.rng` at `src/behaviors/engine.js:1917` | The resolved callback is carried in `contextFor` and exposed to modules. P5's source-order test guards the callback form. |
| Clock inputs | `getHours: () => (sky ? sky.hours : 12)` and `getDay: () => (sky ? sky.day : 0)` at `src/app.js:6940-6941`; engine `hoursNow`/`dayNow` at `src/behaviors/engine.js:341-349` | Behavior reads the sky clock through injected callbacks; it does not import `sky.js`. |
| Other injected readers | Glass `getHours` at `src/app.js:7072`, consumed at `src/glass.js:132`; departure hook `getTime` at `src/app.js:6963` | These are host-supplied read-only callbacks, not separate clocks. |
| Debug read | `__gummy.map()` (`src/app.js:7665`) | Returns `{ hours, auto, speed }` from the sky, plus map/roster state. |
| Glass RNG exception | `glassEngineRng` in `src/behaviors/config.js:34`, use in `src/glass.js:321-323` | Off by default, so `insideT` uses direct `Math.random`; when on, it routes through the engine `rng`. It still resolves the global stream. |
| Directive RNG exception | `createDirectiveSystem({ rng = Math.random })` (`src/behaviors/directives.js:22`), draw at `src/behaviors/directives.js:161`; app `createBearAI` call at `src/app.js:6985` does not pass `rng` | The default captures the function value at construction. The directives module comments that this is a separate stream ("quirk 18"). This run did not test the draw order or seeding consequences. |

The important distinction is between replacing the global function and holding a
reference to it. Direct `Math.random()` calls follow `g.seed()` / `g.unseed()`;
a captured reference does not. The behavior engine is deliberately on the dynamic
side. The directive stream is a documented exception; P5's source-order test does
not characterize it.

Most direct `Math.random` call sites consume the one global stream. A sampled
count finds such calls in `app.js` (84), `glass.js` (15), `field.js` (10),
`wind.js` (7), `life.js` (3), and one each in `launcher.js`, `food.js`, `dna.js`,
`behavior.js` and `ai.js`. These are file counts, not a call-graph inventory, and
they do not identify which draws occur per frame.

Consumers of the global stream include Bear AI/behavior, Glass, Gummy behavior,
field visuals and particles, births, fireworks, camera shake and other app
systems. The field also has a local deterministic layout RNG (`rng(seed)` in
`src/field.js:50`), used for authored placement. That is a local generator, not a
general per-system stream and not a substitute for the behavior RNG.

### 1.4 Wall-clock and Date usage

| Usage | Location | Classification |
| --- | --- | --- |
| rAF timestamp | `animate(now)` and `lastNow` | Simulation frame delta source. |
| Pointer/grab decay | `frameTick` pointer decay (`src/app.js:5427`), Glass grab timing (`src/glass.js:493`, `511`, `554`, `1083`) | Input timing that can influence throws/coasting; gameplay-adjacent presentation. |
| Profiling and budgets | `src/ai.js:65`, `128`; app surface/perf timing; `src/msn.js:609`, `680` | Diagnostics only. |
| Visual phase | `src/field.js:2650`, `2659`, `2666`, `2765`; `src/launcher.js:629`, `632` | Presentation only. |
| Save metadata | `savedAt: Date.now()` (`src/app.js:6485`), `Date.now()` fallback in `src/save.js:90`; `new Date(ts).toLocaleString()` (`src/app.js:6681`) and export filename (`src/app.js:6761`) | Save metadata and formatting, not simulation time. |
| Day variation | `dayHash` in `src/sky.js:611` | Deterministic hash of `dayIndex`; no wall clock, no RNG draw. |

The inventory above is **Sampled** by grep. It is enough to reject a claim that
every wall-clock read is purely presentational (grab decay is a counterexample),
but it is not an exhaustive audit of timing reads.

## 2. What P5 already establishes

Use [scheduler-rng-contract.md](scheduler-rng-contract.md) as the baseline rather
than restating it.

| P5 section | What it fixes | Evidence in P5 |
| --- | --- | --- |
| [Frame path](scheduler-rng-contract.md#frame-path) | `animate` order: schedule, frame counter, delta, `lastNow`, hidden/pause returns, clamp, `frameTick`, Meadow field update, fixed accumulator, presentation/render. Also `stepMeadowAI` order: food, Bear AI, life, Glass, shove, locomotion. | Source-order test `animate preserves pause gates, frame work, field work and fixed physics order`; `frameTick and stepMeadowAI preserve Bear before Glass and food before locomotion`. |
| [Clock domains](scheduler-rng-contract.md#clock-domains) | Frame schedule, frame delta, fixed physics, sky clock, simulated day, save metadata and harness cadence are separate domains. | Contract table and clock formula. |
| [Pause, hidden and freeze](scheduler-rng-contract.md#pause-hidden-and-freeze) | Pause/hidden stop the frame path; freeze is narrower and does not stop the sky clock. | Live clock checks plus source-order guard. |
| [Inactive map and return](scheduler-rng-contract.md#inactive-map-and-return) | 220 ms switch delay plus 260 ms guard; leaving saves `time/auto/speed`; Studio does not call `field.update`; return restores the snapshot; a saved look wins. | Live checks on a disposable profile. |
| [`__gummy.sim()` bypass](scheduler-rng-contract.md#__gummysim-bypass) | Synthetic physics plus periodic `frameTick`; no field update, sky advancement, surface, camera, effects or render. | Source-order test `simulateSeconds skips host field work and advances frameTick on the fourth substep`; P5b controlled trace. |
| [RNG ownership](scheduler-rng-contract.md#rng-ownership), [seeding hooks](scheduler-rng-contract.md#seeding-hooks) | One global stream, LCG seed/unseed, behavior callback resolution, no whole-game determinism guarantee. | Source-order test `the behavior host resolves the global RNG at call time`; controlled seeded trace. |
| [Glass defaults](scheduler-rng-contract.md#glass-defaults) | Glass follows the Meadow scheduler; `glassEngineRng` off uses the global stream, on routes through the engine callback; no independent stream. | Prior P5 inspection. |
| [Harness evidence](scheduler-rng-contract.md#harness-evidence) | 5/5 source-order tests; P5 close reported 352 Node tests and 68 HTTP smoke checks. Controlled run: seed 1234, `auto=true 7 -> 7`, behavior ticks `0 -> 38`, 43 overlap frames with `bear<glass` (first frame 1), totals `bear 144 / glass 146 / field 48`, 92 control draws, 0 frozen draws. | Prior P5 results, not rerun here. |
| [Limitations](scheduler-rng-contract.md#limitations-and-unverified-criteria) | No cross-engine determinism, no frame-rate-independent determinism, fixed physics does not make the whole game deterministic, seeded traces are conditional, no numerical catch-up bound, no screenshots. | Contract limitations. |

The harnesses are `tests/scheduler-rng-contract.test.mjs` (source-order) and
`scripts/scheduler-rng-characterization.mjs` (controlled seeded trace plus live
clock checks). The controlled mode suppresses rAF, wraps `Math.random` in an init
script and reseeds it after boot, and labels draws by source stack; the live mode
uses normal rAF and equality or direction gates, not an exact timing model.

P5 also establishes the draw-order guard that any clock/RNG work must preserve:
overlapping Bear/Glass frames stay `bear < glass`, the frozen window removes
draws, and fresh profiles with the same seed/cadence produce identical owner
traces and totals. That is characterization, not a redesign mandate. P5's
[change policy](scheduler-rng-contract.md#change-policy) explicitly does not
authorize clock extraction, RNG-stream separation, scheduler redesign or changed
save/debug semantics.

## 3. Options and tradeoffs

### A. Retain current ownership, no code change

- **Problem it solves:** none directly; it preserves the measured P5 frame order,
  gates, draw owners/counts and save behavior.
- **Risks:** the sky singleton and direct `sky.hours` app reads remain; the global
  RNG stream remains shared between visuals and decisions; future modules could
  copy direct reads or capture `Math.random`. These are maintainability risks,
  not observed runtime failures.
- **Evidence required:** P5 contract plus a consumer inventory showing no missing
  read path. This memo's inventory found no consumer outside the existing
  callbacks.
- **Classification:** decision, not redesign. The smallest option consistent with
  the evidence.

### B. Narrow read-only clock query/interface without moving advancement

- **Problem it solves:** a consumer that needs `hours`/`day` but should not import
  `sky.js` or receive the whole sky object. It could expose a small
  `{ hours, day }` query while `sky.update` remains the only advancer.
- **Risks:** a second read path can diverge from `getHours`/`getDay` semantics;
  callers may assume the query advances time or caches a stale hour; visual hours
  and simulation hours could be confused; an added interface without a consumer is
  dead abstraction. If it wraps existing getters, behavior risk is low, but test
  coverage and ownership documentation still need to name it.
- **Evidence required:** a named concrete consumer that cannot use the existing
  `getHours`/`getDay`/`getTime` callbacks; explicit semantics for pause, hidden,
  freeze, Studio and saved looks; proof that `sky.update`/`field.update` remains
  the sole advancement path; source-order test updates if call sites move; no
  save or draw-count change.
- **Classification:** mechanical only if it is a pure adapter over existing
  getters with no advancement or behavior change. As a new abstraction without a
  consumer it is a design decision and premature.

Note that a narrow read seam already exists in practice: the behavior engine,
Glass and the departure hook receive host callbacks rather than importing
`sky.js`, and `__gummy.map()` exposes `hours/auto/speed` for diagnostics. This
memo found no source consumer that these paths fail to serve.

### C. Split sky visual time from simulation time

- **Problem it solves:** `sky.hours` currently drives both behavior day/night and
  celestial presentation. A split could let visual time advance or freeze
  independently of the simulation hour, for example during a saved named look or
  while behavior is frozen.
- **Risks:** changes behavior inputs (bedtime, wake, stargazing, mood, history,
  births, stars), UI, effects, save shape and map-return restoration. It creates
  two clocks whose mapping must be defined. `sky.update` currently advances visual
  time even when `auto` is false; splitting would require deciding whether that
  stays true. This is a cadence/semantic change, not a refactor.
- **Evidence required:** a written two-clock model and mapping; save schema and
  migration/compatibility decision; pause/hidden/freeze/Studio expectations; all
  behavior and presentation consumers enumerated; new P5/parity tests and likely
  visual captures. Existing P5 order/draws must not be assumed preserved.
- **Classification:** design decision and out of scope for M13a. No current
  consumer requires it.

### D. Isolate visual RNG or introduce independent RNG streams

- **Problem it solves:** visual draws currently consume the same global stream as
  behavior decisions, so seeded behavior traces depend on visual code and draw
  order. A future visual feature can shift behavior outcomes even when gameplay
  logic is unchanged.
- **Risks:** changes seeded sequences, parity baselines and possibly gameplay
  outcomes; every consumer must be assigned to a stream; `g.seed`/`g.unseed`
  semantics and harness expectations must expand; existing documented exceptions
  (directives, field layout, Glass flag) show that partial separation already
  exists and is not uniformly characterized. A per-frame stream split could
  change draw counts.
- **Evidence required:** exhaustive draw-site inventory by owner and cadence; a
  stream-assignment matrix; before/after seeded trace diffs; explicit approval
  that changed sequences are acceptable; updated P5/parity tests and reset/debug
  semantics; confirmation that no save field changes are needed.
- **Classification:** design decision. A read-only inventory would be mechanical,
  but no stream split is approved here.

### E. Fixed-step gameplay or other scheduler redesign

- **Problem it solves:** variable `frameTick` dt and rAF cadence make behavior
  timing frame-rate dependent. A fixed gameplay step could improve determinism
  and cross-device consistency.
- **Risks:** large gameplay and balance change; behavior, physics, input sampling,
  save elapsed-time semantics, performance and all existing parity expectations
  change. It may conflict with the deliberate split between fixed physics and
  variable behavior ticks documented by P5.
- **Evidence required:** a new scheduling design, approved expectations, migration
  and compatibility decisions, fixed-step fixtures, long parity runs, performance
  measurement and new P5 coverage. A parity waiver is not sufficient.
- **Classification:** out of scope / major design decision. Not justified by the
  current evidence.

## 4. Recommendation

**Recommend option A: retain current ownership and close M13 without redesign.**

Reasons:

1. No concrete consumer was found for a new clock interface. The behavior engine,
   Glass and the departure hook already read the clock through injected
   `getHours`/`getDay`/`getTime` callbacks. `__gummy.map()` provides a diagnostic
   read. No module outside `src/app.js` imports the clock module; `src/field.js`
   receives the sky object and advances it. The other `sky.js` imports are for
   `REFLECT_LAYER`, not time.
2. A new read-only wrapper would duplicate existing getters without changing a
   behavior or addressing an observed failure. It would add a second naming and
   documentation surface.
3. Options C, D and E change cadence, stream assignment or behavior inputs. None
   has a concrete consumer or an observed defect in the inspected evidence.
4. P5's frame order, pause/freeze/Studio gates and Bear-before-Glass draw order
   stay intact with no code change. The global stream and save fields remain
   compatible.

This is a recommendation to the parent/reviewer, not an approval of even a
mechanical follow-up. The parent owns roadmap status and may close M13 with this
decision recorded.

A future narrow read-only clock query (option B) would be justified only when all
of the following hold:

- a named consumer outside `src/app.js`/`src/sky.js` needs `hours` and/or `day`;
- that consumer cannot use the existing injected callbacks or the `__gummy.map()`
  diagnostic read without importing renderer/three.js state;
- the query reads the same values as the behavior host, holds no cache and cannot
  advance time;
- pause, hidden, freeze, Studio and named-look behavior are documented and
  consistent with P5;
- `sky.update` called from `field.update` remains the only advancement path, and
  save fields/order/draws are unchanged;
- the change and its consumer test receive explicit approval.

## 5. Decision gates

Any of the following is a new decision, not a mechanical cleanup. Each requires
new expectations, explicit approval, a migration/compatibility decision where
state is affected, and new P5/parity evidence. P5 is not a waiver.

| Change | Additional gates |
| --- | --- |
| Changed frame cadence (rAF delta/clamp, fixed accumulator, `frameTick` cadence, `simulateSeconds` cadence) | New scheduling expectations; behavior/physics parity; interruption and catch-up evidence. |
| Independent RNG stream or stream reassignment | Draw inventory; seed/unseed API decision; before/after sequence approval; parity/test baselines. |
| Split sky visual time from simulation time or a new clock owner | Two-clock model; save schema/migration; map, look, pause/freeze/Studio semantics; behavior and presentation consumer evidence. |
| Fixed-step gameplay or other scheduler redesign | New design approval; gameplay balance and input evidence; performance measurement; long parity; migration. |
| Changed save-time semantics (`savedAt`, `sky.hours/day`, `worlds.field.time/auto/speed`, `gummy.skyLook`) | Save format/version and backward-compatibility decision; round-trip and old-save tests; map-return and New Game evidence. |
| Changed pause/hidden/freeze/map-active gates | New gate expectations; live clock/behavior checks; P5 source-order updates. |

## 6. Follow-ups and unverified items

If option B is later approved:

- enumerate every clock consumer and show why the existing callbacks are
  insufficient;
- define the query shape and read-only guarantees;
- add a consumer-level test plus a source-order guard that `sky.update` stays in
  `field.update`;
- verify pause/hidden/freeze/Studio and saved-look behavior.

If option C is later approved:

- write the two-clock model, mapping and save migration;
- test behavior day/night boundaries, named looks, map return, pause/freeze and
  New Game;
- rerun P5 and the affected parity matrix.

If option D is later approved:

- inventory every `Math.random` draw site by owner, cadence and frame phase;
- assign streams and seed/reset semantics;
- diff seeded traces and obtain explicit approval for changed sequences;
- extend P5/parity coverage. The directive RNG exception and the field layout RNG
  are existing precedents that must be included in that inventory.

If option E is later approved:

- approve the new cadence and gameplay expectations first;
- build fixed-step fixtures, measure behavior/physics cost and rerun long parity.

Unverified today:

- No live browser or runtime check was run for this memo.
- P5's controlled seeded trace, live clock checks and 352 Node/68 smoke results
  are prior evidence quoted from the contract, not independently rerun.
- The `Math.random` consumer counts are grep counts, not a call-graph or
  per-frame draw inventory.
- The directive RNG capture and its seeding consequences were source-inspected
  but not tested; P5 does not cover that separate stream.
- The wall-clock/Date inventory is sampled; it does not prove every timing read is
  presentational.
- No cross-engine or frame-rate-independent determinism is established.
- No visual screenshot or browser capture is part of this memo.
- No save migration was exercised because no runtime or save code changed.

## 7. Cross-links

- [Scheduler and RNG contract](scheduler-rng-contract.md) — P5 baseline for frame
  order, gates, clock domains, RNG and limitations.
- [System ownership and extension contracts](system-ownership-contracts.md),
  especially "Scheduling, clock and RNG" — current owners and extension limits.
- [Actor and session identity/lifecycle contract](actor-session-lifecycle.md) —
  save/load, map despawn and New Game interactions with clock restoration.
- [Future-system admission checklist](future-system-admission.md), especially
  "Time domain" and "Persistence" — questions a new system must answer before
  reading or advancing time.
- [System modularity roadmap](system-modularity-roadmap.md) — M13 scope, batch A
  and the conditional redesign gate.
- [Behavior modules README](../src/behaviors/README.md) — feature flags and the
  documented directive/Glass RNG quirks.

## Checks for this memo

- **Inspected:** the source and documents cited above.
- **Executed:** `node --test tests/scheduler-rng-contract.test.mjs` — 5/5 pass
  (source-order only; no runtime or browser).
- **Whitespace:** `git diff --check` reports no errors (no tracked changes);
  `grep -nE '[[:blank:]]+$'` and a tab scan find no matches in this document;
  `git diff --no-index --check /dev/null docs/clock-rng-decision.md` reports no
  whitespace errors. Its exit status is 1 only because the file is new/different.
- **Links:** all 19 local link targets resolve relative to `docs/`.
- **Source symbols:** the exact source symbols cited in this memo were checked
  with `grep -F` against `src/` at the baseline; all were found. Section anchors
  were checked against their target headings.
- **Working tree:** `git status --short` shows only
  `?? docs/clock-rng-decision.md`.
