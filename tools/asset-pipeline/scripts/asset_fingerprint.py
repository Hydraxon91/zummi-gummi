"""Deterministic source fingerprints for review and stage approval.

The fingerprint covers the source state that a shape review depends on. It is
not a file hash and cannot prove reference fidelity. External linked files,
image byte contents, drivers and render-only state are outside its coverage.
"""

import hashlib
import json


def _round(value):
    return round(float(value), 6)


def _plain(value):
    if isinstance(value, (str, int, bool)) or value is None:
        return value
    if isinstance(value, float):
        return _round(value)
    try:
        return [_round(item) for item in value]
    except (TypeError, ValueError):
        return repr(value)


def _hash_image(image, digest):
    digest.update(f"image:{image.name};".encode())
    digest.update(f"size:{tuple(image.size)};".encode())
    digest.update(f"colorspace:{image.colorspace_settings.name};".encode())
    digest.update(f"filepath:{image.filepath};".encode())
    packed = image.packed_file
    digest.update(f"packed:{bool(packed)}:{packed.size if packed else 0};".encode())


def _hash_material(material, digest):
    digest.update(f"material:{material.name};".encode())
    digest.update(f"use_nodes:{bool(material.use_nodes)};".encode())
    if not material.use_nodes:
        digest.update(f"diffuse:{_plain(material.diffuse_color)};".encode())
        digest.update(f"metallic:{material.metallic:.6f};roughness:{material.roughness:.6f};".encode())
        return
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for node in sorted(nodes, key=lambda item: item.name):
        digest.update(f"node:{node.name}:{node.bl_idname}:{node.label};".encode())
        if getattr(node, "image", None) is not None:
            _hash_image(node.image, digest)
        for socket in node.inputs:
            if socket.is_linked:
                continue
            if hasattr(socket, "default_value"):
                try:
                    digest.update(
                        f"input:{socket.name}:{json.dumps(_plain(socket.default_value), sort_keys=True)};".encode())
                except (TypeError, ValueError):
                    digest.update(f"input:{socket.name}:{socket.default_value!r};".encode())
    for link in sorted(links, key=lambda item: (item.from_node.name, item.from_socket.name,
                                                item.to_node.name, item.to_socket.name)):
        digest.update(
            f"link:{link.from_node.name}:{link.from_socket.name}->"
            f"{link.to_node.name}:{link.to_socket.name};".encode())


def _hash_mesh(mesh, digest):
    digest.update(f"mesh:{mesh.name}:{len(mesh.vertices)}:{len(mesh.polygons)}:{mesh.users};".encode())
    for vertex in mesh.vertices:
        digest.update(("%.6f,%.6f,%.6f;" % tuple(vertex.co)).encode())
    for polygon in mesh.polygons:
        digest.update((":".join(str(index) for index in polygon.vertices) + ";").encode())
    for layer in mesh.uv_layers:
        digest.update(f"uv:{layer.name}:{layer.active_render};".encode())
        for loop_index in range(len(mesh.loops)):
            uv = layer.data[loop_index].uv
            digest.update(("%.6f,%.6f;" % (uv[0], uv[1])).encode())
    for group in mesh.vertices:
        for membership in group.groups:
            digest.update(f"weight:{membership.group}:{membership.weight:.6f};".encode())
    if mesh.shape_keys:
        for key_block in mesh.shape_keys.key_blocks:
            digest.update(f"shapekey:{key_block.name}:{key_block.value:.6f};".encode())
            for point in key_block.data:
                digest.update(("%.6f,%.6f,%.6f;" % tuple(point.co)).encode())


def _hash_dependency(obj, digest):
    """Hash an operand/target that changes an evaluated result."""
    if obj is None:
        return
    digest.update(f"dependency:{obj.name}:{obj.type};".encode())
    for row in obj.matrix_world:
        digest.update(("%.6f,%.6f,%.6f,%.6f;" % tuple(row)).encode())
    if obj.type == "MESH" and obj.data:
        digest.update(f"dependency_mesh:{len(obj.data.vertices)}:{len(obj.data.polygons)};".encode())
        for vertex in obj.data.vertices:
            digest.update(("%.6f,%.6f,%.6f;" % tuple(vertex.co)).encode())
        for polygon in obj.data.polygons:
            digest.update((":".join(str(index) for index in polygon.vertices) + ";").encode())


def fingerprint_objects(objects):
    """SHA-256 of targets' transforms, geometry, UVs, materials and dependencies."""
    digest = hashlib.sha256()
    for obj in sorted(objects, key=lambda item: item.name):
        digest.update(f"object:{obj.name}:{obj.type};".encode())
        digest.update(f"data:{obj.data.name if obj.data else ''};".encode())
        digest.update(f"parent:{(obj.parent.name if obj.parent else '')};".encode())
        digest.update(f"collections:{sorted(c.name for c in obj.users_collection)};".encode())
        for row in obj.matrix_world:
            digest.update(("%.6f,%.6f,%.6f,%.6f;" % tuple(row)).encode())
        for row in obj.matrix_parent_inverse:
            digest.update(("%.6f,%.6f,%.6f,%.6f;" % tuple(row)).encode())
        digest.update(f"rotation_mode:{obj.rotation_mode};".encode())
        digest.update(f"hide_render:{bool(obj.hide_render)};hide_viewport:{bool(obj.hide_viewport)};".encode())
        for slot in obj.material_slots:
            digest.update(f"slot:{slot.link}:{(slot.material.name if slot.material else '')};".encode())
            if slot.material:
                _hash_material(slot.material, digest)
        for constraint in sorted(obj.constraints, key=lambda item: item.name):
            digest.update(f"constraint:{constraint.name}:{constraint.type};".encode())
            target = getattr(constraint, "target", None)
            if target is not None and hasattr(target, "type"):
                _hash_dependency(target, digest)
            for attribute in ("target", "subtarget", "influence", "track_axis", "up_axis",
                              "use_x", "use_y", "use_z", "owner_space", "target_space"):
                if hasattr(constraint, attribute):
                    value = getattr(constraint, attribute)
                    if hasattr(value, "name"):
                        value = value.name
                    digest.update(f"{attribute}:{value};".encode())
        if obj.type == "MESH" and obj.data:
            _hash_mesh(obj.data, digest)
        for modifier in sorted(obj.modifiers, key=lambda item: item.name):
            digest.update(
                f"modifier:{modifier.name}:{modifier.type}:{modifier.show_viewport}:"
                f"{modifier.show_render};".encode())
            for attribute in ("width", "segments", "levels", "render_levels", "thickness",
                              "offset", "factor", "strength"):
                if hasattr(modifier, attribute):
                    try:
                        digest.update(f"{attribute}:{getattr(modifier, attribute):.6f};".encode())
                    except (TypeError, ValueError):
                        pass
            for attribute in ("object", "mirror_object", "target"):
                dependency = getattr(modifier, attribute, None)
                if dependency is not None and hasattr(dependency, "type"):
                    _hash_dependency(dependency, digest)
        for key, value in sorted(obj.items(), key=lambda item: item[0]):
            try:
                digest.update(f"prop:{key}:{json.dumps(value, sort_keys=True)};".encode())
            except (TypeError, ValueError):
                digest.update(f"prop:{key}:{value!r};".encode())
    return digest.hexdigest()
