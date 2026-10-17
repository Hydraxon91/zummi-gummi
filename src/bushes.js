// Small branched meadow bushes.
//
// The silhouette is generated from short woody stems and twig forks; the
// foliage lobes and leaf sprays sit on those tips. Foliage uses a canopy-centre
// gradient (shadow -> lit -> highlight) so the bushes read as small, fluffy,
// branched trees rather than green rocks.

import * as THREE from 'three';
import { REFLECT_LAYER } from './sky.js';

const UP = new THREE.Vector3(0, 1, 0);
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
    0, 0, 0, -.26, .32, .04, .26, .32, .04,
    -.17, .62, .06, .17, .62, .06, 0, .82, .08,
  ], 3));
  g.setIndex([0, 1, 2, 1, 4, 2, 1, 3, 4, 3, 5, 4]);
  g.computeVertexNormals();
  return g;
})();

const branchGeo = (() => {
  const g = new THREE.CylinderGeometry(.10, .16, 1, 6);
  g.translate(0, .5, 0);
  return g;
})();

const lobeGeo = new THREE.IcosahedronGeometry(1, 1);

const foliageUniforms = {
  uSunDir: { value: new THREE.Vector3(.35, .82, .25).normalize() },
  uShadow: { value: new THREE.Color(0x3d6b36) },
  uLit: { value: new THREE.Color(0x7fb856) },
  uHigh: { value: new THREE.Color(0xbee58a) },
};

function foliageMaterial(side) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, foliageUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBushCenter;\nattribute vec3 aBushTint;\nvarying vec3 vBushWorld;\nvarying vec3 vBushCenter;\nvarying vec3 vBushTint;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBushWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vBushCenter = aBushCenter;
        vBushTint = aBushTint;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uShadow;\nuniform vec3 uLit;\nuniform vec3 uHigh;\nvarying vec3 vBushWorld;\nvarying vec3 vBushCenter;\nvarying vec3 vBushTint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 d = normalize(vBushWorld - vBushCenter);
        float a = dot(d, uSunDir);
        float lit = smoothstep(-.50, .38, a);
        float hi = smoothstep(.24, .88, a);
        vec3 col = mix(uShadow, uLit, lit);
        col = mix(col, uHigh, hi * .55);
        col *= mix(vec3(1.0), vBushTint, .34);
        diffuseColor.rgb = col;
      `);
  };
  m.customProgramCacheKey = () => 'meadowBushFoliageV1';
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
        lobes.push({
          m: new THREE.Matrix4().compose(
            p,
            new THREE.Quaternion().setFromAxisAngle(UP, rand() * TAU),
            new THREE.Vector3((.26 + rand() * .25) * s, (.24 + rand() * .22) * s, (.26 + rand() * .25) * s)
          ),
          c: green.clone().offsetHSL(0, .02, (rand() - .5) * .08),
          center: crown,
        });
        const leafCount = 1 + Math.floor(rand() * 2);
        for (let lf = 0; lf < leafCount; lf++) {
          leaves.push({
            m: new THREE.Matrix4().compose(
              p.clone().add(new THREE.Vector3(
                (rand() - .5) * .48 * s,
                (rand() - .3) * .34 * s,
                (rand() - .5) * .48 * s
              )),
              new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - .5) * 1.2, rand() * TAU, (rand() - .5) * 1.0)),
              new THREE.Vector3(.24 * s, (.30 + rand() * .12) * s, .24 * s)
            ),
            c: green.clone().offsetHSL(0, .01, (rand() - .5) * .09),
            center: crown,
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

  const leafMesh = new THREE.InstancedMesh(leafGeo, foliageMaterial(THREE.DoubleSide), leaves.length);
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
