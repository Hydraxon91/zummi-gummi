// Local steering bias for actors sharing a walk. This is deliberately a pure
// heading adjustment, not a path replan: it keeps walkers from hopping straight
// through each other while leaving navigation and collisions as the authority.
export function avoidanceYaw(actor, wantYaw, neighbors, { radius = 1.35, strength = .55 } = {}) {
  if (!actor || !Number.isFinite(wantYaw)) return wantYaw;
  const fx = Math.sin(wantYaw), fz = Math.cos(wantYaw);
  let offset = 0;
  for (const other of neighbors || []) {
    if (!other || other === actor || !other.active || other.grabs > 0 || other.inPond) continue;
    const dx = other.cx - actor.cx, dz = other.cz - actor.cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius || d2 < 1e-4) continue;
    // Only steer around actors ahead of the current heading; a follower closing
    // from behind should not make the leader swerve.
    if (dx * fx + dz * fz <= .12) continue;
    const d = Math.sqrt(d2);
    const side = dx * fz - dz * fx;
    offset += (side >= 0 ? -1 : 1) * (1 - d / radius);
  }
  return wantYaw + Math.max(-1, Math.min(1, offset)) * strength;
}
