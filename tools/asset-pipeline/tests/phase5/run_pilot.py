"""Run the Phase 5 Qwen material pilot against a ComfyUI API server.

Three material types x three fixed seeds at 1024 square. The graph is the
project's existing Qwen Image 2.1 edit graph, reduced to the texture path.
"""

import argparse
import copy
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://192.168.1.190:8188")
parser.add_argument("--out-dir", required=True)
parser.add_argument("--template", required=True)
parser.add_argument("--inputs", required=True)
parser.add_argument("--seeds", default="20261020,20261021,20261022")
parser.add_argument("--material", default=None)
parser.add_argument("--steps", type=int, default=32)
parser.add_argument("--cfg", type=float, default=2.0)
parser.add_argument("--timeout", type=int, default=900)
args = parser.parse_args()

out_dir = Path(args.out_dir)
raw_dir = out_dir / "raw"
api_dir = out_dir / "api"
raw_dir.mkdir(parents=True, exist_ok=True)
api_dir.mkdir(parents=True, exist_ok=True)
template = json.loads(Path(args.template).read_text(encoding="utf-8"))
inputs = json.loads(Path(args.inputs).read_text(encoding="utf-8"))
seeds = [int(value) for value in args.seeds.split(",") if value.strip()]

NEGATIVE = (
    "text, labels, numbers, watermark, signature, UI, border, frame, margin, "
    "black edge, cropped edge, 3D object, perspective, camera, lighting, "
    "shadows, highlights, reflections, ambient occlusion, background scene, "
    "visible seam, hard tiling discontinuity, color banding, large-scale "
    "brightness gradient, broad lighting variation, center glow, edge glow, "
    "tile brightness mismatch, vignette"
)

UNIFORM = (
    " Perfectly uniform average brightness across the whole square; no broad "
    "lighting gradient, center glow, edge glow or vignette. Every edge must be "
    "interchangeable with its opposite edge."
)

MATERIALS = [
    {
        "id": "painted_teal_panel",
        "label": "Painted teal architectural panel",
        "prompt": (
            "Use <image1> only as an empty 1024x1024 square canvas; ignore its flat "
            "grey colour. Use <image2> only as a soft Frutiger Aero architectural "
            "colour and finish reference; do not copy its scene, objects, windows, "
            "text or composition. Fill the entire canvas edge-to-edge with a seamless "
            "tileable flat 2D albedo texture of a smooth satin painted architectural "
            "panel in muted aqua-teal. Add a very fine, even orange-peel microtexture "
            "and subtle low-contrast tonal variation. The left and right edges and "
            "the top and bottom edges must match exactly when tiled. Use flat colour "
            "only: no border, margin, frame, object, perspective, lighting, shadow, "
            "reflection, highlight, text, labels, watermark or UI."
        ),
    },
    {
        "id": "pale_ceramic",
        "label": "Pale warm ceramic surface",
        "prompt": (
            "Use <image1> only as an empty 1024x1024 square canvas; ignore its flat "
            "grey colour. Use <image2> only as a soft Frutiger Aero architectural "
            "colour and finish reference; do not copy its scene, objects, windows, "
            "text or composition. Fill the entire canvas edge-to-edge with a seamless "
            "tileable flat 2D albedo texture of a pale warm-white glazed ceramic "
            "surface. Add a fine, even ceramic speckle and a subtle glaze depth, with "
            "no grout lines and no large stains. The left and right edges and the top "
            "and bottom edges must match exactly when tiled. Use flat colour only: no "
            "border, margin, frame, object, perspective, lighting, shadow, reflection, "
            "highlight, text, labels, watermark or UI."
        ),
    },
    {
        "id": "brushed_silver",
        "label": "Brushed silver trim",
        "prompt": (
            "Use <image1> only as an empty 1024x1024 square canvas; ignore its flat "
            "grey colour. Use <image2> only as a soft Frutiger Aero architectural "
            "colour and finish reference; do not copy its scene, objects, windows, "
            "text or composition. Fill the entire canvas edge-to-edge with a seamless "
            "tileable flat 2D albedo texture of neutral light-grey brushed metal trim. "
            "Add fine horizontal brush grain and subtle anisotropic tonal streaks with "
            "a satin finish. The left and right edges and the top and bottom edges "
            "must match exactly when tiled. Use flat colour only: no border, margin, "
            "frame, object, perspective, lighting, shadow, reflection, highlight, "
            "text, labels, watermark or UI."
        ),
    },
]


def request_json(url, payload=None, timeout=60):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def upload_image(path, name):
    boundary = "----phase5" + uuid.uuid4().hex
    body = bytearray()
    fields = {"type": "input", "overwrite": "true"}
    for key, value in fields.items():
        body.extend(("--" + boundary + "\r\n").encode())
        body.extend(("Content-Disposition: form-data; name=\"%s\"\r\n\r\n" % key).encode())
        body.extend((str(value) + "\r\n").encode())
    body.extend(("--" + boundary + "\r\n").encode())
    body.extend((
        "Content-Disposition: form-data; name=\"image\"; filename=\"%s\"\r\n"
        % name).encode())
    body.extend(b"Content-Type: image/png\r\n\r\n")
    body.extend(path.read_bytes())
    body.extend(("\r\n--" + boundary + "--\r\n").encode())
    request = urllib.request.Request(
        args.base_url.rstrip("/") + "/upload/image",
        data=bytes(body),
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)["name"]


def download(url, path):
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    path.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def submit_and_wait(graph, tag, seed, steps, cfg):
    graph["459:458"]["inputs"].update({
        "seed": seed,
        "steps": steps,
        "cfg": cfg,
    })
    graph["461"]["inputs"]["filename_prefix"] = tag
    graph_path = api_dir / (tag + "_prompt.json")
    graph_path.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    started = time.time()
    queued = request_json(
        args.base_url.rstrip("/") + "/prompt",
        {"prompt": graph, "client_id": "phase5-" + uuid.uuid4().hex})
    prompt_id = queued["prompt_id"]
    deadline = time.time() + args.timeout
    entry = None
    while time.time() < deadline:
        history = request_json(
            args.base_url.rstrip("/") + "/history/" + prompt_id)
        if prompt_id in history:
            entry = history[prompt_id]
            if entry.get("status", {}).get("status_str") in ("success", "error"):
                break
        time.sleep(5)
    elapsed = time.time() - started
    if entry is None:
        return {"tag": tag, "status": "timeout", "elapsed_s": round(elapsed, 1)}
    status = entry.get("status", {})
    if status.get("status_str") != "success":
        return {
            "tag": tag,
            "status": "failed",
            "elapsed_s": round(elapsed, 1),
            "status_detail": status,
        }
    images = entry.get("outputs", {}).get("461", {}).get("images", [])
    if not images:
        return {"tag": tag, "status": "no_output", "elapsed_s": round(elapsed, 1)}
    image = images[0]
    query = urllib.parse.urlencode({
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    })
    target = raw_dir / (tag + ".png")
    size, digest = download(
        args.base_url.rstrip("/") + "/view?" + query, target)
    return {
        "tag": tag,
        "status": "success",
        "elapsed_s": round(elapsed, 1),
        "prompt_id": prompt_id,
        "server_filename": image["filename"],
        "path": str(target),
        "bytes": size,
        "sha256": digest,
        "seed": seed,
        "steps": steps,
        "cfg": cfg,
    }


def main():
    canvas_name = upload_image(Path(inputs["canvas"]["path"]), "phase5_canvas_1024.png")
    style_name = upload_image(
        Path(inputs["style_reference"]["path"]), "phase5_style_reference_1024.png")
    results = []
    selected = [material for material in MATERIALS
                if not args.material or material["id"] == args.material]
    if not selected:
        raise SystemExit("No matching material: %s" % args.material)
    for material in selected:
        for seed in seeds:
            graph = copy.deepcopy(template)
            graph["470"]["inputs"]["image"] = canvas_name
            graph["475"]["inputs"]["image"] = style_name
            graph["459:474"]["inputs"]["prompt"] = material["prompt"] + UNIFORM
            graph["459:474"]["inputs"]["negative_prompt"] = NEGATIVE
            tag = "phase5_%s_seed%s" % (material["id"], seed)
            result = submit_and_wait(
                graph, tag, seed, args.steps, args.cfg)
            result["material"] = material["id"]
            result["label"] = material["label"]
            results.append(result)
            print("PHASE5_RUN", json.dumps(result, sort_keys=True))
            (out_dir / "summary.json").write_text(
                json.dumps({
                    "base_url": args.base_url,
                    "seeds": seeds,
                    "steps": args.steps,
                    "cfg": args.cfg,
                    "canvas_image": canvas_name,
                    "style_image": style_name,
                    "materials": MATERIALS,
                    "results": results,
                }, indent=2), encoding="utf-8")
    print("PHASE5_DONE", out_dir)


if __name__ == "__main__":
    main()
