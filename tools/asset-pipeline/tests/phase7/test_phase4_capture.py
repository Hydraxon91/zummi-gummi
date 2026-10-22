"""Disposable asymmetric view/restoration fixtures. Optional argv: can helper path."""
import importlib.util
import sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[4]
SCRIPTS = ROOT / 'tools/asset-pipeline/scripts'

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

capture = load('capture_fixture', SCRIPTS / 'capture_review.py')
out = ROOT / '.dev-shots/asset-pipeline/phase4-tool-repair'
out.mkdir(parents=True, exist_ok=True)
# Unique run directory: no evidence overwrite.
import tempfile
out = Path(tempfile.mkdtemp(prefix='capture-', dir=out))
factory_cube = bpy.data.objects.get('Cube')
if factory_cube is not None:
    factory_cube.hide_render = True
bpy.ops.mesh.primitive_cube_add(size=0.4, location=(0, 0, 0.2))
obj = bpy.context.object
obj.name = 'Axis_Host'
collection = bpy.data.collections.new('Can')
bpy.context.scene.collection.children.link(collection)
collection.objects.link(obj)
bpy.ops.mesh.primitive_cube_add(size=0.15, location=(0.5, -0.3, 0.45))
marker = bpy.context.object
marker.name = 'Axis_Marker'
collection.objects.link(marker)
bpy.ops.object.camera_add(location=(2, 3, 4))
scene = bpy.context.scene
camera = bpy.context.object
camera.rotation_mode = 'QUATERNION'
camera.rotation_quaternion = (0.8, 0.2, 0.3, 0.4)
scene.camera = camera
obj.hide_render = False

def state():
    return (scene.camera, tuple(camera.matrix_basis[i][j] for i in range(4) for j in range(4)),
            scene.render.engine, scene.render.filepath, scene.render.resolution_x,
            scene.render.resolution_y, scene.world, obj.hide_render,
            tuple(o.name for o in scene.objects if o.select_get()),
            bpy.context.view_layer.objects.active)

before = state()
sys.argv = ['blender', '--', '--out-dir', str(out), '--targets', 'Axis_Host,Axis_Marker',
            '--name', 'asymmetric', '--views', 'front,right', '--preset', 'solid',
            '--width', '320', '--height', '320']
# Check actual generated camera projection, not just direction labels.
original_render = capture.render_still
def inspect_render():
    cam = scene.camera
    a = world_to_camera_view(scene, cam, Vector((0, 0, 0.2)))
    b = world_to_camera_view(scene, cam, marker.location)
    # Front (-Y) has +X screen-right; right (+X) has +Y screen-right.
    horizontal_ok = b.x > a.x if cam.location.y < -1 else b.x < a.x
    assert horizontal_ok and b.y > a.y, (cam.location[:], a[:], b[:])
    original_render()
capture.render_still = inspect_render
capture.main()
assert state() == before, (state(), before)

def failure(**kwargs):
    raise RuntimeError('injected render failure')
capture.render_still = failure
sys.argv[sys.argv.index('asymmetric')] = 'exception'
try:
    capture.main()
except RuntimeError as exc:
    assert 'injected' in str(exc)
else:
    raise AssertionError('Render exception hidden')
assert state() == before
assert not any(o.name.startswith('Review_Capture') for o in scene.objects)

if '--can-helper' in sys.argv:
    raise AssertionError('Pass helper through CAN_HELPER environment variable')
import os
helper = os.environ.get('CAN_HELPER')
if helper:
    can = load('can_fixture', Path(helper))
    for name in ('REF_front', 'REF_top'):
        reference = bpy.data.objects.new(name, None)
        scene.collection.objects.link(reference)
        reference.hide_render = name == 'REF_front'
    # World shader contents must not be edited by capture.
    world = scene.world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    color = tuple(bg.inputs[0].default_value)
    obj.hide_render = False
    before = state()
    # Avoid a heavy Eevee render: use Workbench but exercise the local setup/cleanup.
    scene.render.engine = 'BLENDER_WORKBENCH'
    before = state()
    can.render(str(out / 'can_front.png'), 'front', (0, 0, 0.2), 1.5,
               res=(320, 320), engine='CURRENT')
    assert state() == before
    assert tuple(bg.inputs[0].default_value) == color
    from types import SimpleNamespace
    capture_module = can._asset_capture()
    original_bpy = capture_module.bpy
    class RenderFailureProxy:
        ops = SimpleNamespace(render=SimpleNamespace(render=failure))
        def __getattr__(self, name):
            return getattr(original_bpy, name)
    capture_module.bpy = RenderFailureProxy()
    try:
        try:
            can.render(str(out / 'can_render_failure.png'), 'front', (0, 0, 0.2), 1.5,
                       engine='CURRENT')
        except RuntimeError as exc:
            assert 'injected' in str(exc)
        else:
            raise AssertionError('Render exception hidden')
    finally:
        capture_module.bpy = original_bpy
    assert state() == before
    assert tuple(bg.inputs[0].default_value) == color
    try:
        can.render(str(out / 'can_failure.png'), 'invalid-view', (0, 0, 0), 1.5,
                   engine='CURRENT')
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid view not rejected')
    assert state() == before
    assert tuple(bg.inputs[0].default_value) == color
    assert can.health(obj)['evaluated']['boundary_edges'] == 0
    source = [tuple(v.co) for v in obj.data.vertices]
    can.boolean(obj, marker, 'UNION')
    assert marker.name in bpy.data.objects and len(obj.modifiers) == 1
    assert source == [tuple(v.co) for v in obj.data.vertices]
else:
    print('CAN_HELPER not supplied: local adapter branch not exercised')
print('TEST_PHASE4_CAPTURE pass', out)
