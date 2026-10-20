# Shared atlas delivery and selectable resolutions

Work only on an approved disposable delivery copy. Preserve the editable scene, source UV
layers, resolved materials, transforms and source checkpoint. A combined drawing of independent
0–1 layouts is not a shared atlas. No source cleanup or semantic name guessing is implied.

## Resolution controls

Material-only details are a separate approved delivery treatment, not discarded geometry.
`repacked_transfer_check.py --material-policy <policy.json>` checks schema 1 object rules
(`treatment: preserve_existing_material`, exact ordered `materials` list), verifies each
selected object's resolved slots, and records excluded objects as MATERIAL_ONLY_NOT_TESTED.
No geometry, UV or original material graph is modified. RaptorRC's policy preserves the
grille mesh and six hood louvres; its trim diagnostic then tests 39 objects and accounts for
seven material-only details separately. A PASS under this policy is mapping evidence only;
it does not waive padding, complete tags or export validation.

For mapping diagnosis, `repacked_transfer_check.py --margin 0 --no-render` can distinguish
coverage errors from padding contamination; it does not validate deliverable padding.
Raptor trim control: all 46 isolated zero-margin reports exactly match the full-sheet
zero-margin reports, while margin 4 introduced batch-only errors (including the skid plate).
Investigate object-by-object bake dilation versus atlas gutters before changing geometry.
Do not adopt zero-margin images as a final mip-safe texture solution without separate checks.

Sample the actual pixel centre: floor the requested UV to a texel, verify its centre is still
inside the triangle, and interpolate expected source UVs at that centre. Comparing a texel
against the original unrounded point falsely fails thin triangles; a large triangle area
alone does not guarantee a usable sample. `transfer_sampling.py` implements this calculation;
`test_transfer_sampling.py` tests it in plain Python. The checker reports uncovered triangles
separately and uses maximum valid sample error. Corrected grille samples have max error
0.0381%, but resolution-limited/uncovered triangles still prevent acceptance.

Checker validation (2026-10-20): `test_repacked_transfer_blender.py -- --out <unused-directory>`
in disposable background Blender exercises metallic rotated UVs (must pass) and intentionally
stacked target UVs (must fail). `repacked_transfer_check.py --object <exact-name> --no-render`
can isolate a mapping test without a render. The skid-plate test at 4096 sampled 156 triangles
with p95 0.067%; no layout repair was necessary. This validates that case, not every shader,
small-island classification, hidden surface or the original material's PBR channel transfer.

Extended fixtures also cover all-subpixel inputs (INCONCLUSIVE) and resolved source charts
squeezed below a target pixel (FAIL). Empty sampled sets produce null errors, not a crash.
Reports include world-area coverage and area-weighted mean error, and aggregate per-object
verdicts conservatively. A mixed-object fixture verifies that 200 correct triangles cannot
hide four triangles on a failing object: pooled p95 0.199%, failing-object p95 50.04%, overall
FAIL. These five fixtures validate the tested cases, not the whole truck.
The legacy `collapsed_faces` field counts below-pixel resolution loss, not necessarily zero
UV area. Three-point median sampling remains sparse evidence, not complete surface coverage.

- `--atlas-resolution 4096`: intended delivery packing/bake size.
- `--guide-resolution 1280`: preferred local-generation guide size.
- `--resolution 1280`: shorthand setting both values to one size.

**Current implementation limit:** `uv_island_export.py` writes every image and mask at
`--guide-resolution`. `--atlas-resolution` is recorded as metadata, not rendered; manifests now
set `atlas_images_written: false`. Do not describe a guide set as 4096 until a real 4096 pass is
implemented and its saved PNG dimensions are checked.

The same normalized UV layer is used at each image size: changing resolution must not repack.
Each guide image/mask/label uses its own pixel resolution. Dilation is in guide pixels; requested
packing margin is in atlas pixels. Neither guarantees usable small islands or adequate bleed at
another resolution. Report sub-pixel regions and measure gaps. Upscaling AI output adds no detail.

The island exporter renders guide-resolution files; its atlas-resolution metadata is not a
claim that it has packed or baked an atlas. Packing is a separate authoring operation.

## Validation and publication

`uv_atlas_checks.py` tests positive-area triangle intersections across objects and within each
island using actual loop triangles. Shared edges alone are not overlaps. The finite numerical
tolerance is 1e-12 normalized UV area; this is not a padding or reference-fidelity test.
Fail atlas mode on detected overlaps, degenerate UV triangles or out-of-bounds coordinates.
Long conflict lists can be capped; a truncated report is a failure, never a pass.

The exporter stages under `<output>.staging`, publishes by renaming only after success, and
leaves `FAILED.txt` beside any failed partial output. Never clear/retry a failed stage blindly.
`--layout composite` is explicitly diagnostic; it is not accepted as a paintable atlas.

ID colours use an injective 24-bit permutation with the background reserved. Resolved face
material slots drive zone mapping; an island spanning multiple slots fails pending per-face
zone support rather than silently taking slot zero.

## Scripts and verification

- `atlas_delivery.py`: approved preparation of a separate evaluated scene, with original UVs
  retained and source images explicitly bound to those UVs. Saves a new layout checkpoint only.
  `--unwrap smart` or `--unwrap seams` are alternative methods, not permission for endless retries.
- `atlas_failure_report.py`: read-only failed-checkpoint diagnostic and highlighted wireframe.
- `test_uv_atlas_checks.py`, `test_uv_id_colours.py`: pure Python correctness fixtures.
- `test_atlas_pipeline.py`: disposable background Blender fixtures for staging, separate/shorthand
  resolutions and rejection of cross-object overlap before image publication.

Raptor trials: Smart projection failed, and original-seam unwrap also failed (24 self-overlapping
islands and 48 degenerate triangles). A third attempt used per-face charts for the failing
objects and repaired Body_Shell, Coils, Firewall, cowl/louvres and chassis, but 8 objects still
fail (dashboard inset, rear-lamp housings/lenses, reservoirs). All three remain explicitly
FAILED checkpoints; no bake or final atlas is claimed. The stop rule is active: do not run
another blanket unwrap.
Audit correction: zero-area UV triangles are not automatically source degeneracy. The exporter
classifies collapsed UVs (non-zero world-space source area) separately, fails on them, and only
permits zero-area UV triangles whose 3D triangle is also zero. Use normalized UV area and
world-space 3D area; local-space area and pixel-space thresholds misclassify scaled objects.
Unit-consistent audit: attempt 002 has 0 collapsed UVs and overlaps in 12 objects; attempt 003
has 3 collapsed UVs and added sub-pixel overlaps to five objects that were clean in 002, so
re-unwrapping healthy objects regressed them and 002 is the better baseline. Independent
hull-based verification of 003 found 64 intersections, 15 within one face. Chart-local plane
reprojection and a chart-local seamed unwrap both failed on the Firewall; the latter's pack step
moved non-target charts. Treat `atlas_chart_repair.py` and `atlas_chart_unwrap.py` as diagnostic
tools, not a repair pipeline, until a controlled chart workflow is approved.

Single-component proof procedure (use before any whole-vehicle atlas): evaluate the object,
copy it to a new scene with its resolved materials, add a separate UV layer, set seams from the
authored UV discontinuities plus open boundaries and sharp angles, unwrap and pack, then measure
overlaps, relative texel density, corner-angle error, bounds, geometry hash, source-UV hash and
a checker render. Bake the original material into the new layer and compare sampled values.
Decode byte textures from sRGB to linear before comparing them with a floated bake; comparing
raw `Image.pixels` values across the two conventions can falsely report ~26% error.
Raptor result on `Dashboard_Main`: 7 islands, median density 1.008, geometry/source UVs
unchanged, bake within 1.5%, but 30 positive overlaps remained (one real band overlap plus
near-degenerate slivers). It is a failed proof, not a delivery. Do not claim bake success as UV
validity, and do not skip the pack step after unwrap.

Whole-truck repack-only trial: evaluating all objects and globally packing their authored UV
charts (no unwrap) preserves chart shapes but still fails. Raptor's 194 objects / 5,657 islands
produced 28 same-island overlap pairs and 86 collapsed UV triangles with non-zero source area
(mostly Interior_Firewall and glass), plus 7 sub-visible source slivers (<1e-9 m²). Global
scaling makes tiny charts numerically collapse; this is the limit of one 0–1 atlas across a
whole vehicle. `--allow-overlap` now bypasses only the overlap preflight and records
`overlaps_allowed`; collapsed UVs remain fatal. `triangle_health` reports source-zero and
sub-visible sliver triangles separately from new collapses.
Category sheets are the working delivery: five repacked sheets cover all non-body meshes and the
body guide covers `Body_Shell`. Compare target UV area against the authored UV layer so inherited
source-UV degeneracy is not reported as a new collapse; do not reuse a UV-layer pointer after
creating another layer (copy values first). Raptor sheets include explicit overlap/collapsed
exceptions, skipped tiny masks and legend-only labels recorded in each manifest.
Verify a repacked category by baking a UV-space gradient through the authored UV layer into the
repacked layer and comparing per-face centroids at atlas resolution. Use an **Emission** bake:
Diffuse Color is black on metallic/transmissive materials and falsely fails. Exclude faces whose
repacked triangle is below one pixel and report conclusive coverage separately. Raptor wheels:
15,400 faces, median 1.29%, p95 2.20%, max 2.27% at 4096; at 1024 the tread islands are sub-pixel
and the test falsely fails (p95 55%). Small-island sheets require 4096.

Texture transfer must subsequently include all required channels, matching source UV semantics,
normal-map tangent basis and transparency. Keep glass/rubber/metal behaviours distinct. Verify
before/after captures and a clean import before claiming delivery; layout alone is insufficient.
