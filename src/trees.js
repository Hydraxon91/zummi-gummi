// Procedural gummy-meadow trees.
//
// Trees are generated once from stable seeds, merged into a few world-space
// batches, and animated entirely in the vertex shaders using the shared wind.
// No branch, leaf or fruit transforms are touched on the CPU after creation.

import * as THREE from 'three';
import { REFLECT_LAYER } from './sky.js';
import { WIND_GLSL } from './wind.js';

const UP = new THREE.Vector3(0, 1, 0);
const TWO_PI = Math.PI * 2;

function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }

function barkTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const r = makeRand(9137);
  ctx.fillStyle = '#d7c2a3';
  ctx.fillRect(0, 0, W, H);
  // soft warm bark bands
  for (let i = 0; i < 90; i++) {
    const x = r() * W, w = 1 + r() * 5;
    ctx.fillStyle = r() < 0.5 ? 'rgba(104,76,52,.10)' : 'rgba(255,240,214,.12)';
    ctx.beginPath();
    ctx.ellipse(x, r() * H, w, 30 + r() * 140, (r() - .5) * .08, 0, TWO_PI);
    ctx.fill();
  }
  // thin vertical streaks
  for (let i = 0; i < 170; i++) {
    const x = r() * W, y = r() * H, len = 12 + r() * 90;
    const g = ctx.createLinearGradient(x, y, x + (r() - .5) * 3, y + len);
    g.addColorStop(0, 'rgba(67,43,27,0)');
    g.addColorStop(.35, `rgba(67,43,27,${0.07 + r() * 0.08})`);
    g.addColorStop(1, 'rgba(67,43,27,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = .8 + r() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (r() - .5) * 8, y + len * .5, x + (r() - .5) * 3, y + len);
    ctx.stroke();
  }
  // occasional small knots
  for (let i = 0; i < 16; i++) {
    const x = r() * W, y = r() * H, rad = 2 + r() * 5;
    ctx.strokeStyle = 'rgba(78,51,32,.24)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * 1.6, 0, 0, TWO_PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(79,48,28,.16)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, rad * .45, rad * .8, 0, 0, TWO_PI);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function leafTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const r = makeRand(4813);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A card is a twiglet carrying many small, individual leaves rather than one
  // oversized leaf spray. Small silhouettes read as foliage up close and
  // average into a soft mass at distance, without extra card instances.
  const drawLeaf = (x, y, len, width, angle, shade) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(width * .86, -len * .20, width * .78, -len * .62, 0, -len);
    ctx.bezierCurveTo(-width * .78, -len * .62, -width * .86, -len * .20, 0, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, -len);
    const lo = 208 + shade, mid = 232 + shade, hi = 246 + shade;
    g.addColorStop(0, `rgb(${lo - 14},${lo + 8},${lo - 30})`);
    g.addColorStop(.55, `rgb(${mid - 6},${mid + 10},${mid - 24})`);
    g.addColorStop(1, `rgb(${hi},${hi + 4},${hi - 10})`);
    ctx.fillStyle = g;
    ctx.fill();
    // A light midrib and side veins give the small leaf some internal shape
    // without a second texture or another draw call.
    ctx.strokeStyle = 'rgba(88,126,60,.20)';
    ctx.lineWidth = Math.max(1, S * .0016);
    ctx.beginPath();
    ctx.moveTo(0, -len * .06);
    ctx.quadraticCurveTo(width * .07, -len * .52, 0, -len * .94);
    ctx.stroke();
    for (let i = 1; i <= 2; i++) {
      const yy = -len * (.20 + i * .26);
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(width * .24, yy - len * .04, width * .46, yy - len * .11);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(-width * .24, yy - len * .04, -width * .46, yy - len * .11);
      ctx.stroke();
    }
    ctx.restore();
  };

  const twig = (x0, y0, cx, cy, x1, y1, width) => {
    ctx.strokeStyle = 'rgba(214,232,192,.85)';
    ctx.lineWidth = width * S;
    ctx.beginPath();
    ctx.moveTo(x0 * S, y0 * S);
    ctx.quadraticCurveTo(cx * S, cy * S, x1 * S, y1 * S);
    ctx.stroke();
  };
  twig(.500, .985, .492, .780, .500, .560, .009);
  twig(.494, .960, .400, .760, .360, .600, .006);
  twig(.506, .950, .600, .750, .648, .585, .006);

  // Scatter small leaves through an irregular elliptical cluster instead of
  // combing them along one stem: every leaf points outward from the cluster
  // centre with its own tilt, so a card reads as a soft puff of foliage.
  const cx = .500, cy = .560;
  const count = 58;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * (0.86 + r() * 0.20);
    const x = cx + Math.cos(a) * rad * .345;
    const y = cy + Math.sin(a) * rad * .385;
    const dx = x - cx, dy = y - cy;
    const radial = Math.atan2(dx, -dy);
    // Mostly random orientations, with only a light nod outward. Biasing every
    // leaf away from the cluster centre combed the canopy into one direction.
    const angle = r() < .65 ? r() * Math.PI * 2 : radial + (r() - .5) * .9;
    const len = (.070 + r() * .085) * (1.10 - rad * .22);
    drawLeaf(x * S, y * S, len * S, len * S * (0.46 + r() * 0.14), angle, (r() - .5) * 18);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

function leafGeometry() {
  // Two-triangle leaf-spray card. The procedural alpha texture carries the
  // leafy silhouette; keeping the card cheap lets the canopy stay dense.
  const pos = [
    -.5, 0, .035,
     .5, 0, .035,
    -.5, 1, .075,
     .5, 1, .075,
  ];
  const uv = [0, 0, 1, 0, 0, 1, 1, 1];
  const col = [.68, .68, .68, .84, .84, .84, .96, .96, .96, 1, 1, 1];
  const idx = [0, 2, 1, 1, 2, 3];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeTube(curve, segments, radial, radiusAt, flexAt, treePhase, branchPhase, color, uvRepeat = 1) {
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [], nrm = [], uv = [], col = [], flex = [], tree = [], branch = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    const r = Math.max(0.008, radiusAt(t));
    const f = flexAt(t);
    const ph = typeof branchPhase === 'function' ? branchPhase(t) : branchPhase;
    for (let j = 0; j < radial; j++) {
      const a = j / radial * TWO_PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      const vx = p.x + (n.x * ca + b.x * sa) * r;
      const vy = p.y + (n.y * ca + b.y * sa) * r;
      const vz = p.z + (n.z * ca + b.z * sa) * r;
      const nx = n.x * ca + b.x * sa;
      const ny = n.y * ca + b.y * sa;
      const nz = n.z * ca + b.z * sa;
      pos.push(vx, vy, vz);
      nrm.push(nx, ny, nz);
      uv.push(j / radial, t * uvRepeat);
      col.push(color.r, color.g, color.b);
      flex.push(f);
      tree.push(treePhase);
      branch.push(ph);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + (j + 1) % radial;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + (j + 1) % radial;
      idx.push(a, b, c, b, d, c);
    }
  }
  // Close both ends. Without these fans the bark tubes are open cylinders:
  // the trunk top and branch tips can be seen straight through from above.
  const endRing = segments * radial;
  const startCap = pos.length / 3;
  const startTangent = curve.getTangentAt(0).normalize();
  const startPoint = curve.getPointAt(0);
  const endTangent = curve.getTangentAt(1).normalize();
  const endPoint = curve.getPointAt(1);
  const startPhase = typeof branchPhase === 'function' ? branchPhase(0) : branchPhase;
  const endPhase = typeof branchPhase === 'function' ? branchPhase(1) : branchPhase;
  pos.push(startPoint.x, startPoint.y, startPoint.z);
  nrm.push(-startTangent.x, -startTangent.y, -startTangent.z);
  uv.push(.5, 0);
  col.push(color.r, color.g, color.b);
  flex.push(flexAt(0));
  tree.push(treePhase);
  branch.push(startPhase);
  const endCap = pos.length / 3;
  pos.push(endPoint.x, endPoint.y, endPoint.z);
  nrm.push(endTangent.x, endTangent.y, endTangent.z);
  uv.push(.5, uvRepeat);
  col.push(color.r, color.g, color.b);
  flex.push(flexAt(1));
  tree.push(treePhase);
  branch.push(endPhase);
  for (let j = 0; j < radial; j++) {
    const a = j;
    const b = (j + 1) % radial;
    idx.push(startCap, b, a);
    idx.push(endCap, endRing + a, endRing + b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWindFlex', new THREE.Float32BufferAttribute(flex, 1));
  g.setAttribute('aTreePhase', new THREE.Float32BufferAttribute(tree, 1));
  g.setAttribute('aBranchPhase', new THREE.Float32BufferAttribute(branch, 1));
  g.setIndex(idx);
  return g;
}

function mergeBarkGeometries(geoms) {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv', 'color', 'aWindFlex', 'aTreePhase', 'aBranchPhase'];
  for (const name of names) {
    const itemSize = name === 'position' || name === 'normal' || name === 'color' ? 3 : name === 'uv' ? 2 : 1;
    let total = 0;
    for (const g of geoms) total += g.getAttribute(name).array.length;
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of geoms) {
      const a = g.getAttribute(name).array;
      arr.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  const indices = [];
  let offset = 0;
  for (const g of geoms) {
    const index = g.index;
    for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    offset += g.getAttribute('position').count;
  }
  out.setIndex(indices);
  out.computeBoundingSphere();
  return out;
}

function mergeAttachedGeometries(geoms) {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'color', 'aAnchor', 'aWindFlex', 'aTreePhase', 'aBranchPhase'];
  for (const name of names) {
    const itemSize = name === 'aAnchor' || name === 'position' || name === 'normal' || name === 'color' ? 3 : 1;
    let total = 0;
    for (const g of geoms) total += g.getAttribute(name).array.length;
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of geoms) {
      const a = g.getAttribute(name).array;
      arr.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  const indices = [];
  let offset = 0;
  for (const g of geoms) {
    const index = g.index;
    for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    offset += g.getAttribute('position').count;
  }
  out.setIndex(indices);
  out.computeBoundingSphere();
  return out;
}

function windPrefix(attrs, mode) {
  return WIND_GLSL + `
    ${mode === 'leaf' ? 'uniform float uLeafFullness;\nuniform float uLeafScale;' : ''}
    attribute float aWindFlex;
    attribute float aTreePhase;
    attribute float aBranchPhase;
    ${mode === 'leaf' || mode === 'fruit' || mode === 'hive' ? 'attribute vec3 aAnchor;' : ''}
    ${mode === 'leaf' ? 'attribute float aFlutterPhase;\nattribute vec3 aLeafClump;\nvarying vec3 vLeafView;\nvarying vec3 vLeafOut;' : ''}

    vec3 treeWindAt(vec3 p, float flex, float treePhase, float branchPhase) {
      vec2 w = meadowWindVec(p.xz, branchPhase + treePhase * 0.73);
      float slow = 0.78 + 0.22 * sin(uWindTime * 0.57 + treePhase * 5.1 + p.x * 0.02);
      float amp = flex * flex * 0.20 * slow;
      return vec3(w.x, 0.0, w.y) * amp;
    }
  `;
}

function makeWindMaterial(material, wind, mode, controls, sun = null) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wind.uniforms);
    if (mode === 'leaf' && controls) {
      shader.uniforms.uLeafFullness = controls.fullness;
      shader.uniforms.uLeafScale = controls.scale;
      if (sun) {
        shader.uniforms.uSunDir = sun.uniforms.uSunDir;
        shader.uniforms.uSunColor = sun.uniforms.uSunColor;
        shader.uniforms.uSunIntensity = sun.uniforms.uSunIntensity;
      }
    }
    shader.vertexShader = windPrefix(null, mode) + shader.vertexShader;
    if (mode === 'bark') {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        transformed += treeWindAt(position, aWindFlex, aTreePhase, aBranchPhase);
      `);
    } else if (mode === 'hive') {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        transformed += treeWindAt(aAnchor, aWindFlex, aTreePhase, aBranchPhase);
      `);
    } else {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float keep = 1.0;
          ${mode === 'leaf' ? `
          // Distance LOD: thin the card budget beyond the near meadow instead
          // of drawing every leaf into a few far-field pixels. The hash is the
          // same one the Canopy control uses, so the two cuts compose.
          float leafFar = smoothstep(42.0, 68.0, distance(cameraPosition, aAnchor));
          float leafKeep = uLeafFullness * mix(1.0, 0.60, leafFar);
          keep = step(fract(sin(dot(aAnchor.xz + aFlutterPhase, vec2(12.9898, 78.233))) * 43758.5453), leafKeep);
          transformed *= uLeafScale;
          ` : ''}
          if (keep < 0.5) {
            transformed = vec3(0.0);
          } else {
            vec3 anchorW = treeWindAt(aAnchor, aWindFlex, aTreePhase, aBranchPhase);
            vec3 localW = vec3(
              dot(anchorW, instanceMatrix[0].xyz) / max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 1e-6),
              dot(anchorW, instanceMatrix[1].xyz) / max(dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), 1e-6),
              dot(anchorW, instanceMatrix[2].xyz) / max(dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz), 1e-6)
            );
            transformed += localW;
            ${mode === 'leaf' ? `
            float h = clamp(position.y, 0.0, 1.0);
            transformed.x += sin(uWindTime * 3.05 + aFlutterPhase + position.y * 2.4) * 0.052 * h;
            transformed.z += cos(uWindTime * 2.65 + aFlutterPhase * 1.3 + position.y * 1.9) * 0.032 * h;
            vec4 leafWP = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
            vLeafView = cameraPosition - leafWP.xyz;
            // Fan normals out of the clump, but keep a per-leaf tilt so the
            // canopy does not become one smoothly-lit sphere.
            vec3 leafOutW = normalize(leafWP.xyz - aLeafClump + vec3(1e-4));
            float leafTilt = (fract(sin(aFlutterPhase * 91.7) * 43758.5453) - .5) * .55;
            float leafC = cos(leafTilt), leafS = sin(leafTilt);
            vLeafOut = normalize(vec3(leafOutW.x * leafC - leafOutW.z * leafS,
                                      leafOutW.y,
                                      leafOutW.x * leafS + leafOutW.z * leafC));
            ` : ''}
          }
        #endif
      `);
    }
    if (mode === 'leaf') {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;
          varying vec3 vLeafView;
          varying vec3 vLeafOut;
        `)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          // Blend toward the clump-outward direction so stacked cards cannot
          // read as separately-lit flat planes. Kept below full strength so
          // leaf-level variation and interior shadow survive.
          normal = normalize(mix(normal, mat3(viewMatrix) * normalize(vLeafOut), .55) + vec3(1e-4));
        `)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          vec3 leafV = normalize(vLeafView + vec3(1e-4));
          // Backlit leaves glow most at the silhouette and toward the sun.
          float leafBack = pow(max(0.0, -dot(leafV, uSunDir)), 1.6);
          float leafEdge = pow(clamp(1.0 - abs(leafV.y), 0.0, 1.0), 1.6);
          reflectedLight.directDiffuse += uSunColor * uSunIntensity
            * (.008 + .022 * leafBack * leafEdge);
          // Wrap fill keeps deep, shadowed clumps green instead of black.
          vec3 leafSunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz + vec3(1e-4));
          float leafNdl = dot(normal, leafSunView);
          float leafWrap = clamp((leafNdl + .40) / 1.40, 0.0, 1.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity
            * max(0.0, leafWrap - max(leafNdl, 0.0)) * .055;
          reflectedLight.directDiffuse = clamp(reflectedLight.directDiffuse, 0.0, 4.0);
        `);
    }
  };
  material.customProgramCacheKey = () => `meadowTree-${mode}-v2`;
  return material;
}

function addInstancedAttributes(geometry, rows) {
  const n = rows.length;
  const anchor = new Float32Array(n * 3);
  const flex = new Float32Array(n);
  const tree = new Float32Array(n);
  const branch = new Float32Array(n);
  const flutter = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    anchor[i*3] = r.anchor.x; anchor[i*3+1] = r.anchor.y; anchor[i*3+2] = r.anchor.z;
    flex[i] = r.flex;
    tree[i] = r.treePhase;
    branch[i] = r.branchPhase;
    flutter[i] = r.flutterPhase || 0;
  }
  geometry.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(anchor, 3));
  geometry.setAttribute('aWindFlex', new THREE.InstancedBufferAttribute(flex, 1));
  geometry.setAttribute('aTreePhase', new THREE.InstancedBufferAttribute(tree, 1));
  geometry.setAttribute('aBranchPhase', new THREE.InstancedBufferAttribute(branch, 1));
  if (rows.some(r => r.flutterPhase !== undefined)) {
    geometry.setAttribute('aFlutterPhase', new THREE.InstancedBufferAttribute(flutter, 1));
  }
  if (rows.some(r => r.clump)) {
    const clump = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      clump[i*3] = rows[i].clump.x;
      clump[i*3+1] = rows[i].clump.y;
      clump[i*3+2] = rows[i].clump.z;
    }
    geometry.setAttribute('aLeafClump', new THREE.InstancedBufferAttribute(clump, 3));
  }
}

function instanceMesh(geo, mat, rows, name) {
  const mesh = new THREE.InstancedMesh(geo, mat, rows.length);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < rows.length; i++) {
    mesh.setMatrixAt(i, rows[i].matrix);
    if (rows[i].color) mesh.setColorAt(i, rows[i].color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.layers.enable(REFLECT_LAYER);
  addInstancedAttributes(geo, rows);
  return mesh;
}

function hiveGeometryAt(center, anchor, flex, treePhase, branchPhase) {
  const geoms = [];
  const add = (geo, color) => {
    geo = geo.toNonIndexed ? geo.toNonIndexed() : geo;
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const c = new Float32Array(p.count * 3);
    const a = new Float32Array(p.count * 3);
    const f = new Float32Array(p.count);
    const t = new Float32Array(p.count);
    const b = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      a[i*3] = anchor.x; a[i*3+1] = anchor.y; a[i*3+2] = anchor.z;
      f[i] = flex; t[i] = treePhase; b[i] = branchPhase;
      c[i*3] = color.r; c[i*3+1] = color.g; c[i*3+2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.setAttribute('aAnchor', new THREE.BufferAttribute(a, 3));
    geo.setAttribute('aWindFlex', new THREE.BufferAttribute(f, 1));
    geo.setAttribute('aTreePhase', new THREE.BufferAttribute(t, 1));
    geo.setAttribute('aBranchPhase', new THREE.BufferAttribute(b, 1));
    geoms.push(geo);
  };
  const gold = new THREE.Color(0xffc95c);
  const dark = new THREE.Color(0x4b2a08);
  const body = new THREE.SphereGeometry(.28, 16, 12);
  body.scale(1, 1.25, 1);
  add(body, gold);
  for (const y of [-.18, 0, .18]) {
    const ring = new THREE.TorusGeometry(.27, .015, 6, 20);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, y * .6, 0);
    add(ring, gold.clone().multiplyScalar(1.08));
  }
  const hole = new THREE.CircleGeometry(.045, 10);
  hole.translate(0, -.01, .281);
  add(hole, dark);
  const merged = mergeAttachedGeometries(geoms.map(g => {
    if (!g.index) {
      const idx = [];
      for (let i = 0; i < g.getAttribute('position').count; i++) idx.push(i);
      g.setIndex(idx);
    }
    return g;
  }));
  merged.translate(center.x, center.y, center.z);
  return merged;
}

/**
 * Grow-form archetypes. Each lot picks one so the meadow reads as a varied
 * stand instead of ten copies of the same tree. Multipliers apply on top of the
 * lot scale; trunk colliders and nav stay untouched.
 */
export const TREE_KINDS = [
  { name: 'mature', trunk: 1.00, trunkR: 1.00, flare: .38, crownY: 1.00, crownR: 1.00, crownH: 1.00, primary: 4, fill: 1.00, leaf: 1.00, droop: .00, tint: 1.00 },
  { name: 'old',    trunk: 0.92, trunkR: 1.22, flare: .52, crownY: 0.96, crownR: 1.08, crownH: 0.94, primary: 5, fill: 1.10, leaf: 1.06, droop: .35, tint: 0.94 },
  { name: 'slim',   trunk: 1.14, trunkR: 0.58, flare: .16, crownY: 1.08, crownR: 0.76, crownH: 1.16, primary: 3, fill: 0.82, leaf: 0.94, droop: .00, tint: 1.02 },
  { name: 'young',  trunk: 0.62, trunkR: 0.56, flare: .22, crownY: 0.66, crownR: 0.66, crownH: 0.74, primary: 3, fill: 0.56, leaf: 0.84, droop: .00, tint: 1.07 },
  { name: 'mature', trunk: 1.04, trunkR: 1.02, flare: .40, crownY: 1.02, crownR: 1.02, crownH: 1.03, primary: 4, fill: 1.02, leaf: 1.00, droop: .05, tint: 1.00 },
];
// Fixed assignment keeps tree 0/1 (the hive hosts) large and stable.
export const TREE_KIND_ORDER = [0, 1, 2, 3, 4, 2, 1, 0, 3, 2];

/**
 * Build the complete visual tree collection.
 * @param {{lots: Array<{x:number,z:number,s:number}>, wind: any}} opts
 */
export function createTreeCollection({ lots, wind, sun = null }) {
  const group = new THREE.Group();
  group.name = 'meadowTreeVisuals';
  const barkGeoms = [];
  const barkMeshes = [];
  const leafMeshes = [];
  const fruitMeshes = [];
  const leafRows = [];
  const fruitRows = [];
  const hiveRecords = [];
  const treeMeta = [];
  const kindCounts = {};
  let branchCount = 0;
  let anchorCount = 0;

  const barkTex = barkTexture();
  const leafTex = leafTexture();
  const leafGeo = leafGeometry();
  const fruitGeo = new THREE.SphereGeometry(.13, 10, 8);
  const barkMat = makeWindMaterial(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: barkTex, vertexColors: true,
    roughness: .63, clearcoat: .25, clearcoatRoughness: .5, metalness: 0,
  }), wind, 'bark');
  const leafControls = {
    fullness: { value: 1 },
    scale: { value: 1 },
  };
  const leafMat = makeWindMaterial(new THREE.MeshPhysicalMaterial({
    color: 0xc3d4ad, map: leafTex, alphaTest: .42, transparent: false, depthWrite: true,
    side: THREE.DoubleSide, vertexColors: true,
    roughness: .72, clearcoat: .10, clearcoatRoughness: .66, metalness: 0,
  }), wind, 'leaf', leafControls, sun);
  const fruitMat = makeWindMaterial(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .17, clearcoat: .85, clearcoatRoughness: .16, metalness: 0,
  }), wind, 'fruit');
  const hiveMat = makeWindMaterial(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: .25, clearcoat: .65, clearcoatRoughness: .22,
  }), wind, 'hive');

  const fruitCols = [0xff7e9c, 0xffc94f, 0xff9b58, 0xd995ff, 0xfff0a8];

  lots.forEach((lot, index) => {
    const leafStart = leafRows.length;
    const fruitStart = fruitRows.length;
    const s = lot.s;
    const kind = TREE_KINDS[TREE_KIND_ORDER[index % TREE_KIND_ORDER.length]];
    kindCounts[kind.name] = (kindCounts[kind.name] || 0) + 1;
    const rand = makeRand((index + 1) * 2654435761 ^ Math.round(lot.x * 137 + lot.z * 311));
    const treePhase = rand() * TWO_PI;
    // Per-tree colour family: mostly meadow green, some olive/yellow-green and
    // the occasional warm gold accent. Every leaf then varies within its tree's
    // family so the canopy is not one flat green.
    const family = rand();
    const hueBase = family < .10 ? .080 + rand() * .022
      : family < .30 ? .168 + rand() * .026
      : .218 + rand() * .022;
    const hueSpread = family < .30 ? .030 : .042;
    // Each tree rolls its own size inside its kind's range, so two old trees
    // are not the same old tree. Height/crown and trunk girth vary separately.
    const sizeT = .90 + rand() * .22;
    const girthT = .88 + rand() * .26;
    const crownY = 3.22 * s * kind.crownY * sizeT;
    const crownFillR = 1.91 * s * kind.crownR * sizeT;
    const crownFillH = 1.34 * s * kind.crownH * sizeT;
    const canopyR = 2.83 * s * kind.crownR * sizeT;
    const canopyTop = 5.06 * s * kind.crownH * sizeT;
    const crown = new THREE.Vector3(lot.x, crownY, lot.z);
    const maxR = 2.30 * s * kind.crownR * sizeT;
    const minY = 1.42 * s * kind.crownY * sizeT;
    const maxY = crownY + 1.68 * s * kind.crownH * sizeT;
    const trunkTop = (1.80 * s * kind.trunk + rand() * .20 * s) * sizeT;
    const bendX = (rand() - .5) * .14 * s;
    const bendZ = (rand() - .5) * .14 * s;
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(lot.x, 0, lot.z),
      new THREE.Vector3(lot.x + bendX * .4, trunkTop * .30, lot.z + bendZ * .35),
      new THREE.Vector3(lot.x + bendX * .85, trunkTop * .62, lot.z + bendZ * .85),
      new THREE.Vector3(lot.x + bendX, trunkTop * .82, lot.z + bendZ),
      new THREE.Vector3(lot.x + bendX * .92, trunkTop, lot.z + bendZ * .92),
    ]);
    const trunkRadius = (t) => {
      const flare = 1 + kind.flare * Math.exp(-t * 14);
      const taper = 1 - .84 * Math.pow(t, 2.2);
      return Math.max(.018 * s, s * (.20 + .14 * (1 - t)) * flare * taper * kind.trunkR * girthT);
    };
    const trunkFlex = (t) => .02 + .20 * smooth(clamp(t, 0, 1));
    const trunkCol = new THREE.Color().setHSL(.075, .38, .31 + rand() * .05);
    const trunkGeo = makeTube(trunkCurve, 10, 9, trunkRadius, trunkFlex, treePhase, treePhase, trunkCol, 2.0);
    barkGeoms.push(trunkGeo);
    branchCount++;

    // shallow root buttresses; purely visual, the collider remains unchanged
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TWO_PI + rand() * .4;
      const p0 = new THREE.Vector3(lot.x, .25 * s, lot.z);
      const p1 = new THREE.Vector3(lot.x + Math.cos(a) * .32 * s, .08 * s, lot.z + Math.sin(a) * .32 * s);
      const p2 = new THREE.Vector3(lot.x + Math.cos(a) * .48 * s, .01 * s, lot.z + Math.sin(a) * .48 * s);
      const rootCurve = new THREE.CatmullRomCurve3([p0, p1, p2]);
      const rc = trunkCol.clone().multiplyScalar(.82);
      barkGeoms.push(makeTube(rootCurve, 3, 5, t => s * (.055 - .035 * t), t => .02 * (1 - t), treePhase, treePhase, rc, 1));
      branchCount++;
    }

    // candy spiral hugging the trunk
    {
      const pts = [];
      const turns = 2.35;
      for (let i = 0; i <= 44; i++) {
        const t = .08 + .80 * i / 44;
        const p = trunkCurve.getPointAt(t);
        const a = t * TWO_PI * turns + treePhase;
        const r = trunkRadius(t) + .013 * s;
        pts.push(new THREE.Vector3(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r));
      }
      const spiralCurve = new THREE.CatmullRomCurve3(pts);
      const cream = new THREE.Color(0xfff0d0);
      barkGeoms.push(makeTube(spiralCurve, 36, 4, t => .0105 * s, t => trunkFlex(.08 + .8 * t), treePhase, treePhase, cream, 1));
      branchCount++;
    }

    const treeAnchors = [];
    const maxLevel = s >= .97 ? 4 : 3;
    const primaryCount = kind.primary;

    const limit = (p) => {
      const dx = p.x - lot.x, dz = p.z - lot.z;
      const rr = Math.hypot(dx, dz);
      if (rr > maxR) {
        p.x = lot.x + dx / rr * maxR;
        p.z = lot.z + dz / rr * maxR;
      }
      p.y = clamp(p.y, minY, maxY);
      return p;
    };

    const grow = (start, dir, length, level, baseFlex, radius, parentPhase, isPrimary) => {
      branchCount++;
      const phase = rand() * TWO_PI;
      const phaseAt = t => lerp(parentPhase, phase, smooth(t));
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((rand() - .5) * .30 * length);
      const up = new THREE.Vector3(0, 1, 0);
      const end = start.clone()
        .addScaledVector(dir, length)
        .addScaledVector(up, length * (isPrimary ? .08 : .02));
      if (level >= maxLevel) {
        // thin tips droop just a little
        end.y -= .08 * s;
      }
      limit(end);
      const p1 = limit(start.clone().addScaledVector(dir, length * .35).addScaledVector(up, length * .12).add(side.clone().multiplyScalar(.35)));
      const p2 = limit(start.clone().addScaledVector(dir, length * .70).addScaledVector(up, length * .06).add(side));
      const curve = new THREE.CatmullRomCurve3([start, p1, p2, end]);
      const flexTip = Math.min(1, baseFlex + (isPrimary ? .32 : .22));
      const radiusFn = t => radius * Math.max(.06, 1 - .90 * t)
        * (1 + (isPrimary ? .55 : .24) * Math.max(0, 1 - t * 7));
      const flexFn = t => lerp(baseFlex, flexTip, smooth(t));
      const radial = level === 1 ? 8 : level === 2 ? 5 : level === 3 ? 4 : 3;
      const segments = level === 1 ? 7 : level === 2 ? 6 : 4;
      const col = trunkCol.clone().multiplyScalar(.98 + rand() * .06);
      const geo = makeTube(curve, segments, radial, radiusFn, flexFn, treePhase, phaseAt, col, 1.5);
      barkGeoms.push(geo);

      if (level >= maxLevel) {
        treeAnchors.push({
          pos: end.clone(),
          dir: dir.clone(),
          flex: flexTip,
          branchPhase: phase,
          clumpR: (.60 + rand() * .17) * s * kind.leaf,
          level,
          supports: [{ curve, flexFn, phaseFn: phaseAt, startT: .52 }],
        });
        if (level === maxLevel - 1 && rand() < .55) {
          // a shoulder spray fills the middle of the crown; its leaves are
          // rooted along the actual parent branch.
          treeAnchors.push({
            pos: curve.getPointAt(.86),
            dir: dir.clone(),
            flex: flexFn(.86),
            branchPhase: phaseAt(.86),
            clumpR: (.34 + rand() * .12) * s * kind.leaf,
            small: true,
            level,
            supports: [{ curve, flexFn, phaseFn: phaseAt, startT: .66 }],
          });
        }
      }

      if (level < maxLevel) {
        const children = level === 1 ? 2 : (level === 2 ? 2 : 1 + (rand() < .45 ? 1 : 0));
        for (let c = 0; c < children; c++) {
          const t = .52 + rand() * .31;
          const cp = curve.getPointAt(t);
          const tangent = curve.getTangentAt(t).normalize();
          const ang = (c === 0 ? 1 : -1) * (.34 + rand() * .52);
          const cd = tangent.clone().applyAxisAngle(UP, ang);
          cd.y += .08 + rand() * .18;
          cd.normalize();
          const childLen = length * (.48 + rand() * .16);
          const childRadius = radius * (.44 + rand() * .10);
          grow(cp, cd, childLen, level + 1, flexFn(t), childRadius, phaseAt(t), false);
        }
      }
    };

    // primary scaffold branches leave the trunk at different heights
    for (let i = 0; i < primaryCount; i++) {
      const a = i / primaryCount * TWO_PI + rand() * .55;
      const attachT = .56 + rand() * .26;
      const start = trunkCurve.getPointAt(attachT);
      const dir = new THREE.Vector3(Math.cos(a), (.34 + rand() * .22) * (1 - kind.droop), Math.sin(a)).normalize();
      const len = (1.02 + rand() * .28) * s;
      // Keep the branch root inside the trunk silhouette; a branch wider than
      // its host reads as a flat stump at the junction.
      const branchBase = Math.max(.025 * s,
        Math.min((.115 + rand() * .030) * s, trunkRadius(attachT) * .62));
      grow(start, dir, len, 1, trunkFlex(attachT), branchBase, treePhase, true);
    }
    // one shorter upper leader
    {
      const start = trunkCurve.getPointAt(.9);
      const a = rand() * TWO_PI;
      const dir = new THREE.Vector3(Math.cos(a) * .45, .9, Math.sin(a) * .45).normalize();
      const leaderBase = Math.max(.022 * s,
        Math.min(.105 * s, trunkRadius(.9) * .62));
      grow(start, dir, (0.82 + rand() * .22) * s, 1, trunkFlex(.9), leaderBase, treePhase, true);
    }

    // A fill cluster is a real piece of branchwork: a connector twig from the
    // nearest existing branch plus a few short arms. Leaf cards are rooted on
    // those arms so no foliage floats in mid-air.
    const addFoliageTwig = (points, baseFlex, phase, radius) => {
      const curve = new THREE.CatmullRomCurve3(points);
      const flexFn = t => lerp(baseFlex, .98, smooth(t));
      const phaseFn = () => phase;
      const geo = makeTube(curve, 3, 2, t => radius * (1 - .55 * t), flexFn, treePhase, phaseFn, trunkCol, 1);
      barkGeoms.push(geo);
      branchCount++;
      return { curve, flexFn, phaseFn, startT: .15 };
    };

    const addFillCluster = (p, rad, nearest) => {
      const mid = nearest.pos.clone().lerp(p, .5);
      mid.y += .12 * s;
      addFoliageTwig([nearest.pos, mid, p], nearest.flex, nearest.branchPhase, .013 * s);
      const outward = p.clone().sub(crown);
      outward.y = Math.max(.15 * s, outward.y + .12 * s);
      outward.normalize();
      const supports = [];
      for (let k = 0; k < 3; k++) {
        const dir = outward.clone().applyAxisAngle(UP, (k - 1) * .92 + (rand() - .5) * .3);
        dir.y += .16 + rand() * .20;
        dir.normalize();
        const len = rad * (.72 + rand() * .30);
        const end = p.clone().addScaledVector(dir, len);
        end.x = clamp(end.x, lot.x - canopyR * .9, lot.x + canopyR * .9);
        end.z = clamp(end.z, lot.z - canopyR * .9, lot.z + canopyR * .9);
        end.y = clamp(end.y, 1.0 * s, canopyTop * .9);
        const midArm = p.clone().lerp(end, .5);
        midArm.y += .08 * s;
        supports.push(addFoliageTwig([p, midArm, end], nearest.flex, nearest.branchPhase, .008 * s));
      }
      treeAnchors.push({
        pos: p,
        windAnchor: nearest.pos,
        flex: nearest.flex,
        branchPhase: nearest.branchPhase,
        clumpR: rad,
        fill: true,
        small: false,
        level: 0,
        supports,
      });
    };

    // Fill the crown with overlapping rounded puffs so the silhouette reads as
    // one soft ball of leaves rather than a handful of branch-end tufts.
    const fillCount = Math.round((s >= .98 ? 48 : 40) * kind.fill);
    for (let i = 0; i < fillCount; i++) {
      const phi = i * 2.399963 + rand() * .24;
      const yy = -.62 + (fillCount === 1 ? .3 : i / (fillCount - 1)) * 1.46 + (rand() - .5) * .08;
      const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
      const shell = (i % 5 === 0) ? .30 + rand() * .12
        : (i % 3 === 0) ? .55 + rand() * .10
        : .84 + rand() * .10;
      // Break the dome: a slow radial ripple gives the crown alternating
      // shoulders and notches instead of a smooth sphere.
      const ripple = 1 + .10 * Math.sin(phi * 3.1 + .7) + .055 * Math.sin(phi * 5.3 - 1.9);
      const p = new THREE.Vector3(
        lot.x + Math.cos(phi) * rr * crownFillR * shell * ripple,
        crownY + yy * crownFillH * shell,
        lot.z + Math.sin(phi) * rr * crownFillR * shell * ripple
      );
      p.y = clamp(p.y, 1.7 * s * kind.crownY, canopyTop - .20 * s);
      let nearest = null, best = Infinity;
      for (const a of treeAnchors) {
        if (a.fill) continue;
        const d = p.distanceToSquared(a.pos);
        if (d < best) { best = d; nearest = a; }
      }
      if (!nearest) continue;
      addFillCluster(p, (.60 + rand() * .18) * s * kind.crownR, nearest);
    }

    // A few interior/under-crown puffs close the central gaps so trunks and
    // branch forks are mostly hidden without making the outline a smooth ball.
    const corePuffs = [
      [0, -.12, 0, .82],
      [-.92, -.34, .30, .62],
      [.88, -.38, -.26, .62],
      [.10, .48, .06, .66],
      [-1.10, -.92, .34, .60],
      [1.12, -.90, -.38, .60],
      [.04, -1.00, .10, .56],
      [0, -.35, 0, .95],
      [-.70, -.55, .45, .82],
      [.70, -.60, -.35, .82],
      [-.55, .30, -.48, .72],
      [.58, .28, .40, .72],
      [0, .62, -.15, .64],
    ];
    for (const [dx, dy, dz, rad] of corePuffs) {
      const p = new THREE.Vector3(lot.x + dx * s, crownY + dy * s * kind.crownH, lot.z + dz * s);
      let nearest = null, best = Infinity;
      for (const a of treeAnchors) {
        if (a.fill) continue;
        const d = p.distanceToSquared(a.pos);
        if (d < best) { best = d; nearest = a; }
      }
      if (!nearest) continue;
      addFillCluster(p, rad * s * kind.crownR, nearest);
    }

    anchorCount += treeAnchors.length;
    treeMeta.push({ index, x: lot.x, z: lot.z, s, anchors: treeAnchors.length, branchPhase: treePhase });

    // Foliage is rooted on real branch/twig curves. Terminal and shoulder
    // leaves use the parent branch; fill clusters use their connector arms.
    const leafColorAt = (p) => {
      const radial = clamp(Math.hypot(p.x - lot.x, p.z - lot.z) / (2.65 * s * kind.crownR), 0, 1);
      const top = clamp((p.y - (crown.y - .9 * s)) / (2.45 * s * kind.crownH), 0, 1);
      const interior = (1 - radial) * .62;
      const hue = hueBase + rand() * hueSpread;
      const sat = .68 + rand() * .16;
      const light = (.130 + radial * .085 + top * .050 + rand() * .022 - interior * .070) * kind.tint;
      return new THREE.Color().setHSL(hue, sat, clamp(light, .10, .27));
    };
    for (const anchor of treeAnchors) {
      const n = Math.round((anchor.fill ? 72 + Math.floor(rand() * 22)
        : anchor.small ? 40 + Math.floor(rand() * 18)
        : 82 + Math.floor(rand() * 28)) * kind.fill);
      const supports = anchor.supports || [];
      if (!supports.length) continue;
      for (let i = 0; i < n; i++) {
        const sup = supports[Math.floor(rand() * supports.length)];
        const t = anchor.small
          ? .84 + rand() * .16
          : anchor.fill
            ? .18 + rand() * .82
            : .72 + rand() * .28;
        const p = sup.curve.getPointAt(t);
        const dx = p.x - lot.x, dz = p.z - lot.z;
        const rCanopy = Math.hypot(dx, dz);
        if (rCanopy > canopyR) {
          p.x = lot.x + dx / rCanopy * canopyR;
          p.z = lot.z + dz / rCanopy * canopyR;
        }
        p.y = clamp(p.y, 1.0 * s, canopyTop);

        const color = leafColorAt(p);

        // The card base is exactly the branch/twig point. Point the leaf tip
        // outward/up and roll its face around that axis for a dense spray.
        const out = p.clone().sub(crown);
        out.y = out.y * .72 + .18 * s;
        if (out.lengthSq() < 1e-6) out.set(rand() - .5, 1, rand() - .5);
        out.normalize();
        out.applyAxisAngle(UP, (rand() - .5) * .65);
        out.y = Math.max(.10, out.y);
        out.normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(UP, out);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, rand() * TWO_PI));
        if (rand() < .35) {
          q.multiply(new THREE.Quaternion().setFromEuler(
            new THREE.Euler((rand() - .5) * .6, 0, (rand() - .5) * .6, 'YXZ')
          ));
        }
        const scale = s * (.52 + rand() * .15) * kind.leaf;
        const matrix = new THREE.Matrix4().compose(
          p,
          q,
          new THREE.Vector3(scale, scale * (1.02 + rand() * .32), scale)
        );
        leafRows.push({
          matrix, color, anchor: p, clump: anchor.pos, flex: sup.flexFn(t), treePhase,
          branchPhase: sup.phaseFn(t), flutterPhase: rand() * TWO_PI,
        });
      }
    }

    // Twig-rooted leaves only cover the outside of each clump, so a big crown
    // can still show sky through its middle. These interior cards sit inside
    // the clump volume, tinted by the same interior falloff, and close those
    // see-through holes without changing the silhouette.
    for (const anchor of treeAnchors) {
      const count = Math.round((anchor.fill ? 14 : 5) * kind.fill);
      for (let i = 0; i < count; i++) {
        const u = rand() * 2 - 1;
        const a = rand() * TWO_PI;
        const rxz = Math.sqrt(Math.max(0, 1 - u * u));
        const rad = anchor.clumpR * (.15 + rand() * .85);
        const p = new THREE.Vector3(
          anchor.pos.x + Math.cos(a) * rxz * rad,
          anchor.pos.y + u * rad,
          anchor.pos.z + Math.sin(a) * rxz * rad
        );
        p.y = clamp(p.y, 1.1 * s, canopyTop - .04 * s);
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rand() * TWO_PI, rand() * TWO_PI, rand() * TWO_PI)
        );
        const scale = s * (.44 + rand() * .12) * kind.leaf;
        leafRows.push({
          matrix: new THREE.Matrix4().compose(
            p, q, new THREE.Vector3(scale, scale * (1.0 + rand() * .25), scale)
          ),
          color: leafColorAt(p),
          anchor: p, clump: anchor.pos, flex: anchor.flex, treePhase,
          branchPhase: anchor.branchPhase, flutterPhase: rand() * TWO_PI,
        });
      }
    }

    // a few candy fruit accents tucked into outer clumps
    const fruitAnchors = treeAnchors.filter(a => !a.fill).sort(() => rand() - .5).slice(0, 3 + (s > 1 ? 1 : 0));
    for (const anchor of fruitAnchors) {
      const a = anchor.dir.clone().multiplyScalar(.16 * s);
      const p = anchor.pos.clone().add(a).add(new THREE.Vector3((rand() - .5) * .20, -.10 - rand() * .10, (rand() - .5) * .20));
      const q = new THREE.Quaternion();
      const scale = s * (.58 + rand() * .18);
      const matrix = new THREE.Matrix4().compose(p, q, new THREE.Vector3(scale, scale * 1.1, scale));
      const color = new THREE.Color(fruitCols[Math.floor(rand() * fruitCols.length)]);
      fruitRows.push({
        matrix, color, anchor: anchor.pos, flex: anchor.flex, treePhase,
        branchPhase: anchor.branchPhase,
      });
    }

    // one beehive hanging beneath a suitable clump on the first two trees
    if (index < 2 && treeAnchors.length) {
      const branchAnchors = treeAnchors.filter(a => !a.fill);
      const anchor = branchAnchors[(index * 3 + 1) % branchAnchors.length] || branchAnchors[0];
      const center = anchor.pos.clone().add(new THREE.Vector3(0, -.66 * s, 0));
      hiveRecords.push({
        geometry: hiveGeometryAt(center, anchor.pos, anchor.flex, treePhase, anchor.branchPhase),
        center, treeX: lot.x, treeZ: lot.z, treeScale: s,
      });
    }

    // Bark stays a per-tree merged mesh so each trunk can be frustum-culled
    // independently; a single all-tree merge spans the whole meadow and can
    // never leave the frustum.
    const treeBarkGeo = mergeBarkGeometries(barkGeoms);
    barkGeoms.length = 0;
    const treeBark = new THREE.Mesh(treeBarkGeo, barkMat);
    treeBark.name = `treeBark${index}`;
    treeBark.frustumCulled = true;
    treeBark.layers.enable(REFLECT_LAYER);
    treeBark.geometry.computeBoundingSphere();
    treeBark.geometry.boundingSphere.radius += .6; // wind displacement + card size
    barkMeshes.push(treeBark);
    group.add(treeBark);

    const treeLeaves = instanceMesh(
      leafGeo.clone(), leafMat, leafRows.slice(leafStart), `treeLeaves${index}`
    );
    treeLeaves.frustumCulled = true;
    treeLeaves.computeBoundingSphere();
    treeLeaves.boundingSphere.radius += .6;
    leafMeshes.push(treeLeaves);
    group.add(treeLeaves);

    if (fruitRows.length > fruitStart) {
      const treeFruit = instanceMesh(
        fruitGeo.clone(), fruitMat, fruitRows.slice(fruitStart), `treeFruit${index}`
      );
      treeFruit.frustumCulled = true;
      treeFruit.computeBoundingSphere();
      treeFruit.boundingSphere.radius += .35;
      fruitMeshes.push(treeFruit);
      group.add(treeFruit);
    }
  });

  // Keep each hive separate so a depleted one can disappear without hiding the
  // other tree's hive. There are only two, so the extra draw call is cheap.
  const hives = hiveRecords.map((record, i) => {
    const mesh = new THREE.Mesh(record.geometry, hiveMat);
    mesh.name = `treeHive${i}`;
    mesh.frustumCulled = true;
    mesh.layers.enable(REFLECT_LAYER);
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.boundingSphere.radius += .4;
    group.add(mesh);
    return {
      mesh,
      center: record.center,
      treeX: record.treeX,
      treeZ: record.treeZ,
      treeScale: record.treeScale,
    };
  });

  const barkTris = barkMeshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count / 3 : 0), 0);
  const leafTris = (leafGeo.index ? leafGeo.index.count / 3 : 0) * leafRows.length;
  const fruitTris = (fruitGeo.index ? fruitGeo.index.count / 3 : 0) * fruitRows.length;
  const stats = {
    trees: lots.length,
    kinds: kindCounts,
    branches: branchCount,
    anchors: anchorCount,
    leaves: leafRows.length,
    fruit: fruitRows.length,
    hives: hives.length,
    barkTris: Math.round(barkTris),
    leafTris: Math.round(leafTris),
    fruitTris: Math.round(fruitTris),
    totalTris: Math.round(barkTris + leafTris + fruitTris),
    batches: barkMeshes.length + leafMeshes.length + fruitMeshes.length + hives.length,
    lod: { start: 42, end: 68, farKeep: 0.6 },
  };

  return {
    group,
    stats,
    barkMeshes,
    leafMeshes,
    fruitMeshes,
    hives,
    controls: leafControls,
    sun,
    setControls(v = {}) {
      if (!v) return;
      if (v.fullness !== undefined) leafControls.fullness.value = clamp(Number(v.fullness) || 0, .25, 1);
      if (v.leafSize !== undefined) leafControls.scale.value = clamp(Number(v.leafSize) || .7, .65, 1.45);
    },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      barkTex.dispose();
      leafTex.dispose();
    },
  };
}
