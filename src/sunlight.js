import * as THREE from 'three';

// Shared sun state for translucent vegetation. Field grass uses it now; trees
// and bushes can bind the same uniform objects later without another sky read.
export function createSunState() {
  const dir = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color(1.0, 0.82, 0.42);
  const intensity = { value: 0 };
  return {
    dir,
    color,
    intensity,
    uniforms: {
      uSunDir: { value: dir },
      uSunColor: { value: color },
      uSunIntensity: intensity,
    },
  };
}

export function updateSunState(state, sky) {
  if (!state || !sky) return;
  const dir = sky.sunDir;
  state.dir.copy(dir);
  const y = Math.max(0, dir.y);
  state.intensity.value = sky.sunVisible ? .25 + .75 * Math.min(1, y * 3) : 0;
}
