// Standard-library GLB inventory for shipped assets.
//
// This is a delivery check, not a Khronos validator: it verifies the GLB
// container and reports counts from the JSON metadata. Geometry transforms,
// material rendering and extension support still need the game-side load check.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function fail(message) {
  throw new Error(`GLB inventory: ${message}`);
}

function readU32(data, offset) {
  if (offset + 4 > data.length) fail('truncated 32-bit field');
  return data.readUInt32LE(offset);
}

function accessorCount(doc, index) {
  const accessor = doc.accessors?.[index];
  if (!accessor || !Number.isInteger(accessor.count) || accessor.count < 1) {
    fail(`invalid accessor ${index}`);
  }
  return accessor.count;
}

function sum(values) {
  return values.every(value => value != null) ? values.reduce((total, value) => total + value, 0) : null;
}

export function inspectGlbBytes(input, { file = '' } = {}) {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (data.length < 20) fail('truncated header');

  const magic = data.toString('ascii', 0, 4);
  const version = readU32(data, 4);
  const declaredLength = readU32(data, 8);
  if (magic !== 'glTF') fail(`bad magic ${JSON.stringify(magic)}`);
  if (version !== 2) fail(`expected GLB 2, got ${version}`);
  if (declaredLength !== data.length) fail(`declared length ${declaredLength} != ${data.length}`);

  const chunks = [];
  let offset = 12;
  while (offset < declaredLength) {
    if (offset + 8 > declaredLength) fail('truncated chunk header');
    const size = readU32(data, offset);
    const kind = readU32(data, offset + 4);
    offset += 8;
    if (size % 4 || offset + size > declaredLength) fail('invalid chunk alignment or length');
    chunks.push({ kind, data: data.subarray(offset, offset + size) });
    offset += size;
  }
  if (!chunks.length || chunks[0].kind !== JSON_CHUNK) fail('first chunk must be JSON');
  if (chunks.filter(chunk => chunk.kind === JSON_CHUNK).length !== 1) fail('expected one JSON chunk');

  let doc;
  try {
    doc = JSON.parse(chunks[0].data.toString('utf8'));
  } catch (error) {
    fail(`invalid JSON chunk: ${error.message}`);
  }
  if (doc.asset?.version !== '2.0') fail('expected glTF asset version 2.0');

  const meshes = doc.meshes || [];
  const primitives = [];
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives || []) {
      const position = primitive.attributes?.POSITION;
      const vertices = position == null ? null : accessorCount(doc, position);
      const indices = primitive.indices == null ? null : accessorCount(doc, primitive.indices);
      const elements = indices == null ? vertices : indices;
      const mode = primitive.mode ?? 4;
      const triangles = mode === 4 && elements != null
        ? (elements % 3 === 0 ? elements / 3 : null)
        : null;
      primitives.push({ vertices, triangles, material: primitive.material ?? null });
    }
  }

  const nodePrimitives = [];
  for (const node of doc.nodes || []) {
    if (!Number.isInteger(node.mesh) || !meshes[node.mesh]) continue;
    for (const primitive of meshes[node.mesh].primitives || []) {
      const position = primitive.attributes?.POSITION;
      const vertices = position == null ? null : accessorCount(doc, position);
      const indices = primitive.indices == null ? null : accessorCount(doc, primitive.indices);
      const elements = indices == null ? vertices : indices;
      const mode = primitive.mode ?? 4;
      const triangles = mode === 4 && elements != null
        ? (elements % 3 === 0 ? elements / 3 : null)
        : null;
      nodePrimitives.push({ vertices, triangles });
    }
  }

  const mins = [];
  const maxs = [];
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives || []) {
      const index = primitive.attributes?.POSITION;
      if (index == null) continue;
      const accessor = doc.accessors?.[index];
      if (Array.isArray(accessor?.min) && accessor.min.length === 3 &&
          Array.isArray(accessor?.max) && accessor.max.length === 3) {
        mins.push(accessor.min);
        maxs.push(accessor.max);
      }
    }
  }
  const bounds = mins.length
    ? {
        min: [0, 1, 2].map(i => Math.min(...mins.map(value => value[i]))),
        max: [0, 1, 2].map(i => Math.max(...maxs.map(value => value[i]))),
        space: 'local POSITION accessors; node transforms not applied',
      }
    : null;

  const skins = (doc.skins || []).map(skin => ({
    name: skin.name || '',
    joints: (skin.joints || []).length,
  }));
  const animations = (doc.animations || []).map(animation => animation.name || '');
  const materials = (doc.materials || []).map(material => material.name || '');
  const externalUris = [
    ...(doc.buffers || []).filter(entry => entry.uri && !entry.uri.startsWith('data:')).map(entry => entry.uri),
    ...(doc.images || []).filter(entry => entry.uri && !entry.uri.startsWith('data:')).map(entry => entry.uri),
  ];
  const bin = chunks.find(chunk => chunk.kind === BIN_CHUNK);

  return {
    file,
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    assetVersion: doc.asset.version,
    generator: doc.asset.generator || '',
    binChunkBytes: bin ? bin.data.length : 0,
    nodeCount: (doc.nodes || []).length,
    meshCount: meshes.length,
    meshNames: meshes.map(mesh => mesh.name || ''),
    primitiveCount: primitives.length,
    vertices: sum(primitives.map(primitive => primitive.vertices)),
    triangles: sum(primitives.map(primitive => primitive.triangles)),
    nodeVertices: sum(nodePrimitives.map(primitive => primitive.vertices)),
    nodeTriangles: sum(nodePrimitives.map(primitive => primitive.triangles)),
    skinCount: skins.length,
    skins,
    boneCount: skins.reduce((best, skin) => Math.max(best, skin.joints), 0),
    animationCount: animations.length,
    animationNames: animations,
    materialCount: materials.length,
    materialNames: materials,
    imageCount: (doc.images || []).length,
    extensionsUsed: [...(doc.extensionsUsed || [])],
    extensionsRequired: [...(doc.extensionsRequired || [])],
    externalUris,
    bounds,
  };
}

export function inspectGlb(path) {
  return inspectGlbBytes(readFileSync(path), { file: basename(path) });
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node scripts/glb-inventory.mjs <file.glb>');
    process.exit(1);
  }
  console.log(JSON.stringify(inspectGlb(path), null, 2));
}
