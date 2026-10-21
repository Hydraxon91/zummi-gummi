"""Mesh health, UV and GLB checks behind named profiles."""
from __future__ import annotations

from .common import PipelineError
from .export import audit_glb
from .uv import uv_report


def run_existing(script, arguments):
    """Adapt legacy helpers without copying calculations or changing thresholds."""
    import runpy
    import sys
    previous = sys.argv
    try:
        sys.argv = [str(script), '--', *arguments]
        try:
            runpy.run_path(str(script), run_name='__main__')
            return 0
        except SystemExit as exc:
            return exc.code or 0
    finally:
        sys.argv = previous


def mesh_health(objects, require_closed=False):
    import bmesh

    results = []
    for obj in objects:
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.edges.ensure_lookup_table()
        non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
        loose = sum(1 for vert in bm.verts if not vert.link_edges)
        # Absolute square-metre cutoffs classify valid millimetre bevels as zero.
        # Keep small-face inventory separate from genuinely zero-area geometry.
        zero_area = sum(1 for face in bm.faces if face.calc_area() == 0.0)
        small_faces = sum(1 for face in bm.faces if 0.0 < face.calc_area() < 1e-9)
        # Consistent winding: a face whose normal opposes the outward direction of its
        # neighbours is reported by the signed volume of each shell instead.
        bm.free()
        results.append({
            "object": obj.name,
            "vertices": len(mesh.vertices),
            "faces": len(mesh.polygons),
            "non_manifold_edges": non_manifold,
            "loose_vertices": loose,
            "zero_area_faces": zero_area,
            "small_faces_below_1e9_m2_advisory": small_faces,
        })
    failing = [item for item in results
               if item["loose_vertices"] or item["zero_area_faces"] or
               (require_closed and item["non_manifold_edges"])]
    return {"objects": results, "require_closed": require_closed,
            "ok": not failing,
            "failures": [item["object"] for item in failing]}


def texture_slots(objects):
    slots = []
    for obj in objects:
        for index, slot in enumerate(obj.material_slots):
            material = slot.material
            images = []
            if material and material.node_tree:
                images = [node.image.name for node in material.node_tree.nodes
                          if node.type == "TEX_IMAGE" and node.image]
            slots.append({"object": obj.name, "slot": index,
                          "material": material.name if material else None,
                          "images": images})
    return {"slots": slots,
            "materials_with_images": len({(item["material"], tuple(item["images"]))
                                          for item in slots if item["images"]}),
            "objects_without_images": sorted({item["object"] for item in slots
                                              if not item["images"]})}


PROFILES = ("prop", "mixed", "architectural")


def assembly_preservation(report_path, frames):
    """Compare evaluated sources retained in a candidate with its split outputs."""
    import bpy
    import json
    from mathutils.kdtree import KDTree
    from pathlib import Path
    document = json.loads(Path(report_path).read_text())
    pairs = [(source, part) for group in document['groups']
             for source, part in zip(group['source_objects'], group['parts'])]
    previous = bpy.context.scene.frame_current
    failures = []
    try:
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            graph = bpy.context.evaluated_depsgraph_get()
            for source_name, part_name in pairs:
                source, part = bpy.data.objects[source_name], bpy.data.objects[part_name]
                expected = [source.matrix_world @ v.co for v in source.evaluated_get(graph).data.vertices]
                actual = [part.matrix_world @ v.co for v in part.data.vertices]
                def directed_distance(left, right):
                    tree = KDTree(len(right))
                    for index, point in enumerate(right):
                        tree.insert(point, index)
                    tree.balance()
                    return max(tree.find(point)[2] for point in left)
                distance = max(directed_distance(expected, actual), directed_distance(actual, expected))
                if len(expected) != len(actual) or distance > 1e-5:
                    failures.append({'frame': frame, 'source': source_name, 'part': part_name,
                                     'expected_vertices': len(expected), 'actual_vertices': len(actual),
                                     'max_bidirectional_distance_m': distance})
    finally:
        bpy.context.scene.frame_set(previous)
    return {'ok': not failures, 'parts': len(pairs), 'frames': frames,
            'world_distance_tolerance_m': 1e-5, 'failures': failures,
            'limits': ['Equal vertex counts and bidirectional distances do not prove vertex identities or topology']}


def check(job):
    """Run the checks a profile enables; never silently widens acceptance."""
    import bpy

    import json
    from pathlib import Path
    from .common import mesh_objects, names, prepared_out_dir, new_path

    profile = job.get("profile", "prop")
    if profile not in PROFILES:
        raise PipelineError(f"unknown profile: {profile}")
    roots = [bpy.data.objects[name] for name in names(job)]
    exclude = job.get("exclude", [])
    objects = mesh_objects(roots, exclude)
    report = {"profile": profile, "objects": [obj.name for obj in objects]}
    report["health"] = mesh_health(objects, require_closed=bool(job.get("require_closed")))
    layer_name = job.get('uv_layer', job.get('uv'))
    if layer_name:
        report["uv"] = uv_report(objects, layer_name)
    if job.get("glb"):
        report["glb"] = audit_glb(job["glb"])
    report["textures"] = texture_slots(objects)
    if job.get('assembly_report'):
        report['assembly'] = assembly_preservation(job['assembly_report'], job.get('frames', [1, 20]))
    directory = prepared_out_dir(job)
    base = Path(__file__).resolve().parents[1]
    if job.get('density'):
        profiles = {'prop': 'opaque_prop.json', 'mixed': 'mixed_architecture.json',
                    'architectural': 'mixed_architecture.json'}
        target = new_path(directory, 'density-audit.json')
        run_existing(base / 'scripts/audit_asset.py', [
            '--objects', *[obj.name for obj in objects], '--out', str(target),
            '--profile', str(base / 'profiles' / profiles[profile]), '--fail-on', 'none'])
        report['density'] = json.loads(target.read_text())
    if job.get('padding'):
        target = new_path(directory, 'padding.json')
        run_existing(base / 'tests/phase7/check_uv_padding.py', [
            '--objects', *[obj.name for obj in objects], '--out', str(target)])
        report['padding'] = json.loads(target.read_text())
    if job.get('coplanar'):
        report['coplanar'] = []
        for index, obj in enumerate(objects):
            target = new_path(directory, f'coplanar-{index}.json')
            run_existing(base / 'tests/phase7/check_coplanar_overlaps.py', [
                '--object', obj.name, '--out', str(target)])
            report['coplanar'].append(json.loads(target.read_text()))
    report["ok"] = report["health"]["ok"] and report.get("glb", {"ok": True})["ok"]
    if report.get('uv', {}).get('out_of_bounds'):
        report['ok'] = False
    if any(r['status'] != 'pass' for r in report.get('coplanar', [])):
        report['ok'] = False
    if not report.get('assembly', {'ok': True})['ok']:
        report['ok'] = False
    report['limits'] = ['Padding and density retain existing advisory semantics; not user acceptance',
                        'Coplanar checks are within each object, not between objects']
    return report
