"""Analytic source fields for the Phase 7D reflector.

Coordinates are reflector-local metres. The dish lies in the XZ plane with the
front facing +Y. Keep this module and the Blender shader groups in sync.
"""

import math

SILVER = (0.62, 0.64, 0.61)
DARK = (0.20, 0.24, 0.25)
GOLD = (0.92, 0.66, 0.26)
RADIUS = 0.048
CENTER_EDGE_0 = 0.18
CENTER_EDGE_1 = 0.32
RING_FREQUENCY = 9.0 * math.pi
WEDGE_ANGLE = 0.70
WEDGE_EDGE_0 = 0.25
WEDGE_EDGE_1 = 0.75
ROUGH_BASE = 0.12
ROUGH_RING = 0.28
ROUGH_WEDGE = 0.08
ROUGH_MIN = 0.08
ROUGH_MAX = 0.65
METAL_BASE = 0.92
METAL_CENTER = 0.35


def clamp(value, low, high):
    return max(low, min(high, value))


def smoothstep(edge0, edge1, value):
    t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def mix(left, right, factor):
    return tuple(clamp(a + (b - a) * factor, 0.0, 1.0)
                 for a, b in zip(left, right))


def channel_fields(x, y, z):
    radius = math.sqrt(x * x + z * z) / RADIUS
    radius = clamp(radius, 0.0, 1.0)
    center = 1.0 - smoothstep(CENTER_EDGE_0, CENTER_EDGE_1, radius)
    ring = 0.5 + 0.5 * math.sin(RING_FREQUENCY * radius)
    angle = math.atan2(z, x)
    wedge = max(0.0, math.cos(angle - WEDGE_ANGLE))
    wedge = smoothstep(WEDGE_EDGE_0, WEDGE_EDGE_1, wedge)

    colour = mix(SILVER, DARK, wedge * 0.35)
    colour = mix(colour, GOLD, center)
    rough = ROUGH_BASE + ROUGH_RING * ring + ROUGH_WEDGE * wedge
    rough = clamp(rough, ROUGH_MIN, ROUGH_MAX)
    metal = clamp(METAL_BASE - METAL_CENTER * center, 0.0, 1.0)
    return colour, rough, metal


def sample_fields(position):
    return channel_fields(position[0], position[1], position[2])
