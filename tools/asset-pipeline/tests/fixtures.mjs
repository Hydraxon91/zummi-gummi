// Small original GLB fixtures for Phase 2 tests.
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function pad4(buffer, fill) {
  const remainder = buffer.length % 4;
  if (!remainder) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}

export function buildGlb(document, bin = Buffer.alloc(0)) {
  const json = pad4(Buffer.from(JSON.stringify(document), 'utf8'), 0x20);
  const binary = pad4(bin, 0);
  const hasBin = binary.length > 0;
  const length = 12 + 8 + json.length + (hasBin ? 8 + binary.length : 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  const chunks = [header, jsonHeader, json];
  if (hasBin) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binary.length, 0);
    binHeader.writeUInt32LE(BIN_CHUNK, 4);
    chunks.push(binHeader, binary);
  }
  return Buffer.concat(chunks, length);
}

function triangleBuffer() {
  const positions = Buffer.alloc(36);
  const values = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  values.forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const indices = Buffer.alloc(8);
  [0, 1, 2].forEach((value, index) => indices.writeUInt16LE(value, index * 2));
  return { bin: Buffer.concat([positions, indices]), positions, indices };
}

function triangleDocument(extra = {}) {
  return {
    asset: { version: '2.0', generator: 'gummy-phase2-fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0,
      }],
    }],
    materials: [{ name: 'Fixture', pbrMetallicRoughness: {} }],
    buffers: [{ byteLength: 44 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    ...extra,
  };
}

export function validTriangleGlb() {
  const { bin } = triangleBuffer();
  return buildGlb(triangleDocument(), bin);
}

export function emissiveTriangleGlb() {
  const { bin } = triangleBuffer();
  const document = triangleDocument({
    materials: [{
      name: 'Emissive Fixture',
      pbrMetallicRoughness: {
        baseColorFactor: [0.1, 0.5, 0.7, 1],
        metallicFactor: 0,
        roughnessFactor: 0.2,
      },
      emissiveFactor: [0, 1, 1],
      extensions: {
        KHR_materials_emissive_strength: { emissiveStrength: 4.0 },
      },
    }],
    extensionsUsed: ['KHR_materials_emissive_strength'],
    extensionsRequired: ['KHR_materials_emissive_strength'],
  });
  return buildGlb(document, bin);
}

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64');

function embeddedImageDocument(binLength) {
  const document = triangleDocument();
  document.buffers[0].byteLength = binLength;
  document.bufferViews.push({
    buffer: 0,
    byteOffset: 44,
    byteLength: ONE_PIXEL_PNG.length,
  });
  document.images = [{ bufferView: 2 }];
  document.textures = [{ source: 0 }];
  document.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  return document;
}

export function embeddedImageGlb() {
  const { bin } = triangleBuffer();
  const combined = Buffer.concat([bin, ONE_PIXEL_PNG]);
  return buildGlb(embeddedImageDocument(combined.length), combined);
}

export function sharedImageBufferViewGlb() {
  const { bin } = triangleBuffer();
  const combined = Buffer.concat([bin, ONE_PIXEL_PNG]);
  const document = embeddedImageDocument(combined.length);
  document.images.push({ bufferView: 2 });
  return buildGlb(document, combined);
}

export function externalImageGlb() {
  const { bin } = triangleBuffer();
  const document = triangleDocument({
    images: [{ uri: 'missing-texture.png' }],
    textures: [{ source: 0 }],
    materials: [{
      name: 'External',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
    }],
  });
  return buildGlb(document, bin);
}

export function unsupportedExtensionGlb() {
  const { bin } = triangleBuffer();
  const document = triangleDocument({
    extensionsUsed: ['EXT_fixture_unknown'],
    extensionsRequired: ['EXT_fixture_unknown'],
  });
  return buildGlb(document, bin);
}

export function invalidAccessorGlb() {
  const { bin } = triangleBuffer();
  const document = triangleDocument();
  document.meshes[0].primitives[0].attributes.POSITION = 99;
  return buildGlb(document, bin);
}

export function malformedGlb() {
  return Buffer.from('this is not a GLB file', 'utf8');
}
