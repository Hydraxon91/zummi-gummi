# Houses and buildings — unvalidated

**Status: unvalidated.** Project-authored construction guidance, not architectural,
engineering or building-code certification. Follow the main skill and approved scope.

## Game-first application

Read the shared [game-asset contract](game-asset-contract.md). Budget visible modules
and their repeated use, not only one facade. Prove a module before repetition; reuse
materials/UV scale where suitable and preserve project batching/instancing ownership.
Do not build inaccessible interiors, hidden joinery or physical bricks unless required
by views or gameplay. Required reveals, overhangs and cutaway thickness still need form.
Keep collision/navigation requirements distinct from render detail. Check module seams,
material primitives and shadow cost at representative repetition before runtime claims.

## 1. Identify the viewing and construction contract

Record plans/elevations, units, footprint, storeys, floor/roof levels, wall thickness,
opening dimensions and roof pitch where known. Mark estimates. Decide exterior-only,
visible interior, cutaway or walkthrough. Identify moving doors, modular repetition,
collision requirements and intended camera distance without assuming game integration.

## 2. Choose a method by structure

| If… | Start with… | Watch for… |
| --- | --- | --- |
| A unique house follows a measured plan | Extruded wall/floor/roof components with explicit junctions | Corner overlaps, missing returns and uneven thickness |
| Bays, windows or floors repeat | One proven module, then Array/instances | A repeated defective junction or shared-data edit |
| Walls contain many rigid openings | Closed wall solids and scoped editable cutters | Thin reveals, coincident cuts and wrong cutter collection |
| Walls are deliberate open panels | Surface plus controlled thickness | Treating open source panels as closed solids in diagnostics |
| A roof or facade has continuous complex curvature | Profile/section method from curved products | Primitive stacking that misses the silhouette |

Use [curved products](construction-curved-products.md) for the last case. A facade
texture cannot replace an opening, reveal or roof overhang visible at the intended view.

## 3. Prove a junction, then expand

1. Establish footprint and floor/roof datums before furnishing or landscaping.
2. Build one exterior corner, one window/door reveal and the adjoining roof/eave or
   floor junction. Model the surfaces visible from the agreed interior/exterior cameras.
3. Check wall thickness and opening clear dimensions on evaluated geometry. Add the
   representative pane/frame only after the opening is correct.
4. Inspect top, outside corner, inside corner and elevation views. For cutaways also
   inspect the exposed exterior wall corner and complete floor perimeter.
5. Test the module's repeated seam and material/UV behaviour before replication.
   Test moving doors with hinges and clearance if movement is required.

**Editable controls:** plan dimensions, levels, wall thickness, opening bounds, roof
profiles, overhang, module spacing and pivots. Keep furnishing independent of the shell.
Use trim for actual trim, not to conceal failed wall/roof connections.

## 4. Diagnose before patching

| Observation | Inspect first | Next test |
| --- | --- | --- |
| Interior works but outside corner is open | Wall returns and junction coverage | Isolated top/exterior view of that corner |
| Flicker at repeated seams | Coincident faces and ownership | Correct one module boundary; do not just offset the whole facade |
| Window is a dark rectangle with no depth | Opening, reveals and pane placement | Oblique interior/exterior close-up |
| Roof floats or penetrates walls | Evaluated eave/wall geometry | Fit the roof junction without distorting approved elevations |
| Unexplained changes across copies | Shared mesh/material users | Diagnose sharing before changing the source module |

## 5. Change-of-method trigger and checks

If the chosen module cannot express the required corner, roof change or opening without
changing protected bays, test a distinct junction/module rather than forcing identical
repetition. Obtain approval for restructuring; a single failing corner does not authorize
replacing the building.

Check footprint/elevations, wall/floor/roof continuity, required interior coverage and
opening thickness separately. A front facade render does not prove a complete building.
Report deliberate cutaway/open boundaries distinctly from unexpected mesh defects.
Game collision, navigation, lighting performance and integration are separate tasks.
