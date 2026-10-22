# UI and input acceptance — new checks unvalidated

**Status: unvalidated for the new acceptance extensions below.** Existing boot, menu,
profile isolation and capture procedures retain their prior status in
[browser-harness.md](browser-harness.md) and [rendering-visuals.md](rendering-visuals.md).
Paths are repo-relative. No UI redesign, device support or implementation is authorized
by this checklist. Confirm the approved support matrix first.

## 1. Choose cases from the actual change

Read current DOM/CSS, input handlers and their callers. State the affected controls,
supported input devices, required viewport/aspect/zoom combinations and expected state
transitions. Distinguish layout/capture checks from semantic interaction assertions.
Do not invent gamepad support or new settings merely because a generic guide lists them.

## 2. Verify readiness and input ownership

Use the shared CDP harness and fresh profile. For initial-menu tests wait for
`window.__gummy`; for gameplay wait for `booted` and confirm menu/pause state. Verify
the visible top overlay receives input and prevents click-through to the canvas.
Exercise Escape/back/resume and input-device changes only where supported. Check
focus returns to a usable control after closing a dialog, not a hidden element.

## 3. Exercise layout and navigation

1. Capture the baseline before editing. Select desktop and mobile cases from supported
   layouts, including a narrow/short viewport and a contrasting aspect ratio when relevant.
2. At each case inspect clipping, overlap, text wrapping, scroll reachability, touch
   targets and safe-area handling. Record actual sizes/zoom; emulation is not physical
   device validation of a notch, virtual keyboard or touch hardware.
3. For supported keyboard navigation check initial focus, visible focus, order,
   activation, disabled controls and an escape route. Repeat with mouse/touch where
   affected; input switching must not strand focus or retain a stale drag.
4. Assert that actions change the intended state exactly once, including rapid repeat,
   cancellation and disabled/refused states. Opening menus must not silently reset a
   session or change simulation state beyond the documented pause behavior.
5. Test save/continue and settings persistence when affected, with isolated test saves.
   Do not use a dirty profile as evidence of a successful persistence round trip.

## 4. Readability and asset acceptance

Inspect at native display size, not only enlarged screenshots. Check focus/selection/
disabled/error states, text and icon contrast on bright/dark panels and in relevant
day/night scenes. Where a state relies only on colour, record the accessibility gap;
do not silently add new symbols or redesign controls outside scope. Test longer text
or browser zoom when those are part of the approved requirements.

For related icon/art families, use the 3D authoring skill's asset-family reference for
source production and this checklist for in-game use. Normal-map generation does not
authorize replacing unlit UI materials. Capture alpha edges under the real backgrounds.

## 5. Report and stop conditions

Record each supported device/layout/state as pass, fail, excluded with reason or
unverified. Page errors, missing handlers, blocked controls or wrong state transitions
are failures even when screenshots look normal. Keep failed reports and stop for a
new policy/UX decision rather than implementing a preferred behavior as a bug fix.
Report unsupported hardware tests explicitly; mouse emulation does not prove gamepad
or physical touch behavior. Follow shared cleanup and evidence invalidation rules.

## Related reading

[Game UI/UX](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/main/skills/disciplines/game-ui-ux)
was consulted for acceptance topics. This is project-authored guidance, not its engine
examples or a new event-driven UI architecture. No upstream scripts are installed and
upstream documentation/validator claims do not validate these local checks.
