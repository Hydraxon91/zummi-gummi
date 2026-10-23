# Input and camera ownership contract

Status: E2/M19 inventory plus the first pure camera slice implemented. This
document describes the current working tree only. It does not add an input
stack, change gesture priority, add device support or authorize the remaining
M19 work.

## Scope and evidence labels

This pass read the app pointer/keyboard handlers, `launcher.js` input API,
`msn.js`/`glass.js` picking and drag entry points, possession controls and the
map-session pointer cleanup. Claims below are **source-inspected** unless a
check is named. The E2 camera slice and the browser input probe are separately
labelled **host-run**.

## Ownership map

| Concern | Current owner and authoritative state | Consumers / entry points |
| --- | --- | --- |
| Pure camera home descriptor | `src/camera.js` `cameraHomeFor` — map/aspect target, orbit angles, distance and zoom limits | app `cameraHome()`; reset, fitView, zoom limits, per-map restore |
| Pure base camera position | `src/camera.js` `cameraPositionFor` — target-relative spherical offset | app `applyCamera()` only |
| Live camera state (`cam`, `camera`) | `src/app.js`: yaw/pitch/lookUp/dist, target/goal interpolation, moved/frozen, possession clamps, shake, look-at, `updateMatrixWorld`, FOV/far changes | frame loop, reset/focus, possession, camera capture/restore |
| Gesture arbitration and pointer state | `src/app.js` `pointers` map, `pointerdown`/`pointermove`/`pointerUp` (shared by `pointerup` and `pointercancel`) | canvas plus global listeners; map change clears pointer state |
| Bear/Gummy grab and throw | `src/app.js` `grabScreen`, `makeGrab`, `updateGrabTarget`, `endGrab`, `releaseAllGrabs` | pointer routing, debug grab helpers, map/New Game cleanup |
| Glass picking/drag | `src/glass.js` `pick`, `beginDrag`, `drag`, `endDrag`, `cancelDrag`; app routes pointer modes `glassGrab` | app pointer handlers and map cleanup |
| Studio MSN picking/drag | `src/msn.js` `hitTest`, `beginDrag`, `drag`, `endDrag`, selection/activation; app routes mode `msn` | app pointer handlers, `dblclick` focus |
| Portal selection | `src/app.js` `pickPortal`; map switch intent stays `requestMapSwitch` | primary pointer down |
| Launcher aim/move gestures | `src/launcher.js` returned `pointerDown`/`pointerMove`/`pointerHover`/`pointerUp`, its own `Escape` listener and UI buttons | app routes mode `launcher`; app `keydown` `L` toggles aiming |
| Keyboard gameplay bindings | `src/app.js` first `keydown` listener and `keyup`; held-key `keys` Set | frame loop `updateCameraKeys`, possession locomotion, fireworks, debug toggles |
| Keyboard modal/system bindings | `src/app.js` Escape listener, relative-tab arrow-key handler, perf panel `P` listener | menus, help/settings, possession exit, tab focus |
| Possession input | `src/app.js` possession HUD/stick pointer listeners, `possessInput`, `updatePossessionLocomotion`, `updatePossessionCamera`; AI possession flag in `ai.js` | possession entry/exit, frame loop |
| Camera persistence per map | `src/app.js` `captureCamera`/`applyCameraState`; map snapshots in `src/world.js` | save/load and map activation |

The live camera owns no module-scope input state. `src/camera.js` is pure: no
imports, DOM, three.js, clock or RNG.

## Pointer and touch priority (source-inspected)

`pointerdown` first requires `e.target === canvas`, captures the pointer, and
then applies this order:

1. Active directive picking consumes a primary/non-mouse click and issues a
   move directive.
2. `launcher.pointerDown` wins while the cannon is usable.
3. Primary click on the Aero portal switches maps only when the portal is not
   behind an MSN/bear/Glass hit.
4. MSN hit (closer than the bear hit) selects and starts MSN drag.
5. Meadow Glass hit selects it; in grab mode it may start a Glass drag,
   otherwise it becomes an orbit gesture.
6. Select-click mode picks a bear, selects/reacts and orbits.
7. Primary grab mode starts a soft-body grab.
8. Mouse buttons: middle becomes pan; other mouse buttons become orbit.
9. Touch with an existing grab ignores the new pointer so the camera cannot
   move mid-pull.
10. Another touch while a camera gesture is active promotes the pointers to
    pinch; otherwise it becomes a pending touch that turns into orbit after a
    5 px threshold.

`pointermove` routes by stored mode: launcher, MSN, Glass grab, bear grab,
pending→orbit, orbit, pan, then two-pointer pinch (distance zoom plus midpoint
pan). With no stored pointer it updates launcher hover, MSN hover/cursor and the
DOM cursor. `pointerup` and `pointercancel` share the same handler: launcher
completion, MSN activate-vs-drag, Glass drag end/select, bear throw vs a Gummy
click reaction, and pinch demotion of the remaining pointer.

Pointer listeners are app-lifetime and not centrally torn down. Map leave calls
the existing `releaseAllGrabs` and clears `pointers`; blur also releases grabs
and clears held keys. The canvas CSS sets `touch-action:none`; there are no
separate `touchstart`/`touchmove` handlers.

## Keyboard and wheel (source-inspected)

- The gameplay `keydown` listener ignores editable targets, help, menu and
  pause. It handles `V` possession, `C` click mode, Space jump while
  possessed, `U` UI, `G` AI debug, `F` fireworks, `L` launcher aiming,
  `N` nav debug, `R` reset camera, and held `WASD`/arrows/`Q`/`E`. Arrow keys
  prevent scrolling.
- `keyup` removes the held key and clears firework hold. It does not share the
  editable/menu/pause guard; releasing a key always clears it.
- Escape is handled in priority order: exit possession, cancel directive
  picking, close menu slots, close help/settings, unpause, then open the pause
  menu. A separate listener opens help for `?`/`H`. The perf panel has its own
  `P` toggle. Relative tabs own left/right/home/end keyboard navigation.
- The launcher factory owns an Escape listener for aim/move cancellation.
- Wheel is canvas-only, prevents default, and zooms `cam.dist` exponentially
  within the current map/aspect zoom limits.

## E2 camera slice

`cameraHomeFor({ mapKind, mapCamera, camTarget, camHome, aspect })` returns a
plain `{ target:[x,y,z], yaw, pitch, dist, minDist, maxDist }`:

- `mapKind === 'life'` uses the map camera target/yaw/pitch/min/max, and adds
  `8` distance only when `aspect < 0.95`.
- Every other map kind uses the passed studio target and home, subtracting
  `0.30` from target y only when `aspect < 0.95`, with zoom limits `4.2` and
  `18`.
- The strict `< 0.95` comparison, target component order, zero values and
  missing-record failure behavior match the replaced app code. No clamp,
  fallback or default is invented.

`cameraPositionFor({ target, yaw, pitch, dist })` returns the same
target-relative orbit point as the previous app expression:

```text
cp = cos(pitch), sp = sin(pitch)
x = target.x + sin(yaw) * cp * dist
y = target.y + sp * dist
z = target.z + cos(yaw) * cp * dist
```

`app.js` still builds `THREE.Vector3` from the descriptor target and keeps every
other camera responsibility: goal interpolation, possession ground/arena
clamps, shake RNG, look-up/look-at, projection/matrix updates, FOV/far changes,
gesture state, zoom-command handling and per-map capture/restore. Camera
behavior and gesture priority are unchanged.

## Remaining unsliced owners

- The pointer gesture state machine and its exact priority order remain in app.
- Bear/Gummy grab, throw, click reactions and pointer release cleanup remain in
  app; Glass and MSN drag remain in their factories.
- Live camera state, possession clamping/camera, shake, look-at, reset/focus and
  per-map camera save/restore remain in app.
- Launcher aim/move state and UI remain in `launcher.js`; app still owns the
  pointer routing that invokes it.
- All keyboard bindings, wheel handling and UI-panel listeners remain in app
  (with launcher's own Escape listener).
- No unified input abstraction, renderer-neutral intent API or listener
  teardown contract exists.

## Unsupported / unverified

- Phone/touch behavior has only the existing mouse/touch-emulation coverage.
  Physical touch hardware, stylus pressure, multi-device handoff, notches and
  virtual keyboards are unverified.
- Pointer capture failure is silently tolerated; there is no recovery path or
  pointer-loss UX beyond `pointercancel`/blur handling.
- Focus/blur behavior is a global release; the app does not restore held keys
  after focus return.
- Gamepad, `pointerrawupdate` coalesced events and accessibility input
  remapping are not implemented.
- Listener lifecycle is app-lifetime; there is no general teardown/re-init
  path.

## Verification

- `tests/camera.test.mjs` (host-run) covers exact life/Studio descriptors,
  narrow-aspect branches, the `0.95` boundary, target order, min/max, zero and
  missing inputs, no mutation, the spherical formula and absence of imports,
  DOM, three.js and RNG.
- The E2 CDP input probe (host-run; `.dev-shots/e2/input-probe.mjs` and
  `.json`) used a fresh browser profile and 1280×800 then 600×900 emulated
  viewports. It observed: a real mouse grab on a projected bear with no camera
  orbit during the drag and a clean release; an empty-canvas orbit; wheel zoom
  `27 → 20.74 → 27`; held `W` moving the goal and stopping on keyup; the window
  `blur` listener freezing a held key; life wide/narrow homes (`27`/`35`),
  Studio wide/narrow homes (`8`, target y `0.62`/`0.32`) with positions matching
  the spherical formula; and a toggle-emulated one-finger orbit followed by a
  real CDP `touchCancel`, which delivered `pointercancel` (type `touch`) and
  left the camera static. Page errors: none. The inspected capture is
  `.dev-shots/e2/e2_field_reset.png`.
- Physical touch hardware, stylus and real focus loss (as opposed to the
  synthetic `window` blur event) remain unverified.
