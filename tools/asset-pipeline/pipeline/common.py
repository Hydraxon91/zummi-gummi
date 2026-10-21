"""Shared helpers for the asset pipeline entry point.

Validation lives here so a job fails before Blender touches a scene.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

LIMITS = [
    "Baked channels are derived from the evaluated shader, not re-authored art.",
    "A baked atlas is not proof of reference fidelity or user acceptance.",
    "The source .blend is preserved; the atlas is a derived export candidate.",
]


class PipelineError(ValueError):
    pass


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_path(value, base=None):
    """Resolve job paths against the repository root, like every project command."""
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    return (REPO_ROOT / path).resolve()


def require_int(value, field, minimum=None, maximum=None):
    if isinstance(value, bool):
        raise PipelineError(f"{field} must be an integer, not a boolean")
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        value = int(value.strip())
    if not isinstance(value, int):
        raise PipelineError(f"{field} must be an integer, got {value!r}")
    if minimum is not None and value < minimum:
        raise PipelineError(f"{field} must be >= {minimum}")
    if maximum is not None and value > maximum:
        raise PipelineError(f"{field} must be <= {maximum}")
    return value


def require_number(value, field, minimum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PipelineError(f"{field} must be a number, got {value!r}")
    if minimum is not None and value < minimum:
        raise PipelineError(f"{field} must be >= {minimum}")
    return float(value)


def require_string(value, field):
    if not isinstance(value, str) or not value.strip():
        raise PipelineError(f"{field} must be a non-empty string")
    return value.strip()


def names(job, field="objects"):
    values = job.get(field)
    if not isinstance(values, list) or not values:
        raise PipelineError(f"job.{field} must be a non-empty list")
    for value in values:
        require_string(value, f"job.{field} entry")
    return list(values)


def load_job(path):
    path = Path(path).resolve()
    try:
        job = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PipelineError(f"cannot read job {path}: {exc}") from exc
    if not isinstance(job, dict):
        raise PipelineError("job must be a JSON object")
    job["_path"] = str(path)
    job["_dir"] = str(path.parent)
    return job


def prepared_out_dir(job, key="out_dir"):
    value = job.get(key)
    if not isinstance(value, str) or not value.strip():
        raise PipelineError(f"job.{key} is required")
    out = resolve_path(value, job.get("_dir"))
    out.mkdir(parents=True, exist_ok=True)
    return out


def write_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def new_path(directory, filename):
    path = Path(directory) / filename
    if path.exists():
        raise PipelineError(f"refusing to overwrite {path}")
    return path


def blender_objects(object_names):
    import bpy

    found = []
    for name in object_names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise PipelineError(f"object not found: {name}")
        found.append(obj)
    return found


def mesh_objects(roots, exclude=()):
    """Expand roots to unique render-enabled meshes, honouring exclusions."""
    excluded = set(exclude)
    result = []
    for root in roots:
        candidates = [root, *root.children_recursive] if root.type == "EMPTY" else [root]
        for obj in candidates:
            if (obj.type == "MESH" and obj.name not in excluded and
                    not obj.hide_render and obj not in result):
                result.append(obj)
    if not result:
        raise PipelineError("no mesh objects matched")
    return result


def world_bounds(objects):
    from mathutils import Vector

    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return ([round(min(p[i] for p in points), 6) for i in range(3)],
            [round(max(p[i] for p in points), 6) for i in range(3)])


def scene_snapshot():
    import bpy

    scene = bpy.context.scene
    return {
        "engine": scene.render.engine,
        "camera": scene.camera.name if scene.camera else None,
        "frame": scene.frame_current,
        "selection": [obj.name for obj in bpy.context.selected_objects],
        "active": bpy.context.view_layer.objects.active.name
        if bpy.context.view_layer.objects.active else None,
    }


def restore_snapshot(state):
    import bpy

    scene = bpy.context.scene
    try:
        if state.get("engine"):
            scene.render.engine = state["engine"]
    except TypeError:
        pass
    camera = bpy.data.objects.get(state["camera"]) if state.get("camera") else None
    if camera is not None:
        scene.camera = camera
    if state.get("frame") is not None:
        scene.frame_set(state["frame"])
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for name in state.get("selection", []):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.select_set(True)
    active = bpy.data.objects.get(state["active"]) if state.get("active") else None
    if active is not None:
        bpy.context.view_layer.objects.active = active


def stamped(report):
    report.setdefault("generated", time.strftime("%Y-%m-%dT%H:%M:%S"))
    report.setdefault("limits", list(LIMITS))
    return report
