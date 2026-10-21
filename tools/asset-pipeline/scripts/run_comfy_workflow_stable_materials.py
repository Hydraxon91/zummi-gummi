"""Run reusable StableMaterials jobs through the ComfyUI HTTP API.

The workflow template is an exported ComfyUI API graph. A separate job JSON supplies
the prompts, seeds and run settings, so new material sets do not require another Python
script. The runner never starts, restarts, unloads or reconfigures ComfyUI.

Example:
    python3 tools/asset-pipeline/scripts/run_comfy_workflow_stable_materials.py \
      --job tools/asset-pipeline/examples/laptop-plastics-aged.job.json \
      --out-dir .dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/materials/aged-plastic-001

Validation-only dry run:
    python3 tools/asset-pipeline/scripts/run_comfy_workflow_stable_materials.py \
      --job tools/asset-pipeline/examples/laptop-plastics-aged.job.json \
      --out-dir /tmp/laptop-materials-dry --dry-run

ComfyUI setup (optional, user-supplied):
    - ComfyUI with the custom node P5ina/comfyui-stable-materials
    - Model gvecchio/StableMaterials downloaded by that node
    - An API-format workflow containing LoadStableMaterials and
      StableMaterialsGenerate, with SaveImage nodes connected to its five outputs
    - Base URL passed by --base-url or the job's base_url, for example
      http://192.168.1.190:8188

Output maps are raw StableMaterials maps, not a delivered or baked material. The
job manifest records the template hash, prompts, seeds, prompt IDs, file hashes and
failures. A failed run is evidence too; nothing is silently replaced.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

LOAD_NODE = "LoadStableMaterials"
GENERATE_NODE = "StableMaterialsGenerate"
MAP_NAMES = {0: "basecolor", 1: "normal", 2: "height", 3: "roughness", 4: "metallic"}
NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
DEFAULT_SUFFIX = "Uniform brightness; opposite edges match when tiled."
DEFAULT_NEGATIVE = (
    "text, watermark, UI, border, frame, margin, shadow, lighting, reflection, "
    "highlight, perspective, object, background, visible seam, gradient, vignette, "
    "banding, mosaic, tile grid, grout, cracks, deep scratches, chips, dirt, grime, "
    "heavy wear, rust, metal, pattern"
)
LIMITATIONS = [
    "Raw StableMaterials maps are not a bake, delivery or game-ready material.",
    "The runner does not start, restart, free, unload or reconfigure ComfyUI.",
    "Loader memory failures depend on server state; successful UI runs also need comparison.",
    "Material wiring, UVs, in-scene review and export are separate evidence.",
]


class RunnerError(ValueError):
    pass


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolve_path(value, job_dir):
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    for candidate in (job_dir / path, Path.cwd() / path):
        if candidate.exists():
            return candidate.resolve()
    return (job_dir / path).resolve()


def load_job(path):
    path = Path(path).resolve()
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RunnerError(f"cannot read job {path}: {exc}") from exc
    if not isinstance(document, dict):
        raise RunnerError("job must be a JSON object")
    if not isinstance(document.get("materials"), list) or not document["materials"]:
        raise RunnerError("job.materials must be a non-empty list")
    seen = set()
    materials = []
    for index, raw in enumerate(document["materials"]):
        if not isinstance(raw, dict):
            raise RunnerError(f"materials[{index}] must be an object")
        material_id = raw.get("id")
        if not isinstance(material_id, str) or not NAME_RE.fullmatch(material_id):
            raise RunnerError(f"materials[{index}].id must match {NAME_RE.pattern!r}")
        if material_id in seen:
            raise RunnerError(f"duplicate material id: {material_id}")
        seen.add(material_id)
        prompt = raw.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            raise RunnerError(f"{material_id}.prompt must be a non-empty string")
        material = {
            "id": material_id,
            "label": raw.get("label", material_id),
            "prompt": prompt.strip(),
            "negative": raw.get("negative", document.get("negative", DEFAULT_NEGATIVE)),
        }
        if "seed" in raw:
            material["seed"] = _seed(raw["seed"], f"{material_id}.seed")
        materials.append(material)
    seeds = document.get("seeds", [20261021])
    if not isinstance(seeds, list) or not seeds:
        raise RunnerError("job.seeds must be a non-empty list")
    seeds = [_seed(seed, f"seeds[{index}]") for index, seed in enumerate(seeds)]
    if "template" not in document:
        raise RunnerError("job.template is required")
    job = dict(document)
    job["material_list"] = materials
    job["seeds"] = seeds
    job["job_path"] = str(path)
    return job


def _seed(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise RunnerError(f"{label} must be a non-negative integer")
    return value


def find_node(graph, class_type):
    ids = [node_id for node_id, node in graph.items()
           if isinstance(node, dict) and node.get("class_type") == class_type]
    if len(ids) != 1:
        raise RunnerError(f"workflow needs exactly one {class_type} node, found {len(ids)}")
    return ids[0]


def infer_output_nodes(graph):
    generate_id = find_node(graph, GENERATE_NODE)
    mapping = {}
    for node_id, node in graph.items():
        if not isinstance(node, dict) or node.get("class_type") != "SaveImage":
            continue
        images = node.get("inputs", {}).get("images")
        if not isinstance(images, list) or len(images) != 2:
            continue
        if str(images[0]) != generate_id:
            continue
        try:
            index = int(images[1])
        except (TypeError, ValueError) as exc:
            raise RunnerError(f"SaveImage {node_id} has a non-integer image index") from exc
        name = MAP_NAMES.get(index)
        title = str(node.get("_meta", {}).get("title", "")).lower().replace(" ", "")
        for candidate in MAP_NAMES.values():
            if candidate in title:
                name = candidate
                break
        if name is None:
            raise RunnerError(
                f"SaveImage {node_id} uses unsupported StableMaterials output index {index}")
        if name in mapping:
            raise RunnerError(f"duplicate output map {name}")
        mapping[name] = node_id
    if not mapping:
        raise RunnerError("workflow has no SaveImage nodes connected to StableMaterialsGenerate")
    return mapping


def validate_template(graph):
    find_node(graph, LOAD_NODE)
    find_node(graph, GENERATE_NODE)
    return infer_output_nodes(graph)


def resolve_settings(job, args):
    mode = args.mode or job.get("mode", "Standard (50 steps, quality)")
    if mode.startswith("LCM"):
        default_steps = 4
    else:
        default_steps = 50
    if args.steps is not None:
        steps = args.steps
    elif args.mode is not None and args.mode != job.get("mode"):
        steps = default_steps
    else:
        steps = job.get("steps", default_steps)
    cfg = args.cfg if args.cfg is not None else job.get("cfg", 7.5)
    size = args.size if args.size is not None else job.get("size", 1024)
    if steps < 1 or steps > 200:
        raise RunnerError("steps must be between 1 and 200")
    if size < 64 or size > 2048:
        raise RunnerError("size must be between 64 and 2048")
    if cfg <= 0:
        raise RunnerError("cfg must be greater than zero")
    return {
        "mode": mode,
        "steps": steps,
        "cfg": float(cfg),
        "size": int(size),
        "prompt_suffix": job.get("prompt_suffix", DEFAULT_SUFFIX),
        "filename_prefix": job.get("filename_prefix", "stablematerials"),
    }


def iter_jobs(job, args):
    seeds = [_seed(value, "seeds") for value in
             (args.seeds.split(",") if args.seeds else job["seeds"])]
    for material in job["material_list"]:
        if args.material and material["id"] != args.material:
            continue
        material_seeds = [material["seed"]] if "seed" in material else seeds
        for seed in material_seeds:
            yield material, seed


def build_graph(template, output_nodes, material, seed, settings):
    graph = copy.deepcopy(template)
    load_id = find_node(graph, LOAD_NODE)
    generate_id = find_node(graph, GENERATE_NODE)
    graph[load_id]["inputs"]["mode"] = settings["mode"]
    inputs = graph[generate_id]["inputs"]
    inputs["prompt"] = material["prompt"] + " " + settings["prompt_suffix"]
    inputs["negative_prompt"] = material["negative"]
    inputs["seed"] = seed
    inputs["steps"] = settings["steps"]
    inputs["guidance_scale"] = settings["cfg"]
    inputs["width"] = settings["size"]
    inputs["height"] = settings["size"]
    inputs["tileable"] = True
    tag = f"{settings['filename_prefix']}_{material['id']}_seed{seed}"
    for map_name, node_id in output_nodes.items():
        graph[node_id]["inputs"]["filename_prefix"] = f"{tag}_{map_name}"
    return graph, tag


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
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RunnerError(f"{exc.code} {exc.reason}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RunnerError(f"cannot reach ComfyUI: {exc}") from exc


def download(url, path):
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    path.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def format_comfy_error(status):
    for message in status.get("messages", []):
        if isinstance(message, list) and len(message) == 2 and message[0] == "execution_error":
            detail = message[1]
            return f"{detail.get('node_type', 'node')} failed: {detail.get('exception_message', 'unknown error')}"
    return f"ComfyUI status: {status}"


def submit_and_wait(base_url, graph, timeout, prompt_id, tag):
    queued = request_json(
        base_url.rstrip("/") + "/prompt",
        {"prompt": graph, "client_id": "stable-materials-" + uuid.uuid4().hex})
    prompt_id = queued.get("prompt_id", prompt_id)
    deadline = time.time() + timeout
    entry = None
    while time.time() < deadline:
        history = request_json(base_url.rstrip("/") + "/history/" + prompt_id)
        if prompt_id in history:
            entry = history[prompt_id]
            if entry.get("status", {}).get("status_str") in ("success", "error"):
                break
        time.sleep(5)
    if entry is None:
        raise RunnerError(f"{tag} did not finish within {timeout}s")
    status = entry.get("status", {})
    if status.get("status_str") != "success":
        raise RunnerError(f"{tag} failed: {format_comfy_error(status)}")
    return prompt_id, entry


def write_summary(out_dir, manifest):
    """Write a phase-5 compatible summary so review_colour.py can consume a run.

    review_colour.py reads summary.json; the runner's own record stays in
    run-manifest.json with prompts, server details and failure reasons.
    """
    results = []
    for entry in manifest.get("materials", {}).values():
        files = {name: {"path": value.get("path"), "sha256": value.get("sha256")}
                 for name, value in (entry.get("files") or {}).items()}
        results.append({
            "material": entry.get("id"),
            "seed": entry.get("seed"),
            "status": entry.get("status"),
            "files": files,
        })
    summary = {
        "runner": manifest.get("runner"),
        "template": manifest.get("template"),
        "template_sha256": manifest.get("template_sha256"),
        "source_manifest": str(Path(out_dir) / "run-manifest.json"),
        "results": results,
    }
    path = Path(out_dir) / "summary.json"
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return path


def run(args):
    job = load_job(args.job)
    job_dir = Path(job["job_path"]).parent
    template_path = (Path(args.template).expanduser().resolve()
                     if args.template else _resolve_path(job["template"], job_dir))
    if not template_path.exists():
        raise RunnerError(f"workflow template not found: {template_path}")
    template = json.loads(template_path.read_text(encoding="utf-8"))
    inferred = validate_template(template)
    output_nodes = {}
    requested = job.get("output_nodes", {})
    if requested:
        for name, node_id in requested.items():
            node_id = str(node_id)
            if name not in MAP_NAMES.values() or node_id not in template:
                raise RunnerError(f"invalid output node mapping: {name} -> {node_id}")
            if template[node_id].get("class_type") != "SaveImage":
                raise RunnerError(f"output node {node_id} is not SaveImage")
            output_nodes[name] = node_id
    else:
        output_nodes = inferred
    if not output_nodes:
        raise RunnerError("no output maps selected")

    settings = resolve_settings(job, args)
    base_url = (args.base_url or job.get("base_url") or "http://192.168.1.190:8188").rstrip("/")
    out_dir = Path(args.out_dir).resolve()
    raw_dir = out_dir / "raw"
    api_dir = out_dir / "api"
    raw_dir.mkdir(parents=True, exist_ok=True)
    api_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "run-manifest.json"
    if manifest_path.exists():
        raise RunnerError(f"refusing to overwrite {manifest_path}")
    if any(raw_dir.iterdir()):
        raise RunnerError(f"refusing to mix outputs in non-empty {raw_dir}")

    manifest = {
        "runner": "run_comfy_workflow_stable_materials.py",
        "workflow": "stablematerials",
        "base_url": base_url,
        "job": job["job_path"],
        "template": str(template_path),
        "template_sha256": sha256_file(template_path),
        "mode": settings["mode"],
        "steps": settings["steps"],
        "cfg": settings["cfg"],
        "size": settings["size"],
        "prompt_suffix": settings["prompt_suffix"],
        "output_nodes": output_nodes,
        "materials": {},
        "failures": [],
        "dry_run": bool(args.dry_run),
        "limitations": LIMITATIONS,
    }

    jobs = list(iter_jobs(job, args))
    if not jobs:
        raise RunnerError(f"no matching material: {args.material}")

    if args.dry_run:
        for material, seed in jobs:
            graph, tag = build_graph(template, output_nodes, material, seed, settings)
            (api_dir / f"{tag}_prompt.json").write_text(
                json.dumps(graph, indent=2), encoding="utf-8")
            manifest["materials"][f"{material['id']}_seed{seed}"] = {
                "id": material["id"],
                "label": material["label"],
                "prompt": material["prompt"],
                "seed": seed,
                "status": "dry_run",
                "prompt_file": str(api_dir / f"{tag}_prompt.json"),
            }
        manifest["status"] = "dry_run"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return out_dir, manifest

    try:
        stats = request_json(base_url + "/system_stats", timeout=15)
        manifest["server"] = {
            "os": stats.get("system", {}).get("os"),
            "comfyui_version": stats.get("system", {}).get("comfyui_version"),
            "devices": stats.get("devices"),
        }
    except RunnerError as exc:
        manifest["server_error"] = str(exc)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        raise

    for material, seed in jobs:
        graph, tag = build_graph(template, output_nodes, material, seed, settings)
        (api_dir / f"{tag}_prompt.json").write_text(
            json.dumps(graph, indent=2), encoding="utf-8")
        started = time.time()
        try:
            prompt_id, entry = submit_and_wait(
                base_url, graph, args.timeout, uuid.uuid4().hex, tag)
            files = {}
            for map_name, node_id in output_nodes.items():
                images = entry.get("outputs", {}).get(node_id, {}).get("images", [])
                if not images:
                    raise RunnerError(f"{tag} missing output map {map_name}")
                image = images[0]
                query = urllib.parse.urlencode({
                    "filename": image["filename"],
                    "subfolder": image.get("subfolder", ""),
                    "type": image.get("type", "output"),
                })
                target = raw_dir / f"{tag}_{map_name}.png"
                size, digest = download(base_url + "/view?" + query, target)
                files[map_name] = {
                    "path": str(target),
                    "bytes": size,
                    "sha256": digest,
                    "server_filename": image["filename"],
                }
            manifest["materials"][f"{material['id']}_seed{seed}"] = {
                "id": material["id"],
                "label": material["label"],
                "prompt": material["prompt"],
                "seed": seed,
                "status": "success",
                "prompt_id": prompt_id,
                "elapsed_s": round(time.time() - started, 1),
                "files": files,
            }
            print("STABLE_MATERIALS_OK " + json.dumps({
                "id": material["id"], "seed": seed, "prompt_id": prompt_id,
                "paths": {name: value["path"] for name, value in files.items()},
            }, sort_keys=True))
        except (RunnerError, TimeoutError, OSError, urllib.error.URLError) as exc:
            failure = {
                "id": material["id"],
                "seed": seed,
                "elapsed_s": round(time.time() - started, 1),
                "error": str(exc),
            }
            manifest["failures"].append(failure)
            manifest["materials"][f"{material['id']}_seed{seed}"] = {
                "id": material["id"], "label": material["label"],
                "seed": seed, "status": "failed", "error": str(exc),
            }
            manifest["status"] = "failed"
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            print("STABLE_MATERIALS_FAILED " + json.dumps(failure, sort_keys=True))
            if not args.continue_on_error:
                break

    if "status" not in manifest:
        manifest["status"] = "success" if not manifest["failures"] else "failed"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    write_summary(out_dir, manifest)
    if manifest["failures"]:
        raise RunnerError(f"{len(manifest['failures'])} material job(s) failed; see {manifest_path}")
    return out_dir, manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--job", required=True, help="job JSON")
    parser.add_argument("--out-dir", required=True, help="new output directory")
    parser.add_argument("--base-url", help="ComfyUI base URL; overrides the job")
    parser.add_argument("--template", help="API workflow JSON; overrides the job")
    parser.add_argument("--mode", choices=("Standard (50 steps, quality)",
                                           "LCM (4 steps, fast)"))
    parser.add_argument("--steps", type=int)
    parser.add_argument("--cfg", type=float)
    parser.add_argument("--size", type=int)
    parser.add_argument("--seeds", help="comma-separated seeds; overrides the job")
    parser.add_argument("--material", help="run only one material id")
    parser.add_argument("--timeout", type=int, default=1800,
                        help="per-job timeout in seconds")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate and write API graphs without contacting ComfyUI")
    parser.add_argument("--continue-on-error", action="store_true",
                        help="continue remaining jobs after a failure")
    args = parser.parse_args(argv)
    try:
        out_dir, manifest = run(args)
    except (RunnerError, OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(1)
    print(json.dumps({
        "ok": True,
        "status": manifest.get("status"),
        "out_dir": str(out_dir),
        "manifest": str(out_dir / "run-manifest.json"),
        "materials": len(manifest.get("materials", {})),
        "failures": len(manifest.get("failures", [])),
    }, indent=2))


if __name__ == "__main__":
    main()
