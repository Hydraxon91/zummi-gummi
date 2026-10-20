// Pure Phase 2 report contract helpers. No browser, Blender or validator imports.
import { createHash } from 'node:crypto';

export const REPORT_SCHEMA_VERSION = '1.0.0';
export const SECTION_NAMES = [
  'identity',
  'structure',
  'validator',
  'dependencies',
  'clean_import',
  'preview',
  'visual',
  'resources',
];
export const STATUSES = ['pass', 'review', 'fail', 'unverified', 'not_run'];

export function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const GLB_JSON = 0x4e4f534a;
const GLB_BIN = 0x004e4942;

function readGlb(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 20) throw new Error('GLB too short');
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a GLB');
  if (bytes.readUInt32LE(4) !== 2) throw new Error('Expected GLB 2');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB length mismatch');
  let offset = 12;
  let doc = null;
  let bin = null;
  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(offset);
    const kind = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + size > bytes.length) throw new Error('Truncated GLB chunk');
    const chunk = bytes.subarray(offset, offset + size);
    if (kind === GLB_JSON && !doc) doc = JSON.parse(chunk.toString('utf8'));
    if (kind === GLB_BIN && !bin) bin = chunk;
    offset += size;
  }
  if (!doc) throw new Error('GLB has no JSON chunk');
  return { doc, bin: bin || Buffer.alloc(0) };
}

function imageDimensions(data) {
  if (!data || data.length < 24) return null;
  if (data.toString('ascii', 1, 4) === 'PNG'
      && data[0] === 0x89 && data[12] === 0x49 && data[13] === 0x48) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), format: 'png' };
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) { offset += 1; continue; }
      const marker = data[offset + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: data.readUInt16BE(offset + 5),
          width: data.readUInt16BE(offset + 7),
          format: 'jpeg',
        };
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      if (offset + 4 > data.length) break;
      offset += 2 + data.readUInt16BE(offset + 2);
    }
  }
  return null;
}

export function estimateGlbResources(bytes) {
  const { doc, bin } = readGlb(bytes);
  const images = [];
  let decodedTextureBytes = 0;
  const unknown = [];
  for (const [index, image] of (doc.images || []).entries()) {
    let data = null;
    if (Number.isInteger(image.bufferView)) {
      const view = doc.bufferViews?.[image.bufferView];
      if (view && Number.isInteger(view.byteOffset) && Number.isInteger(view.byteLength)) {
        data = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
      } else if (view && Number.isInteger(view.byteLength)) {
        data = bin.subarray(0, view.byteLength);
      }
    }
    const dimensions = imageDimensions(data);
    if (!dimensions) {
      unknown.push({
        index,
        name: image.name || null,
        uri: image.uri || null,
        reason: data ? 'unsupported image header' : 'external or missing image data',
      });
      images.push({ index, name: image.name || null, ...dimensions, bytes: null });
      continue;
    }
    const rgba = dimensions.width * dimensions.height * 4;
    decodedTextureBytes += rgba;
    images.push({
      index,
      name: image.name || null,
      ...dimensions,
      bytes: rgba,
      mipEstimateBytes: Math.ceil(rgba * 4 / 3),
    });
  }
  return {
    geometryBufferBytes: bin.length,
    imageCount: images.length,
    decodedTextureBytes,
    decodedTextureMipEstimateBytes: Math.ceil(decodedTextureBytes * 4 / 3),
    images,
    unknown,
    note: 'Decoded RGBA texture estimates assume 8-bit uncompressed channels; encoded/compressed formats and renderer allocation remain unverified.',
  };
}

export function finding(severity, code, message, extra = {}) {
  if (!['error', 'warning', 'info'].includes(severity)) {
    throw new Error(`Invalid finding severity: ${severity}`);
  }
  return { severity, code, message, ...extra };
}

export function statusFromFindings(findings, { unverified = false } = {}) {
  if (unverified) return 'unverified';
  if (findings.some(item => item.severity === 'error')) return 'fail';
  if (findings.some(item => item.severity === 'warning')) return 'review';
  return 'pass';
}

function normalizeSection(name, section = {}) {
  if (section === null) {
    return { status: 'unverified', findings: [], evidence: [], details: {} };
  }
  const status = section.status || statusFromFindings(section.findings || []);
  if (!STATUSES.includes(status)) {
    throw new Error(`Section ${name} has invalid status: ${status}`);
  }
  return {
    status,
    findings: Array.isArray(section.findings) ? section.findings : [],
    evidence: Array.isArray(section.evidence) ? section.evidence : [],
    details: section.details && typeof section.details === 'object'
      ? section.details : {},
  };
}

export function dispositionFor(sections) {
  const values = Object.values(sections);
  if (values.some(section => section.status === 'fail')) {
    return { status: 'fail', reasons: ['One or more required sections failed.'] };
  }
  if (values.some(section => section.status === 'unverified'
      || section.status === 'not_run')) {
    return { status: 'unverified', reasons: ['One or more sections lack evidence.'] };
  }
  if (values.some(section => section.status === 'review')) {
    return { status: 'review', reasons: ['One or more sections need review.'] };
  }
  return { status: 'pass', reasons: [] };
}

export function createReport({
  tool, asset, sections, captures = [], limits = [], notes = [],
  generatedAt = new Date().toISOString(),
}) {
  const normalized = {};
  for (const name of SECTION_NAMES) {
    normalized[name] = normalizeSection(name, sections[name]);
  }
  const allFindings = SECTION_NAMES.flatMap(name =>
    normalized[name].findings.map(item => ({ ...item, section: name })));
  const report = {
    schema_version: REPORT_SCHEMA_VERSION,
    tool: tool || { name: 'asset-pipeline-verify', version: '0.1.0' },
    generated_at: generatedAt,
    asset: asset || {},
    sections: normalized,
    captures,
    findings: allFindings,
    disposition: dispositionFor(normalized),
    limits,
    notes,
  };
  validateReport(report);
  return report;
}

export function validateReport(report) {
  if (!report || typeof report !== 'object') throw new Error('Report must be an object');
  if (report.schema_version !== REPORT_SCHEMA_VERSION) {
    throw new Error(`Unexpected report schema_version: ${report.schema_version}`);
  }
  if (!report.asset || typeof report.asset !== 'object') {
    throw new Error('Report asset must be an object');
  }
  for (const name of SECTION_NAMES) {
    const section = report.sections?.[name];
    if (!section) throw new Error(`Report missing section: ${name}`);
    if (!STATUSES.includes(section.status)) {
      throw new Error(`Report section ${name} has invalid status`);
    }
  }
  if (!report.disposition || !STATUSES.includes(report.disposition.status)) {
    throw new Error('Report disposition is invalid');
  }
  for (const capture of report.captures || []) {
    if (!capture.path || !capture.sha256) {
      throw new Error('Every capture needs path and sha256');
    }
  }
  return true;
}

export function normalizeInventory(inventory, source) {
  if (!inventory || typeof inventory !== 'object') {
    throw new Error(`${source} inventory is not an object`);
  }
  if (source === 'node') {
    return {
      vertices: inventory.vertices ?? null,
      triangles: inventory.triangles ?? null,
      materialCount: inventory.materialCount ?? null,
      imageCount: inventory.imageCount ?? null,
      skinCount: inventory.skinCount ?? null,
      animationCount: inventory.animationCount ?? null,
      extensionsUsed: inventory.extensionsUsed ?? [],
      externalUris: inventory.externalUris ?? [],
      sha256: inventory.sha256 ?? null,
      bytes: inventory.bytes ?? null,
    };
  }
  return {
    vertices: inventory.unique_mesh_primitive_vertices ?? null,
    triangles: inventory.unique_mesh_primitive_triangles ?? null,
    materialCount: inventory.material_count ?? null,
    imageCount: inventory.image_count ?? null,
    skinCount: inventory.skin_count ?? null,
    animationCount: inventory.animation_count ?? null,
    extensionsUsed: inventory.extensions_used ?? [],
    externalUris: inventory.external_uris ?? [],
    sha256: null,
    bytes: inventory.bytes ?? null,
  };
}

export function compareInventories(nodeInventory, pythonInventory) {
  const node = normalizeInventory(nodeInventory, 'node');
  const python = normalizeInventory(pythonInventory, 'python');
  const keys = [
    'vertices', 'triangles', 'materialCount', 'imageCount',
    'skinCount', 'animationCount',
  ];
  const mismatches = [];
  for (const key of keys) {
    if (node[key] !== python[key]) {
      mismatches.push({ key, node: node[key], python: python[key] });
    }
  }
  const nodeExtensions = [...node.extensionsUsed].sort();
  const pythonExtensions = [...python.extensionsUsed].sort();
  if (JSON.stringify(nodeExtensions) !== JSON.stringify(pythonExtensions)) {
    mismatches.push({
      key: 'extensionsUsed',
      node: nodeExtensions,
      python: pythonExtensions,
    });
  }
  const nodeExternal = [...node.externalUris].sort();
  const pythonExternal = [...python.externalUris].sort();
  if (JSON.stringify(nodeExternal) !== JSON.stringify(pythonExternal)) {
    mismatches.push({
      key: 'externalUris',
      node: nodeExternal,
      python: pythonExternal,
    });
  }
  return { node, python, mismatches, agreement: mismatches.length === 0 };
}

export function sectionWithStatus({ status, details = {}, evidence = [], findings = [] }) {
  return { status, details, evidence, findings };
}
