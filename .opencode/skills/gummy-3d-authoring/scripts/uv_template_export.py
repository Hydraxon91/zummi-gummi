"""Export versioned UV boundary template + albedo overlay from a disposable Blender.

Run only with an explicitly approved source, target and unused output prefix.
No UVs, geometry, materials, existing files or .blend checkpoints are modified.
"""
import argparse
from collections import defaultdict
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import zlib

import bpy
import numpy as np


def load_png_helper():
    spec = importlib.util.spec_from_file_location('authoring_png_report', Path(__file__).with_name('png_report.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def snapshot(mesh, uv_name):
    layer = mesh.uv_layers[uv_name]
    return {'faces': [list(p.vertices) for p in mesh.polygons],
            'uv': [[float(layer.data[i].uv.x), float(layer.data[i].uv.y)]
                   for p in mesh.polygons for i in p.loop_indices]}


def digest(data):
    return hashlib.sha256(json.dumps(data, separators=(',', ':')).encode()).hexdigest()


def write_png(path, pixels):
    height, width, channels = pixels.shape
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    header = struct.pack('>IIBBBBB', width, height, 8, {3: 2, 4: 6}[channels], 0, 0, 0)
    scanlines = b''.join(b'\0' + row.tobytes() for row in pixels)
    payload = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) +
               chunk(b'IDAT', zlib.compress(scanlines)) + chunk(b'IEND', b''))
    with path.open('xb') as handle:
        handle.write(payload)


def export(object_name, uv_name, albedo_path, prefix):
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Use a disposable background Blender with an approved saved source')
    ob = bpy.data.objects[object_name]
    if ob.type != 'MESH':
        raise ValueError('Mesh required')
    prefix = Path(prefix)
    paths = {key: prefix.with_name(prefix.name + suffix) for key, suffix in
             [('template', '_template.png'), ('layer', '_layer.png'), ('overlay', '_overlay.png'), ('manifest', '_manifest.json')]}
    if any(p.exists() for p in paths.values()) or not prefix.parent.is_dir():
        raise ValueError('Output directory must exist and all output names must be unused')
    png = load_png_helper()
    albedo_path = Path(albedo_path)
    albedo_bytes = albedo_path.read_bytes()
    width, height, channels, rows = png.decode(albedo_bytes)
    if channels not in (3, 4):
        raise ValueError('RGB/RGBA albedo required')
    base = np.frombuffer(b''.join(rows), dtype=np.uint8).reshape(height, width, channels)[:, :, :3].copy()
    mesh = ob.data
    before = snapshot(mesh, uv_name)
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    evaluated_mesh = evaluated.to_mesh()
    try:
        if digest(snapshot(evaluated_mesh, uv_name)) != digest(before):
            raise ValueError('Evaluated topology/UV differs; choose the intended source explicitly')
    finally:
        evaluated.to_mesh_clear()
    layer = mesh.uv_layers[uv_name]
    edges = defaultdict(list)
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for i, li in enumerate(loops):
            lj = loops[(i + 1) % len(loops)]
            a, b = tuple(layer.data[li].uv), tuple(layer.data[lj].uv)
            if not all(0 <= v <= 1 for v in (*a, *b)):
                raise ValueError('UV outside 0–1; atlas assumptions not satisfied')
            key = (mesh.loops[li].edge_index, tuple(sorted((a, b))))
            edges[key].append(polygon.index)
    parent = list(range(len(mesh.polygons)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for users in edges.values():
        for i in users[1:]:
            parent[find(i)] = find(users[0])
    islands = defaultdict(list)
    for p in mesh.polygons:
        islands[find(p.index)].append(p.index)
    boundary = np.zeros((height, width), dtype=bool)
    all_edges = np.zeros_like(boundary)
    for (_, (a, b)), users in edges.items():
        x0, y0 = a[0] * (width - 1), (1 - a[1]) * (height - 1)
        x1, y1 = b[0] * (width - 1), (1 - b[1]) * (height - 1)
        count = max(2, int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1)
        xs = np.rint(np.linspace(x0, x1, count)).astype(int)
        ys = np.rint(np.linspace(y0, y1, count)).astype(int)
        all_edges[ys, xs] = True
        if len(users) == 1:
            boundary[ys, xs] = True
    template = np.full((height, width, 3), 255, dtype=np.uint8)
    template[boundary] = (0, 0, 0)
    layer_pixels = np.zeros((height, width, 4), dtype=np.uint8)
    layer_pixels[boundary] = (255, 40, 200, 255)
    overlay = base.copy()
    overlay[all_edges] = ((overlay[all_edges].astype(np.uint16) + 180) // 2).astype(np.uint8)
    overlay[boundary] = (255, 40, 200)
    write_png(paths['template'], template)
    write_png(paths['layer'], layer_pixels)
    write_png(paths['overlay'], overlay)
    # Decode saved bytes, not an in-memory buffer. Verify exact pixels and orientation.
    for key, expected in [('template', template), ('layer', layer_pixels), ('overlay', overlay)]:
        w, h, c, saved = png.decode(paths[key].read_bytes())
        actual = np.frombuffer(b''.join(saved), dtype=np.uint8).reshape(h, w, c)
        if not np.array_equal(actual, expected):
            raise AssertionError('Saved pixels differ: ' + key)
    assert digest(snapshot(mesh, uv_name)) == digest(before)
    manifest = {'source_blend': bpy.data.filepath, 'object': ob.name, 'uv_map': uv_name,
                'topology_uv_sha256': digest(before), 'source_blend_sha256': hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
                'albedo': str(albedo_path), 'albedo_sha256': hashlib.sha256(albedo_bytes).hexdigest(),
                'resolution': [width, height], 'faces': len(mesh.polygons), 'islands': len(islands),
                'coordinates': 'top-left image origin, x=U*(width-1), y=(1-V)*(height-1)',
                'template': 'opaque white background, black island boundaries; no interior topology lines',
                'layer': 'transparent background, magenta island boundaries for layering over paint',
                'overlay': 'unaltered albedo except faint interior edges and magenta island boundaries',
                'island_faces': list(islands.values()),
                'output_sha256': {k: hashlib.sha256(p.read_bytes()).hexdigest() for k, p in paths.items() if k != 'manifest'},
                'verified': ['source/evaluated topology+UV equality', 'saved PNG CRC and exact pixel round trip', 'source UV unchanged'],
                'unverified': ['semantic panel labels, texture padding, overlap, source bake correctness']}
    with paths['manifest'].open('x') as handle:
        json.dump(manifest, handle, indent=2)
    print('UV_TEMPLATE_EXPORT_PASS', {k: str(p) for k, p in paths.items()}, 'islands', len(islands))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv', required=True)
    parser.add_argument('--albedo', required=True)
    parser.add_argument('--prefix', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    export(args.object, args.uv, args.albedo, args.prefix)
