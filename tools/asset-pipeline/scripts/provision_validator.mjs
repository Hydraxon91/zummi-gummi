// Provision the pinned Khronos validator into an external/local scratch cache.
// No root package.json or runtime dependency is created.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  VALIDATOR_PACKAGE,
  VALIDATOR_SHA1,
  VALIDATOR_VERSION,
} from './validator.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const target = process.argv[2] || join(
  ROOT, '.dev-shots', 'asset-pipeline', 'validator',
  `gltf-validator-${VALIDATOR_VERSION}`);

if (existsSync(join(target, 'module.mjs'))) {
  console.log(`validator already provisioned: ${target}`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'gummy-gltf-validator-'));
try {
  const packed = spawnSync('npm', [
    'pack', VALIDATOR_PACKAGE, '--pack-destination', temp,
  ], { encoding: 'utf8' });
  if (packed.status !== 0) {
    throw new Error(packed.stderr || packed.stdout || 'npm pack failed');
  }
  const tarball = readdirSync(temp).find(name => name.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack produced no tarball');
  const archive = join(temp, tarball);
  const sha1 = createHash('sha1').update(readFileSync(archive)).digest('hex');
  if (sha1 !== VALIDATOR_SHA1) {
    throw new Error(`validator tarball SHA-1 mismatch: ${sha1}`);
  }
  const extracted = spawnSync('tar', [
    '-xzf', archive, '-C', target, '--strip-components=1',
  ], { encoding: 'utf8' });
  if (extracted.status !== 0) {
    throw new Error(extracted.stderr || 'tar extraction failed');
  }
  const packageJson = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  if (packageJson.version !== VALIDATOR_VERSION) {
    throw new Error(`unexpected validator version: ${packageJson.version}`);
  }
  console.log(`validator provisioned: ${target}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
