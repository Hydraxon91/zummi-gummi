"""Disposable capture fixture: reference visibility, views and restoration.

Runs in background Blender. Uses synthetic objects only; it never opens an asset.
"""
import importlib.util
import tempfile
from pathlib import Path
from types import SimpleNamespace

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[4]
SCRIPTS = ROOT / "tools/asset-pipeline/scripts"
spec = importlib.util.spec_from_file_location(
    "asset_capture_fixture", SCRIPTS / "asset_capture.py")
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)

out = Path(tempfile.mkdtemp(
    prefix="capture-", dir=ROOT / ".dev-shots/asset-pipeline/phase4-tool-repair"))
scene = bpy.context.scene

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)


def add_box(name, size, location, collection):
    bpy.ops.mesh.primitive_cube_add(size=size, location=location)
    obj = bpy.context.object
    obj.name = name
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


can = bpy.data.collections.new("Can")
scene.collection.children.link(can)
host = add_box("Host", 0.4, (0, 0, 0.2), can)
marker = add_box("Marker", 0.15, (0.5, -0.3, 0.45), can)

references = bpy.data.collections.new("Reference")
scene.collection.children.link(references)
front = add_box("REF_front", 0.2, (0, 0.4, 0.2), references)
top = add_box("REF_top", 0.2, (0, 0.4, 0.6), references)
front.hide_render = False
top.hide_render = True
references.hide_render = False

camera_data = bpy.data.cameras.new("Original_Camera")
camera = bpy.data.objects.new("Original_Camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (2, 3, 4)
camera.rotation_mode = "QUATERNION"
camera.rotation_quaternion = (0.8, 0.2, 0.3, 0.4)
scene.camera = camera

world = bpy.data.worlds.new("Original_World")
world.use_nodes = True
background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
background.inputs[0].default_value = (0.2, 0.3, 0.4, 1.0)
background.inputs[1].default_value = 0.7
scene.world = world

scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x, scene.render.resolution_y = 640, 480
scene.render.resolution_percentage = 100
scene.render.filepath = "//original.png"
scene.render.film_transparent = True
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.color_mode = "RGB"


def state():
    return (
        scene.camera.name if scene.camera else None,
        tuple(round(value, 6) for row in scene.camera.matrix_basis for value in row)
        if scene.camera else None,
        scene.render.engine,
        scene.render.filepath,
        (scene.render.resolution_x, scene.render.resolution_y,
         scene.render.resolution_percentage),
        scene.render.film_transparent,
        (scene.render.image_settings.file_format,
         scene.render.image_settings.color_mode),
        scene.world.name if scene.world else None,
        tuple(round(value, 6) for value in background.inputs[0].default_value),
        round(background.inputs[1].default_value, 6),
        tuple(sorted((obj.name, bool(obj.hide_render)) for obj in scene.objects)),
        tuple((obj.name, tuple(slot.material.name if slot.material else None
                               for slot in obj.material_slots))
              for obj in scene.objects),
        tuple(sorted(obj.name for obj in scene.objects if obj.select_get())),
        bpy.context.view_layer.objects.active.name
        if bpy.context.view_layer.objects.active else None,
        front.hide_render,
        top.hide_render,
        references.hide_render,
        tuple(sorted(material.name for material in bpy.data.materials)),
        tuple(sorted(collection.name for collection in bpy.data.collections)),
    )


real_bpy = capture.bpy


class RenderProxy:
    def __init__(self, inspect=None):
        self.inspect = inspect
        self.ops = SimpleNamespace(render=SimpleNamespace(render=self.render))

    def render(self, **kwargs):
        if self.inspect:
            self.inspect()
        real_bpy.ops.render.render(**kwargs)

    def __getattr__(self, name):
        return getattr(real_bpy, name)


def inspect_axes():
    cam = scene.camera
    assert cam.data.type == "ORTHO", cam.data.type
    anchor = world_to_camera_view(scene, cam, Vector((0, 0, 0.2)))
    mark = world_to_camera_view(scene, cam, marker.location)
    horizontal = mark.x > anchor.x if cam.location.y < -1 else mark.x < anchor.x
    assert horizontal and mark.y > anchor.y, (cam.location[:], anchor[:], mark[:])
    assert front.hide_render is False
    assert top.hide_render is True
    assert references.hide_render is False
    assert host.material_slots[0].material.name == "Review_Clay"


before = state()
capture.bpy = RenderProxy(inspect_axes)
try:
    for view in ("front", "side"):
        capture.render_view(
            str(out / f"{view}.png"), view, (0.1, 0, 0.2), 1.6,
            objects=[host, marker], res=(320, 320), engine="CURRENT",
            show="REF_front", reference_objects=("REF_front", "REF_top"),
            reference_collection="Reference")
finally:
    capture.bpy = real_bpy
for view in ("front", "side"):
    assert (out / f"{view}.png").stat().st_size > 0
assert state() == before, (state(), before)

try:
    capture.render_view(str(out / "invalid.png"), "bogus", (0.1, 0, 0.2), 1.6,
                        objects=[host], engine="CURRENT")
except ValueError:
    pass
else:
    raise AssertionError("Invalid view was not rejected")
assert not (out / "invalid.png").exists()
assert state() == before

class FailingProxy(RenderProxy):
    def render(self, **kwargs):
        raise RuntimeError("injected render failure")


capture.bpy = FailingProxy()
try:
    try:
        capture.render_view(
            str(out / "failure.png"), "front", (0.1, 0, 0.2), 1.6,
            objects=[host], res=(320, 320), engine="CURRENT",
            show="REF_front", reference_objects=("REF_front", "REF_top"),
            reference_collection="Reference")
    except RuntimeError as exc:
        assert "injected" in str(exc), exc
    else:
        raise AssertionError("Render exception was hidden")
finally:
    capture.bpy = real_bpy
assert state() == before, (state(), before)
assert not any(obj.name.startswith("Review_") for obj in scene.objects)
assert not any(c.name.startswith("Review_") for c in bpy.data.collections)
assert not any(m.name.startswith("Review_") for m in bpy.data.materials)


def inspect_wire():
    assert bpy.data.materials.get("Review_Wire") is not None
    assert host.hide_render is True
    assert front.hide_render is True
    assert any(obj.name.startswith("Host.") for obj in scene.objects)


capture.bpy = RenderProxy(inspect_wire)
try:
    capture.render_view(str(out / "wire.png"), "front", (0.1, 0, 0.2), 1.6,
                        objects=[host, marker], res=(320, 320), engine="CURRENT",
                        clay=False, wire=True,
                        reference_objects=("REF_front", "REF_top"),
                        reference_collection="Reference")
finally:
    capture.bpy = real_bpy
assert (out / "wire.png").stat().st_size > 0
assert state() == before, (state(), before)
assert not any(obj.name.startswith("Host.") for obj in scene.objects)

print("TEST_ASSET_CAPTURE pass", out)
