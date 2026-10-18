// Small branched meadow bushes.
//
// The silhouette is generated from short woody stems and twig forks; the
// foliage lobes and leaf sprays sit on those tips. Foliage uses a canopy-centre
// gradient (shadow -> lit -> highlight) so the bushes read as small, fluffy,
// branched trees rather than green rocks.

import * as THREE from 'three';
import { REFLECT_LAYER } from './sky.js';

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;

function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const leafGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, 0, 0,  .5, 0, 0,  -.5, 1, 0,  .5, 1, 0,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  g.computeVertexNormals();
  return g;
})();

// Bush foliage gets its own leaf-cluster card: fewer, larger leaves than the
// hero tree so the silhouette reads at bush scale. The map is near-white so the
// per-instance bush tint still controls the colour.
function bushLeafTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const r = makeRand(6197);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const drawLeaf = (x, y, len, width, angle, shade) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(width * .84, -len * .22, width * .76, -len * .62, 0, -len);
    ctx.bezierCurveTo(-width * .76, -len * .62, -width * .84, -len * .22, 0, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, -len);
    const lo = 206 + shade, mid = 232 + shade, hi = 246 + shade;
    g.addColorStop(0, `rgb(${lo - 12},${lo + 8},${lo - 28})`);
    g.addColorStop(.55, `rgb(${mid - 6},${mid + 10},${mid - 22})`);
    g.addColorStop(1, `rgb(${hi},${hi + 4},${hi - 8})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(84,120,56,.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -len * .08);
    ctx.quadraticCurveTo(width * .06, -len * .5, 0, -len * .93);
    ctx.stroke();
    ctx.restore();
  };
  const cx = .5, cy = .54;
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * (0.82 + r() * .22);
    const x = cx + Math.cos(a) * rad * .34;
    const y = cy + Math.sin(a) * rad * .38;
    const angle = (r() < .7 ? r() * Math.PI * 2 : Math.atan2(x - cx, -(y - cy)) + (r() - .5) * .8);
    const len = (.095 + r() * .095) * (1.08 - rad * .28);
    drawLeaf(x * S, y * S, len * S, len * S * (.44 + r() * .14), angle, (r() - .5) * 18);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

const branchGeo = (() => {
  const g = new THREE.CylinderGeometry(.10, .16, 1, 6);
  g.translate(0, .5, 0);
  return g;
})();

const lobeGeo = new THREE.IcosahedronGeometry(1, 1);

const foliageUniforms = {
  uSunDir: { value: new THREE.Vector3(.35, .82, .25).normalize() },
  uShadow: { value: new THREE.Color(0x4a7839) },
  uLit: { value: new THREE.Color(0x86b65a) },
  uHigh: { value: new THREE.Color(0xc1df91) },
};

function foliageMaterial(side, leafNormals = false, map = null) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side });
  if (map) {
    m.map = map;
    m.alphaTest = .42;
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, foliageUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBushCenter;\nattribute vec3 aBushTint;\nvarying vec3 vBushWorld;\nvarying vec3 vBushCenter;\nvarying vec3 vBushTint;'
        + (leafNormals ? '\nattribute vec3 aLeafCenter;\nvarying vec3 vLeafOut;' : ''))
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBushWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vBushCenter = aBushCenter;
        vBushTint = aBushTint;
        ${leafNormals ? `
        // Point leaf cards away from their own foliage lobe so the sprays are
        // lit as small clumps instead of flat triangles, matching the trees.
        vec3 leafOut = normalize(vBushWorld - aLeafCenter + vec3(1e-4));
        float leafTilt = (fract(sin(dot(aLeafCenter, vec3(12.9898, 78.233, 37.719))) * 43758.5453) - .5) * .5;
        float leafC = cos(leafTilt), leafS = sin(leafTilt);
        vLeafOut = normalize(mat3(modelViewMatrix) * vec3(
          leafOut.x * leafC - leafOut.z * leafS,
          leafOut.y,
          leafOut.x * leafS + leafOut.z * leafC));
        ` : ''}
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uShadow;\nuniform vec3 uLit;\nuniform vec3 uHigh;\nvarying vec3 vBushWorld;\nvarying vec3 vBushCenter;\nvarying vec3 vBushTint;'
        + (leafNormals ? '\nvarying vec3 vLeafOut;' : ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 d = normalize(vBushWorld - vBushCenter);
        float a = dot(d, uSunDir);
        float lit = smoothstep(-.50, .38, a);
        float hi = smoothstep(.24, .88, a);
        vec3 col = mix(uShadow, uLit, lit);
        col = mix(col, uHigh, hi * .55);
        col *= mix(vec3(1.0), vBushTint, .24);
        diffuseColor.rgb *= col;
      `)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>'
        + (leafNormals ? `
        normal = normalize(mix(normal, normalize(vLeafOut), .50) + vec3(1e-4));
        ` : ''));
  };
  m.customProgramCacheKey = () => leafNormals ? 'meadowBushLeavesV1' : 'meadowBushFoliageV1';
  return m;
}

function addInstanceAttributes(mesh, parts) {
  const centers = new Float32Array(parts.length * 3);
  const tints = new Float32Array(parts.length * 3);
  for (let i = 0; i < parts.length; i++) {
    centers[i * 3] = parts[i].center.x;
    centers[i * 3 + 1] = parts[i].center.y;
    centers[i * 3 + 2] = parts[i].center.z;
    tints[i * 3] = parts[i].c.r;
    tints[i * 3 + 1] = parts[i].c.g;
    tints[i * 3 + 2] = parts[i].c.b;
  }
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('aBushCenter', new THREE.InstancedBufferAttribute(centers, 3));
  mesh.geometry.setAttribute('aBushTint', new THREE.InstancedBufferAttribute(tints, 3));
  if (parts.some(p => p.clump)) {
    const clump = new Float32Array(parts.length * 3);
    for (let i = 0; i < parts.length; i++) {
      clump[i * 3] = parts[i].clump.x;
      clump[i * 3 + 1] = parts[i].clump.y;
      clump[i * 3 + 2] = parts[i].clump.z;
    }
    mesh.geometry.setAttribute('aLeafCenter', new THREE.InstancedBufferAttribute(clump, 3));
  }
}

export function createBushCollection({ lots }) {
  const group = new THREE.Group();
  group.name = 'meadowBushes';
  const segments = [], lobes = [], leaves = [];
  const branchColors = [0x60452f, 0x725137, 0x513a29];
  const greens = [0x4f963b, 0x68ac4c, 0x3d8434, 0x7fbe5b];

  for (let bi = 0; bi < lots.length; bi++) {
    const lot = lots[bi];
    const rand = makeRand(7129 + bi * 971 + Math.round(lot.x * 37 + lot.z * 53));
    const s = lot.scale;
    const baseY = lot.y || 0;
    const crown = new THREE.Vector3(lot.x, baseY + .62 * s, lot.z);
    const branchCol = new THREE.Color(branchColors[Math.floor(rand() * branchColors.length)]);
    const green = new THREE.Color(greens[Math.floor(rand() * greens.length)]);
    const stems = 3 + Math.floor(rand() * 3);
    const tips = [];

    for (let st = 0; st < stems; st++) {
      const a0 = rand() * TAU;
      const r0 = rand() * .16 * s;
      const p0 = new THREE.Vector3(lot.x + Math.cos(a0) * r0, baseY + .02, lot.z + Math.sin(a0) * r0);
      const reach = (.34 + rand() * .46) * s;
      const p1 = new THREE.Vector3(
        p0.x + Math.cos(a0) * reach,
        baseY + (.30 + rand() * .42) * s,
        p0.z + Math.sin(a0) * reach
      );
      addSegment(segments, p0, p1, .10 + rand() * .045, branchCol);
      tips.push(p1);
      const forks = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < forks; k++) {
        const a1 = a0 + (rand() - .5) * 1.5;
        const p2 = new THREE.Vector3(
          p1.x + Math.cos(a1) * reach * (.42 + rand() * .28),
          p1.y + (.12 + rand() * .28) * s,
          p1.z + Math.sin(a1) * reach * (.42 + rand() * .28)
        );
        addSegment(segments, p1, p2, .065 + rand() * .035, branchCol);
        tips.push(p2);
      }
    }

    for (const tip of tips) {
      const n = 1 + (rand() < .42 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const p = tip.clone().add(new THREE.Vector3(
          (rand() - .5) * .34 * s,
          (rand() - .25) * .20 * s,
          (rand() - .5) * .34 * s
        ));
        const lobeScale = new THREE.Vector3((.19 + rand() * .17) * s, (.17 + rand() * .15) * s, (.19 + rand() * .17) * s);
        lobes.push({
          m: new THREE.Matrix4().compose(
            p,
            new THREE.Quaternion().setFromAxisAngle(UP, rand() * TAU),
            lobeScale
          ),
          c: green.clone().offsetHSL(0, .02, (rand() - .5) * .08).multiplyScalar(.90),
          center: crown,
        });
        // Several sprigs per lobe cover it in small leaves. The card has to be
        // large enough that its individual leaves read at bush scale: a small
        // card made every leaf only a couple of centimetres wide and invisible.
        const leafCount = 13 + (rand() < .4 ? 1 : 0);
        for (let lf = 0; lf < leafCount; lf++) {
          const dir = new THREE.Vector3(rand() - .5, rand() - .52, rand() - .5).normalize();
          const pos = p.clone().add(new THREE.Vector3(
            dir.x * lobeScale.x * 1.00 + (rand() - .5) * .10 * s,
            dir.y * lobeScale.y * 1.00 + (rand() - .5) * .08 * s,
            dir.z * lobeScale.z * 1.00 + (rand() - .5) * .10 * s
          ));
          const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, dir);
          // Tilt away from the pure tangent plane: a card lying flat on the
          // lobe is edge-on from the side and disappears. Angled sprigs read
          // from every direction and catch the canopy gradient.
          q.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).normalize(),
            .35 + rand() * .65
          ));
          q.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, rand() * TAU));
          leaves.push({
            m: new THREE.Matrix4().compose(
              pos,
              q,
              new THREE.Vector3(.50 * s, (.54 + rand() * .12) * s, .50 * s)
            ),
            c: green.clone().offsetHSL(0, .01, (rand() - .5) * .09),
            center: crown,
            clump: p,
          });
        }
      }
    }
    // Fill the centre a little so the bush doesn't read as a ring of leaves.
    lobes.push({
      m: new THREE.Matrix4().compose(
        crown,
        new THREE.Quaternion().setFromAxisAngle(UP, rand() * TAU),
        new THREE.Vector3(.42 * s, .34 * s, .42 * s)
      ),
      c: green.clone().offsetHSL(0, .02, .02),
      center: crown,
    });
  }

  const branchMesh = new THREE.InstancedMesh(branchGeo, new THREE.MeshLambertMaterial({ vertexColors: false }), segments.length);
  for (let i = 0; i < segments.length; i++) {
    branchMesh.setMatrixAt(i, segments[i].m);
    branchMesh.setColorAt(i, segments[i].c);
  }
  branchMesh.instanceMatrix.needsUpdate = true;
  if (branchMesh.instanceColor) branchMesh.instanceColor.needsUpdate = true;
  branchMesh.name = 'bushBranches';
  branchMesh.frustumCulled = false;
  branchMesh.layers.enable(REFLECT_LAYER);
  group.add(branchMesh);

  const lobeMesh = new THREE.InstancedMesh(lobeGeo, foliageMaterial(THREE.FrontSide), lobes.length);
  for (let i = 0; i < lobes.length; i++) lobeMesh.setMatrixAt(i, lobes[i].m);
  lobeMesh.instanceMatrix.needsUpdate = true;
  addInstanceAttributes(lobeMesh, lobes);
  lobeMesh.name = 'bushFoliage';
  lobeMesh.frustumCulled = false;
  lobeMesh.layers.enable(REFLECT_LAYER);
  group.add(lobeMesh);

  const leafMesh = new THREE.InstancedMesh(leafGeo, foliageMaterial(THREE.DoubleSide, true, bushLeafTexture()), leaves.length);
  for (let i = 0; i < leaves.length; i++) leafMesh.setMatrixAt(i, leaves[i].m);
  leafMesh.instanceMatrix.needsUpdate = true;
  addInstanceAttributes(leafMesh, leaves);
  leafMesh.name = 'bushLeaves';
  leafMesh.frustumCulled = false;
  leafMesh.layers.enable(REFLECT_LAYER);
  group.add(leafMesh);

  return {
    group,
    count: lots.length,
    segments: segments.length,
    lobes: lobes.length,
    setSun(v) { if (v) foliageUniforms.uSunDir.value.copy(v).normalize(); },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}

function addSegment(out, p0, p1, radius, color) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < .025) return;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz).normalize());
  out.push({
    m: new THREE.Matrix4().compose(
      new THREE.Vector3((p0.x + p1.x) * .5, (p0.y + p1.y) * .5, (p0.z + p1.z) * .5),
      q,
      new THREE.Vector3(radius / .16, len, radius / .16)
    ),
    c: color,
  });
}
