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
import { createSunState, updateSunState } from './sunlight.js';
import { createTreeCollection, TREE_KINDS, TREE_KIND_ORDER } from './trees.js';
import { createHorizon } from './horizon.js';
import { createAeroHomes } from './homes.js';
import { createBackdrop } from './backdrop.js';
import { createStudioHouse } from './studiohouse.js';
import { createBushCollection } from './bushes.js';
import { createFoodRegistry } from './food.js';
import { FIELD_BOUNDS, FIELD_RADIUS, fieldInside, fieldRadiusAt } from './fieldshape.js';

export { FIELD_BOUNDS };
export const POND = { x: -17, z: 2, rx: 6.6, rz: 4.3, waterY: 0.022 };
export const POND_HOLE = { hx: POND.rx * 0.78, hz: POND.rz * 0.78, floorY: -1.6 };

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
function makeGrassCardGeo() {
  const pos = [], uv = [], col = [], widthAxes = [], idx = [];
  const H = 1.05, W = .82;
  for (let k = 0; k < 3; k++) {
    const yaw = k * Math.PI / 3;
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const off = pos.length / 3;
    for (const [y, half, u, v] of [
      [0, .50, 0, 0], [0, .50, 1, 0],
      [H * .52, .38, 0, .52], [H * .52, .38, 1, .52],
      [H, .19, 0, 1], [H, .19, 1, 1],
    ]) {
      const x = (u ? half : -half) * W;
      pos.push(x * ca, y, x * sa);
      uv.push(u, v);
      col.push(1, 1, 1);
      widthAxes.push(ca, 0, sa);
    }
    idx.push(off, off + 2, off + 1, off + 1, off + 2, off + 3,
             off + 2, off + 4, off + 3, off + 3, off + 4, off + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('cardWidthAxis', new THREE.Float32BufferAttribute(widthAxes, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
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

const EMOTE_STYLES = {
  heart:    { glyph: '♥', color: '#ff6f9f' },
  question: { glyph: '?', color: '#79e9ff' },
  no:       { glyph: '×', color: '#ff7d88' },
  exclaim:  { glyph: '!', color: '#ffd86b' },
  sparkle:  { glyph: '✦', color: '#d9b6ff' },
};
const emoteTextureCache = new Map();
function emoteTexture(kind) {
  const style = EMOTE_STYLES[kind] || EMOTE_STYLES.heart;
  const key = style.glyph;
  if (emoteTextureCache.has(key)) return emoteTextureCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '700 46px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.fillStyle = style.color;
  ctx.strokeText(style.glyph, 32, 35);
  ctx.fillText(style.glyph, 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  emoteTextureCache.set(key, tex);
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
  return { shape, pts, phases, wobble };
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
  const sun = createSunState();
  const nav = createNavMesh({
    minX: -hx, maxX: hx, minZ: -hz, maxZ: hz,
    cell: 0.8, agentRadius: 0.38, extraClearance: 0.10,
    insideBounds: (x, z, edge) => fieldInside(x, z, edge),
  });

  const colliders = [];
  const homes = [];
  const splashRings = [];
  const stingBursts = [];
  const emotes = [];
  const smokePuffs = [];
  const bubbles = [];
  const foodSources = [];
  const clock = new THREE.Clock();
  const hiddenFoodMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  let flowerFoodVisual = null;
  let fallenFruitVisual = null;
  let hiveVisual = null;
  let food = null;

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
  TREE_LOTS.forEach((lot, index) => {
    const s = lot.s * WORLD_SCALE.tree;
    const r = 0.33 * WORLD_SCALE.tree;
    // Grow-form trunks flare at the base. The chest-height sphere keeps nav and
    // walking unchanged; baseR adds a low sphere so a bear cannot slide into the
    // visible flare. 1.14 is the maximum per-tree girth jitter in trees.js.
    const kind = TREE_KINDS[TREE_KIND_ORDER[index % TREE_KIND_ORDER.length]];
    const baseR = Math.max(r, s * 0.34 * (1 + kind.flare) * kind.trunkR * 1.14);
    colliders.push({ kind: 'tree', x: lot.x, z: lot.z, r, baseR, baseY: baseR, y: 1.1 * WORLD_SCALE.tree, canopy: 2.5 * s, scale: s });
    nav.addSolid({ kind: 'tree', x: lot.x, z: lot.z, r });
  });
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
  const sandMat = new THREE.MeshPhysicalMaterial({ color: 0xc4a77e, roughness: 0.82, clearcoat: 0.16 });
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
  // Canvas Y grows downward; the CPU pathValueAt sampler reads the same rows.
  // Upload without the default vertical flip so shader dirt and placement
  // exclusions stay on the authored trails instead of mirroring across Z.
  pathMaskTex.flipY = false;
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
  lawn.receiveShadow = true;
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
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.16,.34,.09), edgeT * .70);
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
  const backdrop = createBackdrop({ sun });
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

  // The same polygon drives visible sand and grass-footprint exclusion.
  const pondBankOutline = outlineShape(POND.rx * 1.15, POND.rz * 1.15, 33, .06);
  // Midway through the translucent outer shoulder, outside the solid bank.
  const pondGrassBoundary = outlineShape(POND.rx * .98 * 1.25, POND.rz * .98 * 1.25, 33, .06);
  function grassOnBank(x, z, clearance = .03) {
    const px = x - POND.x, pz = z - POND.z;
    if (Math.hypot(px, pz) > POND.rx * 1.5 + clearance) return false;
    let inside = false;
    const pts = pondGrassBoundary.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j], b = pts[i];
      // Shape XY maps to world X,-Z under the bank's -PI/2 rotation.
      const az = -a.y, bz = -b.y;
      if ((az > pz) !== (bz > pz) && px < (b.x - a.x) * (pz - az) / (bz - az) + a.x) inside = !inside;
      const dx = b.x - a.x, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(px - a.x - t * dx, pz - az - t * dz) < clearance) return true;
    }
    return inside;
  }

  // ---------------------------------------------------------------- grass
  const grassCards = new URLSearchParams(location.search).get('grass') !== 'blades';
  const bladeGrassGeo = (() => {
    const h = 0.62;
    // Nine overlapping, tapered blades per tuft. Each blade is a five-vertex
    // three-triangle strip. More, smaller tufts read as a continuous carpet
    // instead of isolated shaggy clumps; the old broad cover fans are gone.
    const pos = [], col = [], idx = [];
    const addBlade = (yaw, ox, oz, hs, width, lean) => {
      const ca = Math.cos(yaw), sa = Math.sin(yaw);
      const off = pos.length / 3;
      const hw = .074 * width;
      const verts = [
        [-hw, 0, 0, .16],
        [ hw, 0, 0, .16],
        [-hw * .56, h * .54 * hs, lean * .45, .36],
        [ hw * .56, h * .54 * hs, lean * .45, .36],
        [0, h * hs, lean, .62],
      ];
      for (const [x, y, z, shade] of verts) {
        pos.push(x * ca - z * sa + ox, y, x * sa + z * ca + oz);
        col.push(shade, shade, shade);
      }
      idx.push(off, off + 2, off + 1, off + 1, off + 2, off + 3, off + 2, off + 4, off + 3);
    };
    addBlade(0.00,  0.000,  0.000, 1.00, 1.00, 0.060);
    addBlade(0.92,  0.087,  0.022, 0.94, 0.90, -0.050);
    addBlade(1.84, -0.072,  0.054, 0.84, 0.96, 0.080);
    addBlade(2.76,  0.024, -0.086, 0.76, 0.78, -0.070);
    addBlade(3.68, -0.066, -0.042, 0.68, 0.84, 0.045);
    addBlade(4.60,  0.068, -0.018, 0.60, 1.02, -0.055);
    addBlade(5.52, -0.026,  0.078, 0.52, 0.88, 0.065);
    // Two low, narrow skirt blades close the ground gaps without the flat
    // overlapping fans that made the old tuft read as a fern.
    addBlade(0.72,  0.118, -0.046, 0.28, 1.85, -0.055);
    addBlade(3.56, -0.120,  0.052, 0.24, 1.70, 0.060);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const grassGeo = grassCards ? makeGrassCardGeo() : bladeGrassGeo;

  const grassBears = new Float32Array(48 * 4);
  const grassBearCount = { value: 0 };
  const grassCoverage = { value: 1 };
  const grassDrawDistance = { value: 56 };
  const grassHeight = { value: grassCards ? 1.05 : .62 };
  const grassMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, side: THREE.DoubleSide, vertexColors: true,
    alphaTest: grassCards ? .5 : 0,
    transparent: false,
    depthWrite: true,
    alphaToCoverage: false, // composer target is single-sample; MSAA path needs verification
  });
  grassMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wind.uniforms);
    shader.uniforms.uBears = { value: grassBears };
    shader.uniforms.uBearCount = grassBearCount;
    shader.uniforms.uGrassCoverage = grassCoverage;
    shader.uniforms.uGrassDrawDistance = grassDrawDistance;
    shader.uniforms.uGrassHeight = grassHeight;
    shader.uniforms.uSunDir = sun.uniforms.uSunDir;
    shader.uniforms.uSunColor = sun.uniforms.uSunColor;
    shader.uniforms.uSunIntensity = sun.uniforms.uSunIntensity;
    shader.uniforms.uPathMask = pathMaskUniform;
    shader.uniforms.uPathExtent = pathExtentUniform;
    shader.uniforms.uGrassBank = { value: pondGrassBoundary.pts };
    shader.uniforms.uGrassPondCenter = { value: new THREE.Vector2(POND.x, POND.z) };
    const cardVertexDecls = grassCards
      ? '\nattribute vec3 cardWidthAxis;\nvarying vec3 vGrassWidthAxis;\nvarying vec2 vGrassUv;\nvarying float vGrassSeed;\n'
      : '';
    shader.vertexShader = WIND_GLSL
      + '\nuniform vec4 uBears[48];\nuniform int uBearCount;'
      + '\nuniform float uGrassCoverage;\nuniform float uGrassDrawDistance;\nuniform float uGrassHeight;'
      + '\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;\nuniform float uSunIntensity;'
      + '\nuniform sampler2D uPathMask;\nuniform float uPathExtent;'
      + '\nvarying float vPathDirt;\nvarying vec2 vGrassWorld;\nvarying vec2 vGrassSurface;\nvarying vec3 vGrassView;\nvarying float vGrassHeight;\n'
      + cardVertexDecls
      + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        float wx = instanceMatrix[3].x;
        float wz = instanceMatrix[3].z;
        float hh = clamp(position.y / uGrassHeight, 0.0, 1.0);
        vGrassHeight = hh;
        vec2 wp = vec2(wx, wz);
        vGrassWorld = wp;
        float phase = fract(sin(dot(wp, vec2(12.9898, 78.233))) * 43758.5453) * 6.283;
        ${grassCards ? 'vGrassUv = uv; vGrassSeed = fract(phase / 6.283); vGrassWidthAxis = normalize(normalMatrix * mat3(instanceMatrix) * cardWidthAxis);' : ''}

        // Keep the carpet continuous at every distance. Stochastic blade
        // removal leaves visible holes in the lawn, so distance is handled by
        // the smooth far fade and instance scale instead.
        float camDist = distance(wp, cameraPosition.xz);
        float farFade = 1.0 - smoothstep(uGrassDrawDistance, uGrassDrawDistance + 12.0, camDist);
        float lod = farFade;
        if (lod < 0.02) {
          transformed = vec3(0.0);
        } else {
          // Coverage shortens the tufts instead of deleting instances.
          // Random removal leaves visible holes in the carpet, especially on
          // the lower graphics profiles; keeping the footprint also preserves
          // the continuous lawn silhouette.
          transformed.y *= farFade * mix(.62, 1.0, uGrassCoverage);
          transformed.xz *= mix(0.25, 1.0, farFade);

          // Shared world-space wind + the existing bear-parting field. Both are
          // built in world space, then converted through this instance's basis,
          // so random yaw and non-uniform scale do not spin the wind direction.
          vec2 windW = meadowWindVec(wp, phase) * (0.24 * hh * hh);
          windW += vec2(
            sin(uWindTime * 2.7 + phase * 3.7 + wp.x * 0.9) * 0.018,
            cos(uWindTime * 2.3 + phase * 4.1 - wp.y * 0.8) * 0.018
          ) * hh;
          // A little per-instance lean keeps clumps from sharing one silhouette.
          windW += vec2(cos(phase * 1.31), sin(phase * 1.73)) * 0.045 * hh * hh;

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
        vPathDirt = smoothstep(.24, .62, pathRaw);
        if (vPathDirt > .72) {
          transformed = vec3(0.0); // no blades on the painted dirt footprint
        } else {
          transformed.y *= 1.0 - vPathDirt * .98;
        }
        vec4 grassWP = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vGrassSurface = grassWP.xz;
        vGrassView = normalize(cameraPosition - grassWP.xyz + vec3(1e-4));
      #endif
    `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uPathMask;\nuniform float uPathExtent;\nvarying float vPathDirt;\nvarying vec2 vGrassWorld;\nvarying vec2 vGrassSurface;\nuniform vec2 uGrassBank[72];\nuniform vec2 uGrassPondCenter;\nvarying vec3 vGrassView;\nvarying float vGrassHeight;\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;\nuniform float uSunIntensity;'
        + (grassCards ? '\nvarying vec3 vGrassWidthAxis;\nvarying vec2 vGrassUv;\nvarying float vGrassSeed;' : ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Root-only rejection cannot stop wide/wind-bent cards overhanging a
        // road. Sample at the actual fragment using the lawn's exact UV/noise.
        vec2 grassPathUv = (vGrassSurface + uPathExtent * .5) / uPathExtent;
        float grassPathRaw = texture2D(uPathMask, grassPathUv).r;
        float grassPathNoise = sin(vGrassSurface.x * 4.7 + vGrassSurface.y * 3.1) * .035
                            + sin(vGrassSurface.x * 1.7 - vGrassSurface.y * 5.3) * .025;
        if (grassPathRaw + grassPathNoise > .40) discard;
        // The bank polygon is star-shaped about the pond centre. Locate its
        // radial segment in O(1), preserving the exact mesh outline/axis signs.
        vec2 bankRel = (vGrassSurface - uGrassPondCenter) * vec2(1.0, -1.0);
        float bankDist = length(bankRel);
        if (bankDist < 10.0) {
          float bankAngle = mod(atan(bankRel.y, bankRel.x) + 6.283185307, 6.283185307);
          int bankIndex = int(floor(bankAngle * (72.0 / 6.283185307)));
          vec2 bankA = uGrassBank[bankIndex];
          vec2 bankE = uGrassBank[(bankIndex + 1) % 72] - bankA;
          vec2 bankRay = bankRel / max(bankDist, 1e-4);
          float bankCross = bankRay.x * bankE.y - bankRay.y * bankE.x;
          float bankRadius = (bankA.x * bankE.y - bankA.y * bankE.x) / max(bankCross, 1e-4);
          if (bankDist <= bankRadius) discard;
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.48,.35,.22), vPathDirt * .62);
        // Broad world-space patches read as meadow-scale colour variation; the
        // finer term keeps individual tufts from looking uniformly stamped.
        float broad = sin(vGrassWorld.x * .105 + sin(vGrassWorld.y * .071) * 2.3);
        float detail = sin(vGrassWorld.x * .29 - vGrassWorld.y * .23 + 1.7);
        float patchAmt = clamp(.5 + broad * .26 + detail * .16, 0.0, 1.0);
        diffuseColor.rgb *= mix(.86, 1.14, patchAmt);
        diffuseColor.g *= .985 + detail * .025;
        ${grassCards ? `
        float slot = floor(vGrassUv.x * 3.0);
        float slotU = fract(vGrassUv.x * 3.0);
        float bladeSeed = fract(sin((slot + vGrassSeed * 31.7) * 12.9898) * 43758.5453);
        float bladeH = mix(.70, 1.02, bladeSeed);
        float bladeT = clamp(vGrassUv.y / max(bladeH, 1e-4), 0.0, 1.0);
        float lean = (fract(sin((slot + vGrassSeed * 57.1) * 12.9898) * 43758.5453) - .5) * .28;
        float center = .5 + lean * bladeT;
        float halfW = .10 * (1.0 - bladeT * bladeT);
        // Differentiate the continuous UVs, never fract(slotU): slot seams
        // otherwise create artificially wide blades and unstable edge coverage.
        float pixelU = max(fwidth(vGrassUv.x) * 3.0, 1e-4);
        halfW = max(halfW, pixelU * .5 * (1.0 - bladeT));
        float edgeAA = pixelU * .5;
        float edgeMask = 1.0 - smoothstep(halfW - edgeAA, halfW + edgeAA, abs(slotU - center));
        float tipAA = max(fwidth(vGrassUv.y), 1e-4) * .5;
        float tipMask = 1.0 - smoothstep(bladeH - tipAA, bladeH + tipAA, vGrassUv.y);
        float bladeMask = edgeMask * tipMask;
        diffuseColor.a *= bladeMask;

        // Match the opaque blades' rooted colour and per-blade variance.
        diffuseColor.rgb *= mix(.60, 1.0, smoothstep(0.0, .34, vGrassUv.y));
        diffuseColor.g *= mix(.92, 1.10, vGrassUv.y);
        float bladeShade = .55 + .55 * sin(3.14159 * slotU);
        diffuseColor.rgb *= bladeShade;
        float tint = fract(sin((slot + vGrassSeed * 91.3) * 12.9898) * 43758.5453);
        diffuseColor.rgb *= mix(.88, 1.10, tint);
        ` : ''}
      `)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec3 upView = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
        ${grassCards ? `
        float cardSide = clamp((slotU - center) / max(halfW, 1e-4), -1.0, 1.0);
        // Three already flips the face normal. Curve along the actual card
        // width (rather than scaling the normal), with matching back-face axis.
        vec3 widthAxis = normalize(vGrassWidthAxis) * (gl_FrontFacing ? 1.0 : -1.0);
        normal = normalize(mix(normal, upView, .65) + widthAxis * cardSide * .30);
        ` : `
        // Blend blade normals toward up instead of replacing them.
        normal = normalize(mix(normal, upView, .72) + vec3(1e-4));
        `}
      `)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // Cheap grass translucency: backlit blades glow mostly at their tips
        // and silhouette edges, not across the whole field.
        vec3 grassV = normalize(vGrassView + vec3(1e-4));
        float sssBack = pow(max(0.0, -dot(grassV, uSunDir)), 1.5);
        float sssEdge = pow(clamp(1.0 - abs(grassV.y), 0.0, 1.0), 1.8);
        float sssTip = smoothstep(.45, 1.0, vGrassHeight);
        float sss = (.35 + .65 * sssBack) * (.20 + .80 * sssEdge) * (.30 + .70 * sssTip);
        reflectedLight.directDiffuse += uSunColor * sss * uSunIntensity * .04;

        // Wrap lighting fills the shadowed side of thin cards instead of
        // terminating in a black edge.
        vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz + vec3(1e-4));
        float ndl = dot(normal, sunView);
        float wrapNdl = clamp((ndl + .35) / 1.35, 0.0, 1.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity
          * max(0.0, wrapNdl - max(ndl, 0.0)) * .18;

        reflectedLight.directDiffuse = clamp(reflectedLight.directDiffuse, 0.0, 4.0);
        reflectedLight.indirectDiffuse = clamp(reflectedLight.indirectDiffuse, 0.0, 4.0);
      `);
  };
  grassMat.customProgramCacheKey = () => grassCards ? 'meadowGrassCardsV15' : 'meadowGrassV15';

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
      if (solidAt(x, z, 0.055, true)) return;
      const cx = Math.floor((x + hx) / chunkW);
      const cz = Math.floor((z + hz) / chunkH);
      const key = cx + ':' + cz;
      let parts = buckets.get(key);
      if (!parts) { parts = []; buckets.set(key, parts); }
      const light = grassCards ? .16 + (lightT - .5) * 0.026 : .29 + lightT * 0.17;
      const col = new THREE.Color().setHSL(grassCards ? 0.220 + hueT * 0.075 : 0.230 + hueT * 0.055,
        grassCards ? 0.58 + hueT * 0.16 : 0.64 + hueT * 0.16, light);
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

    // Area-weighted circular scatter. Smaller tufts need a tighter core spacing
    // to read as a continuous carpet; the outer ring stays lighter but unbroken.
    const CORE_R = 43;
    const TARGET_CORE = grassCards ? 130000 : 85000;
    const TARGET_OUTER = grassCards ? 90000 : 100000;
    let total = 0, tries = 0;
    const R = FIELD_RADIUS + 8.2; // cover the full visual lawn disc, not just its inner rim
    const R2 = R * R, CORE_R2 = CORE_R * CORE_R;
    const place = (outer) => {
      const a = gr() * Math.PI * 2;
      const r = outer
        ? Math.sqrt(CORE_R2 + gr() * (R2 - CORE_R2))
        : Math.sqrt(gr()) * CORE_R;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!outer && !fieldInside(x, z, 0.9)) return false;
      if (outer && r > R) return false;
      // Clear grass only where the lawn has clearly painted soil. Earlier
      // shoulder cutoffs removed blades while the ground was still green,
      // leaving narrow bare-green lines beside the trails.
      if (pathValueAt(x, z) > .46) return false;
      // A small shoulder clearance, not the old quarter-metre bare strip.
      // The vertex mask still suppresses blades rooted on painted dirt.
      for (const [ox, oz] of [[.03, 0], [-.03, 0], [0, .03], [0, -.03]]) {
        if (pathValueAt(x + ox, z + oz) > .55) return false;
      }
      // Keep the new denser tufts off the wet bank as well as the water itself:
      // roots sit outside the 1.17x bank, with a little clearance for leaning
      // blades.
      if (grassOnBank(x, z)) return false;
      const patch = 0.985 + 0.010 * Math.sin(x * 0.19 + Math.sin(z * 0.13) * 2.1)
                          + 0.005 * Math.cos(z * 0.23 - x * 0.07);
      if (gr() > patch) return false;
      if (solidAt(x, z, 0.055, true)) return false;
      // The visual apron is deliberately lighter than the core, but a sudden
      // density drop at the lawn rim reads as a bare ring. Slightly larger
      // tufts carry the carpet across the last few metres.
      const edgeBoost = r > 64.5 ? 1.30 : 1.0;
      const scale = (0.52 + gr() * 0.34) * (0.84 + gr() * 0.34) * edgeBoost * (grassCards ? 1.20 : 1.0);
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
      mesh.receiveShadow = false;
      mesh.castShadow = false;
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
  function solidAt(x, z, pad = 0, allowOutside = false) {
    if (!allowOutside && !fieldInside(x, z, 0.6)) return true;
    for (const c of colliders) {
      const rr = (c.r || 0.35) + pad;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) return true;
    }
    // Keep scatter off the full sand bank, not just the water ellipse. The
    // bank reaches 1.15x the water shape; vegetation starting there reads as
    // grass growing out of the sand.
    const px = (x - POND.x) / (POND.rx * 1.17 + pad * 0.6);
    const pz = (z - POND.z) / (POND.rz * 1.17 + pad * 0.6);
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
      const visualIndex = blooms.length;
      stems.push({ m: localMatrix({ x, y: stemH * 0.5, z, ry: fr()*6.283, sx: s, sy: s * fs, sz: s }), c: new THREE.Color(0x5a9e48) });
      blooms.push({ m: localMatrix({ x, y: stemH, z, ry: fr()*6.283, sx: s * .92, sy: s * .84, sz: s * .92 }), c: col });
      centers.push({ m: localMatrix({ x, y: stemH + 0.10 * s * fs, z, sx: s * .84, sy: s * .84, sz: s * .84 }), c: new THREE.Color(0xffe98d) });
      foodSources.push({
        id: `flower-${visualIndex}`,
        kind: 'flower',
        label: 'jelly flower',
        x, z, y: stemH,
        approachX: x, approachZ: z,
        satiation: 0.20,
        respawnMin: 25, respawnMax: 45,
        visualIndex,
      });
    }
    const flowerStems = instanced(stemGeo, stemMat, stems, false, group);
    const flowerBlooms = instanced(blossomGeo, flowerBlossomMat, blooms, false, group);
    const flowerCenters = instanced(centerGeo, flowerCenterMat, centers, false, group);
    flowerStems.name = 'meadowFlowerStems';
    flowerBlooms.name = 'meadowFlowerBlooms';
    flowerCenters.name = 'meadowFlowerCenters';
    flowerFoodVisual = {
      stems: flowerStems,
      blooms: flowerBlooms,
      centers: flowerCenters,
      parts: { stems, blooms, centers },
    };
  }

  // ---------------------------------------------------------------- candy trees
  const treeGroup = new THREE.Group();
  treeGroup.name = 'meadowTrees';
  group.add(treeGroup);
  const trees = createTreeCollection({
    lots: TREE_LOTS.map(lot => ({ ...lot, s: lot.s * WORLD_SCALE.tree })),
    wind,
    sun,
  });
  treeGroup.add(trees.group);
  group.userData.treeStats = trees.stats;
  hiveVisual = trees.hives;

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
    hole: POND_HOLE,
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

  const { shape: waterShape, pts: outlinePts, phases: shorePhases, wobble: shoreWobble } =
    outlineShape(POND.rx * 0.98, POND.rz * 0.98, 33, 0.06);
  // bank ring: outer outline with the water outline as a hole
  {
    const outer = pondBankOutline;
    const bankShape = new THREE.Shape();
    handShapeFromPoints(bankShape, outer.pts);
    const hole = new THREE.Path();
    handPathFromPoints(hole, outlinePts);
    bankShape.holes.push(hole);
    const bankGeo = new THREE.ShapeGeometry(bankShape, 24);
    const bank = new THREE.Mesh(bankGeo, sandMat);
    bank.name = 'meadowPondBank';
    bank.receiveShadow = true;
    bank.rotation.x = -Math.PI / 2;
    bank.position.y = 0.020;
    pondGroup.add(bank);

    // A thin procedural wet band follows the same wobbled water outline as
    // the bank instead of relying on a texture or a separate water plane.
    {
      const wet = new THREE.Color(0x7f6047);
      const damp = new THREE.Color(0x9d7e5d);
      const dry = new THREE.Color(0xc4a77e);
      const rings = [
        { scale: 1.000, color: wet },
        { scale: 1.015, color: new THREE.Color(0x8a674c) },
        { scale: 1.035, color: damp },
        { scale: 1.060, color: new THREE.Color(0xb39571) },
        { scale: 1.085, color: dry },
      ];
      const n = outlinePts.length;
      const positions = [], colors = [], indices = [];
      for (const ring of rings) {
        for (let i = 0; i < n; i++) {
          const p = outlinePts[i];
          // Keep radial rings ordered: the old 1.9% wobble exceeded the
          // first 1.5% gap and folded triangles across the inner shoreline.
          const wobble = ring.scale === 1 ? 1
            : 1 + Math.sin(i * 2.3 + .7) * .003 + Math.sin(i * 5.1 - 1.1) * .00175;
          positions.push(p.x * ring.scale * wobble, p.y * ring.scale * wobble, 0);
          colors.push(ring.color.r, ring.color.g, ring.color.b);
        }
      }
      for (let i = 0; i < n; i++) {
        const ni = (i + 1) % n;
        for (let r = 0; r < rings.length - 1; r++) {
          const a = r * n + i;
          const b = r * n + ni;
          const c = (r + 1) * n + i;
          const d = (r + 1) * n + ni;
          indices.push(a, c, d, a, d, b);
        }
      }
      const wetGeo = new THREE.BufferGeometry();
      wetGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      wetGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      wetGeo.setIndex(indices);
      wetGeo.computeVertexNormals();
      const wetMat = sandMat.clone();
      wetMat.vertexColors = true;
      wetMat.color.set(0xffffff);
      const wetBand = new THREE.Mesh(wetGeo, wetMat);
      wetBand.name = 'meadowPondWetBand';
      wetBand.receiveShadow = true;
      wetBand.rotation.x = -Math.PI / 2;
      wetBand.position.y = 0.021;
      pondGroup.add(wetBand);
    }
    // A soft outer blend hides the hard sand-to-lawn cut. It shares the bank
    // colour and fades into a stable noisy edge instead of ending on a clean
    // vector arc.
    {
      const blendInner = 1.14, blendOuter = 1.30;
      const n = outlinePts.length;
      const positions = [], uvs = [], indices = [];
      for (let i = 0; i <= n; i++) {
        const p = outlinePts[i % n];
        const u = i / n;
        for (const [r, v] of [[blendInner, 0], [blendOuter, 1]]) {
          positions.push(p.x * r, 0.0205, -p.y * r);
          uvs.push(u, v);
        }
      }
      for (let i = 0; i < n; i++) {
        const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);

      // Match the bank's lit physical material. An unlit transparent shader
      // here produced a pale strip because it bypassed lighting/tone mapping.
      const mat = sandMat.clone();
      mat.transparent = true;
      mat.depthWrite = false;
      mat.side = THREE.DoubleSide;
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = `varying float vBlendEdge;\nvarying vec3 vBlendWorld;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vBlendEdge = uv.y;
          vBlendWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `);
        shader.fragmentShader = `varying float vBlendEdge;\nvarying vec3 vBlendWorld;
          float blendHash(vec2 p){
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float blendNoise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(blendHash(i), blendHash(i + vec2(1,0)), f.x),
                       mix(blendHash(i + vec2(0,1)), blendHash(i + vec2(1,1)), f.x), f.y);
          }
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float blendN = blendNoise(vBlendWorld.xz * 2.15) * .68
                       + blendNoise(vBlendWorld.xz * 5.40) * .32;
          float blendCut = .43 + (blendN - .5) * .22;
          diffuseColor.a *= 1.0 - smoothstep(blendCut, .98, vBlendEdge);
        `);
      };
      mat.customProgramCacheKey = () => 'meadowPondBlendV2';
      const blend = new THREE.Mesh(geo, mat);
      blend.name = 'meadowPondBlend';
      blend.renderOrder = 2;
      pondGroup.add(blend);
    }

    // The wet band and foam ribbon define the shore; a separate 1px line here
    // read as a dotted clipping seam through the foam.
  }

  // A loose fringe just outside the sand hides the hard bank/lawn cut and
  // blends the shore into the meadow. Roots stay outside the grass boundary.
  {
    const fringe = [];
    const fr = rng(771);
    for (let i = 0; i < 220; i++) {
      const a = fr() * Math.PI * 2;
      const rr = 1.18 + fr() * .23;
      const x = POND.x + Math.cos(a) * POND.rx * rr;
      const z = POND.z + Math.sin(a) * POND.rz * rr;
      if (pathValueAt(x, z) > .35) continue;
      if (grassOnBank(x, z)) continue;
      const s = .30 + fr() * .38;
      fringe.push({
        m: localMatrix({
          x, y: 0, z,
          ry: fr() * Math.PI * 2,
          rx: (fr() - .5) * .12,
          rz: (fr() - .5) * .12,
          sx: s, sy: s * (0.72 + fr() * .28), sz: s,
        }),
        c: new THREE.Color().setHSL(.25, .66, .16),
      });
    }
    if (fringe.length) {
      const mesh = instanced(grassGeo, grassMat, fringe, false, group);
      mesh.name = 'meadowBankFringe';
    }
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
  const waterFlow = new THREE.Vector2();
  const waterFlowVel = new THREE.Vector2();
  let waterWavePhase = 0;
  let shoreWetness = null;
  let shoreWetnessData = null;
  let shoreWetnessTex = null;
  let shoreWetnessDry = null;
  let shoreWetnessClock = 0;
  const waterUniforms = {
    color: { value: new THREE.Color(0x4e7c78) },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uWavePhase: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.7, 0.3, -0.4) },
    uMoonDir: { value: new THREE.Vector3(0.7, 0.4, 0.4) },
    uSunColor: { value: new THREE.Color(0xffd49c) },
    uMoonColor: { value: new THREE.Color(0xc9dcff) },
    uDeep: { value: new THREE.Color(0x133d4a) },
    uShallow: { value: new THREE.Color(0x3fa9a2) },
    uShoreSand: { value: new THREE.Color(0x8f6f4f) },
    uAnime: { value: .68 },
    uCellScale: { value: 1.2 },
    uPondCenter: { value: new THREE.Vector2(POND.x, POND.z) },
    uPondRadii: { value: new THREE.Vector2(POND.rx * .98, POND.rz * .98) },
    uShorePhases: { value: new THREE.Vector3(shorePhases[0], shorePhases[1], shorePhases[2]) },
    uShoreWobble: { value: shoreWobble },
    uWindDir: wind.uniforms.uWindDir,
    uWindStrength: wind.uniforms.uWindStrength,
    uWindGust: wind.uniforms.uWindGust,
    uFlow: { value: waterFlow },
    uRippleCenters: { value: Array.from({ length: 8 }, () => new THREE.Vector2(POND.x, POND.z)) },
    uRippleT: { value: [0, 0, 0, 0, 0, 0, 0, 0] },
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
      uniform float uWavePhase;
      uniform float uAnime;
      uniform float uCellScale;
      uniform vec3 uSunDir, uMoonDir, uSunColor, uMoonColor, uDeep, uShallow, uShoreSand, color;
      uniform vec2 uPondCenter, uPondRadii;
      uniform vec3 uShorePhases;
      uniform float uShoreWobble;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      uniform float uWindGust;
      uniform vec2 uFlow;
      uniform vec2 uRippleCenters[8];
      uniform float uRippleT[8];
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
      vec2 wcell(vec2 seed){ return .5 + .5 * sin(6.2831 * seed); }
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
        vec2 ep = (p - uPondCenter) / uPondRadii;
        float er = length(ep);
        float ang = atan(ep.y, ep.x);
        vec2 wd = normalize(uWindDir + vec2(0.00001));
        vec2 side = vec2(-wd.y, wd.x);
        vec2 rel = p - uPondCenter;
        float along = dot(rel, wd);
        float across = dot(rel, side);
        float phase = along * 1.15 - uWavePhase;
        float crossPhase = across * 1.9 + sin(along * .6 + uTime * .17) * .55;
        float r1 = sin(phase) * cos(crossPhase) * .80
                 + sin(phase * .53 + crossPhase * .7 + uTime * .13) * .20;
        float r2 = sin(phase * .82 + crossPhase * .55 - uTime * .11) * .65
                 + sin(crossPhase * 1.4 - uWavePhase * .7) * .35;
        float waveAmp = .055 + uWindStrength * .035;
        vec3 N = normalize(vec3(
          (wd.x * r1 + side.x * r2 * .5) * waveAmp,
          1.0,
          (wd.y * r1 + side.y * r2 * .5) * waveAmp
        ));
        // The bank and wet rim use the same three-phase wobble as the mesh.
        // Evaluate that outline here instead of the old ideal ellipse.
        float shoreK = 1.0
          + uShoreWobble * sin(ang * 3.0 + uShorePhases.x)
          + uShoreWobble * .55 * sin(ang * 5.0 + uShorePhases.y)
          + uShoreWobble * .30 * cos(ang * 7.0 + uShorePhases.z);
        float edge = er / shoreK;
        vec2 shoreNormal = normalize(vec2(
          cos(ang) / uPondRadii.x,
          sin(ang) / uPondRadii.y
        ) + vec2(0.00001));
        float windward = smoothstep(-.10, .60, dot(shoreNormal, wd));
        float edgeMask = smoothstep(.80, .985, edge) * (1.0 - smoothstep(1.0, 1.045, edge));
        float edgeWave = sin(along * 4.4 - uWavePhase * 1.15
                             + sin(ang * 4.3 + uTime * .12) * .7);
        float edgeAmp = edgeMask * (.035 + uWindStrength * .045);
        N.x += wd.x * edgeWave * edgeAmp;
        N.z += wd.y * edgeWave * edgeAmp;
        N = normalize(N);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
        vec4 uv = vUv;
        // subtle mirror ripple (projected coordinates)
        uv.xy += vec2(r1, r2) * 0.0018 * uv.w;
        vec3 refl = texture2DProj(tDiffuse, uv).rgb;
        vec3 base = mix(uDeep, uShallow, 0.45 + 0.35 * r2);
        // Keep more of the pond's own ink/teal colour than the raw mirror. The
        // reflection is still present, but does not wash the pond white under a
        // bright noon sky.
        vec3 col = mix(base, refl, clamp(0.28 + fres * 0.42, 0.0, 0.72));
        col = mix(col, mix(uDeep, uShallow, .70), .26);
        // A narrow sandy shallows band softens the opaque water cutout. This is
        // colour-only inside the existing water mesh, so transparency and
        // sorting do not change.
        float shallows = smoothstep(.86, 1.0, edge);
        col = mix(col, mix(uShoreSand, uShallow, .15), shallows * .90);

        // Anime/Aero cell lines. The cell field stays world-anchored and is
        // translated by a smoothed flow offset, so a wind change redirects the
        // drift without rotating or jumping the existing pattern.
        vec2 cellUv = p * uCellScale - uFlow;
        float f1 = wf1(cellUv);
        float sf1 = wsf1(cellUv);
        float cellEdge = f1 - sf1;
        float cellAA = max(fwidth(cellEdge), .0005);
        float cell = smoothstep(.048, .088 + cellAA, cellEdge);
        cell *= 1.0 - smoothstep(.035, .09, cellAA);
        // Let the fine webbing dissolve into the shallow-water/wet edge rather
        // than terminating abruptly against the sand.
        float shoreSoft = 1.0 - smoothstep(.90, .99, edge);
        cell *= shoreSoft;
        col = mix(col, vec3(.54,.94,.94), cell * uAnime * .27);

        // Shore foam: a thin, broken crest rather than a continuous halo.
        // The angular breaks and small downwind ripples keep it from reading
        // as a vector outline around the whole pond.
        float breakA = .5 + .5 * sin(ang * 7.0 + along * .22 + sin(ang * 3.0 - uTime * .23) + .7);
        float breakB = .5 + .5 * sin(ang * 13.0 - along * .12 - uTime * .17 + 2.4);
        float shorePatch = smoothstep(.35, .80, breakA * .65 + breakB * .35);
        float edgeN = sin(ang * 11.0 + along * .25 + uTime * .22) * .003
                    + sin(ang * 23.0 - along * .18 - uTime * .13) * .0015
                    + edgeWave * .0022 * (.4 + uWindStrength * .6);
        float edgeBand = edge + edgeN;
        // Randomly varying inner threshold makes broken tongues of foam creep
        // toward the downwind bank instead of drawing one smooth ellipse.
        float foamTongue = .5 + .5 * sin(ang * 19.0 + sin(ang * 7.0 + uTime * .31) * 1.8);
        float foamStart = .950 + .014 * foamTongue;
        float foam = smoothstep(foamStart, .988, edgeBand)
                   * (1.0 - smoothstep(.998, 1.006, edgeBand));
        foam *= windward * shorePatch;
        col = mix(col, vec3(.84,.99,.96), foam * uAnime * .30);
        float shoreCrest = pow(max(0.0, sin(along * 5.4
          - uWavePhase * 1.25 + sin(ang * 3.5) * .9)), 3.0);
        col += vec3(.045,.105,.095) * max(0.0, edgeWave) * edgeMask
             * windward * (.35 + uWindStrength * .65) * uAnime;
        col += vec3(.055,.125,.110) * shoreCrest * edgeMask
             * windward * (.30 + uWindStrength * .70) * uAnime;

        // Splash rings: impact events are wind-stretched and drift downwind.
        float rip = 0.0;
        for (int i = 0; i < 8; i++){
          if (i >= uRippleCount) break;
          float age = uRippleT[i];
          vec2 rr = p - uRippleCenters[i] - wd * (age * .10);
          float d = length(vec2(dot(rr, wd), dot(rr, side) * .72));
          float rad = age * 1.55;
          float ring = 1.0 - smoothstep(.018, .095, abs(d - rad));
          float inner = 1.0 - smoothstep(.012, .060, abs(d - rad * .62));
          rip += (ring + inner * .30) * exp(-age * 1.25);
        }
        col = mix(col, vec3(.80,1.0,.98), clamp(rip, 0.0, 1.0) * .68);

        // sun and moon glints on the ripples
        vec3 R = reflect(-uSunDir, N);
        float sunSpec = pow(max(dot(R, V), 0.0), 260.0) * 2.8;
        vec3 Rm = reflect(-uMoonDir, N);
        float moonSpec = pow(max(dot(Rm, V), 0.0), 380.0) * 1.8;
        col += uSunColor * sunSpec;
        col += uMoonColor * moonSpec;
        float sparkle = pow(max(0.0, sin(p.x*4.2 + uTime*1.1) * sin(p.y*3.4 - uTime*.9)), 12.0) * 0.032;
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
  for (const k of ['uTime','uWavePhase','uSunDir','uMoonDir','uSunColor','uMoonColor','uDeep','uShallow','uShoreSand','uAnime','uCellScale','uPondCenter','uPondRadii','uShorePhases','uShoreWobble','uWindDir','uWindStrength','uWindGust','uFlow','uRippleCenters','uRippleT','uRippleCount']) ru[k] = waterUniforms[k];
  const reflectionCam = reflector.getReflectionCamera(camera);
  reflectionCam.layers.set(REFLECT_LAYER);
  reflectionCam.far = 400;
  let reflectTick = 1;
  const reflectEvery = 2;
  const originalOnBefore = reflector.onBeforeRender;
  reflector.onBeforeRender = function (...args) {
    // AO/depth prepasses must not replace the colour reflection with normals
    // or packed depth, nor advance its colour-pass update cadence.
    if (scene.overrideMaterial) return;
    if (++reflectTick % reflectEvery !== 0) return;
    originalOnBefore.apply(this, args);
  };

  // Wind-driven wash over the wet bank. The ribbon starts just inside the
  // water so its foam meets the surface shader, then reaches onto the sand.
  // A second ribbon carries persistent, foam-fed wetness that dries after the
  // foam retreats.
  {
    const washN = outlinePts.length;
    const makeRibbon = (inner, outer, y) => {
      const positions = [], uvs = [], indices = [];
      for (let i = 0; i <= washN; i++) {
        const p = outlinePts[i % washN];
        const u = i / washN;
        for (const [r, v] of [[inner, 0], [outer, 1]]) {
          positions.push(p.x * r, y, -p.y * r);
          uvs.push(u, v);
        }
      }
      for (let i = 0; i < washN; i++) {
        const a = i * 2, b = a + 1;
        const c = (i + 1) * 2, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      return geo;
    };

    // Meet the lit wet-bank colour exactly at the shoreline, fading only
    // inward over water. The water remains opaque; foam/wetness draw above it.
    const shallowsMat = sandMat.clone();
    shallowsMat.color.set(0x7f6047);
    shallowsMat.transparent = true;
    shallowsMat.depthWrite = false;
    shallowsMat.onBeforeCompile = shader => {
      shader.vertexShader = 'varying float vShallowEdge;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvShallowEdge = uv.y;');
      shader.fragmentShader = 'varying float vShallowEdge;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a *= smoothstep(0.0, .96, vShallowEdge);');
    };
    shallowsMat.customProgramCacheKey = () => 'meadowLitShallowsV1';
    const shallowsGeo = makeRibbon(.95, 1.002, .023);
    for (let i = 0; i < shallowsGeo.index.count; i += 3) {
      const a = shallowsGeo.index.array[i];
      shallowsGeo.index.array[i] = shallowsGeo.index.array[i + 2];
      shallowsGeo.index.array[i + 2] = a;
    }
    shallowsGeo.computeVertexNormals();
    const shallows = new THREE.Mesh(shallowsGeo, shallowsMat);
    shallows.name = 'meadowLitShallows';
    shallows.receiveShadow = true;
    shallows.renderOrder = 2;
    pondGroup.add(shallows);

    const wetRes = 256;
    shoreWetness = new Float32Array(wetRes);
    shoreWetnessData = new Uint8Array(wetRes * 4);
    const wetDry = new Float32Array(wetRes);
    for (let i = 0; i < wetRes; i++) {
      const h = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      wetDry[i] = 4 + 4 * h;
      shoreWetnessData[i * 4 + 3] = 255;
    }
    shoreWetnessDry = wetDry;
    shoreWetnessTex = new THREE.DataTexture(shoreWetnessData, wetRes, 1, THREE.RGBAFormat);
    shoreWetnessTex.colorSpace = THREE.NoColorSpace;
    shoreWetnessTex.minFilter = THREE.LinearFilter;
    shoreWetnessTex.magFilter = THREE.LinearFilter;
    shoreWetnessTex.wrapS = THREE.RepeatWrapping;
    shoreWetnessTex.wrapT = THREE.ClampToEdgeWrapping;
    shoreWetnessTex.flipY = false;
    shoreWetnessTex.needsUpdate = true;

    const washMat = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: waterUniforms.uPondCenter,
        uRadii: waterUniforms.uPondRadii,
        uWindDir: waterUniforms.uWindDir,
        uWindStrength: waterUniforms.uWindStrength,
        uWindGust: waterUniforms.uWindGust,
        uWavePhase: waterUniforms.uWavePhase,
        uTime: waterUniforms.uTime,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main(){
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec2 uCenter, uRadii, uWindDir;
        uniform float uWindStrength, uWindGust, uWavePhase, uTime;
        varying vec2 vUv;
        varying vec3 vWorld;
        void main(){
          vec2 rel = vWorld.xz - uCenter;
          vec2 n = normalize(vec2(rel.x / uRadii.x, rel.y / uRadii.y) + vec2(0.00001));
          vec2 wd = normalize(uWindDir + vec2(0.00001));
          float windward = smoothstep(-.10, .58, dot(n, wd));
          float wind = smoothstep(.04, .75, uWindStrength);
          float phase = vUv.x * 6.2831853;
          float p1 = .5 + .5 * sin(phase * 7.0 + uWavePhase * .70
                    + sin(phase * 3.0 + uTime * .25) * 1.7);
          float p2 = .5 + .5 * sin(phase * 13.0 - uWavePhase * .45 + 2.1);
          float p3 = .5 + .5 * sin(phase * 29.0 + uWavePhase * .9 + 1.3);
          float foamPatch = smoothstep(.38, .82, p1 * .50 + p2 * .30 + p3 * .20);
          float reach = .22 + .34 * foamPatch + .10 * wind;
          float inner = smoothstep(.00, .26, vUv.y);
          float outer = 1.0 - smoothstep(reach - .05, reach, vUv.y);
          float gust = .72 + .28 * clamp(uWindGust, 0.0, 1.0);
          float foam = inner * outer * foamPatch * windward * wind * gust;
          if (foam < .010) discard;
          gl_FragColor = vec4(.90, 1.0, 1.0, clamp(foam * 1.70, 0.0, .78));
          #include <colorspace_fragment>
        }
      `,
    });

    const wetMat = new THREE.ShaderMaterial({
      uniforms: { uWet: { value: shoreWetnessTex } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uWet;
        varying vec2 vUv;
        void main(){
          float wet = texture2D(uWet, vec2(vUv.x, .5)).r;
          float band = smoothstep(.02, .14, vUv.y) * (1.0 - smoothstep(.72, .98, vUv.y));
          float a = wet * band * .58;
          if (a < .004) discard;
          gl_FragColor = vec4(.20, .11, .055, a);
          #include <colorspace_fragment>
        }
      `,
    });

    const shoreWash = new THREE.Mesh(makeRibbon(.94, 1.14, 0.029), washMat);
    shoreWash.name = 'meadowShoreWash';
    shoreWash.renderOrder = 4;
    pondGroup.add(shoreWash);
    const shoreWet = new THREE.Mesh(makeRibbon(1.0, 1.14, 0.0245), wetMat);
    shoreWet.name = 'meadowShoreWet';
    shoreWet.renderOrder = 3;
    pondGroup.add(shoreWet);
  }

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
    padGeo.rotateX(-Math.PI / 2);
    const pads = [];
    const pr = rng(505);
    for (let i = 0; i < 10; i++) {
      const a = pr() * 6.283, rr = 0.25 + pr() * 0.65;
      const x = Math.cos(a) * POND.rx * rr, z = Math.sin(a) * POND.rz * rr;
      const s = 0.65 + pr() * 0.7;
      pads.push({ m: localMatrix({ x, y: POND.waterY + 0.008, z, ry: pr()*6.283, sx: s, sy: s, sz: s }) });
    }
    instanced(padGeo, padMat, pads, false, pondGroup);

    // reeds around the bank
    const reedGeo = new THREE.CylinderGeometry(0.012, 0.022, 0.75, 4);
    reedGeo.translate(0, 0.375, 0);
    const reeds = [];
    for (let i = 0; i < 60; i++) {
      const a = pr() * 6.283;
      const rr = .93 + pr() * .05;
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

  // The surface rings must disappear at the real wobbled shoreline, not the
  // sand bank or the rectangular pond cutout. Build one small point-in-polygon
  // mask from the same outline used by the water mesh and sample it in the ring
  // shader.
  const pondMaskExtent = Math.max(POND.rx, POND.rz) * 1.14;
  const pondMaskRes = 256;
  const pondMaskData = new Uint8Array(pondMaskRes * pondMaskRes * 4);
  const pondMaskInside = (px, py) => {
    let inside = false;
    for (let i = 0, j = outlinePts.length - 1; i < outlinePts.length; j = i++) {
      const a = outlinePts[i], b = outlinePts[j];
      if (((a.y > py) !== (b.y > py)) &&
          (px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    }
    return inside;
  };
  for (let iy = 0; iy < pondMaskRes; iy++) {
    const localZ = -pondMaskExtent + ((iy + .5) / pondMaskRes) * pondMaskExtent * 2;
    const shapeY = -localZ;
    for (let ix = 0; ix < pondMaskRes; ix++) {
      const localX = -pondMaskExtent + ((ix + .5) / pondMaskRes) * pondMaskExtent * 2;
      const o = (iy * pondMaskRes + ix) * 4;
      const on = pondMaskInside(localX, shapeY) ? 255 : 0;
      pondMaskData[o] = on;
      pondMaskData[o + 1] = on;
      pondMaskData[o + 2] = on;
      pondMaskData[o + 3] = 255;
    }
  }
  const pondMaskTex = new THREE.DataTexture(pondMaskData, pondMaskRes, pondMaskRes, THREE.RGBAFormat);
  pondMaskTex.colorSpace = THREE.NoColorSpace;
  pondMaskTex.minFilter = THREE.LinearFilter;
  pondMaskTex.magFilter = THREE.LinearFilter;
  pondMaskTex.wrapS = pondMaskTex.wrapT = THREE.ClampToEdgeWrapping;
  pondMaskTex.needsUpdate = true;
  const pondMaskCenter = { value: new THREE.Vector2(POND.x, POND.z) };
  const pondMaskExtentUniform = { value: pondMaskExtent };
  const splashRingMaterial = () => new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: pondMaskTex },
      uCenter: pondMaskCenter,
      uExtent: pondMaskExtentUniform,
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `
      uniform vec2 uCenter;
      uniform float uExtent;
      varying vec2 vMaskUv;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vMaskUv = vec2(
          (wp.x - uCenter.x + uExtent) / (2.0 * uExtent),
          (wp.z - uCenter.y + uExtent) / (2.0 * uExtent)
        );
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMask;
      uniform float uOpacity;
      varying vec2 vMaskUv;
      void main(){
        if (uOpacity <= 0.0 || texture2D(uMask, vMaskUv).r < 0.5) discard;
        gl_FragColor = vec4(0.88, 0.98, 1.0, uOpacity);
        #include <colorspace_fragment>
      }
    `,
  });

  // splash rings
  for (let i = 0; i < 10; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 36),
      splashRingMaterial()
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = POND.waterY + 0.012;
    ring.visible = false;
    group.add(ring);
    splashRings.push({ mesh: ring, t: 1, dur: 1.1, delay: 0, strength: 1 });
  }

  // Small pooled droplets keep impacts from reading as a flat decal.
  const DROP_MAX = 64;
  const dropGeo = new THREE.SphereGeometry(.036, 6, 4);
  const dropMat = new THREE.MeshBasicMaterial({
    color: 0xe8ffff, transparent: true, opacity: .82, depthWrite: false, toneMapped: false,
  });
  const dropMesh = new THREE.InstancedMesh(dropGeo, dropMat, DROP_MAX);
  dropMesh.name = 'meadowSplashDrops';
  dropMesh.frustumCulled = false;
  dropMesh.visible = false;
  dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(dropMesh);
  const dropDummy = new THREE.Object3D();
  const drops = Array.from({ length: DROP_MAX }, () => ({
    life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: .02,
  }));
  for (let i = 0; i < DROP_MAX; i++) {
    dropDummy.position.set(0, -100, 0);
    dropDummy.scale.setScalar(0);
    dropDummy.updateMatrix();
    dropMesh.setMatrixAt(i, dropDummy.matrix);
  }
  dropMesh.instanceMatrix.needsUpdate = true;

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

  // ---------------------------------------------------------------- bee swarm
  // A small reusable point burst for hive stings; it is short-lived and costs
  // one draw call only while a bear is actually raiding.
  const BEE_MAX = 4, BEE_PER = 14;
  const beePositions = new Float32Array(BEE_MAX * BEE_PER * 3);
  const beeGeo = new THREE.BufferGeometry();
  beeGeo.setAttribute('position', new THREE.BufferAttribute(beePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const beePoints = new THREE.Points(beeGeo, new THREE.PointsMaterial({
    size: .22, map: fireflyTexture(), color: 0xffdf72, transparent: true,
    opacity: 0, depthWrite: false, toneMapped: false, sizeAttenuation: true, alphaTest: .01,
    blending: THREE.AdditiveBlending,
  }));
  beePoints.name = 'meadowBeeSwarm';
  beePoints.frustumCulled = false;
  beePoints.visible = false;
  group.add(beePoints);

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
      if (!b.active || b.sleeping) continue;
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

  // ---------------------------------------------------------------- AI plan overlay
  // One selected-bear route only. The line and ring are debug-only scene objects;
  // they share a fixed-size buffer so changing the plan does not allocate.
  const aiPlanGroup = new THREE.Group();
  aiPlanGroup.name = 'meadowAIPlan';
  aiPlanGroup.visible = false;
  group.add(aiPlanGroup);
  const AI_PLAN_MAX = 64;
  const aiPlanPositions = new Float32Array(AI_PLAN_MAX * 3);
  const aiPlanGeo = new THREE.BufferGeometry();
  aiPlanGeo.setAttribute('position', new THREE.BufferAttribute(aiPlanPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const aiPlanLine = new THREE.Line(
    aiPlanGeo,
    new THREE.LineBasicMaterial({
      color: 0x5ee7ff, transparent: true, opacity: .95,
      depthTest: false, depthWrite: false, toneMapped: false,
    })
  );
  aiPlanLine.name = 'meadowAIPlanLine';
  aiPlanLine.frustumCulled = false;
  aiPlanLine.renderOrder = 20;
  aiPlanGroup.add(aiPlanLine);
  const aiPlanDots = new THREE.Points(
    aiPlanGeo,
    new THREE.PointsMaterial({
      color: 0xa8f6ff, size: .17, sizeAttenuation: true,
      depthTest: false, depthWrite: false, transparent: true,
      opacity: .95, toneMapped: false,
    })
  );
  aiPlanDots.name = 'meadowAIPlanDots';
  aiPlanDots.frustumCulled = false;
  aiPlanDots.renderOrder = 20;
  aiPlanGroup.add(aiPlanDots);
  const aiPlanTarget = new THREE.Mesh(
    new THREE.RingGeometry(.16, .30, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffd66a, transparent: true, opacity: .95,
      side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false,
    })
  );
  aiPlanTarget.name = 'meadowAIPlanTarget';
  aiPlanTarget.rotation.x = -Math.PI / 2;
  aiPlanTarget.position.y = .07;
  aiPlanTarget.renderOrder = 20;
  aiPlanTarget.visible = false;
  aiPlanGroup.add(aiPlanTarget);

  function setAIPlan(points, target) {
    const n = Math.min(points?.length || 0, AI_PLAN_MAX);
    if ((!n && !target) || (n < 2 && !target)) {
      aiPlanGroup.visible = false;
      aiPlanTarget.visible = false;
      return 0;
    }
    for (let i = 0; i < n; i++) {
      const p = points[i];
      aiPlanPositions[i*3] = p.x;
      aiPlanPositions[i*3+1] = .12;
      aiPlanPositions[i*3+2] = p.z;
    }
    aiPlanGeo.setDrawRange(0, n);
    aiPlanGeo.attributes.position.needsUpdate = true;
    aiPlanLine.visible = n > 1;
    if (target) {
      aiPlanTarget.position.set(target.x, .07, target.z);
      aiPlanTarget.visible = true;
    } else {
      aiPlanTarget.visible = false;
    }
    aiPlanGroup.visible = true;
    return n;
  }

  // ---------------------------------------------------------------- food
  // The flower blooms above are already placed clear of the paths and props.
  // Fallen jelly fruit gives the bears a second safe food type without asking
  // them to reach into the canopy.
  {
    const fruitCols = [0xff7e9c, 0xffc94f, 0xff9b58, 0xd995ff, 0xfff0a8];
    const fallenGeo = new THREE.SphereGeometry(.13, 10, 8);
    const fallenMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: .17,
      clearcoat: .85, clearcoatRoughness: .16, metalness: 0,
    });
    const parts = [];
    const fr = rng(5173);
    for (const lot of TREE_LOTS) {
      for (let k = 0; k < 2; k++) {
        let x = 0, z = 0, ok = false;
        for (let tries = 0; tries < 12; tries++) {
          const a = fr() * Math.PI * 2;
          const rad = 1.05 + fr() * 0.55;
          x = lot.x + Math.cos(a) * rad;
          z = lot.z + Math.sin(a) * rad;
          if (!fieldInside(x, z, 1.0)) continue;
          if (pathValueAt(x, z) > .22) continue;
          if (solidAt(x, z, .45)) continue;
          if (!nav.isWalkable(x, z)) continue;
          if (homes.some(h => Math.hypot(x - h.door.x, z - h.door.z) < 2.0)) continue;
          if (Math.hypot(x - STUDIO_HOUSE.door.x, z - STUDIO_HOUSE.door.z) < 2.0) continue;
          ok = true;
          break;
        }
        if (!ok) continue;
        const visualIndex = parts.length;
        parts.push({
          m: localMatrix({ x, y: .14, z, ry: fr() * 6.283, sx: 1, sy: 1, sz: 1 }),
          c: new THREE.Color(fruitCols[Math.floor(fr() * fruitCols.length)]),
        });
        foodSources.push({
          id: `fruit-${visualIndex}`,
          kind: 'fruit',
          label: 'jelly fruit',
          x, z, y: .14,
          approachX: x, approachZ: z,
          satiation: .35,
          respawnMin: 45, respawnMax: 90,
          visualIndex,
        });
      }
    }
    if (parts.length) {
      const mesh = instanced(fallenGeo, fallenMat, parts, false, group);
      mesh.name = 'meadowFallenFruit';
      fallenFruitVisual = { mesh, parts };
      group.userData.fallenFruit = parts.length;
    }
  }

  // Beehives are high-value food with a sting risk. They hang above the first
  // two trees, so the bear approaches the trunk rather than eating at the
  // canopy position. A depleted hive hides independently of the other hive.
  if (hiveVisual) {
    for (let i = 0; i < hiveVisual.length; i++) {
      const hive = hiveVisual[i];
      let approach = null;
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * Math.PI * 2 + i * .7;
        const rawX = hive.treeX + Math.cos(a) * 1.55 * hive.treeScale;
        const rawZ = hive.treeZ + Math.sin(a) * 1.55 * hive.treeScale;
        if (!fieldInside(rawX, rawZ, 1.0)) continue;
        const p = nav.nearestWalkable(rawX, rawZ);
        if (!p) continue;
        if (Math.hypot(p.x - rawX, p.z - rawZ) > 1.2) continue;
        if (pond.contains(p.x, p.z)) continue;
        approach = p;
        break;
      }
      if (!approach) continue;
      foodSources.push({
        id: `hive-${i}`,
        kind: 'hive',
        label: 'beehive',
        x: hive.center.x, z: hive.center.z, y: hive.center.y,
        approachX: approach.x, approachZ: approach.z,
        satiation: .55,
        respawnMin: 90, respawnMax: 150,
        visualIndex: i,
      });
    }
  }

  // Keep only food sources whose approach is actually reachable. Flowers can
  // sit next to a trunk or house clearance; the visual stays decorative, while
  // the edible source is either shifted to the nearest walkable cell or dropped.
  const usableFoodSources = [];
  for (const s of foodSources) {
    if (!nav.isWalkable(s.approachX, s.approachZ)) {
      const p = nav.nearestWalkable(s.approachX, s.approachZ);
      if (!p || Math.hypot(p.x - s.approachX, p.z - s.approachZ) > 2.2) continue;
      s.approachX = p.x;
      s.approachZ = p.z;
    }
    usableFoodSources.push(s);
  }

  function setFoodVisible(source, visible) {
    if (!source) return;
    const m = visible ? null : hiddenFoodMatrix;
    if (source.kind === 'flower' && flowerFoodVisual) {
      const i = source.visualIndex;
      const { stems, blooms, centers } = flowerFoodVisual.parts;
      if (!stems[i] || !blooms[i] || !centers[i]) return;
      flowerFoodVisual.stems.setMatrixAt(i, m || stems[i].m);
      flowerFoodVisual.blooms.setMatrixAt(i, m || blooms[i].m);
      flowerFoodVisual.centers.setMatrixAt(i, m || centers[i].m);
      flowerFoodVisual.stems.instanceMatrix.needsUpdate = true;
      flowerFoodVisual.blooms.instanceMatrix.needsUpdate = true;
      flowerFoodVisual.centers.instanceMatrix.needsUpdate = true;
    } else if (source.kind === 'fruit' && fallenFruitVisual) {
      const i = source.visualIndex;
      const part = fallenFruitVisual.parts[i];
      if (!part) return;
      fallenFruitVisual.mesh.setMatrixAt(i, m || part.m);
      fallenFruitVisual.mesh.instanceMatrix.needsUpdate = true;
    } else if (source.kind === 'hive' && hiveVisual) {
      const hive = hiveVisual[source.visualIndex];
      if (hive) hive.mesh.visible = !!visible;
    }
  }

  food = createFoodRegistry({
    sources: usableFoodSources,
    rng: rng(8741),
    onVisibility: setFoodVisible,
  });

  // Safe, walkable drinking approaches around the pond. The water itself is
  // infinite; these are shore positions, not consumable sources.
  const waterSpots = [];
  {
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const rawX = POND.x + Math.cos(a) * POND.rx * 1.22;
      const rawZ = POND.z + Math.sin(a) * POND.rz * 1.22;
      if (!fieldInside(rawX, rawZ, .8)) continue;
      const p = nav.nearestWalkable(rawX, rawZ);
      if (!p) continue;
      if (Math.hypot(p.x - rawX, p.z - rawZ) > 2.2) continue;
      if (pond.contains(p.x, p.z)) continue;
      if (waterSpots.some(w => Math.hypot(w.x - p.x, w.z - p.z) < 1.4)) continue;
      waterSpots.push({
        x: p.x, z: p.z,
        waterX: POND.x + Math.cos(a) * POND.rx * .94,
        waterZ: POND.z + Math.sin(a) * POND.rz * .94,
        y: POND.waterY,
      });
    }
  }

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
    for (const s of usableFoodSources) {
      if (!nav.isWalkable(s.approachX, s.approachZ)) errors.push(`${s.id} food approach is blocked`);
      if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) errors.push(`${s.id} has a bad position`);
    }
    if (food) errors.push(...food.validate());
    if (!waterSpots.length) errors.push('pond has no walkable drinking approach');
    for (const w of waterSpots) {
      if (!nav.isWalkable(w.x, w.z)) errors.push('pond drinking approach is blocked');
      if (pond.contains(w.x, w.z)) errors.push('pond drinking approach is in the water');
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

  // ---------------------------------------------------------------- emotes
  // A tiny pooled sprite layer for social feedback. It is intentionally
  // render-only: ai.js decides when a heart, question or shove mark belongs
  // above a bear, and this module just gives it a short readable lifetime.
  function emote(x, y, z, kind = 'heart') {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    const style = EMOTE_STYLES[kind] || EMOTE_STYLES.heart;
    let e = emotes.find((item) => !item.visible);
    if (!e) {
      if (emotes.length >= 18) return false;
      e = new THREE.Sprite(new THREE.SpriteMaterial({
        map: emoteTexture(kind),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }));
      e.name = 'meadowEmote';
      e.renderOrder = 8;
      e.visible = false;
      group.add(e);
      emotes.push(e);
    }
    e.material.map = emoteTexture(kind);
    e.material.color.set(0xffffff);
    e.material.opacity = 1;
    e.material.needsUpdate = true;
    e.visible = true;
    e.position.set(x, y, z);
    e.scale.set(.34, .34, 1);
    e.userData.t = 0;
    e.userData.dur = kind === 'heart' ? 1.15 : .95;
    e.userData.baseScale = kind === 'heart' ? .34 : .38;
    e.userData.kind = style.glyph;
    return true;
  }

  function updateEmotes(dt) {
    for (const e of emotes) {
      if (!e.visible) continue;
      e.userData.t += dt;
      const k = e.userData.t / e.userData.dur;
      if (k >= 1) { e.visible = false; continue; }
      const fade = 1 - k;
      e.position.y += dt * (0.32 + fade * .10);
      e.material.opacity = fade;
      const s = e.userData.baseScale * (0.82 + k * .32);
      e.scale.set(s, s, 1);
    }
  }

  // ---------------------------------------------------------------- splash / update
  function emitDroplets(x, z, strength) {
    const wd = wind ? wind.direction : { x: 0, z: 0 };
    const count = Math.min(18, Math.max(4, Math.round(4 + strength * 10)));
    for (let k = 0; k < count; k++) {
      let d = drops.find(q => q.life <= 0);
      if (!d) d = drops[k % drops.length];
      const a = Math.random() * Math.PI * 2;
      const speed = .28 + Math.random() * .62 * strength;
      d.life = .0001;
      d.max = .42 + Math.random() * .55;
      d.x = x + Math.cos(a) * .12 * Math.random();
      d.z = z + Math.sin(a) * .12 * Math.random();
      d.y = POND.waterY + .035;
      d.vx = Math.cos(a) * speed + wd.x * (.35 + strength * .55);
      d.vz = Math.sin(a) * speed + wd.z * (.35 + strength * .55);
      d.vy = 1.0 + Math.random() * 1.9 * strength;
      d.size = .55 + Math.random() * .85;
    }
  }

  function updateDroplets(dt) {
    let active = 0;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (d.life > 0) {
        d.life += dt;
        if (d.life < d.max && d.y >= POND.waterY - .05) {
          d.x += d.vx * dt;
          d.z += d.vz * dt;
          d.y += d.vy * dt;
          d.vy -= 5.2 * dt;
          const k = 1 - d.life / d.max;
          dropDummy.position.set(d.x, d.y, d.z);
          dropDummy.scale.setScalar(d.size * (.55 + k * .45));
          active++;
        } else {
          d.life = 0;
        }
      }
      if (d.life <= 0) {
        dropDummy.position.set(0, -100, 0);
        dropDummy.scale.setScalar(0);
      }
      dropDummy.updateMatrix();
      dropMesh.setMatrixAt(i, dropDummy.matrix);
    }
    dropMesh.visible = active > 0;
    dropMesh.instanceMatrix.needsUpdate = true;
  }

  function updateShoreWetness(dt) {
    if (!shoreWetness || !shoreWetnessData || !shoreWetnessTex) return;
    shoreWetnessClock += dt;
    if (shoreWetnessClock < .10) return;
    const step = shoreWetnessClock;
    shoreWetnessClock = 0;
    const smooth = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const wd = wind.direction;
    const windAmt = smooth(.04, .75, wind.strength);
    const gustAmt = .72 + .28 * Math.min(1, Math.max(0, wind.gust));
    const phaseTime = waterUniforms.uTime.value;
    const wave = waterWavePhase;
    const count = shoreWetness.length;
    for (let i = 0; i < count; i++) {
      const u = i / count;
      const a = u * Math.PI * 2;
      const nx = Math.cos(a) / (POND.rx * .98);
      const nz = Math.sin(a) / (POND.rz * .98);
      const nl = Math.hypot(nx, nz) || 1;
      const windward = smooth(-.10, .58, (nx * wd.x + nz * wd.z) / nl);
      const phase = u * Math.PI * 2;
      const p1 = .5 + .5 * Math.sin(phase * 7 + wave * .70 + Math.sin(phase * 3 + phaseTime * .25) * 1.7);
      const p2 = .5 + .5 * Math.sin(phase * 13 - wave * .45 + 2.1);
      const p3 = .5 + .5 * Math.sin(phase * 29 + wave * .9 + 1.3);
      const target = smooth(.38, .82, p1 * .50 + p2 * .30 + p3 * .20)
        * windward * windAmt * gustAmt;
      const next = Math.max(shoreWetness[i], target);
      shoreWetness[i] = Math.max(0, next - step / shoreWetnessDry[i]);
      shoreWetnessData[i * 4] = Math.round(shoreWetness[i] * 255);
    }
    shoreWetnessTex.needsUpdate = true;
  }

  function splash(x, z, strength = 1) {
    const s = THREE.MathUtils.clamp(Number(strength) || 0, .08, 1.5);
    const pulses = s > .72 ? 3 : s > .28 ? 2 : 1;
    for (let k = 0; k < pulses; k++) {
      const ring = splashRings.find(r => r.t >= r.dur) || splashRings[k % splashRings.length];
      ring.t = 0;
      ring.delay = k * .10;
      ring.dur = .84 + s * .24;
      ring.strength = s * (1 - k * .16);
      ring.mesh.position.set(x, POND.waterY + .012, z);
      ring.mesh.scale.setScalar(.4 + ring.strength * .2);
      ring.mesh.material.uniforms.uOpacity.value = .62 * ring.strength;
      ring.mesh.visible = false;
    }
    emitDroplets(x, z, s);
  }

  function sting(x, z, y = 1.5) {
    if (stingBursts.length >= BEE_MAX) stingBursts.shift();
    stingBursts.push({
      x, z, y: Number.isFinite(y) ? y : 1.5,
      t: 0, dur: 1.25, phase: Math.random() * Math.PI * 2,
    });
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
  let occupancySig = '';
  const occupiedHomes = [];
  function update(dt, activeBears) {
    if (sky) sky.update(dt);
    wind.update(dt);
    horizon.update(dt, wind);
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
      occupiedHomes.length = 0;
      for (let i = 0; i < n; i++) {
        const b = activeBears[i];
        grassBears[i*4] = b.cx; grassBears[i*4+1] = b.cz;
        grassBears[i*4+2] = b.vcx; grassBears[i*4+3] = b.vcz;
        if (b.sleeping && b.home) occupiedHomes.push(b.home);
      }
      occupiedHomes.sort();
      const sig = occupiedHomes.join('|');
      if (sig !== occupancySig) {
        occupancySig = sig;
        aeroHomes.setOccupied(occupiedHomes);
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
      updateSunState(sun, sky);
      waterUniforms.uTime.value += dt;
      const wd = wind.direction;
      const waveSpeed = .25 + wind.strength * 1.05 + wind.gust * .28;
      waterWavePhase += dt * waveSpeed;
      waterUniforms.uWavePhase.value = waterWavePhase;
      const flowSpeed = wind.strength * (.095 + wind.gust * .045);
      const flowK = 1 - Math.exp(-1.8 * dt);
      waterFlowVel.x += (wd.x * flowSpeed - waterFlowVel.x) * flowK;
      waterFlowVel.y += (wd.z * flowSpeed - waterFlowVel.y) * flowK;
      waterFlow.x += waterFlowVel.x * dt;
      waterFlow.y += waterFlowVel.y * dt;
      const night = sky.night ?? 0;
      glassMat.emissiveIntensity = 0.38 + night*2.1;
        if (night !== lastNight) lastNight = night;
    }
    updateShoreWetness(dt);
    const ripCenters = waterUniforms.uRippleCenters.value;
    const ripT = waterUniforms.uRippleT.value;
    let ripCount = 0;
    for (const r of splashRings) {
      if (r.t >= r.dur) { r.mesh.visible = false; continue; }
      r.t += dt;
      if (r.t < r.delay) { r.mesh.visible = false; continue; }
      const age = r.t - r.delay;
      const p = Math.min(1, age / Math.max(.01, r.dur - r.delay));
      const grow = .4 + p * 3.8;
      r.mesh.visible = true;
      r.mesh.scale.set(grow, grow * .88, 1);
      r.mesh.material.uniforms.uOpacity.value = (1 - p) * .68 * (r.strength || 1);
      if (ripCount < 8) {
        ripCenters[ripCount].set(r.mesh.position.x, r.mesh.position.z);
        ripT[ripCount] = age;
        ripCount++;
      }
    }
    waterUniforms.uRippleCount.value = ripCount;
    updateDroplets(dt);
    // short hive-sting bee clouds
    let beeCount = 0, beeOpacity = 0;
    for (let i = stingBursts.length - 1; i >= 0; i--) {
      const burst = stingBursts[i];
      burst.t += dt;
      if (burst.t >= burst.dur) { stingBursts.splice(i, 1); continue; }
      beeOpacity = Math.max(beeOpacity, Math.min(1, (1 - burst.t / burst.dur) * 1.3));
      for (let k = 0; k < BEE_PER; k++) {
        const a = burst.phase + k / BEE_PER * Math.PI * 2 + burst.t * 5.5;
        const rad = .42 + Math.sin(burst.t * 8 + k) * .10;
        beePositions[beeCount * 3] = burst.x + Math.cos(a) * rad;
        beePositions[beeCount * 3 + 1] = burst.y + Math.sin(burst.t * 9 + k * 1.7) * .34;
        beePositions[beeCount * 3 + 2] = burst.z + Math.sin(a) * rad;
        beeCount++;
      }
    }
    if (beeCount) {
      beePoints.visible = true;
      beePoints.material.opacity = beeOpacity;
      beePoints.geometry.setDrawRange(0, beeCount);
      beePoints.geometry.attributes.position.needsUpdate = true;
    } else {
      beePoints.visible = false;
      beePoints.material.opacity = 0;
    }
    updateEmotes(dt);
    // nav debug line opacity gently pulses
    if (navDebug) navDebug.material.opacity = 0.45 + Math.sin(performance.now()*0.002)*0.08;
  }

  return {
    group, sky, nav, navDebug, homes, colliders, pond, bounds: FIELD_BOUNDS,
    pathStones, cannonHome: CANNON_HOME, wind, trees, horizon, aeroHomes, backdrop, studioHouse, bushes,
    food, foodSources: usableFoodSources, waterSpots,
    hives: hiveVisual,
    fireflies: fireflyPoints, fireflyLights,
    valid: layoutErrors.length === 0,
    layoutErrors,
    sun,
    update,
    drawShadows,
    splash,
    sting,
    emote,
    get emoteCount() { return emotes.filter(e => e.visible).length; },
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
    setAIPlan,
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
