// A large Aero studio landmark in the meadow plus the matching return portal
// inside the Studio tabletop. The map transition itself is still app.js's
// existing requestMapSwitch/state machinery; these are visual, clickable doors.

import * as THREE from 'three';
import { REFLECT_LAYER } from './sky.js';

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(230,255,255,.96)');
  g.addColorStop(1, 'rgba(120,224,225,.88)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(10, 22, 492, 84, 36);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#0b5662';
  ctx.font = '600 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '8px';
  ctx.fillText(text, 256, 65);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function glazingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, '#bffefa');
  g.addColorStop(.28, '#7fe8e3');
  g.addColorStop(.72, '#2ca9b2');
  g.addColorStop(1, '#176d7b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // soft sky reflection
  const r = ctx.createLinearGradient(0, 0, 512, 420);
  r.addColorStop(0, 'rgba(255,255,255,.40)');
  r.addColorStop(.30, 'rgba(255,255,255,.06)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, 512, 512);
  // painted silver/white casing
  ctx.strokeStyle = 'rgba(250,255,255,.96)';
  ctx.lineWidth = 26;
  ctx.strokeRect(13, 13, 486, 486);
  ctx.strokeStyle = 'rgba(160,198,204,.9)';
  ctx.lineWidth = 5;
  ctx.strokeRect(31, 31, 450, 450);
  // mullion grid
  ctx.strokeStyle = 'rgba(246,254,255,.88)';
  ctx.lineWidth = 13;
  for (const x of [173, 339]) { ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x, 478); ctx.stroke(); }
  for (const y of [188, 326]) { ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(480, y); ctx.stroke(); }
  // a narrow diagonal reflection
  ctx.save();
  ctx.globalAlpha = .13;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(60, 0); ctx.lineTo(200, 0); ctx.lineTo(30, 512); ctx.lineTo(-80, 512); ctx.closePath(); ctx.fill();
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function roundedBoxGeo(w, h, d, r) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 5, steps: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function ovalRing(rx, ry, hx, hy, depth) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, hx, hy, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, steps: 1, curveSegments: 24,
  });
  g.translate(0, 0, -depth * .5);
  return g;
}

function makeMaterials() {
  return {
    white: new THREE.MeshPhysicalMaterial({ color: 0xfbf7e9, roughness: .33, clearcoat: .65, clearcoatRoughness: .28 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xc8e0e4, metalness: .78, roughness: .20 }),
    aqua: new THREE.MeshPhysicalMaterial({
      color: 0x77ece5, roughness: .26, metalness: .02, clearcoat: .25, clearcoatRoughness: .42,
      envMapIntensity: .18, emissive: 0x1db9c3, emissiveIntensity: .25,
    }),
    door: new THREE.MeshPhysicalMaterial({
      color: 0x1a6f7a, roughness: .38, clearcoat: .35, clearcoatRoughness: .32,
      envMapIntensity: .18, emissive: 0x0f737e, emissiveIntensity: .25,
    }),
    glow: new THREE.MeshStandardMaterial({ color: 0xeaffff, emissive: 0x67f4ef, emissiveIntensity: .85, roughness: .22 }),
    pane: new THREE.MeshPhysicalMaterial({
      map: glazingTexture(), color: 0xffffff, roughness: .18, metalness: .06,
      clearcoat: .55, clearcoatRoughness: .18, envMapIntensity: .32,
      emissive: 0x1db9c3, emissiveIntensity: .14,
    }),
    stone: new THREE.MeshStandardMaterial({ color: 0xe8e4d5, roughness: .8 }),
  };
}

function addMesh(parent, geo, mat, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  parent.add(m);
  return m;
}

export function createStudioHouse({ x, z, yaw = 0 }) {
  const mats = makeMaterials();
  const group = new THREE.Group();
  group.name = 'studioPortalHouse';
  group.position.set(x, 0, z);
  group.rotation.y = yaw;

  const addBox = (w, h, d, mat, px, py, pz, ry = 0) =>
    addMesh(group, new THREE.BoxGeometry(w, h, d), mat, [px, py, pz], [0, ry, 0]);
  const addRounded = (w, h, d, r, mat, px, py, pz) =>
    addMesh(group, roundedBoxGeo(w, h, d, r), mat, [px, py, pz]);
  const glazing = (w, h, px, py, pz, ry = 0) => {
    const m = addMesh(group, new THREE.PlaneGeometry(w, h), mats.pane, [px, py, pz], [0, ry, 0]);
    m.renderOrder = 2;
    return m;
  };

  // Plinth and solid two-storey mass. The glazing is attached to these
  // volumes as framed panels; it is not an empty glass cage.
  addRounded(5.35, .18, 3.40, .30, mats.stone, 0, 0, 0);
  addRounded(4.90, 2.20, 3.00, .34, mats.white, 0, .18, 0);
  addRounded(4.00, 1.70, 2.45, .28, mats.white, .25, 2.38, -.12);
  addRounded(4.50, .22, 2.78, .18, mats.white, .25, 4.08, -.12);

  // White floor band and roof reveals keep the horizontal layers legible.
  addBox(5.02, .055, 3.10, mats.white, 0, 2.36, 0);
  addBox(4.58, .04, 2.86, mats.silver, .25, 4.09, -.12);

  // Low studio/garage wing, overlapping the main volume rather than floating.
  addRounded(1.25, 1.05, 2.00, .24, mats.white, -2.45, .18, .20);
  addRounded(1.40, .13, 2.15, .15, mats.white, -2.45, 1.23, .20);
  glazing(.88, .66, -2.45, .79, 1.212);

  // Lower glazed bays.
  glazing(1.00, 1.38, -1.72, 1.35, 1.512);
  glazing(1.20, 1.24, -2.458, 1.35, -1.00, -Math.PI / 2);
  glazing(1.10, 1.24, 2.458, 1.35, -.82, Math.PI / 2);
  glazing(2.10, 1.22, -.35, 1.35, -1.512, Math.PI);
  // Upper glazing.
  glazing(2.92, 1.18, .30, 3.20, 1.108);
  glazing(1.42, 1.12, -1.758, 3.20, -.12, -Math.PI / 2);
  glazing(1.42, 1.12, 2.258, 3.20, -.12, Math.PI / 2);
  glazing(2.35, 1.08, .25, 3.20, -1.347, Math.PI);

  // Rounded glazed corner tower, capped and tied into both storeys.
  const corner = addMesh(group, new THREE.CylinderGeometry(.82, .82, 2.16, 28, 1, true), mats.pane, [1.78, 1.27, 1.28]);
  corner.renderOrder = 2;
  addMesh(group, new THREE.CylinderGeometry(.86, .86, .12, 28), mats.white, [1.78, 2.34, 1.28]);
  addMesh(group, new THREE.CylinderGeometry(.86, .86, .12, 28), mats.white, [1.78, .20, 1.28]);
  addMesh(group, new THREE.TorusGeometry(.87, .035, 7, 30), mats.silver, [1.78, 2.40, 1.28], [Math.PI / 2, 0, 0]);
  for (const a of [-.75, .15, 1.05]) {
    addMesh(group, new THREE.BoxGeometry(.045, 2.04, .05), mats.white,
      [1.78 + Math.sin(a) * .82, 1.27, 1.28 + Math.cos(a) * .82], [0, a, 0]);
  }

  // Balcony slab, columns and glass balustrade.
  addBox(.15, 2.20, .15, mats.white, -1.72, 1.29, 1.86);
  addBox(.15, 2.20, .15, mats.white, 1.72, 1.29, 1.86);
  addRounded(3.90, .16, 1.00, .08, mats.white, .10, 2.38, 1.55);
  addMesh(group, new THREE.PlaneGeometry(3.62, .46), mats.aqua, [.10, 2.68, 2.03]);
  addBox(3.78, .055, .075, mats.silver, .10, 2.94, 2.03);
  addBox(.055, .50, .055, mats.white, -1.72, 2.68, 2.03);
  addBox(.055, .50, .055, mats.white, 1.72, 2.68, 2.03);
  addBox(.045, .48, .045, mats.white, -.55, 2.67, 2.03);
  addBox(.045, .48, .045, mats.white, .62, 2.67, 2.03);

  // Roof parapet.
  addBox(4.28, .28, .12, mats.white, .25, 4.33, 1.29);
  addBox(4.28, .28, .12, mats.white, .25, 4.33, -1.49);
  addBox(.12, .28, 2.55, mats.white, -1.97, 4.33, -.10);
  addBox(.12, .28, 2.55, mats.white, 2.47, 4.33, -.10);
  addBox(4.30, .045, .055, mats.silver, .25, 4.50, 1.29);

  // A small rooftop stair/mechanical pod and planted terrace.
  addRounded(1.05, .34, .78, .08, mats.white, -1.10, 4.30, -.55);
  glazing(.78, .20, -1.10, 4.52, -.14);
  const plantMat = new THREE.MeshLambertMaterial({ color: 0x5e9b4c });
  for (const [px, py, pz, s] of [[1.55,4.43,.62,.27],[.90,4.43,.90,.22],[-1.90,4.40,.50,.20],[2.00,4.40,-.62,.20]]) {
    addBox(.42, .24, .42, mats.white, px, py - .12, pz);
    addMesh(group, new THREE.SphereGeometry(1, 10, 8), plantMat, [px, py + .12 * s, pz], null, [s, s * .72, s]);
  }

  // Entry terrace, steps and portal. The portal group is the click target.
  addRounded(2.20, .10, 1.10, .10, mats.stone, 0, .08, 1.82);
  addBox(1.90, .10, .52, mats.stone, 0, .16, 2.02);
  addBox(1.72, .10, .36, mats.stone, 0, .25, 1.92);

  const portal = new THREE.Group();
  portal.name = 'studioDoor';
  addMesh(portal, new THREE.BoxGeometry(1.72, 1.98, .10), mats.white, [0, 1.12, 1.52]);
  addMesh(portal, ovalRing(.94, 1.16, .86, 1.08, .08), mats.white, [0, 1.12, 1.56]);
  const doorGlass = addMesh(portal, new THREE.CircleGeometry(.64, 36), mats.aqua, [0, 1.07, 1.60], null, [1, 1.55, 1]);
  const doorBack = addMesh(portal, new THREE.CircleGeometry(.55, 36), mats.door, [0, 1.07, 1.61], null, [1, 1.55, 1]);
  addMesh(portal, ovalRing(.76, 1.04, .63, .92, .10), mats.silver, [0, 1.07, 1.57]);
  addMesh(portal, new THREE.BoxGeometry(.025, .92, .025), mats.white, [.20, 1.07, 1.65]);
  addMesh(portal, new THREE.SphereGeometry(.035, 8, 6), mats.silver, [.235, 1.04, 1.66]);
  addMesh(portal, new THREE.PlaneGeometry(1.28, .055), mats.glow, [0, .19, 2.10], [-Math.PI / 2, 0, 0]);
  doorGlass.renderOrder = 1;
  doorBack.renderOrder = 2;
  group.add(portal);

  // Header and sign sit on the entrance surround, under the balcony.
  addBox(1.58, .10, .34, mats.silver, 0, 2.20, 1.66);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.24, .30),
    new THREE.MeshBasicMaterial({ map: signTexture('STUDIO'), transparent: true, depthWrite: false, toneMapped: false })
  );
  sign.position.set(0, 2.20, 1.84);
  group.add(sign);

  // Entry planters and warm bubble accents.
  for (const sx of [-2.10, 2.10]) {
    addMesh(group, new THREE.CylinderGeometry(.23, .29, .38, 14), mats.white, [sx, .37, 1.66]);
    addMesh(group, new THREE.SphereGeometry(.31, 12, 9), plantMat, [sx, .66, 1.66], null, [1, .72, 1]);
  }
  for (const [px, pz] of [[-1.25, 1.83], [1.05, 1.83], [.75, 1.83]]) {
    addBox(.32, .22, .28, mats.white, px, 2.55, pz);
    addMesh(group, new THREE.SphereGeometry(1, 9, 7), plantMat, [px, 2.75, pz], null, [.22, .15, .20]);
  }
  for (const [bx, by, bz] of [[-2.37, 1.96, 1.30], [2.37, 1.92, 1.28], [-1.90, 3.02, 1.18], [1.95, 2.96, 1.16], [2.32, 4.28, -.34]]) {
    addMesh(group, new THREE.SphereGeometry(.055, 10, 8), mats.glow, [bx, by, bz]);
  }

  group.traverse(o => { if (o.isMesh) o.layers.enable(REFLECT_LAYER); });
  return {
    group,
    portal,
    hit: portal,
    doorPoint: new THREE.Vector3(x, 1.1, z + 1.85),
    setNight(v) {
      const n = Math.max(0, Math.min(1, Number(v) || 0));
      mats.aqua.emissiveIntensity = .25 + n * 1.8;
      mats.pane.emissiveIntensity = .30 + n * 1.70;
      mats.door.emissiveIntensity = .25 + n * .95;
      mats.glow.emissiveIntensity = .85 + n * 2.1;
    },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}

export function createStudioReturnPortal({ x, z, yaw = 0 }) {
  const mats = makeMaterials();
  const group = new THREE.Group();
  group.name = 'studioReturnPortal';
  group.position.set(x, 0, z);
  group.rotation.y = yaw;

  const plinth = addMesh(group, new THREE.CylinderGeometry(.82, .9, .08, 28), mats.stone, [0, .04, 0]);
  const glass = addMesh(group, new THREE.CircleGeometry(.56, 32), mats.door, [0, .98, .03], null, [1, 1.85, 1]);
  const frame = addMesh(group, ovalRing(.68, 1.12, .56, 1.02, .10), mats.silver, [0, .98, 0], null, [1, 1.0, 1]);
  const innerGlass = addMesh(group, new THREE.CircleGeometry(.59, 32), mats.aqua, [0, .98, .045], null, [1, 1.82, 1]);
  addMesh(group, new THREE.PlaneGeometry(.95, .045), mats.glow, [0, .11, .12], [-Math.PI / 2, 0, 0]);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.22, .30),
    new THREE.MeshBasicMaterial({ map: signTexture('MEADOW'), transparent: true, depthWrite: false, toneMapped: false })
  );
  sign.position.set(0, 2.35, .03);
  group.add(sign);
  addMesh(group, new THREE.SphereGeometry(.055, 10, 8), mats.glow, [-.75, 1.8, .16]);
  addMesh(group, new THREE.SphereGeometry(.045, 10, 8), mats.glow, [.72, 2.02, .12]);
  group.traverse(o => { if (o.isMesh) o.layers.enable(REFLECT_LAYER); });
  return {
    group,
    hit: group,
    doorPoint: new THREE.Vector3(x, 1.0, z + .1),
    dispose() {},
  };
}
