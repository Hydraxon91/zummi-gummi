# Island-labelled UV export

Project policy for turning a finished UV layout into machine-readable paint guides. Supplements
the parent skill, the modelling contract and `AGENTS.md`; it adds no authorization.

## Combined versus true atlas

Default output is **one combined sheet** in the requested UV space: unique ids across all
objects, `uv_wireframe.png`, id/zone maps, labelled overlay, manifest, merged zone masks and
per-island masks. When the selected objects own separate 0–1 UV spaces, this sheet is a
**composite**: islands from different objects stack and later draws overwrite earlier ones.
Warn explicitly; do not present a composite as a shared atlas. Use `--object` for a clean
single-layout sheet (the useful AI-generation base) or repack into a true atlas as a separate,
destructive operation. `--per-object` writes optional per-object sets to `_per_object/`.

All images share one resolution and coordinate system so they overlay exactly. Defaults:
1280², dilation 8. Zone masks are `zone_<name>.png` and `zone_<name>_dilated.png`; island
masks live in `masks/islands/`, skipping those under the area floor and listing the skips.

## Determinism

IDs sort by `(source_object, u_min, v_min, -face_count, uv_area)` and colours derive from the
id. Record the source file, UV maps and a topology/UV hash. Any UV or geometry edit may reassign
ids: keep the previous manifest until the replacement is reviewed.

## Naming and zones

- Prefer one part per object or real face groups/attributes. Object and material names are the
  only trustworthy automatic source.
- A merged shell with many islands and no groups has no island-level semantic name. Emit the
  object name, mark `part_name_source` and warn; never invent `hood`/`door`/`roof`. Accept a
  reviewed `--names` override keyed by island id.
- Zone rules are project data: `--zones zones.json`. Unmapped materials become `unknown` with
  a warning. Keep the fixed palette so downstream compositing is stable.

## Manifest size

Store only id, part name, source object, material, side, zone, pixel bbox, centroid, area,
`mirrored_of` and skip flags. Full UV polygons belong in a separate opt-in
`island_polygons.json`; never inline per-vertex data.

## Validation

Fail non-zero on out-of-bounds islands, missing names/zones, manifest/mesh island-count
mismatch, or overlaps. Overlap detection is per object and on the rasterised masks. Intentional
stacks must be listed and explicitly allowed; never silence the check globally.
Report the V-axis convention (`y = (1-v)*(height-1)`, top-left origin) beside the outputs.

## Masks

Binary PNGs, one per zone and per island, plus a dilated variant for edge bleed. Dilation grows
beyond the island, so generated textures can be composited without transparent fringes. A mask
does not prove UV padding, bake quality or destination-engine compositing; inspect a test
composite.

## Reporting

Report separately: file validity, manifest/mesh island count, in-bounds status, overlap list,
label skips, empty rasterisations and semantic naming gaps. A PASS means the structural checks
passed, not that the part names or the painted result are correct.
