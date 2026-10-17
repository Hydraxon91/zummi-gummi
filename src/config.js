// Rig, flavors and tunables for the Box3D rewrite.
// 24 sphere bodies per bear; visual surface = spheres + a few capsules.

export const FLAVORS = [
  { id:'cherry',    name:'Cherry',    hex:0xd51f3c, att:0x8c1024, attDist:0.95, shadow:[196, 38, 66]  },
  { id:'orange',    name:'Orange',    hex:0xff7b1c, att:0xb14400, attDist:0.88, shadow:[226,104, 20]  },
  { id:'lemon',     name:'Lemon',     hex:0xffc61f, att:0xbd8800, attDist:0.80, shadow:[221,170, 22]  },
  { id:'apple',     name:'Apple',     hex:0x69c22f, att:0x2f7a16, attDist:0.92, shadow:[ 99,172, 44]  },
  { id:'pineapple', name:'Pineapple', hex:0xf7f2df, att:0xe6d9a6, attDist:3.20, shadow:[210,196,138]  },
];

// name, x, y, z (COM-centred rest pose), radius, mass, parent, joint hertz
// y = 0 is the table, rest COM sits at REST_COM_Y.
// The first entries match the old silhouette anchors; the rest are supporting
// bodies for better collision + richer deformation.
export const RIG = [
  { n:'head',       x: 0.000, y: 0.577, z: 0.020, r:0.235, m:0.85, parent:4,  hz:8.0 },
  { n:'snout',      x: 0.000, y: 0.497, z: 0.272, r:0.098, m:0.26, parent:0,  hz:8.0 },
  { n:'earL',       x:-0.155, y: 0.777, z: 0.005, r:0.105, m:0.12, parent:0,  hz:8.0 },
  { n:'earR',       x: 0.155, y: 0.777, z: 0.005, r:0.105, m:0.12, parent:0,  hz:8.0 },
  { n:'neck',       x: 0.000, y: 0.380, z: 0.012, r:0.150, m:0.24, parent:5,  hz:4.5 },
  { n:'chest',      x: 0.000, y: 0.100, z: 0.005, r:0.252, m:0.75, parent:8,  hz:4.0 },
  { n:'chestFront', x: 0.000, y: 0.110, z: 0.190, r:0.150, m:0.28, parent:5,  hz:5.0 },
  { n:'chestBack',  x: 0.000, y: 0.070, z:-0.180, r:0.160, m:0.28, parent:5,  hz:5.0 },
  { n:'belly',      x: 0.000, y:-0.190, z: 0.020, r:0.255, m:0.85, parent:11, hz:4.0 },
  { n:'bellyFront', x: 0.000, y:-0.180, z: 0.200, r:0.150, m:0.26, parent:8,  hz:5.0 },
  { n:'bellyBack',  x: 0.000, y:-0.200, z:-0.160, r:0.150, m:0.26, parent:8,  hz:5.0 },
  { n:'hips',       x: 0.000, y:-0.360, z: 0.000, r:0.225, m:0.60, parent:8,  hz:4.5 },

  { n:'shoulderL',  x:-0.255, y: 0.125, z: 0.020, r:0.118, m:0.22, parent:5,  hz:5.0 },
  { n:'upperArmL',  x:-0.380, y: 0.000, z: 0.055, r:0.095, m:0.16, parent:12, hz:6.0 },
  { n:'handL',      x:-0.462, y:-0.135, z: 0.075, r:0.092, m:0.13, parent:13, hz:6.0 },
  { n:'shoulderR',  x: 0.255, y: 0.125, z: 0.020, r:0.118, m:0.22, parent:5,  hz:5.0 },
  { n:'upperArmR',  x: 0.380, y: 0.000, z: 0.055, r:0.095, m:0.16, parent:15, hz:6.0 },
  { n:'handR',      x: 0.462, y:-0.135, z: 0.075, r:0.092, m:0.13, parent:16, hz:6.0 },

  { n:'thighL',     x:-0.170, y:-0.310, z: 0.030, r:0.138, m:0.25, parent:11, hz:5.0 },
  { n:'shinL',      x:-0.200, y:-0.425, z: 0.075, r:0.110, m:0.18, parent:18, hz:6.0 },
  { n:'footL',      x:-0.205, y:-0.505, z: 0.115, r:0.125, m:0.28, parent:19, hz:6.0 },
  { n:'thighR',     x: 0.170, y:-0.310, z: 0.030, r:0.138, m:0.25, parent:11, hz:5.0 },
  { n:'shinR',      x: 0.200, y:-0.425, z: 0.075, r:0.110, m:0.18, parent:21, hz:6.0 },
  { n:'footR',      x: 0.205, y:-0.505, z: 0.115, r:0.125, m:0.28, parent:22, hz:6.0 },
];

export const NP = RIG.length;
export const MASS = new Float32Array(RIG.map(p => p.m));
export const RSURF = new Float32Array(RIG.map(p => p.r));
export const RCOLL = new Float32Array(RIG.map(p => Math.max(0.055, p.r * 0.94)));
export const PARENT = new Int8Array(RIG.map(p => p.parent));
export const NAMES = RIG.map(p => p.n);

export const TOTAL_M = MASS.reduce((a,b)=>a+b, 0);
const COMX = RIG.reduce((a,p)=>a+p.m*p.x, 0) / TOTAL_M;
const COMY = RIG.reduce((a,p)=>a+p.m*p.y, 0) / TOTAL_M;
const COMZ = RIG.reduce((a,p)=>a+p.m*p.z, 0) / TOTAL_M;
// rest pose centred on its own COM (shape matching needs zero-mean rest coords)
export const REST = new Float32Array(NP*3);
for (let i=0;i<NP;i++){ REST[i*3] = RIG[i].x-COMX; REST[i*3+1] = RIG[i].y-COMY; REST[i*3+2] = RIG[i].z-COMZ; }
const LOWEST = Math.min(...RIG.map(p => (p.y-COMY) - p.r));
export const REST_DX = 0, REST_DY = -LOWEST, REST_DZ = 0;   // COM height above the table
export const REST_COM_Y = -LOWEST;
export const REST_H = Math.sqrt(RIG.reduce((a,p)=>a+p.m*(p.y-COMY)**2,0)/TOTAL_M);
export const JOINT_HZ = Float32Array.from(RIG.map(p=>p.hz));
export const PTS = RIG.map(p => ({ n:p.n, x:p.x-COMX, y:p.y-COMY, z:p.z-COMZ, r:p.r, m:p.m }));

export const PARENT_LEN = new Float32Array(NP);
for (let i=0;i<NP;i++){
  const p = PARENT[i];
  PARENT_LEN[i] = Math.hypot(RIG[i].x-RIG[p].x, RIG[i].y-RIG[p].y, RIG[i].z-RIG[p].z) || 0.05;
}

// common indices (used by UI/eyes/grab/hop code)
export const P_HEAD=0, P_SNOUT=1, P_EARL=2, P_EARR=3, P_CHEST=5, P_BELLY=8, P_HANDL=14, P_HANDR=17, P_FOOTL=20, P_FOOTR=23;

// visual capsules (surface only; collision is sphere bodies)
export const CAPS = [
  [0, 5, 0.118],   // neck
  [12, 14, 0.078], // arm L
  [15, 17, 0.078], // arm R
  [18, 20, 0.100], // leg L
  [21, 23, 0.100], // leg R
];

// extra long-range braces for the soft body (Box3D joints) [a,b,hertz,damping]
export const BRACES = [
  [0,5,2.6,0.7],[5,11,2.8,0.7],[0,8,2.2,0.7],[5,8,3.6,0.7],[8,11,3.8,0.7],
  [12,15,1.8,0.7],[18,21,1.8,0.7],[14,17,1.6,0.7],[20,23,1.6,0.7],
];
