// Aero villas for the meadow homes. The lots, door approaches, colliders and
// nav obstacles live in field.js; this module replaces only the visual cottages.
//
// The silhouette language is inspired by the supplied white/aqua Frutiger-Aero
// house references: soft rounded shells, turquoise glazing bands, silver trim,
// oval windows and small glowing bubble lamps.

import * as THREE from 'three';
import { REFLECT_LAYER } from './sky.js';

function makeMatrix(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.scale.set(sx, sy, sz);
  o.updateMatrix();
  return o.matrix.clone();
}

function instanced(geo, mat, parts) {
  if (!parts.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, parts.length);
  for (let i = 0; i < parts.length; i++) mesh.setMatrixAt(i, parts[i]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.layers.enable(REFLECT_LAYER);
  return mesh;
}

export function createAeroHomes({ homes, scale = 1 }) {
  const group = new THREE.Group();
  group.name = 'meadowHouses';

  const bodyMats = [
    new THREE.MeshPhysicalMaterial({ color: 0xfbf6e7, roughness: .36, clearcoat: .55, clearcoatRoughness: .35 }),
    new THREE.MeshPhysicalMaterial({ color: 0xf3eddc, roughness: .38, clearcoat: .45, clearcoatRoughness: .4 }),
    new THREE.MeshPhysicalMaterial({ color: 0xe8f4ea, roughness: .34, clearcoat: .55, clearcoatRoughness: .32 }),
  ];
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xc7dce0, metalness: .78, roughness: .22 });
  const glazingTexture = (door = false) => {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2;
    ctx.fillStyle = '#dfe9e6';
    ctx.beginPath(); ctx.arc(cx, cy, S * .49, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8d0d1';
    ctx.beginPath(); ctx.arc(cx, cy, S * .465, 0, Math.PI * 2); ctx.fill();
    const glass = ctx.createLinearGradient(0, S * .14, 0, S * .88);
    if (door) {
      glass.addColorStop(0, '#4da7b1');
      glass.addColorStop(.46, '#186f7a');
      glass.addColorStop(1, '#0b4c58');
    } else {
      glass.addColorStop(0, '#b9fff4');
      glass.addColorStop(.46, '#70e8e0');
      glass.addColorStop(1, '#38b9bb');
    }
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.arc(cx, cy, S * .39, 0, Math.PI * 2); ctx.fill();
    // soft sky highlight and a darker lower rim
    const hi = ctx.createLinearGradient(S * .22, S * .16, S * .42, S * .60);
    hi.addColorStop(0, 'rgba(255,255,255,.48)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.ellipse(S * .37, S * .30, S * .25, S * .32, -.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = S * .018;
    ctx.beginPath(); ctx.arc(cx, cy, S * .39, .2, Math.PI - .1); ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  const aquaMat = new THREE.MeshPhysicalMaterial({
    color: 0x79e8e1, roughness: .28, metalness: .02, clearcoat: .2,
    clearcoatRoughness: .5, envMapIntensity: .15, emissive: 0x23bfc6, emissiveIntensity: .18,
  });
  const windowMat = new THREE.MeshPhysicalMaterial({
    map: glazingTexture(false), roughness: .24, metalness: .02,
    clearcoat: .25, clearcoatRoughness: .5, envMapIntensity: .16,
    emissive: 0x1c9fa5, emissiveIntensity: .16,
  });
  const doorMat = new THREE.MeshPhysicalMaterial({
    map: glazingTexture(true), roughness: .30, metalness: .03,
    clearcoat: .30, clearcoatRoughness: .4, envMapIntensity: .14,
    emissive: 0x0b5962, emissiveIntensity: .14,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xeaffff, emissive: 0x64f4ee, emissiveIntensity: .65, roughness: .25,
  });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe8e5d8, roughness: .82 });

  const baseGeo = new THREE.CylinderGeometry(1.05, 1.08, .10, 28);
  const bodyGeo = new THREE.CylinderGeometry(.80, 1.0, 1, 24);
  const domeGeo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(1, 1, .09, 28);
  const windowGeo = new THREE.CircleGeometry(.255, 32);
  const DOOR_RADIUS = .295;
  const DOOR_CENTER_Y = .56;
  const DOOR_Y_SCALE = 1.80;
  const doorGeo = new THREE.CircleGeometry(DOOR_RADIUS, 32);
  const lampGeo = new THREE.SphereGeometry(.052, 10, 8);
  const postGeo = new THREE.CylinderGeometry(.018, .028, .56, 6);
  const mailGeo = new THREE.CapsuleGeometry(.065, .16, 4, 8);
  const flagGeo = new THREE.BoxGeometry(.022, .10, .045);

  const styles = ['pavilion', 'dome', 'saucer', 'tower', 'pavilion', 'saucer', 'dome', 'tower'];
  const postParts = [], mailParts = [], flagParts = [], lampParts = [], bubbleParts = [];
  const stepParts = [], trimParts = [], doorClearance = [];

  const addMesh = (parent, geo, mat, pos, rot = null, scale = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m);
    return m;
  };

  const UP = new THREE.Vector3(0, 1, 0);
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const tiltWindow = (mesh, angle, tilt) => {
    mesh.quaternion.copy(
      new THREE.Quaternion().setFromAxisAngle(UP, angle)
        .multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, tilt))
    );
    return mesh;
  };

  const addWindow = (parent, angle, y, radius, scale = 1, tilt = -.09) => {
    // Offset along the outward radial direction, not world +z. This matters for
    // rear/side windows: a fixed +z offset would push the glass into the wall.
    const ro = radius + .045;
    const x = Math.sin(angle) * ro;
    const z = Math.cos(angle) * ro;
    // One flush glazing decal: the painted rim is part of the texture, so there
    // is no separate frame to clip into the shell at grazing angles.
    const glass = addMesh(parent, windowGeo, windowMat, [x, y, z], null, [scale, scale * 1.30, 1]);
    tiltWindow(glass, angle, tilt);
    glass.renderOrder = 2;
    return glass;
  };

  const addDoorAndCanopy = (parent, radius, _doorY, tilt = -.16, bodyMat = aquaMat) => {
    // A shallow body-coloured entry drum brings the doorway out to a flat
    // surface. On the domed shells a tall flat decal would otherwise hover
    // clear of the wall at the top of the door.
    const porch = addMesh(parent, new THREE.CapsuleGeometry(.30, .55, 4, 14), bodyMat,
      [0, .60, radius - .01], null, [1, 1, .65]);
    porch.renderOrder = 0;
    // Door heights are authored in world metres, then divided by the villa
    // scale. This keeps every adult bear (1.375 m) below the glass door top
    // even after the world-up rescale.
    const glass = addMesh(parent, doorGeo, doorMat, [0, DOOR_CENTER_Y, radius + .20], null, [1.0, DOOR_Y_SCALE, 1]);
    const handle = addMesh(parent, new THREE.SphereGeometry(.022, 8, 6), silverMat, [.125, DOOR_CENTER_Y + .02, radius + .215]);
  };

  // World-space mailbox/lamp instances, derived from the unchanged home matrices.
  const houseMats = homes.map(h => makeMatrix(h.x, 0, h.z, h.yaw, scale, scale, scale));

  for (let i = 0; i < homes.length; i++) {
    const h = homes[i];
    const hm = houseMats[i];
    const style = styles[i % styles.length];
    const villa = new THREE.Group();
    villa.name = `aeroVilla-${i}`;
    villa.position.set(h.x, 0, h.z);
    villa.rotation.y = h.yaw;
    villa.scale.setScalar(scale);
    group.add(villa);

    addMesh(villa, baseGeo, stoneMat, [0, .055, 0]);
    const bodyMat = bodyMats[i % bodyMats.length];
    let radius = .92;
    let doorY = .48;
    let canopyY = 1.12;

    // Shared architectural layers: side pod, base trim, fins and two shallow
    // entry steps. These break the cylinder silhouette without extending the
    // collider footprint beyond its existing 1.10 local radius bound.
    addMesh(villa, new THREE.CapsuleGeometry(.27, .18, 4, 12), bodyMat,
      [.64, .55, -.06], null, [.95, 1, .95]);
    addMesh(villa, new THREE.TorusGeometry(.27, .022, 6, 22), silverMat,
      [.64, .55, -.06], [Math.PI / 2, 0, 0], [.96, 1, .96]);
    const podWin = addMesh(villa, windowGeo, windowMat,
      [.925, .55, -.06], null, [.62, .80, 1]);
    podWin.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    const stepLocal = (z, y, s) => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(0, y, z),
        new THREE.Quaternion(),
        new THREE.Vector3(s, 1, s * .72)
      );
      stepParts.push(hm.clone().multiply(m));
    };
    stepLocal(1.02, .065, .72);
    stepLocal(1.17, .035, .90);
    const trimM = new THREE.Matrix4().compose(
      new THREE.Vector3(0, .105, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
      new THREE.Vector3(1.035, 1.035, 1.035)
    );
    trimParts.push(hm.clone().multiply(trimM));


    if (style === 'pavilion') {
      addMesh(villa, bodyGeo, bodyMat, [0, .62, 0], null, [.94, 1.06, .94]);
      addMesh(villa, domeGeo, bodyMat, [0, 1.14, 0], null, [1.01, .34, 1.01]);
      addMesh(villa, new THREE.TorusGeometry(1.01, .032, 8, 28), silverMat, [0, 1.16, 0], [Math.PI / 2, 0, 0]);
      addMesh(villa, new THREE.CylinderGeometry(.22, .26, .08, 16), glowMat, [0, 1.48, 0]);
      addMesh(villa, domeGeo, bodyMat, [.36, 1.35, -.18], null, [.38, .24, .38]);
      addMesh(villa, new THREE.TorusGeometry(.38, .018, 6, 24), silverMat, [.36, 1.36, -.18], [Math.PI / 2, 0, 0]);
      addMesh(villa, new THREE.CircleGeometry(.09, 18), windowMat, [.36, 1.58, -.18], [-Math.PI / 2, 0, 0]);
      addWindow(villa, -.72, .78, .815, 1.05, -.16);
      addWindow(villa, .72, .78, .815, 1.05, -.16);
      addWindow(villa, -2.30, .78, .815, .95, -.16);
      addWindow(villa, 2.30, .78, .815, .95, -.16);
      addWindow(villa, Math.PI, .78, .815, .92, -.16);
      addDoorAndCanopy(villa, .88, .45, -.24, bodyMat);
    } else if (style === 'dome') {
      addMesh(villa, new THREE.CylinderGeometry(.80, .96, .42, 24), bodyMat, [0, .25, 0]);
      addMesh(villa, domeGeo, bodyMat, [0, .43, 0], null, [1.02, .92, 1.02]);
      addMesh(villa, new THREE.TorusGeometry(1.01, .030, 8, 28), silverMat, [0, .44, 0], [Math.PI / 2, 0, 0]);
      // A real skylight lens on the dome, not a disc floating on its front.
      addMesh(villa, new THREE.CircleGeometry(.18, 24), aquaMat, [0, 1.345, 0], [-Math.PI / 2, 0, 0]);
      addMesh(villa, new THREE.TorusGeometry(.19, .020, 8, 24), silverMat, [0, 1.348, 0], [Math.PI / 2, 0, 0]);
      addWindow(villa, -.66, .31, .935, 1.0, -.16);
      addWindow(villa, .66, .31, .935, 1.0, -.16);
      addWindow(villa, -2.28, .31, .935, .92, -.16);
      addWindow(villa, 2.28, .31, .935, .92, -.16);
      addWindow(villa, Math.PI, .31, .935, .90, -.16);
      addDoorAndCanopy(villa, .925, .31, -.24, bodyMat);
      addMesh(villa, domeGeo, bodyMat, [.30, 1.26, .18], null, [.28, .22, .28]);
      addMesh(villa, new THREE.TorusGeometry(.29, .017, 6, 22), silverMat, [.30, 1.27, .18], [Math.PI / 2, 0, 0]);
      addMesh(villa, new THREE.CircleGeometry(.075, 16), windowMat, [.30, 1.47, .18], [-Math.PI / 2, 0, 0]);
    } else if (style === 'saucer') {
      addMesh(villa, discGeo, bodyMat, [0, .16, 0], null, [1.08, 1, 1.08]);
      addMesh(villa, new THREE.CylinderGeometry(.68, .86, .95, 24), bodyMat, [0, .67, 0]);
      addMesh(villa, discGeo, silverMat, [0, 1.23, 0], null, [1.13, .10, 1.13]);
      addMesh(villa, domeGeo, bodyMat, [0, 1.25, 0], null, [.70, .35, .70]);
      addMesh(villa, new THREE.TorusGeometry(1.11, .026, 8, 28), silverMat, [0, 1.25, 0], [Math.PI / 2, 0, 0]);
      addWindow(villa, -.74, .72, .76, 1.06, -.16);
      addWindow(villa, .74, .72, .76, 1.06, -.16);
      addWindow(villa, -2.28, .72, .76, .96, -.16);
      addWindow(villa, 2.28, .72, .76, .96, -.16);
      addWindow(villa, Math.PI, .72, .76, .92, -.16);
      addDoorAndCanopy(villa, .82, .44, -.24, bodyMat);
      addMesh(villa, new THREE.CylinderGeometry(.54, .62, .10, 24), silverMat, [.34, 1.38, .18], null, [1, 1, 1]);
      addMesh(villa, domeGeo, bodyMat, [.34, 1.42, .18], null, [.56, .26, .56]);
      addMesh(villa, new THREE.TorusGeometry(.55, .018, 6, 24), silverMat, [.34, 1.43, .18], [Math.PI / 2, 0, 0]);
      radius = .82;
    } else {
      addMesh(villa, new THREE.CylinderGeometry(.58, .78, 1.60, 22), bodyMat, [0, .82, 0]);
      addMesh(villa, new THREE.TorusGeometry(.71, .026, 8, 26), silverMat, [0, .48, 0], [Math.PI / 2, 0, 0]);
      addMesh(villa, domeGeo, bodyMat, [0, 1.62, 0], null, [.78, .52, .78]);
      addMesh(villa, new THREE.TorusGeometry(.77, .026, 8, 26), silverMat, [0, 1.63, 0], [Math.PI / 2, 0, 0]);
      addWindow(villa, -.62, .72, .695, 1.0, -.21);
      addWindow(villa, .62, .72, .695, 1.0, -.21);
      addWindow(villa, Math.PI, .72, .695, .88, -.21);
      addWindow(villa, -.72, 1.22, .628, .82, -.21);
      addWindow(villa, .72, 1.22, .628, .82, -.21);
      addWindow(villa, 0, 1.44, .62, .78, -.21);
      addDoorAndCanopy(villa, .735, .42, -.27, bodyMat);
      addMesh(villa, new THREE.TorusGeometry(.79, .030, 7, 26), silverMat, [0, 1.01, 0], [Math.PI / 2, 0, 0]);
      addMesh(villa, new THREE.CylinderGeometry(.035, .055, .55, 7), silverMat, [.42, 2.35, -.28], [0, 0, -.32]);
      addMesh(villa, new THREE.SphereGeometry(.055, 8, 6), glowMat, [.50, 2.63, -.28]);
      radius = .735;
    }

    // Door-clearance metadata is measured in world metres, after the villa
    // scale has been applied. The QA harness compares it to the tallest bear.
    const doorWorldTop = (DOOR_CENTER_Y + DOOR_RADIUS * DOOR_Y_SCALE) * scale;
    const doorWorldBottom = (DOOR_CENTER_Y - DOOR_RADIUS * DOOR_Y_SCALE) * scale;
    const doorInfo = {
      name: h.name,
      top: +doorWorldTop.toFixed(3),
      bottom: +doorWorldBottom.toFixed(3),
      opening: +(doorWorldTop - doorWorldBottom).toFixed(3),
      width: +(DOOR_RADIUS * 2 * scale).toFixed(3),
    };
    villa.userData.doorClearance = doorInfo;
    doorClearance.push(doorInfo);

    // Warm aqua bubble lamps clustered near the entrance/roof.
    const bubbleLocals = [
      [-.78, 1.46, .34], [.72, 1.38, -.26], [.48, 1.82, .12],
    ];
    for (const b of bubbleLocals) {
      const m = new THREE.Matrix4().setPosition(b[0], b[1], b[2]);
      bubbleParts.push(hm.clone().multiply(m));
    }

    // Porch light + mailbox (one instance batch for all homes).
    const lampLocal = new THREE.Matrix4().setPosition(0, 1.28, radius + .23);
    lampParts.push(hm.clone().multiply(lampLocal));
    const postLocal = new THREE.Matrix4().setPosition(-.88, .30, 1.32);
    const mailLocal = new THREE.Matrix4().compose(
      new THREE.Vector3(-.88, .62, 1.32),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)
    );
    const flagLocal = new THREE.Matrix4().setPosition(-.78, .70, 1.32);
    postParts.push(hm.clone().multiply(postLocal));
    mailParts.push(hm.clone().multiply(mailLocal));
    flagParts.push(hm.clone().multiply(flagLocal));
  }

  const postMesh = instanced(postGeo, silverMat, postParts); if (postMesh) group.add(postMesh);
  const mailMesh = instanced(mailGeo, bodyMats[0], mailParts); if (mailMesh) group.add(mailMesh);
  const flagMesh = instanced(flagGeo, aquaMat, flagParts); if (flagMesh) group.add(flagMesh);
  const lampMesh = instanced(lampGeo, glowMat, lampParts); if (lampMesh) group.add(lampMesh);
  const bubbleMesh = instanced(lampGeo, glowMat, bubbleParts); if (bubbleMesh) group.add(bubbleMesh);

  const stepMesh = instanced(new THREE.CylinderGeometry(.72, .75, .06, 20), stoneMat, stepParts);
  if (stepMesh) { stepMesh.name = 'villaSteps'; group.add(stepMesh); }
  const trimMesh = instanced(new THREE.TorusGeometry(1.035, .020, 6, 30), silverMat, trimParts);
  if (trimMesh) { trimMesh.name = 'villaBaseTrim'; group.add(trimMesh); }

  group.traverse(o => { if (o.isMesh) o.layers.enable(REFLECT_LAYER); });

  return {
    group,
    styles: styles.slice(0, homes.length),
    doorClearance,
    setNight(v) {
      const n = Math.max(0, Math.min(1, Number(v) || 0));
      aquaMat.emissiveIntensity = .18 + n * 1.9;
      windowMat.emissiveIntensity = .16 + n * 1.9;
      doorMat.emissiveIntensity = .14 + n * .85;
      glowMat.emissiveIntensity = .55 + n * 2.15;
    },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}
