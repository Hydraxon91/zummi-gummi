"""Pure pixel-centre correspondence helpers for UV-gradient diagnostics."""
import math


def barycentric(point, tri):
    a, b, c = tri
    denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(denominator) < 1e-24:
        return None
    x = ((b[1] - c[1]) * (point[0] - c[0]) +
         (c[0] - b[0]) * (point[1] - c[1])) / denominator
    y = ((c[1] - a[1]) * (point[0] - c[0]) +
         (a[0] - c[0]) * (point[1] - c[1])) / denominator
    return x, y, 1 - x - y


def pixel_correspondence(source, target, weights, resolution):
    """Return an in-triangle pixel centre and expected source UV, or None if unsampled."""
    uv = [sum(w * p[i] for w, p in zip(weights, target)) for i in (0, 1)]
    if not all(math.isfinite(v) and 0 <= v < 1 for v in uv):
        return None
    x, y = (math.floor(v * resolution) for v in uv)
    centre = ((x + .5) / resolution, (y + .5) / resolution)
    bary = barycentric(centre, target)
    if bary is None or min(bary) < -1e-9:
        return None
    expected = tuple(sum(w * p[i] for w, p in zip(bary, source)) for i in (0, 1))
    return (x, y), expected
