// Detailed non-playable backdrop: a noisy rolling hill ring with layered
// low-LOD tree belts, hedges, flower drifts and rocks. No colliders, nav or
// gameplay state; all instances are outside the field bounds.

import * as THREE from 'three';
import { REFLECT_LAYER } from './sky.js';

const INNER = 64;
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
  for (let i = 0; i < 3600; i++) {
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
  // Stay flat under the playable rim, then lift gradually into the hills. The
  // terrain begins beneath the lawn so the two surfaces overlap instead of
  // meeting at a hard ring.
  const edge = smooth(clamp((r - 69.0) / 34, 0, 1));
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
      pos.push(x, y - .04, z);
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
      // Match the meadow green at the flat overlap, then ease into the hill
      // palette so the circumference cannot read as a painted circle.
      const lawnBlend = smooth(clamp((r - 64) / 28, 0, 1));
      c.lerp(new THREE.Color(0x6f9d50), 1 - lawnBlend);
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
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: hillTexture(),
    emissive: 0x3b6a30,
    emissiveIntensity: .62,
  });
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
  const UP = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();
  function addBranchSegment(p0, p1, radius, color) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < .04) return;
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    tmpQ.setFromUnitVectors(UP, dir);
    trunks.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3((p0.x + p1.x) * .5, (p0.y + p1.y) * .5, (p0.z + p1.z) * .5),
        tmpQ.clone(),
        new THREE.Vector3(radius, len, radius)
      ),
      c: color,
    });
  }

  for (let i = 0; i < treeCount; i++) {
    const a = rnd() * Math.PI * 2;
    const r = INNER + 2 + Math.pow(rnd(), 1.45) * 144;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const baseY = heightAt(x, z);
    if (baseY < .15) continue;
    const s = .7 + rnd() * 1.35;
    const trunkH = 1.8 * s + rnd() * .9;
    const trunkCol = new THREE.Color(trunkColors[Math.floor(rnd() * trunkColors.length)]);
    const canopyCol = new THREE.Color(canopyColors[Math.floor(rnd() * canopyColors.length)]);
    const base = new THREE.Vector3(x, baseY - .05, z);
    const top = new THREE.Vector3(x, baseY + trunkH, z);
    const crown = new THREE.Vector3(x, baseY + trunkH + .75 * s, z);
    addBranchSegment(base, top, s * .85, trunkCol);

    const tips = [];
    const primaries = 3 + Math.floor(rnd() * 3);
    for (let b = 0; b < primaries; b++) {
      const ang = b / primaries * Math.PI * 2 + rnd() * .65;
      const h = baseY + trunkH * (.34 + rnd() * .48);
      const p0 = new THREE.Vector3(x, h, z);
      const reach = (1.05 + rnd() * .95) * s;
      const rise = (.35 + rnd() * .90) * s;
      const p1 = new THREE.Vector3(
        x + Math.cos(ang) * reach,
        h + rise,
        z + Math.sin(ang) * reach
      );
      addBranchSegment(p0, p1, s * (.38 + rnd() * .15), trunkCol);
      tips.push(p1);
      const sub = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < sub; k++) {
        const a2 = ang + (rnd() - .5) * 1.4;
        const p2 = new THREE.Vector3(
          p1.x + Math.cos(a2) * reach * (.45 + rnd() * .35),
          p1.y + (.18 + rnd() * .55) * s,
          p1.z + Math.sin(a2) * reach * (.45 + rnd() * .35)
        );
        addBranchSegment(p1, p2, s * (.18 + rnd() * .09), trunkCol);
        tips.push(p2);
      }
    }

    // Foliage lives on branch/twig tips, not as a ball around a bare pole.
    const lobes = [];
    for (const tip of tips) {
      const count = 1 + (rnd() < .55 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const p = tip.clone().add(new THREE.Vector3(
          (rnd() - .5) * .65 * s,
          (rnd() - .30) * .45 * s,
          (rnd() - .5) * .65 * s
        ));
        lobes.push(p);
        canopyParts.push({
          m: new THREE.Matrix4().compose(
            p,
            new THREE.Quaternion().setFromAxisAngle(UP, rnd() * 6.283),
            new THREE.Vector3((.55 + rnd() * .50) * s, (.48 + rnd() * .40) * s, (.55 + rnd() * .50) * s)
          ),
          c: canopyCol.clone().offsetHSL(0, .015, (rnd() - .5) * .075),
          center: crown,
        });
      }
    }
    // A small crown fill lobe keeps the silhouette from looking hollow.
    lobes.push(crown);
    canopyParts.push({
      m: new THREE.Matrix4().compose(
        crown.clone().add(new THREE.Vector3(0, .1 * s, 0)),
        new THREE.Quaternion().setFromAxisAngle(UP, rnd() * 6.283),
        new THREE.Vector3(.72 * s, .62 * s, .72 * s)
      ),
      c: canopyCol.clone().offsetHSL(0, .02, .02),
      center: crown,
    });

    if (r < 126 && r > INNER - 1) {
      for (const lobe of lobes) {
        const n = 2 + Math.floor(rnd() * 2);
        for (let lf = 0; lf < n; lf++) {
          leafParts.push({
            m: new THREE.Matrix4().compose(
              lobe.clone().add(new THREE.Vector3(
                (rnd() - .5) * .9 * s,
                (rnd() - .35) * .75 * s,
                (rnd() - .5) * .9 * s
              )),
              new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - .5) * 1.3, rnd() * 6.283, (rnd() - .5) * 1.1)),
              new THREE.Vector3(.36 * s, (.44 + rnd() * .20) * s, .36 * s)
            ),
            c: canopyCol.clone().offsetHSL(0, .02, (rnd() - .5) * .09),
            center: crown,
          });
        }
      }
    }
  }

  // A sparse low-LOD grass carpet on the hills breaks up the large green slopes
  // at the distances where the playable blade carpet fades out.
  for (let i = 0; i < 7000; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 65.5 + Math.pow(rnd(), 1.3) * 53;
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
  for (let i = 0; i < 150; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 61 + rnd() * 27;
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
  // A continuous soft hedge ring hides the geometry/lighting seam where the
  // playable disc meets the hill toe. It is deliberately irregular and double
  // layered so it reads as a wild hedge, not a circular wall.
  for (let i = 0; i < 150; i++) {
    const a = i / 150 * Math.PI * 2 + (rnd() - .5) * .045;
    const r = 63.4 + rnd() * 5.6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = heightAt(x, z);
    const s = .55 + rnd() * .85;
    hedgeParts.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + .30 * s, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.283),
        new THREE.Vector3(s, s * (.55 + rnd() * .40), s)
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

  const foliageUniforms = {
    uSunDir: { value: new THREE.Vector3(.35, .82, .25).normalize() },
    uFoliageShadow: { value: new THREE.Color(0x4c7839) },
    uFoliageLit: { value: new THREE.Color(0x8cbb5e) },
    uFoliageHigh: { value: new THREE.Color(0xc3df95) },
  };
  function makeFoliageMaterial(side, leaf) {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, foliageUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aCanopyCenter;\nattribute vec3 aCanopyTint;\nvarying vec3 vFoliageWorld;\nvarying vec3 vFoliageCenter;\nvarying vec3 vFoliageTint;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wf = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vFoliageWorld = wf.xyz;
          vFoliageCenter = aCanopyCenter;
          vFoliageTint = aCanopyTint;
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uFoliageShadow;\nuniform vec3 uFoliageLit;\nuniform vec3 uFoliageHigh;\nvarying vec3 vFoliageWorld;\nvarying vec3 vFoliageCenter;\nvarying vec3 vFoliageTint;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 fdir = normalize(vFoliageWorld - vFoliageCenter);
          float falign = dot(fdir, uSunDir);
          float flit = smoothstep(-.55, .36, falign);
          float fhigh = smoothstep(.26, .88, falign);
          vec3 fcol = mix(uFoliageShadow, uFoliageLit, flit);
          fcol = mix(fcol, uFoliageHigh, fhigh * .55);
          fcol *= mix(vec3(1.0), vFoliageTint, .22);
          diffuseColor.rgb = fcol;
        `);
      if (leaf) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          normal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
        `);
      }
    };
    m.customProgramCacheKey = () => leaf ? 'backdropFoliageLeafV1' : 'backdropFoliageLobeV1';
    return m;
  }
  function addFoliageAttributes(mesh, parts) {
    const centers = new Float32Array(parts.length * 3);
    const tints = new Float32Array(parts.length * 3);
    for (let i = 0; i < parts.length; i++) {
      centers[i * 3] = parts[i].center.x; centers[i * 3 + 1] = parts[i].center.y; centers[i * 3 + 2] = parts[i].center.z;
      tints[i * 3] = parts[i].c.r; tints[i * 3 + 1] = parts[i].c.g; tints[i * 3 + 2] = parts[i].c.b;
    }
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('aCanopyCenter', new THREE.InstancedBufferAttribute(centers, 3));
    mesh.geometry.setAttribute('aCanopyTint', new THREE.InstancedBufferAttribute(tints, 3));
  }
  const canopyGeo = lobeGeo.clone();
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, makeFoliageMaterial(THREE.FrontSide, false), canopyParts.length);
  for (let i = 0; i < canopyParts.length; i++) canopyMesh.setMatrixAt(i, canopyParts[i].m);
  canopyMesh.instanceMatrix.needsUpdate = true;
  addFoliageAttributes(canopyMesh, canopyParts);
  canopyMesh.name = 'backdropCanopy'; canopyMesh.frustumCulled = false; canopyMesh.layers.enable(REFLECT_LAYER);
  group.add(canopyMesh);

  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -.34, .42, .05, .34, .42, .05,
    -.22, .78, .08, .22, .78, .08, 0, 1, .10,
  ], 3));
  leafGeo.setIndex([0,1,2, 1,4,2, 1,3,4, 3,5,4]);
  leafGeo.computeVertexNormals();
  const leafMesh = new THREE.InstancedMesh(leafGeo, makeFoliageMaterial(THREE.DoubleSide, true), leafParts.length);
  for (let i = 0; i < leafParts.length; i++) leafMesh.setMatrixAt(i, leafParts[i].m);
  leafMesh.instanceMatrix.needsUpdate = true;
  addFoliageAttributes(leafMesh, leafParts);
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
    trees: treeCount,
    branches: trunks.length,
    canopy: canopyParts.length,
    leaves: leafParts.length,
    hedges: hedgeParts.length,
    heightAt,
    setSun(v) {
      if (v) foliageUniforms.uSunDir.value.copy(v).normalize();
    },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}
