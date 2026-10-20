import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const params = new URLSearchParams(location.search);
const assetParam = params.get('asset') || 'assets/MSN_Figure/msn.glb';
const asset = /^(?:https?:)?\//.test(assetParam) ? assetParam : `/${assetParam}`;
const initialLight = params.get('light') === 'night' ? 'night' : 'day';
const initialClip = params.get('clip') || '';
const viewFov = Number(params.get('fov')) || 35;
const nearFactor = Number(params.get('nearFactor')) || 0.72;
const farFactor = Number(params.get('farFactor')) || 2.4;
const viewMargin = Number(params.get('margin')) || 1.15;
const backdropMode = params.get('backdrop') === 'checker' ? 'checker' : 'solid';
const requestedInstances = Math.max(1, Math.min(64,
  Number(params.get('instances')) || 1));
const status = document.getElementById('status');
const pageErrors = [];
const resourceErrors = [];
const originalError = console.error.bind(console);

window.addEventListener('error', event => {
  pageErrors.push(event.message || String(event.error || 'window error'));
});
window.addEventListener('unhandledrejection', event => {
  pageErrors.push(String(event.reason || 'unhandled rejection'));
});
console.error = (...args) => {
  pageErrors.push(args.map(String).join(' '));
  originalError(...args);
};

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.debug.checkShaderErrors = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  viewFov, window.innerWidth / window.innerHeight, 0.01, 1000);
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = environment;
scene.environmentIntensity = 1.0;

const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1.6);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(4, 6, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0x9bbdff, 0.6);
fill.position.set(-4, 2, -4);
scene.add(fill);
const nightRim = new THREE.PointLight(0x68dcff, 0, 14);
nightRim.position.set(0, 3, -4);
scene.add(nightRim);

let model = null;
let mixers = [];
let clips = [];
let bounds = null;
let center = new THREE.Vector3();
let radius = 1;
let frameCount = 0;
let loadError = null;
let currentLight = initialLight;
let ready = false;
let instanceCount = 1;

function makeBackdrop(night) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const size = 32;
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      const dark = ((x / size) + (y / size)) % 2 === 0;
      if (night) context.fillStyle = dark ? '#101a26' : '#24384a';
      else context.fillStyle = dark ? '#d9e0e6' : '#f7f3e9';
      context.fillRect(x, y, size, size);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const dayBackdrop = makeBackdrop(false);
const nightBackdrop = makeBackdrop(true);

function applyLighting(mode) {
  currentLight = mode === 'night' ? 'night' : 'day';
  const backdrop = currentLight === 'night' ? nightBackdrop : dayBackdrop;
  if (currentLight === 'night') {
    scene.background = backdropMode === 'checker'
      ? backdrop : new THREE.Color(0x071018);
    scene.environmentIntensity = 0.35;
    renderer.toneMappingExposure = 1.1;
    hemi.intensity = 0.18;
    key.intensity = 0.35;
    fill.intensity = 0.12;
    nightRim.intensity = 2.2;
  } else {
    scene.background = backdropMode === 'checker'
      ? backdrop : new THREE.Color(0xf2f0ea);
    scene.environmentIntensity = 1.0;
    renderer.toneMappingExposure = 1.0;
    hemi.intensity = 1.6;
    key.intensity = 2.2;
    fill.intensity = 0.6;
    nightRim.intensity = 0;
  }
  renderer.render(scene, camera);
}

function computeBounds() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;
  bounds = {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: box.getSize(new THREE.Vector3()).toArray(),
  };
  center = box.getCenter(new THREE.Vector3());
  radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0.01);
}

function setView(name = 'front') {
  const direction = {
    front: [0, 0, 1],
    back: [0, 0, -1],
    left: [-1, 0, 0],
    right: [1, 0, 0],
    top: [0, 1, 0.001],
    bottom: [0, -1, 0.001],
    three_quarter: [0.65, 0.25, 0.75],
    near: [0, 0.08, 1],
    far: [0, 0.12, 1],
  }[name] || [0, 0, 1];
  const factor = name === 'near' ? nearFactor
    : name === 'far' ? farFactor : viewMargin;
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)))
    * factor;
  const offset = new THREE.Vector3(...direction).normalize().multiplyScalar(distance);
  camera.position.copy(center).add(offset);
  camera.near = Math.max(0.001, radius * 0.01);
  camera.far = Math.max(100, radius * 80);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function setClip(name) {
  if (!mixers.length) return false;
  for (const mixer of mixers) mixer.stopAllAction();
  if (!name) return false;
  const clip = clips.find(item => item.name === name);
  if (!clip) return false;
  for (const mixer of mixers) {
    const action = mixer.clipAction(clip);
    action.reset().play();
    mixer.setTime(0.5);
    mixer.timeScale = 0;
  }
  renderer.render(scene, camera);
  return true;
}

function renderNow() {
  renderer.render(scene, camera);
  frameCount += 1;
  return frameCount;
}

function materialRecord(material) {
  const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
    'emissiveMap', 'alphaMap', 'aoMap'];
  return {
    name: material.name || '',
    type: material.type,
    transparent: !!material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    roughness: material.roughness,
    metalness: material.metalness,
    transmission: material.transmission ?? null,
    ior: material.ior ?? null,
    thickness: material.thickness ?? null,
    emissive: material.emissive ? '#' + material.emissive.getHexString() : null,
    emissiveIntensity: material.emissiveIntensity ?? null,
    maps: maps.filter(key => !!material[key]),
  };
}

function report() {
  const materials = [];
  const seen = new Set();
  const textures = new Set();
  let meshCount = 0;
  let boneCount = 0;
  if (model) {
    model.traverse(object => {
      if (object.isMesh) {
        meshCount += 1;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          if (material && !seen.has(material.uuid)) {
            seen.add(material.uuid);
            materials.push(materialRecord(material));
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
              'emissiveMap', 'alphaMap', 'aoMap']) {
              if (material[key]) textures.add(material[key].uuid);
            }
          }
        }
      }
      if (object.isSkinnedMesh && object.skeleton?.bones) {
        boneCount = Math.max(boneCount, object.skeleton.bones.length);
      }
    });
  }
  const context = renderer.getContext();
  return {
    ready,
    error: loadError,
    asset,
    light: currentLight,
    backdrop: backdropMode,
    instances: instanceCount,
    bounds,
    camera: {
      fov: camera.fov,
      position: camera.position.toArray(),
      target: center.toArray(),
      near: camera.near,
      far: camera.far,
      viewport: [window.innerWidth, window.innerHeight],
    },
    inventory: {
      meshCount,
      materialCount: materials.length,
      boneCount,
      animationCount: clips.length,
      animationNames: clips.map(clip => clip.name),
      textureCount: textures.size,
      rendererTextures: renderer.info.memory.textures,
      geometryCount: renderer.info.memory.geometries,
    },
    materials,
    extensionsUsed: model?.userData?.extensionsUsed || [],
    extensionsRequired: model?.userData?.extensionsRequired || [],
    renderer: {
      programs: renderer.info.programs?.length ?? 0,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      glError: context.getError(),
      vendor: context.getParameter(context.VENDOR),
      renderer: context.getParameter(context.RENDERER),
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
    },
    pageErrors,
    resourceErrors,
    frameCount,
    resources: performance.getEntriesByType('resource').map(entry => entry.name),
  };
}

function benchmark(frames = 20) {
  const count = Math.max(1, Math.min(120, Number(frames) || 20));
  const start = performance.now();
  for (let index = 0; index < count; index += 1) {
    renderer.render(scene, camera);
  }
  const elapsedMs = performance.now() - start;
  return {
    frames: count,
    elapsedMs,
    averageMs: elapsedMs / count,
    note: 'CPU submission timing only; not a real frame rate or GPU completion time.',
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
  };
}

window.__preview = {
  setLighting: applyLighting,
  setView,
  setClip,
  renderNow,
  benchmark,
  report,
};

applyLighting(initialLight);
status.textContent = `loading ${asset}`;

const manager = new THREE.LoadingManager();
manager.onError = url => resourceErrors.push(String(url));
const loader = new GLTFLoader(manager);
loader.loadAsync(asset).then(gltf => {
  clips = gltf.animations || [];
  const extensions = gltf.parser?.json || {};
  const source = gltf.scene;
  const sourceBox = new THREE.Box3().setFromObject(source);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const spacing = Math.max(sourceSize.x, sourceSize.z, 0.5) * 1.4;
  const columns = Math.ceil(Math.sqrt(requestedInstances));
  model = new THREE.Group();
  model.userData.extensionsUsed = extensions.extensionsUsed || [];
  model.userData.extensionsRequired = extensions.extensionsRequired || [];
  for (let index = 0; index < requestedInstances; index += 1) {
    const instance = index === 0 ? source : cloneSkeleton(source);
    const column = index % columns;
    const row = Math.floor(index / columns);
    instance.position.set(
      (column - (columns - 1) / 2) * spacing,
      0,
      (row - (Math.ceil(requestedInstances / columns) - 1) / 2) * spacing);
    model.add(instance);
    if (clips.length) mixers.push(new THREE.AnimationMixer(instance));
  }
  instanceCount = requestedInstances;
  scene.add(model);
  computeBounds();
  if (clips.length && initialClip) setClip(initialClip);
  setView(params.get('view') || 'three_quarter');
  renderer.render(scene, camera);
  ready = true;
  status.textContent = `${asset}\n${meshCountText()} meshes, ${clips.length} clips, ${instanceCount} instance(s)`;
}).catch(error => {
  loadError = String(error?.message || error);
  pageErrors.push(loadError);
  status.textContent = `load failed\n${loadError}`;
});

function meshCountText() {
  let count = 0;
  model?.traverse(object => { if (object.isMesh) count += 1; });
  return count;
}

let last = performance.now();
function animate(now) {
  const delta = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const mixer of mixers) {
    if (mixer.timeScale !== 0) mixer.update(delta);
  }
  renderer.render(scene, camera);
  frameCount += 1;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
});
