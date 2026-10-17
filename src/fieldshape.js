// Shared meadow boundary.
//
// The playable meadow is an organically wobbled disc, not a rectangle. Camera
// panning, nav baking, grass/prop scatter and the Box3D containment ring all
// read this module so the walkable and visible edges can never drift apart.

export const FIELD_RADIUS = 65;

// A gentle three/five-lobe wobble keeps the edge from reading as a drawn circle.
export function fieldRadiusAt(angle) {
  return FIELD_RADIUS
    + Math.sin(angle * 3 + 0.55) * 1.10
    + Math.sin(angle * 5 - 1.30) * 0.45;
}

export function fieldInside(x, z, pad = 0) {
  const r = Math.hypot(x, z);
  if (r < 1e-6) return true;
  const limit = fieldRadiusAt(Math.atan2(z, x)) - pad;
  return limit > 0 && r <= limit;
}

export function fieldClamp(x, z, pad = 0) {
  const r = Math.hypot(x, z);
  if (r < 1e-6) return { x, z };
  const limit = Math.max(0.25, fieldRadiusAt(Math.atan2(z, x)) - pad);
  if (r <= limit) return { x, z };
  const k = limit / r;
  return { x: x * k, z: z * k };
}

export const FIELD_BOUNDS = {
  shape: 'circle',
  radius: FIELD_RADIUS,
  hx: FIELD_RADIUS,
  hz: FIELD_RADIUS,
};
