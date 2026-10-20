# Semantic UV evidence prototype

Experimental, not an accepted replacement for the production exporter. Work only in a
disposable background Blender on an approved saved source; no live scene edits or source saves.

## What is different from the old label heuristic

- Preserve UV/face correspondence and validate endpoint-associated connectivity. Sorting four
  UV coordinate scalars loses which values belong together; the prototype refuses to migrate
  existing ids if corrected connectivity disagrees.
- Use Blender's actual loop triangles, not a fan over concave n-gons. Measure area-weighted
  world-space samples and normals, crease-connected geometry regions, six-axis visibility and
  opposing-surface ray samples through shell thickness. Record coverage, not a certainty flag.
- Capture the host from eight orthographic/three-quarter directions with actual camera matrices
  and ray-verified face/island label locations. These are diagnostic host views, not assembled
  vehicle verification; hidden internals may require isolation captures.
- A UV island can span roof, window surrounds and hood surroundings. Give it an honest broad
  label or keep it unknown; never pretend every island is a single semantic panel.
- A vehicle profile supplies axes and named landmarks. Do not bake one model's world constants
  or wheel-side assumptions into a supposedly generic tool.

## Current scripts

```text
<blender> --background <approved.blend> --python-exit-code 1 --python <skill>/scripts/uv_surface_probe.py -- --object <mesh> --out <unused-scratch-directory> --limit 24
<blender> --background <approved.blend> --python-exit-code 1 --python <skill>/scripts/uv_semantic_vehicle.py -- --evidence <scratch>/surface_evidence.json --profile <vehicle-profile.json> --benchmark <independent-benchmark.json> --out <unused-output-directory> --resolution 1280
<blender> --background --factory-startup --python-exit-code 1 --python <skill>/scripts/test_uv_semantics.py
```

Inspect `multiview_contact.png` and individual `labelled_*.png` captures. The optional benchmark
is read only after predictions are frozen. It scores the proposals; it is never classifier
input. `evaluation.json` distinguishes a small development benchmark from a held-out test.
`proposed_names.json` is compatible with the existing exporter's single-object `--names` input,
but remains proposals; unknowns are explicit and id sets are source-specific.

## Limits and next gate

The floor classifier now distinguishes front/cab/bed using conservative full window extents,
not the midpoint of a sloping windshield. Entire island bounds must fit one interval;
transition-spanning floors abstain. These landmark proxies are not measured firewall planes.
Synthetic tests cover all three regions, upper/underside and boundary abstention.
`classify_sampled` and holdout `--sampled` now classify three barycentric samples per actual
loop triangle with world-area weighting, retaining component fractions and abstaining below
90% dominant rule support. This is finite sampled rule coverage, not semantic confidence.

The second holdout used `--selection stratified --sampled --count 16` and excluded both the
24 development ids and all ids from `--previous-run <first-holdout>`. It scored **2/14 exact**,
with 6 wrong names and 6 abstentions; 2 visually unresolved cases were reported separately.
Sampling exposed roughly 50/50 front/cabin floor ramps, but edges/reveals still fail semantic
naming. Some wrong proposals have 100% coverage: never report that as 100% confidence.
This fresh varied same-asset test is complete and failed; do not tune it into a claimed pass.
The original failed holdout is immutable regression evidence, not a new validation set.

### Same-asset holdout

`uv_semantic_holdout.py` provides separate `freeze`, `capture` and `score` operations.
Freeze source/profile/classifier hashes and predictions for ids excluded from the development
benchmark before inspecting numbered captures. The score operation is plain Python; it rejects
changed prediction bytes, changed classifier/profile files, missing annotations and reused
development ids. `test_uv_holdout.py` tests scoring without Blender.

The first test selected the next 12 largest unscored islands. All were cabin-floor patches;
the frozen classifier named all twelve as front/under-hood floor instead. **0/12 exact names**,
with upper/underside orientation correct. This is a failed narrow same-asset semantic test,
not cross-vehicle accuracy. Keep exact-name, abstention and unresolved-evidence counts separate;
do not introduce a coarse score after seeing errors and report it as success. Do not retune on
this holdout and continue calling it held out.

Exporter seam-connectivity and concave-U raster regression fixtures are included in
`test_uv_semantics.py`. These test geometry correctness, not semantic generalization.
Repaired triangulation can change UV-area ordering and formerly reported overlap pairs:
never silently reuse old id/name mappings or replace existing atlases after this repair.

The current scripts prepare multi-view evidence and make profile-based proposals for the
largest 24 islands. An agent/operator supplies the visual interpretation; there is **no bundled
unattended vision-model API**. Do not claim end-to-end general semantic recognition or a
calibrated accuracy/confidence score. Other islands remain `unknown_<id>`.

No new runtime dependencies, paid generation, cloud upload or asset integration are authorized.
The probe's colours are Workbench diagnostics, not production materials. Saved source and UV
fingerprints must match before using proposals; label placement skips are reported separately.
