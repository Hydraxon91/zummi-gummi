# Standalone UV layout extractor

This reference describes the reusable UV sheet tooling extracted from the Raptor body
work. It is external to Gummy Bears; using it does not authorize game integration,
material transfer or a bake.

The tool is vendored at `tools/uv-layout-extractor/` and is also maintained as the
standalone `uv-layout-extractor` repository. The vendored copy is the project-local source
of truth; the standalone copy remains the canonical upstream for its own Git history.
Keep its public tools free of Gummy object names, material-zone maps, evidence
fingerprints, absolute project paths and project `.blend` assets.

## Outputs

- **Line guide** — white background, black UV outlines, deterministic numeric IDs,
  optional names, leader callouts and an island legend. Named charts use the full name
  inside a chart where possible; unresolved charts show only their numeric ID.
- **Colored sheet** — dark full-bleed layout, deterministic per-island colors in guide-ID
  order, thin dark outlines and a green 0–1 frame. It carries no title, labels or
  statistics and is a layout visualization, not an albedo.
- **Gate** — geometric intersections, raster pixel conflicts, bounds, truncation and
  zero-area triangles.

Keep labels and clean/colored images as separate deliveries.

## Inputs

- One mesh object and one UV layer per run.
- Single 0–1 tile; reject UDIM for this tool.
- Optional names JSON keyed by current guide ID:

```json
{"1": "hood", "2": "cab_rear_panel", "31": "upper_body_shell"}
```

IDs are deterministic for a layout:

```text
sort by (u_min, v_min, -face_count, uv_area)
```

They are **not** stable across a repack or re-unwrap. Store `faces` in `labels.json` and
rebind names by exact face set after the layout changes. A face-set match preserves a
previous review; it does not prove semantic correctness.

## Commands

Run in background Blender 5.2:

```bash
blender --background model.blend --python-exit-code 1 \
  --python tools/uv-layout-extractor/scripts/uv_line_guide.py -- \
  --object Body --uv UVMap --names names.json \
  --out out/guide --resolutions 1280 4096
```

```bash
blender --background model.blend --python-exit-code 1 \
  --python tools/uv-layout-extractor/scripts/uv_color_layout.py -- \
  --object Body --uv UVMap --out out/color --resolutions 1280 4096
```

```bash
blender --background model.blend --python-exit-code 1 \
  --python tools/uv-layout-extractor/scripts/uv_layout_gate.py -- \
  --object Body --uv UVMap --out out/gate --resolution 4096
```

Outputs are not overwritten unless `--force` is passed.

## Gate semantics

- `geometric_overlaps` — exact triangle intersections.
- `geometric_pairs` — face pairs with UV area, shared vertices and an `adjacent_sliver`
  flag.
- `pixel_conflicts` — actual texel collisions in the raster ID map.
- `non_sliver_geometric_pairs` — intersections not classified as adjacent slivers.
- `out_of_bounds`, `truncated`, `degenerate_triangles`.

Default failure is pixel conflicts, out-of-bounds UVs or truncation. Adjacent-face
sub-pixel slivers are warnings. `--strict-geometric` additionally fails on any triangle
intersection.

Do not call a layout clean from a triangle test alone, or generation-ready from a render
alone. State the resolution and which check passed. A layout can have zero pixel conflicts
and still report geometric slivers.

## Optional repair

`tools/uv-layout-extractor/extras/uv_chart_repair.py` is copy-only:

1. Build an isolated operand from one island's faces.
2. Unwrap the operand.
3. Fit the result back into the original UV footprint.
4. Copy the UVs back; no other chart moves.
5. Optionally relax (Mio3) and pack.

Run it on a disposable copy. Blender unwrap is the default; Mio3 is optional. Do not
bundle or copy Mio3 code; call its operators only when installed.

A full-sheet pack can improve coverage but moves charts, labels and IDs. Re-run the line
guide and rebind names after packing. A per-chart repair can still leave sub-pixel slivers;
the pixel gate decides acceptance.

`tools/uv-layout-extractor/extras/uv_rebind_names.py` maps old `labels.json` face sets to
current IDs. It requires old labels that contain `faces` and stops if an old name has no
exact face-set match, unless `--allow-partial` is used.

## Blender-specific gotchas

- A UV layer reference captured before a UV add-on operator can become stale. Re-fetch
  `ob.data.uv_layers[name]` before copying or auditing; otherwise reads can raise
  `IndexError` or return old data.
- `uv.pack_islands` can reorder islands; treat IDs, labels and names as invalid after a
  pack.
- `autounwrap.smart_uv` has a blocking `execute` path for scripts, but the organic
  `autounwrap.unwrap` path is modal/panel-only. Do not fake a scripted call to a
  panel-only operator; report the limitation and use a supported fallback.
- `mesh.calc_loop_triangles()` only prepares triangle data; it does not establish UV
  quality.
- Raster checks are resolution-specific; report the pixel resolution used.

## Verification fixtures

Use generic assets, not the Raptor body:

- clean cube with a known six-island atlas;
- deliberately overlapping two-island UV layout;
- out-of-bounds UVs;
- a clean gate PASS and an overlap gate FAIL;
- PNG header/size checks;
- name rebinding after a layout change.

Pure triangle tests run without Blender. The render and gate smoke test runs in headless
Blender and must assert both PASS and expected FAIL exit codes.

## Extraction checklist

- Remove project-specific object names, material-zone maps, evidence formats, absolute
  paths and `.blend` assets from the public tools.
- Keep one small shared core and thin CLIs; do not ship the project-specific exporter.
- Document every input, output, limitation and optional dependency.
- Decide the licence after provenance review. MIT is suitable for original tool code;
  do not bundle GPL or paid add-on code. Optional tools such as Mio3 remain external.
- Keep the standalone README and fixtures in that repo; do not fold them into
  `atlas-delivery.md` or this skill.
