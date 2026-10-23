import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// This is an intentionally fixed, narrow guard for the H2/M22b boundary list.
// The list below is not a repository-wide import-ban framework and must not be
// generalized: each module was source-inspected for H1 and is currently
// dependency-free. Adding an import or ambient dependency to one of these files
// requires an explicit boundary review and an update to this list, not a silent
// pass here.
const PURE_MODULES = Object.freeze([
  'src/camera.js',
  'src/settings.js',
  'src/rosterview.js',
  'src/cannonaim.js',
  'src/surfacelattice.js',
  'src/wateraccess.js',
  'src/homesim.js',
  'src/fieldshape.js',
  'src/fieldlayout.js',
  'src/avoidance.js',
  'src/relationships.js',
  'src/family.js',
]);

// Allow ordinary numeric math such as Math.sin/hypot/round; only the ambient
// and nondeterministic surfaces are forbidden. A word used as a plain object
// key (for example the `performance` profile key in settings.js) is data, not
// an ambient global read, so it is not counted.
const FORBIDDEN_WORDS = /\b(window|document|localStorage|sessionStorage|performance|Date|THREE|three)\b(?!\s*:)/;
const FORBIDDEN_ACCESS = [
  /\b(document|window)\s*\./,
  /\bnew\s+Date\b/,
  /\bMath\s*\.\s*random\b/,
  /\b(requestAnimationFrame|cancelAnimationFrame)\b/,
  /\b(setTimeout|setInterval|clearTimeout|clearInterval)\b/,
  /\bperformance\s*\./,
];
const IMPORT_STATEMENT = /(^|[;{}])\s*import\s*(?:[\w*{]|['"])/;
const EXPORT_FROM = /\bexport\s+(?:\*|\{[^}]*\})\s*from\b/;

function stripCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) { i++; break; }
        i++;
      }
      out += ' ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

for (const path of PURE_MODULES) {
  test(`${path} stays a narrow pure module`, async () => {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const stripped = stripCommentsAndStrings(source);

    assert.doesNotMatch(stripped, IMPORT_STATEMENT,
      `${path} must not add import statements without updating the fixed H2 boundary list`);
    assert.doesNotMatch(stripped, EXPORT_FROM,
      `${path} must not re-export from another module`);

    const word = stripped.match(FORBIDDEN_WORDS);
    assert.equal(word, null,
      `${path} references ambient/nondeterministic word "${word && word[0]}"`);
    for (const pattern of FORBIDDEN_ACCESS) {
      assert.doesNotMatch(stripped, pattern,
        `${path} contains forbidden access matching ${pattern}`);
    }
  });
}
