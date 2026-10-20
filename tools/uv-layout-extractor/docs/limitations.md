# Limitations

- **Single 0–1 tile.** UDIM layouts are rejected. The tools are designed for a single
  texture sheet.
- **One object per run.** Multi-object assets need one run per mesh. The color sheet and
  guide are not combined atlases.
- **Render only.** The line guide and colored sheet do not unwrap, pack, pad, bake or
  transfer materials. They show the UV layout they are given.
- **IDs are layout-derived.** A new unwrap or repack can reorder IDs. Rebind names by
  face set if the layout changes.
- **Geometric vs raster overlaps.** A geometric triangle intersection can be a sub-pixel
  sliver between adjacent faces. The gate reports both; default failure is based on
  raster pixel conflicts. Use `--strict-geometric` for exact geometric failure.
- **Flipped faces are not checked** by the gate yet.
- **No texture-generation certification.** A clean gate is a UV-space check, not proof
  that a generated texture, bake or engine import is correct.
- **Optional Mio3 dependency.** `extras/uv_chart_repair.py --engine mio3` requires Mio3 UV
  installed in Blender. The core tools have no third-party add-on dependency.
