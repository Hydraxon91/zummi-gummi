# Outputs

## Line guide

Per requested resolution:

- `clean_guide.png` — white background, black UV boundary outlines, no labels.
- `labelled_reference.png` — same layout with IDs and optional names.
- `island_legend.png` — full key; unresolved entries say `UNRESOLVED`.
- `labels.json` — per-island ID, faces, name, status, label lines, placement and bbox.
  The `faces` list lets `extras/uv_rebind_names.py` carry names across a layout change.

`guide_manifest.json` records the source file, object, UV layer, UV bounds, resolutions,
name source and label counts.

Named islands use the full name inside a chart where it fits, wrapping to two or three
lines, or a leader callout. Unresolved islands display only their numeric ID.

## Colored sheet

Per requested resolution:

- `color_layout.png` — dark background, solid per-island colors, thin dark island
  outlines and a green 0–1 frame. No title, labels or statistics.

`color_manifest.json` records:

- island count, UV bounds and output paths
- UV space used percentage
- color assigned to each guide ID

Colors are deterministic and follow guide-ID order, so they line up with `labels.json`
from the line guide for the same layout.

## Layout gate

`layout_gate.json` records:

- `geometric_overlaps` — chart IDs with a positive triangle intersection
- `geometric_pairs` — face pairs with UV area, shared vertices and `adjacent_sliver`
- `non_sliver_geometric_pairs` — intersections not classified as adjacent-face slivers
- `pixel_conflicts` — chart ID pairs that share at least one raster texel
- `pixel_conflict_count` — number of conflicting texels counted per pair
- `out_of_bounds`, `truncated`, `degenerate_triangles`
- `clean` and `strict_geometric`

Default failure: pixel collisions, out-of-bounds UVs or truncation.
`--strict-geometric` additionally fails on any triangle intersection.

## Optional repair

`extras/uv_chart_repair.py` writes:

- `repair_result.blend`
- `repair_report.json` with before/after audit, island counts and the charts repaired

It does not update names automatically.
