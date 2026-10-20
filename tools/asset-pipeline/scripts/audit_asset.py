"""Read-only Phase 1a asset audit for Blender.

Run inside Blender:
  blender --background asset.blend --python audit_asset.py -- \
    --objects Body --out audit.json --resolution 1024

The audit does not change the scene, apply modifiers, export, repair or render.
"""

import argparse
import datetime
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import bpy

TOOL_NAME = "asset-pipeline-audit"
TOOL_VERSION = "0.1.0"
REPORT_SCHEMA_VERSION = "1.0.0"
PROFILE_SCHEMA_VERSION = "1.0.0"


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


def collect_findings(objects, health, uv_report, texture_inventory,
                      render_state, uv_layers):
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
        if result.get("uv_map") is None:
            findings.append({
                "severity": "warning",
                "code": "no_active_uv",
                "object": name,
                "message": "No active UV map was found for the evaluated mesh.",
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
    for image_name, image in texture_inventory.get("images", {}).items():
        if image.get("external_file_exists") is False:
            findings.append({
                "severity": "error",
                "code": "missing_external_image",
                "object": None,
                "message": "Image %s is not found at %s"
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


def build_report(objects, helpers, resolution, closed, profile_path):
    health = helpers["asset_qa"].run(objects, closed=closed)
    uv_report = helpers["uv_report"].run(objects, (resolution, resolution))
    texture_inventory = helpers["texture_inventory"].run(objects)
    render_state = helpers["render_state_audit"].run(objects)
    uv_layers = {
        name: uv_layers_record(bpy.data.objects[name], helpers, resolution)
        for name in objects
    }
    findings = collect_findings(objects, health, uv_report, texture_inventory,
                                render_state, uv_layers)
    errors = [item for item in findings if item["severity"] == "error"]
    warnings = [item for item in findings if item["severity"] == "warning"]
    infos = [item for item in findings if item["severity"] == "info"]

    profile = None
    if profile_path:
        profile_data = json.loads(Path(profile_path).read_text())
        profile = {
            "path": str(Path(profile_path).resolve()),
            "schema_version": profile_data.get("schema_version"),
            "profile_id": profile_data.get("profile_id"),
            "status": profile_data.get("status"),
        }

    scene = bpy.context.scene
    source_path = bpy.data.filepath or None
    source_sha = None
    if source_path and Path(source_path).is_file():
        source_sha = sha256_file(source_path)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    provenance = {
        "schema_version": PROFILE_SCHEMA_VERSION,
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
        "summary": {
            "objects": len(objects),
            "health_pass": bool(health.get("health_pass")),
            "findings_total": len(findings),
            "errors": len(errors),
            "warnings": len(warnings),
            "infos": len(infos),
            "findings": findings,
        },
        "limits": [
            "Read-only audit: no repair, texture policy, export, validator, render or game integration.",
            "UV overlap is a geometric check, not a raster pixel-conflict check.",
            "Texel-density values are measurements; Phase 1b defines policy.",
            "Modifiers and UVs are observed through the current depsgraph; nothing is applied.",
            "Node groups are not traversed by texture_inventory.",
            "No texture pixel content, bake quality or rendered appearance is validated.",
            "Known-good/failing fixture coverage is Phase 1a verification.",
        ],
    }
    for name in objects:
        ob = bpy.data.objects[name]
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
            "uv_density": uv_report["objects"].get(name),
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
    parser.add_argument("--resolution", type=int, default=1024,
                        help="UV analysis resolution (default 1024)")
    parser.add_argument("--open-panels", action="store_true",
                        help="Allow unexpected boundary edges for intentional open panels")
    parser.add_argument("--helper-dir", help="Override the project helper directory")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing report")
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
                          not args.open_panels, args.profile)
    out.write_text(json.dumps(report, indent=2))
    summary = {
        "objects": report["summary"]["objects"],
        "errors": report["summary"]["errors"],
        "warnings": report["summary"]["warnings"],
        "health_pass": report["summary"]["health_pass"],
    }
    print("ASSET_AUDIT", json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
