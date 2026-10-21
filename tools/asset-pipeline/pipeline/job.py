"""Dependency-free validation of the deliberately small asset-job contract."""
import math

from .common import PipelineError, require_int, require_number, names


def validate(job, verb):
    if verb != 'verify':
        names(job)
    elif not isinstance(job.get('glb'), str):
        raise PipelineError('verify requires a glb path')
    if not isinstance(job.get('out_dir'), str) or not job['out_dir'].strip():
        raise PipelineError('out_dir must be a non-empty string')
    if 'exclude' in job and (not isinstance(job['exclude'], list) or
                             not all(isinstance(n, str) for n in job['exclude'])):
        raise PipelineError('exclude must be an array of names')
    if 'resolution' in job:
        value = job['resolution']
        values = value if verb == 'render' and isinstance(value, list) else [value]
        if verb == 'render' and len(values) != 2:
            raise PipelineError('render resolution must be [width, height]')
        for dimension in values:
            require_int(dimension, 'resolution', 64, 8192)
    for field, low, high in [('samples', 1, 512), ('margin', 0, 64), ('frame', 0, 1000000)]:
        if field in job:
            require_int(job[field], field, low, high)
    if 'unwrap_margin' in job:
        value = require_number(job['unwrap_margin'], 'unwrap_margin', 0)
        if not math.isfinite(value) or value >= .5:
            raise PipelineError('unwrap_margin must be finite and below .5')
    for field in ('alpha', 'unwrap', 'isolate', 'require_closed', 'tangents'):
        if field in job and not isinstance(job[field], bool):
            raise PipelineError(f'{field} must be a boolean')
    if 'export' in job and job['export'] is not False and not isinstance(job['export'], str):
        raise PipelineError('export must be a filename or false')
    if verb == 'bake' and job.get('export') and not job.get('gate'):
        raise PipelineError('Bake export needs gate evidence; use export:false for review')
    if job.get('profile', 'prop') not in ('prop', 'mixed', 'architectural'):
        raise PipelineError('Unknown profile')
    if verb == 'hybrid':
        groups = job.get('groups')
        if not isinstance(groups, list) or not groups:
            raise PipelineError('hybrid requires non-empty groups')
        for group in groups:
            if not isinstance(group, dict):
                raise PipelineError('hybrid group must be an object')
            require_int(group.get('resolution'), 'group.resolution', 64, 8192)
            if group.get('objects') != '*':
                names(group)
        tiles = job.get('tile_materials', [])
        if isinstance(tiles, dict):
            for name, spec in tiles.items():
                if not isinstance(name, str) or not name.strip():
                    raise PipelineError('tile_materials keys must be material names')
                if spec is None:
                    continue
                if not isinstance(spec, dict):
                    raise PipelineError('tile_materials entries must be objects')
                base = spec.get('base')
                if base is not None and (not isinstance(base, str) or not base.strip()):
                    raise PipelineError('tile_materials entry base must be a non-empty path')
        elif not isinstance(tiles, list):
            raise PipelineError('tile_materials must be a list or an object')
    return job
