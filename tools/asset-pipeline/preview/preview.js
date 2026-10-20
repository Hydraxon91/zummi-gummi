import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const params = new URLSearchParams(location.search);
const assetParam = params.get('asset') || 'assets/MSN_Figure/msn.glb';
const asset = /^(?:https?:)?\//.test(assetParam) ? assetParam : `/${assetParam}`;
const initialLight = params.get('light') === 'night' ? 'night' : 'day';
const initialClip = params.get('clip') || '';
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
  35, window.innerWidth / window.innerHeight, 0.01, 1000);
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
let mixer = null;
let clips = [];
let bounds = null;
let center = new THREE.Vector3();
let radius = 1;
let frameCount = 0;
let loadError = null;
let currentLight = initialLight;
let ready = false;

function applyLighting(mode) {
  currentLight = mode === 'night' ? 'night' : 'day';
  if (currentLight === 'night') {
    scene.background = new THREE.Color(0x071018);
    scene.environmentIntensity = 0.35;
    renderer.toneMappingExposure = 1.1;
    hemi.intensity = 0.18;
    key.intensity = 0.35;
    fill.intensity = 0.12;
    nightRim.intensity = 2.2;
  } else {
    scene.background = new THREE.Color(0xf2f0ea);
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
  const factor = name === 'near' ? 0.72 : name === 'far' ? 2.4 : 1.15;
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
  if (!mixer) return false;
  mixer.stopAllAction();
  if (!name) return false;
  const clip = clips.find(item => item.name === name);
  if (!clip) return false;
  const action = mixer.clipAction(clip);
  action.reset().play();
  mixer.setTime(0.5);
  mixer.timeScale = 0;
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
    bounds,
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
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
    },
    pageErrors,
    resourceErrors,
    frameCount,
    resources: performance.getEntriesByType('resource').map(entry => entry.name),
  };
}

window.__preview = {
  setLighting: applyLighting,
  setView,
  setClip,
  renderNow,
  report,
};

applyLighting(initialLight);
status.textContent = `loading ${asset}`;

const manager = new THREE.LoadingManager();
manager.onError = url => resourceErrors.push(String(url));
const loader = new GLTFLoader(manager);
loader.loadAsync(asset).then(gltf => {
  model = gltf.scene;
  clips = gltf.animations || [];
  const extensions = gltf.parser?.json || {};
  model.userData.extensionsUsed = extensions.extensionsUsed || [];
  model.userData.extensionsRequired = extensions.extensionsRequired || [];
  scene.add(model);
  computeBounds();
  if (clips.length && initialClip) {
    mixer = new THREE.AnimationMixer(model);
    setClip(initialClip);
  }
  setView(params.get('view') || 'three_quarter');
  renderer.render(scene, camera);
  ready = true;
  status.textContent = `${asset}\n${meshCountText()} meshes, ${clips.length} clips`;
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
  if (mixer && mixer.timeScale !== 0) mixer.update(delta);
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
