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
- Upload diagnostics from hidden directories explicitly. Bound monitoring and stop
  owned processes. Do not silently retry failing suites, loosen assertions or change
  gameplay to make CI pass.
