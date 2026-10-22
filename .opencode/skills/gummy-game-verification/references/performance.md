# Performance verification

Extracted project procedure; use the parent skill's evidence rules and
[browser prerequisites](browser-harness.md). Paths are repo-relative.

## Method and comparison

- Read `PERFORMANCE.md` for the current profiling method. Compare matching camera,
  population, quality, DPR and render settings. Report measured frame times and
  method; headless rAF is not a reliable basis for a 60 fps claim.
- Label exploratory measurements as exploratory. Claim an improvement only after
  repeated measurements under matching conditions, reporting variability and sample count.
- Do not assume fewer triangles/draw calls implies a frame-time win. Account for
  grass overdraw, transmission and reflection passes using measured results.

For unified Meadow profiling use the documented `scripts/perf-profile.mjs` procedure
and its quality lane. Discard initial GPU-ramp samples as specified in the project
performance rules; do not compare a cold run against a contended warm run. Use existing
metrics to distinguish CPU, GPU and resource-lifetime claims. Cached asset bytes are
not a measurement of GPU residency.

## Timing contamination and failure response

Serialize GPU-heavy browser suites and do not overlap them with long CPU parity runs.
Keep stall/debugger instrumentation off for timing comparisons. If a run stalls or the
machine is contended, retain the evidence and report the limitation; do not label an
instrumented pass as proof that an intermittent stall was fixed.

Use [rendering/visuals](rendering-visuals.md) to check appearance after optimization and
[species/assets/save](species-assets-save.md) for loader/disposal changes. Reduced work
is not an accepted optimization if appearance, behavior or persistence regresses.
Update `PERFORMANCE.md` for meaningful measured changes in approved scope. If profiling
tools are unavailable, report the improvement as unverified. Clean up owned processes.
