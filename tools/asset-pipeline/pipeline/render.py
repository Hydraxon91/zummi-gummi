"""Job adapter for the existing, state-restoring review capture implementation."""
import json
import runpy
import sys
from pathlib import Path

from .common import PipelineError


def capture(job, objects, out_dir):
    if out_dir.exists():
        raise PipelineError(f'Refusing to reuse capture directory: {out_dir}')
    script = Path(__file__).resolve().parents[1] / 'scripts/capture_review.py'
    resolution = job.get('resolution', [900, 800])
    arguments = [str(script), '--', '--out-dir', str(out_dir),
                 '--targets', ','.join(obj.name for obj in objects),
                 '--preset', job.get('preset', 'material'),
                 '--views', job.get('views', 'front,side,top,three_quarter'),
                 '--width', str(resolution[0]), '--height', str(resolution[1]),
                 '--frame', str(job.get('frame', 1)), '--samples', str(job.get('samples', 0))]
    if job.get('isolate', True):
        arguments.append('--isolate')
    if job.get('pose_object'):
        arguments.extend(['--pose-object', job['pose_object']])
    previous = sys.argv
    try:
        sys.argv = arguments
        runpy.run_path(str(script), run_name='__main__')
    finally:
        sys.argv = previous
    manifests = list(out_dir.glob('*_captures.json'))
    if len(manifests) != 1:
        raise PipelineError('Capture did not produce exactly one evidence manifest')
    document = json.loads(manifests[0].read_text())
    return {'views': document.get('captures', []), 'manifest': str(manifests[0])}
