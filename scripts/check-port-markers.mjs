// Fails when a temporary behavior-port marker remains in src/.
//
// Step 3 leaves the unported logic in src/behaviors/engine.js under
// `// TEMPORARY(port): <module>` blocks. Step 4 removes them one module at a
// time. CI passes the checked-in expected list until step 4 is finished; after
// that the list is emptied and any marker fails the build.
//
// Usage:
//   node scripts/check-port-markers.mjs
//   node scripts/check-port-markers.mjs --expected scripts/port-markers.txt

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const MARKER = /TEMPORARY\(port\):\s*([a-z][a-z0-9-]*)/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

export function findPortMarkers(dir = SRC) {
  const found = [];
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8').split('\n');
    for (let line = 0; line < text.length; line++) {
      MARKER.lastIndex = 0;
      let match;
      while ((match = MARKER.exec(text[line]))) {
        found.push({ id: match[1], file: relative(ROOT, file), line: line + 1 });
      }
    }
  }
  return found;
}

function readExpected(path) {
  if (!path) return null;
  const text = readFileSync(path, 'utf8');
  return new Set(text.split('\n')
    .map(line => line.replace(/#.*/, '').trim())
    .filter(Boolean));
}

export function checkPortMarkers(expectedPath = null) {
  const markers = findPortMarkers();
  const expected = readExpected(expectedPath);
  const ids = [...new Set(markers.map(marker => marker.id))].sort();
  const unexpected = expected
    ? markers.filter(marker => !expected.has(marker.id))
    : markers;
  return {
    ok: unexpected.length === 0,
    markers,
    ids,
    expected: expected ? [...expected].sort() : null,
    unexpected,
  };
}

const isMain = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const expectedIndex = process.argv.indexOf('--expected');
  const expectedPath = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : null;
  const result = checkPortMarkers(expectedPath);
  for (const marker of result.markers) {
    console.log(`${marker.file}:${marker.line} ${marker.id}`);
  }
  if (result.ok) {
    console.log(`Port markers: ${result.markers.length} marker lines, ` +
      `${result.ids.length} modules (${result.ids.join(', ') || 'none'})`);
  } else {
    for (const marker of result.unexpected) {
      console.error(`::error::unexpected port marker ${marker.id} at ${marker.file}:${marker.line}`);
    }
    console.error('Port marker check failed: remove the module from the expected list only after it is ported.');
    process.exitCode = 1;
  }
}
