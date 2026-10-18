// Movable glass-and-brass gummy cannon.
// Builds its own meshes/aim arc; the app supplies the world, bears, spawn and UI.
// Aim mode: click/drag on the table to fire a spawned bear on a ballistic arc.
// Move mode / direct drag: reposition the cannon with footprint validation.

import * as THREE from 'three';

const PIVOT_Y = 0.43;
const MUZZLE_Z = 0.44;
const ANGLE = 0.56;      // ~32 degrees
const LAND_Y = 0.60;     // COM height of a resting bear
const G = 12;            // matches world gravity
const MIN_V = 5.0;
const MAX_V = 22.0;
const DEFAULT_NOTE = 'Drag to stretch · release to throw';
const BASE_MARGIN = 0.45;

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

export function createLauncher(ctx) {
  const {
    scene, camera, canvas,
    getTable, getBears, spawnBear, uploadVelocities,
    restDY, np, flavors, isPhysicsReady,
    getHome, placementExtra, insideBounds, clampBounds,
    state, onPlace, canSpawnAt,
    ui = {},
  } = ctx;

  let group = null, yaw = null, pitch = null;
  let flashRing = null, aimDots = null, aimRing = null, moveRing = null;
  let shadowCanvas = null;
  let aiming = false, hasAim = false;
  let speed = 6, recoil = 0, flash = 0, lastShot = null;
  const FIRE_COOLDOWN_MS = 260;
  let lastFireAt = -Infinity;
  let aimPointer = null, dragPointer = null;
  let moveMode = false, dragging = false, savedPos = null, previewValid = true;
  let current = null;

  const target = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const dir = new THREE.Vector3(0, 0, 1);
  const vel = new THREE.Vector3();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion();
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  const _rc = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  const _m = new THREE.Matrix4();

  const coarse = !!ui.coarse;
  const defaultHint = coarse
    ? 'Drag empty space to orbit · pinch to pan & zoom'
    : 'Right-drag to orbit · WASD to pan · scroll to zoom · ? for help';

  function table() {
    return getTable ? getTable() : { hx: 3, hz: 2.5 };
  }
  function bears() {
    return getBears ? getBears() : [];
  }
  function primary(e) {
    return e.pointerType !== 'mouse' || e.button === 0;
  }
  function movingNow() {
    return moveMode || dragging;
  }

  function defaultPosition() {
    if (state && Number.isFinite(state.x) && Number.isFinite(state.z)) {
      return { x: state.x, z: state.z };
    }
    if (getHome) return getHome();
    const t = table();
    return { x: -t.hx * 0.7, z: t.hz * 0.74 };
  }

  function clampXZ(x, z) {
    if (clampBounds) return clampBounds(x, z, BASE_MARGIN);
    const t = table();
    return {
      x: clamp(x, -t.hx + BASE_MARGIN, t.hx - BASE_MARGIN),
      z: clamp(z, -t.hz + BASE_MARGIN, t.hz - BASE_MARGIN),
    };
  }

  function placementValid(x, z) {
    const t = table();
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (insideBounds) {
      if (!insideBounds(x, z, BASE_MARGIN)) return false;
    } else if (Math.abs(x) > t.hx - BASE_MARGIN || Math.abs(z) > t.hz - BASE_MARGIN) return false;
    for (const b of bears()) {
      if (!b.active) continue;
      const clearance = 0.62 + 0.18 * (b.scale || 1);
      if (Math.hypot(x - b.cx, z - b.cz) < clearance) return false;
    }
    if (placementExtra && !placementExtra(x, z)) return false;
    return true;
  }

  function pointToTable(clientX, clientY) {
    _ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    _rc.setFromCamera(_ndc, camera);
    const o = _rc.ray.origin, d = _rc.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (0.02 - o.y) / d.y;
    if (t <= 0.05) return null;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }

  function hitCannon(clientX, clientY) {
    _ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    _rc.setFromCamera(_ndc, camera);
    if (_rc.intersectObject(group, true).length) return true;
    const p = pointToTable(clientX, clientY);
    return !!p && Math.hypot(p.x - group.position.x, p.z - group.position.z) < 0.52;
  }

  // ---------------------------------------------------------------- visuals
  function build() {
    if (group) return;

    const baseMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8f4ec, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.24,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc39a52, metalness: 1, roughness: 0.27,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd51f3c, transmission: 0.62, thickness: 0.30, roughness: 0.10,
      ior: 1.45, attenuationColor: 0x7a0a1e, attenuationDistance: 1.4,
      clearcoat: 1, clearcoatRoughness: 0.08,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x360a10, roughness: 0.55 });

    const g = new THREE.Group();

    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.26, 0.06, 48), baseMat);
    plate.position.y = 0.03; g.add(plate);
    const plateRing = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.008, 8, 48), goldMat);
    plateRing.rotation.x = Math.PI / 2; plateRing.position.y = 0.061; g.add(plateRing);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.185, 0.28, 40), baseMat);
    pedestal.position.y = 0.20; g.add(pedestal);
    const waist = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.011, 8, 40), goldMat);
    waist.rotation.x = Math.PI / 2; waist.position.y = 0.145; g.add(waist);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.137, 0.015, 10, 40), goldMat);
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.335; g.add(collar);

    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 24), goldMat);
    wheel.rotation.y = Math.PI / 2; wheel.position.set(-0.185, 0.20, 0); g.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 12), goldMat);
    hub.rotation.z = Math.PI / 2; hub.position.set(-0.175, 0.20, 0); g.add(hub);

    yaw = new THREE.Group();
    yaw.position.y = 0.40; g.add(yaw);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.108, 28, 18), goldMat);
    ball.scale.set(1, 0.72, 1); yaw.add(ball);

    pitch = new THREE.Group();
    pitch.position.y = 0.03; yaw.add(pitch);

    const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.090, 0.49, 28, 1, false), darkMat);
    bore.rotation.x = Math.PI / 2; bore.position.z = 0.165; pitch.add(bore);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.118, 0.52, 36, 1, true), glassMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.17; pitch.add(barrel);
    const breech = new THREE.Mesh(new THREE.SphereGeometry(0.112, 28, 18), glassMat);
    breech.scale.set(1, 1, 0.72); breech.position.z = -0.085; pitch.add(breech);
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.016, 12, 36), goldMat);
    muzzleRing.position.z = 0.432; pitch.add(muzzleRing);
    for (const z of [0.015, 0.285]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.008, 8, 32), goldMat);
      band.position.z = z; pitch.add(band);
    }
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), goldMat);
    bead.position.set(0, 0.10, 0.30); pitch.add(bead);

    flashRing = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.125, 36),
      new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    flashRing.position.z = MUZZLE_Z + 0.006;
    flashRing.visible = false;
    pitch.add(flashRing);

    scene.add(g);
    group = g;

    const dotGeo = new THREE.SphereGeometry(0.021, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xd51f3c, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false });
    aimDots = new THREE.InstancedMesh(dotGeo, dotMat, 44);
    aimDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    aimDots.frustumCulled = false;
    aimDots.visible = false;
    scene.add(aimDots);

    aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.205, 48),
      new THREE.MeshBasicMaterial({ color: 0xd51f3c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    aimRing.rotation.x = -Math.PI / 2;
    aimRing.position.y = 0.018;
    aimRing.visible = false;
    scene.add(aimRing);

    moveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.30, 0.37, 48),
      new THREE.MeshBasicMaterial({ color: 0x66bf73, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    moveRing.rotation.x = -Math.PI / 2;
    moveRing.position.y = 0.016;
    moveRing.visible = false;
    scene.add(moveRing);

    shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 96;
    const sc = shadowCanvas.getContext('2d');
    const grd = sc.createRadialGradient(48, 48, 4, 48, 48, 46);
    grd.addColorStop(0, 'rgba(58,44,36,.42)');
    grd.addColorStop(0.5, 'rgba(58,44,36,.19)');
    grd.addColorStop(1, 'rgba(58,44,36,0)');
    sc.fillStyle = grd;
    sc.fillRect(0, 0, 96, 96);

    layout();
    yaw.rotation.y = Math.atan2(-group.position.x, -0.2 - group.position.z);
    pitch.rotation.x = -0.30;

    if (ui.launchBtn) ui.launchBtn.addEventListener('click', () => toggleAiming());
    if (ui.moveBtn) ui.moveBtn.addEventListener('click', () => toggleMoveMode());
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (aiming) setAiming(false);
      else if (movingNow()) cancelMove();
    });

    setIdleUI();
  }

  // ---------------------------------------------------------------- placement
  function setPreview(p) {
    const c = clampXZ(p.x, p.z);
    current = c;
    group.position.set(c.x, 0, c.z);
    previewValid = placementValid(c.x, c.z);
    if (moveRing) {
      moveRing.position.set(c.x, 0.016, c.z);
      moveRing.material.color.setHex(previewValid ? 0x66bf73 : 0xd51f3c);
      moveRing.visible = true;
    }
  }

  function layout() {
    if (!group) return;
    if (movingNow()) cancelMove();
    const p = current || defaultPosition();
    const c = clampXZ(p.x, p.z);
    current = c;
    group.position.set(c.x, 0, c.z);
    if (aiming && hasAim) aimAtWorld(target.x, target.z);
  }

  function startMove(kind, pointerId) {
    if (!group) return false;
    if (aiming) setAiming(false);
    if (movingNow()) return false;
    savedPos = { x: current.x, z: current.z };
    moveMode = kind === 'mode';
    dragging = kind === 'drag';
    dragPointer = dragging ? pointerId : null;
    aimPointer = null;
    previewValid = placementValid(current.x, current.z);
    if (moveRing) {
      moveRing.position.set(current.x, 0.016, current.z);
      moveRing.material.color.setHex(previewValid ? 0x66bf73 : 0xd51f3c);
      moveRing.visible = true;
    }
    if (ui.moveBtn) {
      ui.moveBtn.classList.add('aiming');
      ui.moveBtn.textContent = 'Cancel move';
      ui.moveBtn.setAttribute('aria-pressed', 'true');
    }
    if (ui.note) ui.note.textContent = 'Click the table to place the cannon · Esc to cancel';
    if (ui.cursor) {
      ui.cursor.classList.remove('aim');
      ui.cursor.classList.add('move');
    }
    if (ui.showHint) {
      ui.showHint(coarse
        ? 'Tap the table to place the cannon · tap Cancel move to exit'
        : 'Click the table to place the cannon · Esc cancels');
    }
    return true;
  }

  function restoreSaved() {
    if (!savedPos) return;
    current = { x: savedPos.x, z: savedPos.z };
    group.position.set(current.x, 0, current.z);
  }

  function finishMove(commit) {
    if (!group) return;
    if (commit && placementValid(current.x, current.z)) {
      if (onPlace) onPlace(current.x, current.z);
    } else {
      restoreSaved();
    }
    savedPos = null;
    moveMode = false;
    dragging = false;
    dragPointer = null;
    previewValid = true;
    if (moveRing) moveRing.visible = false;
    setIdleUI();
  }

  function cancelMove() {
    if (!movingNow()) return;
    restoreSaved();
    savedPos = null;
    moveMode = false;
    dragging = false;
    dragPointer = null;
    previewValid = true;
    if (moveRing) moveRing.visible = false;
    setIdleUI();
  }

  function toggleMoveMode(on) {
    if (!group) return false;
    const next = on === undefined ? !movingNow() : !!on;
    if (next) startMove('mode');
    else cancelMove();
    return movingNow();
  }

  // --------------------------------------------------------------------- aim
  function aimAtWorld(tx, tz) {
    if (!group) return false;
    const t = table();
    const margin = 0.16;
    if (clampBounds) {
      const c = clampBounds(Number(tx) || 0, Number(tz) || 0, margin);
      tx = c.x; tz = c.z;
    } else {
      tx = clamp(Number(tx) || 0, -t.hx + margin, t.hx - margin);
      tz = clamp(Number(tz) || 0, -t.hz + margin, t.hz - margin);
    }
    const bx = group.position.x, bz = group.position.z;
    let dx = tx - bx, dz = tz - bz;
    let d = Math.hypot(dx, dz);
    if (d < 0.8) {
      const k = 0.8 / (d || 1);
      dx *= k; dz *= k; d = 0.8;
      tx = bx + dx; tz = bz + dz;
    }

    const yw = Math.atan2(dx, dz);
    const cp = Math.cos(ANGLE), sp = Math.sin(ANGLE);
    yaw.rotation.y = yw;
    pitch.rotation.x = -ANGLE;
    muzzle.set(
      bx + Math.sin(yw) * cp * MUZZLE_Z,
      PIVOT_Y + sp * MUZZLE_Z,
      bz + Math.cos(yw) * cp * MUZZLE_Z
    );

    const mdx = tx - muzzle.x, mdz = tz - muzzle.z;
    const md = Math.max(0.35, Math.hypot(mdx, mdz));
    const dy = LAND_Y - muzzle.y;
    const denom = 2 * cp * cp * (md * sp / cp - dy);
    let v = denom > 1e-4 ? Math.sqrt(G * md * md / denom) : MIN_V;
    v = clamp(v, MIN_V, MAX_V);
    speed = v;
    dir.set(Math.sin(yw) * cp, sp, Math.cos(yw) * cp);
    vel.copy(dir).multiplyScalar(v);
    target.set(tx, 0.018, tz);
    hasAim = true;
    updateAimArc();
    return true;
  }

  function updateAimArc() {
    if (!aimDots) return;
    const on = aiming && hasAim;
    aimDots.visible = on;
    aimRing.visible = on;
    if (!on) return;
    const n = aimDots.count, step = 0.035;
    let used = 0;
    let landX = target.x, landZ = target.z;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) * step;
      const x = muzzle.x + vel.x * t;
      const y = muzzle.y + vel.y * t - 0.5 * G * t * t;
      const z = muzzle.z + vel.z * t;
      if (i > 2 && y <= LAND_Y) { landX = x; landZ = z; break; }
      _m.makeTranslation(x, y, z);
      aimDots.setMatrixAt(used++, _m);
    }
    for (let k = 1; k <= 3 && used < n; k++) {
      const y = LAND_Y - (LAND_Y - 0.05) * k / 3.15;
      _m.makeTranslation(landX, y, landZ);
      aimDots.setMatrixAt(used++, _m);
    }
    _m.makeScale(0, 0, 0);
    for (let i = used; i < n; i++) aimDots.setMatrixAt(i, _m);
    aimDots.instanceMatrix.needsUpdate = true;
    aimRing.position.set(landX, 0.018, landZ);
  }

  function updateAimFromScreen(clientX, clientY) {
    if (!aiming || !group) return;
    const p = pointToTable(clientX, clientY);
    if (!p) return;
    aimAtWorld(p.x, p.z);
  }

  function fire() {
    if (!group || !hasAim || !isPhysicsReady || !isPhysicsReady()) return false;
    // Rapid clicks used to spawn several bears into the same muzzle point and
    // weld them together. One shot per cooldown keeps them separated.
    const now = performance.now();
    if (now - lastFireAt < FIRE_COOLDOWN_MS) return false;
    const f = Math.floor(Math.random() * flavors.length);
    let ox = muzzle.x + dir.x * 0.36;
    let oy = muzzle.y + dir.y * 0.36;
    let oz = muzzle.z + dir.z * 0.36;
    if (canSpawnAt && !canSpawnAt(ox, oz, 0.40)) {
      // Try one short step along the shot line before refusing the shot.
      const nx = ox + dir.x * 0.60;
      const ny = oy + dir.y * 0.60;
      const nz = oz + dir.z * 0.60;
      if (!canSpawnAt(nx, nz, 0.40)) return false;
      ox = nx; oy = ny; oz = nz;
    }

    _y.copy(dir).normalize();
    _z.set(0, 1, 0).addScaledVector(_y, -_y.y);
    if (_z.lengthSq() < 0.02) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
    _z.normalize();
    _x.crossVectors(_y, _z).normalize();
    _m4.makeBasis(_x, _y, _z);
    _q.setFromRotationMatrix(_m4);

    const b = spawnBear(ox, oz, oy - restDY, f, { quat: _q, lift: 0 });
    if (!b) return false;
    lastFireAt = now;
    for (let i = 0; i < np; i++) {
      b.vx[i] = vel.x;
      b.vy[i] = vel.y;
      b.vz[i] = vel.z;
    }
    uploadVelocities(b);
    b.airborne = true;
    b.awake = true;
    b.hopT = Math.max(b.hopT, 4.0);
    recoil = 1;
    flash = 1;
    lastShot = {
      flavor: f, speed: +speed.toFixed(2),
      x: +ox.toFixed(2), y: +oy.toFixed(2), z: +oz.toFixed(2),
    };
    return true;
  }

  // ---------------------------------------------------------------------- UI
  function setIdleUI() {
    if (ui.launchBtn) {
      ui.launchBtn.classList.remove('aiming');
      ui.launchBtn.textContent = 'Launch bear';
      ui.launchBtn.setAttribute('aria-pressed', 'false');
    }
    if (ui.moveBtn) {
      ui.moveBtn.classList.remove('aiming');
      ui.moveBtn.textContent = 'Move cannon';
      ui.moveBtn.setAttribute('aria-pressed', 'false');
    }
    if (ui.note) ui.note.textContent = DEFAULT_NOTE;
    if (ui.cursor) {
      ui.cursor.classList.remove('aim');
      ui.cursor.classList.remove('move');
    }
    if (ui.hint) ui.hint.textContent = defaultHint;
    if (ui.hideHint) ui.hideHint();
  }

  function setAiming(on) {
    if (!group) return;
    const next = !!on;
    if (next && movingNow()) cancelMove();
    if (next === aiming) return;
    aiming = next;
    aimPointer = null;
    if (aiming) {
      if (ui.launchBtn) {
        ui.launchBtn.classList.add('aiming');
        ui.launchBtn.textContent = 'Cancel aim';
        ui.launchBtn.setAttribute('aria-pressed', 'true');
      }
      if (ui.note) ui.note.textContent = 'Click the table to fire · Esc to exit';
      if (ui.cursor) {
        ui.cursor.classList.remove('move');
        ui.cursor.classList.add('aim');
      }
      if (ui.showHint) {
        ui.showHint(coarse
          ? 'Tap the table to fire · tap Cancel aim to exit'
          : 'Click the table to fire · Esc or Cancel aim to exit');
      }
      aimAtWorld(0.15, -0.25);
    } else {
      hasAim = false;
      if (aimDots) aimDots.visible = false;
      if (aimRing) aimRing.visible = false;
      if (ui.launchBtn) {
        ui.launchBtn.classList.remove('aiming');
        ui.launchBtn.textContent = 'Launch bear';
        ui.launchBtn.setAttribute('aria-pressed', 'false');
      }
      if (ui.note) ui.note.textContent = DEFAULT_NOTE;
      if (ui.cursor) ui.cursor.classList.remove('aim');
      if (ui.hint) ui.hint.textContent = defaultHint;
      if (ui.hideHint) ui.hideHint();
    }
  }

  function toggleAiming(on) {
    if (!group) return false;
    setAiming(on === undefined ? !aiming : !!on);
    return aiming;
  }

  // ------------------------------------------------------------------- input
  function pointerDown(e) {
    if (!group) return false;
    const isPrimary = primary(e);

    if (aiming) {
      if (!isPrimary) { setAiming(false); return false; }
      if (aimPointer !== null) return true;
      aimPointer = e.pointerId;
      updateAimFromScreen(e.clientX, e.clientY);
      return true;
    }

    if (moveMode) {
      if (!isPrimary) { cancelMove(); return false; }
      const p = pointToTable(e.clientX, e.clientY);
      if (p) {
        setPreview(p);
        if (placementValid(current.x, current.z)) finishMove(true);
      }
      return true;
    }

    if (isPrimary && hitCannon(e.clientX, e.clientY)) {
      startMove('drag', e.pointerId);
      return true;
    }
    return false;
  }

  function pointerMove(e) {
    if (aiming && e.pointerId === aimPointer) {
      updateAimFromScreen(e.clientX, e.clientY);
      return true;
    }
    if (dragging && e.pointerId === dragPointer) {
      const p = pointToTable(e.clientX, e.clientY);
      if (p) setPreview(p);
      return true;
    }
    return false;
  }

  function pointerHover(e) {
    if (!group) return;
    if (e.pointerType !== 'mouse' || e.target !== canvas) return;
    if (aiming) {
      if (aimPointer === null) updateAimFromScreen(e.clientX, e.clientY);
    } else if (moveMode) {
      const p = pointToTable(e.clientX, e.clientY);
      if (p) setPreview(p);
    }
  }

  function pointerUp(e) {
    if (aiming && e.pointerId === aimPointer) {
      aimPointer = null;
      if (e.type === 'pointerup' && aiming) fire();
      return;
    }
    if (dragging && e.pointerId === dragPointer) {
      if (e.type === 'pointerup') finishMove(true);
      else finishMove(false);
    }
  }

  // ------------------------------------------------------------------ frame
  function update(dt) {
    if (!group) return;
    recoil *= Math.exp(-7.5 * dt);
    pitch.position.z = -0.085 * recoil;
    flash = Math.max(0, flash - dt * 3.8);
    if (flashRing) {
      if (flash <= 0.002) {
        flashRing.visible = false;
      } else {
        const p = flash;
        flashRing.visible = true;
        flashRing.scale.setScalar(1 + (1 - p) * 2.8);
        flashRing.material.opacity = p * 0.8;
      }
    }
    if (aimRing && aimRing.visible) {
      aimRing.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.06);
    }
    if (moveRing && moveRing.visible) {
      moveRing.material.opacity = 0.55 + Math.sin(performance.now() * 0.007) * 0.12;
    }
  }

  // ------------------------------------------------------------------- debug
  function projectBase() {
    if (!group) return { x: 0, y: 0 };
    return projectWorld(group.position.x, group.position.z);
  }

  function projectWorld(x, z) {
    const v = new THREE.Vector3(x, 0.12, z).project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * innerWidth,
      y: (-v.y * 0.5 + 0.5) * innerHeight,
    };
  }

  function findSpot() {
    const t = table();
    const zs = [t.hz - 1.0, -t.hz + 1.0];
    for (const z of zs) {
      for (let x = -t.hx + 1.0; x <= t.hx - 1.0; x += 0.3) {
        if (placementValid(x, z)) {
          return { x: +x.toFixed(2), z: +z.toFixed(2), screen: projectWorld(x, z) };
        }
      }
    }
    return null;
  }

  function getState() {
    return {
      aiming, hasAim, moving: movingNow(), moveMode, dragging,
      speed: +speed.toFixed(2),
      target: [+target.x.toFixed(2), +target.z.toFixed(2)],
      muzzle: muzzle.toArray().map(v => +v.toFixed(2)),
      position: group ? [+group.position.x.toFixed(2), +group.position.z.toFixed(2)] : null,
      screen: projectBase(),
      valid: previewValid,
      recoil: +recoil.toFixed(2),
      last: lastShot,
    };
  }

  function setMapState(st){
    if (!group) return false;
    if (aiming) setAiming(false);
    if (movingNow()) cancelMove();
    const home = getHome ? getHome() : { x: 0, z: 0 };
    const p = (st && Number.isFinite(st.x) && Number.isFinite(st.z)) ? st : home;
    const c = clampXZ(p.x, p.z);
    current = c;
    group.position.set(c.x, 0, c.z);
    yaw.rotation.y = Math.atan2(-c.x, -c.z);
    pitch.rotation.x = -0.30;
    hasAim = false;
    if (aimDots) aimDots.visible = false;
    if (aimRing) aimRing.visible = false;
    setIdleUI();
    return true;
  }

  function placeAt(x, z) {
    if (!group) return false;
    if (movingNow()) cancelMove();
    const c = clampXZ(x, z);
    if (!placementValid(c.x, c.z)) return false;
    current = c;
    group.position.set(c.x, 0, c.z);
    if (onPlace) onPlace(c.x, c.z);
    if (aiming && hasAim) aimAtWorld(target.x, target.z);
    return true;
  }

  const api = {
    build,
    layout,
    update,
    pointerDown,
    pointerMove,
    pointerHover,
    pointerUp,
    setPosition: placeAt,
    placeAt,
    setMapState,
    toggleAiming,
    setAiming,
    toggleMoveMode,
    startMoveMode: () => startMove('mode'),
    cancelMove,
    aimAt: aimAtWorld,
    fire,
    getPosition: () => current ? { x: current.x, z: current.z } : null,
    getShadow: () => shadowCanvas ? { canvas: shadowCanvas, x: group.position.x, z: group.position.z } : null,
    isAiming: () => aiming,
    isMoving: movingNow,
    state: getState,
    findSpot,
    screenOf: projectWorld,
    get group() { return group; },
  };
  return api;
}
