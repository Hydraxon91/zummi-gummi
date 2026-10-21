"""Build the Phase 7E mixed opaque/glass office-corner benchmark.

The room is intentionally a small architectural test section: two walls, a
floor, a physically seated transmission-glass window, a desk, an old wooden
chair with a red cushion and a bookcase with books. The accepted Phase 7D desk
lamp is imported unchanged from its delivered GLB.

Units are metres, +Z up, +Y toward the window wall.
"""

import argparse
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

parse = argparse.ArgumentParser()
parse.add_argument("--materials-json", required=True)
parse.add_argument("--lamp-glb", required=True)
parse.add_argument("--laptop-glb")
parse.add_argument("--beanbag-glb")
parse.add_argument("--plant-glb")
parse.add_argument("--mouse-glb")
parse.add_argument("--out-dir", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "office_corner_source_001.blend"
glb_path = out_dir / "office_corner_001.glb"
report_path = out_dir / "build-report.json"
for path in (source_path, glb_path, report_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")

material_manifest = json.loads(Path(args.materials_json).read_text(encoding="utf-8"))


def material_channels(material_id):
    channels = material_manifest["materials"][material_id]["channels"]
    for name, path in channels.items():
        if not Path(path).exists():
            raise FileNotFoundError(f"{material_id} {name}: {path}")
    return channels

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

room = bpy.data.collections.new("7E_Office")
books_collection = bpy.data.collections.new("7E_Books")
lamp_collection = bpy.data.collections.new("7E_Lamp")
props_collection = bpy.data.collections.new("7E_Frutiger")
for collection in (room, books_collection, lamp_collection, props_collection):
    scene.collection.children.link(collection)

root = bpy.data.objects.new("Office_Root", None)
room.objects.link(root)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def srgb_to_linear(value):
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def hex_linear(value):
    value = value.lstrip("#")
    return tuple(srgb_to_linear(int(value[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def image(path, colorspace, pack=True):
    loaded = bpy.data.images.load(str(Path(path).resolve()), check_existing=False)
    loaded.colorspace_settings.name = colorspace
    if pack:
        loaded.pack()
    return loaded


def constant_material(name, color, roughness, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    material.diffuse_color = (*color, 1.0)
    return material


def image_material(name, channels, normal_strength=0.4):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = 0.5
    shader.inputs["Metallic"].default_value = 0.0

    base = nodes.new("ShaderNodeTexImage")
    base.name = "BaseColor"
    base.image = image(channels["basecolor"], "sRGB")
    links.new(base.outputs["Color"], shader.inputs["Base Color"])

    rough = nodes.new("ShaderNodeTexImage")
    rough.name = "Roughness"
    rough.image = image(channels["roughness"], "Non-Color")
    links.new(rough.outputs["Color"], shader.inputs["Roughness"])

    metal = nodes.new("ShaderNodeTexImage")
    metal.name = "Metallic"
    metal.image = image(channels["metallic"], "Non-Color")
    links.new(metal.outputs["Color"], shader.inputs["Metallic"])

    tangent = nodes.new("ShaderNodeTexImage")
    tangent.name = "Normal"
    tangent.image = image(channels["normal"], "Non-Color")
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = normal_strength
    links.new(tangent.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    return material


def use_material(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)


def cube(name, location, dimensions, collection, material=None, parent=root):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    if material is not None:
        use_material(obj, material)
    return obj


def cylinder(name, location, radius, depth, collection, material=None, vertices=48, parent=root):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    if material is not None:
        use_material(obj, material)
    triangulate = obj.modifiers.new("Export_Triangulate", "TRIANGULATE")
    triangulate.quad_method = "BEAUTY"
    triangulate.ngon_method = "BEAUTY"
    return obj


def sphere(name, location, radius, collection, material=None, parent=root):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    if material is not None:
        use_material(obj, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def world_box(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        [min(point[i] for point in points) for i in range(3)],
        [max(point[i] for point in points) for i in range(3)],
    )


def box_project_uv(obj, tile_metres, rotate_degrees=0):
    mesh = obj.data
    uv_layer = mesh.uv_layers.get("UVMap")
    if uv_layer is None:
        uv_layer = mesh.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm_uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        normal = (obj.matrix_world.to_3x3() @ face.normal).normalized()
        axis = max(range(3), key=lambda index: abs(normal[index]))
        for loop in face.loops:
            point = obj.matrix_world @ loop.vert.co
            if axis == 0:
                uv = (point.y, point.z)
            elif axis == 1:
                uv = (point.x, point.z)
            else:
                uv = (point.x, point.y)
            if rotate_degrees == 90:
                uv = (uv[1], -uv[0])
            elif rotate_degrees == 180:
                uv = (-uv[0], -uv[1])
            elif rotate_degrees == 270:
                uv = (-uv[1], uv[0])
            loop[bm_uv].uv = (uv[0] / tile_metres, uv[1] / tile_metres)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def textured(obj, material, tile_metres, rotate_degrees=0):
    use_material(obj, material)
    box_project_uv(obj, tile_metres, rotate_degrees)
    return obj


def bevel(obj, width=0.004, segments=2):
    modifier = obj.modifiers.new("Edge_Bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    return obj


def wall_finish(obj, interior_normal):
    """Wallpaper on the room-facing side, plaster on outside/edges."""
    obj.data.materials.append(plaster)
    normal = Vector(interior_normal).normalized()
    for polygon in obj.data.polygons:
        if polygon.normal.dot(normal) > 0.5:
            polygon.material_index = 0
        else:
            polygon.material_index = 1
    return obj


wall_material = image_material("Office_Wall_Wallpaper", material_channels("office_wall_wallpaper"), 0.24)
floor_material = image_material("Office_Floor_Parquet", material_channels("office_floor_parquet"), 0.30)
desk_material = image_material("Office_Desk_Walnut", material_channels("office_desk_walnut"), 0.50)
chair_material = image_material("Office_Chair_Oak", material_channels("office_chair_oak"), 0.50)
cushion_material = image_material("Office_Cushion_Red", material_channels("office_cushion_red"), 0.55)
rug_material = image_material("Office_Rug_Grey", material_channels("office_rug_grey"), 0.40)
bookcase_material = image_material("Office_Bookcase_Oak", material_channels("office_chair_oak"), 0.45)
metal = constant_material("Office_Metal_DarkBronze", hex_linear("#3C3934"), 0.34, 0.68)
plaster = constant_material("Office_Plaster_Exterior", hex_linear("#E8E1D4"), 0.82)
fan_globe = constant_material("Office_FanGlobe_Warm", hex_linear("#F2E7CE"), 0.24)
fan_globe_shader = next(node for node in fan_globe.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
fan_globe_shader.inputs["Emission Color"].default_value = (*hex_linear("#FFD9A0"), 1.0)
fan_globe_shader.inputs["Emission Strength"].default_value = 2.0
glass = constant_material("Office_Glass_Transmission", (0.94, 0.98, 1.0), 0.035)
glass_shader = next(node for node in glass.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
glass_shader.inputs["Transmission Weight"].default_value = 1.0
glass_shader.inputs["IOR"].default_value = 1.45
glass_shader.inputs["Alpha"].default_value = 1.0
glass.diffuse_color = (0.94, 0.98, 1.0, 0.18)
glass.surface_render_method = "DITHERED"

book_palette = [
    ("Teal", hex_linear("#0B665F")),
    ("Cream", hex_linear("#C4B99E")),
    ("Navy", hex_linear("#14243A")),
    ("Clay", hex_linear("#8A3826")),
    ("Sage", hex_linear("#506B48")),
]
book_materials = [constant_material("Office_Book_" + name, color, 0.68) for name, color in book_palette]
paper = constant_material("Office_Book_Pages", hex_linear("#D8CDAE"), 0.86)

# Architectural shell. Opening: X -1.05..1.05, Z 0.95..2.25, wall Y 1.5..1.68.
# Floor reaches every wall's outer face: X -1.98..1.80, Y -1.50..1.68.
floor = cube("Office_Floor", (-0.09, 0.09, -0.09), (3.78, 3.18, 0.18), room, floor_material)
box_project_uv(floor, 1.2)
left_wall = cube("Office_Wall_Left", (-1.89, 0, 1.35), (0.18, 3.0, 2.7), room, wall_material)
box_project_uv(left_wall, 0.9)
wall_finish(left_wall, (1, 0, 0))
for name, location, dimensions in (
    ("Office_Wall_Back_Lower", (-0.09, 1.59, 0.475), (3.78, 0.18, 0.95)),
    ("Office_Wall_Back_Upper", (-0.09, 1.59, 2.475), (3.78, 0.18, 0.45)),
    ("Office_Wall_Back_Left", (-1.515, 1.59, 1.6), (0.93, 0.18, 1.3)),
    ("Office_Wall_Back_Right", (1.425, 1.59, 1.6), (0.75, 0.18, 1.3)),
):
    wall = cube(name, location, dimensions, room, wall_material)
    box_project_uv(wall, 0.9)
    wall_finish(wall, (0, -1, 0))

for sign in (-1, 1):
    cube(f"Office_Frame_Jamb_{sign}", (sign * 1.015, 1.59, 1.6), (0.07, 0.18, 1.3), room, metal)
for z in (0.985, 2.215):
    cube(f"Office_Frame_Rail_{z}", (0, 1.59, z), (1.96, 0.18, 0.07), room, metal)
cube("Office_Frame_Mullion", (0, 1.59, 1.6), (0.05, 0.14, 1.16), room, metal)
# The sill is 30 mm inside the wall face; its rear plane must not coincide with the exterior.
cube("Office_Window_Sill", (0, 1.44, 0.975), (2.2, 0.42, 0.05), room, metal)

# Desk against the rear wall, with a walnut top and dark metal legs.
desk_top = textured(
    cube("Office_Desk_Top", (-0.05, 1.125, 0.745), (1.6, 0.75, 0.05), room, desk_material),
    desk_material,
    0.75,
    90,
)
bevel(desk_top, 0.003, 2)
for x in (-0.72, 0.62):
    for y in (0.845, 1.405):
        cube(f"Office_Desk_Leg_{x}_{y}", (x, y, 0.36), (0.055, 0.055, 0.72), room, metal)

# Old wooden chair facing the desk, with a red seat cushion. Its front edge
# tucks 80 mm under the desk. The rear legs continue up as the back stiles, so
# the back is one solid member instead of a post sitting on a separate leg.
chair_x = -0.05
chair_y = 0.60
chair_parts = []
for sign in (-1, 1):
    chair_parts.append(cube(
        f"Office_Chair_Leg_Front_{sign}",
        (chair_x + sign * 0.20, chair_y + 0.195, 0.25),
        (0.045, 0.045, 0.50),
        room,
        chair_material,
    ))
    chair_parts.append(cube(
        f"Office_Chair_Stile_Back_{sign}",
        (chair_x + sign * 0.20, chair_y - 0.23, 0.545),
        (0.045, 0.045, 1.09),
        room,
        chair_material,
    ))
seat = cube("Office_Chair_Seat", (chair_x, chair_y, 0.475), (0.50, 0.46, 0.055), room, chair_material)
chair_parts.append(seat)
chair_parts.append(cube("Office_Chair_Rail_Top", (chair_x, chair_y - 0.23, 1.055), (0.435, 0.035, 0.075), room, chair_material))
chair_parts.append(cube("Office_Chair_Rail_Mid", (chair_x, chair_y - 0.23, 0.86), (0.40, 0.035, 0.045), room, chair_material))
chair_parts.append(cube("Office_Chair_Rail_Low", (chair_x, chair_y - 0.23, 0.69), (0.40, 0.035, 0.04), room, chair_material))
# Aprons tie every leg into the seat instead of leaving free-standing posts.
# Their tops sit 20 mm inside the seat so the 4 mm bevels cannot open a gap.
for name, x, y, dimensions in (
    ("Office_Chair_Apron_Left", chair_x - 0.20, chair_y - 0.0175, (0.03, 0.425, 0.08)),
    ("Office_Chair_Apron_Right", chair_x + 0.20, chair_y - 0.0175, (0.03, 0.425, 0.08)),
    ("Office_Chair_Apron_Front", chair_x, chair_y + 0.195, (0.40, 0.03, 0.08)),
    ("Office_Chair_Apron_Back", chair_x, chair_y - 0.23, (0.40, 0.03, 0.08)),
):
    chair_parts.append(cube(name, (x, y, 0.428), dimensions, room, chair_material))
# Stretchers end at the leg centres, giving each joint 22.5 mm of solid overlap.
for index, (x, y, dimensions) in enumerate((
    (chair_x - 0.20, chair_y - 0.0175, (0.025, 0.425, 0.025)),
    (chair_x + 0.20, chair_y - 0.0175, (0.025, 0.425, 0.025)),
    (chair_x, chair_y + 0.195, (0.40, 0.025, 0.025)),
    (chair_x, chair_y - 0.23, (0.40, 0.025, 0.025)),
), start=1):
    chair_parts.append(cube(f"Office_Chair_Stretcher_{index}", (x, y, 0.17), dimensions, room, chair_material))
for part in chair_parts:
    textured(part, chair_material, 0.42)
    bevel(part, 0.004, 2)
cushion = textured(
    cube("Office_Chair_Cushion", (chair_x, chair_y + 0.01, 0.535), (0.39, 0.36, 0.075), room, cushion_material),
    cushion_material,
    0.34,
)
bevel(cushion, 0.025, 3)

# Grey oval rug under the desk/chair, with a flat woven top.
rug = cylinder("Office_Rug", (-0.05, 0.55, 0.0075), 1.0, 0.015, room, rug_material, vertices=96)
rug.scale = (1.16, 0.90, 1.0)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
textured(rug, rug_material, 0.48)
bevel(rug, 0.006, 2)

# Open book on the desk in front of the chair.
open_book_parts = []
for sign, label in ((-1, "Left"), (1, "Right")):
    open_book_parts.append(cube(
        f"Office_OpenBook_Cover_{label}",
        (-0.05 + sign * 0.105, 0.97, 0.774),
        (0.21, 0.28, 0.006),
        room,
        book_materials[2],
    ))
    open_book_parts.append(cube(
        f"Office_OpenBook_Pages_{label}",
        (-0.05 + sign * 0.085, 0.97, 0.787),
        (0.19, 0.26, 0.018),
        room,
        paper,
    ))
open_book_parts.append(cube("Office_OpenBook_Spine", (-0.05, 0.97, 0.780), (0.02, 0.28, 0.022), room, book_materials[2]))
open_book_parts.append(cube("Office_OpenBook_Marker", (-0.05, 0.88, 0.790), (0.015, 0.11, 0.002), room, cushion_material))
for part in open_book_parts:
    bevel(part, 0.0015, 2)
# Keep the open book beside the new laptop instead of under it.
for part in open_book_parts:
    part.location.x += 0.37
    part.location.y -= 0.07

# Bookcase. Back is 25 mm from the left wall; front is 510 mm from the desk edge.
# The back panel's front face is 2 mm behind the side-panel rear faces to avoid z-fighting.
bookcase_back = textured(
    cube("Office_Bookcase_Back", (-1.762, -0.35, 0.975), (0.02, 1.1, 1.95), room, bookcase_material),
    bookcase_material,
    0.42,
)
for y, side in [(-0.8825, "Near"), (0.1825, "Far")]:
    side_obj = textured(
        cube(f"Office_Bookcase_Side_{side}", (-1.55, y, 0.975), (0.40, 0.035, 1.95), room, bookcase_material),
        bookcase_material,
        0.42,
    )
    bevel(side_obj, 0.003, 2)
for index, z in enumerate((0.025, 0.50, 0.975, 1.45, 1.925), start=1):
    shelf = textured(
        cube(f"Office_Bookcase_Shelf_{index}", (-1.55, -0.35, z), (0.40, 1.03, 0.05), room, bookcase_material),
        bookcase_material,
        0.42,
    )
    bevel(shelf, 0.0025, 2)

# "Hovering" ceiling fan with a warm light, placed above the desk.
fan_center = Vector((-0.05, 0.95, 2.36))
cylinder("Office_Fan_Downrod", (fan_center.x, fan_center.y, 2.50), 0.016, 0.24, room, metal, 24)
cylinder("Office_Fan_Canopy", (fan_center.x, fan_center.y, 2.63), 0.09, 0.03, room, metal, 32)
fan_hub = cylinder("Office_Fan_Hub", (fan_center.x, fan_center.y, 2.36), 0.10, 0.12, room, metal, 32)
fan_blades = []
for index, angle in enumerate((0, math.pi / 2, math.pi, 3 * math.pi / 2), start=1):
    blade = cube(
        f"Office_Fan_Blade_{index}",
        (fan_center.x + math.cos(angle) * 0.36, fan_center.y + math.sin(angle) * 0.36, 2.35),
        (0.56, 0.16, 0.018),
        room,
        bookcase_material,
    )
    blade.rotation_euler = (math.radians(9), 0, angle)
    bpy.context.view_layer.update()
    textured(blade, bookcase_material, 0.45)
    bevel(blade, 0.003, 2)
    fan_blades.append(blade)
cylinder("Office_Fan_Light_Collar", (fan_center.x, fan_center.y, 2.28), 0.07, 0.035, room, metal, 32)
fan_globe_obj = sphere("Office_Fan_Globe", (fan_center.x, fan_center.y, 2.20), 0.13, room, fan_globe)
fan_light_data = bpy.data.lights.new("Office_Fan_Light", "POINT")
fan_light_data.energy = 35
fan_light_data.color = (1.0, 0.78, 0.52)
fan_light_data.shadow_soft_size = 0.18
fan_light = bpy.data.objects.new("Office_Fan_Light", fan_light_data)
room.objects.link(fan_light)
fan_light.parent = fan_hub
fan_light.matrix_parent_inverse = fan_hub.matrix_world.inverted()
fan_light.location = (fan_center.x, fan_center.y, 2.16)

# Panes derived from the frame's evaluated world-space faces; 8 mm seating.
bpy.context.view_layer.update()


def bounds(name):
    obj = bpy.data.objects[name]
    return world_box(obj)


left = bounds("Office_Frame_Jamb_-1")
right = bounds("Office_Frame_Jamb_1")
mullion = bounds("Office_Frame_Mullion")
lower = bounds("Office_Frame_Rail_0.985")
upper = bounds("Office_Frame_Rail_2.215")
panes = []
for suffix, x0_raw, x1_raw in (("Left", left[1][0], mullion[0][0]), ("Right", mullion[1][0], right[0][0])):
    x0, x1 = x0_raw - 0.008, x1_raw + 0.008
    z0, z1 = lower[1][2] - 0.008, upper[0][2] + 0.008
    pane = cube(f"Office_Glass_{suffix}", ((x0 + x1) / 2, 1.59, (z0 + z1) / 2), (x1 - x0, 0.006, z1 - z0), room, glass)
    panes.append({
        "name": pane.name,
        "opening_x": [x0_raw, x1_raw],
        "pane_x": [x0, x1],
        "opening_z": [lower[1][2], upper[0][2]],
        "pane_z": [z0, z1],
        "thickness_m": 0.006,
        "seating_m": 0.008,
    })

# Books: four shelves, varied heights/colours, separate page block and covers.
rng = random.Random(72026)
book_count = 0
for shelf_index, shelf_z in enumerate((0.05, 0.525, 1.0, 1.475)):
    y = -0.81 + rng.uniform(0, 0.035)
    for book_index in range((8, 6, 8, 7)[shelf_index]):
        width = rng.uniform(0.045, 0.075)
        height = rng.uniform(0.245, 0.365)
        depth = rng.uniform(0.245, 0.30)
        x_front = -1.345 - rng.uniform(0.004, 0.025)
        x_center = x_front - depth / 2
        y_center = y + width / 2
        z_center = shelf_z + height / 2
        material = book_materials[(book_index + 2 * shelf_index) % len(book_materials)]
        prefix = "Office_Book_%02d" % (book_count + 1)
        cube(prefix + "_Pages", (x_center - 0.003, y_center, z_center), (depth - 0.008, width - 0.006, height - 0.008), books_collection, paper)
        for sign in (-1, 1):
            cube(
                prefix + "_Cover_" + str(sign),
                (x_center, y_center + sign * (width - 0.003) / 2, z_center),
                (depth, 0.003, height),
                books_collection,
                material,
            )
        cube(prefix + "_Spine", (x_front - 0.003, y_center, z_center), (0.006, width, height), books_collection, material)
        y += width + rng.uniform(0.009, 0.022)
        book_count += 1

# The accepted 7D lamp is imported unchanged and only positioned as a complete hierarchy.
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(Path(args.lamp_glb).resolve()))
lamp_root = bpy.data.objects.get("DeskLamp_Export_Root") or bpy.data.objects.get("Office_DeskLamp_Root")
if lamp_root is None:
    raise RuntimeError("Imported lamp root not found")
lamp_root.name = "Office_DeskLamp_Root"
lamp_parts = [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]
for obj in [lamp_root, *lamp_parts]:
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    lamp_collection.objects.link(obj)
lamp_root.location = (0.49528, 1.197138, 0.77)
# 110 degrees turns the shade left, toward the chair and desk centre.
lamp_root.rotation_euler[2] = math.radians(110)
for obj in lamp_parts:
    obj["source"] = "desk-lamp-005"
    obj["source_glb_sha256"] = "1cb29a20f6e2d33f9d63f472d7842a6f86da85744f3056e1d9c7214af752c9cf"

bpy.context.view_layer.update()


def objects_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        [min(point[i] for point in points) for i in range(3)],
        [max(point[i] for point in points) for i in range(3)],
    )


lamp_bounds = objects_bounds(lamp_parts)
assert abs(lamp_bounds[0][2] - 0.77) < 1e-5, lamp_bounds

lamp_light_data = bpy.data.lights.new("Office_DeskLamp_Light", "POINT")
lamp_light_data.energy = 12.0
lamp_light_data.color = (1.0, 0.80, 0.56)
lamp_light_data.shadow_soft_size = 0.025
lamp_light = bpy.data.objects.new("Office_DeskLamp_Light", lamp_light_data)
lamp_collection.objects.link(lamp_light)
lamp_light.parent = lamp_root
lamp_light.location = (0.0, 0.11, 0.455)


def import_placed_asset(path, root_name, location, rotation_z, tag):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(Path(path).resolve()))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    root_obj = next(
        (obj for obj in imported if obj.type == "EMPTY" and obj.name.startswith(root_name)),
        None,
    )
    if root_obj is None:
        raise RuntimeError(f"Imported root {root_name} not found in {path}")
    root_obj.name = root_name
    root_obj.rotation_mode = "XYZ"
    for obj in imported:
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        props_collection.objects.link(obj)
    root_obj.location = location
    root_obj.rotation_euler[2] = math.radians(rotation_z)
    for obj in imported:
        if obj.type == "MESH":
            obj["source"] = tag
    return root_obj, imported


laptop_root, laptop_imported = import_placed_asset(
    args.laptop_glb, "RetroLaptop_Root", (-0.58, 1.02, 0.776), 19.0,
    "retro-laptop-010")
laptop_hinge = next(
    (obj for obj in laptop_imported
     if obj.type == "EMPTY" and obj.name.startswith("RetroLaptop_Hinge")), None)
if laptop_hinge is not None:
    laptop_hinge.animation_data_clear()
    laptop_hinge.rotation_mode = "XYZ"
    laptop_hinge.rotation_euler = (math.radians(-110.0), 0.0, 0.0)

beanbag_root, beanbag_imported = import_placed_asset(
    args.beanbag_glb, "Frutiger_Beanbag_Root", (0.95, 0.25, 0.015), 12.0,
    "frutiger-props-001")
plant_root, plant_imported = import_placed_asset(
    args.plant_glb, "Frutiger_Plant_Root", (1.35, 1.15, 0.0), 30.0,
    "frutiger-props-001")
mouse_root, mouse_imported = import_placed_asset(
    args.mouse_glb, "Frutiger_Mouse_Root", (-0.30, 0.94, 0.77), -25.0,
    "frutiger-props-001")


# Review camera/lights are excluded from the GLB selection.
camera_data = bpy.data.cameras.new("Office_Review_Camera")
camera = bpy.data.objects.new("Office_Review_Camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (5.0, -6.0, 4.2)
camera.rotation_euler = (Vector((0, 0.45, 1.15)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 5.9
scene.camera = camera

for name, location, power, size in (
    ("Office_Review_Key", (1.0, -3.0, 5.0), 600, 5.0),
    ("Office_Review_Fill", (0.0, 3.0, 4.0), 400, 3.0),
    ("Office_Review_Window", (0.0, 2.55, 2.6), 900, 2.0),
):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = power
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0.5, 1.25)) - light.location).to_track_quat("-Z", "Y").to_euler()

scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 850
scene.render.resolution_percentage = 100
if scene.world is None:
    scene.world = bpy.data.worlds.new("Office_Review_World")
scene.world.use_nodes = True
background = next(node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND")
background.inputs["Color"].default_value = (0.64, 0.65, 0.66, 1.0)
background.inputs["Strength"].default_value = 0.7

bpy.ops.wm.save_as_mainfile(filepath=str(source_path))

# Selection: only room, book, lamp and new prop geometry. No camera or lights.
bpy.ops.object.select_all(action="DESELECT")
selected = []
for collection in (room, books_collection, lamp_collection, props_collection):
    for obj in collection.objects:
        if obj.type in {"MESH", "EMPTY"}:
            obj.select_set(True)
            selected.append(obj)
scene.view_layers[0].objects.active = bpy.data.objects["Office_Root"]

bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_tangents=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
)

mesh_objects = [obj for obj in selected if obj.type == "MESH"]
report = {
    "source": str(source_path),
    "source_sha256": sha256_file(source_path),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "glb_bytes": glb_path.stat().st_size,
    "units": "metres",
    "up": "+Z",
    "floor_dimensions_m": [3.78, 3.18],
    "wall_height_m": 2.7,
    "opening_m": {"x": [-1.05, 1.05], "z": [0.95, 2.25], "wall_y": [1.5, 1.68]},
    "desk_top_height_m": 0.77,
    "desk_location_y_m": 1.125,
    "chair": {
        "seat_height_m": 0.5025,
        "cushion_top_m": 0.5725,
        "back_height_m": 1.0925,
        "center": [chair_x, chair_y],
        "materials": ["Office_Chair_Oak", "Office_Cushion_Red"],
    },
    "open_book": {"center": [0.32, 0.90, 0.787], "cover": "Office_Book_Navy", "pages": "Office_Book_Pages"},
    "bookcase": {"width_m": 1.1, "height_m": 1.95, "depth_m": 0.4, "books": book_count, "material": "Office_Bookcase_Oak"},
    "rug": {"center": [-0.05, 0.55, 0.0075], "diameter_m": [2.32, 1.80], "thickness_m": 0.015, "material": "Office_Rug_Grey"},
    "ceiling_fan": {
        "center": [fan_center.x, fan_center.y, fan_center.z],
        "blade_span_m": 1.28,
        "globe_bottom_m": 2.07,
        "blades": 4,
        "materials": ["Office_Bookcase_Oak", "Office_Metal_DarkBronze", "Office_FanGlobe_Warm"],
        "light": "Office_Fan_Light, 35 W warm point, parented to hub, not exported",
    },
    "glass": panes,
    "lamp": {
        "source": "desk-lamp-005",
        "glb_sha256": "1cb29a20f6e2d33f9d63f472d7842a6f86da85744f3056e1d9c7214af752c9cf",
        "root": lamp_root.name,
        "location": list(lamp_root.location),
        "rotation_z_degrees": 110,
        "shade_direction": "left toward the chair",
        "bounds": lamp_bounds,
        "parts": len(lamp_parts),
        "light": "Office_DeskLamp_Light, 12 W warm point, parented to lamp root, not exported",
    },
    "retro_laptop": {
        "source": "retro-laptop-010",
        "root": laptop_root.name,
        "location": [round(float(value), 6) for value in laptop_root.location],
        "rotation_z_degrees": 19,
        "hinge": "RetroLaptop_Hinge, static open at -110 degrees in the office scene",
        "bounds": objects_bounds([obj for obj in laptop_imported if obj.type == "MESH"]),
        "parts": len([obj for obj in laptop_imported if obj.type == "MESH"]),
    },
    "frutiger_props": {
        "beanbag": {
            "root": beanbag_root.name,
            "location": [round(float(value), 6) for value in beanbag_root.location],
            "rotation_z_degrees": 12,
            "bounds": objects_bounds([obj for obj in beanbag_imported if obj.type == "MESH"]),
        },
        "plant": {
            "root": plant_root.name,
            "location": [round(float(value), 6) for value in plant_root.location],
            "rotation_z_degrees": 30,
            "bounds": objects_bounds([obj for obj in plant_imported if obj.type == "MESH"]),
        },
        "mouse": {
            "root": mouse_root.name,
            "location": [round(float(value), 6) for value in mouse_root.location],
            "rotation_z_degrees": -25,
            "bounds": objects_bounds([obj for obj in mouse_imported if obj.type == "MESH"]),
        },
    },
    "materials_manifest": str(Path(args.materials_json).resolve()),
    "mesh_objects": len(mesh_objects),
    "materials": sorted({material.name for obj in mesh_objects for material in obj.data.materials if material}),
    "images": sorted({node.image.name for material in bpy.data.materials if material.use_nodes for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image}),
    "source_objects": len(selected),
}
report_path.write_text(json.dumps(report, indent=2) + "\n")
print("PHASE7_OFFICE_BUILT " + json.dumps({key: report[key] for key in ("glb_bytes", "mesh_objects", "glb_sha256")}))
