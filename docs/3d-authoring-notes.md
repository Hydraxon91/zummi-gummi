# 3D authoring notes

Case histories, measurements and coverage records that inform the procedures in
`.opencode/skills/gummy-3d-authoring/SKILL.md`. The skill states what to do; this file
holds the evidence behind it. Neither is user acceptance.

## Island inventory before hiding or editing a component

A "hood detail" object in a vehicle assembly turned out to contain a 1,188-vertex island
spanning X ±0.40 / Y −1.14…−0.53 — the raised hood panel itself, not the vents it was
assumed to be. Hiding it as "vents" flattened the hood, and the user caught it in review.

An island inventory (count, vertices per island, per-island bounds) printed before hiding
would have prevented the detour. Bounds alone are not identity: the first raycast hit may
be an occluder, and one object routinely holds both structural panels and small details.

## Beanbag sphere deformation trials

- `_006` changed dent position, width, depth and cushion amplitude together, making
  the observed crown lowering and radial pinching difficult to diagnose. Pole
  involvement remains a causal hypothesis until checked against cage displacement.
- `_008` broadened the depression, but inspected renders still show weak separation
  between the inner back, seating surface and front rim. A raised cushion must not
  compensate for an inadequately established seat footprint.
- Closed topology and consistent winding establish neither reference fidelity nor
  a well-shaped cavity. A topology change is not justified by renders alone.
- Keep `_008` as the diagnostic baseline: compare `Outer_Form` with
  `Seat_Depression`, measure protected crown/rim and outside-region movement, and
  distinguish cage measurements from evaluated subdivision-surface measurements.
  Test footprint and inner-wall slope while holding depth and cushion amplitude fixed.

### Measured follow-up from `_008`

The basis-to-seat top-pole displacement measures 73.12 mm in local metres; that
establishes deformation support reaches the pole, not that topology causes pinching.
Cage edge lengths span approximately 12–156 mm, but this range alone does not
establish that the distribution is unsuitable.

`_009` tested a Gaussian-to-super-Gaussian falloff change with depth amplitude,
centre and cushion fixed. A compact mask prevented added cage movement in selected
protected regions, yet subdivision moved the sampled evaluated crown by 0.067 mm.
The broader floor also introduced unwanted corner/inner-back creases, so it was rejected.
`_010` reduced the falloff change and expanded protection: evaluated rear/base movement
was zero and crown movement was 0.017 mm. Inner-back pinching and inadequate raised-seat
definition still blocked acceptance. No tolerance waiver was applied.

Evaluated comparisons asserted equal vertex counts and identical ordered polygon
connectivity before index-wise measurements; protected samples were crown Z > 0.77 m,
rear Y > 0.32 m and base Z < 0.25 m in the object's local coordinate space. These are
sampled region checks, not complete preservation or self-intersection proofs.
`beanbag_sphere_test_011_recovery.blend` restores `_008` with zero index-wise evaluated
vertex displacement and identical ordered connectivity. Tests `_009`/`_010` remain
diagnostics only; the unresolved criterion is at the six-attempt review, not reset by
filenames. No topology rebuild, bake or export was performed.

## Independent beanbag comparison and assisted-production follow-up

The submitted sources are under `.dev-shots/asset-pipeline/gpt61sol_beanbag_chair/`
(`beanbag_010_final_diagnostic.blend`) and `deepseek_beanbag_chair/`
(`beanbag_010_final.blend`). Their reports and inspected front/top/oblique, side-overlay
and underside images both disclose failed likeness. A subsequent live inspection used
comparable neutral studio shading and angle; neither source was edited or saved.

- Sol's continuous rim and crown read more coherently, but folds radiate into a starburst
  and the raised cushion is not convincingly visible. DeepSeek's cushion is explicit but
  reads as a mound inside a scoop, with a visible crown step and pinched inner boundary.
- Evaluated live counts: Sol 16,898 vertices / 16,896 quad faces (33,792 triangles);
  DeepSeek 13,106 vertices / 13,104 quad faces (26,208 triangles). Both have zero sampled
  non-manifold edges, loose vertices and inconsistent-winding edges. These are not
  exhaustive self-intersection or reference-fidelity checks.
- Sol minimum Z is approximately +8 mm; no evaluated vertex lies within 1 micrometre of
  ground. DeepSeek has 1,153 such vertices spanning approximately 0.392 × 0.386 m.
  That measures ground-level vertex coverage, not structural loading or physical stability.
- File hashes remained `31bca9c232ebb6265df6c353889571758f9b9a03fe13128a7b091272ed7e857f`
  (Sol) and `34df7bc3a959e2e752a5b8326d53be7fa17e570a275c5ba9a349bf8ec8296c1e`
  (DeepSeek). Sol's file was restored as the active Blender file after inspection.
- Process findings: Sol reports five shape attempts, initial reference-facing errors
  and stacked shape-key control errors; the iteration cap did not force its stop.
  DeepSeek discloses overwritten checkpoints and lists further shape edits after seven
  plus material work despite the failed gate. More completed stages is not acceptance.

The user reports approximate DeepSeek usage/cost of 300k tokens/$0.30 versus Sol
70k tokens/$1.50. Billing, provider/model variant, cache treatment and token breakdown
were not independently verified; these figures motivate testing assisted production,
not a measured cost-per-accepted-asset win. User artistic feedback is legitimate in
that new lane, and must be recorded separately from independent benchmark runs.

The next proposed contract is stylized/gameplay read with approved major cues, permitted
omissions, existing fabric reuse and an explicit background-prop delivery budget. The
user's concern was 10,000 vertices, not 100,000; exported triangles/vertices, instances,
materials and actual camera scale need evaluation rather than a universal threshold.
No candidate was promoted, rebuilt or optimized by this review. The new assisted route,
fidelity routing and budget/runtime extension remain unvalidated until exercised.

## Assisted stylized beanbag — UV/material review

This is continuation of the existing assisted session, not a request to start another
session or re-score the independent benchmark. The user supplied a session handoff for
`deepseek_beanbag_stylized_001`; its base-drift, whole-shape rebuild, manual-edit and initial
compression failure history remains session-reported, not independently reproduced here.
Its fixed mask heights, density targets and seam placement are asset-specific observations,
not general modelling rules. The reported historical geometry hashes were not independently
matched during this inspection.

Read-only live inspection found `beanbag_stylized_source_041_uv_bottom_seam_review.blend`
open with dirty state false, Object Mode and both occupied keys at zero. `Beanbag_Settled`
has 386 vertices / 768 edges / 384 quads, a level-1 unapplied subdivision modifier, and
Basis-relative `Occupied` / `Occupied_Strong` with 386 points each. Evaluation at that state
gave 1,538 vertices / 3,072 triangles. All 384 faces use the fabric slot; clay/checker slots
remain available. `Fabric_UV`, `Fabric_UV_Seam` and active/render `Fabric_UV_Seam2` exist.
The fabric has named UV Map nodes, while its tangent-space Normal Map UV field is empty;
an explicitly matched field would remove dependence on active/render UV selection. A final
link inspection confirmed `Fabric_UV_Seam2` feeds the fabric Mapping node. Dirty state
remained false, Object Mode and key values zero after inspection; no source save occurred.

Inspected captures under that asset's `captures/` include `uv2_checker_front_close.png`,
`uv2_checker_rear.png`, `uv2_checker_underside.png`, `fabric_bottom_basis_front_close.png`,
`fabric_bottom_strong_front_close.png`, `fabric_bottom_basis_rear.png`,
`fabric_bottom_basis_game.png`, and both `shading_clay_raking_sub1_close.png` /
`shading_clay_raking_sub2_close.png`. Front/rear fabric reads improved and the clay comparison
does not expose a clear faceting change at that view; it does not establish an all-view
shading diagnosis. The checker still shows size variation toward the lower body and severe
underside concentration. This is not a clean accepted delivery unwrap.

Independent source-face adjacency across matching UV edge endpoints found one 370-face
island plus 14 one-face islands and 36 discontinuous edges. The current height-threshold
seam recipe therefore does not produce a single clean bottom-cap island. Evaluated triangle
UV-area/world-area ratios reach about 571 near sole Z = 0.0023 m; this is a triangle/evaluated
measurement, not directly interchangeable with the handoff's maximum 351.08 calculated by
an unspecified aggregation. Neither extreme alone measures directional stretch. Next review
should isolate an inspected underside patch with only its perimeter cut, keep all shape/key
coordinates unchanged and verify the lower visible body as well as the bottom. No asset
edit, save, unwrap, export or in-game verification was performed by this review. Remaining
normal-map quality and material/UV acceptance are not waived.

### Follow-up review of `_047`

Read-only inspection of `beanbag_stylized_source_047_uv_bottom_cap_minstretch_review.blend`
found dirty state false, Object Mode, the level-1 subdivision modifier and both Basis-relative
occupied keys at zero. Independent UV-edge adjacency confirmed exactly 346 body faces plus
38 cap faces on render UV `Fabric_UV_BottomCap_MS`; source/evaluated counts remained
386 vertices / 384 quads and 1,538 vertices / 3,072 triangles. Historical preservation hashes
were not independently rechecked. The fabric's image-coordinate chain explicitly uses that
layer, but the tangent-space Normal Map UV field was still empty at inspection. Its active
render fallback currently matches; explicitly setting the field remains a setup follow-up.

Inspected all five `uv4_checker_*` captures (front close, rear, side, lower body, underside)
and all six `fabric_final_{basis,occupied,strong}_{game,front_close}.png` captures. The
fragmented underside/pinching problem is visibly improved; lower-body checker-size variation
remains, without an obvious disruptive fabric transition in these views. The review recommended
UV/material art acceptance at the intended stylized scale, not automatic user approval,
all-view perfection or game readiness. No model edit/save, export or runtime test occurred.
Next proposed stage is explicit tangent-UV binding followed by a separately approved
morph-preserving delivery plan; no further construction was warranted by the inspected views.

## Asset library coverage

Exercised in the pond-scene trials (2026-10-19–20, Blender 5.2.2, addon 1.8):

- Poly Haven models, HDRIs and textures
- Sketchfab static and skinned animated models
- Poly Pizza static and animated models

That is sample coverage, not blanket asset or exporter certification. Each new library
asset still needs its own identity, scale, axis, origin, licence and animation checks.
