// The enormous Gummy Meadow.
//
// Single-source obstacle registry feeds both the visible props and the nav grid;
// static Box3D spheres are created by the app from the same footprint data.
// The pond uses a custom Reflector shader and a real depression in the ground.

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createNavMesh } from './navmesh.js';
import { REFLECT_LAYER } from './sky.js';
import { createWind, WIND_GLSL } from './wind.js';
import { createTreeCollection } from './trees.js';
import { createHorizon } from './horizon.js';
import { createAeroHomes } from './homes.js';
import { createBackdrop } from './backdrop.js';
import { createStudioHouse } from './studiohouse.js';
import { createBushCollection } from './bushes.js';
import { FIELD_BOUNDS, FIELD_RADIUS, fieldInside, fieldRadiusAt } from './fieldshape.js';

export { FIELD_BOUNDS };
export const POND = { x: -17, z: 2, rx: 6.6, rz: 4.3, waterY: 0.045 };
export const POND_HOLE = { hx: POND.rx * 0.78, hz: POND.rz * 0.78, floorY: -0.8 };

const HOUSE_LOTS = [
  { x: -7, z: -7,  name: 'Thimble Cottage',  wall: 0xf6ead0, roof: 0xd04a61, door: 0x6b3d2c },
  { x: -8, z: 7,   name: 'Mossy Nook',       wall: 0xf2e6c8, roof: 0x6fae5a, door: 0x7c4b33 },
  { x: 3, z: -11,  name: 'Sugarplum House',  wall: 0xf8e6da, roof: 0xd9779c, door: 0x753f34 },
  { x: 11, z: -6,  name: 'Pebblewick',       wall: 0xf1e8d6, roof: 0x729bc9, door: 0x664334 },
  { x: 12, z: 4,   name: 'Honeydew Cottage', wall: 0xf7eed3, roof: 0xe8b94e, door: 0x7b4b2c },
  { x: 18, z: 12,   name: 'Moonberry Lodge',  wall: 0xf5e7d8, roof: 0x8e74c8, door: 0x6c3d32 },
  { x: 24, z: -2,  name: 'Clover Croft',     wall: 0xefe9cf, roof: 0x5fa7a0, door: 0x765036 },
  { x: -26, z: -13, name: 'Butterscotch Barn', wall: 0xf6e5c3, roof: 0xc9864f, door: 0x6a3f2d },
];

const TREE_LOTS = [
  { x: -28, z: -2, s: 1.05 }, { x: -20, z: 14, s: 0.95 }, { x: -12, z: -19, s: 1.08 },
  { x: -26, z: 24, s: 1.0 }, { x: 26, z: 18, s: 0.92 }, { x: 28, z: -11, s: 1.1 },
  { x: 20, z: -22, s: 0.9 }, { x: -4, z: -25, s: 1.04 }, { x: 31, z: 8, s: 0.97 },
  { x: -31, z: 20, s: 1.02 },
];

const ROCK_LOTS = [
  { x: -3, z: 5, s: 0.55 }, { x: 14, z: 1, s: 0.42 },
  { x: -22, z: 9, s: 0.5 }, { x: 22, z: 15, s: 0.46 },
];

const CANNON_HOME = { x: -18, z: 22 };
const STUDIO_HOUSE = {
  x: 0, z: -18, yaw: 0, r: 3.35,
  door: { x: 0, z: -13.8 },
  name: 'Studio House',
};

// The bears stay at 100% scale. The environment grows around them, while grass
// and flowers are shortened so they no longer compete with the villas.
const WORLD_SCALE = {
  house: 1.55,
  houseRadius: 1.10 * 1.55,
  houseDoor: 1.86 * 1.55,
  tree: 1.20,
  prop: 1.15,
  grassHeight: 0.70,
  flowerHeight: 0.65,
};

const rng = (seed) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

function grassTexture() {
  const W = 1024, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6dbd4b';
  ctx.fillRect(0, 0, W, H);
  const r = rng(731);
  // draw every soft blob at its wrapped positions too: the 4x3 lawn tile has
  // no visible seams, no repeated brightness gradient, and no dark bands.
  const blob = (x, y, rad, style) => {
    for (const ox of [-W, 0, W]) {
      for (const oy of [-H, 0, H]) {
        const g = ctx.createRadialGradient(x+ox, y+oy, 1, x+ox, y+oy, rad);
        g.addColorStop(0, style);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x+ox, y+oy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, rad = 16 + r() * 110;
    const shade = r();
    const style = shade < 0.32 ? 'rgba(178,228,128,0.14)'
      : shade < 0.68 ? 'rgba(48,118,38,0.12)'
      : 'rgba(205,236,150,0.10)';
    blob(x, y, rad, style);
  }
  // subtle clover/soil speckles (also wrapped so the edge is invisible)
  for (let i = 0; i < 3400; i++) {
    const x = r() * W, y = r() * H;
    ctx.fillStyle = r() < 0.5 ? 'rgba(45,103,34,0.14)' : 'rgba(198,235,140,0.12)';
    for (const ox of [-W,0,W]) for (const oy of [-H,0,H]) {
      if (x+ox > -2 && x+ox < W+2 && y+oy > -2 && y+oy < H+2) ctx.fillRect(x+ox, y+oy, 1.3, 1.3);
    }
  }
  // Fine blade strokes make the ground readable at close range without a
  // second full-screen texture sample.
  ctx.lineCap = 'round';
  for (let i = 0; i < 3200; i++) {
    const x = r() * W, y = r() * H;
    const len = 2 + r() * 9;
    const lean = (r() - .5) * 4.2;
    ctx.strokeStyle = r() < .6
      ? `rgba(34,91,27,${.12 + r() * .20})`
      : `rgba(196,235,142,${.10 + r() * .17})`;
    ctx.lineWidth = .6 + r() * 1.4;
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      if (x + ox < -20 || x + ox > W + 20 || y + oy < -20 || y + oy > H + 20) continue;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(x + ox + lean * .45, y + oy - len * .55, x + ox + lean, y + oy - len);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 7);
  tex.anisotropy = 8;
  return tex;
}
function blobCanvas(size, inner = 'rgba(40,32,24,.40)', mid = 'rgba(40,32,24,.18)') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 1, size/2, size/2, size/2);
  g.addColorStop(0, inner); g.addColorStop(0.45, mid); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

function cloudSmokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(48,48,2,48,48,46);
  g.addColorStop(0,'rgba(255,255,255,.55)');
  g.addColorStop(.5,'rgba(255,255,255,.18)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,96,96);
  return c;
}

function fireflyTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(.18, 'rgba(255,244,160,.95)');
  g.addColorStop(.48, 'rgba(255,205,90,.35)');
  g.addColorStop(1, 'rgba(255,190,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function tube(a, b, radius, color) {
  // small helper for a cylinder between two points
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(radius * 0.8, radius, len, 7);
  g.translate(0, len / 2, 0);
  const m = new THREE.Mesh(g, color);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  return m;
}

function outlineShape(rx, rz, seed = 1, wobble = 0.075) {
  const r = rng(seed);
  const phases = [r() * 6.28, r() * 6.28, r() * 6.28];
  const shape = new THREE.Shape();
  const pts = [];
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + wobble * Math.sin(a * 3 + phases[0]) + wobble * 0.55 * Math.sin(a * 5 + phases[1]) + wobble * 0.3 * Math.cos(a * 7 + phases[2]);
    pts.push(new THREE.Vector2(Math.cos(a) * rx * k, Math.sin(a) * rz * k));
  }
  shape.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
  shape.closePath();
  return { shape, pts };
}

function localMatrix({ x=0,y=0,z=0, rx=0,ry=0,rz=0, sx=1,sy=1,sz=1 }) {
  const d = new THREE.Object3D();
  d.position.set(x,y,z); d.rotation.set(rx,ry,rz); d.scale.set(sx,sy,sz);
  d.updateMatrix();
  return d.matrix.clone();
}

function instanced(geo, mat, parts, reflect = false, sceneGroup) {
  const mesh = new THREE.InstancedMesh(geo, mat, parts.length);
  const m = new THREE.Matrix4();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    mesh.setMatrixAt(i, p.m);
    if (p.c !== undefined) mesh.setColorAt(i, p.c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  if (reflect) mesh.layers.enable(REFLECT_LAYER);
  if (sceneGroup) sceneGroup.add(mesh);
  return mesh;
}

export function buildField({ scene, camera, renderer, sky }) {
  const group = new THREE.Group();
  group.name = 'gummyMeadow';
  group.visible = false;
  scene.add(group);

  const { hx, hz } = FIELD_BOUNDS;
  const wind = createWind();
  const nav = createNavMesh({
    minX: -hx, maxX: hx, minZ: -hz, maxZ: hz,
    cell: 0.8, agentRadius: 0.38, extraClearance: 0.10,
    insideBounds: (x, z, edge) => fieldInside(x, z, edge),
  });

  const colliders = [];
  const homes = [];
  const splashRings = [];
  const smokePuffs = [];
  const bubbles = [];
  const clock = new THREE.Clock();

  // Register the static layout before any scatter placement so grass, flowers,
  // paths and the nav bake all share the same obstacle footprints.
  for (const lot of HOUSE_LOTS) {
    const yaw = Math.atan2(-lot.x, -lot.z);
    const door = {
      x: lot.x + Math.sin(yaw) * WORLD_SCALE.houseDoor,
      z: lot.z + Math.cos(yaw) * WORLD_SCALE.houseDoor,
    };
    const r = WORLD_SCALE.houseRadius;
    homes.push({ ...lot, yaw, door, r, scale: WORLD_SCALE.house });
    colliders.push({ kind: 'house', x: lot.x, z: lot.z, r, y: 1.0 * WORLD_SCALE.house, name: lot.name, door });
    nav.addSolid({ kind: 'house', x: lot.x, z: lot.z, r, door, name: lot.name });
  }
  for (const lot of TREE_LOTS) {
    const s = lot.s * WORLD_SCALE.tree;
    const r = 0.33 * WORLD_SCALE.tree;
    colliders.push({ kind: 'tree', x: lot.x, z: lot.z, r, y: 1.1 * WORLD_SCALE.tree, canopy: 2.5 * s, scale: s });
    nav.addSolid({ kind: 'tree', x: lot.x, z: lot.z, r });
  }
  for (const lot of ROCK_LOTS) {
    const s = lot.s * WORLD_SCALE.prop;
    const r = 0.5 * s;
    colliders.push({ kind: 'rock', x: lot.x, z: lot.z, r, y: 0.35 * s, scale: s });
    nav.addSolid({ kind: 'rock', x: lot.x, z: lot.z, r });
  }
  colliders.push({
    kind: 'studio', x: STUDIO_HOUSE.x, z: STUDIO_HOUSE.z, r: STUDIO_HOUSE.r,
    y: 1.7, name: STUDIO_HOUSE.name, door: STUDIO_HOUSE.door,
  });
  nav.addSolid({
    kind: 'studio', x: STUDIO_HOUSE.x, z: STUDIO_HOUSE.z, r: STUDIO_HOUSE.r,
    door: STUDIO_HOUSE.door, name: STUDIO_HOUSE.name,
  });
  nav.addSolid({ kind: 'pond', x: POND.x, z: POND.z, rx: POND.rx, rz: POND.rz });

  // ---------------------------------------------------------------- materials
  const wallMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.4, metalness: 0,
  });
  const roofMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.06,
    transmission: 0.16, thickness: 0.45, ior: 1.42, attenuationColor: 0x7a2030, attenuationDistance: 1.5,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd7b16b, metalness: 0.75, roughness: 0.25 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xefe4c9, roughness: 0.8 });
  const stoneFlatMat = new THREE.MeshStandardMaterial({ color: 0xf2e7cf, roughness: 0.85 });
  const doorMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.25,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a27, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe0a0, emissive: 0xffb24a, emissiveIntensity: 0.45, roughness: 0.28, metalness: 0,
  });
  const leafMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.18,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08,
    transmission: 0.13, thickness: 0.45, ior: 1.42, attenuationColor: 0x2d7a24, attenuationDistance: 1.6,
  });
  const barkMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, clearcoat: 0.35 });
  const candyStripeMat = new THREE.MeshPhysicalMaterial({ color: 0xfff2dc, roughness: 0.2, clearcoat: 1 });
  const fruitMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
  const flowerBlossomMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08,
    transmission: 0.16, thickness: 0.1, ior: 1.4,
  });
  const flowerCenterMat = new THREE.MeshStandardMaterial({ color: 0xfff2a3, emissive: 0xffd35c, emissiveIntensity: 0.25, roughness: 0.4 });
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x4f9a41 });
  const sandMat = new THREE.MeshPhysicalMaterial({ color: 0xd8c4a0, roughness: 0.82, clearcoat: 0.16 });
  const pebbleMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, clearcoat: 0.5 });
  const padMat = new THREE.MeshPhysicalMaterial({ color: 0x66b85b, roughness: 0.25, clearcoat: 0.7 });

  // ---------------------------------------------------------------- dirt trails
  // The trail network is authored, but its ground footprint is one shared mask:
  // the lawn paints soil from it and the grass shrinks/tints over the same mask,
  // so the edge reads as grass thinning into a worn path rather than a decal.
  const trailHub = { x: 0, z: 0 };
  const pondShore = { x: POND.x + POND.rx * 0.92, z: POND.z + 0.4 };
  const trailRoutes = [
    { w: .78, pts: [{x:10,z:47},{x:5,z:33},{x:1,z:23},{x:4,z:15},{x:-1,z:7},trailHub] },
    { w: .64, pts: [trailHub,{x:-3,z:-2.8},homes[0].door] },
    { w: .58, pts: [homes[0].door,{x:-12,z:-8},{x:-13,z:-1},{x:-9,z:4},homes[1].door] },
    { w: .54, pts: [homes[1].door,{x:-15,z:12},{x:-24,z:8},{x:-31,z:-4},{x:-28,z:-11},homes[7].door] },
    { w: .62, pts: [trailHub,{x:4,z:-3},{x:3,z:-9},homes[2].door,{x:8,z:-12},{x:10,z:-8},homes[3].door] },
    { w: .58, pts: [homes[3].door,{x:16,z:-8},{x:23,z:-4},homes[6].door,{x:27,z:3},{x:23,z:10},homes[5].door,{x:16,z:6},homes[4].door] },
    { w: .52, pts: [homes[4].door,{x:9,z:5},{x:5,z:4},trailHub] },
    { w: .52, pts: [trailHub,{x:-2,z:3},{x:-7,z:2},pondShore] },
    { w: .66, pts: [trailHub,{x:-2,z:-5},{x:1,z:-10},{x:-1,z:-12},STUDIO_HOUSE.door] },
    { w: .46, pts: [trailHub,{x:-6,z:10},{x:-15,z:18},{x:-30,z:22},{x:-46,z:14},{x:-55,z:0},{x:-48,z:-18},{x:-34,z:-26},{x:-15,z:-28},{x:2,z:-25},{x:18,z:-31},{x:33,z:-26},{x:46,z:-10},{x:50,z:10},{x:39,z:27},{x:22,z:38},{x:8,z:42},trailHub] },
  ];
  const pathMaskExtent = (FIELD_RADIUS + 8) * 2;
  const pathMaskRes = 1024;
  const pathCanvas = document.createElement('canvas');
  pathCanvas.width = pathCanvas.height = pathMaskRes;
  const pathCtx = pathCanvas.getContext('2d', { willReadFrequently: true });
  pathCtx.fillStyle = '#000';
  pathCtx.fillRect(0, 0, pathMaskRes, pathMaskRes);
  const pathWorldToPx = (x, z) => [
    ((x + pathMaskExtent * .5) / pathMaskExtent) * pathMaskRes,
    ((z + pathMaskExtent * .5) / pathMaskExtent) * pathMaskRes,
  ];
  const pathRng = rng(552);
  const stampDirt = (x, z, radius, alpha) => {
    const [px, py] = pathWorldToPx(x, z);
    const r = (radius / pathMaskExtent) * pathMaskRes;
    if (r < .35) return;
    pathCtx.globalAlpha = alpha;
    pathCtx.beginPath();
    pathCtx.arc(px, py, r, 0, Math.PI * 2);
    pathCtx.fill();
  };
  pathCtx.fillStyle = '#fff';
  // Central dirt hub.
  for (let i = 0; i < 44; i++) {
    const a = pathRng() * Math.PI * 2, rr = pathRng() * .8;
    stampDirt(trailHub.x + Math.cos(a) * rr, trailHub.z + Math.sin(a) * rr,
      3.6 + pathRng() * 1.25, .75 + pathRng() * .25);
  }
  for (const route of trailRoutes) {
    const curve = new THREE.CatmullRomCurve3(route.pts.map(p => new THREE.Vector3(p.x, 0, p.z)));
    const n = Math.max(18, Math.round(curve.getLength() / .24));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = curve.getPoint(u);
      const tan = curve.getTangent(u);
      const nx = -tan.z, nz = tan.x;
      const wobble = Math.sin(i * .73 + route.w * 19.0) * .18 + (pathRng() - .5) * .16;
      const x = p.x + nx * wobble, z = p.z + nz * wobble;
      // Broad soft shoulder then a denser worn centre. The irregular stamp
      // radii create the ragged, nibbled grass boundary.
      stampDirt(x, z, route.w * (.62 + pathRng() * .22), .26);
      stampDirt(x, z, route.w * (.34 + pathRng() * .16), .72);
    }
    // A slightly wider landing at every door endpoint.
    const end = route.pts[route.pts.length - 1];
    stampDirt(end.x, end.z, route.w * .92, .68);
  }
  pathCtx.globalAlpha = 1;
  const pathMaskData = pathCtx.getImageData(0, 0, pathMaskRes, pathMaskRes).data;
  const pathValueAt = (x, z) => {
    if (x < -pathMaskExtent * .5 || x > pathMaskExtent * .5 || z < -pathMaskExtent * .5 || z > pathMaskExtent * .5) return 0;
    const ix = Math.max(0, Math.min(pathMaskRes - 1, Math.floor(((x + pathMaskExtent * .5) / pathMaskExtent) * pathMaskRes)));
    const iz = Math.max(0, Math.min(pathMaskRes - 1, Math.floor(((z + pathMaskExtent * .5) / pathMaskExtent) * pathMaskRes)));
    return pathMaskData[(iz * pathMaskRes + ix) * 4] / 255;
  };
  const pathMaskTex = new THREE.CanvasTexture(pathCanvas);
  pathMaskTex.colorSpace = THREE.NoColorSpace;
  pathMaskTex.minFilter = THREE.LinearFilter;
  pathMaskTex.magFilter = THREE.LinearFilter;
  pathMaskTex.wrapS = pathMaskTex.wrapT = THREE.ClampToEdgeWrapping;
  const pathMaskUniform = { value: pathMaskTex };
  const pathExtentUniform = { value: pathMaskExtent };

  // ---------------------------------------------------------------- lawn / hills
  const lawnTex = grassTexture();
  const lawn = new THREE.Mesh(
    new THREE.CircleGeometry(FIELD_RADIUS + 8, 128),
    new THREE.MeshLambertMaterial({
      map: lawnTex, color: 0x88a566,
    })
  );
  lawn.name = 'meadowLawn';
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.02;
  lawn.material.onBeforeCompile = (shader) => {
    shader.uniforms.uPathMask = pathMaskUniform;
    shader.uniforms.uPathExtent = pathExtentUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPathWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPathWorld = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uPathMask;\nuniform float uPathExtent;\nvarying vec2 vPathWorld;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float detailLum = dot(diffuseColor.rgb, vec3(.25, .62, .13));
        vec2 pathUv = (vPathWorld + uPathExtent * .5) / uPathExtent;
        float pathRaw = texture2D(uPathMask, pathUv).r;
        float pathNoise = sin(vPathWorld.x * 4.7 + vPathWorld.y * 3.1) * .035
                        + sin(vPathWorld.x * 1.7 - vPathWorld.y * 5.3) * .025;
        float path = smoothstep(.20, .62, pathRaw + pathNoise);
        vec3 soil = mix(vec3(.48,.35,.22), vec3(.68,.51,.32),
          .45 + .35 * sin(vPathWorld.x * .8 + vPathWorld.y * 1.3));
        diffuseColor.rgb = mix(diffuseColor.rgb, soil, path * .96);
        // The meadow disc lightens into the hill palette before the terrain
        // begins, so the circumference has no hard green-colour step.
        float edgeT = smoothstep(52.0, 69.0, length(vPathWorld));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.31,.49,.23), edgeT * .64);
        // A restrained Aero sheen: strongest at grazing angles and on the
        // darker grass detail, never glossy enough to read as glass.
        vec3 eyeV = normalize(cameraPosition - vec3(vPathWorld.x, 0.0, vPathWorld.y));
        float fres = pow(1.0 - clamp(eyeV.y, 0.0, 1.0), 3.0);
        float sheen = fres * (0.012 + 0.030 * (1.0 - detailLum));
        diffuseColor.rgb += vec3(.52,.79,.58) * sheen;
      `);
  };
  lawn.material.customProgramCacheKey = () => 'meadowLawnPathsV3';
  group.add(lawn);

  // Detailed rolling backdrop + layered low-LOD tree belts.
  const backdrop = createBackdrop();
  group.add(backdrop.group);

  // distant Frutiger-Aero skyline + windmills, safely outside the playable field
  const horizon = createHorizon();
  group.add(horizon.group);

  // ---------------------------------------------------------------- morning mist
  // A low, noise-driven pool of haze that only appears on some in-game mornings.
  // It is intentionally subtle and is not the old permanent cloud sprite bank.
  const mistUniforms = { uMist: { value: 0 }, uTime: { value: 0 } };
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    toneMapped: false, fog: false,
    uniforms: mistUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uMist, uTime;
      varying vec2 vUv;
      float mistHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float mistNoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), f.x),
                   mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main(){
        vec2 p = vUv * vec2(58.0, 42.0) + vec2(uTime * 0.035, uTime * 0.018);
        float n = mistNoise(p) * 0.62 + mistNoise(p * 2.1 - vec2(uTime * 0.02)) * 0.38;
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x)
                   * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
        float a = smoothstep(0.32, 0.72, n) * edge * uMist * 0.20;
        gl_FragColor = vec4(0.78, 0.90, 0.86, a);
      }
    `,
  });
  const mistMesh = new THREE.Mesh(new THREE.PlaneGeometry(118, 84), mistMat);
  mistMesh.name = 'meadowMist';
  mistMesh.rotation.x = -Math.PI / 2;
  mistMesh.position.y = 0.58;
  mistMesh.renderOrder = 4;
  mistMesh.visible = false;
  group.add(mistMesh);

  // ---------------------------------------------------------------- grass
  const grassGeo = (() => {
    const h = 0.62;
    // Five overlapping, tapered blades per tuft. Each blade is a five-vertex
    // three-triangle strip, so a full tuft is 15 triangles: the same triangle
    // budget as the old three-blade version, but with substantially more coverage.
    const pos = [], col = [], idx = [];
    const addBlade = (yaw, ox, oz, hs, width, lean) => {
      const ca = Math.cos(yaw), sa = Math.sin(yaw);
      const off = pos.length / 3;
      const hw = .074 * width;
      const verts = [
        [-hw, 0, 0, .18],
        [ hw, 0, 0, .18],
        [-hw * .58, h * .54 * hs, lean * .45, .40],
        [ hw * .58, h * .54 * hs, lean * .45, .40],
        [0, h * hs, lean, .62],
      ];
      for (const [x, y, z, shade] of verts) {
        pos.push(x * ca - z * sa + ox, y, x * sa + z * ca + oz);
        col.push(shade, shade, shade);
      }
      idx.push(off, off + 2, off + 1, off + 1, off + 2, off + 3, off + 2, off + 4, off + 3);
    };
    addBlade(0.00,  0.000,  0.000, 1.00, 1.00, 0.060);
    addBlade(1.02,  0.074,  0.022, 0.93, 0.88, -0.050);
    addBlade(2.12, -0.062,  0.048, 0.84, 0.96, 0.090);
    addBlade(3.08,  0.018, -0.076, 0.72, 0.78, -0.075);
    addBlade(4.04, -0.052, -0.034, 0.63, 0.70, 0.045);
    addBlade(5.10,  0.048, -0.014, 0.43, 1.22, -0.035);
    addBlade(5.85, -0.018,  0.066, 0.35, 1.08, 0.060);
    // two low, wide skirt blades close the ground gaps between neighbouring tufts
    addBlade(0.72,  0.108, -0.045, 0.29, 2.15, -0.060);
    addBlade(3.56, -0.112,  0.052, 0.25, 1.95, 0.075);

    // Very low, broad cover fans close the remaining lawn gaps. These are only
    // two triangles each, and they never read as tall spikes.
    const addCover = (yaw, ox, oz, height, width, lean) => {
      const ca = Math.cos(yaw), sa = Math.sin(yaw);
      const off = pos.length / 3;
      const hw = .105 * width;
      const verts = [
        [-hw, 0, 0, .20],
        [ hw, 0, 0, .20],
        [-hw * .60, height, lean, .38],
        [ hw * .60, height, lean, .38],
      ];
      for (const [x, y, z, shade] of verts) {
        pos.push(x * ca - z * sa + ox, y, x * sa + z * ca + oz);
        col.push(shade, shade, shade);
      }
      idx.push(off, off + 2, off + 1, off + 1, off + 2, off + 3);
    };
    addCover(0.52,  0.112, -0.028, 0.19, 1.85, -0.045);
    addCover(2.18, -0.096,  0.078, 0.16, 1.70, 0.070);
    addCover(4.06,  0.040, -0.112, 0.21, 1.95, -0.060);
    addCover(5.48, -0.084, -0.072, 0.14, 1.60, 0.050);
    addCover(1.34,  0.126, -0.022, 0.13, 2.25, -0.035);
    addCover(4.92, -0.128,  0.030, 0.11, 2.10, 0.055);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();

  const grassBears = new Float32Array(48 * 4);
  const grassBearCount = { value: 0 };
  const grassCoverage = { value: 1 };
  const grassDrawDistance = { value: 56 };
  const grassMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, side: THREE.DoubleSide, vertexColors: true,
  });
  grassMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wind.uniforms);
    shader.uniforms.uBears = { value: grassBears };
    shader.uniforms.uBearCount = grassBearCount;
    shader.uniforms.uGrassCoverage = grassCoverage;
    shader.uniforms.uGrassDrawDistance = grassDrawDistance;
    shader.uniforms.uPathMask = pathMaskUniform;
    shader.uniforms.uPathExtent = pathExtentUniform;
    shader.vertexShader = WIND_GLSL
      + '\nuniform vec4 uBears[48];\nuniform int uBearCount;'
      + '\nuniform float uGrassCoverage;\nuniform float uGrassDrawDistance;'
      + '\nuniform sampler2D uPathMask;\nuniform float uPathExtent;'
      + '\nvarying float vPathDirt;\n'
      + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        float wx = instanceMatrix[3].x;
        float wz = instanceMatrix[3].z;
        float hh = clamp(position.y / 0.62, 0.0, 1.0);
        vec2 wp = vec2(wx, wz);
        float phase = fract(sin(dot(wp, vec2(12.9898, 78.233))) * 43758.5453) * 6.283;

        // Camera-relative density LOD: the meadow carries a full dense carpet
        // near the camera and thins stochastically with distance. Blades are
        // world-stable; the stochastic field uses world position, not screen.
        float camDist = distance(wp, cameraPosition.xz);
        float farFade = 1.0 - smoothstep(uGrassDrawDistance, uGrassDrawDistance + 12.0, camDist);
        float keep = 1.0;
        if (camDist > 24.0) {
          float t = clamp((camDist - 24.0) / max(8.0, uGrassDrawDistance - 24.0), 0.0, 1.0);
          float density = 1.0 - 0.82 * t * t;
          float rnd = fract(sin(dot(wp, vec2(12.9898, 78.233))) * 43758.5453);
          keep = step(rnd, density);
        }
        float coverage = step(
          fract(sin(dot(wp + vec2(7.13, 3.31), vec2(41.93, 91.17))) * 43758.5453),
          uGrassCoverage
        );
        float lod = keep * farFade * coverage;
        if (lod < 0.02) {
          transformed = vec3(0.0);
        } else {
          transformed.y *= farFade;
          transformed.xz *= mix(0.25, 1.0, farFade);

          // Shared world-space wind + the existing bear-parting field. Both are
          // built in world space, then converted through this instance's basis,
          // so random yaw and non-uniform scale do not spin the wind direction.
          vec2 windW = meadowWindVec(wp, phase) * (0.24 * hh * hh);
          windW += vec2(
            sin(uWindTime * 2.7 + phase * 3.7 + wp.x * 0.9) * 0.018,
            cos(uWindTime * 2.3 + phase * 4.1 - wp.y * 0.8) * 0.018
          ) * hh;

          vec2 bendW = windW;
          for (int bi = 0; bi < 48; bi++) {
            if (bi >= uBearCount) break;
            vec4 bd = uBears[bi];
            vec2 dv = wp - bd.xy;
            float dl = length(dv);
            float infl = smoothstep(1.25, 0.10, dl);
            if (infl > 0.0) {
              float speed = length(bd.zw);
              bendW += (dv / max(dl, 0.001)) * infl * (0.17 + 0.08 * min(speed, 2.0)) * hh * hh;
            }
          }
          vec2 ax = normalize(instanceMatrix[0].xz + vec2(0.00001));
          vec2 az = normalize(instanceMatrix[2].xz + vec2(0.00001));
          float iscale = max(0.001, length(instanceMatrix[0].xyz));
          vec2 localBend = vec2(dot(bendW, ax), dot(bendW, az)) / iscale;
          transformed.x += localBend.x;
          transformed.z += localBend.y;
        }

        // Same authored path mask as the lawn. Blades shrink to tiny stubble at
        // the centre and fade out over the ragged shoulder; the soil tint keeps
        // the remaining short blades from speckling the trail.
        vec2 pathBase = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        float pathRaw = texture2D(uPathMask, (pathBase + uPathExtent * .5) / uPathExtent).r;
        vPathDirt = smoothstep(.04, .50, pathRaw);
        if (vPathDirt > .34) {
          transformed = vec3(0.0); // no blades on the dirt footprint
        } else {
          transformed.y *= 1.0 - vPathDirt * .98;
        }
      #endif
    `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPathDirt;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.48,.35,.22), vPathDirt * .62);
      `)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        // Blade normals are flattened to up so the field does not shimmer or
        // turn black when a double-sided card is viewed from behind.
        normal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
      `);
  };
  grassMat.customProgramCacheKey = () => 'meadowGrassV8';

  const grassChunks = [];
  let grassEnabled = true;
  {
    const chunkW = 23, chunkH = 20;
    const buckets = new Map();
    const gr = rng(6001);
    const hash = (x, z) => {
      const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
      return n - Math.floor(n);
    };
    const add = (x, z, scale, hueT, lightT) => {
      if (solidAt(x, z, 0.055)) return;
      const cx = Math.floor((x + hx) / chunkW);
      const cz = Math.floor((z + hz) / chunkH);
      const key = cx + ':' + cz;
      let parts = buckets.get(key);
      if (!parts) { parts = []; buckets.set(key, parts); }
      const col = new THREE.Color().setHSL(0.232 + hueT * 0.055, 0.62 + hueT * 0.16, 0.25 + lightT * 0.14);
      parts.push({
        m: localMatrix({
          x, y: 0, z,
          ry: gr() * Math.PI * 2,             // full horizontal rotation
          rx: (gr() - 0.5) * 0.15,            // ±4.3° vertical tilt
          rz: (gr() - 0.5) * 0.15,
          sx: scale, sy: scale * (0.58 + gr() * 0.36) * WORLD_SCALE.grassHeight, sz: scale,
        }),
        c: col,
      });
    };

    // Area-weighted circular scatter. Keep the old village-core density and
    // carry a lighter but continuous carpet through the new outer ring.
    const CORE_R = 43;
    const TARGET_CORE = 50000;
    const TARGET_OUTER = 38000;
    let total = 0, tries = 0;
    const R = FIELD_RADIUS + 3.2; // visual apron continues into the hill toe
    const R2 = R * R, CORE_R2 = CORE_R * CORE_R;
    const place = (outer) => {
      const a = gr() * Math.PI * 2;
      const r = outer
        ? Math.sqrt(CORE_R2 + gr() * (R2 - CORE_R2))
        : Math.sqrt(gr()) * CORE_R;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!outer && !fieldInside(x, z, 0.9)) return false;
      if (outer && r > R) return false;
      // Keep the authored dirt clear: no tuft root on the trail, plus a short
      // shoulder clearance so wide/leaning tufts cannot grow over the edge.
      if (pathValueAt(x, z) > .04) return false;
      for (const [ox, oz] of [[.24, 0], [-.24, 0], [0, .24], [0, -.24]]) {
        if (pathValueAt(x + ox, z + oz) > .14) return false;
      }
      const patch = 0.92 + 0.07 * Math.sin(x * 0.19 + Math.sin(z * 0.13) * 2.1)
                          + 0.04 * Math.cos(z * 0.23 - x * 0.07);
      if (gr() > patch) return false;
      if (solidAt(x, z, 0.055)) return false;
      const scale = (0.52 + gr() * 0.34) * (0.84 + gr() * 0.34);
      add(x, z, scale, gr(), gr());
      return true;
    };
    while (total < TARGET_CORE && tries++ < TARGET_CORE * 1.8) {
      if (place(false)) total++;
    }
    tries = 0;
    while (total < TARGET_CORE + TARGET_OUTER && tries++ < TARGET_OUTER * 2.2) {
      if (place(true)) total++;
    }
    for (const [key, parts] of buckets) {
      if (!parts.length) continue;
      const [cx, cz] = key.split(':').map(Number);
      const mesh = instanced(grassGeo, grassMat, parts, false, group);
      mesh.name = 'meadowGrassChunk';
      mesh.frustumCulled = true;
      mesh.computeBoundingSphere();
      grassChunks.push({
        mesh,
        center: new THREE.Vector3(cx * chunkW - hx + chunkW * .5, .4, cz * chunkH - hz + chunkH * .5),
      });
    }
    group.userData.grassBlades = total;
    group.userData.grassChunks = grassChunks.length;
  }

  // ---------------------------------------------------------------- placement helpers
  // make sure props do not register on top of each other
  function solidAt(x, z, pad = 0) {
    if (!fieldInside(x, z, 0.6)) return true;
    for (const c of colliders) {
      const rr = (c.r || 0.35) + pad;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) return true;
    }
    const px = (x - POND.x) / (POND.rx + pad * 0.6);
    const pz = (z - POND.z) / (POND.rz + pad * 0.6);
    return px * px + pz * pz < 1;
  }

  // Dirt trail geometry is painted into the shared path mask above.
  const pathStones = [];

  // ---------------------------------------------------------------- flowers
  {
    const stemGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.44, 5);
    const profile = [
      new THREE.Vector2(0.00, 0.0), new THREE.Vector2(0.035, 0.008),
      new THREE.Vector2(0.085, 0.06), new THREE.Vector2(0.115, 0.14),
      new THREE.Vector2(0.10, 0.19), new THREE.Vector2(0.06, 0.205),
      new THREE.Vector2(0.048, 0.18),
    ];
    const blossomGeo = new THREE.LatheGeometry(profile, 10);
    const centerGeo = new THREE.SphereGeometry(0.028, 8, 6);
    const stems = [], blooms = [], centers = [];
    const fr = rng(9101);
    const palette = [0xff86ad, 0xffb05c, 0xffdf6a, 0xd28cff, 0xffd6e6, 0x86e5d5];
    const clusters = [
      [-4, 4, 2.5], [6, 7, 2.2], [-3, -4, 2.4], [9, -1, 2.4], [-10, 1, 2.5],
      [0, 9, 2.0], [17, 8, 2.6], [-14, -4, 2.2], [22, -8, 2.4], [-20, 14, 2.3],
      [0, 15, 3.4], [-8, 13, 2.8], [9, 15, 3.0], [4, 21, 2.6], [-5, 22, 2.7],
      [34, 28, 4.2], [-34, 20, 4.0], [28, -30, 4.2], [-24, -34, 3.8],
      [48, -2, 3.6], [-44, 36, 4.0], [14, 44, 3.8], [-8, -42, 3.6],
    ];
    let tries = 0;
    while (blooms.length < 190 && tries++ < 4500) {
      const cl = clusters[Math.floor(fr() * clusters.length)];
      const a = fr() * Math.PI * 2, rr = Math.sqrt(fr()) * cl[2];
      const x = cl[0] + Math.cos(a) * rr, z = cl[1] + Math.sin(a) * rr;
      if (!fieldInside(x, z, 1.0)) continue;
      if (pathValueAt(x, z) > .35) continue;
      if (solidAt(x, z, 0.28)) continue;
      if ((x*x)/(POND.rx*POND.rx) + ((z-POND.z)*(z-POND.z))/(POND.rz*POND.rz) < 1.15) continue;
      if (x*x + z*z < 4.5) continue;
      const s = 0.62 + fr() * 1.05;
      const fs = WORLD_SCALE.flowerHeight;
      const stemH = 0.44 * s * fs;
      const col = new THREE.Color(palette[Math.floor(fr() * palette.length)]);
      stems.push({ m: localMatrix({ x, y: stemH * 0.5, z, ry: fr()*6.283, sx: s, sy: s * fs, sz: s }), c: new THREE.Color(0x5a9e48) });
      blooms.push({ m: localMatrix({ x, y: stemH, z, ry: fr()*6.283, sx: s * .92, sy: s * .84, sz: s * .92 }), c: col });
      centers.push({ m: localMatrix({ x, y: stemH + 0.10 * s * fs, z, sx: s * .84, sy: s * .84, sz: s * .84 }), c: new THREE.Color(0xffe98d) });
    }
    const flowerStems = instanced(stemGeo, stemMat, stems, false, group);
    const flowerBlooms = instanced(blossomGeo, flowerBlossomMat, blooms, false, group);
    const flowerCenters = instanced(centerGeo, flowerCenterMat, centers, false, group);
    flowerStems.name = 'meadowFlowerStems';
    flowerBlooms.name = 'meadowFlowerBlooms';
    flowerCenters.name = 'meadowFlowerCenters';
  }

  // ---------------------------------------------------------------- candy trees
  const treeGroup = new THREE.Group();
  treeGroup.name = 'meadowTrees';
  group.add(treeGroup);
  const trees = createTreeCollection({
    lots: TREE_LOTS.map(lot => ({ ...lot, s: lot.s * WORLD_SCALE.tree })),
    wind,
  });
  treeGroup.add(trees.group);
  group.userData.treeStats = trees.stats;

  // static ground mushrooms near the left-hand trees (not part of the swaying
  // tree batches; they stay tucked into the grass as before)
  {
    const mushroomStems = [], mushroomCaps = [];
    const mr = rng(742);
    for (const lot of TREE_LOTS) {
      if (lot.x >= 0) continue;
      for (let mcount = 0; mcount < 2; mcount++) {
        const mx = lot.x + (mr() - 0.5) * 1.2, mz = lot.z + (mr() - 0.5) * 1.2;
        mushroomStems.push({ m: localMatrix({ x: mx, y: 0.09, z: mz, sx: 0.7, sy: 0.7, sz: 0.7 }), c: new THREE.Color(0xfce8d3) });
        mushroomCaps.push({ m: localMatrix({ x: mx, y: 0.2, z: mz, ry: mr() * 6.283, sx: 0.8, sy: 0.45, sz: 0.8 }), c: new THREE.Color(0xe86d78) });
      }
    }
    instanced(new THREE.CylinderGeometry(0.035, 0.05, 0.18, 6), stemMat, mushroomStems, false, treeGroup);
    instanced(new THREE.SphereGeometry(0.14, 8, 6), leafMat, mushroomCaps, false, treeGroup);
  }

  // ---------------------------------------------------------------- Aero cottages
  const houseGroup = new THREE.Group();
  houseGroup.name = 'meadowHouses';
  group.add(houseGroup);
  const aeroHomes = createAeroHomes({ homes, scale: WORLD_SCALE.house });
  houseGroup.add(aeroHomes.group);
  // The large central-north Studio landmark is a portal, not a ninth home.
  const studioHouse = createStudioHouse(STUDIO_HOUSE);
  houseGroup.add(studioHouse.group);
  // static chimney smoke is gone: the Aero villas use glass/light accents rather
  // than candy chimneys. The shared smokePuffs list stays empty.

  // ---------------------------------------------------------------- rocks
  {
    const geo = new THREE.IcosahedronGeometry(0.55, 1);
    const parts = ROCK_LOTS.map(r => {
      const s = r.s * WORLD_SCALE.prop;
      return {
        m: localMatrix({ x: r.x, y: 0.26 * s, z: r.z, ry: Math.random()*6.283, sx: s, sy: s*0.7, sz: s*0.9 }),
        c: new THREE.Color().setHSL(0.30, 0.14, 0.48 + Math.random()*0.1),
      };
    });
    instanced(geo, pebbleMat, parts, false, group);
  }

  // ---------------------------------------------------------------- bushes
  // Branched shrubs fill the new playable ring and soften the trail edges. The
  // smaller ones are walk-through; only the largest get collision/nav solids.
  const bushLots = [];
  {
    const br = rng(9917);
    let attempts = 0;
    while (bushLots.length < 86 && attempts++ < 900) {
      const a = br() * Math.PI * 2;
      const rr = 29 + Math.sqrt(br()) * (FIELD_RADIUS - 34);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (!fieldInside(x, z, 2.2)) continue;
      if (pathValueAt(x, z) > .16) continue;
      if (solidAt(x, z, .62)) continue;
      if (homes.some(h => Math.hypot(x - h.door.x, z - h.door.z) < 2.6)) continue;
      if (Math.hypot(x - STUDIO_HOUSE.door.x, z - STUDIO_HOUSE.door.z) < 3.2) continue;
      if (bushLots.some(b => Math.hypot(x - b.x, z - b.z) < 3.0)) continue;
      const scale = .58 + br() * .82;
      bushLots.push({ x, z, scale, y: 0 });
      if (scale > .92) {
        const r = .34 * scale;
        colliders.push({ kind: 'bush', x, z, r, y: .55, scale });
        nav.addSolid({ kind: 'bush', x, z, r });
      }
    }
    // A denser shrub belt just inside the rim breaks the last hard silhouette
    // against the hills. These are deliberately visual-only; the playable
    // boundary remains clear and readable.
    for (let i = 0; i < 34; i++) {
      const a = br() * Math.PI * 2;
      const rr = 59.0 + br() * 5.0;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (pathValueAt(x, z) > .20) continue;
      if (colliders.some(c => Math.hypot(x - c.x, z - c.z) < (c.r || .3) + 1.2)) continue;
      const scale = .64 + br() * .78;
      bushLots.push({ x, z, scale, y: 0 });
    }
  }
  // A second, visual-only ring of branched shrubs sits just outside the walkable
  // edge and overlaps the hill toe. This is the final soft silhouette between
  // the meadow and the backdrop terrain.
  {
    const br = rng(4521);
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2 + (br() - .5) * .10;
      const rr = 64.2 + br() * 8.0;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (colliders.some(c => Math.hypot(x - c.x, z - c.z) < (c.r || .3) + 1.1)) continue;
      const y = backdrop.heightAt(x, z) - .04;
      bushLots.push({ x, z, y, scale: .64 + br() * .82 });
    }
  }
  const bushes = createBushCollection({ lots: bushLots });
  group.add(bushes.group);
  group.userData.bushes = bushes.count;

  // ---------------------------------------------------------------- pond
  const pond = {
    ...POND,
    contains(x, z) {
      const dx = (x - POND.x) / POND.rx, dz = (z - POND.z) / POND.rz;
      return dx * dx + dz * dz < 1;
    },
    nearestShore(x, z) {
      const dx = x - POND.x, dz = z - POND.z;
      const d = Math.hypot(dx, dz) || 1;
      const a = Math.atan2(dz, dx);
      return {
        x: POND.x + Math.cos(a) * POND.rx * 1.12,
        z: POND.z + Math.sin(a) * POND.rz * 1.12,
      };
    },
  };

  const pondGroup = new THREE.Group();
  pondGroup.name = 'meadowPond';
  pondGroup.position.set(POND.x, 0, POND.z);
  group.add(pondGroup);

  const { shape: waterShape, pts: outlinePts } = outlineShape(POND.rx * 0.98, POND.rz * 0.98, 33, 0.06);
  // bank ring: outer outline with the water outline as a hole
  {
    const outer = outlineShape(POND.rx * 1.15, POND.rz * 1.15, 33, 0.06);
    const bankShape = new THREE.Shape();
    handShapeFromPoints(bankShape, outer.pts);
    const hole = new THREE.Path();
    handPathFromPoints(hole, outlinePts);
    bankShape.holes.push(hole);
    const bankGeo = new THREE.ShapeGeometry(bankShape, 24);
    const bank = new THREE.Mesh(bankGeo, sandMat);
    bank.rotation.x = -Math.PI / 2;
    bank.position.y = 0.012;
    pondGroup.add(bank);
    const edgePts = outlinePts.map(p => new THREE.Vector3(p.x, 0.052, -p.y));
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edgePts),
      new THREE.LineBasicMaterial({ color: 0x577f75, transparent: true, opacity: 0.55 }));
    pondGroup.add(edge);
  }

  function handShapeFromPoints(shape, pts) {
    shape.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
    shape.closePath();
  }
  function handPathFromPoints(path, pts) {
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    path.closePath();
  }

  // water reflector
  const waterGeo = new THREE.ShapeGeometry(waterShape, 32);
  const waterUniforms = {
    color: { value: new THREE.Color(0x4e7c78) },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.7, 0.3, -0.4) },
    uMoonDir: { value: new THREE.Vector3(0.7, 0.4, 0.4) },
    uSunColor: { value: new THREE.Color(0xffd49c) },
    uMoonColor: { value: new THREE.Color(0xc9dcff) },
    uDeep: { value: new THREE.Color(0x133d4a) },
    uShallow: { value: new THREE.Color(0x3fa9a2) },
    uAnime: { value: .68 },
    uCellScale: { value: 1.2 },
    uPondCenter: { value: new THREE.Vector2(POND.x, POND.z) },
    uPondRadii: { value: new THREE.Vector2(POND.rx * .98, POND.rz * .98) },
    uRippleCenters: { value: Array.from({ length: 4 }, () => new THREE.Vector2(POND.x, POND.z)) },
    uRippleT: { value: [0, 0, 0, 0] },
    uRippleCount: { value: 0 },
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vWorld;
      void main(){
        vUv = textureMatrix * vec4(position, 1.0);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uAnime;
      uniform float uCellScale;
      uniform vec3 uSunDir, uMoonDir, uSunColor, uMoonColor, uDeep, uShallow, color;
      uniform vec2 uPondCenter, uPondRadii;
      uniform vec2 uRippleCenters[4];
      uniform float uRippleT[4];
      uniform int uRippleCount;
      varying vec4 vUv;
      varying vec3 vWorld;

      vec2 whash(vec2 p){
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }
      float wsmin(float a, float b, float k){
        float h = max(k - abs(a - b), 0.0) / k;
        return min(a, b) - h * h * h * k / 6.0;
      }
      vec2 wcell(vec2 seed){ return .5 + .5 * sin(uTime * .14 + 6.2831 * seed); }
      float wf1(vec2 p){
        vec2 i = floor(p), f = fract(p);
        float md = 8.0;
        for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++){
          vec2 n = vec2(float(x), float(y));
          md = min(md, length(n + wcell(whash(i + n)) - f));
        }
        return md;
      }
      float wsf1(vec2 p){
        vec2 i = floor(p), f = fract(p);
        float res = 8.0;
        for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++){
          vec2 n = vec2(float(x), float(y));
          res = wsmin(res, length(n + wcell(whash(i + n)) - f), .58);
        }
        return res;
      }

      void main(){
        vec2 p = vWorld.xz;
        float r1 = sin(p.x * 0.72 + uTime * 0.75) * cos(p.y * 0.91 - uTime * 0.57);
        float r2 = sin((p.x + p.y) * 0.47 - uTime * 0.44) * 0.7 + sin((p.x - p.y) * 0.83 + uTime * 0.31) * 0.3;
        vec3 N = normalize(vec3(r1 * 0.07, 1.0, r2 * 0.07));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
        vec4 uv = vUv;
        // subtle mirror ripple (projected coordinates)
        uv.xy += vec2(r1, r2) * 0.0032 * uv.w;
        vec3 refl = texture2DProj(tDiffuse, uv).rgb;
        vec3 base = mix(uDeep, uShallow, 0.45 + 0.35 * r2);
        // Keep more of the pond's own ink/teal colour than the raw mirror. The
        // reflection is still present, but does not wash the pond white under a
        // bright noon sky.
        vec3 col = mix(base, refl, clamp(0.28 + fres * 0.42, 0.0, 0.72));
        col = mix(col, mix(uDeep, uShallow, .70), .26);

        // Anime/Aero cell lines. World-locked, slow and low-contrast so the pond
        // still reads as water rather than a tiled swimming pool.
        vec2 cellUv = p * uCellScale + vec2(uTime * .018, -uTime * .011);
        float f1 = wf1(cellUv);
        float sf1 = wsf1(cellUv);
        float cellEdge = f1 - sf1;
        float cell = smoothstep(.048, .088, cellEdge);
        col = mix(col, vec3(.54,.94,.94), cell * uAnime * .36);

        // Hard-edged shoreline foam, following the pond shape but nibbled by
        // the same wave field so it is not a vector outline.
        vec2 ep = (p - uPondCenter) / uPondRadii;
        float er = length(ep) + (r1 + r2) * .014;
        float foam = smoothstep(.905, .958, er) * (1.0 - smoothstep(.985, 1.015, er));
        col = mix(col, vec3(.84,.99,.96), foam * uAnime * .68);

        // Splash rings: four active impact events are fed from the existing
        // splash-ring state. Rings are intentionally sharp and cyan on the crest.
        float rip = 0.0;
        for (int i = 0; i < 4; i++){
          if (i >= uRippleCount) break;
          float age = uRippleT[i];
          float d = length(p - uRippleCenters[i]);
          float rad = age * 1.55;
          float ring = 1.0 - smoothstep(.018, .095, abs(d - rad));
          rip += ring * exp(-age * 1.25);
        }
        col = mix(col, vec3(.80,1.0,.98), clamp(rip, 0.0, 1.0) * .62);

        // sun and moon glints on the ripples
        vec3 R = reflect(-uSunDir, N);
        float sunSpec = pow(max(dot(R, V), 0.0), 260.0) * 2.8;
        vec3 Rm = reflect(-uMoonDir, N);
        float moonSpec = pow(max(dot(Rm, V), 0.0), 380.0) * 1.8;
        col += uSunColor * sunSpec;
        col += uMoonColor * moonSpec;
        float sparkle = pow(max(0.0, sin(p.x*4.2 + uTime*1.8) * sin(p.y*3.4 - uTime*1.4)), 12.0) * 0.045;
        col += vec3(sparkle);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const reflector = new Reflector(waterGeo, {
    clipBias: 0.003,
    textureWidth: 512,
    textureHeight: 512,
    color: 0x7a9d96,
    multisample: 0,
    shader: {
      name: 'GummyWater',
      uniforms: waterUniforms,
      vertexShader: waterMat.vertexShader,
      fragmentShader: waterMat.fragmentShader,
    },
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = POND.waterY;
  reflector.layers.set(0); // main camera only; its reflection is not self-reflected
  pondGroup.add(reflector);
  // Reflector's material gets the custom uniforms; keep sun colors
  reflector.material.uniforms.uSunDir = waterUniforms.uSunDir;
  reflector.material.uniforms.uMoonDir = waterUniforms.uMoonDir;
  // The Reflector clones uniforms. Point all *custom* uniforms at the live
  // objects so the sky/water animation updates the material that actually renders.
  const ru = reflector.material.uniforms;
  for (const k of ['uTime','uSunDir','uMoonDir','uSunColor','uMoonColor','uDeep','uShallow','uAnime','uCellScale','uPondCenter','uPondRadii','uRippleCenters','uRippleT','uRippleCount']) ru[k] = waterUniforms[k];
  const reflectionCam = reflector.getReflectionCamera(camera);
  reflectionCam.layers.set(REFLECT_LAYER);
  reflectionCam.far = 400;
  let reflectTick = 1;
  const reflectEvery = 2;
  const originalOnBefore = reflector.onBeforeRender;
  reflector.onBeforeRender = function (...args) {
    if (++reflectTick % reflectEvery !== 0) return;
    originalOnBefore.apply(this, args);
  };

  // lily pads, reeds, shore pebbles
  {
    const padShape = new THREE.Shape();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const rr = 0.34 + Math.sin(a * 3.0) * 0.04;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) padShape.moveTo(x, y); else padShape.lineTo(x, y);
    }
    padShape.closePath();
    const padGeo = new THREE.ShapeGeometry(padShape, 12);
    const pads = [];
    const pr = rng(505);
    for (let i = 0; i < 10; i++) {
      const a = pr() * 6.283, rr = 0.25 + pr() * 0.65;
      const x = Math.cos(a) * POND.rx * rr, z = Math.sin(a) * POND.rz * rr;
      const s = 0.65 + pr() * 0.7;
      pads.push({ m: localMatrix({ x, y: POND.waterY + 0.008, z, rx: -Math.PI/2, ry: pr()*6.283, sx: s, sy: s, sz: s }) });
    }
    instanced(padGeo, padMat, pads, false, pondGroup);

    // reeds around the bank
    const reedGeo = new THREE.CylinderGeometry(0.012, 0.022, 0.75, 4);
    reedGeo.translate(0, 0.375, 0);
    const reeds = [];
    for (let i = 0; i < 60; i++) {
      const a = pr() * 6.283;
      const rr = 1.03 + pr() * 0.16;
      const x = Math.cos(a) * POND.rx * rr, z = Math.sin(a) * POND.rz * rr;
      reeds.push({ m: localMatrix({ x, y: 0.01, z, ry: pr()*6.283, rz: (pr()-0.5)*0.2, sx: 0.8+pr()*0.5, sy: 0.7+pr()*0.8, sz: 0.8+pr()*0.5 }), c: new THREE.Color().setHSL(0.19, 0.35, 0.36 + pr()*0.18) });
    }
    instanced(reedGeo, stemMat, reeds, false, pondGroup);

    const pebGeo = new THREE.IcosahedronGeometry(0.07, 0);
    const pebbles = [];
    for (let i = 0; i < 90; i++) {
      const a = pr() * 6.283;
      const rr = 1.08 + pr() * 0.12;
      const x = Math.cos(a) * POND.rx * rr, z = Math.sin(a) * POND.rz * rr;
      pebbles.push({ m: localMatrix({ x, y: 0.045, z, ry: pr()*6.283, sx: 0.8+pr()*0.8, sy: 0.5+pr()*0.5, sz: 0.8+pr()*0.8 }), c: new THREE.Color().setHSL(0.10, 0.15, 0.6+pr()*0.2) });
    }
    instanced(pebGeo, pebbleMat, pebbles, false, pondGroup);
  }

  // splash rings
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 36),
      new THREE.MeshBasicMaterial({ color: 0xdff7ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = POND.waterY + 0.012;
    ring.visible = false;
    group.add(ring);
    splashRings.push({ mesh: ring, t: 1, dur: 1.1 });
  }

  // ---------------------------------------------------------------- bubbles
  {
    const geo = new THREE.SphereGeometry(0.28, 16, 12);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.0-abs(dot(vN,vV)),2.2); float spec=pow(max(dot(reflect(-vV,vN),normalize(vec3(0.3,1.0,0.2))),0.0),80.0); vec3 col=mix(vec3(0.65,0.92,1.0),vec3(1.0,0.78,0.95),f); gl_FragColor=vec4(col, f*0.13 + spec*0.10); }`,
    });
    const br = rng(361);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.name = 'meadowBubble';
      const a = br()*6.283, rr = 8 + br()*18;
      m.position.set(Math.cos(a)*rr, 2.2 + br()*2.4, Math.sin(a)*rr*0.7);
      m.scale.setScalar(0.18 + br()*0.34);
      m.userData = { phase: br()*10, baseY: m.position.y, baseX: m.position.x, baseZ: m.position.z, amp: 0.15 + br()*0.3 };
      group.add(m);
      bubbles.push(m);
    }
  }

  // ---------------------------------------------------------------- fireflies
  // Predetermined looping paths (stable, non-clumping) plus a few real point
  // lights. The points are the visible swarm; the lights let nearby fireflies
  // actually wash the grass, bears and pond with warm light at night.
  let fireflyPoints = null, fireflyLights = null;
  const fireflyData = [];
  {
    const n = 110;
    const pos = new Float32Array(n*3), col = new Float32Array(n*3);
    const fr = rng(412);
    for (let i = 0; i < n; i++) {
      const a = fr()*6.283, rr = 3 + fr()*22;
      const cx = Math.cos(a)*rr, cz = Math.sin(a)*rr*0.75;
      const orbit = .28 + fr()*1.4;
      const speed = .045 + fr()*.10;
      const phase = fr()*6.283;
      const baseY = .38 + fr()*2.25;
      const bob = .16 + fr()*.48;
      const bobSpeed = .18 + fr()*.45;
      fireflyData.push({ cx, cz, orbit, speed, phase, baseY, bob, bobSpeed, wobble: .06 + fr()*.13 });
      pos[i*3] = cx + Math.cos(phase)*orbit;
      pos[i*3+1] = baseY;
      pos[i*3+2] = cz + Math.sin(phase)*orbit;
      col[i*3] = .88 + fr()*.12; col[i*3+1] = .74 + fr()*.17; col[i*3+2] = .28 + fr()*.22;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    g.setAttribute('color', new THREE.BufferAttribute(col,3));
    const m = new THREE.PointsMaterial({
      size: 0.21, map: fireflyTexture(), transparent: true, opacity: 0,
      depthWrite: false, vertexColors: true, toneMapped: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true, alphaTest: .01,
    });
    fireflyPoints = new THREE.Points(g, m);
    fireflyPoints.name = 'meadowFireflies';
    fireflyPoints.frustumCulled = false;
    group.add(fireflyPoints);

    fireflyLights = new THREE.Group();
    fireflyLights.name = 'meadowFireflyLights';
    fireflyLights.visible = false;
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffd67a, 0, 5.2, 2);
      l.name = `fireflyLight${i}`;
      fireflyLights.add(l);
    }
    group.add(fireflyLights);
  }

  // ---------------------------------------------------------------- field shadows
  const SHADOW_W = 100, SHADOW_H = 68;
  const SHADOW_RES = 1024;
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = SHADOW_RES;
  const sctx = shadowCanvas.getContext('2d');
  const staticShadow = document.createElement('canvas');
  staticShadow.width = staticShadow.height = SHADOW_RES;
  const ssctx = staticShadow.getContext('2d');
  const blobSprite = blobCanvas(160);
  const bearBlob = blobCanvas(128, 'rgba(36,40,24,.38)', 'rgba(36,40,24,.17)');
  const pxw = SHADOW_RES / SHADOW_W, pxh = SHADOW_RES / SHADOW_H;
  function toShadow(x, z) { return [(x + SHADOW_W/2) * pxw, (z + SHADOW_H/2) * pxh]; }
  function bakeStaticShadows() {
    ssctx.clearRect(0, 0, SHADOW_RES, SHADOW_RES);
    const draw = (x, z, size, alpha) => {
      const [cx, cy] = toShadow(x, z);
      const s = size * pxw;
      ssctx.globalAlpha = alpha;
      ssctx.drawImage(blobSprite, cx - s/2, cy - s*0.46, s, s*0.92);
    };
    for (const h of homes) draw(h.x + 0.2, h.z + 0.25, 3.0 * WORLD_SCALE.house, 0.42);
    for (const t of TREE_LOTS) draw(t.x + 0.4, t.z + 0.45, 3.4 * t.s * WORLD_SCALE.tree, 0.36);
    for (const r of ROCK_LOTS) draw(r.x + 0.08, r.z + 0.08, 1.1 * r.s * WORLD_SCALE.prop / 0.5, 0.26);
    ssctx.globalAlpha = 1;
  }
  bakeStaticShadows();
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  shadowTex.generateMipmaps = false;
  shadowTex.minFilter = THREE.LinearFilter;
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(SHADOW_W, SHADOW_H),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false })
  );
  shadowPlane.name = 'meadowShadow';
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.006;
  shadowPlane.renderOrder = 2;
  group.add(shadowPlane);
  function drawShadows(activeBears, cannonShadow) {
    sctx.clearRect(0, 0, SHADOW_RES, SHADOW_RES);
    sctx.drawImage(staticShadow, 0, 0);
    const alpha = 0.55;
    for (const b of activeBears) {
      if (!b.active) continue;
      const bScale = b.scale || 1;
      const h = Math.max(0, b.cy - 0.6 * bScale);
      const s = (1.15 * bScale + h * 0.35) * pxw;
      const [cx, cy] = toShadow(b.cx, b.cz);
      sctx.globalAlpha = Math.max(0.10, alpha / (1 + h * 1.5));
      sctx.drawImage(bearBlob, cx - s/2, cy - s*0.4, s, s*0.8);
    }
    if (cannonShadow) {
      const [cx, cy] = toShadow(cannonShadow.x, cannonShadow.z);
      const s = 1.5 * pxw;
      sctx.globalAlpha = 0.5;
      sctx.drawImage(bearBlob, cx - s/2, cy - s*0.4, s, s*0.8);
    }
    sctx.globalAlpha = 1;
    shadowTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- nav & layout validation
  nav.setDynamic('cannon', { x: CANNON_HOME.x, z: CANNON_HOME.z, r: 0.38 });
  nav.bake();
  const navDebug = nav.buildDebugObject(THREE);
  group.add(navDebug);

  function validateLayout() {
    // Door-frame headroom: an adult bear is 1.375 m tall at rest. Reject a
    // layout if a scaled villa door would sit below that plus a small margin.
    const ADULT_BEAR_HEIGHT = 1.375;
    const DOOR_HEADROOM = 0.16;
    const errors = [];
    const inside = (x,z,r) => fieldInside(x, z, r + 0.35);
    for (const door of aeroHomes.doorClearance) {
      if (door.top < ADULT_BEAR_HEIGHT + DOOR_HEADROOM) {
        errors.push(`${door.name} doorframe is below bear headroom`);
      }
    }
    for (const h of homes) {
      if (!inside(h.x, h.z, h.r + 0.1)) errors.push(`${h.name} outside the field`);
      for (const o of homes) if (o !== h) {
        const need = h.r + o.r + 0.9;
        if (Math.hypot(h.x-o.x, h.z-o.z) < need) errors.push(`${h.name} clips ${o.name}`);
      }
      for (const t of TREE_LOTS) {
        const need = h.r + 2.5 * t.s * WORLD_SCALE.tree + 0.6;
        if (Math.hypot(h.x-t.x, h.z-t.z) < need) errors.push(`${h.name} clips tree at ${t.x},${t.z}`);
      }
      const px = (h.x - POND.x) / (POND.rx + 1.2 + h.r);
      const pz = (h.z - POND.z) / (POND.rz + 1.2 + h.r);
      if (px*px + pz*pz < 1) errors.push(`${h.name} clips the pond`);
      if (Math.hypot(h.x-CANNON_HOME.x, h.z-CANNON_HOME.z) < h.r + 1.5) errors.push(`${h.name} blocks the cannon home`);
      if (!nav.isWalkable(h.door.x, h.door.z)) errors.push(`${h.name} door approach is blocked`);
    }
    for (const t of TREE_LOTS) {
      if (!inside(t.x, t.z, 0.7 * WORLD_SCALE.tree)) errors.push(`tree at ${t.x},${t.z} outside`);
      const px = (t.x - POND.x) / (POND.rx + 0.8 * WORLD_SCALE.tree);
      const pz = (t.z - POND.z) / (POND.rz + 0.8 * WORLD_SCALE.tree);
      if (px*px + pz*pz < 1) errors.push(`tree at ${t.x},${t.z} clips the pond`);
      if (Math.hypot(t.x-CANNON_HOME.x, t.z-CANNON_HOME.z) < 2.5*t.s*WORLD_SCALE.tree + 1.2) errors.push('tree blocks cannon home');
    }
    for (const r of ROCK_LOTS) if (Math.hypot(r.x-CANNON_HOME.x, r.z-CANNON_HOME.z) < 2.0 * WORLD_SCALE.prop) errors.push('rock blocks cannon home');
    {
      const sh = STUDIO_HOUSE;
      if (!inside(sh.x, sh.z, sh.r + .2)) errors.push('Studio House outside the field');
      for (const h of homes) {
        if (Math.hypot(sh.x-h.x, sh.z-h.z) < sh.r + h.r + .9) errors.push(`Studio House clips ${h.name}`);
      }
      for (const t of TREE_LOTS) {
        if (Math.hypot(sh.x-t.x, sh.z-t.z) < sh.r + 2.5*t.s*WORLD_SCALE.tree + .6) errors.push('Studio House clips a tree');
      }
      const px = (sh.x-POND.x)/(POND.rx+1.2+sh.r), pz = (sh.z-POND.z)/(POND.rz+1.2+sh.r);
      if (px*px+pz*pz < 1) errors.push('Studio House clips the pond');
      if (Math.hypot(sh.x-CANNON_HOME.x, sh.z-CANNON_HOME.z) < sh.r+1.5) errors.push('Studio House blocks the cannon home');
      if (!nav.isWalkable(sh.door.x, sh.door.z)) errors.push('Studio House door approach is blocked');
    }
    const navErrors = nav.validate();
    return errors.concat(navErrors);
  }
  const layoutErrors = validateLayout();
  if (layoutErrors.length) console.warn('[meadow layout]', layoutErrors);

  function isCannonSpot(x, z) {
    if (!fieldInside(x, z, 0.7)) return false;
    for (const h of homes) if (Math.hypot(x-h.x, z-h.z) < h.r + 0.8) return false;
    for (const t of TREE_LOTS) if (Math.hypot(x-t.x, z-t.z) < 0.33 * WORLD_SCALE.tree + 0.8) return false;
    for (const r of ROCK_LOTS) if (Math.hypot(x-r.x, z-r.z) < 0.5*r.s*WORLD_SCALE.prop + 0.7) return false;
    if (Math.hypot(x-STUDIO_HOUSE.x, z-STUDIO_HOUSE.z) < STUDIO_HOUSE.r + .8) return false;
    const px = (x - POND.x) / (POND.rx + 1.15), pz = (z - POND.z) / (POND.rz + 1.15);
    if (px*px + pz*pz < 1) return false;
    return true;
  }

  function setCannon(x, z) {
    nav.setDynamic('cannon', { x, z, r: 0.38 });
    nav.bake();
  }

  // ---------------------------------------------------------------- splash / update
  function splash(x, z, strength = 1) {
    const ring = splashRings.find(r => r.t >= r.dur) || splashRings[0];
    ring.t = 0; ring.dur = 0.9 + strength*0.2;
    ring.mesh.position.set(x, POND.waterY + 0.012, z);
    ring.mesh.scale.setScalar(0.4 + strength*0.2);
    ring.mesh.material.opacity = 0.7 * strength;
    ring.mesh.visible = true;
  }

  let grassCullTick = 0;
  function updateGrassCull() {
    const dd = grassDrawDistance.value;
    for (const c of grassChunks) {
      const d = Math.hypot(camera.position.x - c.center.x, camera.position.z - c.center.z);
      c.mesh.visible = grassEnabled && d < dd + 14;
    }
  }
  function setGrassVisible(v) {
    grassEnabled = !!v;
    updateGrassCull();
  }
  function setGrassControls(v = {}) {
    if (v.coverage !== undefined) grassCoverage.value = THREE.MathUtils.clamp(Number(v.coverage) || 0, .25, 1);
    if (v.drawDistance !== undefined) grassDrawDistance.value = THREE.MathUtils.clamp(Number(v.drawDistance) || 0, 24, 76);
    updateGrassCull();
  }

  let lastNight = -1;
  function update(dt, activeBears) {
    if (sky) sky.update(dt);
    wind.update(dt);
    horizon.update(dt);
    horizon.setNight(sky ? sky.night : 0);
    aeroHomes.setNight(sky ? sky.night : 0);
    studioHouse.setNight(sky ? sky.night : 0);
    mistUniforms.uTime.value += dt;
    const mist = sky ? sky.mist : 0;
    mistUniforms.uMist.value = mist;
    mistMesh.visible = mist > 0.002;
    if ((grassCullTick++ & 7) === 0) updateGrassCull();
    if (activeBears) {
      const n = Math.min(48, activeBears.length);
      for (let i = 0; i < n; i++) {
        const b = activeBears[i];
        grassBears[i*4] = b.cx; grassBears[i*4+1] = b.cz;
        grassBears[i*4+2] = b.vcx; grassBears[i*4+3] = b.vcz;
      }
      grassBearCount.value = n;
    }
    for (const sp of smokePuffs) {
      const t = performance.now()*0.001 + sp.phase;
      sp.sp.position.y = sp.baseY + ((t*0.09) % 1.4);
      sp.sp.position.x = sp.baseX + Math.sin(t*0.35) * 0.12;
      sp.sp.position.z = sp.baseZ + Math.cos(t*0.28) * 0.12;
      sp.sp.material.opacity = 0.10 + 0.08 * (1 - ((t*0.09) % 1.4) / 1.4);
      const s = 0.75 + 0.55 * ((t*0.09) % 1.4);
      sp.sp.scale.set(s, s, 1);
    }
    for (const b of bubbles) {
      const t = performance.now()*0.001 + b.userData.phase;
      b.position.y = b.userData.baseY + Math.sin(t*0.55) * b.userData.amp;
      b.position.x = b.userData.baseX + Math.sin(t*0.17) * 0.35;
      b.position.z = b.userData.baseZ + Math.cos(t*0.13) * 0.35;
      b.rotation.y += dt*0.18;
    }
    if (fireflyPoints) {
      const t = performance.now()*0.001;
      const p = fireflyPoints.geometry.attributes.position;
      const night = sky ? sky.night : 0;
      const active = night > 0.02;
      fireflyPoints.visible = active;
      fireflyPoints.material.opacity = Math.max(0, night * 0.95);
      if (fireflyLights) fireflyLights.visible = active;
      for (let i = 0; i < fireflyData.length; i++) {
        const f = fireflyData[i];
        const a = t * f.speed + f.phase;
        const wob = Math.sin(t * .71 + f.phase * 3.1);
        p.setXYZ(i,
          f.cx + Math.cos(a) * f.orbit + wob * f.wobble,
          f.baseY + Math.sin(t * f.bobSpeed + f.phase) * f.bob,
          f.cz + Math.sin(a) * f.orbit + Math.cos(t * .47 + f.phase * 2.3) * f.wobble
        );
      }
      p.needsUpdate = true;
      if (fireflyLights) {
        for (let k = 0; k < fireflyLights.children.length; k++) {
          const l = fireflyLights.children[k];
          const i = k * 27;
          l.position.set(p.getX(i), p.getY(i), p.getZ(i));
          l.intensity = active ? night * 4.0 : 0;
        }
      }
    }
    // water uniforms follow the sky
    if (sky) {
      backdrop.setSun(sky.sunDir);
      bushes.setSun(sky.sunDir);
      waterUniforms.uSunDir.value.copy(sky.sunDir);
      waterUniforms.uMoonDir.value.copy(sky.moonDir);
      waterUniforms.uTime.value += dt;
      const night = sky.night ?? 0;
      glassMat.emissiveIntensity = 0.38 + night*2.1;
        if (night !== lastNight) lastNight = night;
    }
    const ripCenters = waterUniforms.uRippleCenters.value;
    const ripT = waterUniforms.uRippleT.value;
    let ripCount = 0;
    for (const r of splashRings) {
      if (r.t >= r.dur) { r.mesh.visible = false; continue; }
      r.t += dt;
      const p = Math.min(1, r.t / r.dur);
      r.mesh.scale.setScalar(0.4 + p*3.6);
      r.mesh.material.opacity = (1-p)*0.65;
      if (ripCount < 4) {
        ripCenters[ripCount].set(r.mesh.position.x, r.mesh.position.z);
        ripT[ripCount] = r.t;
        ripCount++;
      }
    }
    waterUniforms.uRippleCount.value = ripCount;
    // nav debug line opacity gently pulses
    if (navDebug) navDebug.material.opacity = 0.45 + Math.sin(performance.now()*0.002)*0.08;
  }

  return {
    group, sky, nav, navDebug, homes, colliders, pond, bounds: FIELD_BOUNDS,
    pathStones, cannonHome: CANNON_HOME, wind, trees, horizon, aeroHomes, backdrop, studioHouse, bushes,
    fireflies: fireflyPoints, fireflyLights,
    valid: layoutErrors.length === 0,
    layoutErrors,
    update,
    drawShadows,
    splash,
    setCannon,
    isCannonSpot,
    validateLayout,
    setWind(v) {
      if (!v) return;
      if (v.strength !== undefined) wind.setStrength(v.strength);
      if (v.dir) wind.setDirection(v.dir.x, v.dir.z);
      if (v.gust !== undefined) wind.setGust(v.gust);
    },
    setGrassControls,
    setGrassVisible,
    setWaterCellScale(v) {
      const n = THREE.MathUtils.clamp(Number(v) || 1.2, .3, 2.4);
      waterUniforms.uCellScale.value = n;
      return n;
    },
    get mist() { return mistUniforms.uMist.value; },
    setNature(v = {}) {
      if (trees && trees.setControls) {
        trees.setControls({
          fullness: v.canopy !== undefined ? v.canopy : v.fullness,
          leafSize: v.leafSize,
        });
      }
      setGrassControls(v);
    },
    get natureControls() {
      return {
        canopy: trees && trees.controls ? trees.controls.fullness.value : 1,
        leafSize: trees && trees.controls ? trees.controls.scale.value : 1,
        coverage: grassCoverage.value,
        drawDistance: grassDrawDistance.value,
      };
    },
    get grassControls() {
      return { coverage: grassCoverage.value, drawDistance: grassDrawDistance.value, chunks: grassChunks.length };
    },
    get navStats() { return nav.stats; },
    setVisible(v) { group.visible = !!v; },
  };
}
