# Toy, fireworks and cannon boundary

Status: E5/M21 extracted the pure cannon placement/aim/fire math. This document
describes the current working tree. It does not add a universal toy engine,
change ballistics, cooldown, containment or firework/blast behavior.

## Scope and ownership

| Concern | Owner | Notes |
| --- | --- | --- |
| Pure cannon math | `src/cannonaim.js` | Frozen constants, bounds clamp, placement problem, aim solution, aim arc, cooldown predicate and shot-placement eligibility. Plain objects only; no renderer, DOM, storage, RNG or clock. |
| Cannon factory, meshes and UI | `src/launcher.js` | Owns the three.js group/materials, 44-dot `InstancedMesh`, aim/move rings, pointer gestures, `Escape`/UI listeners, `lastBlock`, cooldown timestamp, preview and debug state. |
| Cannon live physics/visual application | `src/launcher.js` + app | Launcher computes placement and shot values; app supplies table/bears/containment callbacks, spawns the bear, uploads velocities and rebuilds the cannon collider. |
| Fireworks, rockets and particles | `src/app.js` | `launchFirework`, `burstAt`, rocket/particle pools, burst queue and `applyBlastImpulse`. Not imported by `cannonaim.js`. |
| Cross-representation blast | `src/app.js` + `glassColony.blastImpulse` | App applies impulses to Bear/Gummy bodies and forwards the Glass blast; unchanged by E5. |

`src/cannonaim.js` exports `CANNON`, `clampToCannonBounds`,
`cannonPlacementProblem`, `cannonAimSolution`, `cannonAimArc`,
`cannonCooldownBlock` and `cannonShotPlacement`. The launcher remains the only
production consumer; no app or fireworks code imports the pure module.

## Preserved behavior

- `CANNON` values: pivot `0.43`, muzzle `0.44`, angle `0.56`, landing height
  `0.60`, gravity `12`, speed limits `5`/`22`, base margin `0.45`.
- Bounds clamp gives an injected `clampBounds(x, z, margin)` precedence and
  otherwise uses the exact table clamp. Placement checks finite input, then
  bounds, then active-bear clearance `0.62 + 0.18 * (scale || 1)`, then
  `placementExtra`, short-circuiting with `invalid`, `bounds`, `bear` or `extra`.
- Aim clamps the target with margin `0.16`, applies the `0.8` minimum-distance
  push, uses `atan2(dx, dz)`, pitch `-0.56`, the existing muzzle offsets, speed
  formula and `5`–`22` clamp, and returns plain `muzzle`/`dir`/`velocity`/
  `target` records. It does not mutate its inputs.
- The arc preserves the `count`-dot loop (`t = (i + 1) * 0.035`), the
  `i > 2 && y <= 0.60` break, target fallback, and up to three landing markers at
  `0.60 - (0.60 - 0.05) * k / 3.15`; `land.y` is `0.60`. The launcher writes the
  returned dots into its existing 44-instance mesh and zero-fills the remainder.
- Cooldown remains a strict `now - lastFireAt < 260` predicate.
- Shot placement keeps the primary `muzzle + dir * 0.36` candidate, one retry at
  `+0.60` more along the shot line, muzzle refusal, then landing check at
  `land.{x,z}` with radius `0.45` and `includeBears = false`. It returns the
  selected origin on success and `muzzle`/`landing` blocks on refusal.

## Fire order and RNG

`launcher.fire()` keeps this order:

1. group/has-aim/physics gate;
2. cooldown check (`performance.now()` and the stored `lastFireAt`);
3. flavor draw `Math.floor(Math.random() * flavors.length)`;
4. shot placement (muzzle retry/refusal, then landing refusal);
5. spawn, then `lastFireAt`, body velocities, flags, recoil/flash and `lastShot`.

The flavor draw therefore still happens on muzzle/landing refusal and never on a
cooldown refusal. `lastBlock` is set only to `'muzzle'` or `'landing'`, cleared
on success, and untouched by cooldown refusal. Aim state, dot count/order,
landing ring, target/muzzle/speed debug shapes, placement preview, move/map
state and pointer priority remain in `launcher.js`.

## Unsupported

- No universal toy engine, ammunition registry or generic projectile model.
- No changed cooldown, ballistics, containment policy, firework/blast impulse or
  particle ownership.
- No new production debug hook. Browser evidence uses existing `__gummy`
  launcher/firework hooks.

## Verification

- `tests/cannon.test.mjs` covers constants, clamp precedence/fallback,
  placement order and short-circuiting, numeric aim fixtures, min-distance and
  speed clamps, arc dots/break/fallback/markers, cooldown boundary, shot
  placement branches and a source guard against renderer/DOM/storage/RNG/clock
  access.
- E5 browser evidence in `.dev-shots/e5/` drives the existing launcher hooks and
  real pointer input on a disposable profile. Cross-representation blast
  evidence uses the existing firework path; no hook was added.
- C09 closed the landing-refusal host gap with existing hooks: Meadow aim clamps
  with `fieldClamp`, not the table clamp, so aiming at the authored rock at
  `(-3,5)` produced `blocked: 'landing'`, no spawn and exactly one flavor draw;
  a clear shot then fired and an immediate retry hit cooldown. U-016 is resolved
  in the [unresolved register](unresolved-register.md). No production hook or
  ballistics/containment change was added.
