"""Crop reference sheets and build calibrated, non-rendering Blender plane guides.

Run inside Blender:

    Blender --background --factory-startup --python-exit-code 1 \
      --python tools/asset-pipeline/scripts/reference_sheet.py -- \
      --sheet sheet.jpg --views views.json --out-dir .dev-shots/reference-sheet \
      --build .dev-shots/reference-sheet/references_001.blend --new-scene

The tool does not detect views or decide real-world dimensions. The author supplies
pixel rectangles, at least one calibrated distance and a shared world origin. A
three-quarter/perspective view can be cropped as a visual guide but is never built as
a measurement plane.

View JSON (``reference-sheet-views/v1``)::

    {
      "schema": "reference-sheet-views/v1",
      "views": [
        {
          "name": "body_front",
          "rect": [40, 40, 320, 240],
          "projection": "front",
          "origin_px": [200, 280],
          "calibration": {
            "p1": [40, 280], "p2": [360, 280],
            "distance_mm": 3200, "label": "overall width",
            "scale_authority": true
          }
        }
      ]
    }

Rectangles use sheet pixels with a top-left origin. ``origin_px`` is the pixel that maps
to ``origin_world_mm`` (default ``[0, 0, 0]``); it is the shared landmark that keeps
front/side/top views registered. All calibrated views must agree with the authority
within ``--scale-tolerance`` (default 0.5%). Crops retain the source aspect ratio.

Image pixels are read and written through Blender. No third-party imaging package is
required. The source sheets and the output crops are not committed by this script.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path

try:
    import bpy
except ImportError:  # pure-Python core tests import this module without Blender
    bpy = None

try:
    import numpy as np
except ImportError:  # only the Blender image path needs numpy
    np = None


SCHEMA = "reference-sheet/v1"
VIEWS_SCHEMA = "reference-sheet-views/v1"
PROJECTIONS = ("front", "side", "top", "visual")
NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
LIMITATIONS = [
    "Scale is only as reliable as the supplied distance and landmark points.",
    "The tool does not prove that a sheet is truly orthographic or that separate views agree.",
    "Opaque sheet backgrounds are preserved; this is not a background-removal tool.",
    "Perspective and three-quarter views are cropped for visual reference, not measurement.",
    "Reference planes are viewport guides; they are locked and excluded from rendering.",
]


class ReferenceSheetError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Pure geometry and validation
# ---------------------------------------------------------------------------

def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _number(value, label, minimum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ReferenceSheetError(f"{label} must be a number")
    value = float(value)
    if not math.isfinite(value):
        raise ReferenceSheetError(f"{label} must be finite")
    if minimum is not None and value < minimum:
        raise ReferenceSheetError(f"{label} must be at least {minimum}")
    return value


def validate_rect(rect, width, height, label="rect"):
    if not isinstance(rect, (list, tuple)) or len(rect) != 4:
        raise ReferenceSheetError(f"{label} must be [x, y, width, height]")
    x, y, w, h = (_number(value, f"{label}[{i}]", 0) for i, value in enumerate(rect))
    if not all(float(value).is_integer() for value in (x, y, w, h)):
        raise ReferenceSheetError(f"{label} coordinates must be whole pixels")
    x, y, w, h = int(x), int(y), int(w), int(h)
    if w < 1 or h < 1:
        raise ReferenceSheetError(f"{label} must have positive width and height")
    if x + w > width or y + h > height:
        raise ReferenceSheetError(
            f"{label} {x, y, w, h} exceeds sheet bounds {width}x{height}")
    return [x, y, w, h]


def _read_point(value, label, width, height, inside_rect=None):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ReferenceSheetError(f"{label} must be [x, y]")
    x, y = (_number(part, f"{label}[{i}]") for i, part in enumerate(value))
    if not (0 <= x <= width and 0 <= y <= height):
        raise ReferenceSheetError(f"{label} {x, y} is outside the sheet")
    if inside_rect is not None:
        rx, ry, rw, rh = inside_rect
        if not (rx <= x <= rx + rw and ry <= y <= ry + rh):
            raise ReferenceSheetError(f"{label} {x, y} is outside its view rectangle")
    return [x, y]


def load_views(document):
    """Validate and normalize the view document without touching an image."""
    if not isinstance(document, dict):
        raise ReferenceSheetError("views document must be an object")
    if document.get("schema", VIEWS_SCHEMA) != VIEWS_SCHEMA:
        raise ReferenceSheetError(f"unsupported views schema: {document.get('schema')}")
    views = document.get("views")
    if not isinstance(views, list) or not views:
        raise ReferenceSheetError("views must be a non-empty list")

    normalized, names = [], set()
    for index, raw in enumerate(views):
        if not isinstance(raw, dict):
            raise ReferenceSheetError(f"views[{index}] must be an object")
        name = raw.get("name")
        if not isinstance(name, str) or not NAME_RE.fullmatch(name):
            raise ReferenceSheetError(
                f"views[{index}].name must match {NAME_RE.pattern!r}")
        if name in names:
            raise ReferenceSheetError(f"duplicate view name: {name}")
        names.add(name)

        projection = raw.get("projection")
        if projection not in PROJECTIONS:
            raise ReferenceSheetError(
                f"{name}.projection must be one of {', '.join(PROJECTIONS)}")
        if not isinstance(raw.get("rect"), (list, tuple)) or len(raw["rect"]) != 4:
            raise ReferenceSheetError(f"{name}.rect must be [x, y, width, height]")
        rect = [int(value) if float(value).is_integer() else value
                for value in raw["rect"]]

        flip_u = raw.get("flip_u", False)
        flip_v = raw.get("flip_v", False)
        if not isinstance(flip_u, bool) or not isinstance(flip_v, bool):
            raise ReferenceSheetError(f"{name}.flip_u/flip_v must be booleans")

        origin_world = raw.get("origin_world_mm", [0, 0, 0])
        if not isinstance(origin_world, (list, tuple)) or len(origin_world) != 3:
            raise ReferenceSheetError(f"{name}.origin_world_mm must have three values")
        origin_world = [_number(value, f"{name}.origin_world_mm[{i}]")
                        for i, value in enumerate(origin_world)]

        view = {
            "name": name,
            "rect": rect,
            "projection": projection,
            "flip_u": flip_u,
            "flip_v": flip_v,
            "origin_world_mm": origin_world,
            "plane_offset_mm": _number(
                raw.get("plane_offset_mm", 0), f"{name}.plane_offset_mm"),
            "notes": raw.get("notes", ""),
        }
        if raw.get("origin_px") is not None:
            view["origin_px"] = raw["origin_px"]
        if raw.get("calibration") is not None:
            calibration = raw["calibration"]
            if not isinstance(calibration, dict):
                raise ReferenceSheetError(f"{name}.calibration must be an object")
            view["calibration"] = {
                "p1": calibration.get("p1"),
                "p2": calibration.get("p2"),
                "distance_mm": calibration.get("distance_mm"),
                "label": calibration.get("label", ""),
                "scale_authority": bool(calibration.get("scale_authority", False)),
            }
        normalized.append(view)
    return normalized


def validate_views(views, width, height, scale_tolerance=0.005):
    """Validate bounds, landmarks and scale consistency. Return errors and warnings."""
    errors, warnings = [], []
    for view in views:
        name = view["name"]
        try:
            view["rect"] = validate_rect(view["rect"], width, height, f"{name}.rect")
        except ReferenceSheetError as exc:
            errors.append(str(exc))
            continue

        if view["projection"] != "visual":
            if "origin_px" not in view:
                errors.append(f"{name}.origin_px is required for a measurement plane")
            else:
                try:
                    view["origin_px"] = _read_point(
                        view["origin_px"], f"{name}.origin_px", width, height,
                        view["rect"])
                except ReferenceSheetError as exc:
                    errors.append(str(exc))

        calibration = view.get("calibration")
        if calibration:
            try:
                calibration["p1"] = _read_point(
                    calibration["p1"], f"{name}.calibration.p1", width, height)
                calibration["p2"] = _read_point(
                    calibration["p2"], f"{name}.calibration.p2", width, height)
                distance_mm = _number(
                    calibration["distance_mm"], f"{name}.calibration.distance_mm", 0)
                dx = calibration["p2"][0] - calibration["p1"][0]
                dy = calibration["p2"][1] - calibration["p1"][1]
                distance_px = math.hypot(dx, dy)
                if distance_px < 1:
                    raise ReferenceSheetError(
                        f"{name}.calibration landmarks are less than one pixel apart")
                if distance_mm <= 0:
                    raise ReferenceSheetError(
                        f"{name}.calibration.distance_mm must be greater than zero")
                calibration["distance_px"] = distance_px
                calibration["mm_per_px"] = distance_mm / distance_px
                calibration["direction_deg"] = math.degrees(math.atan2(dy, dx))
            except ReferenceSheetError as exc:
                errors.append(str(exc))

    if errors:
        return errors, warnings

    if any(view["projection"] != "visual" for view in views):
        try:
            resolve_scale(views, scale_tolerance, errors, warnings)
        except ReferenceSheetError as exc:
            errors.append(str(exc))

    # Overlapping crops are legal, but usually indicate an accidental rectangle.
    for i, left in enumerate(views):
        for right in views[i + 1:]:
            a, b = left["rect"], right["rect"]
            if (a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and
                    a[1] < b[1] + b[3] and b[1] < a[1] + a[3]):
                warnings.append(
                    f"{left['name']} and {right['name']} rectangles overlap")
    return errors, warnings


def resolve_scale(views, tolerance=0.005, errors=None, warnings=None):
    """Resolve one shared mm/pixel scale from calibrated, non-visual views."""
    errors = errors if errors is not None else []
    warnings = warnings if warnings is not None else []
    calibrated = [view for view in views
                  if view["projection"] != "visual" and view.get("calibration")]
    if not calibrated:
        raise ReferenceSheetError(
            "at least one orthographic view needs a calibration distance")

    scales = [view["calibration"]["mm_per_px"] for view in calibrated]
    if len(calibrated) == 1:
        authority = calibrated[0]
    else:
        marked = [view for view in calibrated
                  if view["calibration"].get("scale_authority")]
        if len(marked) != 1:
            raise ReferenceSheetError(
                "multiple calibrated views require exactly one "
                "calibration.scale_authority=true")
        authority = marked[0]
        low, high = min(scales), max(scales)
        if high / low > 1 + tolerance:
            detail = ", ".join(
                f"{view['name']}={view['calibration']['mm_per_px']:.6f}"
                for view in calibrated)
            raise ReferenceSheetError(
                "calibrated views disagree by more than "
                f"{tolerance * 100:.2f}% ({detail}); resolve the measurements instead "
                "of stretching a view")
        if high / low > 1 + tolerance / 5:
            warnings.append(
                f"calibrated scales differ by {(high / low - 1) * 100:.3f}%")

    scale = authority["calibration"]["mm_per_px"]
    for view in views:
        if view["projection"] == "visual":
            continue
        view["mm_per_px"] = scale
        view["scale_source"] = authority["name"]
    return scale, authority["name"], errors, warnings


def plane_geometry(view, scale):
    """Return local plane corners in mm, UVs, axes and the world placement."""
    if view["projection"] == "visual":
        raise ReferenceSheetError(f"{view['name']} is a visual reference, not a plane")
    if scale <= 0:
        raise ReferenceSheetError("scale must be greater than zero")

    rect = view["rect"]
    origin = view.get("origin_px")
    if origin is None:
        raise ReferenceSheetError(f"{view['name']}.origin_px is required")
    ox = origin[0] - rect[0]
    oy = origin[1] - rect[1]
    if not (0 <= ox <= rect[2] and 0 <= oy <= rect[3]):
        raise ReferenceSheetError(
            f"{view['name']}.origin_px must lie inside the crop")

    sx = -1 if view.get("flip_u") else 1
    sy = -1 if view.get("flip_v") else 1
    width, height = rect[2], rect[3]

    def to_world(u, v):
        # u/v are top-left-origin crop pixels; the result is relative to the
        # projected world origin. The pixel v axis runs downward.
        if view["projection"] == "front":       # image U:+X, V:-Z, normal -Y
            return ((u - ox) * sx * scale, 0.0, (oy - v) * sy * scale)
        if view["projection"] == "side":        # image U:-Y, V:-Z, normal -X
            return (0.0, (ox - u) * sx * scale, (oy - v) * sy * scale)
        if view["projection"] == "top":         # image U:-Y, V:-X, normal +Z
            return ((oy - v) * sy * scale, (ox - u) * sx * scale, 0.0)
        raise ReferenceSheetError(f"unsupported projection: {view['projection']}")

    image_order = [(0, 0), (width, 0), (width, height), (0, height)]
    corners = [to_world(u, v) for u, v in image_order]
    # Mirroring the image inside the plane does not change the plane's facing
    # direction. The material is double-sided; the face order is only winding.
    normal = {
        "front": (0.0, -1.0, 0.0),
        "side": (-1.0, 0.0, 0.0),
        "top": (0.0, 0.0, 1.0),
    }[view["projection"]]

    offset = view.get("plane_offset_mm", 0.0)
    location = tuple(origin_world + normal_axis * offset
                     for origin_world, normal_axis in
                     zip(view.get("origin_world_mm", [0, 0, 0]), normal))
    axes = {
        "front": ("+X", "-Z"),
        "side": ("-Y", "-Z"),
        "top": ("-Y", "-X"),
    }[view["projection"]]
    if view.get("flip_u"):
        axes = (("-" if axes[0][0] == "+" else "+") + axes[0][1], axes[1])
    if view.get("flip_v"):
        axes = (axes[0], ("-" if axes[1][0] == "+" else "+") + axes[1][1])

    return {
        "name": view["name"],
        "corners_mm": [list(corner) for corner in corners],
        "uv": [[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]],
        "face_order": [0, 3, 2, 1],
        "normal": list(normal),
        "location_mm": list(location),
        "width_mm": width * scale,
        "height_mm": height * scale,
        "origin_local_px": [ox, oy],
        "axes": list(axes),
    }


def view_manifest(view, crop_path, crop_sha256, scale):
    record = {
        "name": view["name"],
        "projection": view["projection"],
        "crop": Path(crop_path).name,
        "crop_sha256": crop_sha256,
        "rect": view["rect"],
        "pixel_size": [view["rect"][2], view["rect"][3]],
        "origin_px": view.get("origin_px"),
        "origin_world_mm": view.get("origin_world_mm", [0, 0, 0]),
        "plane_offset_mm": view.get("plane_offset_mm", 0.0),
        "flip_u": view["flip_u"],
        "flip_v": view["flip_v"],
        "notes": view.get("notes", ""),
    }
    if view.get("calibration"):
        calibration = view["calibration"]
        record["calibration"] = {
            "p1": calibration["p1"],
            "p2": calibration["p2"],
            "distance_mm": calibration["distance_mm"],
            "distance_px": calibration["distance_px"],
            "label": calibration.get("label", ""),
            "scale_authority": calibration.get("scale_authority", False),
            "mm_per_px": calibration["mm_per_px"],
            "direction_deg": calibration["direction_deg"],
        }
    if scale is not None and view["projection"] != "visual":
        geometry = plane_geometry(view, scale)
        record.update({
            "mm_per_px": scale,
            "width_mm": geometry["width_mm"],
            "height_mm": geometry["height_mm"],
            "origin_local_px": geometry["origin_local_px"],
            "axes": geometry["axes"],
            "normal": geometry["normal"],
            "location_mm": geometry["location_mm"],
            "corners_mm": geometry["corners_mm"],
        })
    return record


# ---------------------------------------------------------------------------
# Blender image and scene work
# ---------------------------------------------------------------------------

def _require_blender():
    if bpy is None:
        raise ReferenceSheetError("this operation requires Blender's Python (bpy)")
    if np is None:
        raise ReferenceSheetError("Blender Python is missing numpy")


def image_info(path):
    _require_blender()
    path = Path(path).resolve()
    if not path.exists():
        raise ReferenceSheetError(f"sheet not found: {path}")
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        width, height = int(image.size[0]), int(image.size[1])
        if width < 1 or height < 1:
            raise ReferenceSheetError(f"sheet has no pixels: {path}")
        return {
            "path": str(path),
            "sha256": sha256_file(path),
            "width": width,
            "height": height,
            "colorspace": image.colorspace_settings.name,
        }
    finally:
        bpy.data.images.remove(image)


def crop_image(sheet_image, rect, out_path):
    """Crop in top-left pixel coordinates and write an RGBA PNG."""
    _require_blender()
    width, height = map(int, sheet_image.size)
    x, y, crop_width, crop_height = rect
    pixels = np.empty(width * height * 4, dtype=np.float32)
    sheet_image.pixels.foreach_get(pixels)
    # Blender's pixel buffer starts at the bottom-left. Keep that layout and
    # convert the top-left JSON rectangle into a bottom-up slice.
    bottom = height - (y + crop_height)
    top = height - y
    crop = pixels.reshape(height, width, 4)[bottom:top, x:x + crop_width].copy()
    if crop.shape[:2] != (crop_height, crop_width):
        raise ReferenceSheetError(f"crop produced unexpected shape: {crop.shape}")

    image = bpy.data.images.new(
        f"ref_crop_{out_path.stem}", width=crop_width, height=crop_height,
        alpha=True)
    try:
        image.colorspace_settings.name = sheet_image.colorspace_settings.name
        image.pixels.foreach_set(crop.ravel())
        image.filepath_raw = str(out_path)
        image.file_format = "PNG"
        image.save()
    finally:
        bpy.data.images.remove(image)
    if not out_path.exists():
        raise ReferenceSheetError(f"crop was not written: {out_path}")
    return sha256_file(out_path)


def _reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
                       bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def _reference_material(name, image):
    material = bpy.data.materials.new(f"REF_MAT_{name}")
    material.use_nodes = True
    material.use_backface_culling = False
    nodes = material.node_tree.nodes
    nodes.clear()
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "Reference Image"
    texture.image = image
    texture.extension = "CLIP"
    texture.interpolation = "Linear"
    emission = nodes.new("ShaderNodeEmission")
    emission.name = "Unlit Reference"
    emission.inputs["Strength"].default_value = 1.0
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def build_reference_scene(views, crop_paths, manifest_path, out_blend, pack=True):
    """Replace the current scene with a Reference collection and save a new .blend."""
    _require_blender()
    out_blend = Path(out_blend).resolve()
    if out_blend.exists():
        raise ReferenceSheetError(f"refusing to overwrite {out_blend}")
    _reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "MILLIMETERS"
    collection = bpy.data.collections.new("Reference")
    scene.collection.children.link(collection)
    collection.hide_render = True
    collection["reference_manifest"] = str(manifest_path)

    for view in views:
        if view["projection"] == "visual":
            continue
        crop_path = Path(crop_paths[view["name"]])
        image = bpy.data.images.load(str(crop_path), check_existing=False)
        image.colorspace_settings.name = "sRGB"
        image.name = f"REF_IMG_{view['name']}"
        if pack:
            image.pack()
        geometry = plane_geometry(view, view["mm_per_px"])
        corners = [[coordinate / 1000.0 for coordinate in corner]
                   for corner in geometry["corners_mm"]]
        mesh = bpy.data.meshes.new(f"REF_MESH_{view['name']}")
        face_order = geometry["face_order"]
        mesh.from_pydata(corners, [], [tuple(face_order)])
        mesh.update()
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for loop_index, vertex_index in enumerate(face_order):
            uv_layer.data[loop_index].uv = geometry["uv"][vertex_index]
        obj = bpy.data.objects.new(f"REF_{view['name']}", mesh)
        collection.objects.link(obj)
        obj.location = [coordinate / 1000.0 for coordinate in geometry["location_mm"]]
        obj.show_in_front = True
        obj.display_type = "TEXTURED"
        obj.hide_render = True
        obj.lock_location = (True, True, True)
        obj.lock_rotation = (True, True, True)
        obj.lock_scale = (True, True, True)
        obj["reference_projection"] = view["projection"]
        obj["reference_mm_per_px"] = view["mm_per_px"]
        obj["reference_width_mm"] = geometry["width_mm"]
        obj["reference_height_mm"] = geometry["height_mm"]
        obj["reference_axes"] = " ".join(geometry["axes"])
        obj["reference_origin_px"] = list(view["origin_px"])
        obj["reference_notes"] = view.get("notes", "")
        obj.data.materials.append(_reference_material(view["name"], image))

    scene["reference_manifest"] = str(manifest_path)
    scene["reference_limitations"] = " ".join(LIMITATIONS)
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    return {
        "path": str(out_blend),
        "sha256": sha256_file(out_blend),
        "objects": sorted(obj.name for obj in collection.objects),
    }


def verify_scene(expected_views):
    """Read-only checks that the built reference objects are locked and hidden."""
    _require_blender()
    collection = bpy.data.collections.get("Reference")
    errors = []
    if collection is None:
        return ["Reference collection is missing"]
    if not collection.hide_render:
        errors.append("Reference collection is still renderable")
    for view in expected_views:
        if view["projection"] == "visual":
            continue
        name = f"REF_{view['name']}"
        obj = bpy.data.objects.get(name)
        if obj is None:
            errors.append(f"{name} is missing")
            continue
        if not obj.hide_render:
            errors.append(f"{name} is still renderable")
        if not (all(obj.lock_location) and all(obj.lock_rotation) and
                all(obj.lock_scale)):
            errors.append(f"{name} transforms are not fully locked")
        if len(obj.data.polygons) != 1:
            errors.append(f"{name} does not have one reference quad")
        scale = obj.get("reference_mm_per_px")
        if scale is None or abs(
                obj["reference_width_mm"] - view["rect"][2] * scale) > 1e-6:
            errors.append(f"{name} width does not match its crop scale")
    return errors


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def run(sheet, views_path, out_dir, prefix="ref", build=None, new_scene=False,
        pack=True, scale_tolerance=0.005, inspect_only=False):
    info = image_info(sheet)
    if inspect_only:
        return {"sheet": info, "limitations": LIMITATIONS}

    document = json.loads(Path(views_path).read_text())
    views = load_views(document)
    errors, warnings = validate_views(
        views, info["width"], info["height"], scale_tolerance)
    if errors:
        raise ReferenceSheetError("; ".join(errors))
    has_planes = any(view["projection"] != "visual" for view in views)
    if has_planes:
        scale, authority, _, _ = resolve_scale(views, scale_tolerance)
    else:
        scale, authority = None, None
        if build is not None:
            raise ReferenceSheetError(
                "--build needs at least one front, side or top view")

    if build is not None:
        if not new_scene:
            raise ReferenceSheetError("--build requires --new-scene")
        if Path(build).exists():
            raise ReferenceSheetError(f"refusing to overwrite {build}")

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / f"{prefix}_references.json"
    if manifest_path.exists():
        raise ReferenceSheetError(f"refusing to overwrite {manifest_path}")

    _require_blender()
    sheet_image = bpy.data.images.load(str(Path(sheet).resolve()), check_existing=False)
    try:
        crop_paths, view_records = {}, []
        for view in views:
            crop_path = out_dir / f"{prefix}_{view['name']}.png"
            if crop_path.exists():
                raise ReferenceSheetError(f"refusing to overwrite {crop_path}")
            digest = crop_image(sheet_image, view["rect"], crop_path)
            crop_paths[view["name"]] = crop_path
            view_records.append(view_manifest(view, crop_path, digest, scale))
    finally:
        bpy.data.images.remove(sheet_image)

    manifest = {
        "schema": SCHEMA,
        "sheet": info,
        "scale": {
            "mm_per_px": scale,
            "authority": authority,
            "tolerance": scale_tolerance,
        },
        "views": view_records,
        "warnings": warnings,
        "limitations": LIMITATIONS,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    summary = {
        "manifest": str(manifest_path),
        "scale_mm_per_px": scale,
        "authority": authority,
        "views": [record["name"] for record in view_records],
        "warnings": warnings,
    }
    if build is not None:
        built = build_reference_scene(
            views, crop_paths, manifest_path, build, pack=pack)
        errors = verify_scene(views)
        if errors:
            raise ReferenceSheetError("; ".join(errors))
        manifest["blend"] = built
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        summary["blend"] = built
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sheet", required=True, help="source reference sheet")
    parser.add_argument("--views", help="views JSON document")
    parser.add_argument("--out-dir", help="crop/manifest destination")
    parser.add_argument("--prefix", default="ref", help="output filename prefix")
    parser.add_argument("--build", help="new .blend destination")
    parser.add_argument("--new-scene", action="store_true",
                        help="allow clearing the current Blender scene; use factory-startup")
    parser.add_argument("--no-pack", action="store_true",
                        help="leave crop images external in the .blend")
    parser.add_argument("--scale-tolerance", type=float, default=0.005,
                        help="maximum calibrated-view scale spread (default 0.005)")
    parser.add_argument("--inspect", action="store_true",
                        help="print sheet dimensions and hash, then stop")
    args = parser.parse_args(argv)
    if not args.inspect:
        if not args.views or not args.out_dir:
            parser.error("--views and --out-dir are required unless --inspect is used")
        if args.build and not args.new_scene:
            parser.error("--build requires --new-scene")
    try:
        result = run(
            args.sheet, args.views, args.out_dir, prefix=args.prefix,
            build=args.build, new_scene=args.new_scene,
            pack=not args.no_pack, scale_tolerance=args.scale_tolerance,
            inspect_only=args.inspect)
    except (ReferenceSheetError, OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        raise SystemExit(1)
    print(json.dumps({"ok": True, **result}, indent=2))


if __name__ == "__main__":
    import sys
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    main(argv)
