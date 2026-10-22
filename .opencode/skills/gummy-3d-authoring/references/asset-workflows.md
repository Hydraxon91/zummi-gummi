# Asset workflows (Blender 5.2.2 LTS)

Selectively adapted from EL4CTEO/blender-skills; see `../THIRD_PARTY.md`.
These procedures supplement, never replace, the parent skill's approval gates.

## Local reporting tools

The scripts do not repair objects or write files. For live use, first inspect the scene
and choose explicit mesh names. Run in Object mode; do not switch out of a user's Edit
mode merely to get a report. Example inside Blender MCP (replace the path and names):

```python
import importlib.util
spec = importlib.util.spec_from_file_location("gummy_asset_qa", "/absolute/skill/path/scripts/asset_qa.py")
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
print(qa.run(objects=["Body"], closed=True))
```

`texture_inventory.py` also uses this loader, with `run(objects=["Body"])`. It inventories
images and dependencies without evaluating shaders or traversing node groups. Inspect its
limitations before interpreting missing connections, especially AO and grouped materials.

For UV density use
`run(objects=["Body"], resolution=[2048, 2048])`. Resolution is the intended texture
size, not an inferred material property. Density includes world transforms and scene
unit scale (metres per Blender unit). Multiple materials, UDIMs and differently sized
textures require separate interpretation; the report does not resolve those for you.

From the repository root, inspect an already-approved export:

```sh
python3 .opencode/skills/gummy-3d-authoring/scripts/glb_report.py path/to/asset.glb
```

Report vertex accessor counts both per unique mesh primitive and per node instance.
Neither number is a measured GPU workload; repeated accessors can be counted more than
once. Compressed primitives, non-triangle modes and missing counts are reported as
unverified rather than assigned zero triangles. Run Khronos validation separately.

QA distinguishes boundary, wire and >2-face edges. Closed solids require all to be zero;
open panels allow boundaries only, whose expected location must still be inspected.
Winding conflicts and negative per-component signed volumes are diagnostics, not proof
of outward normals. A deliberately reversed inner cavity shell needs semantic review.
Degenerate faces, zero-length edges and loose vertices fail the health gate. No automatic
recalculate-normals, merge-by-distance, fill-holes or scale application follows a report.
Z-fighting, detached parts, penetration, duplicate vertices, UV overlaps, weights and
Face Orientation remain separate inspections; the helper does not certify them.

## Shape-first authoring

Choose the construction method from the form, not from the previous asset:

| Form | Starting method | Avoid |
| --- | --- | --- |
| Fabricated hard surface | panel blockout, booleans, bevels, mechanical joints | sculpting a product shell from primitives |
| Moulded plastic product | calibrated plan/profile cage, lofted sections, shell thickness, controlled subdivision | stacking beveled boxes and calling it a shell |
| Soft goods | quad cage with broad contact, seat/fold deformation, subdivision | Boolean subtraction from a sphere |

Before adding detail, pass a **shape gate**:

1. Build the primary silhouette and major cross-sections only.
2. Inspect neutral front, side, top and three-quarter captures at matched framing.
3. Check thickness, openings, hinge axes and the intended contact surfaces.
4. Record the gate result, then add secondary geometry.
5. Add materials, textures, seams and delivery exports only after the shape gate passes.

Use `tools/asset-pipeline/scripts/capture_review.py` for cheap staged captures:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/capture_review.py -- \
  --out-dir .dev-shots/review --preset solid --prefix Asset_ \
  --views front,side,top,three_quarter --isolate
```

Use `tools/asset-pipeline/scripts/check_shape_gate.py` for bounds, hinge presence,
default-scene hygiene and editable-modifier state:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/check_shape_gate.py -- \
  --out .dev-shots/review/shape-gate.json --prefix Asset_ \
  --hinge Asset_Hinge --stage silhouette \
  --review-manifest .dev-shots/review/asset_captures.json
```

Captures embed a source fingerprint; a manifest is stale after a source edit. After
inspecting the four shape views, record a silhouette approval. `--stage detail` and
`--stage delivery` refuse to proceed without a matching approval:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/check_shape_gate.py -- \
  --out .dev-shots/review/shape-gate.json --prefix Asset_ --stage silhouette \
  --review-manifest .dev-shots/review/asset_captures.json \
  --record-approval .dev-shots/review/silhouette-approval.json \
  --approved-by "your-name" --note "Reviewed front/side/top/three-quarter"
```

The approval records the review manifest hash, required views and capture hashes.
`--stage detail` rechecks that evidence; deleting or editing a capture, or changing the
source, invalidates the approval. The default required views are
`front,side,top,three_quarter`.

The fingerprint covers transforms, mesh/UV data, materials and shader graphs, modifiers,
constraints and custom properties. It does not hash external image bytes, linked files or
render-only state; document those separately when they matter. The gate is structural; it
does not prove reference likeness, so inspect the captures before approving.

Export only through the approved entry point:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/export_approved_asset.py -- \
  --root Asset_Root --glb out/asset.glb --report out/export.json \
  --approval .dev-shots/review/silhouette-approval.json
```

The prototype builders save their source and block GLB export without a matching approval.

**Scene hygiene:** a `--factory-startup` scene contains a 2 m default cube, camera and
light. Delete them (or inventory them explicitly) before building or capturing. A review
camera can end up inside the default cube, making every render look like a wall.

**Source vs delivery:** keep cages, booleans, subdivision and hinge controls editable in the
source. Triangulate, apply and merge only on an export copy.

## Live MCP shape loop

Use Blender MCP as the primary loop for form decisions:

1. `get_scene_info` for file, dirty state, selection and object inventory.
2. `look` at the viewport or `angles` for the actual target before editing. Use `topology`
   when cage health matters and `frames` for hinge/motion checks.
3. Establish or save a recoverable checkpoint before a destructive edit.
4. Make one small, local cage/edge-loop/proportion change on the intended object.
5. `look` again and compare against the reference landmarks. Correct before adding detail.

Do not regenerate the whole asset after every observation. Scripts are appropriate for
repetition, symmetry, measurements, captures and export preparation. Verify the installed
add-on's actual `look` modes and returned image; the documented `angles`, `topology`, `rig` and
`frames` modes are not proof that this build supports them. On add-on 1.8, including the
protocol-14 build, `angles` and `frames` work but `topology` returns "There is no topology
mode"; use `shading="wireframe"` and direct mesh checks there. MCP `look` restores temporary
camera/shading settings, but confirm the viewport state after first use.

Use `capture_review.py` when reproducible, hash-linked evidence is required; it does not replace
live inspection during construction.

## Hard-surface modeling

1. Choose the workflow before detailing: mid-poly bevel + normals for many game props;
   high-to-low baking for unique detail under a tight budget; subdivision for smooth
   source surfaces. No fixed triangle budget replaces the user's target and camera scale.
2. Block out at the agreed real scale; settle primary silhouette before secondary cuts
   and tertiary details. Preserve the approved reference calibration and axis convention.
3. Inspect object scale before distance-based modifiers. Apply transforms only in the
   approved scope, checking parenting, animation, mirrors and shared mesh users first.
4. A common stack is Mirror → Boolean → Bevel → Weighted Normal. It is a starting point,
   not a universal order. Inspect every stage; discover available solvers/enums in the
   installed API. Keep closed cutters in a separate collection and extend them past the
   cut surface to avoid coplanarity. Preserve operands and an editable source.
5. Size bevels in physical units appropriate to the part. Clamp overlap and inspect tight
   corners; do not mask a failed boolean with a large bevel. Weighted normals need suitable
   smooth shading and sharp edges; inspect flat-face gradients in neutral solid/matcap.
6. Planar, non-deforming n-gons can be acceptable; curved/subdividing/deforming surfaces
   need controlled topology. Put poles away from curvature peaks and bending regions.
   Spend segments on visible curvature, not hidden bolts or flat faces.
7. Triangulate the bake/export copy consistently to preserve tangent-space shading.
   Keep source modifiers unapplied unless explicitly approved. Re-run health checks and
   inspect all required views after each meaningful change.

## Materials, baking and procedural sources

- **PBR materials:** read [pbr-materials.md](pbr-materials.md). Use image-texture →
  Principled chains for glTF; bake procedural shading first. Set `sRGB` on color/emission and
  `Non-Color` on data maps. Verify alpha mode, ORM channels and normal orientation in the
  exported GLB rather than inferring them from the Blender viewport.
- **Baking:** read [texture-baking.md](texture-baking.md). Prepare UVs, scale, cage/extrusion
  and triangulation before baking. In 5.2.2, use `bpy.ops.object.bake(type=...)` for AO,
  combined and other passes; `scene.render.bake.type` exposes only normal/displacement.
  Curvature is not a built-in pass and can be derived from the baked normal; ID needs a
  material/emission override. Save target images explicitly and restore all temporary bake
  state.
- **Geometry Nodes:** read [geometry-nodes.md](geometry-nodes.md). Keep the graph editable,
  expose only meaningful inputs, use stable seeds and realize instances late. Export the
  evaluated result or supported instances; measure the evaluated counts. Geometry Nodes is
  not a runtime dependency of the browser game.
- Do not install the upstream script suite or its dependencies. Any helper added here must be
  project-local, audited on the pinned Blender build and exercised on synthetic fixtures.

## UV and baking preparation

- For UV/material-only work, preserve ordered mesh connectivity, base and all shape-key
  coordinates/settings, transforms and modifiers. Compare geometry-only records before/after;
  the whole-asset fingerprint legitimately changes with UVs/materials. Do not rebuild or
  remesh to fix mapping. Keep existing layouts and work in a newly named UV layer unless
  overwriting is explicitly approved.
- Prefer deliberate seams hidden from the main view; for tangent-space normal bakes,
  hard normal edges generally need UV splits. A UV seam need not be a hard normal edge.
- Select seam boundaries by topology and inspected surface ownership, not just a coordinate
  threshold: selecting every coplanar edge can split a bottom region into individual faces.
  Inventory connected UV islands after unwrapping. A continuous prominent surface plus a
  separate cap may be useful, but neither one-island layouts nor underside cuts are universal
  requirements. Intentional fabric seams and accidental texture discontinuities are different.
- Choose seam-based unwrap for controlled islands, minimum-stretch for suitable organic
  forms, or smart projection for appropriate hard-surface blockouts. Verify the actual API.
- Use a checker texture to inspect stretching and orientation. Compare texel density
  across parts at the intended texture resolution; do not enforce a universal px/m value.
- Inspect checker squareness/shear, pattern scale and seam response across approved prominent
  surfaces, rear, underside and required deformation states. Add close-ups where features are
  actually exposed; hide occluders temporarily and restore them. An area ratio measures density,
  not directional stretch. Report worst regions with their face identity/location and affected
  surface area, plus robust/area-weighted summaries where available. A tiny extreme is not a
  whole-asset diagnosis, but a good median cannot excuse collapse or severe pinching. Hidden
  distortion needs explicit acceptance under the brief, not an automatic delivery exception.
- Distinguish repeatable fabric UVs from unique bake/paint layouts. UVs outside 0–1 can be
  intentional for tiled textures with verified repeat sampling; they do not establish unique
  bake suitability. Packing can rescale islands: verify density afterward and scale deliberately
  in consistent units. Do not copy another asset's margins, density target or scaling constants.
- Choose pixel padding for the expected mip chain and texture size. Packing success does
  not establish adequate padding or absence of overlap. Deliberately mirrored/stacked UVs
  need separate treatment for unique AO/normal bakes; preserve their baseline before edits.
- `pack_islands(margin_method='SCALED')` scales the margin by island size, so small islands end up
  below the target gap. Use `'ADD'` with `margin = required_px / texture_size` and measure the
  resulting padding instead of trusting the operator's success.
- Record the acceptance numbers before unwrapping: island count, per-triangle density spread
  (p5/p95), zero-UV faces, non-mirror overlaps, padding in pixels, UV bounds and atlas
  utilisation. `uv_report.py` reports density, zero-UV and outside-0-1 only; overlap, padding
  and utilisation still need a separate check and remain manual.
- Degenerate and sliver UV islands usually come from sliver geometry — bevels, near-coincident
  edges, tiny n-gons — not from the unwrap. Remove or fix the sliver source before re-unwrapping
  and re-check the island count; an unwrap that keeps producing them is reporting a modelling
  defect.
- After joining objects into one textured mesh, re-unwrap the merged object as a unit. Per-part UVs,
  seams and density seldom survive a join that adds topology, and duplicate material slots must be
  consolidated deliberately.
- Livery and pattern rules must be positional — symmetric about an axis, bands by height — not
  driven by face normals. Normal-based masks produce per-face patches on curved surfaces and break
  across a seam. Verify by sampling the baked texture at face centres against the intended rule
  (for example "0 of 747 up-facing faces sample the dark paint"), not by eye.
- Automatic retopology/remesh can erase UVs and reshape silhouettes. Work on a separate
  copy, obtain approval, and recheck all reference silhouettes. Do not voxel-remesh thin
  open panels as a generic cleanup. Deforming assets need edge-flow/deformation checks.
- Missing UVs are not inherently a defect for an untextured material; report the intended
  material/baking requirement before choosing a fix.

## Optimization and GLB delivery

- Establish a user-approved budget for triangles, exported vertices, material primitives,
  texture memory and file size. Web defaults from another project are not our budget.
- Measure first. Consider genuinely invisible geometry and unnecessary planar density
  before decimation. Preserve legitimate internal mechanics and visible cavities.
- Optimize copies. Compare each LOD at the intended viewing distance and all silhouette
  angles. Do not join large areas merely to reduce draw calls and lose useful culling.
- UV seams/hard normals can split exported vertices; use export counts, not only Blender
  source counts. Material primitives and instances affect runtime submission costs.
- Export only the approved objects/path. Preserve agreed origin and axes; glTF handles
  Blender Z-up → Y-up. Do not impose another asset's forward axis or apply extra rotation.
- Check image textures, normal map convention, supported Principled inputs and required
  extensions. Procedural shaders generally need baking for faithful glTF delivery.
- Default to no new compression requirements. Meshopt, Draco, WebP and KTX2 choices need
  loader/browser verification and separate approval for dependency/runtime changes.
- Run `glb_report.py`, then Khronos validation when available. Inspect the exported result
  separately from its Blender source. In-game appearance/performance verification requires
  separately approved integration; a successful export is not game readiness.
- For a unified Phase 2 report, run
  `node tools/asset-pipeline/scripts/verify_asset.mjs` with the manifest, profile and
  provenance as described in `tools/asset-pipeline/README.md`. It records inventories,
  validator results, clean import and standalone preview captures without changing the
  game loader. A validator pass does not prove appearance, and capture existence does not
  prove visual inspection.

## Verification

Run the isolated fixtures from the repository root (no live scene is opened or saved):

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python .opencode/skills/gummy-3d-authoring/scripts/test_helpers.py
```

This tests synthetic geometry and GLB containers, not reference fidelity or rendering.
True orthographic overlays and exception-safe captures remain governed by the parent
skill. The upstream perspective review-shot helper is deliberately not installed.
