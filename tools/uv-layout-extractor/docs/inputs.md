# Inputs

## Scene

- One mesh object, selected by `--object`.
- One UV layer, selected by `--uv`.
- All UV coordinates must sit inside the single 0–1 tile. UDIM is not supported.
- The source `.blend` is opened read-only by the renderers and gate. The optional repair
  tool saves a new `repair_result.blend`; run it on a disposable copy.

## Names

`--names` is optional. Two forms are accepted.

Map form:

```json
{
  "1": "hood",
  "2": "cab_rear_panel",
  "31": "upper_body_shell"
}
```

List form:

```json
[
  {"id": 1, "name": "hood"},
  {"id": 2, "name": "cab_rear_panel"}
]
```

Only entries present in the map are named. Everything else is rendered with its numeric
ID only and marked `UNRESOLVED` in the legend.

The map is tied to the layout's deterministic ID order:

```text
sort by (u_min, v_min, -face_count, uv_area)
```

If you change the unwrap or repack, IDs can change. Rebind names by face set or rerun
the naming review.

## Blender version

Tested on Blender 5.2.2 LTS. The scripts use only `bpy`, `bmesh`, `mathutils` and the
NumPy bundled with Blender.

Run in background mode:

```bash
blender --background model.blend --python-exit-code 1 --python scripts/uv_color_layout.py -- ...
```
