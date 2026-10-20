"""Read-only Phase 1a/1b asset audit for Blender.

Run inside Blender:
  blender --background asset.blend --python audit_asset.py -- \
    --objects Body --profile profile.json --camera Closest_View \
    --out audit.json --resolution 1024

The audit does not change the scene, apply modifiers, export, repair or render.
"""

import argparse
import datetime
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

TOOL_NAME = "asset-pipeline-audit"
TOOL_VERSION = "0.2.0"
REPORT_SCHEMA_VERSION = "1.1.0"
PROVENANCE_SCHEMA_VERSION = "1.0.0"

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import density_policy  # noqa: E402


def repo_root():
    return Path(__file__).resolve().parents[3]


def load_module(name, path):
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError("Helper not found: %s" % path)
    spec = importlib.util.spec_from_file_location(name, str(path))
    if spec is None or spec.loader is None:
        raise ImportError("Could not load helper: %s" % path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_helpers(helper_dir=None):
    root = repo_root()
    skill_dir = Path(helper_dir) if helper_dir else (
        root / ".opencode" / "skills" / "gummy-3d-authoring" / "scripts")
    extractor_dir = root / "tools" / "uv-layout-extractor" / "scripts"
    if str(extractor_dir) not in sys.path:
        sys.path.insert(0, str(extractor_dir))
    return {
        "asset_qa": load_module("asset_pipeline_asset_qa", skill_dir / "asset_qa.py"),
        "uv_report": load_module("asset_pipeline_uv_report", skill_dir / "uv_report.py"),
        "texture_inventory": load_module(
            "asset_pipeline_texture_inventory", skill_dir / "texture_inventory.py"),
        "render_state_audit": load_module(
            "asset_pipeline_render_state_audit", skill_dir / "render_state_audit.py"),
        "uv_core": load_module(
            "asset_pipeline_uv_core", extractor_dir / "uv_core.py"),
        "uv_atlas_checks": load_module(
            "asset_pipeline_uv_atlas_checks", extractor_dir / "uv_atlas_checks.py"),
    }


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def transform_record(ob):
    return {
        "location": [float(v) for v in ob.location],
        "rotation_mode": ob.rotation_mode,
        "rotation_euler": [float(v) for v in ob.rotation_euler],
        "scale": [float(v) for v in ob.scale],
        "dimensions": [float(v) for v in ob.dimensions],
        "matrix_world_determinant": float(ob.matrix_world.determinant()),
        "negative_scale": ob.matrix_world.determinant() < 0,
    }


def dependency_record(ob):
    same_data = [
        other.name for other in bpy.data.objects
        if other.type == "MESH" and other.data is ob.data
    ]
    return {
        "data_name": ob.data.name if ob.data else None,
        "data_users": ob.data.users if ob.data else None,
        "objects_sharing_data": sorted(same_data),
        "collections": sorted(c.name for c in ob.users_collection),
        "parent": ob.parent.name if ob.parent else None,
        "constraints": [
            {"name": c.name, "type": c.type}
            for c in ob.constraints
        ],
        "modifiers": [
            {
                "name": m.name,
                "type": m.type,
                "show_viewport": bool(m.show_viewport),
                "show_render": bool(m.show_render),
            }
            for m in ob.modifiers
        ],
        "hide_viewport": bool(ob.hide_viewport),
        "hide_render": bool(ob.hide_render),
        "visible_get": bool(ob.visible_get()),
        "library": ob.library.filepath if ob.library else None,
    }


def uv_layers_record(ob, helpers, resolution):
    dg = bpy.context.evaluated_depsgraph_get()
    evaluated = ob.evaluated_get(dg)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        layers = []
        core = helpers["uv_core"]
        checks = helpers["uv_atlas_checks"]
        for layer in mesh.uv_layers:
            record = {
                "name": layer.name,
                "active_render": bool(layer.active_render),
                "bounds": None,
                "island_count": 0,
                "islands": [],
                "geometric_overlap": [],
                "overlap_truncated": False,
                "out_of_bounds": [],
                "degenerate_triangles": 0,
                "analysis_note": "UV overlap is geometric, not a raster pixel-conflict check.",
            }
            try:
                bounds = core.uv_bounds(mesh, layer)
                record["bounds"] = [float(v) for v in bounds]
                islands = core.ordered_islands(mesh, layer, resolution)
                triangles = core.uv_triangles(mesh, layer, resolution)
                record["island_count"] = len(islands)
                record["islands"] = [
                    {
                        "id": island["id"],
                        "face_count": len(island["faces"]),
                        "u_min": float(island["u_min"]),
                        "v_min": float(island["v_min"]),
                        "uv_area": float(island["area_uv"]),
                    }
                    for island in islands
                ]
                records = [
                    {
                        "id": island["id"],
                        "triangles": [
                            tri for face in island["faces"]
                            for tri in triangles.get(face, [])
                        ],
                    }
                    for island in islands
                ]
                result = checks.validate(records, resolution, max_pairs=32)
                record["geometric_overlap"] = [
                    list(pair) for pair in result.get("overlaps", [])
                ]
                record["overlap_truncated"] = bool(result.get("truncated", False))
                record["out_of_bounds"] = list(result.get("out_of_bounds", []))
                record["degenerate_triangles"] = int(
                    result.get("degenerate_triangles", 0))
            except Exception as exc:
                record["error"] = "%s: %s" % (type(exc).__name__, exc)
            layers.append(record)
        return {
            "layers": layers,
            "active_render": [layer.name for layer in mesh.uv_layers
                              if layer.active_render],
        }
    finally:
        evaluated.to_mesh_clear()


def object_uv_requirement(name, texture_inventory):
    material_names = []
    for slot in texture_inventory.get("slots", {}).get(name, []):
        material_name = slot.get("material")
        if material_name and material_name not in material_names:
            material_names.append(material_name)
    for material_name in material_names:
        material = texture_inventory.get("materials", {}).get(material_name, {})
        if material.get("images"):
            return True, "image_textures"
    return False, "no_image_textures"


def active_render_layer(mesh):
    active = next((layer for layer in mesh.uv_layers if layer.active_render), None)
    return active or mesh.uv_layers.active


def uv_anisotropy(uv0, uv1, uv2, p1, p2):
    """Largest/smallest singular value of the 3D-to-UV affine map."""
    u1 = uv1 - uv0
    u2 = uv2 - uv0
    determinant = p1.x * p2.y - p2.x * p1.y
    if abs(determinant) <= 1e-16:
        return None
    a = (u1.x * p2.y - u2.x * p1.y) / determinant
    b = (-u1.x * p2.x + u2.x * p1.x) / determinant
    c = (u1.y * p2.y - u2.y * p1.y) / determinant
    d = (-u1.y * p2.x + u2.y * p1.x) / determinant
    trace = a * a + b * b + c * c + d * d
    jacobian_det = a * d - b * c
    discriminant = max(0.0, trace * trace - 4.0 * jacobian_det * jacobian_det)
    largest = math.sqrt(max(0.0, (trace + math.sqrt(discriminant)) * 0.5))
    smallest = math.sqrt(max(0.0, (trace - math.sqrt(discriminant)) * 0.5))
    if smallest <= 1e-16:
        return None
    return largest / smallest


def density_unverified(name, policy, camera_name, reason, coverage=None):
    return {
        "status": "unverified",
        "camera": camera_name,
        "viewport_px": list(policy["viewport_px"]),
        "texture_resolutions_px": [list(item) for item in
                                   policy["texture_resolutions_px"]],
        "target_texels_per_screen_pixel":
            list(policy["target_texels_per_screen_pixel"]),
        "coverage": coverage,
        "resolutions": [],
        "findings": [],
        "reason": reason,
    }


def project_object_density(name, policy, camera_name, scene):
    ob = bpy.data.objects[name]
    camera = bpy.data.objects.get(camera_name) if camera_name else None
    if camera is None or camera.type != "CAMERA":
        return density_unverified(name, policy, camera_name,
                                  "Selected camera is missing or is not a camera.")
    viewport = policy["viewport_px"]
    scene_aspect = scene.render.resolution_x / scene.render.resolution_y
    viewport_aspect = viewport[0] / viewport[1]
    if abs(scene_aspect - viewport_aspect) > 1e-4:
        return density_unverified(
            name, policy, camera_name,
            "Viewport aspect does not match the scene render aspect.")
    dg = bpy.context.evaluated_depsgraph_get()
    evaluated = ob.evaluated_get(dg)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        layer = active_render_layer(mesh)
        if layer is None:
            return density_unverified(
                name, policy, camera_name,
                "No active render UV; density cannot be measured.")
        unit_scale = scene.unit_settings.scale_length
        coverage = {
            "source_triangles": len(mesh.loop_triangles),
            "sampled_triangles": 0,
            "backface_triangles": 0,
            "behind_camera_triangles": 0,
            "outside_view_triangles": 0,
            "zero_world_area_triangles": 0,
            "zero_uv_area_triangles": 0,
            "degenerate_screen_triangles": 0,
            "small_triangles": 0,
            "sampled_world_area_m2": 0.0,
            "total_world_area_m2": 0.0,
            "small_world_area_m2": 0.0,
            "small_screen_area_px": 0.0,
            "sampled_screen_area_px": 0.0,
        }
        samples = []
        for tri in mesh.loop_triangles:
            verts = [evaluated.matrix_world @ mesh.vertices[index].co
                     for index in tri.vertices]
            ab = verts[1] - verts[0]
            ac = verts[2] - verts[0]
            cross = ab.cross(ac)
            world_area = cross.length * 0.5 * unit_scale ** 2
            coverage["total_world_area_m2"] += world_area
            if world_area <= 1e-16:
                coverage["zero_world_area_triangles"] += 1
                continue
            normal = cross.normalized()
            center = (verts[0] + verts[1] + verts[2]) / 3.0
            if normal.dot(camera.matrix_world.translation - center) <= 0.0:
                coverage["backface_triangles"] += 1
                continue
            uv0 = layer.uv[tri.loops[0]].vector.copy()
            uv1 = layer.uv[tri.loops[1]].vector.copy()
            uv2 = layer.uv[tri.loops[2]].vector.copy()
            uv_area = abs((uv1.x - uv0.x) * (uv2.y - uv0.y)
                          - (uv1.y - uv0.y) * (uv2.x - uv0.x)) * 0.5
            if uv_area <= 1e-16:
                coverage["zero_uv_area_triangles"] += 1
                continue
            projected = []
            projection_error = None
            for co in verts:
                point = world_to_camera_view(scene, camera, co)
                if point.z <= 0.0:
                    projection_error = "behind"
                    break
                if not (0.0 <= point.x <= 1.0 and 0.0 <= point.y <= 1.0):
                    projection_error = "outside"
                    break
                projected.append((point.x * viewport[0], point.y * viewport[1]))
            if projection_error == "behind":
                coverage["behind_camera_triangles"] += 1
                continue
            if projection_error == "outside":
                coverage["outside_view_triangles"] += 1
                continue
            p0, p1, p2 = projected
            screen_area = abs(
                (p1[0] - p0[0]) * (p2[1] - p0[1])
                - (p1[1] - p0[1]) * (p2[0] - p0[0])) * 0.5
            if screen_area <= 1e-12:
                coverage["degenerate_screen_triangles"] += 1
                continue
            e1 = ab.normalized()
            e2 = normal.cross(e1).normalized()
            plane_p1 = Vector((ab.dot(e1), ab.dot(e2)))
            plane_p2 = Vector((ac.dot(e1), ac.dot(e2)))
            anisotropy = uv_anisotropy(uv0, uv1, uv2, plane_p1, plane_p2)
            material_name = "<none>"
            if tri.material_index < len(ob.material_slots):
                slot = ob.material_slots[tri.material_index]
                material_name = slot.material.name if slot.material else "<empty_slot>"
            samples.append({
                "world_area_m2": world_area,
                "uv_area": uv_area,
                "screen_area_px": screen_area,
                "anisotropy_ratio": anisotropy,
                "material": material_name,
            })
            coverage["sampled_triangles"] += 1
            coverage["sampled_world_area_m2"] += world_area
            coverage["sampled_screen_area_px"] += screen_area
            if screen_area < policy["small_triangle_screen_px"]:
                coverage["small_triangles"] += 1
                coverage["small_world_area_m2"] += world_area
                coverage["small_screen_area_px"] += screen_area
        source_triangles = coverage["source_triangles"]
        coverage["visible_triangle_fraction"] = (
            coverage["sampled_triangles"] / source_triangles
            if source_triangles else 0.0)
        coverage["sampled_world_area_fraction"] = (
            coverage["sampled_world_area_m2"] / coverage["total_world_area_m2"]
            if coverage["total_world_area_m2"] > 1e-16 else 0.0)
        coverage["small_triangle_fraction"] = (
            coverage["small_triangles"] / coverage["sampled_triangles"]
            if coverage["sampled_triangles"] else 0.0)
        coverage["small_triangle_screen_fraction"] = (
            coverage["small_screen_area_px"] / coverage["sampled_screen_area_px"]
            if coverage["sampled_screen_area_px"] > 1e-16 else 0.0)
        coverage["small_triangle_world_area_fraction"] = (
            coverage["small_world_area_m2"] / coverage["sampled_world_area_m2"]
            if coverage["sampled_world_area_m2"] > 1e-16 else 0.0)
        if (not samples
                or coverage["sampled_world_area_fraction"]
                < policy["min_visible_fraction"]):
            return density_unverified(
                name, policy, camera_name,
                "Insufficient visible surface coverage for density policy.",
                coverage)

        resolutions = []
        for resolution in policy["texture_resolutions_px"]:
            width, height = resolution
            overall_samples = []
            zones = {}
            for sample in samples:
                required = math.sqrt(
                    sample["screen_area_px"] / sample["world_area_m2"])
                measured = math.sqrt(
                    sample["uv_area"] * width * height
                    / sample["world_area_m2"])
                ratio = measured / required if required > 1e-16 else None
                record = {
                    "ratio": ratio,
                    "measured_px_per_m": measured,
                    "anisotropy_ratio": sample["anisotropy_ratio"],
                }
                overall_samples.append(record)
                zone = (sample["material"]
                        if policy["zone_mode"] == "material" else "object")
                zones.setdefault(zone, []).append(record)
            overall = {
                "ratio": density_policy.summarize(
                    [item["ratio"] for item in overall_samples]),
                "measured_px_per_m": density_policy.summarize(
                    [item["measured_px_per_m"] for item in overall_samples]),
                "anisotropy_ratio": density_policy.summarize(
                    [item["anisotropy_ratio"] for item in overall_samples]),
            }
            zone_results = []
            for zone in sorted(zones):
                evaluated_zone = density_policy.evaluate_group(
                    zones[zone], policy, check_consistency=True)
                evaluated_zone["zone"] = zone
                zone_results.append(evaluated_zone)
            resolutions.append({
                "texture_resolution_px": [width, height],
                "overall": overall,
                "zones": zone_results,
                "status": density_policy.aggregate_status(
                    [item["status"] for item in zone_results]),
            })

        findings = []
        for resolution in resolutions:
            width, height = resolution["texture_resolution_px"]
            for zone in resolution["zones"]:
                for code in zone["findings"]:
                    findings.append({
                        "severity": "warning",
                        "code": code,
                        "object": name,
                        "message": (
                            "%s at %sx%s, zone %s: %s"
                            % (code, width, height, zone["zone"],
                               _density_message(code, zone, policy))),
                    })
                if zone["status"] == "unverified":
                    findings.append({
                        "severity": "info",
                        "code": "texel_density_zone_unverified",
                        "object": name,
                        "message": (
                            "Density zone %s at %sx%s is unverified: %s"
                            % (zone["zone"], width, height, zone.get("reason", ""))),
                    })
        status = density_policy.aggregate_status(
            [resolution["status"] for resolution in resolutions])
        if status in {"unverified", "partial"}:
            findings.append({
                "severity": "warning" if status == "unverified" else "info",
                "code": "texel_density_unverified",
                "object": name,
                "message": "Texel density is %s; review coverage and zone samples." %
                           status,
            })
        return {
            "status": status,
            "camera": camera_name,
            "viewport_px": list(viewport),
            "texture_resolutions_px": [list(item) for item in
                                       policy["texture_resolutions_px"]],
            "target_texels_per_screen_pixel":
                list(policy["target_texels_per_screen_pixel"]),
            "coverage": coverage,
            "resolutions": resolutions,
            "findings": findings,
            "reason": None,
        }
    finally:
        evaluated.to_mesh_clear()


def _density_message(code, zone, policy):
    if code == "texel_density_under":
        return ("ratio p05 %.3f is below advisory range %.3f-%.3f"
                % (zone["ratio"]["p05"],
                   policy["target_texels_per_screen_pixel"][0],
                   policy["target_texels_per_screen_pixel"][1]))
    if code == "texel_density_over":
        return ("ratio p95 %.3f is above advisory range %.3f-%.3f"
                % (zone["ratio"]["p95"],
                   policy["target_texels_per_screen_pixel"][0],
                   policy["target_texels_per_screen_pixel"][1]))
    if code == "texel_density_inconsistent":
        return ("measured p95/p05 spread %.3f exceeds advisory %.3f"
                % (zone["spread_ratio"], policy["spread_ratio_max"]))
    if code == "texel_density_anisotropic":
        return ("UV anisotropy p95 %.3f exceeds advisory %.3f"
                % (zone["anisotropy_ratio"]["p95"],
                   policy["anisotropy_ratio_max"]))
    return code


def build_density_report(objects, profile_data, camera_name, scene):
    if not profile_data or not profile_data.get("texel_density"):
        return {
            "status": "not_evaluated",
            "reason": "No texel_density policy in the delivery profile.",
            "camera": None,
            "policy": None,
            "objects": {},
            "findings": [],
        }
    policy = profile_data["texel_density"]
    density_policy.validate_policy(policy)
    selected_camera = camera_name or policy.get("camera")
    if not selected_camera:
        message = ("No explicit closest camera selected; density is "
                   "unverified. Pass --camera or set texel_density.camera.")
        return {
            "status": "unverified",
            "reason": message,
            "camera": None,
            "policy": policy,
            "objects": {},
            "findings": [{
                "severity": "warning",
                "code": "texel_density_unverified",
                "object": None,
                "message": message,
            }],
        }
    camera = bpy.data.objects.get(selected_camera)
    if camera is None or camera.type != "CAMERA":
        message = "Camera %s is missing or is not a camera." % selected_camera
        return {
            "status": "unverified",
            "reason": message,
            "camera": selected_camera,
            "policy": policy,
            "objects": {},
            "findings": [{
                "severity": "warning",
                "code": "texel_density_unverified",
                "object": None,
                "message": message,
            }],
        }
    density_objects = {}
    findings = []
    for name in objects:
        result = project_object_density(name, policy, selected_camera, scene)
        density_objects[name] = result
        findings.extend(result.pop("findings", []))
    status = density_policy.aggregate_status(
        [item["status"] for item in density_objects.values()])
    return {
        "status": status,
        "reason": None,
        "camera": selected_camera,
        "policy": policy,
        "objects": density_objects,
        "findings": findings,
        "notes": [
            "Front-facing triangles inside the current view only; occlusion is not tested.",
            "Thresholds are advisory until calibrated against the crate and curved test.",
            "Texture resolutions are evaluated independently, not treated as mandatory.",
        ],
    }


def collect_findings(objects, health, uv_report, texture_inventory,
                      render_state, uv_layers, uv_requirements):
    findings = []
    for name, result in health["objects"].items():
        for error in result.get("errors", []):
            findings.append({
                "severity": "error",
                "code": "geometry_" + error,
                "object": name,
                "message": "Geometry health diagnostic: %s" % error,
            })
    for name, result in uv_report["objects"].items():
        required, _requirement = uv_requirements.get(
            name, (False, "no_image_textures"))
        active_render = texture_inventory.get("active_render_uv", {}).get(name, [])
        if required and (result.get("uv_map") is None or not active_render):
            findings.append({
                "severity": "warning",
                "code": "no_active_uv",
                "object": name,
                "message": ("No active render UV was found for a mesh whose "
                            "materials use image textures."),
            })
        outside = result.get("uv_corners_outside_0_1", 0)
        if outside:
            findings.append({
                "severity": "warning",
                "code": "uv_outside_single_tile",
                "object": name,
                "message": "%s UV corners are outside the single 0-1 tile." % outside,
            })
        if result.get("zero_uv_area_triangles", 0):
            findings.append({
                "severity": "warning",
                "code": "zero_uv_area_triangles",
                "object": name,
                "message": "%s triangles have zero UV area."
                           % result["zero_uv_area_triangles"],
            })
    for name, record in uv_layers.items():
        for layer in record.get("layers", []):
            if layer.get("error"):
                findings.append({
                    "severity": "warning",
                    "code": "uv_analysis_error",
                    "object": name,
                    "message": "UV analysis failed for layer %s: %s"
                               % (layer["name"], layer["error"]),
                })
            if layer.get("geometric_overlap"):
                findings.append({
                    "severity": "warning",
                    "code": "uv_geometric_overlap",
                    "object": name,
                    "message": "Layer %s has geometric UV island overlap pairs: %s%s"
                               % (layer["name"], layer["geometric_overlap"],
                                  " (truncated)" if layer.get("overlap_truncated") else ""),
                })
            if layer.get("out_of_bounds"):
                findings.append({
                    "severity": "warning",
                    "code": "uv_out_of_bounds",
                    "object": name,
                    "message": "Layer %s has islands outside the 0-1 tile: %s"
                               % (layer["name"], layer["out_of_bounds"]),
                })
            if layer.get("degenerate_triangles"):
                findings.append({
                    "severity": "warning",
                    "code": "uv_degenerate_triangles",
                    "object": name,
                    "message": "Layer %s has %s degenerate UV triangles."
                               % (layer["name"], layer["degenerate_triangles"]),
                })
    unreferenced_images = set(
        texture_inventory.get("images_not_referenced_by_inspected_materials", []))
    unconnected_images = set(
        texture_inventory.get("images_not_connected_to_inspected_outputs", []))
    for image_name, image in texture_inventory.get("images", {}).items():
        source = image.get("source")
        if source in {"TILED", "SEQUENCE", "MOVIE"}:
            findings.append({
                "severity": "warning",
                "code": "unsupported_image_source",
                "object": None,
                "message": ("Image %s uses source %s; verify static glTF "
                            "export or bake a static image." % (image_name, source)),
            })
        if (image.get("size") == [0, 0]
                and source in {"FILE", "TILED", "SEQUENCE", "MOVIE"}
                and image.get("external_file_exists") is not False):
            findings.append({
                "severity": "warning",
                "code": "image_has_no_pixels",
                "object": None,
                "message": "Image %s has no pixel dimensions." % image_name,
            })
        if image.get("external_file_exists") is False and not image.get("packed"):
            if image_name in unreferenced_images:
                findings.append({
                    "severity": "warning",
                    "code": "missing_unused_external_image",
                    "object": None,
                    "message": ("Image %s is missing at %s and is not referenced "
                                "by inspected materials." %
                                (image_name, image.get("resolved_path"))),
                })
            elif image_name in unconnected_images:
                findings.append({
                    "severity": "warning",
                    "code": "missing_unconnected_external_image",
                    "object": None,
                    "message": ("Image %s is missing at %s and is not connected "
                                "to an inspected material output." %
                                (image_name, image.get("resolved_path"))),
                })
            else:
                findings.append({
                    "severity": "error",
                    "code": "missing_external_image",
                    "object": None,
                    "message": "Required image %s is not found at %s"
                               % (image_name, image.get("resolved_path")),
                })
    for material_name, material in texture_inventory.get("materials", {}).items():
        if material.get("groups_unresolved"):
            findings.append({
                "severity": "warning",
                "code": "unresolved_material_groups",
                "object": None,
                "message": "Material %s has unresolved node groups: %s"
                           % (material_name, material["groups_unresolved"]),
            })
    for name in render_state.get("mesh_without_material_slots", []):
        findings.append({
            "severity": "warning",
            "code": "mesh_without_material_slots",
            "object": name,
            "message": "Mesh has no material slots.",
        })
    for slot in render_state.get("slots_without_material", []):
        findings.append({
            "severity": "warning",
            "code": "empty_material_slot",
            "object": slot.get("object"),
            "message": "Material slot %s has no material." % slot.get("slot"),
        })
    for slot in render_state.get("object_linked_material_slots", []):
        findings.append({
            "severity": "warning",
            "code": "object_linked_material_slot",
            "object": slot.get("object"),
            "message": "Slot %s is object-linked; verify export behavior." % slot.get("slot"),
        })
    for name, result in health["objects"].items():
        if result.get("negative_world_determinant"):
            findings.append({
                "severity": "warning",
                "code": "negative_scale",
                "object": name,
                "message": "World transform has a negative determinant.",
            })
        if any(bpy.data.objects[name].modifiers):
            findings.append({
                "severity": "info",
                "code": "modifiers_present",
                "object": name,
                "message": "Modifiers are present; audit used evaluated geometry.",
            })
    return findings


def build_report(objects, helpers, resolution, closed, profile_path,
                 camera_name=None):
    health = helpers["asset_qa"].run(objects, closed=closed)
    uv_report = helpers["uv_report"].run(objects, (resolution, resolution))
    texture_inventory = helpers["texture_inventory"].run(objects)
    render_state = helpers["render_state_audit"].run(objects)
    uv_layers = {
        name: uv_layers_record(bpy.data.objects[name], helpers, resolution)
        for name in objects
    }
    uv_requirements = {
        name: object_uv_requirement(name, texture_inventory)
        for name in objects
    }

    profile = None
    profile_data = None
    if profile_path:
        profile_data = json.loads(Path(profile_path).read_text())
        profile = {
            "path": str(Path(profile_path).resolve()),
            "schema_version": profile_data.get("schema_version"),
            "profile_id": profile_data.get("profile_id"),
            "status": profile_data.get("status"),
        }

    scene = bpy.context.scene
    density_report = build_density_report(
        objects, profile_data, camera_name, scene)
    findings = collect_findings(objects, health, uv_report, texture_inventory,
                                render_state, uv_layers, uv_requirements)
    findings.extend(density_report.get("findings", []))
    errors = [item for item in findings if item["severity"] == "error"]
    warnings = [item for item in findings if item["severity"] == "warning"]
    infos = [item for item in findings if item["severity"] == "info"]

    source_path = bpy.data.filepath or None
    source_sha = None
    if source_path and Path(source_path).is_file():
        source_sha = sha256_file(source_path)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    provenance = {
        "schema_version": PROVENANCE_SCHEMA_VERSION,
        "asset_id": None,
        "source": {
            "path": source_path,
            "sha256": source_sha,
            "is_dirty": bool(bpy.data.is_dirty),
            "units": scene.unit_settings.system,
            "axes": "Blender +Z up",
            "author": None,
            "licence": None,
            "reference_rights": None,
        },
        "tool": {
            "name": TOOL_NAME,
            "version": TOOL_VERSION,
            "blender_version": bpy.app.version_string,
            "helper_versions": {
                "asset_qa": "project helper",
                "uv_report": "project helper",
                "texture_inventory": "project helper",
                "render_state_audit": "project helper",
                "uv_core": "uv-layout-extractor",
                "uv_atlas_checks": "uv-layout-extractor",
            },
        },
        "created_at": now,
        "status": "audit_only",
        "generation": None,
        "processing": {
            "blender_version": bpy.app.version_string,
            "operations": [],
            "bake_settings": None,
        },
        "export": {
            "path": None,
            "sha256": None,
            "size_bytes": None,
            "format": "glb",
            "extensions": [],
            "validator": {
                "name": "gltf-validator",
                "version": None,
                "errors": 0,
                "warnings": 0,
                "hints": 0,
                "report": None,
            },
        },
        "verification": {
            "status": "not_run",
            "evidence": [],
            "warnings": [],
            "limitations": [
                "Audit only; no export, validator or rendered-appearance verification.",
            ],
        },
    }

    report = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "tool": {
            "name": TOOL_NAME,
            "version": TOOL_VERSION,
            "blender_version": bpy.app.version_string,
        },
        "generated_at": now,
        "profile": profile,
        "provenance": provenance,
        "scene": {
            "filepath": source_path,
            "is_dirty": bool(bpy.data.is_dirty),
            "unit_system": scene.unit_settings.system,
            "scale_length": float(scene.unit_settings.scale_length),
            "length_unit": scene.unit_settings.length_unit,
            "render_engine": scene.render.engine,
            "frame": int(scene.frame_current),
            "background": bool(bpy.app.background),
            "objects_total": len(bpy.data.objects),
            "meshes_total": len(bpy.data.meshes),
        },
        "objects": {},
        "inventory": {
            "slots": texture_inventory.get("slots", {}),
            "materials": texture_inventory.get("materials", {}),
            "images": texture_inventory.get("images", {}),
            "active_render_uv": texture_inventory.get("active_render_uv", {}),
            "images_not_connected_to_inspected_outputs":
                texture_inventory.get("images_not_connected_to_inspected_outputs", []),
            "images_not_referenced_by_inspected_materials":
                texture_inventory.get("images_not_referenced_by_inspected_materials", []),
        },
        "render_state": render_state,
        "uv_measurements": uv_report,
        "texel_density_policy": density_report,
        "summary": {
            "objects": len(objects),
            "health_pass": bool(health.get("health_pass")),
            "findings_total": len(findings),
            "errors": len(errors),
            "warnings": len(warnings),
            "infos": len(infos),
            "findings": findings,
            "texel_density_status": density_report.get("status"),
        },
        "limits": [
            "Read-only audit: no repair, export, validator, render or game integration.",
            "UV overlap is a geometric check, not a raster pixel-conflict check.",
            "Texel-density thresholds are advisory until calibrated; they are not a delivery gate.",
            "Density uses front-facing triangles inside the current view; occlusion is not tested.",
            "Density consistency is evaluated per declared material zone, not across a mixed asset.",
            "Modifiers and UVs are observed through the current depsgraph; nothing is applied.",
            "Node groups are not traversed by texture_inventory.",
            "No texture pixel content, bake quality or rendered appearance is validated.",
            "Known-good/failing fixture coverage is Phase 1b verification.",
        ],
    }
    for name in objects:
        ob = bpy.data.objects[name]
        uv_required, uv_requirement = uv_requirements.get(
            name, (False, "no_image_textures"))
        report["objects"][name] = {
            "identity": {
                "name": ob.name,
                "type": ob.type,
                "data": ob.data.name if ob.data else None,
                "data_users": ob.data.users if ob.data else None,
                "library": ob.library.filepath if ob.library else None,
            },
            "transform": transform_record(ob),
            "dependencies": dependency_record(ob),
            "geometry": health["objects"].get(name),
            "uv": uv_layers.get(name),
            "uv_required": uv_required,
            "uv_requirement": uv_requirement,
            "uv_density": uv_report["objects"].get(name),
            "texel_density": density_report.get("objects", {}).get(name),
            "material_slots": texture_inventory.get("slots", {}).get(name, []),
            "render_state": {
                "hide_viewport": bool(ob.hide_viewport),
                "hide_render": bool(ob.hide_render),
                "visible_get": bool(ob.visible_get()),
            },
        }
    return report


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--objects", nargs="+", help="Explicit mesh object names")
    parser.add_argument("--all-meshes", action="store_true",
                        help="Audit every mesh object (explicit targets are preferred)")
    parser.add_argument("--out", required=True, help="JSON report path")
    parser.add_argument("--profile", help="Optional delivery-profile JSON path")
    parser.add_argument("--camera",
                        help="Explicit closest camera object for density policy")
    parser.add_argument("--resolution", type=int, default=1024,
                        help="UV analysis resolution (default 1024)")
    parser.add_argument("--open-panels", action="store_true",
                        help="Allow unexpected boundary edges for intentional open panels")
    parser.add_argument("--helper-dir", help="Override the project helper directory")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing report")
    parser.add_argument("--fail-on", choices=("none", "error", "warning"),
                        default="none",
                        help="Exit nonzero on errors or warnings (default none)")
    return parser.parse_args(argv)


def main():
    args = parse_args()
    if args.objects:
        objects = list(args.objects)
    elif args.all_meshes:
        objects = sorted(ob.name for ob in bpy.data.objects if ob.type == "MESH")
    else:
        raise ValueError("Pass --objects or --all-meshes")
    if not objects:
        raise ValueError("No mesh targets selected")
    for name in objects:
        ob = bpy.context.scene.objects.get(name)
        if ob is None or ob.type != "MESH":
            raise ValueError("Object not found or not a mesh: %s" % name)
    if bpy.context.mode != "OBJECT":
        raise ValueError("Run in Object mode")
    out = Path(args.out)
    if out.exists() and not args.force:
        raise ValueError("Output exists; pass --force to overwrite: %s" % out)
    out.parent.mkdir(parents=True, exist_ok=True)
    helpers = load_helpers(args.helper_dir)
    report = build_report(objects, helpers, args.resolution,
                          not args.open_panels, args.profile,
                          camera_name=args.camera)
    out.write_text(json.dumps(report, indent=2))
    summary = {
        "objects": report["summary"]["objects"],
        "errors": report["summary"]["errors"],
        "warnings": report["summary"]["warnings"],
        "health_pass": report["summary"]["health_pass"],
        "texel_density_status": report["summary"]["texel_density_status"],
    }
    print("ASSET_AUDIT", json.dumps(summary), flush=True)
    if density_policy.exit_code(report["summary"], args.fail_on):
        raise RuntimeError("Audit failed with --fail-on %s" % args.fail_on)


if __name__ == "__main__":
    main()
