# Phase 5 material pilot

This directory compares three material-generation paths for the architectural set:

- `painted_teal_panel`
- `pale_ceramic`
- `brushed_silver`

Each path is run with seeds `20261020, 20261021, 20261022` at 1024² where the
workflow supports it.

## Workflows

### Qwen Image 2.1 edit (baseline)

`api/qwen_image_21_texture_template.json` and `run_pilot.py`.

This is the existing Qwen edit graph, reduced to the texture path. It uses the
project-authored empty canvas and game screenshot as references. Qwen does not
enforce tiling; this remains the prompt-only baseline.

### StableMaterials, Standard 50 steps

`api/stablematerials_text_pbr_native_template.json` and
`run_workflows.py --workflow stablematerials`.

- Model: `gvecchio/StableMaterials` (downloaded by the custom node)
- Node: `P5ina/comfyui-stable-materials`
- Mode: `Standard (50 steps, quality)`
- Tileable: enabled
- Native output: **1024²** with the local width/height patch; 2048² exceeds the
  16 GB GPU and is out of scope
- `api/stablematerials_text_pbr_template.json` keeps the older 512→1024
  Lanczos fallback.

The patch adds `width`/`height` to
`ComfyUI/custom_nodes/comfyui-stable-materials/nodes.py`:

```python
# In StableMaterialsGenerate.INPUT_TYPES, after "tileable":
"width": ("INT", {"default": 1024, "min": 256, "max": 2048, "step": 64}),
"height": ("INT", {"default": 1024, "min": 256, "max": 2048, "step": 64}),
```

```python
def generate(self, pipeline, prompt, negative_prompt, seed, steps,
             guidance_scale, tileable, width, height):
```

```python
result = pipeline(
    prompt=prompt,
    negative_prompt=negative_prompt,
    num_inference_steps=steps,
    guidance_scale=guidance_scale,
    tileable=tileable,
    width=width,
    height=height,
    generator=generator,
)
```

Restart ComfyUI and confirm `width`/`height` appear on the
`StableMaterialsGenerate` node before running the native template.

### SDXL with explicit seamless sampling

`api/sdxl_seamless_texture_template.json` and `run_workflows.py --workflow sdxl`.

- Checkpoint: `sd_xl_base_1.0.safetensors`
- VAE: `sdxl_vae.safetensors`
- Nodes: `spinagon/ComfyUI-seamless-tiling`
- `SeamlessTile` before the sampler; `MakeCircularVAE` before decode
- 30 steps, CFG 7.0, `dpmpp_2m` / `karras`
- Outputs the texture and a 50% offset check

## Shared runner for new jobs

`tools/asset-pipeline/scripts/run_comfy_workflow_stable_materials.py` is the current
reusable entry point for new StableMaterials jobs. Keep prompts and run settings in a
job JSON such as `tools/asset-pipeline/examples/laptop-plastics-aged.job.json`; the
runner validates the API graph, supports `--dry-run`, downloads the five maps and writes
a hash manifest. It does not manage the ComfyUI process.

```bash
python3 tools/asset-pipeline/scripts/run_comfy_workflow_stable_materials.py \
  --job tools/asset-pipeline/examples/laptop-plastics-aged.job.json \
  --base-url http://192.168.1.190:8188 \
  --out-dir .dev-shots/asset-pipeline/phase7/laptop-materials
```

The commands below remain the historical Phase 5 comparison scripts.

## Commands

```bash
python3 tools/asset-pipeline/tests/phase5/run_workflows.py \
  --workflow stablematerials \
  --base-url http://192.168.1.190:8188 \
  --out-dir .dev-shots/asset-pipeline/phase5/stablematerials \
  --template tools/asset-pipeline/tests/phase5/api/stablematerials_text_pbr_native_template.json \
  --seeds 20261020,20261021,20261022

python3 tools/asset-pipeline/tests/phase5/run_workflows.py \
  --workflow sdxl \
  --base-url http://192.168.1.190:8188 \
  --out-dir .dev-shots/asset-pipeline/phase5/sdxl-seamless \
  --template tools/asset-pipeline/tests/phase5/api/sdxl_seamless_texture_template.json \
  --seeds 20261020,20261021,20261022
```

Analyze the 1024 base-colour outputs with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase5/analyze_materials.py -- \
  --out-dir .dev-shots/asset-pipeline/phase5/analysis \
  .dev-shots/asset-pipeline/phase5/stablematerials/raw/*_basecolor.png \
  .dev-shots/asset-pipeline/phase5/sdxl-seamless/raw/*_texture.png
```

`analyze_materials.py` validates the seam metric on a known-good periodic fixture
and a known-bad hard-seam fixture before using the 1.5× threshold on candidates.
It writes 3×3 and 50%-offset previews.

## Colour review and correction

The StableMaterials model follows surface detail and tiling more reliably than
prompt colour. **This is a mandatory gate for generated base colour, not an optional
polish pass.** Raw candidates are checked against the approved palette. A
colour-only failure may be corrected by a deterministic script; seam, stain,
lighting or texture failures are not colour corrections.

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase5/review_colour.py -- \
  --run-dir .dev-shots/asset-pipeline/phase5/native-teal \
  --palette tools/asset-pipeline/tests/phase5/palette.json \
  --review tools/asset-pipeline/tests/phase5/review_colour.json \
  --out-dir .dev-shots/asset-pipeline/phase5/corrected \
  --report .dev-shots/asset-pipeline/phase5/native-teal/colour-review.json
```

The `--review` record is required. A candidate is corrected only when an
inspected entry classifies it as `colour_only`; otherwise the report says
`review_required` and no file is changed. Other findings such as residual
mottling are retained in the review record.

`review_colour.py`:

- applies bounded (±6%) luminance modulation to the generated detail;
- replaces chroma with the target colour;
- writes a new PNG without overwriting the raw file;
- records source/corrected means, deltas and vertical-orientation correlation;
- does not alter normal, height, roughness or metallic maps.

The target palette was approved on 2026-10-20:

- `painted_teal_panel`: `#2FA7A0`
- `pale_ceramic`: `#E8E1D4`
- `brushed_silver`: `#B9BEC2`

`palette_provisional.json` is retained as the pre-approval record.

This is **agent-reviewed, script-corrected** work, not pure-generation success.

### Colour/orientation fixture

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase5/test_colour_pipeline.py -- \
  --out-dir .dev-shots/asset-pipeline/phase5/colour-fixtures
```

The fixture writes asymmetric corner colours and a 50% grey, then reads it
through Blender. `colour-orientation.json` must show array row 0 at the bottom
and middle grey near `0.5`; otherwise colour or row-order assumptions are wrong.

### PBR preview

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase5/render_material_preview.py -- \
  --basecolor path/to/basecolor.png \
  --normal path/to/normal.png \
  --roughness path/to/roughness.png \
  --metallic path/to/metallic.png \
  --out .dev-shots/asset-pipeline/phase5/pbr-preview/example.png
```

The sphere preview is a material check only; it is not an in-game or GLB
integration check.

## Current status

- The ComfyUI server exposes all required nodes and both SDXL files.
- The StableMaterials node accepts native `width`/`height`; 1024² works, 2048²
  exceeds 16 GB VRAM.
- Nine native 1024² StableMaterials candidates completed sequentially at about
  15 seconds each: 3 materials × 3 seeds. No AIMDO crash recurred with
  `--disable-dynamic-vram`.
- Raw colour check: all nine failed the colour threshold; all nine were
  corrected. Corrected means are within `0.012` RGB of target.
- Corrected seam review: **8/9 pass** the self-validated `1.5` threshold. The
  ceramic seed `20261021` fails at `1.581` and shows visible tile boundaries
  after correction; it is rejected.
- Representative 3×3, offset and PBR sphere previews were inspected. Residual
  mottling and repetition remain material-quality notes; the user accepted them
  for this pilot.
- The colour/orientation fixture confirms sRGB values, bottom-up Blender rows
  and top-down corrected PNG rows. Corrected/source luminance correlation is
  above `0.98` direct and below `0.18` flipped.
- SDXL seamless generation succeeded at 1024²; the first seed produced a teal
  wall with an unwanted tan diamond, so it is not an accepted candidate.
- **Accepted by the user on 2026-10-20:** teal 3/3, ceramic 2/3, silver 3/3.
  Residual mottling and the weak brushed direction were accepted for this pilot;
  the ceramic seed `20261021` remains rejected. See `approval.json`.
- Phase 5 is an albedo/material pilot; it is not a GLB, house or game delivery.
