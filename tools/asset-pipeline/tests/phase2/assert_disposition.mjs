import { readFileSync } from 'node:fs';

const [path, expected] = process.argv.slice(2);
if (!path || !expected) {
  console.error('usage: assert_disposition.mjs <report.json> <status>');
  process.exit(2);
}
const report = JSON.parse(readFileSync(path, 'utf8'));
if (report.disposition?.status !== expected) {
  console.error(`expected ${expected}, got ${report.disposition?.status} for ${path}`);
  process.exit(1);
}
console.log(`${expected}: ${path}`);
