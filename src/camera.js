// Pure camera home descriptor and base spherical position math.
//
// This module owns only the map/aspect home values and the target-relative
// orbit position. It has no imports and touches no DOM, three.js, clock or RNG.
// `app.js` keeps live camera state, possession clamps, shake, look-at and
// matrix updates.

const NARROW_ASPECT = 0.95;
const LIFE_NARROW_DIST = 8;
const STUDIO_NARROW_TARGET_Y = 0.30;
const STUDIO_MIN_DIST = 4.2;
const STUDIO_MAX_DIST = 18;

// Returns a plain descriptor. The life branch deliberately reads the map's
// `camera` record as-is; missing fields propagate exactly as the previous app
// helper did rather than inventing fallbacks.
export function cameraHomeFor({ mapKind, mapCamera, camTarget, camHome, aspect }) {
  if (mapKind === 'life') {
    const c = mapCamera;
    const narrow = aspect < NARROW_ASPECT;
    return {
      target: [c.target[0], c.target[1], c.target[2]],
      yaw: c.yaw,
      pitch: c.pitch,
      dist: c.dist + (narrow ? LIFE_NARROW_DIST : 0),
      minDist: c.minDist,
      maxDist: c.maxDist,
    };
  }
  return {
    target: [
      camTarget.x,
      camTarget.y - (aspect < NARROW_ASPECT ? STUDIO_NARROW_TARGET_Y : 0),
      camTarget.z,
    ],
    yaw: camHome.yaw,
    pitch: camHome.pitch,
    dist: camHome.dist,
    minDist: STUDIO_MIN_DIST,
    maxDist: STUDIO_MAX_DIST,
  };
}

// Target-relative orbit position. Keeps the previous expression and
// multiplication order so the live camera trace is unchanged.
export function cameraPositionFor({ target, yaw, pitch, dist }) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {
    x: target.x + Math.sin(yaw) * cp * dist,
    y: target.y + sp * dist,
    z: target.z + Math.cos(yaw) * cp * dist,
  };
}
