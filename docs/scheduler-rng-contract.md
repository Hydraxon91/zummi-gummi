# Scheduler and RNG contract

Status: P5d closeout. This document records the scheduler, clock and RNG behavior
observed during P5. It is evidence and guidance, not authorization to extract a
clock, split RNG streams or redesign gameplay scheduling.

## Scope

P5 characterizes the current browser host through source-order tests, a
controlled seeded trace and live browser checks. The contract covers:

- the normal `requestAnimationFrame` frame path;
- the pause, hidden, freeze and inactive-map gates;
- Meadow clock advancement and map-return restoration;
- the `__gummy.sim()` bypass;
- global `Math.random` ownership, seeding and Glass defaults;
- the commands and limits of the P5 harnesses.

No runtime source changed in P5a–P5d. The existing save format, APIs, dependencies,
frame/physics/clock ordering and global RNG stream remain in place.

## Frame path

`animate(now)` is scheduled by `requestAnimationFrame` and runs in this order:

1. Schedule the next frame, increment the diagnostic frame counter and compute
   the elapsed frame time.
2. Update `lastNow` before checking visibility or pause.
3. Return when `document.hidden` is true.
4. Return when `paused` is true.
5. Clamp the frame delta to 1–50 ms and convert it to seconds.
6. Run `frameTick(dt)`:
   - `stepMeadowAI(dt)`;
   - `stepGummyBehavior(dt)`;
   - possession locomotion, pointer decay, the drop queue and idle hops.
7. When the Meadow is active, run `field.update(dt, bears)`. Its first action is
   `sky.update(dt)`, followed by wind, horizon, homes and the remaining field
   systems.
8. Advance the fixed-physics accumulator with `FIXED_DT = 1/60` and at most
   `MAX_STEPS = 8` steps per frame. If the accumulator exceeds that ceiling, it
   is reset rather than allowed to grow without bound.
9. Update farewells, surfaces, meshes, shadows, camera, effects and UI, then
   render.

Inside `stepMeadowAI(dt)`, the order is:

```text
food -> Bear AI -> life -> Glass -> conflict shove -> Bear locomotion
```

It returns immediately when the active map is not the Meadow, when no field
exists, or when the debug `frozen` flag is set.

`field.update(dt, bears)` is called only for the Meadow. Studio therefore does
not advance the sky clock through this path.

## Clock domains

These are separate clocks and must not be treated as interchangeable:

| Clock | Owner / source | Behavior |
| --- | --- | --- |
| Frame schedule | `animate(now)`, `lastNow` | Browser frame time; `lastNow` updates before pause/hidden returns. |
| Frame delta | `dtMsRaw`, clamped `dt` | Clamped to 1–50 ms before simulation work. |
| Fixed physics | `FIXED_DT`, `acc`, `MAX_STEPS` | 1/60 s steps, capped at 8 per frame. |
| Sky clock | `src/sky.js` | `totalHours`, `hours`, `day`, `auto`, `speed`; one day is 600 real seconds at 1×. |
| Simulated day | `sky.day` / behavior `getDay()` | Derived from accumulated sky hours; not the same as wall-clock date. |
| Save metadata | Persistence | Records save time and clock snapshot; wall-clock metadata is not a simulation clock. |
| Harness cadence | P5 scripts | Controlled `g.sim` cadence or live rAF; not a runtime clock contract. |

The sky clock advances only when `sky.auto` is true:

```text
totalHours += dt * 24 / 600 * speed
hours = totalHours % 24
```

`sky.update(dt)` also advances visual time and celestial placement regardless of
`auto`; only the hour accumulator is gated by `auto`.

## Pause, hidden and freeze

### Pause

`paused` gates `animate()` after `lastNow` is updated. A paused frame performs no
`frameTick`, field update, physics step, camera update or render. Because
`lastNow` is current, resuming does not replay the paused interval as one large
delta.

### Hidden

`document.hidden` gates `animate()` after `lastNow` is updated. The
`visibilitychange` handler also resets `lastNow` and the physics accumulator.
This is a separate browser-lifecycle gate, not the pause menu.

### Freeze

The debug `frozen` flag is narrower than pause:

- it stops `stepMeadowAI`.
- it stops idle hops and the quality governor.
- it does not stop `frameTick`, `stepGummyBehavior`, `field.update`, physics,
  rendering or the sky clock.

Therefore `sky.hours` can advance while behavior ticks are held. That is observed
behavior, not a defect claim.

## Inactive map and return

`g.setMap(id)` requests an asynchronous switch and returns the currently active
map id. The switch waits 220 ms before saving and activating, then leaves the
switch guard set for another 260 ms. Callers that need the new map should poll
`g.map().id` rather than assume the request is synchronous.

When leaving the Meadow:

- `saveCurrentWorld()` stores the field clock snapshot in `worlds.field`:
  `time`, `auto` and `speed`.
- Studio activation hides the field and sky. `field.update()` is not called, so
  the sky clock does not advance; `stepMeadowAI()` also returns because Studio is
  not the Meadow.
- While paused, neither the clock nor behavior ticks advance regardless of map.

When returning to the Meadow, `applyMapVisuals('field')` restores
`worlds.field.time`, `auto` and `speed` before gameplay resumes. A saved named
sky look has precedence: if one is present, it sets the hour and disables auto.
The P5c live probe uses a disposable fresh profile, so it exercises the plain
clock restoration path without a saved look.

## `__gummy.sim()` bypass

`g.sim(sec, rebuild)` calls `simulateSeconds()`:

```text
steps = round(sec / FIXED_DT)
for each step:
  physicsStep(FIXED_DT)
  if step % 4 === 3: frameTick(FIXED_DT * 4)
  optionally rebuild bear surfaces
```

It deliberately skips:

- `field.update()`;
- sky clock advancement;
- surface, shadow, camera, effects and render work.

It does run fixed physics and periodic `frameTick`, so behavior ticks can advance
while `map().sky.hours` stays unchanged. P5b verifies this with `sky.auto` enabled.
The synthetic cadence is a harness condition, not a model of normal `animate()`
scheduling.

## RNG ownership

The game uses the browser-global `Math.random` stream. There is no default
per-system RNG partition. Consumers include Bear AI and behavior, Glass, Gummy
behavior, field visuals/particles, births and other app systems.

### Seeding hooks

- `g.seed(value)` replaces `Math.random` with a 32-bit LCG:
  `state = (imul(state, 1664525) + 1013904223) >>> 0`.
- A finite value is floored, wrapped to unsigned 32-bit and normalized to 1 when
  zero.
- A non-finite value restores native `Math.random` and returns `null`.
- `g.unseed()` restores native `Math.random`.

The behavior host passes `rng: () => Math.random()`, so it resolves the current
global function at call time and follows `g.seed()` / `g.unseed()`. This is
intentional and covered by P5a.

Seeding is not a whole-game determinism guarantee. The stream includes other
global consumers, and elapsed live frames, construction order, map state and
input timing still matter. Repeatable traces require the same harness cadence,
fixture setup, state and RNG consumers.

### Glass defaults

Glass is a behavior actor with its authored skinned GLB and rigid adapter. Its
scheduler path is the same Meadow path: `glassColony.update(dt)` runs after Bear
AI/life inside `stepMeadowAI()`. Glass does not use a separate clock or a separate
behavior-engine instance.

The `glassEngineRng` feature is off by default. With it off, the Glass `insideT`
draw uses the global `Math.random` stream. With it on, the draw routes through
`shared.api.rng`, which itself resolves the global stream. Enabling the feature
does not create an independent Glass stream.

## Harness evidence

### Source-order guard

```text
node --test tests/scheduler-rng-contract.test.mjs
```

Five tests cover the animate gates/order, `frameTick`/`stepMeadowAI` order, sky
first in `field.update`, the `simulateSeconds` bypass and the dynamic behavior
RNG callback. Current result: 5/5 pass.

### Controlled seeded trace

```text
node scripts/scheduler-rng-characterization.mjs
GAME_URL=http://localhost:8000/ SEED=1234 FRAMES=120 \
  node scripts/scheduler-rng-characterization.mjs
```

The controlled mode suppresses rAF, seeds the global stream, spawns four adult
Glass actors and drives `g.sim(1/15, 0)` for 120 frames. It records draw owners by
source stack and checks:

- `sky.auto` is enabled and the `g.sim` clock stays unchanged;
- behavior ticks advance;
- every overlapping Bear/Glass frame orders Bear before Glass;
- a non-frozen positive control draws both owners;
- the frozen window removes Bear/Glass draws while behavior ticks stay fixed;
- two fresh profiles produce identical per-frame owner traces and totals.

Representative current result: seed 1234, modules engine, clock `auto=true 7 -> 7`,
behavior ticks `0 -> 38`, 43 overlap frames with `bear<glass` (first frame 1),
totals `bear 144 / glass 146 / field 48`, 92 control draws and 0 frozen draws.

### Live clock checks

The live mode uses normal rAF on a separate disposable profile and existing
`__gummy` hooks. It checks:

- baseline behavior ticks and sky hours advance;
- pause holds both, then resumes;
- freeze holds behavior ticks while sky hours advance;
- a paused switch to Studio does not advance either;
- running Studio holds both with `sky.auto=true` and the behavior engine enabled;
- returning to Meadow restores the saved field clock with `sky.auto=true`;
- resume advances again after return.

Representative current run with `settle=250ms wait=900ms timeout=10000ms`: baseline
ticks `6 -> 10` and hours `7.0060 -> 7.0133`; pause held ticks at `11` and hours
at `7.0140`; freeze held ticks at `16` while hours advanced `7.0313 -> 7.0407`;
Studio held ticks at `21` and hours at `7.0480`; return restored `7.0480` with
`auto=true` and resumed ticks `21 -> 29`.

The script prints `SCHEDULER_RNG_CONTROLLED_OK`, `SCHEDULER_RNG_LIVE_OK` and
`SCHEDULER_RNG_OK`.

### Chunk-boundary checks

```text
node --test tests
node scripts/smoke.mjs http://localhost:8000
```

Current result: 352 Node tests pass and all 68 HTTP smoke checks pass. The smoke
check is serving/import evidence, not gameplay evidence.

## Limitations and unverified criteria

- P5 does not establish cross-engine determinism.
- P5 does not establish frame-rate-independent determinism. Live checks assert
  direction and equality gates, not exact frame rates or elapsed-hour totals.
- Fixed physics does not make rendering, UI, wall-clock timing or the whole game
  deterministic.
- Seeded traces are conditional on the controlled cadence, fixture setup, state
  and every other global-RNG consumer.
- The P5c no-catch-up guarantee is covered by the P5a `lastNow` source-order guard;
  live P5c measures restoration while paused and resume advancement, not a
  numerical catch-up bound.
- Browser scheduling, CDP polling and map-switch timers vary. The live harness
  uses generous waits and fails rather than claiming exact timing.
- No visual screenshot is part of P5; P5 is scheduler/clock/RNG characterization,
  not appearance evidence.

## Change policy

This document records current behavior. It does not authorize:

- clock extraction or a new clock owner;
- RNG-stream separation or a new RNG API;
- scheduler, physics or gameplay redesign;
- changed save fields, map timing or debug-hook semantics.

Any such change needs a new evidence-backed proposal and the normal approval
process. P5 is closed as characterization and documentation; no runtime work
follows automatically.
