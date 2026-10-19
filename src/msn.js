// Studio-only MSN Buddy race prototype.
//
// The GLB is a skinned, authored-animation character, not a Box3D soft body.
// It is deliberately independent of the bear pool, AI and save schema: this
// module owns one display model, its material and its animation mixer.

import * as THREE from 'three';
import { getSpecies } from './species.js';

const GLASS_SPECIES = getSpecies('glass');
const ASSET_URL = new URL('../' + GLASS_SPECIES.asset, import.meta.url).href;
const DEFAULT_OPACITY = 0.55;
const MIN_OPACITY = 0.25;
const DEFAULT_SPEED = 1.0;
const MIN_SPEED = 0.25;
const MAX_SPEED = 2.0;
const RACE_SPOT = { x: 1.62, z: 1.02, yaw: 0 };
const IDLE_CLIP = 'Idle';
const GLASS = {
  clarity: 1,
  roughness: .05,
  thickness: .32,
  ior: 1.45,
  attenuationDistance: 1.8,
  attenuationColor: 0x4f9fc8,
  color: 0xa8e5ff,
  dispersion: .015,
  envMapIntensity: 1.6,
  clearcoat: 1,
  clearcoatRoughness: .04,
  reflectivity: 1,
};

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function makeContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(22,18,12,.46)');
  gradient.addColorStop(.42, 'rgba(22,18,12,.28)');
  gradient.addColorStop(1, 'rgba(22,18,12,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.42, .92),
    new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, toneMapped: false, opacity: .9,
    }),
  );
  mesh.name = 'msnContactShadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .004;
  mesh.renderOrder = 1;
  return mesh;
}

export function createMSNPrototype({ scene, camera, renderer, physics, enabled = true, getTable, look = 'glass' } = {}) {
  const root = new THREE.Group();
  root.name = 'msnRacePrototype';
  root.visible = false;
  root.position.set(RACE_SPOT.x, 0, RACE_SPOT.z);
  root.rotation.y = RACE_SPOT.yaw;
  scene.add(root);

  const holder = new THREE.Group();
  holder.name = 'msnRaceHolder';
  root.add(holder);
  const contactShadow = makeContactShadow();
  root.add(contactShadow);

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(.52, .57, 64),
    new THREE.MeshBasicMaterial({
      color: 0x0d7b76, transparent: true, opacity: .65, depthWrite: false, toneMapped: false,
    }),
  );
  selectionRing.name = 'msnSelectionRing';
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = .006;
  selectionRing.renderOrder = 2;
  selectionRing.visible = false;
  root.add(selectionRing);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const _dragDir = new THREE.Vector3();
  const _dragRight = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _screenPoint = new THREE.Vector3();

  const ui = {
    panel: document.getElementById('raceLab'),
    toggle: document.getElementById('raceLabToggle'),
    clip: document.getElementById('raceClip'),
    mode: document.getElementById('raceMode'),
    opacity: document.getElementById('raceOpacity'),
    opacityValue: document.getElementById('raceOpacityValue'),
    speed: document.getElementById('raceSpeed'),
    speedValue: document.getElementById('raceSpeedValue'),
    reset: document.getElementById('raceReset'),
    frame: document.getElementById('raceFrame'),
    status: document.getElementById('raceStatus'),
    tag: document.getElementById('raceLookTag'),
    opacityLabel: document.getElementById('raceOpacityLabel'),
    roughness: document.getElementById('raceRoughness'),
    roughnessValue: document.getElementById('raceRoughnessValue'),
    drag: document.getElementById('raceDrag'),
  };

  let ready = false;
  let loading = null;
  let error = null;
  let model = null;
  let mixer = null;
  let clips = [];
  let actions = new Map();
  let materials = [];
  let activeAction = null;
  let activeName = '';
  let loop = true;
  let materialLook = look === 'alpha' ? 'alpha' : 'glass';
  let clarity = GLASS.clarity;
  let roughness = GLASS.roughness;
  let opacity = DEFAULT_OPACITY;
  let speed = DEFAULT_SPEED;
  let meshes = 0;
  let bones = 0;
  let tris = 0;
  let height = 0;
  let width = 0;
  let depth = 0;
  let placed = false;
  let panelVisible = false;
  let hitProxy = null;
  let selected = false;
  let hovered = false;
  let activationIndex = 0;
  let dragMode = 'grab';
  let bodyHandle = -1;
  let bodyRadius = .62;
  let grabbing = false;
  let anchored = true;
  let grabDepth = 6;
  let grabStartY = .62;
  let grabStartClientY = 0;
  const bodyPos = new THREE.Vector3();
  const bodyVel = new THREE.Vector3();
  const grabTarget = new THREE.Vector3();
  const grabPrev = new THREE.Vector3();
  const _bodyRead = new Float32Array(7);
  const _bodyForce = new Float32Array(3);
  const _grabPlane = new THREE.Plane();
  const _grabHit = new THREE.Vector3();

  function layout() {
    const table = getTable ? getTable() : null;
    const hx = table && Number.isFinite(table.hx) ? table.hx : 3.4;
    const hz = table && Number.isFinite(table.hz) ? table.hz : 2.4;
    root.position.set(
      clamp(RACE_SPOT.x, -hx + .72, hx - .72),
      0,
      clamp(RACE_SPOT.z, -hz + .55, hz - .55),
    );
    return state();
  }

  function screen() {
    if (!camera || !renderer) return null;
    _screenPoint.set(root.position.x, root.position.y + height * .5, root.position.z).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: ( _screenPoint.x * .5 + .5) * rect.width + rect.left,
      y: (-_screenPoint.y * .5 + .5) * rect.height + rect.top,
      ndc: [+_screenPoint.x.toFixed(3), +_screenPoint.y.toFixed(3)],
    };
  }

  function hitTest(clientX, clientY) {
    if (!ready || !root.visible || !hitProxy || !camera || !renderer) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    root.updateMatrixWorld(true);
    const hits = raycaster.intersectObject(hitProxy, false);
    if (!hits.length) return null;
    return { hit: true, distance: +hits[0].distance.toFixed(3), screen: screen() };
  }

  function hoverAt(clientX, clientY) {
    const hit = hitTest(clientX, clientY);
    hovered = !!hit;
    return hovered;
  }

  function setHovered(value) {
    hovered = !!value && ready && root.visible;
    return hovered;
  }

  function select(value = true) {
    const on = !!value && ready && root.visible;
    selected = on;
    selectionRing.visible = on;
    return state();
  }

  function activate() {
    if (!ready || !root.visible) return { ok: false, reason: 'not ready', state: state() };
    select(true);
    const sequence = ['Nod', 'Wave', 'Cheer'];
    const clip = sequence[activationIndex++ % sequence.length];
    const result = play(clip, true);
    return { ...result, selected: true };
  }

  function drag(clientX, clientY, dx, dy, shift = false) {
    if (!ready || !root.visible) return state();
    if (grabbing) {
      if (shift) root.rotation.y += dx * .012;
      else updateGrabTarget(clientX, clientY);
      root.updateMatrixWorld(true);
      return state();
    }
    if (shift) {
      const table = getTable ? getTable() : null;
      const hx = table && Number.isFinite(table.hx) ? table.hx : 3.4;
      const hz = table && Number.isFinite(table.hz) ? table.hz : 2.4;
      const distance = camera ? camera.position.distanceTo(root.position) : 8;
      const k = clamp(.0012 * distance, .006, .03);
      if (camera) {
        camera.getWorldDirection(_dragDir);
        _dragDir.y = 0;
        if (_dragDir.lengthSq() > 1e-8) {
          _dragDir.normalize();
          _dragRight.crossVectors(_dragDir, _up).normalize();
          root.position.x = clamp(root.position.x + _dragRight.x * dx * k + _dragDir.x * (-dy) * k, -hx + .72, hx - .72);
          root.position.z = clamp(root.position.z + _dragRight.z * dx * k + _dragDir.z * (-dy) * k, -hz + .55, hz - .55);
        }
      }
    } else {
      root.rotation.y += dx * .012;
    }
    root.updateMatrixWorld(true);
    return state();
  }

  function focusInfo() {
    return {
      x: root.position.x,
      y: Math.max(.55, height * .56),
      z: root.position.z,
      dist: 4.8,
      height,
    };
  }

  function ensureBody() {
    if (!physics || bodyHandle >= 0 || !ready || !enabled || !root.visible) return;
    bodyHandle = physics.sphere(
      root.position.x, root.position.y + bodyRadius, root.position.z,
      bodyRadius, 2.4, -777, .72, .10, true, true,
    );
    bodyPos.set(root.position.x, root.position.y + bodyRadius, root.position.z);
    bodyVel.set(0, 0, 0);
    anchored = true;
  }

  function destroyBody() {
    if (bodyHandle >= 0 && physics) physics.destroy(bodyHandle);
    bodyHandle = -1;
    grabbing = false;
    anchored = true;
    bodyVel.set(0, 0, 0);
  }

  function syncAnchoredBody() {
    if (bodyHandle < 0 || !physics) return;
    physics.setPositions([bodyHandle], [root.position.x, root.position.y + bodyRadius, root.position.z], 1);
    physics.setVelocities([bodyHandle], [0, 0, 0], 1);
  }

  function updateGrabTarget(clientX, clientY) {
    if (!camera || !renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    grabTarget.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, grabDepth);
    const table = getTable ? getTable() : null;
    if (table) {
      grabTarget.x = clamp(grabTarget.x, -table.hx + .35, table.hx - .35);
      grabTarget.z = clamp(grabTarget.z, -table.hz + .35, table.hz - .35);
    }
    // Screen-up is a direct lift input; the ray plane alone can stay below the
    // body centre because the studio camera looks down at the table.
    grabTarget.y = clamp(grabStartY + (grabStartClientY - clientY) * .005, .08, 2.6);
  }

  function beginDrag(clientX, clientY, shift = false) {
    if (dragMode !== 'grab' || shift) return false;
    ensureBody();
    if (bodyHandle < 0) return false;
    grabbing = true;
    anchored = false;
    grabDepth = camera ? camera.position.distanceTo(root.position) : 6;
    grabStartY = bodyPos.y;
    grabStartClientY = clientY;
    updateGrabTarget(clientX, clientY);
    grabPrev.copy(grabTarget);
    physics.setVelocities([bodyHandle], [0, 0, 0], 1);
    return true;
  }

  function endDrag() {
    if (!grabbing) return state();
    grabbing = false;
    anchored = false;
    if (bodyHandle >= 0 && physics) {
      const vx = clamp(bodyVel.x, -7, 7);
      const vy = clamp(bodyVel.y, -7, 7);
      const vz = clamp(bodyVel.z, -7, 7);
      physics.setVelocities([bodyHandle], [vx, vy, vz], 1);
    }
    return state();
  }

  function physicsForces() {
    if (bodyHandle < 0 || !physics) return;
    if (anchored && !grabbing) {
      syncAnchoredBody();
      return;
    }
    if (!grabbing) return;
    const dx = grabTarget.x - bodyPos.x;
    const dy = grabTarget.y - bodyPos.y;
    const dz = grabTarget.z - bodyPos.z;
    const mass = 2.4, k = 95 * mass, damp = 14 * mass;
    _bodyForce[0] = dx * k - bodyVel.x * damp;
    _bodyForce[1] = dy * k - bodyVel.y * damp;
    _bodyForce[2] = dz * k - bodyVel.z * damp;
    physics.applyForces([bodyHandle], _bodyForce, true, 1);
  }

  function physicsRead() {
    if (bodyHandle < 0 || !physics) return;
    physics.read([bodyHandle], _bodyRead, 1);
    bodyPos.set(_bodyRead[0], _bodyRead[1], _bodyRead[2]);
    bodyVel.set(_bodyRead[3], _bodyRead[4], _bodyRead[5]);
    const baseY = Math.max(0, bodyPos.y - bodyRadius);
    root.position.set(bodyPos.x, baseY, bodyPos.z);
    contactShadow.position.y = .004 - root.position.y;
    selectionRing.position.y = .006 - root.position.y;
    root.updateMatrixWorld(true);
    if (!grabbing && !anchored && baseY <= .002 && bodyVel.length() < .16) {
      anchored = true;
      root.position.y = 0;
      syncAnchoredBody();
    }
  }

  function state() {
    return {
      enabled: !!enabled,
      species: GLASS_SPECIES.id,
      ready,
      loading: !!loading,
      error: error ? String(error.message || error) : null,
      visible: root.visible,
      panelVisible,
      selected,
      hovered,
      yaw: +root.rotation.y.toFixed(3),
      dragMode,
      body: bodyHandle >= 0,
      grabbing,
      anchored,
      look: materialLook,
      clips: clips.map(clip => clip.name),
      active: activeName,
      loop,
      time: mixer ? +mixer.time.toFixed(3) : 0,
      actionTime: activeAction ? +activeAction.time.toFixed(3) : 0,
      clarity,
      roughness,
      opacity,
      speed,
      meshes,
      bones,
      tris,
      height: +height.toFixed(3),
      width: +width.toFixed(3),
      depth: +depth.toFixed(3),
      position: [+root.position.x.toFixed(2), +root.position.y.toFixed(2), +root.position.z.toFixed(2)],
      material: materials[0] ? {
        color: '#' + materials[0].color.getHexString(),
        transmission: materials[0].transmission,
        transparent: materials[0].transparent,
        opacity: materials[0].opacity,
        roughness: materials[0].roughness,
        thickness: materials[0].thickness,
        ior: materials[0].ior,
        attenuationDistance: materials[0].attenuationDistance,
        attenuationColor: '#' + materials[0].attenuationColor.getHexString(),
        dispersion: materials[0].dispersion,
        envMapIntensity: materials[0].envMapIntensity,
        clearcoat: materials[0].clearcoat,
        clearcoatRoughness: materials[0].clearcoatRoughness,
        reflectivity: materials[0].reflectivity,
        depthWrite: materials[0].depthWrite,
        side: materials[0].side,
      } : null,
    };
  }

  function setStatus(text) {
    if (ui.status) ui.status.textContent = text;
  }

  function syncPanel() {
    if (!ui.panel) return;
    ui.panel.hidden = !(enabled && panelVisible);
  }

  function syncUi() {
    const controlsOn = ready && root.visible;
    const glass = materialLook === 'glass';
    if (ui.clip && clips.length) {
      ui.clip.value = activeName || IDLE_CLIP;
      ui.clip.disabled = !controlsOn;
    }
    if (ui.mode) ui.mode.disabled = !controlsOn;
    if (ui.opacity) {
      ui.opacity.disabled = !controlsOn;
      ui.opacity.min = glass ? '0' : String(MIN_OPACITY);
      ui.opacity.value = String(glass ? clarity : opacity);
    }
    if (ui.opacityLabel) ui.opacityLabel.textContent = glass ? 'Clarity' : 'Opacity';
    if (ui.opacityValue) ui.opacityValue.textContent = (glass ? clarity : opacity).toFixed(2);
    if (ui.roughness) {
      ui.roughness.disabled = !controlsOn;
      ui.roughness.value = String(roughness);
    }
    if (ui.roughnessValue) ui.roughnessValue.textContent = roughness.toFixed(2);
    if (ui.speed) {
      ui.speed.disabled = !controlsOn;
      ui.speed.value = String(speed);
    }
    if (ui.speedValue) ui.speedValue.textContent = speed.toFixed(2) + '×';
    if (ui.tag) ui.tag.textContent = glass ? 'Glass · skinned' : 'Alpha · skinned';
    if (ui.reset) ui.reset.disabled = !controlsOn;
    if (ui.frame) ui.frame.disabled = !controlsOn;
    if (ui.drag) {
      ui.drag.disabled = !controlsOn;
      ui.drag.value = dragMode;
    }
  }

  function fillClipOptions() {
    if (!ui.clip) return;
    ui.clip.textContent = '';
    for (const clip of clips) {
      const option = document.createElement('option');
      option.value = clip.name;
      option.textContent = clip.name;
      ui.clip.appendChild(option);
    }
  }

  function applyMaterial() {
    const glass = materialLook === 'glass';
    for (const material of materials) {
      material.transmission = glass ? clarity : 0;
      material.thickness = glass ? GLASS.thickness : 0;
      material.ior = GLASS.ior;
      material.transparent = glass ? false : opacity < .999;
      material.opacity = glass ? 1 : opacity;
      material.roughness = glass ? roughness : (material.userData.authoredRoughness ?? material.roughness);
      material.metalness = 0;
      material.attenuationDistance = glass ? GLASS.attenuationDistance : Infinity;
      material.attenuationColor.setHex(glass ? GLASS.attenuationColor : 0xffffff);
      material.envMapIntensity = glass ? GLASS.envMapIntensity : 1;
      material.clearcoat = glass ? GLASS.clearcoat : 0;
      material.clearcoatRoughness = glass ? GLASS.clearcoatRoughness : 0;
      material.reflectivity = glass ? GLASS.reflectivity : .5;
      if ('dispersion' in material) material.dispersion = glass ? GLASS.dispersion : 0;
      if (glass) material.color.setHex(GLASS.color);
      else if (material.userData.authoredColor) material.color.copy(material.userData.authoredColor);
      material.depthWrite = true;
      material.needsUpdate = true;
    }
  }

  function setClarity(value) {
    const next = Number(value);
    if (materialLook === 'glass') {
      clarity = clamp(Number.isFinite(next) ? next : GLASS.clarity, 0, 1);
    } else {
      opacity = clamp(Number.isFinite(next) ? next : DEFAULT_OPACITY, MIN_OPACITY, 1);
    }
    applyMaterial();
    syncUi();
    return state();
  }

  function setOpacity(value) {
    return setClarity(value);
  }

  function setRoughness(value) {
    const next = Number(value);
    roughness = clamp(Number.isFinite(next) ? next : GLASS.roughness, .01, .6);
    applyMaterial();
    syncUi();
    return state();
  }

  function setSpeed(value) {
    const next = Number(value);
    speed = clamp(Number.isFinite(next) ? next : DEFAULT_SPEED, MIN_SPEED, MAX_SPEED);
    syncUi();
    return state();
  }

  function play(name, once = false) {
    if (!ready || !mixer) return { ok: false, reason: 'not ready', state: state() };
    const clip = clips.find(item => item.name === name) || clips.find(item => item.name === IDLE_CLIP);
    if (!clip) return { ok: false, reason: 'no clips', state: state() };
    const next = actions.get(clip.name);
    if (!next) return { ok: false, reason: 'no action', state: state() };
    const previous = activeAction;
    loop = !once;
    if (previous && previous !== next) previous.fadeOut(.22);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.fadeIn(.22);
    next.play();
    activeAction = next;
    activeName = clip.name;
    syncUi();
    return { ok: true, clip: activeName, loop, state: state() };
  }

  function setLoop(value) {
    const next = !value;
    if (loop !== next && activeName) return play(activeName, !next);
    loop = next;
    syncUi();
    return state();
  }

  function setVisible(value) {
    const on = !!value && !!enabled;
    layout();
    root.visible = on;
    if (on){
      load();
      ensureBody();
    } else {
      destroyBody();
      hovered = false;
      selected = false;
      selectionRing.visible = false;
      root.position.y = 0;
      contactShadow.position.y = .004;
      selectionRing.position.y = .006;
      if (!ready && !loading) setStatus('MSN hidden — choose Both or MSN to load.');
    }
    syncPanel();
    syncUi();
    return state();
  }

  function setPanelVisible(value) {
    panelVisible = !!value;
    syncPanel();
    return state();
  }

  async function load() {
    if (ready) return state();
    if (loading) return loading;
    error = null;
    setStatus('Loading MSN Buddy…');
    loading = (async () => {
      const started = performance.now();
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(ASSET_URL);
      const source = gltf.scene;
      source.name = 'MSNBuddy';
      const box = new THREE.Box3().setFromObject(source);
      const size = box.getSize(new THREE.Vector3());
      if (Number.isFinite(box.min.y)) source.position.y -= box.min.y;
      height = size.y;
      width = size.x;
      depth = size.z;

      const materialMap = new Map();
      meshes = 0;
      tris = 0;
      bones = 0;
      source.traverse(object => {
        if (object.isSkinnedMesh) bones = Math.max(bones, object.skeleton.bones.length);
        if (!object.isMesh) return;
        meshes++;
        const geometry = object.geometry;
        const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
        tris += Math.floor(count / 3);
        object.castShadow = false;
        object.receiveShadow = false;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        const cloned = list.map(material => {
          if (!material) return material;
          if (!materialMap.has(material)) {
            const copy = material.clone();
            copy.name = material.name + ' · prototype';
            copy.userData.authoredColor = copy.color.clone();
            copy.userData.authoredRoughness = copy.roughness;
            materialMap.set(material, copy);
          }
          return materialMap.get(material);
        });
        object.material = Array.isArray(object.material) ? cloned : cloned[0];
      });
      materials = [...materialMap.values()];

      if (hitProxy){
        hitProxy.removeFromParent();
        hitProxy.geometry.dispose();
        hitProxy.material.dispose();
      }
      hitProxy = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hitProxy.name = 'msnHitProxy';
      hitProxy.position.y = height * .5;
      root.add(hitProxy);

      model = source;
      holder.add(model);
      mixer = new THREE.AnimationMixer(model);
      clips = gltf.animations.slice();
      actions = new Map(clips.map(clip => [clip.name, mixer.clipAction(clip)]));
      mixer.addEventListener('finished', event => {
        if (loop || event.action !== activeAction) return;
        play(IDLE_CLIP, false);
      });
      fillClipOptions();
      ready = true;
      placed = true;
      ensureBody();
      setStatus(`Ready · ${clips.length} clips · ${meshes} meshes · ${tris.toLocaleString()} tris · ${(performance.now() - started).toFixed(0)} ms`);
      applyMaterial();
      play(IDLE_CLIP, false);
      syncUi();
      return state();
    })().catch(err => {
      error = err;
      ready = false;
      setStatus('MSN Buddy failed to load — game continues without it.');
      console.warn('[msn] prototype failed to load:', err);
      return state();
    }).finally(() => {
      loading = null;
      syncPanel();
      syncUi();
    });
    return loading;
  }

  function update(dt) {
    if (!ready || !root.visible || !mixer) return;
    mixer.update(Math.max(0, dt) * speed);
  }

  function reset() {
    layout();
    root.rotation.y = RACE_SPOT.yaw;
    root.position.y = 0;
    contactShadow.position.y = .004;
    selectionRing.position.y = .006;
    selected = false;
    hovered = false;
    selectionRing.visible = false;
    grabbing = false;
    anchored = true;
    syncAnchoredBody();
    setClarity(materialLook === 'glass' ? GLASS.clarity : DEFAULT_OPACITY);
    setRoughness(GLASS.roughness);
    setSpeed(DEFAULT_SPEED);
    loop = true;
    if (ready) play(IDLE_CLIP, false);
    syncUi();
    return state();
  }

  function dispose() {
    destroyBody();
    root.removeFromParent();
    for (const material of materials) material.dispose();
    materials = [];
    const shadow = contactShadow.material;
    if (shadow) {
      if (shadow.map) shadow.map.dispose();
      shadow.dispose();
    }
    contactShadow.geometry.dispose();
    selectionRing.geometry.dispose();
    selectionRing.material.dispose();
    if (hitProxy){
      hitProxy.removeFromParent();
      hitProxy.geometry.dispose();
      hitProxy.material.dispose();
      hitProxy = null;
    }
    ready = false;
    model = null;
    mixer = null;
    clips = [];
    actions.clear();
    activeAction = null;
    activeName = '';
    syncPanel();
  }

  if (ui.clip) {
    ui.clip.addEventListener('change', () => {
      play(ui.clip.value, ui.mode ? ui.mode.value === 'once' : false);
    });
  }
  if (ui.mode) {
    ui.mode.addEventListener('change', () => {
      setLoop(ui.mode.value !== 'once');
    });
  }
  if (ui.opacity) {
    ui.opacity.addEventListener('input', () => setOpacity(ui.opacity.value));
  }
  if (ui.roughness) {
    ui.roughness.addEventListener('input', () => setRoughness(ui.roughness.value));
  }
  if (ui.speed) {
    ui.speed.addEventListener('input', () => setSpeed(ui.speed.value));
  }
  if (ui.reset) {
    ui.reset.addEventListener('click', reset);
  }
  if (ui.drag) {
    ui.drag.addEventListener('change', () => {
      dragMode = ui.drag.value === 'turn' ? 'turn' : 'grab';
      syncUi();
    });
  }
  if (ui.toggle && ui.panel) {
    ui.toggle.addEventListener('click', () => {
      const collapsed = ui.panel.classList.toggle('collapsed');
      ui.toggle.textContent = collapsed ? '+' : '–';
      ui.toggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  applyMaterial();
  setSpeed(speed);
  syncPanel();
  syncUi();

  return {
    root,
    load,
    update,
    layout,
    setVisible,
    setPanelVisible,
    setOpacity,
    setClarity,
    setRoughness,
    setSpeed,
    play,
    setLoop,
    hitTest,
    hoverAt,
    setHovered,
    select,
    activate,
    beginDrag,
    drag,
    endDrag,
    physicsForces,
    physicsRead,
    screen,
    focusInfo,
    reset,
    state,
    dispose,
    get placed() { return placed; },
  };
}
