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

## Asset library coverage

Exercised in the pond-scene trials (2026-10-19–20, Blender 5.2.2, addon 1.8):

- Poly Haven models, HDRIs and textures
- Sketchfab static and skinned animated models
- Poly Pizza static and animated models

That is sample coverage, not blanket asset or exporter certification. Each new library
asset still needs its own identity, scale, axis, origin, licence and animation checks.
