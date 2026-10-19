# UV templates are versioned deliverables

An atlas template is not verified merely because it has the expected name or resolution.
The Raptor round exposed both a stale layout and a PNG whose RGB header described a
grayscale payload. Preserve the old artifacts; export corrected files under unused names.

## Acceptance

1. Identify the exact saved checkpoint or approved live source, object, UV layer and resolved
   albedo connection. Check whether evaluated topology/UV differs. Do not silently switch UV
   maps, re-unwrap, modify geometry or save over an asset to repair a template.
2. Export the final UV layout, not a screenshot of a UV editor or an older per-part layout.
   Record source, UV name, topology/UV hash, albedo hash, image size and coordinate convention.
   Modification times are clues, not proof of correspondence.
3. Deliver an uncluttered boundary-only template plus a separate topology/albedo overlay.
   Distinguish island boundaries from padding, paint boundaries and internal edges. Include a
   white-background preview and a contrasting transparent layer so dark viewers stay readable.
   No island labels or exterior/interior classifications may be guessed; mark missing labels.
4. Decode the saved PNG, checking CRCs, header channel count, complete scanline size and filters.
   Saving successfully, filename extensions and `file` header recognition are not validation.
   Prefer Blender's exporter/image APIs; custom writers require saved-byte round-trip tests.
5. Overlay at identical pixel dimensions without cropping, flipping or rescaling. Check
   asymmetric UV landmarks, holes, corners and small islands. View the actual saved evidence.
   A positional bake's colours need not follow the wire edges: dilation extends beyond islands.
6. Report correspondence and file integrity separately from packing, overlap, padding, bake
   quality and semantic usefulness. A valid template does not certify the underlying atlas.
   An all-shell atlas may include hidden interior islands; do not remove them without approval.

## Tools

`python3 <skill>/scripts/png_report.py <image.png>` validates supported 8-bit non-interlaced
L/RGB/LA/RGBA PNGs. Other formats fail explicitly; use a trusted decoder for those.
`python3 <skill>/scripts/test_png_report.py` runs pure Python regression fixtures.

`scripts/uv_template_export.py` is an explicitly invoked authoring operation, not a read-only
report. Run it in disposable background Blender opened on the approved saved checkpoint:

```text
<blender> --background <source.blend> --python-exit-code 1 --python <skill>/scripts/uv_template_export.py -- --object <mesh> --uv <layer> --albedo <albedo.png> --prefix <unused-output-prefix>
```

It preserves existing files, rejects differing evaluated UV/topology, creates template/layer/
overlay/manifest outputs and verifies saved pixels. It uses Blender's bundled NumPy, not an
installed runtime dependency. It does not save the .blend, fix UVs, infer panel labels, check
overlap or certify padding. Failed partial outputs must be inspected, never blindly overwritten.
