# Construction-method brief

Use before building a primary form or changing construction strategy. This supplement
does not authorize edits or replace calibration, shape approval or interface checks.
Record concise decisions and observable evidence, not hidden reasoning.

## Template

- **Target/evidence:** reference landmarks, dimensions, units, coordinate space and uncertainty.
- **Reference calibration:** authority view, crop rectangles, pixels-per-metre scale, plane
  collection and the overlay captures used for the gate. If no reference was supplied, state
  that explicitly. Calibration must exist before the first geometry edit; dimensions agreed
  only in chat do not count.
- **Geometry drivers:** silhouette, section progression, curvature, thickness, openings,
  interfaces and operating poses. Identify protected surfaces/transforms.
- **Construction routing:** modules read from the main skill's routing table, their
  validation status, and which conditions make their candidate methods applicable.
  State a routing gap explicitly; an unvalidated module still needs a representative test.
- **Method:** chosen approach, why it fits, and the principal alternative's drawback.
- **Editable controls:** source cage/profiles, symmetry, support loops, thickness,
  hinge/sweep axis, modifiers and recoverable source.
- **Geometry/material split:** list features that must be modelled (silhouette, thickness,
  openings, parallax, attachment, articulation, deformation) and features that can be
  texture/material (printed graphics, fine relief, roughness, colour boundaries). State the
  closest intended viewing distance used for the decision.
- **Risks:** pinching, cap shrinkage, intersections, gaps or excessive geometry; what
  observation would disprove the choice?
- **Representative test:** difficult corner/section/interface before replication; captures
  and evaluated checks with agreed tolerances and explicit unverified regions.
- **Decision:** proceed, revise or stop; link evidence and the criterion's candidate ledger.

Separate method review from mesh health, evaluated attachment, likeness, motion and user
acceptance. Follow `assembly-verification.md`; do not conceal failed construction with trim.

## Selection prompts (not validated recipes)

| Geometry driver | Candidate method | Main risks |
| --- | --- | --- |
| Moulded changing sections | Bridged loops / subdivision cage | Cap shrinkage, rim support |
| Rotational symmetry | Revolved profile | Poles and curvature |
| Section following a path | Sweep / loft | Twist and self-intersection |
| Fabricated panels | Panels, booleans, bevels | Wall thickness and corners |
| Soft goods | Quad cage with contact/deformation | Artificial symmetry, bowl-like form |
| Progressive organic coil | Transformed sections / parametric sweep | Accumulated scale and winding |

Choose from geometry, not names: a coiled shell and a hinged laptop clamshell need different
construction. Derive counts/offsets from scale and curvature, not tutorial constants.
Preserve procedural sources before applying arrays or bridging evaluated copies.

## Laptop example (illustrative, not a validated pattern)

Two moulded shells have opposing thickness tapers, a shared closed seam and a hinge axis.
Candidate: rounded section loops bridged into editable cages, with deliberate rim support
and cap topology. Alternative: stacked slabs are quick blockouts but poorly express the
changing sections and mating interface. Test a front/side rim and cap under subdivision,
open and closed, before details. A shared cage seam does not prove evaluated contact.
A floating filler ring is failed construction, not a successful interface.

## Geometry versus material (laptop illustration)

Model geometry for the shells, hinge, bezel opening, key depth/spacing and any feature that
changes the silhouette, attachment, parallax or shadow at the intended view. Use texture or
material for key legends, screen imagery, printed labels, colour boundaries and fine plastic
grain. A raised bezel is geometry; a painted line around it is not. Normal maps can add
surface relief but cannot create an opening or change the silhouette. Decide at the closest
intended viewing distance, not by a size threshold alone. For export, baked textures are
static; procedural node graphs need a tested bake or an approved simplification.
