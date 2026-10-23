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
  /\b(setTimeout|setInterval|clearTimeout|clearInterval|setImmediate)\b/,
  /\bperformance\s*\./,
];
const IMPORT_DYNAMIC = /\bimport\s*\(/;
const IMPORT_STATIC = /\bimport\b(?!\s*\.\s*meta\b)(?!\s*\()/;
const EXPORT_FROM = /\bexport\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\}|[\w$]+(?:\s+as\s+[\w$]+)?)\s*from\b/;

// Strip comments and string literals while keeping template-literal
// interpolation expressions. Literal text (including text containing forbidden
// words) becomes an empty string placeholder. Interpolations become code so
// nested braces, nested strings, nested template literals and dynamic imports
// inside `${...}` are still inspected.
//
// Deliberate limitations: this is a small scanner, not a JavaScript parser.
// It relies on a standard "can a regex start here?" character heuristic, so an
// unusual regex position can be read as code and fail closed (a false positive),
// never silently pass. Unterminated strings, comments, templates or regexes
// report an `unsupported` violation. `import.meta` is allowed as a module-local
// meta reference; any other `import` form is rejected.
function analyzeSource(source) {
  let code = '';
  let i = 0;
  let lastSignificant = '';
  let unsupported = null;

  function emit(text) {
    code += text;
    for (let k = text.length - 1; k >= 0; k--) {
      if (!/\s/.test(text[k])) {
        lastSignificant = text[k];
        break;
      }
    }
  }

  function regexAllowed() {
    if (lastSignificant === '') return true;
    return '([{,:;=!&|?+-*%^~<>'.includes(lastSignificant);
  }

  function skipString(quote) {
    i++;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) { i++; return; }
      if (ch === '\n') { unsupported ??= 'unterminated string literal'; return; }
      i++;
    }
    unsupported ??= 'unterminated string literal';
  }

  function scanRegex() {
    i++;
    let inClass = false;
    let closed = false;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) { i++; closed = true; break; }
      else if (ch === '\n') break;
      i++;
    }
    if (!closed) {
      unsupported ??= 'unterminated regular expression literal';
      return;
    }
    while (i < source.length && /[a-z]/i.test(source[i])) i++;
    emit("''");
  }

  function scanTemplate() {
    i++;
    emit("''");
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '`') { i++; return; }
      if (ch === '$' && source[i + 1] === '{') {
        i += 2;
        emit(' + (');
        scanCode(true);
        emit(") + ''");
        continue;
      }
      i++;
    }
    unsupported ??= 'unterminated template literal';
  }

  function scanCode(stopAtBrace) {
    let braceDepth = 0;
    while (i < source.length) {
      const ch = source[i];
      const next = source[i + 1];
      if (ch === '/' && next === '/') {
        i += 2;
        while (i < source.length && source[i] !== '\n') i++;
        emit(' ');
        continue;
      }
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
        if (i >= source.length) {
          unsupported ??= 'unterminated block comment';
          return;
        }
        i += 2;
        emit(' ');
        continue;
      }
      if (ch === "'" || ch === '"') { skipString(ch); emit("''"); continue; }
      if (ch === '`') { scanTemplate(); continue; }
      if (ch === '/' && regexAllowed()) { scanRegex(); continue; }
      if (ch === '{') { braceDepth++; emit(ch); i++; continue; }
      if (ch === '}') {
        if (stopAtBrace && braceDepth === 0) { i++; return; }
        if (braceDepth > 0) braceDepth--;
        emit(ch);
        i++;
        continue;
      }
      emit(ch);
      i++;
    }
    if (stopAtBrace) unsupported ??= 'unterminated template expression';
  }

  scanCode(false);
  return { code, unsupported };
}

export function boundaryViolations(source, path = '<fixture>') {
  const { code, unsupported } = analyzeSource(source);
  const violations = [];

  if (unsupported) violations.push({ kind: 'unsupported', detail: unsupported });

  if (IMPORT_DYNAMIC.test(code)) {
    violations.push({ kind: 'dynamic-import', detail: `${path} contains a dynamic import()` });
  }
  if (IMPORT_STATIC.test(code)) {
    violations.push({ kind: 'import', detail: `${path} contains an import statement` });
  }
  if (EXPORT_FROM.test(code)) {
    violations.push({ kind: 'export-from', detail: `${path} re-exports from another module` });
  }

  const word = code.match(FORBIDDEN_WORDS);
  if (word) {
    violations.push({ kind: 'ambient', detail: `${path} references ambient/nondeterministic word "${word[0]}"` });
  }
  for (const pattern of FORBIDDEN_ACCESS) {
    if (pattern.test(code)) {
      violations.push({ kind: 'ambient-access', detail: `${path} contains forbidden access matching ${pattern}` });
    }
  }

  return violations;
}

const POSITIVE_FIXTURES = [
  {
    name: 'ordinary numeric math',
    source: 'export function f(x) { return Math.sin(x) + Math.hypot(x, 1) + Math.round(x); }',
  },
  {
    name: 'a string containing window',
    source: "const label = 'window';",
  },
  {
    name: 'a comment containing import and document',
    source: "// import './host.js'; document.querySelector('#x')\nconst value = 1;",
  },
  {
    name: 'a plain object key performance',
    source: 'export const config = { performance: 1 };',
  },
  {
    name: 'a template literal with only literal text',
    source: 'const text = `window document three`;',
  },
  {
    name: 'a normal value interpolation',
    source: 'const text = `value ${value}`;',
  },
  {
    name: 'nested braces and strings in an interpolation',
    source: "const text = `${({ nested: { value: '}' } }).nested.value}`;",
  },
  {
    name: 'a regular expression literal containing window',
    source: 'const pattern = /window/;',
  },
];

const NEGATIVE_FIXTURES = [
  {
    name: 'side-effect import',
    source: "import './host.js';",
    kind: 'import',
  },
  {
    name: 'named import',
    source: "import { host } from './host.js';",
    kind: 'import',
  },
  {
    name: 'dynamic import',
    source: "const host = await import('./host.js');",
    kind: 'dynamic-import',
  },
  {
    name: 'export-from re-export',
    source: "export { host } from './host.js';",
    kind: 'export-from',
  },
  {
    name: 'window.location',
    source: 'const where = window.location;',
    kind: 'ambient',
  },
  {
    name: 'document.querySelector',
    source: "document.querySelector('#x');",
    kind: 'ambient',
  },
  {
    name: 'localStorage.getItem',
    source: "const saved = localStorage.getItem('key');",
    kind: 'ambient',
  },
  {
    name: 'performance.now',
    source: 'const t = performance.now();',
    kind: 'ambient',
  },
  {
    name: 'new Date',
    source: 'const now = new Date();',
    kind: 'ambient',
  },
  {
    name: 'Math.random',
    source: 'const n = Math.random();',
    kind: 'ambient-access',
  },
  {
    name: 'THREE.Vector3',
    source: 'const v = new THREE.Vector3();',
    kind: 'ambient',
  },
  {
    name: 'template expression containing window',
    source: 'const where = `${window.location}`;',
    kind: 'ambient',
  },
  {
    name: 'template expression containing Math.random',
    source: 'const n = `value ${Math.random()}`;',
    kind: 'ambient-access',
  },
  {
    name: 'nested braces and strings before window in an interpolation',
    source: "const x = `${ { nested: { text: '}' } }.nested.text && window.location }`;",
    kind: 'ambient',
  },
  {
    name: 'nested template expression containing window',
    source: 'const x = `outer ${`inner ${window.location}`} tail`;',
    kind: 'ambient',
  },
  {
    name: 'unterminated template literal',
    source: 'const text = `unterminated',
    kind: 'unsupported',
  },
  {
    name: 'unterminated block comment',
    source: 'const value = 1; /* never closed',
    kind: 'unsupported',
  },
];

for (const path of PURE_MODULES) {
  test(`${path} stays a narrow pure module`, async () => {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const violations = boundaryViolations(source, path);
    assert.deepEqual(violations, [],
      `${path} violates the fixed H2/M22b boundary: ${JSON.stringify(violations)}`);
  });
}

for (const fixture of POSITIVE_FIXTURES) {
  test(`purity guard accepts ${fixture.name}`, () => {
    assert.deepEqual(boundaryViolations(fixture.source, fixture.name), [],
      `expected ${fixture.name} to be accepted`);
  });
}

for (const fixture of NEGATIVE_FIXTURES) {
  test(`purity guard rejects ${fixture.name}`, () => {
    const violations = boundaryViolations(fixture.source, fixture.name);
    assert.notEqual(violations.length, 0,
      `expected ${fixture.name} to be rejected`);
    assert.ok(violations.some((violation) => violation.kind === fixture.kind),
      `expected ${fixture.name} to report ${fixture.kind}, got ${JSON.stringify(violations)}`);
  });
}
