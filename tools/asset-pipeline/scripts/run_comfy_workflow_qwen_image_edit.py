"""Run reusable Qwen Image 2.1 image-edit jobs through the ComfyUI HTTP API.

The workflow template is an exported ComfyUI API graph for the official
``image_qwen_image_2_1_image_edit`` subgraph: the first image is the edit canvas
(for UV work, the labelled UV template) and the remaining images are references.
A separate job JSON supplies prompts, images, seeds and run settings, so a new
sticker or texture set does not require another Python script. The runner never
starts, restarts, unloads or reconfigures ComfyUI.

Example:
    python3 tools/asset-pipeline/scripts/run_comfy_workflow_qwen_image_edit.py \\
      --job tools/asset-pipeline/examples/laptop-stickers-qwen.job.json \\
      --out-dir .dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/materials/laptop-stickers-001

Validation-only dry run (writes the patched graphs, submits nothing):
    python3 tools/asset-pipeline/scripts/run_comfy_workflow_qwen_image_edit.py \\
      --job tools/asset-pipeline/examples/laptop-stickers-qwen.job.json \\
      --out-dir /tmp/qwen-dry --dry-run

ComfyUI setup (optional, user-supplied):
    - The official Qwen Image 2.1 models loaded by UNETLoader, CLIPLoader and
      VAELoader, and the QwenImage21Cache node present in the server build
    - An API-format workflow containing TextEncodeQwenImage21 and KSampler, plus
      one SaveImage or SaveImageAdvanced node and one LoadImage node per image
      slot (the runner clones a LoadImage when a job supplies more images)
    - Base URL passed by --base-url or the job's base_url, for example
      http://192.168.1.190:8188

Output images are raw model output, not a delivered or baked texture. The job
manifest records the template hash, prompts, seeds, prompt IDs, file hashes and
failures. A failed run is evidence too; nothing is silently replaced.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

EDIT_NODE = "TextEncodeQwenImage21"
SAMPLER_NODE = "KSampler"
SAVE_NODES = ("SaveImage", "SaveImageAdvanced")
LOAD_NODE = "LoadImage"
NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
DEFAULT_NEGATIVE = (
    "text, watermark, signature, UI, frame, border, margin, shadow, lighting, "
    "reflection, gloss highlight, perspective, background objects, gradient, "
    "vignette, blur, noise, jpeg artifacts"
)
LIMITATIONS = [
    "Raw Qwen output is not a delivered, baked or reviewed texture.",
    "The runner does not start, restart, free, unload or reconfigure ComfyUI.",
    "A workflow template is patched by node class, so its node ids are not evidence.",
    "UV layout, placement, material wiring and export are separate verification.",
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


def _integer(value, field):
    """Accept an int or a numeric string; reject everything else with context."""
    if isinstance(value, bool):
        raise RunnerError(f"{field} must be an integer, not a boolean")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    raise RunnerError(f"{field} must be an integer or numeric string, got {value!r}")


def _seed(value, field):
    seed = _integer(value, field)
    if seed < 0:
        raise RunnerError(f"{field} must be zero or greater")
    return seed


def load_job(path):
    path = Path(path).resolve()
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RunnerError(f"cannot read job {path}: {exc}") from exc
    if not isinstance(document, dict):
        raise RunnerError("job must be a JSON object")
    template = document.get("template")
    if not isinstance(template, str) or not template.strip():
        raise RunnerError("job.template must be a path to an API workflow JSON")
    samples = document.get("samples")
    if not isinstance(samples, list) or not samples:
        raise RunnerError("job.samples must be a non-empty list")
    seen = set()
    parsed = []
    for index, raw in enumerate(samples):
        if not isinstance(raw, dict):
            raise RunnerError(f"samples[{index}] must be an object")
        sample_id = raw.get("id")
        if not isinstance(sample_id, str) or not NAME_RE.fullmatch(sample_id):
            raise RunnerError(f"samples[{index}].id must match {NAME_RE.pattern!r}")
        if sample_id in seen:
            raise RunnerError(f"duplicate sample id: {sample_id}")
        seen.add(sample_id)
        prompt = raw.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            raise RunnerError(f"{sample_id}.prompt must be a non-empty string")
        images = raw.get("images")
        if not isinstance(images, list) or not images:
            raise RunnerError(f"{sample_id}.images must be a non-empty list")
        resolved = []
        for position, image in enumerate(images):
            entry = image if isinstance(image, dict) else {"path": image}
            if not isinstance(entry.get("path"), str) or not entry["path"].strip():
                raise RunnerError(f"{sample_id}.images[{position}].path is required")
            image_path = _resolve_path(entry["path"], path.parent)
            if not image_path.is_file():
                raise RunnerError(f"{sample_id}.images[{position}] not found: {image_path}")
            resolved.append({
                "path": image_path,
                "label": entry.get("label", f"image_{position + 1}"),
            })
        sample = {
            "id": sample_id,
            "label": raw.get("label", sample_id),
            "prompt": prompt.strip(),
            "negative": raw.get("negative", document.get("negative", DEFAULT_NEGATIVE)),
            "images": resolved,
        }
        if "seed" in raw:
            sample["seed"] = _seed(raw["seed"], f"{sample_id}.seed")
        parsed.append(sample)
    seeds = document.get("seeds", [20261021])
    if not isinstance(seeds, list) or not seeds:
        raise RunnerError("job.seeds must be a non-empty list")
    return {
        "path": path,
        "template": _resolve_path(template, path.parent),
        "base_url": document.get("base_url", "http://127.0.0.1:8188"),
        "steps": _integer(document.get("steps", 25), "job.steps"),
        "cfg": float(document.get("cfg", 1.0)),
        "resolution": _integer(document.get("resolution", 0), "job.resolution"),
        "filename_prefix": document.get("filename_prefix", "qwen_edit"),
        "negative": document.get("negative", DEFAULT_NEGATIVE),
        "seeds": [_seed(seed, f"seeds[{index}]")
                  for index, seed in enumerate(seeds)],
        "samples": parsed,
    }


def load_template(path):
    try:
        graph = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RunnerError(f"cannot read template {path}: {exc}") from exc
    if not isinstance(graph, dict) or not graph:
        raise RunnerError("template must be a non-empty API-format object")
    for node_id, node in graph.items():
        if not isinstance(node, dict) or "class_type" not in node:
            raise RunnerError(f"template node {node_id} is not API format")
    return graph


def nodes_by_class(graph, class_type):
    return [node_id for node_id, node in graph.items()
            if node.get("class_type") == class_type]


def require_one(graph, class_type):
    found = nodes_by_class(graph, class_type)
    if len(found) != 1:
        raise RunnerError(
            f"template must contain exactly one {class_type} node, found {len(found)}")
    return found[0]


def _next_id(graph):
    index = len(graph)
    while f"ref_{index}" in graph:
        index += 1
    return f"ref_{index}"


def attach_images(graph, images):
    """Point the edit node at the uploaded images, cloning LoadImage as needed."""
    edit_id = require_one(graph, EDIT_NODE)
    edit_inputs = graph[edit_id]["inputs"]
    for key in [key for key in edit_inputs if key.startswith("images.")]:
        del edit_inputs[key]
    loaders = sorted(nodes_by_class(graph, LOAD_NODE))
    if not loaders:
        raise RunnerError("template must contain at least one LoadImage node")
    slots = []
    for index, image in enumerate(images):
        if index < len(loaders):
            node_id = loaders[index]
        else:
            node_id = _next_id(graph)
            graph[node_id] = {
                "class_type": LOAD_NODE,
                "inputs": {"image": ""},
                "_meta": {"title": "Load Image"},
            }
        graph[node_id]["inputs"]["image"] = image["uploaded"]
        slots.append(node_id)
    for index, node_id in enumerate(slots, start=1):
        edit_inputs[f"images.image_{index}"] = [node_id, 0]
    return edit_inputs, slots


def patch_graph(template, sample, seed, settings):
    graph = copy.deepcopy(template)
    edit_inputs, loaders = attach_images(graph, sample["images"])
    edit_inputs["prompt"] = sample["prompt"]
    edit_inputs["negative_prompt"] = sample["negative"]
    if "resolution" in edit_inputs:
        edit_inputs["resolution"] = settings["resolution"]
    sampler_id = require_one(graph, SAMPLER_NODE)
    sampler_inputs = graph[sampler_id]["inputs"]
    sampler_inputs["seed"] = seed
    sampler_inputs["steps"] = settings["steps"]
    sampler_inputs["cfg"] = settings["cfg"]
    save_nodes = [node_id for node_id in graph
                  if graph[node_id].get("class_type") in SAVE_NODES]
    if not save_nodes:
        raise RunnerError("template must contain a SaveImage or SaveImageAdvanced node")
    for node_id in save_nodes:
        graph[node_id]["inputs"]["filename_prefix"] = settings["filename_prefix"]
    return graph, loaders


def request_json(url, payload=None, timeout=60):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def upload_image(base_url, path, name):
    boundary = "----qwen" + uuid.uuid4().hex
    body = bytearray()
    for key, value in {"type": "input", "overwrite": "true"}.items():
        body.extend(("--" + boundary + "\r\n").encode())
        body.extend(("Content-Disposition: form-data; name=\"%s\"\r\n\r\n" % key).encode())
        body.extend((str(value) + "\r\n").encode())
    body.extend(("--" + boundary + "\r\n").encode())
    body.extend(("Content-Disposition: form-data; name=\"image\"; filename=\"%s\"\r\n"
                 % name).encode())
    body.extend(b"Content-Type: image/png\r\n\r\n")
    body.extend(Path(path).read_bytes())
    body.extend(("\r\n--" + boundary + "--\r\n").encode())
    request = urllib.request.Request(
        base_url.rstrip("/") + "/upload/image",
        data=bytes(body),
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)["name"]


def download(base_url, image, target):
    query = urllib.parse.urlencode({
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    })
    with urllib.request.urlopen(base_url.rstrip("/") + "/view?" + query,
                                timeout=180) as response:
        data = response.read()
    target.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def collect_images(entry):
    """Return every rendered image in a history entry, whatever node produced it."""
    found = []
    for node_id, output in (entry.get("outputs") or {}).items():
        for image in output.get("images", []) if isinstance(output, dict) else []:
            if isinstance(image, dict) and image.get("filename"):
                found.append((node_id, image))
    return found


def submit_and_wait(base_url, graph, tag, timeout):
    started = time.time()
    try:
        queued = request_json(
            base_url.rstrip("/") + "/prompt",
            {"prompt": graph, "client_id": "qwen-edit-" + uuid.uuid4().hex})
    except (urllib.error.URLError, OSError) as exc:
        return {"status": "submit_failed", "error": str(exc),
                "elapsed_s": round(time.time() - started, 1)}
    prompt_id = queued.get("prompt_id")
    deadline = time.time() + timeout
    entry = None
    while time.time() < deadline:
        history = request_json(base_url.rstrip("/") + "/history/" + prompt_id)
        if prompt_id in history:
            entry = history[prompt_id]
            if entry.get("status", {}).get("status_str") in ("success", "error"):
                break
        time.sleep(5)
    elapsed = round(time.time() - started, 1)
    if entry is None:
        return {"status": "timeout", "prompt_id": prompt_id, "elapsed_s": elapsed}
    status = entry.get("status", {})
    if status.get("status_str") != "success":
        return {"status": "failed", "prompt_id": prompt_id, "elapsed_s": elapsed,
                "status_detail": status}
    images = collect_images(entry)
    if not images:
        return {"status": "no_output", "prompt_id": prompt_id, "elapsed_s": elapsed}
    return {"status": "success", "prompt_id": prompt_id, "elapsed_s": elapsed,
            "images": images}


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--job", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--base-url", default=None)
    parser.add_argument("--seeds", default=None,
                        help="Comma-separated seeds overriding the job seeds")
    parser.add_argument("--steps", type=int, default=None)
    parser.add_argument("--cfg", type=float, default=None)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate and write patched graphs without submitting")
    args = parser.parse_args()

    job = load_job(args.job)
    settings = {
        "steps": job["steps"] if args.steps is None else args.steps,
        "cfg": job["cfg"] if args.cfg is None else args.cfg,
        "resolution": job["resolution"],
        "filename_prefix": job["filename_prefix"],
    }
    if args.seeds:
        try:
            seeds = [_seed(value, "--seeds") for value in args.seeds.split(",")
                     if value.strip()]
        except RunnerError as exc:
            raise SystemExit(f"invalid --seeds: {exc}") from exc
        if not seeds:
            raise SystemExit("--seeds produced no values")
    else:
        seeds = job["seeds"]
    base_url = args.base_url or job["base_url"]
    template = load_template(job["template"])
    out_dir = Path(args.out_dir).expanduser().resolve()
    raw_dir = out_dir / "raw"
    graph_dir = out_dir / "graphs"
    raw_dir.mkdir(parents=True, exist_ok=True)
    graph_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "job": str(job["path"]),
        "job_sha256": sha256_file(job["path"]),
        "template": str(job["template"]),
        "template_sha256": sha256_file(job["template"]),
        "base_url": base_url,
        "settings": settings,
        "seeds": seeds,
        "dry_run": args.dry_run,
        "results": [],
        "limits": LIMITATIONS,
    }

    if not args.dry_run:
        try:
            request_json(base_url.rstrip("/") + "/system_stats", timeout=15)
        except (urllib.error.URLError, OSError) as exc:
            raise SystemExit(f"ComfyUI not reachable at {base_url}: {exc}") from exc
        manifest["server"] = request_json(
            base_url.rstrip("/") + "/system_stats", timeout=15).get("system", {})

    failures = 0
    for sample in job["samples"]:
        uploaded = []
        for position, image in enumerate(sample["images"]):
            name = f"qwen_{sample['id']}_{position + 1}_{sha256_file(image['path'])[:12]}.png"
            if args.dry_run:
                uploaded_name = name
            else:
                uploaded_name = upload_image(base_url, image["path"], name)
            registered = dict(image)
            registered["uploaded"] = uploaded_name
            registered["sha256"] = sha256_file(image["path"])
            registered["bytes"] = image["path"].stat().st_size
            uploaded.append(registered)
        prepared = dict(sample)
        prepared["images"] = uploaded
        for seed in [sample.get("seed", seed) for seed in seeds]:
            tag = f"{sample['id']}_seed{seed}"
            graph, loaders = patch_graph(template, prepared, seed, settings)
            graph_path = graph_dir / f"{tag}_prompt.json"
            graph_path.write_text(json.dumps(graph, indent=2), encoding="utf-8")
            record = {
                "sample": sample["id"],
                "label": sample["label"],
                "tag": tag,
                "seed": seed,
                "prompt": sample["prompt"],
                "negative": sample["negative"],
                "images": [{"label": image["label"], "path": str(image["path"]),
                            "sha256": image["sha256"], "uploaded": image["uploaded"]}
                           for image in uploaded],
                "loader_nodes": loaders,
                "graph": str(graph_path),
            }
            if args.dry_run:
                record["status"] = "dry_run"
                manifest["results"].append(record)
                print("QWEN_EDIT_DRY_RUN", json.dumps(record, sort_keys=True))
                continue
            result = submit_and_wait(base_url, graph, tag, args.timeout)
            record.update({key: value for key, value in result.items() if key != "images"})
            record["files"] = []
            for index, (node_id, image) in enumerate(result.get("images", [])):
                target = raw_dir / f"{tag}_{index}.png"
                size, digest = download(base_url, image, target)
                record["files"].append({
                    "path": str(target),
                    "save_node": node_id,
                    "server_filename": image["filename"],
                    "bytes": size,
                    "sha256": digest,
                })
            if record.get("status") != "success":
                failures += 1
            manifest["results"].append(record)
            print("QWEN_EDIT_RUN", json.dumps({key: record[key] for key in
                                               ("tag", "status", "prompt_id", "elapsed_s")
                                               if key in record}, sort_keys=True))

    manifest["failures"] = failures
    manifest["outputs"] = sum(len(item.get("files", [])) for item in manifest["results"])
    (out_dir / "run-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8")
    print("QWEN_EDIT_SUMMARY", json.dumps({
        "samples": len(job["samples"]),
        "runs": len(manifest["results"]),
        "outputs": manifest["outputs"],
        "failures": failures,
        "out_dir": str(out_dir),
    }, sort_keys=True))
    if failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
