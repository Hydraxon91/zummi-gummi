"""Analytic source fields for the Phase 7C procedural pebble.

The Blender shader groups in build_pebble_procedural_bake.py mirror these
functions. Keep the constants and operation order in sync; the verifier uses
this module as the independent source reference for baked-channel checks.
"""

import math

TEAL = (0.06, 0.62, 0.58)
CORAL = (0.92, 0.28, 0.18)
LIME = (0.55, 0.92, 0.20)
DARK = (0.025, 0.16, 0.18)

BAND_OFFSET = 0.02
BAND_EDGE_0 = 0.020
BAND_EDGE_1 = 0.055
LIME_CENTER = (0.16, -0.08, 0.18)
LIME_EDGE_0 = 0.040
LIME_EDGE_1 = 0.080
DARK_CENTER = (-0.20, 0.10, -0.05)
DARK_EDGE_0 = 0.055
DARK_EDGE_1 = 0.100
ROUGH_BASE = 0.50
ROUGH_SIN_A = 0.25
ROUGH_SIN_B = 0.15
ROUGH_MIN = 0.08
ROUGH_MAX = 0.92
METAL_BASE = 0.15
METAL_AMPLITUDE = 0.68
METAL_EDGE_0 = -0.02
METAL_EDGE_1 = 0.08


def clamp(value, low, high):
    return max(low, min(high, value))


def smoothstep(edge0, edge1, value):
    t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def mix(left, right, factor):
    return tuple(clamp(a + (b - a) * factor, 0.0, 1.0)
                 for a, b in zip(left, right))


def channel_fields(x, y, z):
    band_plane = x + 0.35 * y - BAND_OFFSET
    band = 1.0 - smoothstep(BAND_EDGE_0, BAND_EDGE_1, abs(band_plane))
    lime_distance = math.sqrt(
        (x - LIME_CENTER[0]) ** 2
        + (y - LIME_CENTER[1]) ** 2
        + (z - LIME_CENTER[2]) ** 2)
    lime = 1.0 - smoothstep(LIME_EDGE_0, LIME_EDGE_1, lime_distance)
    dark_distance = math.sqrt(
        (x - DARK_CENTER[0]) ** 2
        + (y - DARK_CENTER[1]) ** 2
        + (z - DARK_CENTER[2]) ** 2)
    dark = 1.0 - smoothstep(DARK_EDGE_0, DARK_EDGE_1, dark_distance)

    colour = mix(TEAL, CORAL, band)
    colour = mix(colour, LIME, lime)
    colour = mix(colour, DARK, dark)

    rough = ROUGH_BASE
    rough += ROUGH_SIN_A * math.sin(6.0 * x + 3.0 * y)
    rough += ROUGH_SIN_B * math.sin(5.0 * y - 4.0 * z)
    rough = clamp(rough, ROUGH_MIN, ROUGH_MAX)

    metal_region = smoothstep(
        METAL_EDGE_0, METAL_EDGE_1, x + 0.35 * y - BAND_OFFSET)
    metal = clamp(METAL_BASE + METAL_AMPLITUDE * metal_region, 0.0, 1.0)
    return colour, rough, metal


def sample_fields(position):
    return channel_fields(position[0], position[1], position[2])
