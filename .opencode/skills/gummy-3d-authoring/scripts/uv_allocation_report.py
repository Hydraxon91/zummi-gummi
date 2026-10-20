"""Read-only Blender UV allocation report, chart previews and pending treatment template.

Uses saved mesh data, not evaluated modifiers. Never unwraps, detaches or ignores parts.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import numpy as np


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--target-uv', required=True)
    parser.add_argument('--source-uv', default='UVMap')
    parser.add_argument('--resolution', type=int, default=4096)
    parser.add_argument('--object', action='append')
    parser.add_argument('--policy')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.out)
    if out.exists() or not bpy.app.background or not bpy.data.filepath or args.resolution < 1:
        raise ValueError('Saved background scene, positive resolution and unused output required')
    core = load('allocation_core', 'uv_allocation.py')
    uvx = load('allocation_islands', 'uv_island_export.py')
    meshes = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
    selected = sorted(args.object if args.object else meshes)
    if not selected or set(selected) - meshes.keys():
        raise ValueError('Requested mesh selection is empty or missing')
    source = Path(bpy.data.filepath)
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    report = {'schema': 1, 'source': str(source), 'source_sha256': sha,
              'resolution': args.resolution, 'target_uv': args.target_uv,
              'source_uv': args.source_uv, 'objects': {},
              'limits': ['Stored meshes only; modifiers are not evaluated',
                         'Thin/subpixel flags are risks, not measured bake failures',
                         'No overlap, padding, topology, semantic or material-transfer acceptance',
                         'Chart IDs are local to this exact fingerprint; not semantic names',
                         'No geometry separation; object-level treatment template only']}
    policy = {'schema': 1, 'source_sha256': sha, 'objects': {}}
    previews = []
    for index, name in enumerate(selected):
        ob = meshes[name]
        mesh = ob.data
        materials = [s.material.name if s.material else None for s in ob.material_slots]
        payload = {'vertices': [list(v.co) for v in mesh.vertices],
                   'polygons': [list(p.vertices) for p in mesh.polygons],
                   'face_materials': [p.material_index for p in mesh.polygons],
                   'uv': {l.name: [list(v.uv) for v in l.data] for l in mesh.uv_layers},
                   'matrix': [list(row) for row in ob.matrix_world], 'materials': materials}
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        row = {'fingerprint': fingerprint, 'materials': materials, 'preview_cell': index,
               'modifier_count': len(ob.modifiers), 'charts': [], 'flags': []}
        report['objects'][name] = row
        policy['objects'][name] = {'fingerprint': fingerprint, 'materials': materials,
                                   'treatment': 'pending', 'sheet': ''}
        if args.target_uv not in mesh.uv_layers:
            row['flags'].append('MISSING_TARGET_UV')
            previews.append([])
            continue
        layer = mesh.uv_layers[args.target_uv]
        source_layer = mesh.uv_layers.get(args.source_uv)
        if source_layer is None:
            row['flags'].append('MISSING_SOURCE_UV')
        mesh.calc_loop_triangles()
        islands = uvx.mesh_islands(mesh, layer)
        by_face = {face: i for i, faces in enumerate(islands) for face in faces}
        for i, faces in enumerate(islands):
            row['charts'].append({'id': i+1, 'faces': faces, 'triangles': 0,
                                  'subpixel_area': 0, 'thin': 0, 'zero_area': 0,
                                  'out_of_bounds': 0, 'source_resolved_target_subpixel': 0})
        edges = []
        for tri in mesh.loop_triangles:
            points = [tuple(layer.data[k].uv) for k in tri.loops]
            metrics = core.triangle_metrics(points, args.resolution)
            chart = row['charts'][by_face[tri.polygon_index]]
            chart['triangles'] += 1
            chart['subpixel_area'] += metrics['area_px'] < 1
            chart['thin'] += metrics['minimum_altitude_px'] < 1
            chart['zero_area'] += metrics['zero_area']
            chart['out_of_bounds'] += metrics['out_of_bounds']
            if source_layer:
                original = core.triangle_metrics([tuple(source_layer.data[k].uv) for k in tri.loops], args.resolution)
                chart['source_resolved_target_subpixel'] += original['area_px'] >= 1 and metrics['area_px'] < 1
            color = ((1, .1, .3, 1) if metrics['zero_area'] or metrics['out_of_bounds'] else
                     (1, .55, .08, 1) if metrics['minimum_altitude_px'] < 1 else (.25, .8, .85, 1))
            edges.append((points, color))
        previews.append(edges)
        row['totals'] = {key: sum(c[key] for c in row['charts']) for key in
                         ('triangles', 'subpixel_area', 'thin', 'zero_area', 'out_of_bounds',
                          'source_resolved_target_subpixel')}
    if args.policy:
        supplied = json.loads(Path(args.policy).read_text())
        if supplied.get('source_sha256') != sha:
            raise ValueError('Policy source file fingerprint differs')
        report['treatment_plan'] = core.validate_treatments(supplied, report['objects'])
    else:
        report['treatment_plan'] = core.validate_treatments(policy, report['objects'])
    # Overview cells are numbered by report.preview_cell; orange = thin, red = invalid,
    # cyan = no resolution flag. This is a diagnostic UV edge view, not an artist guide.
    columns, cell = 6, 160
    rows = (len(previews)+columns-1)//columns
    pixels = np.zeros((rows*cell, columns*cell, 4), dtype=np.float32)
    pixels[:] = (.025, .035, .045, 1)
    for index, triangles in enumerate(previews):
        ox, oy = index % columns * cell, (rows-1-index//columns)*cell
        for points, color in triangles:
            for a, b in zip(points, points[1:]+points[:1]):
                if not all(0 <= v <= 1 for p in (a, b) for v in p):
                    continue
                a, b = np.array(a)*(cell-12)+6, np.array(b)*(cell-12)+6
                steps = max(2, int(np.max(np.abs(b-a)))+1)
                line = np.linspace(a, b, steps).astype(int)
                pixels[oy+line[:, 1], ox+line[:, 0]] = color
    out.mkdir(parents=True)
    image = bpy.data.images.new('Allocation diagnostic overview', width=columns*cell, height=rows*cell)
    try:
        image.pixels.foreach_set(pixels.ravel())
        image.filepath_raw = str(out/'chart_overview.png')
        image.file_format = next(i.identifier for i in image.bl_rna.properties['file_format'].enum_items if i.identifier == 'PNG')
        image.save()
    finally:
        bpy.data.images.remove(image)
    (out/'allocation_report.json').write_text(json.dumps(report, indent=2))
    (out/'treatment_template.json').write_text(json.dumps(policy, indent=2))
    # Local, dependency-free review: explicit object/chart picking, without changing Blender.
    review = {'objects': {name: {'flags': row['flags'],
                                'charts': [{**c, 'faces': len(c['faces'])} for c in row['charts']],
                                'triangles': []}
                          for name, row in report['objects'].items()}}
    for name in selected:
        ob = meshes[name]
        layer = ob.data.uv_layers.get(args.target_uv)
        if layer is None:
            continue
        faces = {face: chart['id'] for chart in report['objects'][name]['charts'] for face in chart['faces']}
        for tri in ob.data.loop_triangles:
            points = [list(layer.data[k].uv) for k in tri.loops]
            m = core.triangle_metrics(points, args.resolution)
            color = '#ff3355' if m['zero_area'] or m['out_of_bounds'] else '#ff9911' if m['minimum_altitude_px'] < 1 else '#40cddd'
            review['objects'][name]['triangles'].append({'chart': faces[tri.polygon_index], 'uv': points, 'color': color})
    html = '''<!doctype html><meta charset="utf-8"><title>UV allocation review</title>
<style>body{background:#15191d;color:#eee;font:16px sans-serif;margin:24px}select{max-width:95%;margin:8px}svg{display:block;background:#080b0e;width:90vw;height:65vh}pre{white-space:pre-wrap}</style>
<h1>UV allocation diagnostic</h1><p>Orange: under one pixel wide. Red: zero area/out of bounds. Cyan: no such flag—not an acceptance pass.</p>
<p>Review only. No automatic exclusion, detachment or material changes. Choose treatments in treatment_template.json; all start pending.</p>
<select id="object"></select><select id="chart"></select><pre id="info"></pre><svg id="view" xmlns="http://www.w3.org/2000/svg"></svg>
<script type="application/json" id="data">__DATA__</script><script>
const data=JSON.parse(document.getElementById('data').textContent).objects;
const obj=document.getElementById('object'),chart=document.getElementById('chart'),view=document.getElementById('view'),info=document.getElementById('info');
for(const name of Object.keys(data)){let o=document.createElement('option');o.textContent=name;obj.append(o)}
function draw(){let row=data[obj.value],tris=row.triangles.filter(t=>chart.value==='all'||String(t.chart)===chart.value);view.replaceChildren();
let pts=tris.flatMap(t=>t.uv);if(pts.length){let bounds=pts.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],-p[1]),Math.max(b[2],p[0]),Math.max(b[3],-p[1])],[Infinity,Infinity,-Infinity,-Infinity]),[x,y]=bounds,w=bounds[2]-x,h=bounds[3]-y,p=Math.max(w,h,.001)*.04;view.setAttribute('viewBox',`${x-p} ${y-p} ${w+2*p} ${h+2*p}`);
for(const t of tris){let el=document.createElementNS('http://www.w3.org/2000/svg','polygon');el.setAttribute('points',t.uv.map(p=>`${p[0]},${-p[1]}`).join(' '));el.setAttribute('fill','none');el.setAttribute('stroke',t.color);el.setAttribute('stroke-width','.6');el.setAttribute('vector-effect','non-scaling-stroke');view.append(el)}}
info.textContent=JSON.stringify({object:obj.value,flags:row.flags,charts:row.charts.filter(c=>chart.value==='all'||String(c.id)===chart.value)},null,2)}
function choose(){chart.replaceChildren();let all=document.createElement('option');all.value='all';all.textContent='All charts';chart.append(all);for(const c of data[obj.value].charts){let o=document.createElement('option');o.value=c.id;o.textContent=`Chart ${c.id}: ${c.thin} thin, ${c.subpixel_area} subpixel`;chart.append(o)}draw()}
obj.onchange=choose;chart.onchange=draw;choose();</script>'''
    # Escape '<' in embedded JSON so object names cannot terminate the script element.
    (out/'review.html').write_text(html.replace('__DATA__', json.dumps(review).replace('<', '\\u003c')))
    print('ALLOCATION_REPORT', len(selected), 'objects;',
          len(report['treatment_plan']['pending']), 'pending; no parts omitted or edited')


if __name__ == '__main__':
    main()
