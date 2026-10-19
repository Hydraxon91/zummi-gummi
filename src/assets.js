// Asset manifest validation and GLB loading.
//
// The manifest is the delivery contract between Blender export and the runtime.
// Keep validation pure so tests can run without three.js or a browser.

export const ASSET_MANIFEST_SCHEMA = 1;

const manifestCache = new Map();

function isObj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value, minimum = 0) {
  return Number.isInteger(value) && value >= minimum;
}

export function isAssetPath(value) {
  if (typeof value !== 'string' || !value || /[\\:%?#\s]/.test(value)) return false;
  return value.split('/').every(part => part && part !== '.' && part !== '..');
}

export function validateAssetManifest(manifest) {
  const errors = [];
  if (!isObj(manifest)) return { ok: false, errors: ['manifest is not an object'] };
  if (manifest.schema !== ASSET_MANIFEST_SCHEMA) errors.push(`unsupported manifest schema ${manifest.schema}`);
  if (!isAssetPath(manifest.file)) errors.push('file must be a relative path');
  if (typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(manifest.sha256)) {
    errors.push('sha256 is invalid');
  }
  if (!isCount(manifest.bytes, 1)) errors.push('bytes is invalid');
  if (manifest.assetVersion !== '2.0') errors.push('assetVersion must be 2.0');
  if (!isCount(manifest.meshCount)) errors.push('meshCount is invalid');
  if (!isCount(manifest.vertices)) errors.push('vertices is invalid');
  if (!isCount(manifest.triangles)) errors.push('triangles is invalid');
  if (!isCount(manifest.skinCount)) errors.push('skinCount is invalid');
  if (!isCount(manifest.boneCount)) errors.push('boneCount is invalid');
  if (!isCount(manifest.animationCount)) errors.push('animationCount is invalid');
  if (!isCount(manifest.materialCount)) errors.push('materialCount is invalid');
  for (const key of ['meshNames', 'animationNames', 'materialNames']) {
    if (!Array.isArray(manifest[key]) || manifest[key].some(value => typeof value !== 'string')) {
      errors.push(`${key} is invalid`);
    }
  }
  if (!Array.isArray(manifest.extensionsUsed) || !Array.isArray(manifest.extensionsRequired)) {
    errors.push('extensions are invalid');
  }
  if (!isObj(manifest.bounds) || !Array.isArray(manifest.bounds.min) ||
      !Array.isArray(manifest.bounds.max) ||
      manifest.bounds.min.length !== 3 || manifest.bounds.max.length !== 3 ||
      !manifest.bounds.min.every(Number.isFinite) || !manifest.bounds.max.every(Number.isFinite)) {
    errors.push('bounds are invalid');
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeAssetManifest(manifest) {
  const check = validateAssetManifest(manifest);
  if (!check.ok) throw new Error(`Invalid asset manifest: ${check.errors.slice(0, 3).join('; ')}`);
  return JSON.parse(JSON.stringify(manifest));
}

export async function fetchAssetManifest(url) {
  if (manifestCache.has(url)) return manifestCache.get(url);
  const request = (async () => {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Asset manifest ${url} returned ${response.status}`);
    return normalizeAssetManifest(await response.json());
  })();
  manifestCache.set(url, request);
  try {
    return await request;
  } catch (error) {
    manifestCache.delete(url);
    throw error;
  }
}

export function gltfInventory(gltf) {
  let meshCount = 0;
  let boneCount = 0;
  const materials = new Set();
  if (gltf && gltf.scene && typeof gltf.scene.traverse === 'function') {
    gltf.scene.traverse(object => {
      if (object && object.isMesh) {
        meshCount += 1;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) if (material) materials.add(material);
      }
      if (object && object.isSkinnedMesh && object.skeleton?.bones) {
        boneCount = Math.max(boneCount, object.skeleton.bones.length);
      }
    });
  }
  const animations = Array.isArray(gltf?.animations) ? gltf.animations : [];
  return {
    meshCount,
    boneCount,
    materialCount: materials.size,
    animationCount: animations.length,
    animationNames: animations.map(clip => clip.name || ''),
  };
}

export function verifyGltfAgainstManifest(gltf, manifest) {
  const inventory = gltfInventory(gltf);
  const checks = [
    ['meshCount', inventory.meshCount, manifest.meshCount],
    ['boneCount', inventory.boneCount, manifest.boneCount],
    ['materialCount', inventory.materialCount, manifest.materialCount],
    ['animationCount', inventory.animationCount, manifest.animationCount],
  ];
  for (const [key, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(`Asset manifest mismatch: ${key} is ${actual}, expected ${expected}`);
    }
  }
  return inventory;
}

export async function loadManifestedGltf(manifest, { manifestUrl, load } = {}) {
  const normalized = normalizeAssetManifest(manifest);
  if (!manifestUrl) throw new Error('manifestUrl is required');
  const base = new URL('.', manifestUrl);
  const url = new URL(normalized.file, base).href;
  let loader = load;
  if (!loader) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltfLoader = new GLTFLoader();
    loader = assetUrl => gltfLoader.loadAsync(assetUrl);
  }
  const gltf = await loader(url);
  const inventory = verifyGltfAgainstManifest(gltf, normalized);
  return { gltf, manifest: normalized, inventory, url };
}
