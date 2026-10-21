"""GLB export and structural audits that catch what Blender silently renders."""
from __future__ import annotations

import json
import struct
from pathlib import Path

from .common import PipelineError, sha256_file


def export_glb(objects, path, apply_modifiers=True, gate=None, tangents=False):
    import runpy
    import sys

    path = Path(path)
    if path.exists():
        raise PipelineError(f"refusing to overwrite {path}")
    required = ('approval', 'construction_brief', 'candidate_ledger', 'evidence_report')
    if not isinstance(gate, dict) or any(not gate.get(key) for key in required):
        raise PipelineError('Export requires approval, construction_brief, candidate_ledger and evidence_report; prototype cannot bypass export_approved_asset.py')
    script = Path(__file__).resolve().parents[1] / 'scripts/export_approved_asset.py'
    arguments = [str(script), '--', '--root', ','.join(obj.name for obj in objects),
                 '--glb', str(path), '--report', str(path.with_suffix('.approval.json'))]
    if tangents:
        arguments.append('--tangents')
    for key in required:
        arguments.extend(('--' + key.replace('_', '-'), str(gate[key])))
    previous = sys.argv
    try:
        sys.argv = arguments
        runpy.run_path(str(script), run_name='__main__')
    finally:
        sys.argv = previous
    return {"path": str(path), "bytes": path.stat().st_size,
            "sha256": sha256_file(path), "objects": len(objects)}


def read_glb_json(path):
    data = Path(path).read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise PipelineError(f"not a GLB: {path}")
    version, total = struct.unpack_from('<II', data, 4)
    if version != 2 or total != len(data):
        raise PipelineError('Invalid GLB version or declared length')
    offset = 12
    document = None
    while offset < len(data):
        if offset + 8 > len(data):
            raise PipelineError('Truncated GLB chunk header')
        length, kind = struct.unpack_from("<II", data, offset)
        if length % 4 or offset + 8 + length > len(data):
            raise PipelineError('Invalid or truncated GLB chunk')
        chunk = data[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        offset += 8 + length + ((4 - length % 4) % 4 if length % 4 else 0)
    if document is None:
        raise PipelineError(f"GLB has no JSON chunk: {path}")
    return document


def audit_glb(path):
    """Structural audit: texture UV bindings, missing UVs, unused images.

    A material whose base colour points at an image, on a primitive with no
    TEXCOORD_0, renders black in most viewers. A texCoord of -1 is invalid glTF.
    """
    document = read_glb_json(path)
    images = document.get("images", [])
    materials = document.get("materials", [])
    meshes = document.get("meshes", [])
    textures = document.get("textures", [])

    def texture_image(texture_info):
        index = texture_info.get("index")
        if index is None or index >= len(textures):
            return None
        source = textures[index].get("source")
        return images[source] if source is not None and source < len(images) else None

    issues = {"invalid_texcoord": [], "texture_without_uv": [], "unused_images": []}
    textured_materials = {}
    for material_index, material in enumerate(materials):
        pbr = material.get("pbrMetallicRoughness", {})
        bindings = []
        if "baseColorTexture" in pbr:
            bindings.append(pbr["baseColorTexture"])
        if "metallicRoughnessTexture" in pbr:
            bindings.append(pbr["metallicRoughnessTexture"])
        for extra in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            if extra in material:
                bindings.append(material[extra])
        coordinates = set()
        for binding in bindings:
            coordinate = binding.get('extensions', {}).get('KHR_texture_transform', {}).get(
                'texCoord', binding.get('texCoord', 0))
            if not isinstance(coordinate, int) or coordinate < 0:
                issues["invalid_texcoord"].append(
                    {"material": material.get("name"), "texCoord": coordinate})
            else:
                coordinates.add(coordinate)
        if bindings:
            textured_materials[material_index] = coordinates

    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            material_index = primitive.get("material")
            name = materials[material_index].get('name', f'material_{material_index}') if material_index is not None else None
            for coordinate in textured_materials.get(material_index, []):
                if f'TEXCOORD_{coordinate}' not in primitive.get('attributes', {}):
                    issues['texture_without_uv'].append({'mesh': mesh.get('name'),
                                                        'material': name, 'texCoord': coordinate})

    used = {texture.get("source") for texture in textures}
    for index, image in enumerate(images):
        if index not in used:
            issues["unused_images"].append(image.get("name", f"image_{index}"))

    for key in ("invalid_texcoord", "texture_without_uv"):
        issues[key] = issues[key][:20]
    return {
        "path": str(path),
        "bytes": Path(path).stat().st_size,
        "sha256": sha256_file(path),
        "meshes": len(meshes),
        "primitives": sum(len(mesh.get("primitives", [])) for mesh in meshes),
        "materials": len(materials),
        "images": len(images),
        "textures": len(textures),
        "material_images": {
            material.get("name"): (texture_image(material["pbrMetallicRoughness"]["baseColorTexture"]).get("name")
                                   if "baseColorTexture" in material.get("pbrMetallicRoughness", {}) else None)
            for material in materials},
        "issues": issues,
        "ok": not issues["invalid_texcoord"] and not issues["texture_without_uv"],
    }
