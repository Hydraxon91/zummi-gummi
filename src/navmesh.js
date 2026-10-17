// Procedural navigation mesh for the meadow.
//
// The field's obstacle registry is the single source of truth for both Box3D
// colliders and this nav bake, so collision and navigation cannot drift apart.
//
// This is a clearance-baked navigation grid with connected components,
// A* search and line-of-sight string pulling. Walkable regions can be merged
// into convex rectangles for debug/steering; the grid is kept for robust paths.

const SQRT2 = Math.SQRT2;

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function createNavMesh(opts = {}) {
  const minX = opts.minX ?? -46;
  const maxX = opts.maxX ?? 46;
  const minZ = opts.minZ ?? -30;
  const maxZ = opts.maxZ ?? 30;
  const cell = opts.cell ?? 0.75;
  const agentRadius = opts.agentRadius ?? 0.36;
  const extraClearance = opts.extraClearance ?? 0.10;

  const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const N = cols * rows;

  const walk = new Uint8Array(N);        // 1 = walkable
  const component = new Int32Array(N);   // -1 = blocked/unvisited
  const visited = new Uint8Array(N);
  const queue = new Int32Array(N);
  const solids = [];                     // static obstacle registry (source of truth)
  const dynamics = new Map();            // id -> {x,z,r}
  const doors = [];                      // house approach points (outside walls)
  let baked = false;
  let mainComponent = -1;
  let debugObject = null;
  const stats = { cells: N, blocked: 0, walkable: 0, components: 0, mainCells: 0, solids: 0, doors: 0 };

  function cx(ix) { return minX + (ix + 0.5) * cell; }
  function cz(iz) { return minZ + (iz + 0.5) * cell; }
  function toIx(x) { return Math.floor((x - minX) / cell); }
  function toIz(z) { return Math.floor((z - minZ) / cell); }
  function inGrid(ix, iz) { return ix >= 0 && iz >= 0 && ix < cols && iz < rows; }
  function idx(ix, iz) { return iz * cols + ix; }

  function cellCenterWalkable(ix, iz) {
    return inGrid(ix, iz) && walk[idx(ix, iz)] === 1;
  }

  function isWalkable(x, z) {
    const ix = toIx(x), iz = toIz(z);
    return cellCenterWalkable(ix, iz);
  }

  // ------------------------------------------------------------- obstacle api
  function addSolid(s) {
    // s: { kind, x, z, r } circles, or { kind, x, z, rx, rz } ellipses.
    // Houses may include a door point and name.
    const copy = { ...s };
    solids.push(copy);
    if (s.kind === 'house' && s.door) {
      doors.push({ x: s.door.x, z: s.door.z, name: s.name || '', house: s });
    }
    return copy;
  }
  function clearSolids(kind) {
    if (!kind) solids.length = 0;
    else for (let i = solids.length - 1; i >= 0; i--) if (solids[i].kind === kind) solids.splice(i, 1);
  }
  function setDynamic(id, o) {
    if (!o) dynamics.delete(id); else dynamics.set(id, { ...o });
  }
  function removeDynamic(id) { dynamics.delete(id); }

  function blockCircle(x, z, radius) {
    const ix0 = Math.max(0, toIx(x - radius)), ix1 = Math.min(cols - 1, toIx(x + radius));
    const iz0 = Math.max(0, toIz(z - radius)), iz1 = Math.min(rows - 1, toIz(z + radius));
    const r2 = radius * radius;
    for (let iz = iz0; iz <= iz1; iz++) {
      const dz = cz(iz) - z;
      for (let ix = ix0; ix <= ix1; ix++) {
        const dx = cx(ix) - x;
        if (dx * dx + dz * dz <= r2) walk[idx(ix, iz)] = 0;
      }
    }
  }

  function blockEllipse(x, z, rx, rz) {
    const ix0 = Math.max(0, toIx(x - rx)), ix1 = Math.min(cols - 1, toIx(x + rx));
    const iz0 = Math.max(0, toIz(z - rz)), iz1 = Math.min(rows - 1, toIz(z + rz));
    const irx = 1 / Math.max(1e-4, rx), irz = 1 / Math.max(1e-4, rz);
    for (let iz = iz0; iz <= iz1; iz++) {
      const dz = (cz(iz) - z) * irz;
      for (let ix = ix0; ix <= ix1; ix++) {
        const dx = (cx(ix) - x) * irx;
        if (dx * dx + dz * dz <= 1) walk[idx(ix, iz)] = 0;
      }
    }
  }

  function bake() {
    walk.fill(1);
    component.fill(-1);
    visited.fill(0);

    // Bounds: leave room for the bear's body plus the wall.
    const edge = agentRadius + 0.45;
    for (let iz = 0; iz < rows; iz++) {
      const z = cz(iz);
      for (let ix = 0; ix < cols; ix++) {
        const x = cx(ix);
        if (x < minX + edge || x > maxX - edge || z < minZ + edge || z > maxZ - edge) {
          walk[idx(ix, iz)] = 0;
        }
      }
    }

    const clearance = agentRadius + extraClearance;
    for (const s of solids) {
      if (s.solid === false) continue;
      if (s.rx !== undefined && s.rz !== undefined) {
        blockEllipse(s.x, s.z, s.rx + clearance, s.rz + clearance);
      } else {
        blockCircle(s.x, s.z, (s.r || 0.3) + clearance);
      }
    }
    for (const s of dynamics.values()) {
      blockCircle(s.x, s.z, (s.r || 0.3) + clearance);
    }

    // Ensure door approach points remain walkable even in tight lots.
    for (const d of doors) {
      const ix = toIx(d.x), iz = toIz(d.z);
      if (inGrid(ix, iz)) walk[idx(ix, iz)] = 1;
    }

    // Connected components (8-connected).
    let nComp = 0, best = -1, bestSize = 0;
    for (let iz = 0; iz < rows; iz++) {
      for (let ix = 0; ix < cols; ix++) {
        const start = idx(ix, iz);
        if (!walk[start] || visited[start]) continue;
        let head = 0, tail = 0, size = 0;
        queue[tail++] = start;
        visited[start] = 1;
        component[start] = nComp;
        while (head < tail) {
          const cur = queue[head++];
          size++;
          const cz0 = Math.floor(cur / cols), cx0 = cur - cz0 * cols;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dz) continue;
              const nx = cx0 + dx, nz = cz0 + dz;
              if (!inGrid(nx, nz)) continue;
              const ni = idx(nx, nz);
              if (!walk[ni] || visited[ni]) continue;
              // don't squeeze diagonally past two blocked cells
              if (dx && dz && (!walk[idx(cx0 + dx, cz0)] || !walk[idx(cx0, cz0 + dz)])) continue;
              visited[ni] = 1;
              component[ni] = nComp;
              queue[tail++] = ni;
            }
          }
        }
        if (size > bestSize) { bestSize = size; best = nComp; }
        nComp++;
      }
    }
    mainComponent = best;

    stats.blocked = 0;
    for (let i = 0; i < N; i++) if (!walk[i]) stats.blocked++;
    stats.walkable = N - stats.blocked;
    stats.components = nComp;
    stats.mainCells = bestSize;
    stats.solids = solids.length;
    stats.doors = doors.length;
    baked = true;
    return stats;
  }

  function nearestWalkable(x, z, maxCells = 20) {
    const ix0 = toIx(x), iz0 = toIz(z);
    if (cellCenterWalkable(ix0, iz0)) return { x: cx(ix0), z: cz(iz0), ix: ix0, iz: iz0 };
    for (let r = 1; r <= maxCells; r++) {
      let best = null, bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const ix = ix0 + dx, iz = iz0 + dz;
          if (!cellCenterWalkable(ix, iz)) continue;
          const d = (cx(ix) - x) ** 2 + (cz(iz) - z) ** 2;
          if (d < bestD) { bestD = d; best = { x: cx(ix), z: cz(iz), ix, iz }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  function lineClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (cell * 0.55)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!isWalkable(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  function findPath(sx, sz, tx, tz) {
    if (!baked) bake();
    const start = nearestWalkable(sx, sz);
    const goal = nearestWalkable(tx, tz);
    if (!start || !goal) return null;
    const si = idx(start.ix, start.iz), gi = idx(goal.ix, goal.iz);
    if (si === gi) return [{ x: start.x, z: start.z }];

    const gScore = new Float32Array(N).fill(Infinity);
    const fScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();

    const h = (i) => {
      const ix = i % cols, iz = (i - ix) / cols;
      const dx = Math.abs(ix - goal.ix), dz = Math.abs(iz - goal.iz);
      return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz);
    };

    gScore[si] = 0; fScore[si] = h(si);
    heap.push({ i: si, f: fScore[si] });
    while (heap.size) {
      const { i } = heap.pop();
      if (closed[i]) continue;
      if (i === gi) break;
      closed[i] = 1;
      const iz = Math.floor(i / cols), ix = i - iz * cols;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = ix + dx, nz = iz + dz;
          if (!inGrid(nx, nz)) continue;
          const ni = idx(nx, nz);
          if (!walk[ni] || closed[ni]) continue;
          if (dx && dz && (!walk[idx(ix + dx, iz)] || !walk[idx(ix, iz + dz)])) continue;
          const step = dx && dz ? SQRT2 : 1;
          const tentative = gScore[i] + step;
          if (tentative >= gScore[ni]) continue;
          came[ni] = i;
          gScore[ni] = tentative;
          fScore[ni] = tentative + h(ni);
          heap.push({ i: ni, f: fScore[ni] });
        }
      }
    }

    if (!Number.isFinite(gScore[gi])) return null;

    // reconstruct cells
    const raw = [];
    for (let cur = gi; cur !== -1; cur = came[cur]) {
      const iz = Math.floor(cur / cols), ix = cur - iz * cols;
      raw.push({ x: cx(ix), z: cz(iz) });
      if (cur === si) break;
    }
    raw.reverse();

    // string pulling with line-of-sight
    const out = [raw[0]];
    let anchor = 0;
    while (anchor < raw.length - 1) {
      let best = anchor + 1;
      for (let j = raw.length - 1; j > anchor + 1; j--) {
        if (lineClear(raw[anchor].x, raw[anchor].z, raw[j].x, raw[j].z)) {
          best = j; break;
        }
      }
      out.push(raw[best]);
      anchor = best;
    }
    return out;
  }

  // --------------------------------------------------------------- debug view
  function buildDebugObject(THREE) {
    if (debugObject) return debugObject;
    const lines = [];
    const y = 0.045;
    for (let iz = 0; iz < rows; iz++) {
      for (let ix = 0; ix < cols; ix++) {
        if (walk[idx(ix, iz)]) continue;
        const x0 = minX + ix * cell, x1 = x0 + cell;
        const z0 = minZ + iz * cell, z1 = z0 + cell;
        const check = (ax, az, bx, bz) => {
          if (isWalkable((ax + bx) / 2, (az + bz) / 2)) lines.push(ax, y, az, bx, y, bz);
        };
        check(x0, z0, x1, z0); check(x1, z0, x1, z1);
        check(x1, z1, x0, z1); check(x0, z1, x0, z0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x6fe3ff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false,
    });
    debugObject = new THREE.LineSegments(geo, mat);
    debugObject.visible = false;
    debugObject.frustumCulled = false;
    debugObject.renderOrder = 8;
    return debugObject;
  }

  function validate() {
    const errors = [];
    for (const s of solids) {
      if (!isWalkable(s.x, s.z)) continue; // expected: obstacle centers are blocked
      errors.push(`${s.kind || 'solid'} at ${s.x.toFixed(2)},${s.z.toFixed(2)} is walkable`);
    }
    for (const d of doors) {
      if (!isWalkable(d.x, d.z)) errors.push(`door ${d.name} approach is blocked`);
    }
    // Door approach must be outside its house footprint plus agent clearance.
    for (const s of solids) {
      if (s.kind !== 'house' || !s.door) continue;
      const need = (s.r || 0.9) + agentRadius;
      if (Math.hypot(s.door.x - s.x, s.door.z - s.z) <= need) {
        errors.push(`door ${s.name} is inside the house clearance`);
      }
    }
    return errors;
  }

  return {
    minX, maxX, minZ, maxZ, cell, cols, rows, agentRadius,
    addSolid, clearSolids, setDynamic, removeDynamic,
    bake, isWalkable, nearestWalkable, findPath, lineClear,
    buildDebugObject, validate,
    get stats() { return { ...stats }; },
    get solids() { return solids; },
    get doors() { return doors; },
    get mainComponent() { return mainComponent; },
    get baked() { return baked; },
    get debugObject() { return debugObject; },
  };
}
