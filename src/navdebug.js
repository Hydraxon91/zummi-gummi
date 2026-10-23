// Debug rendering for the navigation grid.
//
// This module consumes the public nav-mesh geometry and walkability query, so
// pathfinding and obstacle baking stay in navmesh.js. THREE is injected to keep
// the renderer dependency explicit.

export function buildNavDebugObject(THREE, nav) {
  const { minX, minZ, cell, cols, rows } = nav;
  const lines = [];
  const y = 0.045;
  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const x0 = minX + ix * cell, x1 = x0 + cell;
      const z0 = minZ + iz * cell, z1 = z0 + cell;
      if (nav.isWalkable(minX + (ix + 0.5) * cell, minZ + (iz + 0.5) * cell)) continue;
      const check = (ax, az, bx, bz) => {
        if (nav.isWalkable((ax + bx) / 2, (az + bz) / 2)) lines.push(ax, y, az, bx, y, bz);
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
  const debugObject = new THREE.LineSegments(geo, mat);
  debugObject.visible = false;
  debugObject.frustumCulled = false;
  debugObject.renderOrder = 8;
  return debugObject;
}
