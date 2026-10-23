// Pure meadow layout validation.
//
// This is the existing authored-layout check, separated from field.js's scene
// construction. Every collaborator is passed in: numeric lot/scale data, the
// authored pond geometry, the live pond water query, the field boundary query,
// the current nav bake and the food registry. It reads no three.js object, mesh,
// texture or render state and performs no mutation.
//
// Error order, messages, constants and guards are the pre-extraction contract.
// A caller that knows the live field inputs (field.js) resolves them on every
// call; this function deliberately keeps no snapshot of its own.

export function validateFieldLayout({
  homes,
  doorClearance,
  trees,
  rocks,
  worldScale,
  pondGeometry,
  pondContains,
  fieldInside,
  cannonHome,
  studioHouse,
  nav,
  foodSources,
  food,
  waterSpots,
}) {
  // Door-frame headroom: an adult bear is 1.375 m tall at rest. Reject a
  // layout if a scaled villa door would sit below that plus a small margin.
  const ADULT_BEAR_HEIGHT = 1.375;
  const DOOR_HEADROOM = 0.16;
  const errors = [];
  const inside = (x, z, r) => fieldInside(x, z, r + 0.35);
  for (const door of doorClearance) {
    if (door.top < ADULT_BEAR_HEIGHT + DOOR_HEADROOM) {
      errors.push(`${door.name} doorframe is below bear headroom`);
    }
  }
  for (const h of homes) {
    if (!inside(h.x, h.z, h.r + 0.1)) errors.push(`${h.name} outside the field`);
    for (const o of homes) if (o !== h) {
      const need = h.r + o.r + 0.9;
      if (Math.hypot(h.x-o.x, h.z-o.z) < need) errors.push(`${h.name} clips ${o.name}`);
    }
    for (const t of trees) {
      const need = h.r + 2.5 * t.s * worldScale.tree + 0.6;
      if (Math.hypot(h.x-t.x, h.z-t.z) < need) errors.push(`${h.name} clips tree at ${t.x},${t.z}`);
    }
    const px = (h.x - pondGeometry.x) / (pondGeometry.rx + 1.2 + h.r);
    const pz = (h.z - pondGeometry.z) / (pondGeometry.rz + 1.2 + h.r);
    if (px*px + pz*pz < 1) errors.push(`${h.name} clips the pond`);
    if (Math.hypot(h.x-cannonHome.x, h.z-cannonHome.z) < h.r + 1.5) errors.push(`${h.name} blocks the cannon home`);
    if (!nav.isWalkable(h.door.x, h.door.z)) errors.push(`${h.name} door approach is blocked`);
  }
  for (const t of trees) {
    if (!inside(t.x, t.z, 0.7 * worldScale.tree)) errors.push(`tree at ${t.x},${t.z} outside`);
    const px = (t.x - pondGeometry.x) / (pondGeometry.rx + 0.8 * worldScale.tree);
    const pz = (t.z - pondGeometry.z) / (pondGeometry.rz + 0.8 * worldScale.tree);
    if (px*px + pz*pz < 1) errors.push(`tree at ${t.x},${t.z} clips the pond`);
    if (Math.hypot(t.x-cannonHome.x, t.z-cannonHome.z) < 2.5*t.s*worldScale.tree + 1.2) errors.push('tree blocks cannon home');
  }
  for (const r of rocks) if (Math.hypot(r.x-cannonHome.x, r.z-cannonHome.z) < 2.0 * worldScale.prop) errors.push('rock blocks cannon home');
  {
    const sh = studioHouse;
    if (!inside(sh.x, sh.z, sh.r + .2)) errors.push('Studio House outside the field');
    for (const h of homes) {
      if (Math.hypot(sh.x-h.x, sh.z-h.z) < sh.r + h.r + .9) errors.push(`Studio House clips ${h.name}`);
    }
    for (const t of trees) {
      if (Math.hypot(sh.x-t.x, sh.z-t.z) < sh.r + 2.5*t.s*worldScale.tree + .6) errors.push('Studio House clips a tree');
    }
    const px = (sh.x-pondGeometry.x)/(pondGeometry.rx+1.2+sh.r), pz = (sh.z-pondGeometry.z)/(pondGeometry.rz+1.2+sh.r);
    if (px*px+pz*pz < 1) errors.push('Studio House clips the pond');
    if (Math.hypot(sh.x-cannonHome.x, sh.z-cannonHome.z) < sh.r+1.5) errors.push('Studio House blocks the cannon home');
    if (!nav.isWalkable(sh.door.x, sh.door.z)) errors.push('Studio House door approach is blocked');
  }
  for (const s of foodSources) {
    if (!nav.isWalkable(s.approachX, s.approachZ)) errors.push(`${s.id} food approach is blocked`);
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) errors.push(`${s.id} has a bad position`);
  }
  if (food) errors.push(...food.validate());
  if (!waterSpots.length) errors.push('pond has no walkable drinking approach');
  for (const w of waterSpots) {
    if (!nav.isWalkable(w.x, w.z)) errors.push('pond drinking approach is blocked');
    if (pondContains(w.x, w.z)) errors.push('pond drinking approach is in the water');
  }
  const navErrors = nav.validate();
  return errors.concat(navErrors);
}
