"""Run the Phase 5 StableMaterials and SDXL-seamless comparison workflows."""

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

from prompts import CRATE_MATERIALS, MATERIALS, NEGATIVE, UNIFORM

parser = argparse.ArgumentParser()
parser.add_argument("--workflow", choices=("stablematerials", "sdxl"), required=True)
parser.add_argument("--set", choices=("phase5", "crate"), default="phase5")
parser.add_argument("--base-url", default="http://192.168.1.190:8188")
parser.add_argument("--out-dir", required=True)
parser.add_argument("--template", required=True)
parser.add_argument("--seeds", default="20261020,20261021,20261022")
parser.add_argument("--material", default=None)
parser.add_argument("--steps", type=int, default=None)
parser.add_argument("--cfg", type=float, default=None)
parser.add_argument("--timeout", type=int, default=1800)
args = parser.parse_args()

out_dir = Path(args.out_dir)
raw_dir = out_dir / "raw"
api_dir = out_dir / "api"
raw_dir.mkdir(parents=True, exist_ok=True)
api_dir.mkdir(parents=True, exist_ok=True)
template = json.loads(Path(args.template).read_text(encoding="utf-8"))
seeds = [int(value) for value in args.seeds.split(",") if value.strip()]
if args.steps is None:
    args.steps = 50 if args.workflow == "stablematerials" else 30
if args.cfg is None:
    args.cfg = 7.5 if args.workflow == "stablematerials" else 7.0

if args.workflow == "stablematerials":
    prompt_node = "2"
    seed_node = "2"
    basecolor_node = "8" if "8" in template else "3"
    image_nodes = {
        basecolor_node: ("basecolor", "_basecolor"),
        "4": ("normal", "_normal"),
        "5": ("height", "_height"),
        "6": ("roughness", "_roughness"),
        "7": ("metallic", "_metallic"),
    }
else:
    prompt_node = "3"
    seed_node = "6"
    image_nodes = {
        "9": ("texture", ""),
        "11": ("offset", "_offset"),
    }


def request_json(url, payload=None, timeout=60):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def download(url, path):
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    path.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def submit_and_wait(graph, tag, seed):
    graph[seed_node]["inputs"]["seed"] = seed
    graph[seed_node]["inputs"]["steps"] = args.steps
    if args.workflow == "sdxl":
        graph[seed_node]["inputs"]["cfg"] = args.cfg
    else:
        graph[seed_node]["inputs"]["guidance_scale"] = args.cfg
    for node_id, (_, suffix) in image_nodes.items():
        graph[node_id]["inputs"]["filename_prefix"] = tag + suffix
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
    files = {}
    for node_id, (map_name, _) in image_nodes.items():
        images = entry.get("outputs", {}).get(node_id, {}).get("images", [])
        if not images:
            return {
                "tag": tag,
                "status": "missing_output",
                "elapsed_s": round(elapsed, 1),
                "node": node_id,
            }
        image = images[0]
        query = urllib.parse.urlencode({
            "filename": image["filename"],
            "subfolder": image.get("subfolder", ""),
            "type": image.get("type", "output"),
        })
        target = raw_dir / (tag + "_" + map_name + ".png")
        size, digest = download(
            args.base_url.rstrip("/") + "/view?" + query, target)
        files[map_name] = {
            "path": str(target),
            "bytes": size,
            "sha256": digest,
            "server_filename": image["filename"],
        }
    return {
        "tag": tag,
        "status": "success",
        "elapsed_s": round(elapsed, 1),
        "prompt_id": prompt_id,
        "seed": seed,
        "steps": args.steps,
        "cfg": args.cfg,
        "files": files,
    }


def main():
    source_materials = CRATE_MATERIALS if args.set == "crate" else MATERIALS
    selected = [material for material in source_materials
                if not args.material or material["id"] == args.material]
    if not selected:
        raise SystemExit("No matching material: %s" % args.material)
    results = []
    for material in selected:
        for seed in seeds:
            graph = copy.deepcopy(template)
            if args.workflow == "sdxl":
                graph["3"]["inputs"]["text"] = material["prompt"] + UNIFORM
                graph["4"]["inputs"]["text"] = NEGATIVE
            else:
                graph["2"]["inputs"]["prompt"] = material["prompt"] + UNIFORM
                graph["2"]["inputs"]["negative_prompt"] = NEGATIVE
            tag = "phase5_%s_%s_seed%s" % (
                args.workflow, material["id"], seed)
            try:
                result = submit_and_wait(graph, tag, seed)
            except Exception as error:
                result = {"tag": tag, "status": "submit_failed",
                          "error": repr(error)}
            result["material"] = material["id"]
            result["label"] = material["label"]
            results.append(result)
            print("PHASE5_RUN", json.dumps(result, sort_keys=True))
            (out_dir / "summary.json").write_text(
                json.dumps({
                    "workflow": args.workflow,
                    "base_url": args.base_url,
                    "seeds": seeds,
                    "steps": args.steps,
                    "cfg": args.cfg,
                    "materials": selected,
                    "results": results,
                }, indent=2), encoding="utf-8")
    print("PHASE5_DONE", out_dir)


if __name__ == "__main__":
    main()
