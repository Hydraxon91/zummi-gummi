# Soft goods and upholstery — unvalidated

**Status: unvalidated.** Project-authored candidate guidance; no model/agent success
rate is established. Follow the main skill's safety, calibration and approval rules.
Use for filled fabric forms, cushions, beanbags, padded seats and loose fabric.
For an underlying rigid frame also read [rigid furniture](construction-rigid-furniture.md).
Select fidelity through the main skill first. In stylized/gameplay-read mode use only
the approved required cues; follow [stylized game props](stylized-game-props.md) for
assisted production and delivery budgeting. A visible reference pleat is not automatically
required geometry. This does not permit omitting an approved cavity, lip or contact patch.

## Game-first application

Read the shared [game-asset contract](game-asset-contract.md). Keep loops for the
approved silhouette, sitting cavity, contact and any required deformation. Fine fabric
weave, dimples and small seams need not be geometry; omit or texture them according to
the brief. Do not turn a static game prop into simulated cloth or a dense sculpt by
default. Reuse fabric sources, keep source subdivision editable and compare the delivery
copy at game scale: reducing density must not close the seat or remove ground contact.

## 1. Recognise the form before choosing a method

Identify the filled volume, contact patch, sitting/loaded region, inner wall, outer
crown/rim and fabric tension directions. Mark each on an actual reference view.
Record viewing distance, whether the object must deform, and whether the reference
shows an unloaded or loaded state. Do not infer hidden upholstery construction.

## 2. Choose a starting method

| If the requirement is… | Start with… | Do not assume… |
| --- | --- | --- |
| One fixed, art-directed filled shape | A low-resolution quad cage with explicit contact, seat and back regions | Every quad cage needs the same ring layout |
| A simple rounded form with a shallow dent | A sphere-derived cage as a candidate; inspect poles and test the dent first | A smooth displacement preserves the outer crown |
| Drape, gravity-dependent folds or moving fabric | A separate cloth test with thickness/contact, scale and solver settings established | Simulation will reproduce an arbitrary photograph automatically |
| Irregular compressed padding needing local shaping | Scoped cage/sculpt deformation on preserved source | Remeshing is harmless to keys, UVs or controls |

Prefer the least complex method that passes the difficult-region test, not the method
with the fewest objects. Simulation, sculpting and topology replacement need their
own approved scope; this table does not authorize them.

## 3. Build only the representative region

1. Establish the outer masses and broad ground/support contact. Save the editable cage.
2. Define the seat footprint in width and depth before adding a raised cushion or folds.
   Inspect the floor, inner wall and front lip as separate regions, not one dark spot.
3. Record baseline coordinates for protected crown, rim and outside surfaces. Inspect
   cage poles and edge spacing across the intended deformation support.
4. Test footprint/transition controls while holding depth and cushion amplitude fixed.
   Then test depth separately. Keep each state in a key or recoverable checkpoint.
5. Compare cage displacement and evaluated subdivision-surface movement separately.
   Include the modifier's neighbourhood of influence in protection checks.
6. Inspect matched front, side, top and seat-oblique views; use calibrated reference
   overlays when the selected fidelity mode requires measured matching.
   Only after shape approval add structural folds, seam relief and material detail.

**Editable controls:** footprint width/length, seat floor, inner-wall slope, front-lip
height, crown, contact spread, symmetry and subdivision. Name coupled controls explicitly.
Use broad form for contact/compression; use bump/normal only for relief that does not
need to affect silhouette or parallax at the agreed closest view.

### Stable deformation inputs — unvalidated extension

For procedural deformation, identify and preserve the canonical cage/parameter coordinates
and the approved current shape as distinct states. Derive repeatable deltas from the named
baseline rather than normalizing already-deformed vertices as if they were the original
parameterization. Use separate controls/masks for coupled seat, rim, crown and contact
regions; choose their support from this asset's geometry, not fixed height thresholds.
Protect the grounded region and inspect intermediate states for unintended movement.

A pristine cage does not supersede manual edits. Rebuild only with explicit approval and a
recipe or correspondence that preserves/reapplies accepted changes and verifies protected
surfaces. Prefer a scoped deformation when it can meet the criterion; a different base is
not an automatic recovery for a local visual defect. Preserve both the baseline and manual
state before changing strategy. Compare evaluated world-space surfaces after depsgraph
updates; stale dimensions or unchanged object bounds alone cannot establish preservation.

## 4. Diagnose before another edit

| Observed failure | Inspect first | Next permitted test within approved scope |
| --- | --- | --- |
| Small lump instead of a seating area | Footprint and front/top reference landmarks | Enlarge footprint without increasing depth/cushion amplitude |
| Crown sinks when the seat deepens | Full displacement field, Gaussian tails, modifier support | Restrict support and measure protected surfaces; do not just raise the crown |
| Radial pinching | Unsubdivided edge convergence and displacement gradients | Isolate pole/support effects; do not add subdivision as a cure |
| Hard bowl or ring step | Floor-to-wall position and slope continuity | Revise the continuous transition, not a threshold-selected vertex patch |
| Floating or rigid-looking base | Contact area and lower side roll | Adjust contact form, not just object height |

## 5. Decision and category checks

Proceed only if the seat floor, inner wall, lip, crown and contact are demonstrated
in named captures and protected movement meets the agreed tolerance. Mesh health alone
does not prove a cavity, softness or contact. Check self-intersection separately where
folding/deformation makes it plausible; consistent winding is not that check.

If independent control still fails, show which intended edit moves which protected
region. A changed cage is justified only by that representative evidence, not by a
bad render alone. Stop on regression or the shared attempt limit; do not reset it by
renaming a technique. Record procedure coverage in the project notes before claiming
any tested scope; keep this module unvalidated until reviewed evidence supports more.
