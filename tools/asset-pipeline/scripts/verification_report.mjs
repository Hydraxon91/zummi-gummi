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
