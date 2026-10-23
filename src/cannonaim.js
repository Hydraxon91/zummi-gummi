// Pure cannon placement, aim, arc and fire-eligibility math.
// Plain objects only; no engine, renderer, storage or randomness dependencies.

export const CANNON = Object.freeze({
  pivotY: 0.43,
  muzzleZ: 0.44,
  angle: 0.56,
  landY: 0.60,
  gravity: 12,
  minSpeed: 5,
  maxSpeed: 22,
  baseMargin: 0.45,
});

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

function tableClamp(x, z, margin, table) {
  return {
    x: clamp(x, -table.hx + margin, table.hx - margin),
    z: clamp(z, -table.hz + margin, table.hz - margin),
  };
}

export function clampToCannonBounds(x, z, { table, margin = CANNON.baseMargin, clampBounds } = {}) {
  if (clampBounds) return clampBounds(x, z, margin);
  return tableClamp(x, z, margin, table);
}

export function cannonPlacementProblem(x, z, {
  table, margin = CANNON.baseMargin, bears, insideBounds, placementExtra,
} = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'invalid';
  if (insideBounds) {
    if (!insideBounds(x, z, margin)) return 'bounds';
  } else if (Math.abs(x) > table.hx - margin || Math.abs(z) > table.hz - margin) return 'bounds';
  for (const b of bears || []) {
    if (!b.active) continue;
    const clearance = 0.62 + 0.18 * (b.scale || 1);
    if (Math.hypot(x - b.cx, z - b.cz) < clearance) return 'bear';
  }
  if (placementExtra && !placementExtra(x, z)) return 'extra';
  return null;
}

export function cannonAimSolution({ x, z }, { x: tx, z: tz }, {
  table, margin = 0.16, clampBounds,
} = {}) {
  const t = table;
  const c = clampBounds
    ? clampBounds(Number(tx) || 0, Number(tz) || 0, margin)
    : tableClamp(Number(tx) || 0, Number(tz) || 0, margin, t);
  tx = c.x; tz = c.z;

  const bx = x, bz = z;
  let dx = tx - bx, dz = tz - bz;
  let d = Math.hypot(dx, dz);
  if (d < 0.8) {
    const k = 0.8 / (d || 1);
    dx *= k; dz *= k; d = 0.8;
    tx = bx + dx; tz = bz + dz;
  }

  const yaw = Math.atan2(dx, dz);
  const cp = Math.cos(CANNON.angle), sp = Math.sin(CANNON.angle);
  const muzzle = {
    x: bx + Math.sin(yaw) * cp * CANNON.muzzleZ,
    y: CANNON.pivotY + sp * CANNON.muzzleZ,
    z: bz + Math.cos(yaw) * cp * CANNON.muzzleZ,
  };

  const mdx = tx - muzzle.x, mdz = tz - muzzle.z;
  const md = Math.max(0.35, Math.hypot(mdx, mdz));
  const dy = CANNON.landY - muzzle.y;
  const denom = 2 * cp * cp * (md * sp / cp - dy);
  let v = denom > 1e-4 ? Math.sqrt(CANNON.gravity * md * md / denom) : CANNON.minSpeed;
  v = clamp(v, CANNON.minSpeed, CANNON.maxSpeed);
  const dir = { x: Math.sin(yaw) * cp, y: sp, z: Math.cos(yaw) * cp };
  return {
    yaw,
    pitch: -CANNON.angle,
    muzzle,
    dir,
    speed: v,
    velocity: { x: dir.x * v, y: dir.y * v, z: dir.z * v },
    target: { x: tx, z: tz },
  };
}

export function cannonAimArc(solution, { count, step = 0.035 } = {}) {
  const { muzzle, velocity, target } = solution;
  const dots = [];
  let landX = target.x, landZ = target.z;
  for (let i = 0; i < count; i++) {
    const t = (i + 1) * step;
    const x = muzzle.x + velocity.x * t;
    const y = muzzle.y + velocity.y * t - 0.5 * CANNON.gravity * t * t;
    const z = muzzle.z + velocity.z * t;
    if (i > 2 && y <= CANNON.landY) { landX = x; landZ = z; break; }
    dots.push({ x, y, z });
  }
  for (let k = 1; k <= 3 && dots.length < count; k++) {
    const y = CANNON.landY - (CANNON.landY - 0.05) * k / 3.15;
    dots.push({ x: landX, y, z: landZ });
  }
  return { dots, land: { x: landX, y: CANNON.landY, z: landZ } };
}

export function cannonCooldownBlock(now, lastFireAt, cooldownMs) {
  return now - lastFireAt < cooldownMs;
}

export function cannonShotPlacement(solution, land, canSpawnAt) {
  const { muzzle, dir } = solution;
  let origin = {
    x: muzzle.x + dir.x * 0.36,
    y: muzzle.y + dir.y * 0.36,
    z: muzzle.z + dir.z * 0.36,
  };
  if (canSpawnAt && !canSpawnAt(origin.x, origin.z, 0.40, true)) {
    const next = {
      x: origin.x + dir.x * 0.60,
      y: origin.y + dir.y * 0.60,
      z: origin.z + dir.z * 0.60,
    };
    if (!canSpawnAt(next.x, next.z, 0.40, true)) {
      return { ok: false, block: 'muzzle', origin };
    }
    origin = next;
  }
  if (canSpawnAt && !canSpawnAt(land.x, land.z, 0.45, false)) {
    return { ok: false, block: 'landing', origin };
  }
  return { ok: true, block: null, origin };
}
