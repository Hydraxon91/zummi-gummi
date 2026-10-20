// Pinned Khronos glTF Validator adapter. The package is external and optional.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VALIDATOR_VERSION = '2.0.0-dev.3.10';
export const VALIDATOR_PACKAGE = `gltf-validator@${VALIDATOR_VERSION}`;
export const VALIDATOR_SHA1 = '9b09225db864fe3f0a584259f65d087e2213a93a';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DEFAULT_DIRS = [
  join(ROOT, '.dev-shots', 'asset-pipeline', 'validator',
    `gltf-validator-${VALIDATOR_VERSION}`),
  join(ROOT, 'tools', 'asset-pipeline', '.cache',
    `gltf-validator-${VALIDATOR_VERSION}`),
];

export function findValidatorDir(explicit = null) {
  const candidates = [
    explicit,
    process.env.GLTF_VALIDATOR_DIR,
    ...DEFAULT_DIRS,
  ].filter(Boolean);
  for (const directory of candidates) {
    if (existsSync(join(directory, 'module.mjs'))) return directory;
  }
  return null;
}

export async function loadValidator(explicit = null) {
  const directory = findValidatorDir(explicit);
  if (!directory) {
    return {
      status: 'unverified',
      reason: `Pinned ${VALIDATOR_PACKAGE} is not provisioned.`,
      package: VALIDATOR_PACKAGE,
      directory: null,
    };
  }
  try {
    const module = await import(pathToFileURL(join(directory, 'module.mjs')).href);
    return {
      status: 'ready',
      package: VALIDATOR_PACKAGE,
      integrity: VALIDATOR_SHA1,
      directory,
      version: module.version(),
      supportedExtensions: module.supportedExtensions(),
      module,
    };
  } catch (error) {
    return {
      status: 'unverified',
      reason: `Could not load validator: ${error.message}`,
      package: VALIDATOR_PACKAGE,
      directory,
    };
  }
}

export async function validateGlb(bytes, {
  validatorDir = null,
  uri = 'asset.glb',
  externalResourceFunction = undefined,
} = {}) {
  const validator = await loadValidator(validatorDir);
  if (validator.status !== 'ready') return validator;
  try {
    const options = {
      uri,
      format: 'glb',
      writeTimestamp: false,
      maxIssues: 0,
    };
    if (externalResourceFunction) {
      options.externalResourceFunction = externalResourceFunction;
    }
    const report = await validator.module.validateBytes(
      new Uint8Array(bytes), options);
    const counts = report.issues || {};
    const messages = counts.messages || [];
    const errors = counts.numErrors || 0;
    const warnings = counts.numWarnings || 0;
    const infos = counts.numInfos || 0;
    const hints = counts.numHints || 0;
    const unsupported = messages.some(message =>
      message.code === 'UNSUPPORTED_EXTENSION');
    let status = 'pass';
    if (errors) status = 'fail';
    else if (warnings || unsupported) status = 'review';
    return {
      status,
      package: VALIDATOR_PACKAGE,
      integrity: validator.integrity,
      version: validator.version,
      directory: validator.directory,
      supportedExtensions: validator.supportedExtensions,
      counts: { errors, warnings, infos, hints },
      report,
    };
  } catch (error) {
    return {
      status: 'unverified',
      package: VALIDATOR_PACKAGE,
      version: validator.version,
      directory: validator.directory,
      reason: String(error),
    };
  }
}
