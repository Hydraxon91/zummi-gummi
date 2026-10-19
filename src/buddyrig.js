// Metaball species rig for the MSN buddy, in the same shape as the bear RIG in
// config.js (n, x, y, z, r, m, parent, hz) plus its long-range braces and arm
// capsules. NOT wired into the game: nothing imports this module yet, and no
// physics/render path consumes it until the rig is parameterised in app.js.
//
// Source of truth: assets/MSN_Figure/msn_007.blend — object "MSN_Buddy" (torso
// lathe) plus separate limb objects "armL"/"armR" (blunt oval capsules). Centres
// and radii were refitted 2026-10-19 against the mesh's ray-cast silhouette using
// this project's own metaball falloff (KSUP 1.48, THRESH = (1 - 1/KSUP^2)^3),
// with left/right and front/back symmetry enforced.
//
// Fit quality: RMS silhouette error 13.2 mm over 31 height samples (~0.8% of the
// 1.573 m model height). The worst residual is ~61 mm at z 0.88 (the shoulder),
// where the tilted arm oval's *horizontal* cross-section is wider than sphere
// bodies can reproduce without inflating the neck pinch. Everything below z 0.80
// fits within ~35 mm, and the head/torso column within ~6 mm.
//
// Frame matches the bears: metres, +y up, +z front, x left/right. y = 0 is the
// model's base. config.js's derivation (mass-weighted COM centring into REST,
// then REST_DY / REST_COM_Y / REST_H / PARENT_LEN / RSURF / RCOLL) applies
// unchanged once this rig is wired.
//
// r is a metaball surface radius, not a collision radius. Mass is
// volume-proportional (r^3, floored at 0.01 before normalisation) and scaled to
// the bears' ~7.3 total. Masses and joint hertz are first-pass values and need
// in-game tuning; they have not been validated in the browser.

export const BUDDY_RIG = [
  // torso column (base is the free root)  0-7
  { n:'head',      x: 0.000, y: 1.250, z: 0.000, r:0.320, m:0.531, parent: 1, hz:8.0 },
  { n:'neck',      x: 0.000, y: 0.950, z: 0.000, r:0.102, m:0.162, parent: 7, hz:4.5 },
  { n:'base',      x: 0.000, y: 0.080, z: 0.000, r:0.316, m:0.512, parent:-1, hz:0.0 },
  { n:'hip',       x: 0.000, y: 0.220, z: 0.000, r:0.355, m:0.727, parent: 2, hz:4.0 },
  { n:'waist',     x: 0.000, y: 0.370, z: 0.000, r:0.428, m:1.274, parent: 3, hz:4.0 },
  { n:'belly',     x: 0.000, y: 0.520, z: 0.000, r:0.340, m:0.637, parent: 4, hz:4.0 },
  { n:'chest',     x: 0.000, y: 0.670, z: 0.000, r:0.270, m:0.319, parent: 5, hz:4.0 },
  { n:'shoulders', x: 0.000, y: 0.810, z: 0.000, r:0.130, m:0.162, parent: 6, hz:4.5 },

  // front/back volume so the torso keeps its depth  8-11
  { n:'waistFront', x: 0.000, y: 0.300, z: 0.150, r:0.255, m:0.268, parent: 4, hz:5.0 },
  { n:'waistBack',  x: 0.000, y: 0.300, z:-0.150, r:0.255, m:0.268, parent: 4, hz:5.0 },
  { n:'chestFront', x: 0.000, y: 0.550, z: 0.140, r:0.211, m:0.162, parent: 6, hz:5.0 },
  { n:'chestBack',  x: 0.000, y: 0.550, z:-0.140, r:0.211, m:0.162, parent: 6, hz:5.0 },

  // arms: four bodies down the tilted limb axis, hand at the bottom  12-19
  { n:'armL0', x:-0.427, y: 0.217, z: 0.000, r:0.121, m:0.162, parent: 7, hz:6.0 },
  { n:'armL1', x:-0.369, y: 0.419, z: 0.000, r:0.231, m:0.200, parent:12, hz:6.0 },
  { n:'armL2', x:-0.311, y: 0.621, z: 0.000, r:0.235, m:0.209, parent:13, hz:6.0 },
  { n:'armL3', x:-0.253, y: 0.823, z: 0.000, r:0.103, m:0.162, parent:14, hz:6.0 },
  { n:'armR0', x: 0.427, y: 0.217, z: 0.000, r:0.121, m:0.162, parent: 7, hz:6.0 },
  { n:'armR1', x: 0.369, y: 0.419, z: 0.000, r:0.231, m:0.200, parent:16, hz:6.0 },
  { n:'armR2', x: 0.311, y: 0.621, z: 0.000, r:0.235, m:0.209, parent:17, hz:6.0 },
  { n:'armR3', x: 0.253, y: 0.823, z: 0.000, r:0.103, m:0.162, parent:18, hz:6.0 },

  // standing base  20-23
  { n:'baseC',  x: 0.000, y: 0.030, z: 0.000, r:0.160, m:0.162, parent: 2, hz:5.0 },
  { n:'baseL',  x:-0.170, y: 0.050, z: 0.000, r:0.129, m:0.162, parent: 2, hz:5.0 },
  { n:'baseR',  x: 0.170, y: 0.050, z: 0.000, r:0.129, m:0.162, parent: 2, hz:5.0 },
  { n:'baseUp', x: 0.000, y: 0.160, z: 0.000, r:0.160, m:0.162, parent: 2, hz:5.0 },
];

// Long-range braces, same [a, b, hertz, damping] form as the bear BRACES.
export const BUDDY_BRACES = [
  [ 0,  6, 2.6, 0.7],  // head - chest
  [ 6,  3, 2.8, 0.7],  // chest - hip
  [ 0,  5, 2.2, 0.7],  // head - belly
  [ 7,  5, 3.6, 0.7],  // shoulders - belly
  [ 4,  2, 3.8, 0.7],  // waist - base
  [12, 16, 1.8, 0.7],  // armL0 - armR0
  [15, 19, 1.6, 0.7],  // armL3 - armR3
  [ 8,  9, 3.0, 0.7],  // waist front - back
  [10, 11, 3.0, 0.7],  // chest front - back
];

// Visual capsules, same [a, b, radius] form as the bear CAPS.
export const BUDDY_CAPS = [
  [12, 15, 0.090],  // left arm
  [16, 19, 0.090],  // right arm
];
