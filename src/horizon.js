// Distant mood scenery: a small Frutiger-Aero skyline and windmills on the
// horizon. Everything here is pure set dressing outside the playable field, so
// it never enters Box3D or the nav mesh.

import * as THREE from 'three';
import { REFLECT_LAYER } from './sky.js';

function windowTexture() {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f5ffff');
  g.addColorStop(.5, '#c9f4fb');
  g.addColorStop(1, '#91d9eb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rnd = (() => { let s = 491; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  for (let y = 14; y < H - 12; y += 22) {
    for (let x = 12; x < W - 10; x += 21) {
      if (rnd() < .18) continue;
      const w = 10 + Math.floor(rnd() * 6);
      const lit = rnd() < .36;
      ctx.fillStyle = lit ? 'rgba(255,249,204,.95)' : 'rgba(255,255,255,.55)';
      ctx.fillRect(x, y, w, 8);
      ctx.fillStyle = 'rgba(78,154,178,.25)';
      ctx.fillRect(x, y + 8, w, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

export function createHorizon() {
  const group = new THREE.Group();
  group.name = 'meadowHorizon';

  const winTex = windowTexture();
  const towerMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: winTex, emissive: 0x8fe8f1, emissiveMap: winTex,
    emissiveIntensity: .38, roughness: .24, metalness: .22,
    clearcoat: .8, clearcoatRoughness: .18,
  });
  const spireMat = new THREE.MeshStandardMaterial({ color: 0xdff8ff, roughness: .25, metalness: .55 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xc9fbff, emissive: 0x4bc7d8, emissiveIntensity: .55, roughness: .2, metalness: .4 });
  const windMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fbf2, roughness: .42, clearcoat: .4,
    emissive: 0x0a1a20, emissiveIntensity: 0,
  });
  const windTrimMat = new THREE.MeshStandardMaterial({ color: 0x8ed8d1, roughness: .4, metalness: .15 });
  const windTipMat = new THREE.MeshStandardMaterial({ color: 0xe45c59, roughness: .5 });

  // Rounded, pastel glass towers on the far horizon. The capsule silhouette keeps
  // them in the same soft toy language as the meadow rather than a hard city.
  const towers = [];
  const towerAngles = [-2.52, -2.27, -2.02, -1.78, -1.53, -1.29, -1.04, -.79, -.54, -.29];
  const towerParts = [], spireParts = [], bandParts = [], boxParts = [], boxSpireParts = [];
  for (let i = 0; i < towerAngles.length; i++) {
    const a = towerAngles[i] + (i % 2 ? .025 : -.02);
    const rad = 146 + (i % 4) * 8;
    const sx = 1.9 + (i % 5) * .32;
    const sy = 4.3 + (i % 5) * .82;
    const h = 4.5 * sy;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const y = h * .5 - 3.2;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI * .5),
      new THREE.Vector3(sx, sy, sx)
    );
    const col = new THREE.Color().setHSL(.50 + (i % 3) * .025, .28, .82 + (i % 2) * .05);
    towerParts.push({ m, c: col });
    towers.push({ x, y, z, h, sx, sy });
    for (const hy of [.22, .38]) {
      const bm = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + h * hy, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * .5),
        new THREE.Vector3(sx, sx, sx)
      );
      bandParts.push(bm);
    }
    if (i % 3 === 0) {
      const sm = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + h * .5 + 1.2, z),
        new THREE.Quaternion(),
        new THREE.Vector3(1.0, 3.2, 1.0)
      );
      spireParts.push({ m: sm, c: new THREE.Color(0xe7ffff) });
    }
  }
  const capsule = new THREE.CapsuleGeometry(.65, 3.2, 5, 12);
  const towerMesh = new THREE.InstancedMesh(capsule, towerMat, towerParts.length);
  for (let i = 0; i < towerParts.length; i++) {
    towerMesh.setMatrixAt(i, towerParts[i].m);
    towerMesh.setColorAt(i, towerParts[i].c);
  }
  towerMesh.instanceMatrix.needsUpdate = true;
  if (towerMesh.instanceColor) towerMesh.instanceColor.needsUpdate = true;
  towerMesh.name = 'aeroSkyline';
  towerMesh.frustumCulled = false;
  towerMesh.layers.enable(REFLECT_LAYER);
  group.add(towerMesh);

  if (spireParts.length) {
    const spireMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(.7, 8, 8), spireMat, spireParts.length);
    for (let i = 0; i < spireParts.length; i++) spireMesh.setMatrixAt(i, spireParts[i].m);
    spireMesh.instanceMatrix.needsUpdate = true;
    spireMesh.name = 'aeroSpires';
    spireMesh.frustumCulled = false;
    spireMesh.layers.enable(REFLECT_LAYER);
    group.add(spireMesh);
  }
  if (bandParts.length) {
    const bandMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .055, 6, 20), bandMat, bandParts.length);
    for (let i = 0; i < bandParts.length; i++) bandMesh.setMatrixAt(i, bandParts[i]);
    bandMesh.instanceMatrix.needsUpdate = true;
    bandMesh.name = 'aeroTowerBands';
    bandMesh.frustumCulled = false;
    bandMesh.layers.enable(REFLECT_LAYER);
    group.add(bandMesh);
  }

  // A tighter cluster of flat-topped glass towers gives the horizon an actual
  // city silhouette, closer to the supplied Aero references than the spaced
  // capsule towers alone.
  const boxAngles = [-1.83, -1.66, -1.49, -1.32, -1.15, -.98, -.81];
  for (let i = 0; i < boxAngles.length; i++) {
    const a = boxAngles[i];
    const rad = 158 + (i % 3) * 7;
    const sx = 3.0 + (i % 4) * .75;
    const sy = 14 + (i % 5) * 4.8;
    const sz = 2.8 + (i % 3) * .55;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, sy * .5 - 2.0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
      new THREE.Vector3(sx, sy, sz)
    );
    const col = new THREE.Color().setHSL(.51 + (i % 3) * .018, .20, .80 + (i % 2) * .05);
    boxParts.push({ m, c: col });
    if (i === 3) {
      const sm = new THREE.Matrix4().compose(
        new THREE.Vector3(x, sy - 0.9, z),
        new THREE.Quaternion(),
        new THREE.Vector3(1.0, 7.0, 1.0)
      );
      boxSpireParts.push({ m: sm, c: new THREE.Color(0xe7ffff) });
    }
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMesh = new THREE.InstancedMesh(boxGeo, towerMat, boxParts.length);
  for (let i = 0; i < boxParts.length; i++) {
    boxMesh.setMatrixAt(i, boxParts[i].m);
    boxMesh.setColorAt(i, boxParts[i].c);
  }
  boxMesh.instanceMatrix.needsUpdate = true;
  if (boxMesh.instanceColor) boxMesh.instanceColor.needsUpdate = true;
  boxMesh.name = 'aeroCityBlocks';
  boxMesh.frustumCulled = false;
  boxMesh.layers.enable(REFLECT_LAYER);
  group.add(boxMesh);
  if (boxSpireParts.length) {
    const bs = new THREE.InstancedMesh(new THREE.ConeGeometry(.7, 8, 8), spireMat, boxSpireParts.length);
    for (let i = 0; i < boxSpireParts.length; i++) bs.setMatrixAt(i, boxSpireParts[i].m);
    bs.instanceMatrix.needsUpdate = true;
    bs.name = 'aeroCitySpire';
    bs.frustumCulled = false;
    bs.layers.enable(REFLECT_LAYER);
    group.add(bs);
  }

  // Distant windmills on the near hill line. Their slow rotors are the only
  // moving parts in this module.
  const rotors = [];
  // Tapered three-blade turbine inspired by the reference images: a slim white
  // tower, a proper nacelle and long blades with restrained red tips.
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-.16, 0);
  bladeShape.quadraticCurveTo(-.12, 1.65, -.025, 3.15);
  bladeShape.lineTo(.025, 3.15);
  bladeShape.quadraticCurveTo(.09, 1.60, .16, 0);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: .075, bevelEnabled: false, steps: 1 });
  bladeGeo.translate(0, 0, -.0375);
  const tipGeo = new THREE.ConeGeometry(.055, .28, 6);
  tipGeo.translate(0, 3.30, 0);
  const millSpots = [
    { x: -27, z: -42, yaw: .35, s: 1.45 },
    { x: 23, z: -46, yaw: -0.55, s: 1.18 },
    { x: -55, z: 34, yaw: 2.5, s: .9 },
  ];
  for (const spot of millSpots) {
    const mill = new THREE.Group();
    mill.name = 'meadowWindmill';
    mill.position.set(spot.x, 0, spot.z);
    mill.rotation.y = spot.yaw;
    mill.scale.setScalar(spot.s);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(.16, .52, 6.8, 10), windMat);
    tower.position.y = 3.4;
    mill.add(tower);
    const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .7, 4, 8), windMat);
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set(0, 6.78, -.14);
    mill.add(nacelle);
    const rotor = new THREE.Group();
    rotor.position.set(0, 6.78, .34);
    rotor.rotation.z = .42 + rotors.length * .37;
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(bladeGeo, windMat);
      blade.rotation.z = b * Math.PI * 2 / 3;
      rotor.add(blade);
      const tip = new THREE.Mesh(tipGeo, windTipMat);
      tip.rotation.z = blade.rotation.z;
      rotor.add(tip);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 8), windTrimMat);
    rotor.add(hub);
    mill.add(rotor);
    const speed = .23 + .07 * rotors.length;
    rotors.push({ rotor, mill, speed, current: speed, yaw: spot.yaw });
    group.add(mill);
  }

  group.traverse(o => { if (o.isMesh) o.layers.enable(REFLECT_LAYER); });

  return {
    group,
    towers: towers.length + boxParts.length,
    windmills: rotors.length,
    setNight(v) {
      const n = Math.max(0, Math.min(1, Number(v) || 0));
      towerMat.emissiveIntensity = .30 + n * 1.25;
      bandMat.emissiveIntensity = .45 + n * 1.25;
      windMat.emissiveIntensity = n * .16;
    },
    update(dt, wind) {
      const strength = wind ? wind.strength : 1;
      const gust = wind ? wind.gust : .55;
      const dir = wind ? wind.direction : null;
      const speedScale = THREE.MathUtils.clamp(
        .30 + strength * 1.25 * (.75 + gust * .35),
        .25, 2.2
      );
      let yawTarget = null;
      if (dir) yawTarget = Math.atan2(-dir.x, -dir.z);
      for (const r of rotors) {
        const target = r.speed * speedScale;
        r.current += (target - r.current) * Math.min(1, dt * 1.8);
        r.rotor.rotation.z += dt * r.current;
        if (yawTarget !== null) {
          let d = (yawTarget - r.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          r.yaw += d * Math.min(1, dt * .65);
          r.mill.rotation.y = r.yaw;
        }
      }
    },
    windmillSpeed() {
      if (!rotors.length) return 0;
      return rotors.reduce((sum, r) => sum + r.current, 0) / rotors.length;
    },
    windmillYaw() {
      return rotors.length ? rotors[0].yaw : 0;
    },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      winTex.dispose();
    },
  };
}
