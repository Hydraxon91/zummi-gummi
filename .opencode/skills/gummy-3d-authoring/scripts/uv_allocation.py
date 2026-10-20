"""Model-independent UV resolution diagnostics and explicit treatment validation."""
import math

TREATMENTS = ('pending', 'main_sheet', 'additional_sheet', 'preserve_existing_material')


def triangle_metrics(points, resolution):
    if resolution < 1 or len(points) != 3:
        raise ValueError('Positive resolution and three UV points required')
    if not all(math.isfinite(v) for p in points for v in p):
        raise ValueError('Nonfinite UV coordinates')
    a, b, c = points
    twice = abs((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]))
    longest = max(math.dist(a, b), math.dist(b, c), math.dist(c, a))
    return {'area_px': twice * .5 * resolution**2,
            'minimum_altitude_px': twice / longest * resolution if longest else 0,
            'zero_area': twice == 0,
            'out_of_bounds': any(v < 0 or v > 1 for p in points for v in p)}


def validate_treatments(policy, objects):
    """Require complete explicit accounting; never infer a treatment from object size."""
    if policy.get('schema') != 1 or set(policy.get('objects', {})) != set(objects):
        raise ValueError('Policy must account for exactly the analysed objects')
    groups = {}
    pending = []
    material_only = []
    for name, record in objects.items():
        rule = policy['objects'][name]
        treatment = rule.get('treatment')
        if treatment not in TREATMENTS:
            raise ValueError('Unknown treatment for ' + name)
        if rule.get('fingerprint') != record['fingerprint']:
            raise ValueError('Stale object/UV/material fingerprint for ' + name)
        if treatment == 'pending':
            pending.append(name)
        elif treatment == 'preserve_existing_material':
            if rule.get('materials') != record['materials']:
                raise ValueError('Material slots differ for ' + name)
            material_only.append(name)
        else:
            sheet = 'main' if treatment == 'main_sheet' else rule.get('sheet')
            if not isinstance(sheet, str) or not sheet.strip() or (treatment == 'additional_sheet' and sheet == 'main'):
                raise ValueError('Additional sheet requires a distinct sheet ID')
            groups.setdefault(sheet, []).append(name)
    return {'sheets': groups, 'pending': pending, 'material_only': material_only,
            'ready_for_trial': not pending}
