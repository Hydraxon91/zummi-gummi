# CI and harness verification

Use with the parent skill and the existing browser and behavior procedures.

- Map every existing assertion to a scenario before splitting a suite. Keep ordered
  prerequisites together; start independent scenarios with isolated profiles and
  deterministic fixtures. Restore changed settings before unrelated checks.
- Verify configuration scope against resolved values and an unaffected actor/species.
  Successful API returns and a passing global-disable test do not prove actor scope.
- Distinguish boot/module availability, asset readiness, shader compilation, rendering,
  simulation and storage. On stalls, retain the exact phase, expression, timings and
  independent process/debugger evidence. A timeout around save is not proof of a
  storage defect. Do not raise waits or reload until green instead of diagnosing.
  Distinguish a bounded environment allowance (for example a first-frame compile
  that the project has measured exceeding the old gate) from masking a hang: name
  the measured evidence, keep the assertion and job timeout unchanged, and retain
  stall diagnostics.
- Inspect saved captures, including overlays and the actual target. DOM presence is
  insufficient when another panel covers the control. A harness frame gate must be
  explicit, preserve the rendering evidence required by the claim and never be used
  to certify animation or pointer behavior it bypasses.
- Test path classification and aggregate gates with success, failure, cancellation,
  unexpected skip and missing-output fixtures. Unknown changes require coverage.
- Check exact tested-revision deployment, untrusted event exclusions and superseded
  revisions. Validate YAML and references locally; report hosted validation separately.
- Measure elapsed time and total runner usage, including repeated boot/render costs.
  Keep semantic coverage blocking. One green hosted run does not establish flake rate.
  For the manual rendering comparison, use `render-comparison.yml`: keep both modes
  on the same revision/runner with fresh profiles and retain failures from both.
  `RENDER_COMPARISON=1` verifies and reports the requested mode in social/gifting
  harnesses. Read `bootAttempts` for retry-aware boot times and failed-page evidence;
  use per-mode wall times and exit statuses for total cost, including timeouts.
  The opaque lane is diagnostic only, not visual, animation or asset acceptance.
  Required CI also uses opaque rendering for the seven sampled nonvisual social/
  gifting scenarios. Core, parity, settings and carry remain normal. Preserve that
  boundary when adding checks: visual, pointer and deformation claims need the
  real-rendering lane. Do not disable its mode verification or asset-ready gates.
- Upload diagnostics from hidden directories explicitly. Bound monitoring and stop
  owned processes. Do not silently retry failing suites, loosen assertions or change
  gameplay to make CI pass.
- Make startup failures reportable. Launch/connect the browser inside the harness's
  guarded section so a report is still written, and include browser stderr when the
  CDP endpoint never appears. An empty server log plus a missing report indicates a
  launch failure, not a game or assertion failure.
- A boot gate that fails intermittently in a different job each run, always before
  the first frame, is an environment/renderer problem, not an assertion. Diagnose
  it as such: keep stall diagnostics, pass `--disable-dev-shm-usage`, and allow one
  recorded relaunch with a fresh **browser process**. Closing only the page target
  keeps the wedged GPU process and can fail twice in a row. Never retry assertions,
  and keep the first attempt's evidence in the report so a real boot regression
  stays visible.
- Do not boot a second WebGL page for a responsive-layout check under software
  rendering; emulate the viewport on the booted page. State that this is a resized
  session, not a cold mobile-load or mobile-performance test, and keep a separate
  page for suites that genuinely verify cold mobile boot.
