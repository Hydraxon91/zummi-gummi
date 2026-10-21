"""Cheap, exception-safe review captures for Blender asset stages.

Independent project implementation. It snapshots render state, camera, frame,
shading, world, selection and hidden-object state, then restores all of them in
`finally` even when a capture fails.

Run inside Blender:
  blender --background asset.blend --python capture_review.py -- \
    --out-dir .dev-shots/review --preset solid --views front,side,top,three_quarter

Presets:
  solid    Workbench studio/cavity; silhouette and construction checks.
  material Eevee/Cycles at low samples; colour and material checks.
  final    Scene engine; acceptance renders (use deliberately).
"""

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from asset_fingerprint import fingerprint_objects
from asset_identity import get_asset_id

VIEW_DIRECTIONS = {
    "front": (0.0, -1.0, 0.0),
    "back": (0.0, 1.0, 0.0),
    "right": (1.0, 0.0, 0.0),
    "side": (1.0, 0.0, 0.0),
    "left": (-1.0, 0.0, 0.0),
    "top": (0.0, 0.0, 1.0),
    "bottom": (0.0, 0.0, -1.0),
    "three_quarter": (1.0, -1.0, 0.65),
    "rear_three_quarter": (-1.0, 1.0, 0.65),
}

SHADING_ATTRIBUTES = (
    "light", "color_type", "single_color", "show_cavity", "cavity_type",
    "show_shadows", "show_object_outline", "background_type", "background_color",
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--preset", choices=("solid", "material", "final"),
                        default="solid")
    parser.add_argument("--views", default="front,side,top,three_quarter")
    parser.add_argument("--targets", default="",
                        help="Comma-separated object names")
    parser.add_argument("--prefix", default="",
                        help="Only include meshes whose names start with this")
    parser.add_argument("--name", default="")
    parser.add_argument("--isolate", action="store_true",
                        help="Hide non-target meshes for an asset-only review")
    parser.add_argument("--keep", default="",
                        help="Comma-separated non-target objects to keep visible")
    parser.add_argument("--width", type=int, default=900)
    parser.add_argument("--height", type=int, default=800)
    parser.add_argument("--samples", type=int, default=0)
    parser.add_argument("--frame", type=int, default=-1)
    parser.add_argument("--pose-object", default="",
                        help="Controller whose evaluated world matrix is recorded")
    parser.add_argument("--focus-targets", default="",
                        help="Comma-separated objects for one bounds-based close-up")
    parser.add_argument("--focus-view", default="side",
                        help="View direction for the focus capture")
    parser.add_argument("--perspective", action="store_true")
    return parser.parse_args(
        sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_name(value):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_") or "review"


def target_objects(args):
    if args.targets:
        names = [name.strip() for name in args.targets.split(",") if name.strip()]
        missing = [name for name in names if bpy.data.objects.get(name) is None]
        if missing:
            raise RuntimeError(f"Missing targets: {missing}")
        objects = [bpy.data.objects[name] for name in names]
    else:
        objects = [
            obj for obj in bpy.context.scene.objects
            if obj.type == "MESH"
            and obj.visible_get()
            and not obj.hide_render
            and not any("Review" in collection.name or "Cutter" in collection.name
                        for collection in obj.users_collection)
        ]
    if args.prefix:
        objects = [obj for obj in objects if obj.name.startswith(args.prefix)]
    if not objects:
        raise RuntimeError("No target meshes matched")
    return objects


def world_bounds(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world @ Vector(corner)
                      for corner in evaluated.bound_box)
    minimum = Vector((min(point[i] for point in points) for i in range(3)))
    maximum = Vector((max(point[i] for point in points) for i in range(3)))
    return minimum, maximum


def configure_workbench(scene):
    try:
        scene.render.engine = "BLENDER_WORKBENCH"
    except TypeError:
        pass
    shading = scene.display.shading
    for attribute, value in (
        ("light", "STUDIO"),
        ("color_type", "SINGLE"),
        ("single_color", (0.62, 0.64, 0.67)),
        ("show_cavity", True),
        ("cavity_type", "BOTH"),
        ("show_shadows", True),
        ("show_object_outline", True),
        ("background_type", "VIEWPORT"),
        ("background_color", (0.07, 0.08, 0.09)),
    ):
        if hasattr(shading, attribute):
            try:
                setattr(shading, attribute, value)
            except (TypeError, ValueError):
                pass


def configure_material(scene, samples):
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES" and hasattr(scene, "cycles"):
        scene.cycles.samples = samples or 16
    elif hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = samples or 16
        except AttributeError:
            pass


def configure_final(scene, samples):
    if samples <= 0:
        return
    if scene.render.engine == "CYCLES" and hasattr(scene, "cycles"):
        scene.cycles.samples = samples
    elif hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = samples
        except AttributeError:
            pass


def visible_lights(scene):
    return any(obj.type == "LIGHT" and obj.visible_get() for obj in scene.objects)


def add_temporary_lights(center, size):
    collection = bpy.data.collections.new("Review_Capture_Lights")
    bpy.context.scene.collection.children.link(collection)
    created = []
    try:
        for name, offset, energy, light_size in (
            ("Review_Key", (1.4, -1.8, 1.8), 260.0, 0.65),
            ("Review_Fill", (-1.8, -1.2, 0.9), 120.0, 0.8),
            ("Review_Rim", (0.2, 1.8, 1.4), 160.0, 0.6),
        ):
            data = bpy.data.lights.new(name, "AREA")
            data.energy = energy * max(0.35, size) ** 2
            data.shape = "DISK"
            data.size = light_size * max(0.5, size)
            light = bpy.data.objects.new(name, data)
            collection.objects.link(light)
            light.location = center + Vector(offset) * max(0.3, size)
            light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
            created.append(light)
        return collection
    except Exception:
        for light in created:
            data = light.data
            bpy.data.objects.remove(light, do_unlink=True)
            if data and data.users == 0:
                bpy.data.lights.remove(data)
        bpy.data.collections.remove(collection)
        raise


def add_temporary_camera():
    data = bpy.data.cameras.new("Review_Capture_Camera")
    camera = bpy.data.objects.new("Review_Capture_Camera", data)
    bpy.context.scene.collection.objects.link(camera)
    camera.rotation_mode = "XYZ"
    return camera


def remove_temporary_lights(collection):
    if collection is None:
        return
    for light in list(collection.objects):
        data = light.data
        bpy.data.objects.remove(light, do_unlink=True)
        if data and data.users == 0:
            bpy.data.lights.remove(data)
    bpy.data.collections.remove(collection)


def remove_temporary_camera(camera):
    if camera is None:
        return
    data = camera.data
    bpy.data.objects.remove(camera, do_unlink=True)
    if data and data.users == 0:
        bpy.data.cameras.remove(data)


def render_still():
    bpy.ops.render.render(write_still=True)


class StateSnapshot:
    def __init__(self):
        scene = bpy.context.scene
        self.scene = scene
        self.camera = scene.camera
        self.frame = scene.frame_current
        self.engine = scene.render.engine
        self.resolution = (
            scene.render.resolution_x,
            scene.render.resolution_y,
            scene.render.resolution_percentage,
        )
        self.filepath = scene.render.filepath
        self.film_transparent = scene.render.film_transparent
        self.image = {
            "file_format": scene.render.image_settings.file_format,
            "color_mode": scene.render.image_settings.color_mode,
            "color_depth": scene.render.image_settings.color_depth,
        }
        self.view = {
            "view_transform": scene.view_settings.view_transform,
            "look": scene.view_settings.look,
            "exposure": scene.view_settings.exposure,
            "gamma": scene.view_settings.gamma,
            "use_curve_mapping": scene.view_settings.use_curve_mapping,
        }
        self.world = scene.world
        self.cycles = None
        if hasattr(scene, "cycles"):
            self.cycles = {
                "samples": scene.cycles.samples,
                "use_denoising": scene.cycles.use_denoising,
                "device": scene.cycles.device,
            }
        self.eevee = None
        if hasattr(scene, "eevee"):
            self.eevee = {
                "taa_render_samples": scene.eevee.taa_render_samples,
            }
        self.shading = {}
        for attribute in SHADING_ATTRIBUTES:
            if hasattr(scene.display.shading, attribute):
                value = getattr(scene.display.shading, attribute)
                if hasattr(value, "__len__") and not isinstance(value, str):
                    value = tuple(value)
                self.shading[attribute] = value
        self.camera_transform = None
        if self.camera:
            self.camera_transform = (
                self.camera.location.copy(),
                self.camera.rotation_euler.copy(),
                self.camera.data.type,
                self.camera.data.ortho_scale,
                self.camera.data.lens,
            )
        self.active = bpy.context.view_layer.objects.active
        self.selected = [obj.name for obj in scene.objects if obj.select_get()]
        self.hide_render = {obj.name: bool(obj.hide_render) for obj in scene.objects}

    def restore(self):
        scene = self.scene
        scene.render.engine = self.engine
        (scene.render.resolution_x, scene.render.resolution_y,
         scene.render.resolution_percentage) = self.resolution
        scene.render.filepath = self.filepath
        scene.render.film_transparent = self.film_transparent
        try:
            scene.render.image_settings.file_format = self.image["file_format"]
        except TypeError:
            pass
        try:
            scene.render.image_settings.color_mode = self.image["color_mode"]
        except TypeError:
            pass
        try:
            scene.render.image_settings.color_depth = self.image["color_depth"]
        except TypeError:
            pass
        for key, value in self.view.items():
            try:
                setattr(scene.view_settings, key, value)
            except (AttributeError, TypeError, ValueError):
                pass
        if self.cycles is not None and hasattr(scene, "cycles"):
            scene.cycles.samples = self.cycles["samples"]
            scene.cycles.use_denoising = self.cycles["use_denoising"]
            try:
                scene.cycles.device = self.cycles["device"]
            except TypeError:
                pass
        if self.eevee is not None and hasattr(scene, "eevee"):
            try:
                scene.eevee.taa_render_samples = self.eevee["taa_render_samples"]
            except AttributeError:
                pass
        for key, value in self.shading.items():
            try:
                setattr(scene.display.shading, key, value)
            except (AttributeError, TypeError, ValueError):
                pass
        scene.world = self.world
        scene.camera = self.camera
        scene.frame_set(self.frame)
        if self.camera and self.camera_transform:
            location, rotation, camera_type, ortho_scale, lens = self.camera_transform
            self.camera.location = location
            self.camera.rotation_euler = rotation
            self.camera.data.type = camera_type
            self.camera.data.ortho_scale = ortho_scale
            self.camera.data.lens = lens
        for obj in scene.objects:
            obj.select_set(obj.name in self.selected)
        if self.active and self.active.name in bpy.data.objects:
            bpy.context.view_layer.objects.active = self.active
        for name, hidden in self.hide_render.items():
            obj = bpy.data.objects.get(name)
            if obj is not None:
                obj.hide_render = hidden


def main():
    args = parse_args()
    requested = [name.strip() for name in args.views.split(",") if name.strip()]
    unknown = [name for name in requested if name not in VIEW_DIRECTIONS]
    if unknown:
        raise RuntimeError(f"Unknown views: {unknown}")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    name = safe_name(args.name or Path(bpy.data.filepath).stem or "asset")
    manifest_path = out_dir / f"{name}_captures.json"
    if manifest_path.exists():
        raise FileExistsError(f"Refusing to overwrite {manifest_path}")

    scene = bpy.context.scene
    if args.frame < 0 and any(obj.animation_data for obj in scene.objects):
        raise RuntimeError("Animated scenes require an explicit --frame")
    pose_object = bpy.data.objects.get(args.pose_object) if args.pose_object else None
    if args.pose_object and pose_object is None:
        raise RuntimeError(f"Missing pose object: {args.pose_object}")
    state = StateSnapshot()
    camera = add_temporary_camera()
    temp_lights = None
    temp_world = None
    hidden = {}
    captures = []
    try:
        if args.frame >= 0:
            scene.frame_set(args.frame)
        objects = target_objects(args)
        focus_names = {value.strip() for value in args.focus_targets.split(",")
                       if value.strip()}
        focus_objects = []
        for focus_name in focus_names:
            focus_obj = bpy.data.objects.get(focus_name)
            if focus_obj is None:
                raise RuntimeError(f"Missing focus target: {focus_name}")
            focus_objects.append(focus_obj)
        if focus_objects and args.focus_view not in VIEW_DIRECTIONS:
            raise RuntimeError(f"Unknown focus view: {args.focus_view}")
        bpy.context.view_layer.update()
        pose = None
        if pose_object is not None:
            evaluated_pose = pose_object.evaluated_get(
                bpy.context.evaluated_depsgraph_get())
            pose = {"object": pose_object.name, "frame": scene.frame_current,
                    "matrix_world": [list(row) for row in evaluated_pose.matrix_world]}
        minimum, maximum = world_bounds(objects)
        center = (minimum + maximum) * 0.5
        size = max(maximum - minimum)
        fingerprint = fingerprint_objects(objects)

        scene.render.resolution_x = args.width
        scene.render.resolution_y = args.height
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGB"
        scene.render.image_settings.color_depth = "8"
        scene.render.film_transparent = False
        scene.render.filepath = str(out_dir)
        scene.camera = camera

        if args.preset == "solid":
            configure_workbench(scene)
        elif args.preset == "material":
            configure_material(scene, args.samples)
            if not visible_lights(scene):
                temp_lights = add_temporary_lights(center, size)
        else:
            configure_final(scene, args.samples)
            if not visible_lights(scene):
                temp_lights = add_temporary_lights(center, size)
        if args.preset != "solid" and scene.world is None:
            temp_world = bpy.data.worlds.new("Review_Capture_World")
            temp_world.use_nodes = True
            temp_world.node_tree.nodes["Background"].inputs["Color"].default_value = (
                0.08, 0.09, 0.10, 1.0)
            temp_world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
            scene.world = temp_world

        if args.isolate:
            keep_names = {value.strip() for value in args.keep.split(",") if value.strip()}
            keep_names |= focus_names
            for obj in scene.objects:
                if (obj.type == "MESH" and obj not in objects
                        and obj.name not in keep_names):
                    hidden[obj.name] = bool(obj.hide_render)
                    obj.hide_render = True

        camera.data.type = "PERSP" if args.perspective else "ORTHO"
        if camera.data.type == "ORTHO":
            camera.data.ortho_scale = max(0.15, size * 1.25)
        else:
            camera.data.lens = 55

        distance = max(0.5, size * 3.0 + 0.4)
        for view in requested:
            direction = Vector(VIEW_DIRECTIONS[view]).normalized()
            camera.location = center + direction * distance
            rotation = (center - camera.location).to_track_quat("-Z", "Y")
            camera.matrix_world = Matrix.Translation(camera.location) @ rotation.to_matrix().to_4x4()
            bpy.context.view_layer.update()
            path = out_dir / f"{name}_{view}_{args.preset}.png"
            if path.exists():
                raise FileExistsError(f"Refusing to overwrite {path}")
            scene.render.filepath = str(path)
            render_still()
            captures.append({
                "view": view,
                "path": str(path),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "camera": {
                    "location": [round(value, 6) for value in camera.location],
                    "ortho_scale": round(camera.data.ortho_scale, 6),
                    "perspective": camera.data.type == "PERSP",
                },
            })

        if focus_objects:
            focus_minimum, focus_maximum = world_bounds(focus_objects)
            focus_center = (focus_minimum + focus_maximum) * 0.5
            focus_size = max(focus_maximum - focus_minimum)
            direction = Vector(VIEW_DIRECTIONS[args.focus_view]).normalized()
            camera.data.type = "ORTHO"
            camera.data.ortho_scale = max(0.02, focus_size * 1.15)
            camera.location = focus_center + direction * max(
                0.25, focus_size * 3.0 + 0.05)
            rotation = (focus_center - camera.location).to_track_quat("-Z", "Y")
            camera.matrix_world = (
                Matrix.Translation(camera.location) @ rotation.to_matrix().to_4x4())
            bpy.context.view_layer.update()
            path = out_dir / f"{name}_focus_{args.focus_view}_{args.preset}.png"
            if path.exists():
                raise FileExistsError(f"Refusing to overwrite {path}")
            scene.render.filepath = str(path)
            render_still()
            captures.append({
                "view": f"focus_{args.focus_view}",
                "focus": sorted(focus_names),
                "path": str(path),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "camera": {
                    "location": [round(value, 6) for value in camera.location],
                    "ortho_scale": round(camera.data.ortho_scale, 6),
                    "perspective": camera.data.type == "PERSP",
                },
            })
    finally:
        state.restore()
        for name_key, hidden_value in hidden.items():
            obj = bpy.data.objects.get(name_key)
            if obj is not None:
                obj.hide_render = hidden_value
        remove_temporary_lights(temp_lights)
        if temp_world is not None:
            bpy.data.worlds.remove(temp_world)
        remove_temporary_camera(camera)

    manifest = {
        "tool": "capture_review.py",
        "blend": bpy.data.filepath,
        "preset": args.preset,
        "pose": pose,
        "acceptance_scope": "capture evidence only; not contact or visual approval",
        "targets": [obj.name for obj in objects],
        "target_ids": [get_asset_id(obj) for obj in objects],
        "fingerprint": fingerprint,
        "bounds": {
            "min": [round(value, 6) for value in minimum],
            "max": [round(value, 6) for value in maximum],
        },
        "settings": {
            "resolution": [args.width, args.height],
            "perspective": args.perspective,
            "frame": args.frame if args.frame >= 0 else state.frame,
            "isolate": args.isolate,
            "focus_targets": sorted(focus_names),
            "focus_view": args.focus_view if focus_objects else None,
        },
        "captures": captures,
        "restored": True,
    }
    manifest_path = out_dir / f"{name}_captures.json"
    if manifest_path.exists():
        raise FileExistsError(f"Refusing to overwrite {manifest_path}")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("CAPTURE_REVIEW " + json.dumps({
        "manifest": str(manifest_path),
        "captures": len(captures),
        "preset": args.preset,
    }))


if __name__ == "__main__":
    main()
