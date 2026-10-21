"""Single entry point for asset preparation.

    python3 tools/asset-pipeline/pipeline.py <verb> --job jobs/<name>.job.json

Verbs: inspect, uv, bake, check, render, export, verify.
Jobs are JSON; the code path is shared, so an asset variant is data, not a new script.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline.common import (  # noqa: E402
    PipelineError,
    blender_objects,
    load_job,
    mesh_objects,
    names,
    new_path,
    prepared_out_dir,
    sha256_file,
    stamped,
    world_bounds,
    write_json,
)


def report_path(args, out_dir, default):
    return Path(args.report) if args.report else out_dir / default


def verb_inspect(job, args):
    import bpy

    roots = blender_objects(names(job))
    exclude = job.get("exclude", [])
    objects = mesh_objects(roots, exclude)
    out_dir = prepared_out_dir(job)
    report = stamped({
        "verb": "inspect",
        "source": bpy.data.filepath,
        "source_sha256": sha256_file(bpy.data.filepath) if bpy.data.filepath else None,
        "objects": [obj.name for obj in objects],
        "bounds": world_bounds(objects),
        "uv_layers": {obj.name: [layer.name for layer in obj.data.uv_layers] for obj in objects},
        "materials": sorted({slot.material.name for obj in objects
                             for slot in obj.material_slots if slot.material}),
    })
    write_json(report_path(args, out_dir, "inspect.json"), report)
    print("PIPELINE", json.dumps({"verb": "inspect", "objects": len(objects)}))
    return 0


def verb_uv(job, args):
    import bpy
    from pipeline import uv as uv_module

    roots = blender_objects(names(job))
    objects = mesh_objects(roots, job.get("exclude", []))
    out_dir = prepared_out_dir(job)
    layer = job.get("uv_layer", "AtlasUV")
    if job.get("unwrap"):
        for obj in objects:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            if obj.data.uv_layers.get(layer) is None:
                obj.data.uv_layers.new(name=layer)
            obj.data.uv_layers.active = obj.data.uv_layers[layer]
            obj.data.uv_layers[layer].active_render = True
            uv_module.smart_unwrap(obj, margin=job.get("unwrap_margin", 0.02))
    report = stamped({"verb": "uv", "report": uv_module.uv_report(objects, layer)})
    write_json(report_path(args, out_dir, "uv.json"), report)
    print("PIPELINE", json.dumps({"verb": "uv", "ok": not report["report"]["out_of_bounds"]}))
    return 0 if not report["report"]["out_of_bounds"] else 1


def verb_bake(job, args):
    import bpy
    from pipeline import bake as bake_module, export as export_module

    roots = blender_objects(names(job))
    objects = mesh_objects(roots, job.get("exclude", []))
    source_path = bpy.data.filepath
    from pipeline.common import resolve_path
    output = resolve_path(job['out_dir'])
    if output.exists():
        raise PipelineError(f'Refusing to reuse bake output directory: {output}')
    out_dir = prepared_out_dir(job)
    resolution = int(job.get("resolution", 2048))
    atlas, report = bake_module.bake_atlas(
        objects, out_dir,
        resolution=resolution,
        margin=int(job.get("margin", 8)),
        samples=int(job.get("samples", 8)),
        alpha=bool(job.get("alpha", True)),
        unwrap_margin=float(job.get("unwrap_margin", 0.02)),
    )
    blend_path = new_path(out_dir, job.get("blend", "atlas_source_001.blend"))
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    # Baking produces a review candidate, never an implicit delivery export.
    glb_path = None
    export_report = None
    audit = None
    if job.get('export'):
        glb_path = new_path(out_dir, job['export'])
        export_report = export_module.export_glb(
            blender_objects(report['assembly_roots'] or report['parts']), glb_path,
            gate=job.get('gate'), tangents=bool(job.get('tangents')))
        audit = export_module.audit_glb(glb_path)

    payload = stamped({
        "verb": "bake",
        "source": source_path,
        "atlas": report,
        "export": export_report,
        "audit": audit,
        "blend": str(blend_path),
    })
    payload["ok"] = audit['ok'] if audit is not None else None
    payload['status'] = 'review_candidate' if audit is None else 'structural_check_only'
    write_json(report_path(args, out_dir, "bake-report.json"), payload)
    print("PIPELINE", json.dumps({"verb": "bake", "ok": payload["ok"],
                                  "glb": str(glb_path), "channels": sorted(report["channels"])}))
    return 0 if audit is None or payload["ok"] else 1


def verb_check(job, args):
    from pipeline import check as check_module
    report = stamped({"verb": "check", **check_module.check(job)})
    out_dir = prepared_out_dir(job) if job.get("out_dir") else Path(".")
    write_json(report_path(args, out_dir, "check.json"), report)
    print("PIPELINE", json.dumps({"verb": "check", "ok": report["ok"]}))
    return 0 if report["ok"] else 1


def verb_hybrid(job, args):
    import bpy
    from pipeline.hybrid import bake_hybrid
    from pipeline.common import resolve_path
    source = bpy.data.filepath
    output = resolve_path(job['out_dir'])
    if output.exists():
        raise PipelineError(f'Refusing to reuse hybrid output directory: {output}')
    objects = mesh_objects(blender_objects(names(job)), job.get('exclude', []))
    root, reports = bake_hybrid(objects, job, prepared_out_dir(job))
    checkpoint = new_path(output, job.get('blend', 'hybrid_review.blend'))
    bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
    write_json(output / 'hybrid-report.json', stamped({
        'status': 'review_candidate', 'source': source, 'blend': str(checkpoint),
        'root': root.name, 'groups': reports,
        'limits': ['No export or acceptance implied', 'Normals remain baked; repeated base colour and roughness preserve source sampling']}))
    print('PIPELINE', json.dumps({'verb': 'hybrid', 'status': 'review_candidate', 'blend': str(checkpoint)}))
    return 0


def verb_render(job, args):
    from pipeline import render as render_module
    roots = blender_objects(names(job))
    objects = mesh_objects(roots, job.get("exclude", []))
    out_dir = prepared_out_dir(job)
    result = render_module.capture(job, objects, out_dir / job.get('subdir', 'renders'))
    payload = stamped({"verb": "render", "views": result["views"]})
    write_json(report_path(args, out_dir, "render.json"), payload)
    print("PIPELINE", json.dumps({"verb": "render", "views": len(result["views"])}))
    return 0


def verb_export(job, args):
    from pipeline import export as export_module
    roots = blender_objects(names(job))
    objects = mesh_objects(roots, job.get("exclude", []))
    out_dir = prepared_out_dir(job)
    glb_path = new_path(out_dir, job.get("export", "export_001.glb"))
    result = export_module.export_glb(objects, glb_path, gate=job.get('gate'),
                                      tangents=bool(job.get('tangents')))
    audit = export_module.audit_glb(glb_path)
    payload = stamped({"verb": "export", "export": result, "audit": audit})
    payload["ok"] = audit["ok"]
    write_json(report_path(args, out_dir, "export-report.json"), payload)
    print("PIPELINE", json.dumps({"verb": "export", "ok": payload["ok"], "glb": str(glb_path)}))
    return 0 if payload["ok"] else 1


def verb_verify(job, args):
    from pipeline import verify as verify_module
    out_dir = prepared_out_dir(job) if job.get("out_dir") else Path(".")
    result = stamped({"verb": "verify", **verify_module.verify(job["glb"])})
    write_json(report_path(args, out_dir, "verify.json"), result)
    print("PIPELINE", json.dumps({"verb": "verify", "ok": result["ok"]}))
    return 0 if result["ok"] else 1


VERBS = {
    "inspect": verb_inspect,
    "uv": verb_uv,
    "bake": verb_bake,
    "check": verb_check,
    "render": verb_render,
    "export": verb_export,
    "verify": verb_verify,
    "hybrid": verb_hybrid,
}


def main(argv=None):
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("verb", choices=sorted(VERBS))
    parser.add_argument("--job", help="job JSON describing the operation")
    parser.add_argument("--glb", help="GLB for the verify verb")
    parser.add_argument("--report", help="override the report path")
    parser.add_argument('--blender', help='Blender executable for ordinary Python invocation')
    parser.add_argument('--dry-run', action='store_true', help='Validate only; no files or Blender process')
    args = parser.parse_args(argv)
    try:
        if args.glb:
            job = {"glb": args.glb}
        elif args.job:
            job = load_job(args.job)
        else:
            raise PipelineError("--job is required")
        if args.verb == 'verify':
            job.setdefault('out_dir', '.')
        from pipeline.job import validate
        validate(job, args.verb)
        if args.dry_run:
            print('PIPELINE_VALID', json.dumps({'verb': args.verb, 'job': args.job}))
            return 0
        import importlib.util
        if importlib.util.find_spec('bpy') is None:
            import shutil
            import subprocess
            from pipeline.common import resolve_path
            executable = args.blender or shutil.which('blender')
            if executable is None:
                installed = Path('/Applications/Blender.app/Contents/MacOS/Blender')
                if installed.is_file():
                    executable = str(installed)
            if executable is None:
                raise PipelineError('Blender not found; pass --blender')
            command = [executable, '--background']
            if job.get('source'):
                source = resolve_path(job['source'])
                if not source.is_file():
                    raise PipelineError(f'Missing source: {source}')
                command.append(str(source))
            elif args.verb == 'verify':
                command.append('--factory-startup')
            else:
                raise PipelineError('Job source is required when running outside Blender')
            command.extend(['--python-exit-code', '1', '--python', str(Path(__file__).resolve()), '--', *argv])
            return subprocess.run(command, check=False).returncode
        if args.verb == "verify":
            if not job.get("glb"):
                raise PipelineError("verify needs --glb")
            job.setdefault("out_dir", ".")
        return VERBS[args.verb](job, args)
    except PipelineError as exc:
        print(f"PIPELINE_ERROR {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
