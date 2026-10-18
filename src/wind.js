// One world-space wind state shared by the meadow grass and the candy trees.
//
// The shader field is deliberately broad and low-frequency: gust fronts travel
// across the whole meadow instead of each blade/tree getting its own sine. Stable
// per-instance/per-branch phases break up synchronisation, while local flutter is
// layered on top by each material. The CPU only advances a few uniforms.

import * as THREE from 'three';

export const WIND_GLSL = /* glsl */`
  uniform float uWindTime;
  uniform vec2 uWindDir;
  uniform float uWindStrength;
  uniform float uWindGust;

  // Broad, travelling gust envelope. p is world XZ and phase is a stable seed.
  float meadowGust(vec2 p, float phase) {
    vec2 d = normalize(uWindDir + vec2(0.00001));
    vec2 side = vec2(-d.y, d.x);
    float front = dot(p, d) * 0.155 - uWindTime * 1.06 + phase * 0.11;
    float crossWave = sin(dot(p, side) * 0.085 + uWindTime * 0.21 + phase * 0.17);
    float wave = sin(front) * 0.64
               + sin(front * 0.53 + crossWave * 1.35 + phase * 0.23) * 0.36;
    return clamp(0.5 + 0.5 * wave, 0.0, 1.0);
  }

  // World-space wind displacement (already includes strength/gust). Systems
  // scale this by their own stiffness and root-to-tip weight.
  vec2 meadowWindVec(vec2 p, float phase) {
    vec2 d = normalize(uWindDir + vec2(0.00001));
    float gust = meadowGust(p, phase);
    float swirl = sin(p.x * 0.13 + uWindTime * 0.37 + phase * 0.31)
                * cos(p.y * 0.11 - uWindTime * 0.29 + phase * 0.07);
    vec2 dir = normalize(d + vec2(-d.y, d.x) * swirl * 0.34);
    float amp = uWindStrength * (0.36 + 0.64 * gust) * (1.0 + uWindGust * 0.72);
    return dir * amp;
  }
`;

export function createWind(opts = {}) {
  const hasDir = Number.isFinite(opts.dirX) || Number.isFinite(opts.dirZ);
  const startAngle = hasDir
    ? Math.atan2(Number.isFinite(opts.dirZ) ? opts.dirZ : 0.38,
                 Number.isFinite(opts.dirX) ? opts.dirX : 0.82)
    : Math.random() * Math.PI * 2;
  const dir = new THREE.Vector2(Math.cos(startAngle), Math.sin(startAngle));
  if (dir.lengthSq() < 1e-6) dir.set(0.82, 0.38);
  dir.normalize();

  const uniforms = {
    uWindTime: { value: Number.isFinite(opts.time) ? opts.time : 0 },
    uWindDir: { value: dir },
    uWindStrength: { value: Number.isFinite(opts.strength) ? opts.strength : 0.65 + Math.random() * 0.65 },
    uWindGust: { value: Number.isFinite(opts.gust) ? opts.gust : 0.35 + Math.random() * 0.35 },
  };
  let strength = uniforms.uWindStrength.value;
  let gustBase = uniforms.uWindGust.value;

  // The direction drifts toward a new random bearing every so often instead of
  // snapping. That keeps grass, trees, water and turbines moving together.
  let veerAngle = startAngle;
  let targetAngle = startAngle;
  let veerTimer = 8 + Math.random() * 18;
  const angleDelta = (a, b) => {
    let d = (b - a + Math.PI * 2) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    return d;
  };

  return {
    uniforms,
    get time() { return uniforms.uWindTime.value; },
    get strength() { return strength; },
    get gust() { return uniforms.uWindGust.value; },
    get direction() { return { x: uniforms.uWindDir.value.x, z: uniforms.uWindDir.value.y }; },
    update(dt) {
      if (!(dt > 0)) return;
      uniforms.uWindTime.value += dt;
      // Slow gust breathing, on top of the immediate shader-level gust fronts.
      uniforms.uWindGust.value = gustBase + 0.12 * Math.sin(uniforms.uWindTime.value * 0.11);

      veerTimer -= dt;
      if (veerTimer <= 0) {
        veerTimer = 16 + Math.random() * 24;
        targetAngle = veerAngle + (Math.random() * 2 - 1) * (0.45 + Math.random() * 0.55);
      }
      veerAngle += angleDelta(veerAngle, targetAngle) * (1 - Math.exp(-dt * 0.22));
      uniforms.uWindDir.value.set(Math.cos(veerAngle), Math.sin(veerAngle));
    },
    setStrength(v) {
      strength = THREE.MathUtils.clamp(Number(v) || 0, 0, 1.8);
      uniforms.uWindStrength.value = strength;
    },
    setDirection(x, z) {
      const v = new THREE.Vector2(Number(x) || 0, Number(z) || 0);
      if (v.lengthSq() < 1e-6) v.set(0.82, 0.38);
      v.normalize();
      uniforms.uWindDir.value.copy(v);
      veerAngle = Math.atan2(v.y, v.x);
      targetAngle = veerAngle;
      veerTimer = 16 + Math.random() * 24;
    },
    setGust(v) {
      gustBase = THREE.MathUtils.clamp(Number(v) || 0, 0, 1);
      uniforms.uWindGust.value = gustBase;
    },
  };
}
