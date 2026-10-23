// Pure pond/water simulation access.
//
// This module owns the pond query returned by the field and the shore drinking
// approaches derived from it. It deliberately imports no scene, DOM, storage,
// RNG or clock code: field composition passes the authored constants and the
// live field/nav callbacks in. The visual pond bank, water shader/reflector,
// shoreline and colliders stay with `field.js`.

export function createPondQuery(pond, hole = pond?.hole) {
  const { x, z, rx, rz } = pond;
  return {
    ...pond,
    hole,
    contains(px, pz) {
      const dx = (px - x) / rx;
      const dz = (pz - z) / rz;
      return dx * dx + dz * dz < 1;
    },
    nearestShore(px, pz) {
      const dx = px - x;
      const dz = pz - z;
      const a = Math.atan2(dz, dx);
      return {
        x: x + Math.cos(a) * rx * 1.12,
        z: z + Math.sin(a) * rz * 1.12,
      };
    },
  };
}

export function buildWaterSpots({
  pond,
  count = 16,
  fieldInside,
  nearestWalkable,
  radius = 1.22,
  waterRadius = .94,
  minSpacing = 1.4,
  maxSnap = 2.2,
  edge = .8,
}) {
  const spots = [];
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2;
    const rawX = pond.x + Math.cos(a) * pond.rx * radius;
    const rawZ = pond.z + Math.sin(a) * pond.rz * radius;
    if (!fieldInside(rawX, rawZ, edge)) continue;
    const p = nearestWalkable(rawX, rawZ);
    if (!p) continue;
    if (Math.hypot(p.x - rawX, p.z - rawZ) > maxSnap) continue;
    if (pond.contains(p.x, p.z)) continue;
    if (spots.some(w => Math.hypot(w.x - p.x, w.z - p.z) < minSpacing)) continue;
    spots.push({
      x: p.x,
      z: p.z,
      waterX: pond.x + Math.cos(a) * pond.rx * waterRadius,
      waterZ: pond.z + Math.sin(a) * pond.rz * waterRadius,
      y: pond.waterY,
    });
  }
  return spots;
}
