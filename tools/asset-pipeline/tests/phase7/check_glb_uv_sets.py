"""Check material-specific UV sets and texture resolutions in a GLB."""

import argparse
import json
import struct
from pathlib import Path

parse = argparse.ArgumentParser()
parse.add_argument("--glb", required=True)
parse.add_argument("--variant", choices=("v4", "v6"), required=True)
parse.add_argument("--out", required=True)
args = parse.parse_args()


def read_glb(path):
    data = Path(path).read_bytes()
    if data[:4] != b"glTF":
        raise ValueError("not a GLB")
    offset = 12
    doc = None
    binary = None
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + size]
        offset += size
        if kind == 0x4E4F534A:
            doc = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
    return doc, binary


def image_bytes(doc, binary, index):
    image = doc["images"][index]
    view = doc["bufferViews"][image["bufferView"]]
    start = int(view.get("byteOffset", 0))
    return binary[start:start + int(view["byteLength"])]


def png_size(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack(">II", data[16:24])
    return [width, height]


doc, binary = read_glb(args.glb)
expected = {
    "Crate_Silver_Mat": {"tex_coord": 1 if args.variant == "v6" else 0,
                         "size": [512, 512]},
    "Crate_Teal_Mat": {"tex_coord": 0, "size": [1024, 1024]},
}
findings = []
materials = {}
for material in doc.get("materials", []):
    name = material.get("name")
    pbr = material.get("pbrMetallicRoughness", {})
    info = pbr.get("baseColorTexture", {})
    tex_coord = int(info.get("texCoord", 0))
    index = info.get("index")
    size = None
    if index is not None:
        texture = doc["textures"][index]
        size = png_size(image_bytes(doc, binary, texture["source"]))
    materials[name] = {"tex_coord": tex_coord, "basecolor_size": size}
    if name not in expected:
        findings.append("unexpected material %s" % name)
        continue
    if tex_coord != expected[name]["tex_coord"]:
        findings.append("%s texCoord %d != %d" % (
            name, tex_coord, expected[name]["tex_coord"]))
    if size != expected[name]["size"]:
        findings.append("%s baseColor size %s != %s" % (
            name, size, expected[name]["size"]))

primitive_attributes = []
for mesh in doc.get("meshes", []):
    for primitive in mesh.get("primitives", []):
        attributes = primitive.get("attributes", {})
        primitive_attributes.append(sorted(attributes))
        if "TEXCOORD_0" not in attributes:
            findings.append("primitive missing TEXCOORD_0")
        if args.variant == "v6" and "TEXCOORD_1" not in attributes:
            findings.append("v6 primitive missing TEXCOORD_1")

report = {
    "glb": str(Path(args.glb).resolve()),
    "variant": args.variant,
    "materials": materials,
    "primitive_attributes": primitive_attributes,
    "findings": findings,
    "status": "pass" if not findings else "fail",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE7_GLB_UV_" + report["status"].upper(),
      json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
