// Cached immutable GLB sources. Consumers lease a source, clone skeletons and
// materials, and release the lease only after their clone has been removed.
import { fetchAssetManifest, loadManifestedGltf, isAssetPath } from './assets.js';

export function validateAssetCatalog(catalog) {
  if (!catalog || catalog.schema !== 1 || !Array.isArray(catalog.assets)) {
    throw new Error('Unsupported asset catalog');
  }
  const ids = new Set();
  return catalog.assets.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) {
      throw new Error('Missing or duplicate asset id');
    }
    if (entry.kind !== 'gltf' || !isAssetPath(entry.manifest)) {
      throw new Error(`Invalid asset descriptor: ${entry.id}`);
    }
    for (const key of ['groups', 'tags']) {
      if (!Array.isArray(entry[key]) || entry[key].some(value => typeof value !== 'string')) {
        throw new Error(`Invalid asset ${key}: ${entry.id}`);
      }
    }
    ids.add(entry.id);
    return Object.freeze({ ...entry, groups: Object.freeze([...entry.groups]),
      tags: Object.freeze([...entry.tags]) });
  });
}

// Dispose only cached source-owned resources, never a live actor's clone.
export function disposeAssetSource(record) {
  const resources = new Set();
  record.gltf.scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.skeleton) resources.add(object.skeleton);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      resources.add(material);
    }
  });
  for (const resource of resources) resource.dispose();
}

export function disposeInstanceSkeletons(scene) {
  const skeletons = new Set();
  scene.traverse(object => { if (object.skeleton) skeletons.add(object.skeleton); });
  for (const skeleton of skeletons) skeleton.dispose();
}

export function createAssetStore({ catalog, loadCatalog, baseUrl,
  load = async (entry, url) => {
    const manifest = await fetchAssetManifest(url);
    return loadManifestedGltf(manifest, { manifestUrl: url });
  }, dispose = disposeAssetSource } = {}) {
  let definitions = catalog ? validateAssetCatalog(catalog) : null;
  let catalogRequest = null;
  const records = new Map();

  async function entries() {
    if (definitions) return definitions;
    if (!catalogRequest) {
      catalogRequest = Promise.resolve().then(() => loadCatalog()).then(value => {
        definitions = validateAssetCatalog(value);
        return definitions;
      }).catch(error => { catalogRequest = null; throw error; });
    }
    return catalogRequest;
  }

  async function recordFor(id) {
    const entry = (await entries()).find(item => item.id === id);
    if (!entry) throw new Error(`Unknown asset: ${id}`);
    if (!records.has(id)) records.set(id, { id, entry, state: 'unloaded', refs: 0,
      loads: 0, error: null, promise: null, value: null });
    return records.get(id);
  }

  function ensureLoaded(record) {
    if (record.promise) return record.promise;
    record.state = 'loading';
    record.error = null;
    record.loads++;
    record.promise = Promise.resolve().then(() => load(record.entry,
      new URL(record.entry.manifest, baseUrl).href)).then(value => {
      record.value = value;
      record.state = 'ready';
      return value;
    }).catch(error => {
      record.state = 'error';
      record.error = String(error.message || error);
      record.promise = null;
      throw error;
    });
    return record.promise;
  }

  async function acquire(id) {
    // Reserve existing records synchronously so eviction cannot free a source
    // between acquire() and its first promise continuation.
    const record = records.get(id) || await recordFor(id);
    record.refs++;
    try {
      const value = await ensureLoaded(record);
      let released = false;
      return { ...value, release() {
        if (released) return;
        released = true;
        record.refs--;
      } };
    } catch (error) {
      record.refs--;
      throw error;
    }
  }

  async function preloadGroup(group) {
    const selected = (await entries()).filter(entry => entry.groups.includes(group));
    await Promise.all(selected.map(async entry => ensureLoaded(await recordFor(entry.id))));
    return selected.map(entry => entry.id);
  }

  function evictUnused() {
    const evicted = [];
    for (const [id, record] of records) {
      if (record.refs !== 0 || record.state !== 'ready') continue;
      dispose(record.value);
      records.delete(id);
      evicted.push(id);
    }
    return evicted;
  }

  function status() {
    return (definitions || []).map(entry => {
      const record = records.get(entry.id);
      return { id: entry.id, state: record?.state || 'unloaded', refs: record?.refs || 0,
        loads: record?.loads || 0, error: record?.error || null,
        bytes: record?.value?.manifest?.bytes || 0 };
    });
  }

  return { acquire, preloadGroup, evictUnused, status };
}

const catalogUrl = new URL('../assets/catalog.json', import.meta.url);
export const assetStore = createAssetStore({ baseUrl: new URL('.', catalogUrl).href,
  loadCatalog: async () => {
    const response = await fetch(catalogUrl);
    if (!response.ok) throw new Error(`Asset catalog returned ${response.status}`);
    return response.json();
  } });
