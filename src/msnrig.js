// Derived soft-body rig for the MSN Buddy, matching the shape config.js exposes
// for the bears. BUDDY_RIG itself remains the authored source; this module only
// derives COM, rest, collision and joint data without changing that source.
import { BUDDY_RIG, BUDDY_BRACES, BUDDY_CAPS } from './buddyrig.js';

const N = BUDDY_RIG.length;
const TOTAL_M = BUDDY_RIG.reduce((sum, p) => sum + p.m, 0);
const COMX = BUDDY_RIG.reduce((sum, p) => sum + p.m * p.x, 0) / TOTAL_M;
const COMY = BUDDY_RIG.reduce((sum, p) => sum + p.m * p.y, 0) / TOTAL_M;
const COMZ = BUDDY_RIG.reduce((sum, p) => sum + p.m * p.z, 0) / TOTAL_M;

const REST = new Float32Array(N * 3);
const MASS = new Float32Array(N);
const RSURF = new Float32Array(N);
const RCOLL = new Float32Array(N);
const PARENT = new Int8Array(N);
const JOINT_HZ = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const p = BUDDY_RIG[i];
  REST[i * 3] = p.x - COMX;
  REST[i * 3 + 1] = p.y - COMY;
  REST[i * 3 + 2] = p.z - COMZ;
  MASS[i] = p.m;
  RSURF[i] = p.r;
  RCOLL[i] = Math.max(.055, p.r * .94);
  PARENT[i] = p.parent;
  JOINT_HZ[i] = p.hz;
}

const LOWEST = Math.min(...BUDDY_RIG.map(p => (p.y - COMY) - p.r));
const REST_DY = -LOWEST;
const REST_COM_Y = -LOWEST;
const REST_H = Math.sqrt(BUDDY_RIG.reduce((sum, p) => sum + p.m * (p.y - COMY) ** 2, 0) / TOTAL_M);

const PARENT_LEN = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const parent = PARENT[i];
  if (parent < 0) continue;
  PARENT_LEN[i] = Math.hypot(
    BUDDY_RIG[i].x - BUDDY_RIG[parent].x,
    BUDDY_RIG[i].y - BUDDY_RIG[parent].y,
    BUDDY_RIG[i].z - BUDDY_RIG[parent].z,
  ) || .05;
}

export const MSN_RIG = {
  species: 'msn',
  NP: N,
  RIG: BUDDY_RIG,
  TOTAL_M,
  COM: [COMX, COMY, COMZ],
  REST,
  MASS,
  RSURF,
  RCOLL,
  PARENT,
  PARENT_LEN,
  JOINT_HZ,
  CAPS: BUDDY_CAPS,
  BRACES: BUDDY_BRACES,
  REST_H,
  REST_COM_Y,
  REST_DY,
  PTS: BUDDY_RIG.map(p => ({ n: p.n, x: p.x - COMX, y: p.y - COMY, z: p.z - COMZ, r: p.r, m: p.m })),
  // Bear code uses these landmark names for forces and grabbing. The MSN torso
  // has no snout/ears, so face-only consumers skip this species.
  P_HEAD: 0,
  P_CHEST: 6,
  P_BELLY: 5,
  P_HANDL: 15,
  P_HANDR: 19,
  P_FOOTL: 20,
  P_FOOTR: 22,
};
