import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = readFileSync(fileURLToPath(new URL('../src/app.js', import.meta.url)), 'utf8');
const START = 'window.__gummy = {';

function objectLines(source, startMarker, endPattern) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} not found`);
  const rest = source.slice(start + startMarker.length);
  const end = rest.search(endPattern);
  assert.ok(end >= 0, `end of ${startMarker} not found`);
  return rest.slice(0, end).split('\n');
}

function keysAtIndent(lines, spaces) {
  const pattern = new RegExp(`^${' '.repeat(spaces)}([A-Za-z_$][A-Za-z0-9_$]*)\\s*[:(]`);
  return lines.map(line => line.match(pattern)?.[1]).filter(Boolean);
}

function duplicates(keys) {
  const seen = new Set();
  const out = new Set();
  for (const key of keys) {
    if (seen.has(key)) out.add(key);
    seen.add(key);
  }
  return [...out];
}

test('window.__gummy has one registration and no duplicate top-level names', () => {
  const assignments = SOURCE.match(/window\.__gummy\s*=\s*\{/g) || [];
  assert.equal(assignments.length, 1, 'exactly one __gummy object literal');
  const lines = objectLines(SOURCE, START, /\n\};/);
  const keys = keysAtIndent(lines, 2);
  assert.ok(keys.length > 100, `expected the debug API surface, saw ${keys.length}`);
  assert.deepEqual(duplicates(keys), [], `duplicate __gummy names: ${duplicates(keys).join(', ')}`);
});

test('nested __gummy.msn names are unique', () => {
  const lines = objectLines(SOURCE, START, /\n\};/);
  const msnStart = lines.findIndex(line => /^  msn:\s*\{/.test(line));
  assert.ok(msnStart >= 0, 'msn namespace not found');
  const msnLines = [];
  for (let i = msnStart + 1; i < lines.length; i++) {
    if (/^  \},?$/.test(lines[i])) break;
    msnLines.push(lines[i]);
  }
  const keys = keysAtIndent(msnLines, 4);
  assert.ok(keys.length > 10, `expected the msn API surface, saw ${keys.length}`);
  assert.deepEqual(duplicates(keys), [], `duplicate __gummy.msn names: ${duplicates(keys).join(', ')}`);
});
