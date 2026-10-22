# Browser harness and session prerequisites

Extracted project procedure; relocation does not establish new test coverage.
Follow the parent skill's routing and acceptance stages. Paths are repo-relative.
Read this before any browser check; load every additional affected reference.

## Browser regression

With the server running:

```sh
node scripts/browser-regression.mjs
```

It boots `?autostart=1`, seeds randomness, checks the 10-row roster, 8 soft-body
actors, 2 Glass actors, starter lineage, a sibling play start and save/load.
Use `STUDIO=1` to load the Studio Glass prototype and verify 3 meshes/9 bones/10
clips, and `SHOTS=1` to write a capture. The harness uses a temporary browser
profile and `BROWSER_BIN`/`CHROME_BIN` when the browser is not in a standard
location. CI runs the same regression with SwiftShader fallback, 90-second
startup waits, `LOW_QUALITY=1` and a 900×600 viewport, so slow software rendering
does not read as an asset failure. Use the committed `scripts/race-test.mjs` and
`scripts/glass-test.mjs` for deeper Studio/Glass lifecycle passes.

## Boot, menu and session state

- The app opens on a DOM menu and boots lazily. A harness that is not testing the menu
  must navigate with `?autostart=1` (or click a menu action) and assert
  `window.__gummy.booted`; otherwise it measures the menu and reports nothing.
- Wait for `!!window.__gummy` before asserting DOM or gameplay state. If `app.js` fails or
  loads partially, the static menu still renders, its buttons have no handlers and no page
  error is raised. Treat that as a load failure, not a UI result.
- The menu overlay blocks canvas pointer input, and pausing returns early from the animate
  loop. Dismiss the menu and resume before pointer-driven or frame-based assertions; check
  `paused()` after Escape/Resume, and remember that Return to menu writes an autosave.
- Saves and autosaves live in IndexedDB per browser profile. Delete the harness
  `--user-data-dir` for each run and confirm no orphan browser still holds it, or
  Continue/load assertions read stale state.
- Bursts of `net::ERR_CONNECTION_RESET` while loading the ~20 ES modules are the dev
  server's accept backlog, not the game. `launch.py` sets `request_queue_size = 64`; if
  resets appear, confirm the running server started after that change and restart it
  instead of retrying the test.

Only restart a server you own or have permission to restart. Read the reported port;
do not assume a restart kept the same port or terminate a user's server.

## Browser harness pattern

Captures and assertions are driven by a **Node harness that launches the browser and
speaks CDP to it** — not by raw CLI flags. `--headless --screenshot`, `--dump-dom` and
`--virtual-time-budget` against this app hang or return nothing, because the page keeps a
rAF loop alive so virtual time never expires.

Use `scripts/browser-harness.mjs` for browser launch, CDP connection, page setup, waits,
evaluation and screenshots. It uses a temporary profile, resolves Chrome/Chromium through
`BROWSER_BIN`/`CHROME_BIN`, and tears the profile down in `finally`. The committed deep
harnesses share it:

- `scripts/race-test.mjs` — Meadow species/cross-species/birth checks, Studio MSN/Gummy/
  Glass paths, cast filters, interaction, save/load and persistence. Supports `LOOK=alpha`
  and `MOBILE=1`.
- `scripts/glass-test.mjs` — Glass hover, grab/throw/tumble, shelter, family/sibling play,
  visits, births and save/load.

For targeted Glass debugging, use `SCENARIO=drag|growth|social|hover|needs|night`
or `SCENARIO=lifecycle` (the latter retains birth/family/save prerequisites).
The default `SCENARIO=all` runs every group. `SHOTS=0 FAST=1` skips behavioral
surface rebuilds and pauses background rendering after real-time pointer checks;
it does not change physics steps or day length. Keep the normal lane for mesh and
visual acceptance. `GAME_URL=... node scripts/glass-fast-parity.mjs` checks identical
fixed-step actor state/positions and RNG with rebuilds on/off; run for both
`BEHAVIORS=modules` and `BEHAVIORS=legacy` when changing this fast path.
Glass JSON reports contain per-evaluation `timings`. Use targeted checks during
iteration, then the full suite once per engine; repeat reliability samples only
when required and stop at the first failure rather than retrying for green.

For social checks, use `SCENARIO=settings|pair|rivalry|partnership|groups|glass`
with `scripts/social-test.mjs`; gifting uses `SCENARIO=flow|carry|persistence`
with `scripts/gifting-test.mjs`. Both default to `all`. Keep scenario prerequisites
together and run each selected scenario after changing its fixture; the full normal
suite checks interactions between sections. Shared desktop/mobile gifting settings
are checked by the social settings scenario. `FAST=1` pauses background rendering
for nonvisual assertions; gifting `carry`/`all` and social `settings` retain frames.
Do not use paused evidence to claim visual or pointer correctness. Reports include
the scenario, assertion inventory and bounded CDP timings. CI retains reports,
captures and server logs even on success; inspect failures, do not retry for green.
The push matrix is aggregated by `Required CI checks`; only explicitly allowlisted
documentation-only diffs may skip browsers. Pages requires successful tested main
code, not merely a successful deployment command.
For a bounded stall investigation, set `STALL_DIAGNOSTICS=1`. On the first
evaluation timeout the harness retains a debugger stack, process inventory and
(on macOS) a one-second browser-process sample under `harness.stall`. This adds
debugger instrumentation and bounded failure-only collection overhead, so keep it
off for timing comparisons. A passing instrumented run does not establish the
cause or resolution of an intermittent stall.

Other one-off harnesses belong in the gitignored `.dev-shots/`; import the same helper
instead of duplicating `spawn`/WebSocket setup.

Required structure:

1. `launchBrowser({ port })` and `connectBrowser(launched)`.
2. `openPage({ url, width, height, mobile, initScript })`; wait for `window.__gummy.booted`
   or the harness-specific ready flag before asserting. An unready page looks valid.
3. Use `page.evaluate`, `page.waitFor`, `page.screenshot`, and `browser.send` for CDP
   methods not wrapped by the helper.
4. Read `browser.pageErrors` instead of maintaining a second console listener.
5. Write a JSON report next to the captures and call `await browser.close()` in `finally`.
6. Print one tagged line per result (`STATE`/`PERF`/`INFO`/`TINT`/`ERRORS`/`STOP`) so a
   caller can `grep` them, for example:

```sh
env TAG=g1 node scripts/race-test.mjs 2>&1 | grep -E "INFO|STATE|ERRORS|STOP" | cut -c1-1600
env TAG=g1 LOOK=alpha node scripts/race-test.mjs
env TAG=g1 MOBILE=1 node scripts/race-test.mjs
```

Keep one check per section rather than printing the whole report. A page-under-test may
expose a small `window.__X` API (ready flag, `set()`, material getters) purely so the
harness can pose and probe it deterministically. The portable helper and the two deep
harnesses are committed; scratch captures stay in `.dev-shots/`.

Scratch retention: `node scripts/prune-dev-shots.mjs` is a dry run of `.png`/`.json`
files older than `DAYS` (default 14). `node scripts/prune-dev-shots.mjs --apply` deletes
those candidates. Curated files under `screenshots/` are never considered.

Review the manifest and obtain required deletion approval before applying cleanup.
Filtered console previews do not replace checking the harness exit status and JSON report.
