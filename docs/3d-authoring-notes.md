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

## Asset library coverage

Exercised in the pond-scene trials (2026-10-19–20, Blender 5.2.2, addon 1.8):

- Poly Haven models, HDRIs and textures
- Sketchfab static and skinned animated models
- Poly Pizza static and animated models

That is sample coverage, not blanket asset or exporter certification. Each new library
asset still needs its own identity, scale, axis, origin, licence and animation checks.
