// Prune scratch captures under .dev-shots by age.
//
// Dry-run by default:
//   node scripts/prune-dev-shots.mjs
// Delete candidates older than DAYS (default 14):
//   DAYS=14 node scripts/prune-dev-shots.mjs --apply
//
// Only .png and .json files in .dev-shots are considered. Curated screenshots
// under screenshots/ are never touched.

import { readdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../.dev-shots/', import.meta.url));
const days = Number(process.env.DAYS || 14);
const apply = process.argv.includes('--apply');
if (!Number.isFinite(days) || days < 0) throw new Error('DAYS must be a non-negative number');

let names = [];
try {
  names = await readdir(DIR);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log(`No scratch capture directory at ${DIR}`);
    process.exit(0);
  }
  throw error;
}

const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
const candidates = [];
for (const name of names) {
  if (!/\.(png|json)$/i.test(name)) continue;
  const path = DIR + name;
  const info = await stat(path);
  if (info.isFile() && info.mtimeMs < cutoff) {
    candidates.push({ name, path, bytes: info.size, mtime: info.mtimeMs });
  }
}

candidates.sort((a, b) => a.mtime - b.mtime);
const bytes = candidates.reduce((sum, file) => sum + file.bytes, 0);
console.log(`${apply ? 'Pruning' : 'Would prune'} ${candidates.length} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MiB, older than ${days} day(s).`);
for (const file of candidates) console.log(`  ${new Date(file.mtime).toISOString()}  ${file.name}`);
if (apply) {
  for (const file of candidates) await rm(file.path, { force: true });
  console.log('Done.');
} else if (candidates.length) {
  console.log('Re-run with --apply to delete these files.');
}
