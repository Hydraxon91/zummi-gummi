"""Generate the small Phase 7E scene-specific StableMaterials set.

The prompts are deliberately material-only (no objects, lighting or baked
shadows). Raw outputs stay separate from the scene delivery; the builder consumes
the paths recorded in office-materials.json.
"""

import argparse
import copy
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

NEGATIVE = (
    "text, watermark, UI, border, frame, margin, shadow, lighting, reflection, "
    "highlight, perspective, object, background, visible seam, gradient, vignette, "
    "banding, mosaic, tile grid, grout, cracks, stones, pattern"
)
UNIFORM = "Uniform brightness; opposite edges match when tiled."

MATERIALS = [
    ("office_wall_plaster", "Warm matte lime-plaster wall",
     "Flat albedo texture of warm ivory lime plaster wall, fine troweled mineral grain, "
     "soft low-contrast mottling, uniform matte finish, no cracks, no stains, no tiles.", None),
    ("office_floor_concrete", "Pale microcement floor",
     "Flat albedo texture of pale warm-grey microcement floor, fine mineral speckle, "
     "subtle cloudy variation, low-contrast satin finish, no joints, no tiles.", None),
    ("office_desk_walnut", "Walnut desk top",
     "Seamless dark walnut wood texture, long straight fine grain, deep chocolate-brown "
     "heartwood, satin oiled finish, photoreal flat scan, no knots, no planks, no border.", None),
    ("office_chair_oak", "Aged oak chair wood",
     "Flat albedo texture of aged honey oak wood, visible fine straight grain, softly worn "
     "satin finish, warm amber-brown colour, no knots, no painted decoration.", None),
    ("office_cushion_red", "Deep red woven cushion fabric",
     "Flat albedo texture of deep muted red woven linen upholstery, fine basket weave, "
     "soft matte fabric, subtle thread variation, no embroidery, no seams, no buttons.", None),
    ("office_rug_grey", "Grey wool oval rug",
     "Flat albedo texture of mid-grey wool rug, dense short pile, soft heathered fibre "
     "variation, matte finish, no pattern, no border, no fringe, no weave grid.", None),
    ("office_wall_wallpaper", "Faded Hungarian folk wallpaper",
     "Seamless vintage Hungarian folk wallpaper, warm cream paper ground, small repeating "
     "stylized red and green tulip and vine motifs, aged matte print, flat albedo scan.",
     "text, watermark, UI, border, frame, margin, shadow, lighting, reflection, highlight, "
     "perspective, object, background, visible seam, gradient, vignette, banding, mosaic, "
     "grout, cracks, blurry"),
    ("office_floor_parquet", "Honey oak herringbone parquet",
     "Seamless honey-oak herringbone parquet floor, narrow planks locked in a zigzag "
     "herringbone pattern, fine wood grain, warm satin varnish, photoreal flat top-down scan.",
     "text, watermark, UI, border, frame, margin, shadow, lighting, reflection, highlight, "
     "perspective, object, background, visible seam, gradient, vignette, banding, mosaic, "
     "grout, cracks, blurry"),
]

parse = argparse.ArgumentParser()
parse.add_argument("--base-url", default="http://192.168.1.190:8188")
parse.add_argument("--template", required=True)
parse.add_argument("--out-dir", required=True)
parse.add_argument("--seeds", default="20261021")
parse.add_argument("--material", default=None)
parse.add_argument("--steps", type=int, default=50)
parse.add_argument("--cfg", type=float, default=7.5)
parse.add_argument("--timeout", type=int, default=1200)
args = parse.parse_args()

out_dir = Path(args.out_dir)
raw_dir = out_dir / "raw"
api_dir = out_dir / "api"
raw_dir.mkdir(parents=True, exist_ok=True)
api_dir.mkdir(parents=True, exist_ok=True)
template = json.loads(Path(args.template).read_text(encoding="utf-8"))
seeds = [int(value) for value in args.seeds.split(",") if value.strip()]
output_nodes = {
    "8": "basecolor",
    "4": "normal",
    "5": "height",
    "6": "roughness",
    "7": "metallic",
}


def request_json(url, payload=None, timeout=60):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"{error.code} {error.reason}: {detail}") from error


def download(url, path):
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    path.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def submit_and_wait(material_id, label, prompt, seed, negative=NEGATIVE):
    graph = copy.deepcopy(template)
    graph["2"]["inputs"]["prompt"] = prompt + " " + UNIFORM
    graph["2"]["inputs"]["negative_prompt"] = negative
    graph["2"]["inputs"]["seed"] = seed
    graph["2"]["inputs"]["steps"] = args.steps
    graph["2"]["inputs"]["guidance_scale"] = args.cfg
    graph["2"]["inputs"]["width"] = 1024
    graph["2"]["inputs"]["height"] = 1024
    tag = f"phase7_office_{material_id}_seed{seed}"
    for node_id, map_name in output_nodes.items():
        graph[node_id]["inputs"]["filename_prefix"] = tag + "_" + map_name
    (api_dir / (tag + "_prompt.json")).write_text(json.dumps(graph, indent=2), encoding="utf-8")
    started = time.time()
    queued = request_json(
        args.base_url.rstrip("/") + "/prompt",
        {"prompt": graph, "client_id": "phase7-office-" + uuid.uuid4().hex},
    )
    prompt_id = queued["prompt_id"]
    deadline = time.time() + args.timeout
    entry = None
    while time.time() < deadline:
        history = request_json(args.base_url.rstrip("/") + "/history/" + prompt_id)
        if prompt_id in history:
            entry = history[prompt_id]
            if entry.get("status", {}).get("status_str") in ("success", "error"):
                break
        time.sleep(5)
    if entry is None:
        raise TimeoutError(f"{tag} did not finish within {args.timeout}s")
    if entry.get("status", {}).get("status_str") != "success":
        raise RuntimeError(f"{tag} failed: {entry.get('status')}")
    files = {}
    for node_id, map_name in output_nodes.items():
        images = entry.get("outputs", {}).get(node_id, {}).get("images", [])
        if not images:
            raise RuntimeError(f"{tag} missing output for node {node_id}")
        image = images[0]
        query = urllib.parse.urlencode({
            "filename": image["filename"],
            "subfolder": image.get("subfolder", ""),
            "type": image.get("type", "output"),
        })
        target = raw_dir / f"{tag}_{map_name}.png"
        size, digest = download(args.base_url.rstrip("/") + "/view?" + query, target)
        files[map_name] = {"path": str(target), "bytes": size, "sha256": digest}
    return {
        "id": material_id,
        "label": label,
        "prompt": prompt,
        "seed": seed,
        "steps": args.steps,
        "cfg": args.cfg,
        "elapsed_s": round(time.time() - started, 1),
        "prompt_id": prompt_id,
        "files": files,
        "negative_prompt": negative,
    }


results = []
for material_id, label, prompt, negative in MATERIALS:
    if args.material and material_id != args.material:
        continue
    for seed in seeds:
        result = submit_and_wait(material_id, label, prompt, seed, negative or NEGATIVE)
        results.append(result)
        print("PHASE7_OFFICE_MATERIAL " + json.dumps({
            "id": result["id"],
            "seed": result["seed"],
            "prompt_id": result["prompt_id"],
            "paths": {key: value["path"] for key, value in result["files"].items()},
        }, sort_keys=True))

manifest = {
    "workflow": "stablematerials",
    "base_url": args.base_url,
    "steps": args.steps,
    "cfg": args.cfg,
    "seeds": seeds,
    "materials": {result["id"]: result for result in results},
}
(out_dir / "office-materials.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("PHASE7_OFFICE_MATERIALS_DONE", out_dir)
