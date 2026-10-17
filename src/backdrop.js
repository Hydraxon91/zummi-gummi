// Detailed non-playable backdrop: a noisy rolling hill ring with layered
// low-LOD tree belts, hedges, flower drifts and rocks. No colliders, nav or
// gameplay state; all instances are outside the field bounds.

import * as THREE from 'three';
import { REFLECT_LAYER } from './sky.js';

const INNER = 68;
const OUTER = 232;

function makeRand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const smooth = t => t * t * (3 - 2 * t);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

function hillTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const r = makeRand(6143);
  ctx.fillStyle = '#d7e5c2';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 190; i++) {
    const x = r() * S, y = r() * S, rad = 14 + r() * 80;
    const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
    g.addColorStop(0, r() < .5 ? 'rgba(110,166,86,.17)' : 'rgba(238,250,214,.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S;
    ctx.fillStyle = r() < .55 ? 'rgba(86,137,64,.20)' : 'rgba(238,249,210,.20)';
    ctx.fillRect(x, y, 1.2 + r() * 2.4, 1 + r() * 2.2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function hash2(x, z) {
  const n = Math.sin(x * 127.13 + z * 311.71) * 43758.5453123;
  return n - Math.floor(n);
}
function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = smooth(x - xi), zf = smooth(z - zi);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * xf) * (1 - zf) + (c + (d - c) * xf) * zf;
}
function fbm(x, z) {
  let v = 0, a = .55;
  for (let i = 0; i < 4; i++) {
    v += valueNoise(x, z) * a;
    x = x * 2.07 + 17.1; z = z * 2.07 - 9.7;
    a *= .48;
  }
  return v;
}
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const edge = smooth(clamp((r - INNER) / 34, 0, 1));
  const a = Math.atan2(z, x);
  const n = fbm(x * .014 + 4.3, z * .014 - 2.7);
  const detail = fbm(x * .055 - 9.1, z * .055 + 3.8);
  const long = .5 + .5 * Math.sin(a * 3.1 + 1.6);
  const folds = .5 + .5 * Math.sin(a * 6.2 - 2.0 + n * 2.3);
  const ridge = Math.sin(a * 2.0 + .7) * .5 + .5;
  const berm = Math.exp(-Math.pow((r - 91) / 20, 2)) * 2.0;
  // Leave a low open pass toward the north so the Aero skyline reads above the
  // hill line instead of disappearing behind a green wall.
  const passAngle = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2));
  const pass = 1 - .58 * Math.exp(-(passAngle * passAngle) / .32);
  const h = (1.6 + n * 13.5 + detail * 2.8 + long * 4.5 + folds * 2.7 + ridge * 3.8 + berm) * pass;
  return edge * Math.max(0, h) * (1 - smooth(clamp((r - 205) / 26, 0, 1)));
}

function buildTerrain() {
  const segs = 192, rings = 30;
  const pos = [], uv = [], col = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = INNER + (OUTER - INNER) * Math.pow(t, 1.18);
    for (let i = 0; i <= segs; i++) {
      const a = i / segs * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      pos.push(x, y, z);
      uv.push(x * .012, z * .012);
      const n = fbm(x * .035 + 11.2, z * .035 - 4.1);
      const broad = fbm(x * .009 - 3.4, z * .009 + 8.6);
      const crest = clamp(y / 18, 0, 1);
      const valley = 1 - clamp(y / 9, 0, 1);
      const c = new THREE.Color().setHSL(
        .248 + n * .042,
        .52 + n * .18,
        .26 + crest * .17 + n * .07 - valley * .035
      );
      c.offsetHSL(0, 0, (broad - .5) * .035);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + 1;
      const c = a + segs + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: hillTexture() });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'backdropHills';
  mesh.frustumCulled = false;
  mesh.layers.enable(REFLECT_LAYER);
  return mesh;
}

export function createBackdrop() {
  const group = new THREE.Group();
  group.name = 'meadowBackdrop';
  group.add(buildTerrain());

  const rnd = makeRand(9217);
  const trunks = [], canopyParts = [], leafParts = [], hedgeParts = [], hillGrassParts = [], flowerParts = [], rockParts = [];
  const canopyColors = [0x5eaf47, 0x72bf55, 0x4f9e3e, 0x83c966, 0x68b34e, 0x93cf74];
  const trunkColors = [0x63432d, 0x765039, 0x533927];

  const treeCount = 186;
  for (let i = 0; i < treeCount; i++) {
    const a = rnd() * Math.PI * 2;
    const r = INNER + 2 + Math.pow(rnd(), 1.45) * 144;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const baseY = heightAt(x, z);
    if (baseY < .15) continue;
    const s = .7 + rnd() * 1.35;
    const trunkH = 1.5 * s + rnd() * .7;
    trunks.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(x, baseY + trunkH * .5 - .1, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.283),
        new THREE.Vector3(s * .65, trunkH, s * .65)
      ),
      c: new THREE.Color(trunkColors[Math.floor(rnd() * trunkColors.length)]),
    });
    const lobes = 5 + Math.floor(rnd() * 4);
    for (let l = 0; l < lobes; l++) {
      const angle = rnd() * 6.283, rr = (rnd() * .9 + .20) * s;
      const cy = baseY + trunkH + (rnd() - .32) * 1.2 * s;
      const canopyCol = new THREE.Color(canopyColors[Math.floor(rnd() * canopyColors.length)]);
      canopyParts.push({
        m: new THREE.Matrix4().compose(
          new THREE.Vector3(x + Math.cos(angle) * rr, cy, z + Math.sin(angle) * rr),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.283),
          new THREE.Vector3((.78 + rnd() * .68) * s, (.70 + rnd() * .55) * s, (.78 + rnd() * .68) * s)
        ),
        c: canopyCol,
      });
      if (r < 124) {
        for (let lf = 0; lf < 6; lf++) {
          const la = rnd() * 6.283, lr = (rnd() * 1.0 + .30) * s;
          leafParts.push({
            m: new THREE.Matrix4().compose(
              new THREE.Vector3(x + Math.cos(angle) * rr + Math.cos(la) * lr, cy + (rnd() - .35) * 1.15 * s, z + Math.sin(angle) * rr + Math.sin(la) * lr),
              new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - .5) * 1.2, rnd() * 6.283, (rnd() - .5) * 1.0)),
              new THREE.Vector3(.42 * s, (.52 + rnd() * .22) * s, .42 * s)
            ),
            c: canopyCol.clone().offsetHSL(0, .02, (rnd() - .5) * .08),
          });
        }
      }
    }
  }

  // A sparse low-LOD grass carpet on the hills breaks up the large green slopes
  // at the distances where the playable blade carpet fades out.
  for (let i = 0; i < 2600; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 70 + Math.pow(rnd(), 1.3) * 64;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < .2) continue;
    const s = .26 + rnd() * .40;
    hillGrassParts.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + .01, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.283),
        new THREE.Vector3(s, s * (.55 + rnd() * .55), s)
      ),
      // Keep hill blades in the hill's own green range. Pale blades at this
      // distance read as white rain streaks against the darker terrain.
      c: new THREE.Color().setHSL(.24 + rnd() * .045, .46 + rnd() * .14, .19 + rnd() * .07),
    });
  }

  // near-field hedges and flower drifts give the boundary a layered edge rather
  // than a clean cut between playable lawn and backdrop.
  for (let i = 0; i < 82; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 56 + rnd() * 28;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = heightAt(x, z);
    hedgeParts.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + .35, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.283),
        new THREE.Vector3(.8 + rnd() * 1.4, .55 + rnd() * .65, .8 + rnd() * 1.4)
      ),
      c: new THREE.Color(canopyColors[Math.floor(rnd() * canopyColors.length)]),
    });
  }
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 59 + rnd() * 62;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < .15) continue;
    const col = new THREE.Color().setHSL(.05 + rnd() * .12, .55, .67);
    flowerParts.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + .12, z),
        new THREE.Quaternion(),
        new THREE.Vector3(.07 + rnd() * .06, .07 + rnd() * .08, .07 + rnd() * .06)
      ),
      c: col,
    });
  }
  for (let i = 0; i < 48; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 58 + rnd() * 140;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = heightAt(x, z);
    rockParts.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + .15, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.283),
        new THREE.Vector3(.25 + rnd() * .5, .18 + rnd() * .3, .25 + rnd() * .5)
      ),
      c: new THREE.Color().setHSL(.10, .12, .44 + rnd() * .12),
    });
  }

  const grassGeo = (() => {
    const p = [], idx = [];
    const blade = (yaw, ox, oz, h, w) => {
      const ca = Math.cos(yaw), sa = Math.sin(yaw);
      const off = p.length / 3;
      const verts = [[-w, 0, 0], [w, 0, 0], [-w * .55, h * .55, .04], [w * .55, h * .55, .04], [0, h, .08]];
      for (const [x, y, z] of verts) p.push(x * ca - z * sa + ox, y, x * sa + z * ca + oz);
      idx.push(off, off + 2, off + 1, off + 1, off + 2, off + 3, off + 2, off + 4, off + 3);
    };
    blade(0, 0, 0, 1, .10);
    blade(2.1, .07, .03, .82, .08);
    blade(4.2, -.05, -.04, .7, .09);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const trunkGeo = new THREE.CylinderGeometry(.10, .16, 1, 6);
  const lobeGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ vertexColors: false }), trunks.length);
  for (let i = 0; i < trunks.length; i++) {
    trunkMesh.setMatrixAt(i, trunks[i].m);
    trunkMesh.setColorAt(i, trunks[i].c);
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
  trunkMesh.name = 'backdropTrunks'; trunkMesh.frustumCulled = false; trunkMesh.layers.enable(REFLECT_LAYER);
  group.add(trunkMesh);

  const canopyMesh = new THREE.InstancedMesh(lobeGeo, new THREE.MeshLambertMaterial({ vertexColors: false }), canopyParts.length);
  for (let i = 0; i < canopyParts.length; i++) {
    canopyMesh.setMatrixAt(i, canopyParts[i].m);
    canopyMesh.setColorAt(i, canopyParts[i].c);
  }
  canopyMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
  canopyMesh.name = 'backdropCanopy'; canopyMesh.frustumCulled = false; canopyMesh.layers.enable(REFLECT_LAYER);
  group.add(canopyMesh);

  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -.34, .42, .05, .34, .42, .05,
    -.22, .78, .08, .22, .78, .08, 0, 1, .10,
  ], 3));
  leafGeo.setIndex([0,1,2, 1,4,2, 1,3,4, 3,5,4]);
  leafGeo.computeVertexNormals();
  const leafMesh = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ vertexColors: false, side: THREE.DoubleSide }), leafParts.length);
  for (let i = 0; i < leafParts.length; i++) {
    leafMesh.setMatrixAt(i, leafParts[i].m);
    leafMesh.setColorAt(i, leafParts[i].c);
  }
  leafMesh.instanceMatrix.needsUpdate = true;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  leafMesh.name = 'backdropLeaves'; leafMesh.frustumCulled = false; leafMesh.layers.enable(REFLECT_LAYER);
  group.add(leafMesh);

  const hedgeMesh = new THREE.InstancedMesh(lobeGeo, new THREE.MeshLambertMaterial({ vertexColors: false }), hedgeParts.length);
  for (let i = 0; i < hedgeParts.length; i++) {
    hedgeMesh.setMatrixAt(i, hedgeParts[i].m);
    hedgeMesh.setColorAt(i, hedgeParts[i].c);
  }
  hedgeMesh.instanceMatrix.needsUpdate = true;
  if (hedgeMesh.instanceColor) hedgeMesh.instanceColor.needsUpdate = true;
  hedgeMesh.name = 'backdropHedges'; hedgeMesh.frustumCulled = false; hedgeMesh.layers.enable(REFLECT_LAYER);
  group.add(hedgeMesh);

  const hillGrassMesh = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: 0x486f38, vertexColors: false, side: THREE.DoubleSide }), hillGrassParts.length);
  for (let i = 0; i < hillGrassParts.length; i++) {
    hillGrassMesh.setMatrixAt(i, hillGrassParts[i].m);
    hillGrassMesh.setColorAt(i, hillGrassParts[i].c);
  }
  hillGrassMesh.instanceMatrix.needsUpdate = true;
  if (hillGrassMesh.instanceColor) hillGrassMesh.instanceColor.needsUpdate = true;
  hillGrassMesh.name = 'backdropGrass'; hillGrassMesh.frustumCulled = false; hillGrassMesh.layers.enable(REFLECT_LAYER);
  group.add(hillGrassMesh);

  const flowerGeo = new THREE.OctahedronGeometry(1, 0);
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, new THREE.MeshLambertMaterial({ vertexColors: false }), flowerParts.length);
  for (let i = 0; i < flowerParts.length; i++) {
    flowerMesh.setMatrixAt(i, flowerParts[i].m);
    flowerMesh.setColorAt(i, flowerParts[i].c);
  }
  flowerMesh.instanceMatrix.needsUpdate = true;
  if (flowerMesh.instanceColor) flowerMesh.instanceColor.needsUpdate = true;
  flowerMesh.name = 'backdropFlowers'; flowerMesh.frustumCulled = false; flowerMesh.layers.enable(REFLECT_LAYER);
  group.add(flowerMesh);

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMesh = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ vertexColors: false }), rockParts.length);
  for (let i = 0; i < rockParts.length; i++) {
    rockMesh.setMatrixAt(i, rockParts[i].m);
    rockMesh.setColorAt(i, rockParts[i].c);
  }
  rockMesh.instanceMatrix.needsUpdate = true;
  if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
  rockMesh.name = 'backdropRocks'; rockMesh.frustumCulled = false; rockMesh.layers.enable(REFLECT_LAYER);
  group.add(rockMesh);

  return {
    group,
    trees: trunks.length,
    hedges: hedgeParts.length,
    heightAt,
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}
