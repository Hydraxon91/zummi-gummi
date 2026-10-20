// Phase 2 unified export-verification coordinator.
//
// This is a verification tool, not an exporter, loader or validator replacement.
// It never edits the source GLB, the game tree or the live Blender scene.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectGlbBytes } from '../../../scripts/glb-inventory.mjs';
import {
  compareInventories, createReport, estimateGlbResources, finding, hashBytes,
  sectionWithStatus,
} from './verification_report.mjs';
import { VALIDATOR_PACKAGE, validateGlb } from './validator.mjs';
import { capturePreview } from './preview_capture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SKILL_GLB_REPORT = join(
  ROOT, '.opencode', 'skills', 'gummy-3d-authoring', 'scripts', 'glb_report.py');
const CLEAN_IMPORT = join(
  ROOT, 'tools', 'asset-pipeline', 'scripts', 'clean_import.py');
const DEFAULT_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';

function parseArgs(argv) {
  const args = {
    glb: null,
    out: null,
    profile: null,
    provenance: null,
    manifest: null,
    visualReview: null,
    expectedSha256: null,
    validatorDir: null,
    baseUrl: process.env.PREVIEW_BASE_URL || '',
    skipPreview: false,
    skipCleanImport: false,
    blender: process.env.BLENDER || DEFAULT_BLENDER,
    views: 'front,back,left,right,three_quarter,near,far',
    lights: 'day,night',
    clip: '',
    width: 1440,
    height: 900,
    fov: 35,
    nearFactor: 0.72,
    farFactor: 2.4,
    margin: 1.15,
    instances: 1,
    backdrop: 'solid',
    timeout: 90000,
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (name === 'skipPreview' || name === 'skipCleanImport' || name === 'strict') {
      args[name] = true;
    } else if (['width', 'height', 'timeout', 'fov', 'nearFactor',
      'farFactor', 'margin', 'instances'].includes(name)) {
      args[name] = Number(argv[index + 1]);
      index += 1;
    } else if (name in args) {
      args[name] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function runPythonInventory(glb) {
  if (!existsSync(SKILL_GLB_REPORT)) {
    return { status: 'unverified', reason: `Missing ${SKILL_GLB_REPORT}` };
  }
  const result = spawnSync('python3', [SKILL_GLB_REPORT, glb], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      status: 'unverified',
      reason: (result.stderr || result.stdout || 'python inventory failed').slice(0, 2000),
    };
  }
  try {
    return { status: 'pass', inventory: JSON.parse(result.stdout) };
  } catch (error) {
    return { status: 'unverified', reason: `invalid inventory JSON: ${error.message}` };
  }
}

function runCleanImport({ glb, out, blender }) {
  if (!existsSync(blender)) {
    return { status: 'unverified', reason: `Blender not found: ${blender}` };
  }
  const cleanOut = join(out, 'clean-import.json');
  const result = spawnSync(blender, [
    '--background', '--factory-startup', '--python-exit-code', '1',
    '--python', CLEAN_IMPORT, '--', '--glb', glb, '--out', cleanOut,
  ], {
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
    timeout: 180000,
  });
  if (!existsSync(cleanOut)) {
    return {
      status: 'unverified',
      reason: (result.stderr || result.stdout || 'Blender produced no report').slice(0, 3000),
    };
  }
  try {
    return { status: 'pass', report: JSON.parse(readFileSync(cleanOut, 'utf8')) };
  } catch (error) {
    return { status: 'unverified', reason: `invalid clean-import JSON: ${error.message}` };
  }
}

function sectionFromCleanImport(clean) {
  if (clean.status !== 'pass') {
    return sectionWithStatus({
      status: 'unverified',
      details: { reason: clean.reason },
      findings: [finding('warning', 'clean_import_unverified', clean.reason)],
    });
  }
  const report = clean.report;
  return sectionWithStatus({
    status: report.status,
    details: {
      counts: report.counts || null,
      bounds: report.bounds || null,
      actions: report.actions || [],
      materials: report.materials || [],
      images: report.images || [],
    },
    evidence: ['clean-import.json'],
    findings: report.findings || [],
  });
}

function compareCleanImport(section, nodeInventory) {
  if (section.status !== 'pass' || !nodeInventory) return section;
  const counts = section.details.counts || {};
  const checks = [
    ['meshes', counts.meshes, nodeInventory.meshCount],
    ['materials', counts.materials, nodeInventory.materialCount],
    ['images', counts.images, nodeInventory.imageCount],
    ['skins', counts.armatures, nodeInventory.skinCount],
    ['animations', counts.actions, nodeInventory.animationCount],
  ];
  const mismatches = checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(([key, actual, expected]) => ({ key, clean: actual, inventory: expected }));
  if (mismatches.length) {
    section.status = 'review';
    section.findings.push(finding('warning', 'clean_import_count_mismatch',
      `Clean import and GLB inventory disagree: ${JSON.stringify(mismatches)}`));
  }
  return section;
}

function sectionFromPreview(preview, captures) {
  if (!preview) {
    return sectionWithStatus({
      status: 'not_run',
      details: { reason: 'Preview was skipped.' },
      findings: [finding('warning', 'preview_not_run',
        'No standalone three.js preview was captured.')],
    });
  }
  const findings = [];
  if (preview.status === 'fail') {
    findings.push(finding('error', 'preview_failed',
      preview.reason || 'Preview failed to load the asset.'));
  } else if (preview.status !== 'pass') {
    findings.push(finding('warning', 'preview_review',
      preview.reason || 'Preview completed with review items.'));
  }
  return sectionWithStatus({
    status: preview.status,
    details: {
      report: preview.report,
      benchmark: preview.benchmark || null,
      pageErrors: preview.pageErrors || [],
      captures: captures.length,
    },
    evidence: captures.map(capture => capture.path),
    findings,
  });
}

export function visualSection(captures, review) {
  if (!captures.length) {
    return sectionWithStatus({
      status: 'not_run',
      details: {
        inspection: 'not_performed',
        captures: 0,
        note: 'No captures exist to inspect.',
      },
      evidence: [],
      findings: [finding('warning', 'visual_capture_missing',
        'No captures exist, so visual inspection cannot pass.')],
    });
  }
  if (!review) {
    return sectionWithStatus({
      status: 'review',
      details: {
        inspection: 'not_performed',
        captures: captures.length,
        note: 'Capture files are evidence candidates; a human or separate visual check must inspect them.',
      },
      evidence: captures.map(capture => capture.path),
      findings: [finding('warning', 'visual_inspection_pending',
        'Captures exist but were not visually inspected by this automated report.')],
    });
  }
  const reviewed = Array.isArray(review.captures) ? review.captures : [];
  const byPath = new Map(captures.map(capture => [capture.path, capture]));
  const findings = [];
  if (!review.inspected) {
    findings.push(finding('warning', 'visual_inspection_not_recorded',
      'Visual review did not declare that inspection was performed.'));
  }
  if (review.status === 'review') {
    findings.push(finding('warning', 'visual_review_flagged',
      review.notes?.join(' ') || 'Visual review flagged residual issues.'));
  } else if (review.status === 'fail') {
    findings.push(finding('error', 'visual_review_failed',
      review.notes?.join(' ') || 'Visual review failed.'));
  }
  for (const entry of reviewed) {
    const capture = byPath.get(entry.path);
    if (!capture) {
      findings.push(finding('error', 'visual_capture_unknown',
        `Visual review references an unknown capture: ${entry.path}`));
    } else if (!entry.sha256) {
      findings.push(finding('error', 'visual_capture_hash_missing',
        `Visual review entry lacks a SHA-256: ${entry.path}`));
    } else if (entry.sha256 !== capture.sha256) {
      findings.push(finding('error', 'visual_capture_hash_mismatch',
        `Visual review hash for ${entry.path} does not match the capture.`));
    }
  }
  const reviewedPaths = new Set(reviewed.map(entry => entry.path));
  const missing = captures.filter(capture => !reviewedPaths.has(capture.path));
  if (missing.length) {
    findings.push(finding('warning', 'visual_capture_unreviewed',
      `${missing.length} captures are not listed in the visual review.`));
  }
  const status = findings.some(item => item.severity === 'error') ? 'fail'
    : findings.length ? 'review' : 'pass';
  return sectionWithStatus({
    status,
    details: {
      inspection: review.inspected ? 'performed' : 'not_performed',
      reviewer: review.reviewer || null,
      notes: review.notes || [],
      captures: captures.length,
      reviewed: reviewed.length,
    },
    evidence: reviewed.map(entry => entry.path),
    findings,
  });
}

function resourceSection({
  nodeInventory, pythonInventory, preview, bytes, resourceEstimate,
}) {
  const details = {
    downloadBytes: bytes,
    binChunkBytes: nodeInventory?.binChunkBytes ?? null,
    imageCount: nodeInventory?.imageCount ?? pythonInventory?.image_count ?? null,
    resourceEstimate: resourceEstimate || null,
    previewRenderer: preview?.report?.renderer || null,
    previewInventory: preview?.report?.inventory || null,
  };
  const hasPreview = preview
    && ['pass', 'review', 'fail'].includes(preview.status);
  return sectionWithStatus({
    status: hasPreview ? 'review' : 'unverified',
    details,
    evidence: [],
    findings: [finding('info', 'resource_estimates_advisory',
      'File bytes and renderer counters are reported; they are not measured VRAM or transfer cost.')],
  });
}

function compareManifest(manifest, inventory) {
  if (!manifest || !inventory) return [];
  const checks = [
    ['meshCount', inventory.meshCount],
    ['materialCount', inventory.materialCount],
    ['imageCount', inventory.imageCount],
    ['skinCount', inventory.skinCount],
    ['animationCount', inventory.animationCount],
    ['vertices', inventory.vertices],
    ['triangles', inventory.triangles],
    ['bytes', inventory.bytes],
  ];
  return checks
    .filter(([key, actual]) => manifest[key] !== undefined && manifest[key] !== actual)
    .map(([key, actual]) => finding('warning', 'manifest_inventory_mismatch',
      `Manifest ${key} is ${manifest[key]}, inventory is ${actual}.`));
}

function provenanceDetails(provenance, glbSha256) {
  if (!provenance) {
    return {
      section: sectionWithStatus({
        status: 'review',
        details: { linked: false },
        findings: [finding('warning', 'provenance_missing',
          'No provenance record was supplied.')],
      }),
    };
  }
  const exportSha = provenance.export?.sha256 || null;
  const findings = [];
  if (!exportSha) {
    findings.push(finding('warning', 'provenance_hash_missing',
      'Provenance has no export SHA-256, so linkage cannot be verified.'));
  } else if (exportSha !== glbSha256) {
    findings.push(finding('error', 'provenance_hash_mismatch',
      `Provenance export hash ${exportSha} does not match ${glbSha256}.`));
  }
  const linked = exportSha === glbSha256;
  const status = findings.some(item => item.severity === 'error')
    ? 'fail' : findings.length ? 'review' : 'pass';
  return {
    section: sectionWithStatus({
      status,
      details: { linked, exportSha, glbSha256 },
      evidence: ['provenance.json'],
      findings,
    }),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.glb) throw new Error('--glb is required');
  const glb = resolve(args.glb);
  if (!existsSync(glb)) throw new Error(`GLB not found: ${glb}`);
  const bytes = readFileSync(glb);
  const sha256 = hashBytes(bytes);
  if (!args.out) {
    args.out = join(ROOT, '.dev-shots', 'asset-pipeline', 'verify',
      sha256.slice(0, 12));
  }
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });

  let profile = null;
  let provenance = null;
  let manifest = null;
  let visualReview = null;
  try { if (args.profile) profile = JSON.parse(readFileSync(args.profile, 'utf8')); }
  catch (error) { throw new Error(`Invalid profile: ${error.message}`); }
  try { if (args.provenance) provenance = JSON.parse(readFileSync(args.provenance, 'utf8')); }
  catch (error) { throw new Error(`Invalid provenance: ${error.message}`); }
  try { if (args.manifest) manifest = JSON.parse(readFileSync(args.manifest, 'utf8')); }
  catch (error) { throw new Error(`Invalid manifest: ${error.message}`); }
  try {
    if (args.visualReview) visualReview = JSON.parse(readFileSync(args.visualReview, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid visual review: ${error.message}`);
  }

  let nodeInventory = null;
  let nodeError = null;
  try {
    nodeInventory = inspectGlbBytes(bytes, { file: basename(glb) });
  } catch (error) {
    nodeError = String(error);
  }
  if (nodeInventory) {
    writeFileSync(join(out, 'node-inventory.json'),
      JSON.stringify(nodeInventory, null, 2));
  }
  const python = runPythonInventory(glb);
  if (python.inventory) {
    writeFileSync(join(out, 'python-inventory.json'),
      JSON.stringify(python.inventory, null, 2));
  }
  const comparison = nodeInventory && python.inventory
    ? compareInventories(nodeInventory, python.inventory)
    : null;
  let resourceEstimate = null;
  try {
    resourceEstimate = estimateGlbResources(bytes);
  } catch (error) {
    resourceEstimate = { error: String(error) };
  }

  const identityFindings = [];
  if (args.expectedSha256 && args.expectedSha256 !== sha256) {
    identityFindings.push(finding('error', 'expected_hash_mismatch',
      `Expected ${args.expectedSha256}, got ${sha256}.`));
  }
  if (manifest) {
    if (manifest.sha256 && manifest.sha256 !== sha256) {
      identityFindings.push(finding('error', 'manifest_hash_mismatch',
        `Manifest SHA-256 ${manifest.sha256} does not match ${sha256}.`));
    }
    if (manifest.bytes !== undefined && manifest.bytes !== bytes.length) {
      identityFindings.push(finding('warning', 'manifest_bytes_mismatch',
        `Manifest bytes ${manifest.bytes} do not match ${bytes.length}.`));
    }
    if (manifest.file && basename(manifest.file) !== basename(glb)) {
      identityFindings.push(finding('warning', 'manifest_file_mismatch',
        `Manifest file ${manifest.file} does not match ${basename(glb)}.`));
    }
  }
  const provenanceResult = provenanceDetails(provenance, sha256);
  identityFindings.push(...provenanceResult.section.findings);

  const structureFindings = [];
  let structureStatus = 'pass';
  if (!nodeInventory) {
    structureStatus = 'fail';
    structureFindings.push(finding('error', 'node_inventory_failed', nodeError));
  }
  if (python.status !== 'pass') {
    structureStatus = structureStatus === 'fail' ? 'fail' : 'unverified';
    structureFindings.push(finding('warning', 'python_inventory_unverified', python.reason));
  } else if (comparison && !comparison.agreement) {
    structureStatus = structureStatus === 'fail' ? 'fail' : 'review';
    structureFindings.push(finding('warning', 'inventory_disagreement',
      `Node and Python inventories disagree: ${JSON.stringify(comparison.mismatches)}`));
  }
  const manifestFindings = compareManifest(manifest, nodeInventory);
  if (manifestFindings.length && structureStatus === 'pass') {
    structureStatus = 'review';
  }
  structureFindings.push(...manifestFindings);

  const validatorResult = await validateGlb(bytes, {
    validatorDir: args.validatorDir,
    uri: basename(glb),
  });
  if (validatorResult.report) {
    writeFileSync(join(out, 'validator.json'),
      JSON.stringify(validatorResult.report, null, 2));
  }
  const validatorFindings = [];
  if (validatorResult.status === 'fail') {
    validatorFindings.push(finding('error', 'validator_errors',
      `${validatorResult.counts?.errors || 0} validator errors.`));
  } else if (validatorResult.status === 'review') {
    validatorFindings.push(finding('warning', 'validator_warnings',
      `${validatorResult.counts?.warnings || 0} validator warnings.`));
  } else if (validatorResult.status === 'unverified') {
    validatorFindings.push(finding('warning', 'validator_unverified',
      validatorResult.reason || 'Validator unavailable.'));
  }

  const extensionsUsed = nodeInventory?.extensionsUsed
    || python.inventory?.extensions_used || [];
  const requiredExtensions = nodeInventory?.extensionsRequired
    || python.inventory?.extensions_required || [];
  const externalUris = nodeInventory?.externalUris
    || python.inventory?.external_uris || [];
  const profileRequired = profile?.web_delivery?.required_extensions || [];
  const missingProfileExtensions = profileRequired.filter(
    extension => !extensionsUsed.includes(extension));
  const dependencyFindings = [];
  if (externalUris.length) {
    dependencyFindings.push(finding('error', 'external_dependency',
      `Self-contained delivery expected, found: ${externalUris.join(', ')}`));
  }
  for (const extension of missingProfileExtensions) {
    dependencyFindings.push(finding('error', 'profile_extension_missing',
      `Profile requires ${extension}, but the GLB does not declare it.`));
  }
  const validatorSupported = validatorResult.supportedExtensions || [];
  for (const extension of requiredExtensions) {
    if (!validatorSupported.includes(extension)) {
      dependencyFindings.push(finding('warning', 'required_extension_unverified',
        `Required extension ${extension} is not in the validator support list.`));
    }
  }

  const clean = args.skipCleanImport
    ? { status: 'unverified', reason: 'Clean import skipped.' }
    : runCleanImport({ glb, out, blender: args.blender });
  const cleanSection = compareCleanImport(
    sectionFromCleanImport(clean), nodeInventory);

  const glbRelative = relative(ROOT, glb).split('\\').join('/');
  let preview = null;
  let captures = [];
  if (!args.skipPreview && args.baseUrl && !glbRelative.startsWith('..')) {
    preview = await capturePreview({
      baseUrl: args.baseUrl,
      asset: glbRelative,
      out: join(out, 'captures'),
      views: args.views,
      lights: args.lights,
      clip: args.clip,
      width: args.width,
      height: args.height,
      fov: args.fov,
      nearFactor: args.nearFactor,
      farFactor: args.farFactor,
      margin: args.margin,
      instances: args.instances,
      backdrop: args.backdrop,
      timeout: args.timeout,
    });
    captures = preview.captures || [];
    writeFileSync(join(out, 'preview.json'),
      JSON.stringify(preview, null, 2));
  } else if (!args.skipPreview && !args.baseUrl) {
    preview = { status: 'not_run', reason: 'No --base-url was supplied.' };
  }

  const sections = {
    identity: sectionWithStatus({
      status: identityFindings.some(item => item.severity === 'error')
        ? 'fail' : identityFindings.some(item => item.severity === 'warning')
          ? 'review' : 'pass',
      details: {
        path: glbRelative,
        sha256,
        bytes: bytes.length,
        expectedSha256: args.expectedSha256,
        profile: profile ? {
          path: resolve(args.profile),
          profile_id: profile.profile_id,
          schema_version: profile.schema_version,
        } : null,
        manifest: manifest ? {
          path: resolve(args.manifest),
          bytes: manifest.bytes,
          sha256: manifest.sha256,
        } : null,
      },
      evidence: ['node-inventory.json'],
      findings: identityFindings,
    }),
    structure: sectionWithStatus({
      status: structureStatus,
      details: {
        node: nodeInventory ? {
          bytes: nodeInventory.bytes,
          sha256: nodeInventory.sha256,
          vertices: nodeInventory.vertices,
          triangles: nodeInventory.triangles,
          materialCount: nodeInventory.materialCount,
          imageCount: nodeInventory.imageCount,
          skinCount: nodeInventory.skinCount,
          animationCount: nodeInventory.animationCount,
          extensionsUsed: nodeInventory.extensionsUsed,
          extensionsRequired: nodeInventory.extensionsRequired,
        } : null,
        python: python.inventory || null,
        agreement: comparison?.agreement ?? null,
        mismatches: comparison?.mismatches || [],
      },
      evidence: ['node-inventory.json', 'python-inventory.json'],
      findings: structureFindings,
    }),
    validator: sectionWithStatus({
      status: validatorResult.status,
      details: {
        package: VALIDATOR_PACKAGE,
        integrity: validatorResult.integrity || null,
        version: validatorResult.version || null,
        directory: validatorResult.directory || null,
        counts: validatorResult.counts || null,
        supportedExtensions: validatorResult.supportedExtensions || [],
        reason: validatorResult.reason || null,
      },
      evidence: validatorResult.report ? ['validator.json'] : [],
      findings: validatorFindings,
    }),
    dependencies: sectionWithStatus({
      status: dependencyFindings.some(item => item.severity === 'error')
        ? 'fail' : dependencyFindings.length ? 'review' : 'pass',
      details: {
        externalUris,
        extensionsUsed,
        requiredExtensions,
        profileRequired,
        missingProfileExtensions,
        emissiveStrengthUsed: extensionsUsed.includes(
          'KHR_materials_emissive_strength'),
        validatorSupportsEmissiveStrength: validatorSupported.includes(
          'KHR_materials_emissive_strength'),
      },
      findings: dependencyFindings,
    }),
    clean_import: cleanSection,
    preview: sectionFromPreview(glbRelative.startsWith('..')
      ? { status: 'not_run', reason: 'GLB is outside the served repository root.' }
      : preview, captures),
    visual: visualSection(captures, visualReview),
    resources: resourceSection({
      nodeInventory, pythonInventory: python.inventory, preview, bytes: bytes.length,
      resourceEstimate,
    }),
  };

  const report = createReport({
    tool: {
      name: 'asset-pipeline-verify',
      version: '0.1.0',
      node: process.version,
      blender: args.blender,
    },
    asset: {
      path: glbRelative,
      sha256,
      bytes: bytes.length,
      profile: sections.identity.details.profile,
      manifest: sections.identity.details.manifest,
      provenance: provenance ? {
        path: resolve(args.provenance),
        status: provenance.status || null,
        asset_id: provenance.asset_id || null,
        linked: provenanceResult.section.details.linked,
      } : null,
      visual_review: visualReview ? resolve(args.visualReview) : null,
    },
    sections,
    captures,
    limits: [
      'A validator pass is conformance evidence, not visual or gameplay acceptance.',
      'A preview pass is standalone three.js compatibility, not full-game integration.',
      'Captures are not proof that a human inspected them.',
      'Texture memory and transfer cost are not measured here.',
      'No compression variant, loader change or production asset is authorized.',
    ],
    notes: [
      'Self-contained GLB delivery is required by this verification pass.',
      'Use a pinned validator directory from provision_validator.mjs.',
    ],
  });
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report: join(out, 'report.json'),
    disposition: report.disposition.status,
    sections: Object.fromEntries(Object.entries(report.sections)
      .map(([key, value]) => [key, value.status])),
    findings: report.findings.length,
  }, null, 2));
  if (args.strict && report.disposition.status === 'fail') process.exitCode = 1;
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
