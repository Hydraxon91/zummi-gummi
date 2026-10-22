# Curved products — unvalidated

**Status: unvalidated.** Project-authored candidate guidance, not a tested generator.
Follow the main skill; use for moulded shells, curved housings and swept/revolved parts.
Also read the category module when the product is furniture, a vehicle or architecture.

## 1. Recognise the geometric drivers

Identify section changes, curvature direction, symmetry, openings, rim thickness,
mating parts and operating poses. Distinguish a continuous moulded shell from assembled
panels. Establish whether the closest view requires physical thickness and interior faces.
Do not treat a paint boundary or reflected stripe as a structural edge.

## 2. Choose a starting method

| If… | First candidate | Main alternative / risk |
| --- | --- | --- |
| Sections change independently along the body | Sparse section-driven subdivision cage | A rounded box may couple cap and side curvature |
| The object is rotationally symmetric | Revolved profile with editable radius/height | Sphere scaling provides less direct profile control |
| A stable section follows a path | Curve sweep with controlled orientation | Freehand mesh deformation may introduce twist |
| Surfaces are mostly planar with local machined cuts | Panels/solid plus editable booleans and bevels | Subdivision may unnecessarily couple flat faces and openings |

Choose by the actual part. A mixed product may need more than one construction method.
Do not default every housing to a bevelled cube or every opening to a Boolean.

## 3. Prove the tightest transition

1. Build only the main sections and symmetry at the agreed physical scale.
2. Keep sections sparse enough to edit independently. Add support where curvature needs
   it, not a uniform high subdivision level that hides the cage.
3. Test one cap-to-side transition plus the tightest rim/opening and shell thickness.
   Keep source profiles, cutters and modifiers editable.
4. Inspect neutral solid and broad strip-reflection views. Move the view: a static
   highlight can conceal a dent or a flat spot. Keep diagnostic materials temporary.
5. Evaluate shell thickness and mating surfaces, including cap/subdivision shrinkage.
   For moving parts test closed and operating poses before replication or trim.

**Editable controls:** section positions, section shape, support-loop spacing, symmetry,
wall thickness, opening boundary and sweep/revolution axis. A material split must not
duplicate a shell. Use graphics and fine grain as textures after the surface is approved.

## 4. Diagnose failures

| If you see… | Inspect… | Test next |
| --- | --- | --- |
| Pinching by an opening | Cage topology, support spacing and nearby curvature | A local boundary/support revision before increasing subdivision |
| Highlight waviness | Section progression and pole placement | Simplify/reposition controls; compare the same reflection view |
| Flat-face shading smears | Actual planarity and evaluated normals | Correct the geometric cause before stacking normal modifiers |
| Rim or cap shrinks away from a neighbour | Evaluated surface versus cage | Revise cap/support construction, not filler trim |
| Sweep twists or intersects itself | Path curvature, frame orientation, section size | Test one bend with the actual cross-section |
| Bevel vanishes near a cut | Thin features, nearby edges and overlap clamping | Diagnose the limiting feature; do not globally disable safeguards |

## 5. Change-of-method gate and checks

If section edits cannot control the tightest transition without changing protected
surfaces, compare a small alternate construction under identical lighting and framing.
Propose a method change only when the comparison demonstrates the control difference.

Acceptance evidence must show silhouette, opening, thickness, reflection continuity
and evaluated mating fit separately. A shiny hero view does not prove the hidden wall
or the complete interface. Use [openings/glazing](openings-and-glazing.md) where applicable
and the shared assembly checks. No detail, bake or export while required form is missing.

## Related reading, not validation

[Blender Expert hard-surface guidance](https://github.com/edemaistre/blender-expert-skills/tree/main/blender-hard-surface)
discusses planar Boolean/bevel versus curved subdivision approaches. This guide is
project-authored synthesis, not its toolkit or a transfer of its claimed test results.
