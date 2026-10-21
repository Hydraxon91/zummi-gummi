# Assembly acceptance and self-check loop

Project policy supplementing the parent skill and `AGENTS.md`, not additional authorization.
Use for assembly edits; apply relevant criteria to simpler assets without auditing unrelated
scene objects. Asset dimensions, protected-part exceptions and exclusions belong in the
approved task scope, not this standing procedure.

## Before each system

1. Inspect the actual scene, existing components and authoritative references. Inventory
   what exists before adding parts; avoid duplicate or concealed replacement hardware.
2. State the intended change and acceptance checklist: required features, protected parts,
   interfaces, neighboring systems, tolerances and evidence. Each reference feature must be
   modeled, explicitly excluded by scope, or unresolved—not silently omitted.
3. Record protected transforms, dimensions, fixed landmarks and baseline surfaces where
   preservation matters. Capture baseline views before editing.
4. Establish a new recoverable checkpoint. Preserve replaced geometry hidden in a clearly
   named source collection. Keep earlier checkpoints; never overwrite accepted source.

## Mandatory loop

Inspect reference → inventory → define acceptance → checkpoint → edit one system →
capture → **view captures** → measure interfaces → inspect neighboring/protected systems →
report each acceptance criterion → correct if necessary → proceed only after passing.

Automatic progression requires an approved ordered chunk. Otherwise stop at the parent
skill's step boundary. Two unchanged failures trigger diagnosis rather than another edit;
continue within the parent guide's seven-attempt ceiling only with new evidence. A newly
introduced defect triggers the existing regression stop. Do not save a failed stage as the
accepted delivery; clearly labeled diagnostic checkpoints are permitted. Stage render work by
decision: use bounds/viewport/solid checks during construction, and reserve multi-angle rendered
batches for acceptance or a targeted render-only diagnosis. Do not rerender unrelated views after
a small edit; two unchanged visual results mean diagnose the target and tool first.

## Shape gate before assembly

For assets where the visible form is the deliverable, separate primary-shape acceptance from
assembly acceptance:

1. Classify the form: fabricated hard surface, moulded product or soft goods.
2. Build only the silhouette, major sections, thickness and contact surfaces.
3. Capture neutral front, side, top and three-quarter views at matched framing. Use Workbench
   or solid shading; do not mask a weak form with materials or lighting.
4. Check the intended openings, hinge axes, seam placement and floor/seat contact.
5. Add secondary details, materials, seams, rigging and final export only after the shape gate
   is recorded as passed.

The structural checker can confirm bounds and editable state; it cannot prove likeness. A
failed silhouette is a stop, not a reason to add detail. Capture manifests carry a source
fingerprint, so edits invalidate prior captures. Record a silhouette approval only after
inspecting front/side/top/three-quarter views; `--stage detail` and `--stage delivery` refuse
to proceed without a matching approval. Factory-startup scenes also contain a default 2 m cube,
camera and light; remove them before capture or a review camera can sit inside the cube.

## Structural completeness and connectivity

### Evaluated interfaces and movable assemblies

Compare cage and evaluated surfaces before fitting subdivided shells. Cap shrinkage can
leave a gap despite identical control rings. Fix support construction before concealing
the symptom with trim. Check attachments with their host isolated and in all operating
poses; a closed view cannot establish open-assembly integrity. Joining is not welding,
and a separately seated component need not be welded.

Distinguish signed gap/penetration from unsigned nearest distance. State units, tolerances,
coverage and missing regions; inspect endpoints and transitions. Validate diagnostics on
touching, separated and intersecting fixtures. The laptop's earlier nearest distances did
not prove full perimeter contact. `check_interface.py` now provides an experimental local
sampled estimate; it is fixture-tested but is not a complete-contact or watertightness
guarantee.

Keep a candidate ledger: unresolved criterion, parent checkpoint, attempt number,
hypothesis, changed control and outcome. Filenames/techniques do not reset the budget.
Report evaluated mesh health, interface fit, reference likeness, motion and user acceptance
separately. Acceptance with reservations is not proof of perfect fit.

- Trace functional chains from support to supported component. For mechanical assemblies,
  record both endpoints of every link/damper and the actual component each attaches to;
  record spring seats, brackets, mounts, backing and retention devices where required.
- An isolated coil, shock body or carrier shape is not a complete supported assembly.
  Verify the chain in assembled views and with occluding parts hidden. Identify uncertain
  hidden construction as an estimate and obtain approval before implementing it.
- Check full local interfaces, endpoints and transitions for gaps and excessive penetration.
  Intended joints/fastener engagement can intersect; zero intersections is not the goal.
  BVH overlap counts alone are not a verdict. State the method, tolerances and uncovered
  regions; missing samples remain unverified.
- Preserve approved component positions; do not move wheels or reshape a host merely to
  make connections easier. Escalate a genuine incompatible constraint for a decision.

## Joints, bevels and continuous members

- Prefer one continuous member where a post/leg, frame rail or stile is structurally
  continuous. Two abutting bars with a small nominal overlap are not a joint once both
  sides are beveled; the bevel can open a visible gap. Size each rail, apron or stretcher
  to reach the centre of the member it joins, or deeper, and check both ends.
- Keep bevel radius in the fit calculation. A nominal 0.5 mm overlap on 4 mm bevels is a
  visible crease; a 20 mm overlap is a solid joint. Recess apron tops into the seat or
  table volume by more than the bevel radius rather than butting them against its face.
- Align a rear leg and back stile on the same axis. A 20–25 mm lateral offset reads as a
  step at seat height even when both parts are individually valid.
- Joining objects does not remove intersecting faces. `Ctrl+J` leaves internal surfaces
  that can z-fight; use a single Boolean-cut solid or a unioned component where the
  intersection would be visible.
- Coplanar/overlap counts are diagnostic, not acceptance. Hidden overlap is acceptable;
  visible flicker or z-fighting is the blocker. Confirm suspect joints through camera
  motion, not a still image, and do not treat an uncalibrated checker's count as proof.

## Enclosure footprints

- For cutaway rooms, verify the exterior corner and floor perimeter, not only the
  interior faces. Extend the meeting wall through the full thickness of the wall it
  joins, and extend the floor to the outer wall faces. Inspect exterior and top views;
  interior hero views hide both.
- For clamshells, model the seam as a mating profile, not a flat gap. The base may thicken
  toward the hinge and the lid toward the free edge; their outer widths should align when
  closed. Verify the side profile and a 1–2 mm seam in closed views before adding details.

## Capturing a placed asset

- When the user has posed an imported assembly, capture the root and every child's local
  transform, including rotation mode/quaternion, or export the posed hierarchy at
  identity as a new source. Reapplying only the root rotation does not reproduce per-part
  edits.
- Rebuild and compare world matrices against the live placement; report the maximum
  difference. Do not assume the imported child transforms match the saved source.


## Visual completeness and construction

- Use matching reference-only, overlay and neutral-solid comparisons under the calibrated
  reference rules. Inspect full outlines, openings, panel junctions and highlight flow,
  not just isolated dimensions or sampled heights.
- Include front/back, both sides and matching three-quarter views. Add top, underside,
  body-visible/body-hidden views and attachment close-ups as relevant to the checklist.
  Confirm the captures actually reveal the claimed features; framing alone is not proof.
- Check recess depth, backing, mounting and retention. Painted plates or emissive patches
  must not conceal missing lamp housings, openings, support structures or other required
  construction. Neutral shading precedes material review.
- Inspect pinching, waviness and local surface transitions. Blanket subdivision/remeshing
  is not evidence of a corrected shape. Preserve cavity normals; do not globally recalculate
  nested shells as a generic repair.

## Preservation and integration

- Recheck neighboring clearances and intended joints with the assembly together, after
  isolated-part checks. Include motion envelopes if motion is in scope; a still proves only
  static clearance. Do not invent travel limits where references do not establish them.
- Compare protected landmarks and actual exterior surfaces against the baseline. Unchanged
  transforms/dimensions/bounds alone cannot prove preservation. Use correspondence-based
  displacement where valid or sampled bidirectional surface distances; report sampling
  coverage, uncertainty and local maxima, not only averages. Do not claim exact preservation
  from sparse samples.
- An accepted arrangement is data, not a defect. When the user places or approves a part — a spare
  leaning in a bed, a bracket rotated for clearance — record it as accepted and do not re-pose or
  re-fit it because a metric disagrees. Report measured interference as information: classify
  intended contact (a tyre resting on a carrier, fastener engagement) against panel penetration,
  and ask before changing an accepted pose.
- Restore temporary visibility, selection, active object, shading and capture settings in
  `finally`, including failed captures. Retained comparison setups must be disclosed.

## Stage evidence and delivery

Report separately: **topology**, **reference fidelity**, **feature completeness**,
**connectivity/fit**, **protected-geometry preservation** and **integration with neighbors**.
For each, provide pass/fail/unverified, the inspected capture or measurement, and limitations.
Mark a criterion not applicable only with a reason; never turn unknowns into passes.

Include the endpoint/attachment table for connected hardware, baseline/after captures,
evaluated topology with intentional boundaries separated, local clearance checks,
surface comparisons, estimates and remaining mismatches. State saved path, dirty state and
delivery status (live, saved, exported, or integrated). A clean topology report does not
establish completeness, plausible construction or reference likeness. Do not claim visual
acceptance on the user's behalf.
