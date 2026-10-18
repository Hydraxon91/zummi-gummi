"""Standard-library GLB 2 inventory; NOT a replacement for Khronos validation."""
import argparse
import json
from pathlib import Path
import struct


def inspect_bytes(data):
    if len(data) < 20:
        raise ValueError('Truncated GLB header/chunk')
    magic, version, length = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or length != len(data):
        raise ValueError('Expected GLB 2 with exact declared file length')
    chunks = []
    offset = 12
    while offset < length:
        if offset + 8 > length:
            raise ValueError('Truncated chunk header')
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if size % 4 or offset + size > length:
            raise ValueError('Invalid chunk alignment/length')
        chunks.append((kind, data[offset:offset + size]))
        offset += size
    if not chunks or chunks[0][0] != 0x4E4F534A:
        raise ValueError('First chunk must be JSON')
    if sum(kind == 0x4E4F534A for kind, _ in chunks) != 1:
        raise ValueError('Expected exactly one JSON chunk')
    doc = json.loads(chunks[0][1].decode('utf-8'))
    if doc.get('asset', {}).get('version') != '2.0':
        raise ValueError('Expected glTF asset version 2.0')
    accessors = doc.get('accessors', [])

    def count(index):
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(accessors):
            raise ValueError('Invalid accessor index')
        value = accessors[index].get('count')
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise ValueError('Invalid accessor count')
        return value

    meshes = []
    unverified = ['Accessor/buffer contents, transforms, materials and full glTF schema validation']
    for index, mesh in enumerate(doc.get('meshes', [])):
        primitives = []
        for primitive in mesh.get('primitives', []):
            extensions = sorted(primitive.get('extensions', {}))
            if extensions:
                unverified.append(f'Mesh {index}: primitive extension decoding/support {extensions}')
            position = primitive.get('attributes', {}).get('POSITION')
            vertices = count(position) if position is not None else None
            mode = primitive.get('mode', 4)  # glTF TRIANGLES
            elements = count(primitive['indices']) if 'indices' in primitive else vertices
            triangles = None
            if mode == 4 and elements is not None:
                if elements % 3:
                    raise ValueError('TRIANGLES element count is not divisible by three')
                triangles = elements // 3
            if triangles is None:
                unverified.append(f'Mesh {index}: triangle count unavailable (mode {mode} or missing accessor)')
            primitives.append({'vertices': vertices, 'triangles': triangles,
                               'mode': mode, 'material': primitive.get('material'),
                               'extensions': extensions})
        meshes.append({'name': mesh.get('name', str(index)), 'primitives': primitives})

    def total(primitives, key):
        values = [p[key] for p in primitives]
        return sum(values) if all(v is not None for v in values) else None

    unique = [p for mesh in meshes for p in mesh['primitives']]
    instances = []
    for node in doc.get('nodes', []):
        if 'mesh' in node:
            index = node['mesh']
            if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(meshes):
                raise ValueError('Invalid node mesh index')
            instances.extend(meshes[index]['primitives'])
            if 'EXT_mesh_gpu_instancing' in node.get('extensions', {}):
                unverified.append('GPU instance multiplicity is not included in node-instance totals')
    return {
        'bytes': len(data), 'meshes': meshes,
        'unique_mesh_primitive_vertices': total(unique, 'vertices'),
        'unique_mesh_primitive_triangles': total(unique, 'triangles'),
        'all_node_instance_vertices': total(instances, 'vertices'),
        'all_node_instance_triangles': total(instances, 'triangles'),
        'material_count': len(doc.get('materials', [])),
        'image_count': len(doc.get('images', [])),
        'animation_count': len(doc.get('animations', [])),
        'skin_count': len(doc.get('skins', [])),
        'extensions_used': doc.get('extensionsUsed', []),
        'extensions_required': doc.get('extensionsRequired', []),
        'external_uris': [entry['uri'] for key in ('buffers', 'images')
                          for entry in doc.get(key, []) if 'uri' in entry and
                          not entry['uri'].startswith('data:')],
        'unverified': unverified,
        'note': 'Counts use accessor metadata, not decoded geometry; all nodes, not just active scene. '
                'Compression and extension support need runtime review. No validation pass is claimed.',
    }


def run(path):
    return inspect_bytes(Path(path).read_bytes())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path')
    print(json.dumps(run(parser.parse_args().path), indent=2))
