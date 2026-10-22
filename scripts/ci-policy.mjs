// Conservative CI routing: unknown paths always receive browser coverage.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function documentationOnly(paths) {
  return paths.length > 0 && paths.every(path =>
    path === 'README.md' || path === 'ROADMAP.md' || path === 'PERFORMANCE.md' ||
    path === 'assets/README.md' || path === 'screenshots/README.md' ||
    (path.startsWith('docs/') && path.endsWith('.md')));
}

export function requiredChecksPass(results, browsers) {
  return results['serve-and-load'] === 'success' && results.changes === 'success' &&
    (browsers === true ? results.browser === 'success'
      : browsers === false && results.browser === 'skipped');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'gate') {
    const browsers = process.env.BROWSERS === 'true' ? true
      : process.env.BROWSERS === 'false' ? false : null;
    if (!requiredChecksPass(JSON.parse(process.env.RESULTS), browsers)) {
      console.error('Required CI checks did not pass:', process.env.RESULTS);
      process.exitCode = 1;
    }
  } else {
    const base = process.env.BASE_SHA;
    let browsers = true;
    if (base && !/^0+$/.test(base)) {
      // Missing history or a failed comparison must fail closed, never skip tests.
      execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', base], { stdio: 'inherit' });
      const paths = execFileSync('git', ['diff', '--name-only', '-z', base, 'HEAD'], { encoding: 'utf8' })
        .split('\0').filter(Boolean);
      browsers = !documentationOnly(paths);
    }
    appendFileSync(process.env.GITHUB_OUTPUT, `browsers=${browsers}\n`);
    console.log(`Browser coverage required: ${browsers}`);
  }
}
