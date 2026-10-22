# Rigid furniture — unvalidated

**Status: unvalidated.** Candidate modelling procedures, not load-bearing design or
manufacturing certification. Follow the main skill's preservation and assembly checks.
For cushions read [soft goods](construction-soft-goods.md); for moulded continuous shells
read [curved products](construction-curved-products.md). Do not route all chairs alike.

## 1. Recognise members, joints and use

Identify seat/table height, width/depth, leg spread, back rake, member thickness,
curved/bent parts, joints and ground contact. Use measured reference dimensions rather
than silent ergonomic defaults. Decide visible underside, moving/folding parts and
closest view; these determine whether joinery and hidden faces must be modelled.

## 2. Choose by fabrication type

| If the part is… | First candidate | Failure to avoid |
| --- | --- | --- |
| Straight timber or plate components | Dimensioned extrusion/solid with scoped bevels | A bevelled bounding box replacing shaped joinery/profile |
| Bent tube or rod | Curve sweep with section and bend radius controlled | Twist, crushed cross-section or uncapped visible ends |
| Repeated slats, legs or fasteners | One proven member/joint, then Mirror/Array/instances | Multiplying a bad connection or shared-data mistake |
| A moulded seat/back | Profile-driven subdivision shell | Primitive stacks substituting for continuous curvature |
| Upholstered frame | Separate rigid frame and soft volumes | Deforming the frame to hide cushion fit problems |

## 3. Build one complete joint before replication

1. Establish support plane, primary dimensions and member centre lines. Block out seat,
   back and supporting frame without hardware, grain or decorative trim.
2. Build one leg/apron/seat joint or back-stile junction with actual member thickness
   and bevel settings. Keep parts and profiles editable.
3. Check evaluated contact, not just centre-line intersection. A nominal overlap smaller
   than combined bevel recession may read as a gap. Fit to the real host section;
   there is no universal millimetre penetration allowance.
4. Inspect front, side, top, underside and oblique joint close-ups. For a continuous
   rear leg/back stile, check alignment and continuity from both sides.
5. Test folded/open or other required operating poses. Then replicate the proven joint
   and recheck mirrored axes, ground contact and the complete frame.

**Editable controls:** member sections, seat/back rake, leg spread, bend path/radius,
bevel radius, joint endpoints, replication spacing and hinge axes. Align geometry to
the intended grain/fabrication direction where it affects shape or later UVs.

## 4. Respond to the actual failure

| Observation | Inspect first | Next test |
| --- | --- | --- |
| Rails appear disconnected | Evaluated bevel recession and joint coverage | Extend/fit that member to the host section, not decorative filler |
| Tube looks crushed or twists | Sweep frame, scale and section through bend | One bend at intended radius under silhouette/reflection views |
| Chair rocks/floats | Evaluated foot contacts and frame transforms | Check every intended support against the ground plane |
| Join flickers or shows internal faces | Coincident/intersecting exposed faces | Resolve the visible joint within approved Boolean/topology scope |
| Seat/back reads rigidly wrong | Profile, thickness, rake and shell transition | Correct section form before grain, seams or screws |

## 5. Decision and checks

If a primitive member cannot express the reference profile or joint independently,
test an extruded/profile-based alternative on that region. A failed joint does not
authorize reshaping a protected seat or rebuilding the full assembly.

Before detail, demonstrate proportions, member continuity, support contact and seat/back
thickness. Record hidden joints as unverified until inspected; an assembled object count
or object join is not connection evidence. Materials can provide grain, colour and fine
relief, but not missing members, open tube ends or visible hardware silhouette. Check
operating clearance separately from static fit. Follow shared mesh/assembly gates.
