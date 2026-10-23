// Pure numeric boundary for the Bear/Gummy surface lattice.
//
// Extracted from app.js `buildBear`: world-aligned grid bounds plus the
// quantized cell ladder, hysteresis and per-axis dimension cap. This module is
// deliberately free of three.js, DOM, storage, RNG and clocks so the load-bearing
// numeric behavior can be pinned by Node fixtures. Field scatter, surface nets,
// geometry upload, eyes, shadows and physics remain in app.js / box3d.

export const SURFACE_LATTICE_LIMITS = Object.freeze({
  maxDim: 54,
  maxCells: 54 * 54 * 54,
});

// Radius floor used by the original bounds scan: a bear whose parts are all
// smaller than this still gets at least this much slack in `maxR`.
const RADIUS_FLOOR = 0.02;

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

// Bounds from points ± radius*scale. Returns null when there are no points,
// because the historical sentinel bounds (±1e9) were not meaningful.
export function surfaceBounds(px, py, pz, radii, count, scale = 1) {
  if (!count) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let maxR = RADIUS_FLOOR;
  for (let i = 0; i < count; i++) {
    const r = radii[i] * scale;
    if (r > maxR) maxR = r;
    const x = px[i], y = py[i], z = pz[i];
    if (x - r < minX) minX = x - r;
    if (y - r < minY) minY = y - r;
    if (z - r < minZ) minZ = z - r;
    if (x + r > maxX) maxX = x + r;
    if (y + r > maxY) maxY = y + r;
    if (z + r > maxZ) maxZ = z + r;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ, maxR };
}

// Pick a stable, world-aligned lattice. Returns null when four expansion passes
// cannot fit inside maxDim or the cell count exceeds maxCells. Inputs are never
// mutated; `previous` is only read so a reused lattice is byte-identical.
export function chooseSurfaceLattice({
  bounds,
  tier,
  previous = null,
  maxDim = SURFACE_LATTICE_LIMITS.maxDim,
  maxCells = SURFACE_LATTICE_LIMITS.maxCells,
} = {}) {
  if (!bounds) return null;

  const ext = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
  );
  const want = clamp(ext / tier, 0.012, 0.45);

  // Hysteresis: keep the previous cell size while the desired size is within 6%.
  // Otherwise quantize onto the 1.13 ladder so consecutive builds sample the
  // same lattice points instead of crawling.
  let cell;
  if (previous && Math.abs(previous.cell / want - 1) < 0.06) cell = previous.cell;
  else cell = clamp(0.01 * Math.pow(1.13, Math.round(Math.log(want / 0.01) / Math.log(1.13))), 0.012, 0.5);

  let slack = Math.max(0.42 * bounds.maxR, 2.2 * cell);
  const needMinX = bounds.minX - slack, needMaxX = bounds.maxX + slack;
  const needMinY = bounds.minY - slack, needMaxY = bounds.maxY + slack;
  const needMinZ = bounds.minZ - slack, needMaxZ = bounds.maxZ + slack;

  // Reuse the previous lattice only when the cell survives hysteresis and every
  // padded bound still sits at least 0.9 cell inside it.
  const L = previous;
  const fits = !!L && Math.abs(L.cell - cell) < L.cell * 1e-6 &&
    needMinX >= L.ox + L.cell * 0.9 && needMaxX <= L.ox + (L.nx - 1) * L.cell - L.cell * 0.9 &&
    needMinY >= L.oy + L.cell * 0.9 && needMaxY <= L.oy + (L.ny - 1) * L.cell - L.cell * 0.9 &&
    needMinZ >= L.oz + L.cell * 0.9 && needMaxZ <= L.oz + (L.nz - 1) * L.cell - L.cell * 0.9;
  if (fits) {
    const total = L.nx * L.ny * L.nz;
    if (total > maxCells) return null;
    return { cell: L.cell, ox: L.ox, oy: L.oy, oz: L.oz, nx: L.nx, ny: L.ny, nz: L.nz, total };
  }

  let ox, oy, oz, nx, ny, nz, ok = false;
  for (let pass = 0; pass < 4; pass++) {
    ox = Math.floor((bounds.minX - slack) / cell) * cell;
    oy = Math.floor((bounds.minY - slack) / cell) * cell;
    oz = Math.floor((bounds.minZ - slack) / cell) * cell;
    nx = Math.ceil((bounds.maxX + slack - ox) / cell) + 1;
    ny = Math.ceil((bounds.maxY + slack - oy) / cell) + 1;
    nz = Math.ceil((bounds.maxZ + slack - oz) / cell) + 1;
    if (nx <= maxDim && ny <= maxDim && nz <= maxDim) { ok = true; break; }
    cell *= 1.15;
    slack = Math.max(0.42 * bounds.maxR, 2.2 * cell);
  }
  if (!ok) return null;

  const total = nx * ny * nz;
  if (total > maxCells) return null;
  return { cell, ox, oy, oz, nx, ny, nz, total };
}
