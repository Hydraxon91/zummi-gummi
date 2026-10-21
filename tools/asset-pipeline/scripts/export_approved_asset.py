"""Export a Blender asset only with a matching recorded shape approval.

Run against a saved source:
  blender --background asset.blend --python export_approved_asset.py -- \
    --root Asset_Root --glb out/asset.glb --report out/export.json \
    --approval .dev-shots/review/silhouette-approval.json

The approval is revalidated against the current source fingerprint and its
review manifest/capture hashes before any GLB is written.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from asset_fingerprint import fingerprint_objects
from asset_identity import object_ids
from check_shape_gate import check_approval
from construction_gate import run as run_construction
from check_evidence import validate_evidence_report


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True,
                        help="Comma-separated root object names")
    parser.add_argument("--glb", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--approval", required=True)
    parser.add_argument("--construction-brief", required=True,
                        help="Construction-method brief JSON")
    parser.add_argument("--candidate-ledger", required=True,
                        help="Candidate-ledger JSON")
    parser.add_argument("--evidence-report", required=True,
                        help="Pose/freshness evidence JSON")
    parser.add_argument("--stage", choices=("detail", "delivery"), default="detail")
    parser.add_argument("--required-views", default="front,side,top,three_quarter")
    parser.add_argument("--animations", action="store_true")
    return parser.parse_args(
        sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    args = parse_args()
    glb_path = Path(args.glb)
    report_path = Path(args.report)
    for path in (glb_path, report_path):
        if path.exists():
            raise FileExistsError(f"Refusing to overwrite {path}")
    if not bpy.data.filepath:
        raise RuntimeError("Open the saved source .blend before exporting")

    scene = bpy.context.scene
    roots = []
    for name in (value.strip() for value in args.root.split(",") if value.strip()):
        root = bpy.data.objects.get(name)
        if root is None:
            raise RuntimeError(f"Missing root object {name}")
        roots.append(root)
    meshes = []
    for root in roots:
        for obj in [root, *root.children_recursive]:
            if obj.type == "MESH" and obj not in meshes:
                meshes.append(obj)
    if not meshes:
        raise RuntimeError("No meshes under the selected roots")

    names = sorted(obj.name for obj in meshes)
    fingerprint = fingerprint_objects(meshes)
    required_views = [value.strip() for value in args.required_views.split(",") if value.strip()]
    errors = []
    ids_by_name = object_ids(meshes, errors)
    expected_ids = [ids_by_name[name] for name in names if ids_by_name.get(name)]
    approval = check_approval(
        args.approval, fingerprint, names, args.stage, errors, required_views)
    construction = run_construction(
        args.construction_brief, args.candidate_ledger, args.evidence_report,
        bpy.data.filepath, expected_ids)
    errors.extend(f"construction gate: {error}" for error in construction["errors"])
    evidence_recheck = validate_evidence_report(
        args.evidence_report, errors, names, expected_ids)
    if errors:
        print("EXPORT_APPROVED_ASSET blocked " + json.dumps({
            "approval": approval,
            "construction": construction,
            "evidence_recheck": evidence_recheck,
            "errors": errors,
            "fingerprint": fingerprint,
        }))
        raise SystemExit(1)

    bpy.ops.object.select_all(action="DESELECT")
    for root in roots:
        root.select_set(True)
        for obj in root.children_recursive:
            if obj.type in {"MESH", "EMPTY"}:
                obj.select_set(True)
    scene.view_layers[0].objects.active = roots[0]
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
        export_animations=args.animations,
    )

    report = {
        "source": bpy.data.filepath,
        "source_sha256": sha256_file(bpy.data.filepath),
        "glb": str(glb_path),
        "glb_sha256": sha256_file(glb_path),
        "glb_bytes": glb_path.stat().st_size,
        "roots": [root.name for root in roots],
        "targets": names,
        "fingerprint": fingerprint,
        "stage": args.stage,
        "approval": approval,
        "construction": construction,
        "evidence_recheck": evidence_recheck,
        "animations": args.animations,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("EXPORT_APPROVED_ASSET " + json.dumps({
        "glb": str(glb_path),
        "bytes": report["glb_bytes"],
        "sha256": report["glb_sha256"],
        "targets": len(names),
    }))


if __name__ == "__main__":
    main()
