# Openings and glazing (Blender 5.2.2 LTS)

Project policy from the Raptor RC glazing round; supplements the parent skill and `AGENTS.md`.
Load it for windscreens, side and rear windows, lamp lenses, grilles and any other glazed or
cut-out opening. It adds no authorization.

## Find the opening before building the pane

A pane is built from the opening, never floated near it. Locate the rim first.

- A shelled body has **no boundary edges at its windows**. Outer surface, inner skin and cut wall
  meet in interior loops, so `boundary_edges == 0` is compatible with four large openings. Never
  read a closed-solid report as "the body has no holes".
- The rim is the loop where the inner skin meets the cut wall. Enumerate candidate loops, print
  each one's length, bounding box, plane normal and area, then match them to the expected
  openings by position and size.
- Do not size a pane to the opening's bounding box: a curved opening leaves corner gaps. If the
  rim cannot be identified with confidence, stop and report instead of approximating.

## Build the pane

1. Copy the rim loop's vertices in world space and build one face, or a grid, from them; keep it a
   separate object named for the opening (`Glass_Windshield`, `Glass_Side_L`).
2. Inset it 1–2 mm behind the outer surface so it cannot z-fight the paint, and keep its perimeter
   inside the rim so it cannot protrude through the body.
3. Make the normals face outward. A single-sided pane with inward normals vanishes from outside or
   shades like a hole, and reversed panes also fail two-sided or backface checks downstream.
4. Give the pane its own UV island or its own material. Joining it into the body atlas buys one
   draw call and usually costs a seam right where the glass meets the paint.
5. Assign the glass material to the pane object explicitly. A rebuilt object starts with zero
   slots; the datablock existing proves nothing. Assert the slot list:
   `len(obj.data.materials) == 1 and obj.data.materials[0] is glass`.

## Sealing and clearance

- **Area.** Report pane area against opening area. The pane should match the opening within the
  intended inset; an area far below the opening means the rim was not followed.
- **Perimeter.** Sample the pane edge against the rim. Visible gaps at capture distance mean the
  pane is undersized; measure rather than eyeball.
- **Occlusion.** Cast a grid of rays from a plausible viewer position through the pane's bounds and
  count the first-hit object per ray. Hits other than the pane, the surrounding body and
  intentional overhangs (a roof light bar) name geometry in front of the glass. Fix the occluder
  at its source — move or trim the tube — never by clipping or hiding the pane.
- Report the sweep as object names and ray counts. One ray is not a sweep, and a clearance check
  that samples only tube end rings misses a long tube crossing the plane between them.

## Glass material

Choose one with the user and record which was used:

- **Alpha tint** — near-neutral base colour with a slight tint, Roughness 0.02–0.10, IOR 1.45,
  Alpha 0.4–0.6, `surface_render_method = 'BLENDED'`. Cheap, exports as glTF `BLEND`, and sorts
  badly where panes overlap.
- **Transmission** — `Transmission Weight` 1.0, Roughness 0.0–0.05, IOR 1.45. EEVEE needs
  raytracing enabled to refract; without it the pane reads as clear film. glTF needs
  `KHR_materials_transmission`, which the project loader may not support.

Alpha and transmission are not interchangeable: alpha also affects shadows and sorting, while
transmission keeps the surface in the depth buffer. Verify the look from outside **and** inside —
a pane that reads as glass from one side can read as a hole from the other.

## Failure modes seen in practice

| Symptom | Cause |
| --- | --- |
| Flat grey pane | No material slot after a rebuild |
| Dark bars crossing the glass | Cage, chassis or trim within a few mm of the plane; found by the sweep |
| Pane invisible from outside | Inward normals, or alpha far below the target |
| Flicker or z-fighting | Pane coplanar with the body surface; inset it |
| Corner gaps | Pane built from the opening's bounding box instead of its rim |
