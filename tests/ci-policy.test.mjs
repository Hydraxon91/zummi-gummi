import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { documentationOnly, requiredChecksPass } from '../scripts/ci-policy.mjs';

test('CI only skips browsers for an explicit documentation allowlist', () => {
  assert.equal(documentationOnly(['README.md', 'docs/species-template.md']), true);
  for (const path of ['AGENTS.md', '.opencode/skills/test/SKILL.md', '.github/workflows/smoke.yml',
    'src/app.js', 'assets/catalog.json', 'scripts/smoke.mjs', 'docs/test.js', 'unknown.md']) {
    assert.equal(documentationOnly(['README.md', path]), false, path);
  }
  assert.equal(documentationOnly([]), false);
});

test('aggregate gate rejects failure, cancellation, missing and unexpected skips', () => {
  const results = { changes: 'success', 'serve-and-load': 'success', browser: 'success' };
  assert.equal(requiredChecksPass(results, true), true);
  assert.equal(requiredChecksPass({ ...results, browser: 'skipped' }, false), true);
  assert.equal(requiredChecksPass({ ...results, browser: 'skipped' }, undefined), false);
  assert.equal(requiredChecksPass(results, null), false);
  for (const job of Object.keys(results)) {
    for (const status of ['failure', 'cancelled', 'skipped', undefined]) {
      assert.equal(requiredChecksPass({ ...results, [job]: status }, true), false);
    }
  }
  assert.equal(requiredChecksPass({ ...results, 'serve-and-load': 'failure', browser: 'skipped' }, false), false);
});

test('the workflow gate exits nonzero for a deliberately failed browser job', () => {
  const script = fileURLToPath(new URL('../scripts/ci-policy.mjs', import.meta.url));
  for (const [browser, browsers, status] of [
    ['success', 'true', 0], ['failure', 'true', 1], ['cancelled', 'true', 1],
    ['skipped', 'true', 1], ['skipped', 'false', 0], ['skipped', '', 1],
  ]) {
    const result = spawnSync(process.execPath, [script, 'gate'], {
      env: { ...process.env, BROWSERS: browsers,
        RESULTS: JSON.stringify({ changes: 'success', 'serve-and-load': 'success', browser }) },
      encoding: 'utf8',
    });
    assert.equal(result.status, status, `${browser}/${browsers}: ${result.stderr}`);
  }
});
