// Optional bounded parallel baseline matrix. Default remains a fresh run.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { runParity } from './behavior-parity.mjs';

if (!isMainThread) {
  parentPort.postMessage(runParity(workerData));
} else {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
  const long = args.includes('--long');
  const jobs = Number(option('--jobs', '1'));
  const days = Number(option('--days', long ? '20' : '2'));
  const seeds = option('--seeds', long ? '1,2,3,4,5' : '1,2,3').split(',').map(Number);
  const races = option('--race', 'bear,gummy,glass').split(',');
  const comparator = option('--comparator', 'json');
  const perturb = Number(option('--perturb', '0'));
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 4 || !Number.isFinite(days) || days <= 0 ||
      !seeds.length || seeds.some(n => !Number.isFinite(n)) ||
      races.some(r => !['bear', 'gummy', 'glass'].includes(r)) ||
      !Number.isFinite(perturb) || !['json', 'exact', 'validate'].includes(comparator)) throw new Error('Invalid matrix options');
  const resume = args.includes('--resume');
  const fullMatrix = days === 20 && perturb === 0 &&
    seeds.length === 5 && [1, 2, 3, 4, 5].every(seed => seeds.includes(seed)) &&
    races.length === 3 && ['bear', 'gummy', 'glass'].every(race => races.includes(race));
  const hash = createHash('sha256');
  async function fingerprint(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${path}/${entry.name}`;
      if (entry.isDirectory()) await fingerprint(file);
      else if (entry.isFile()) { hash.update(file); hash.update(await readFile(file)); }
    }
  }
  await fingerprint(new URL('../src', import.meta.url).pathname);
  // All script helpers are included: no cached result survives harness edits.
  await fingerprint(new URL('.', import.meta.url).pathname);
  hash.update(JSON.stringify({ node: process.version, v8: process.versions.v8,
    platform: process.platform, arch: process.arch, flags: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS || '', days, seeds, races, comparator, perturb }));
  const cacheDir = new URL('../.dev-shots/parity-cache/', import.meta.url);
  await mkdir(cacheDir, { recursive: true });
  const cachePath = new URL(`${hash.digest('hex')}.json`, cacheDir);
  let cached = {};
  if (resume) {
    try { cached = JSON.parse(await readFile(cachePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Long Glass cases dominate; dispatch them first to reduce the final tail.
  const orderedRaces = [...races].sort((a, b) => Number(b === 'glass') - Number(a === 'glass'));
  const queue = orderedRaces.flatMap(race => seeds.map(seed => ({ race, seed, days, comparator, perturb })));
  const active = new Set();
  let failed = false;
  let completed = 0;
  let reused = 0;
  const started = performance.now();
  async function consume() {
    while (queue.length && !failed) {
      const task = queue.shift();
      const key = `${task.race}/${task.seed}`;
      if (resume && cached[key]?.ok) { reused++; console.log(`CACHED ${key}`); continue; }
      const worker = new Worker(new URL(import.meta.url), { workerData: task });
      active.add(worker);
      try {
        const result = await new Promise((resolve, reject) => {
          worker.once('message', resolve);
          worker.once('error', reject);
          worker.once('exit', code => reject(new Error(`Worker exited before result (${code})`)));
        });
        console.log(`${result.ok ? 'PASS' : 'FAIL'} ${key} ${result.durationMs} ms`);
        if (!result.ok) { failed = true; console.error(JSON.stringify(result.diffs)); }
        else { cached[key] = result; completed++; }
      } catch (error) {
        if (!failed) console.error(error);
        failed = true;
      } finally {
        active.delete(worker);
        await worker.terminate();
        if (failed) for (const other of active) await other.terminate();
      }
    }
  }
  await Promise.all(Array.from({ length: jobs }, consume));
  await writeFile(cachePath, JSON.stringify(cached));
  console.log(JSON.stringify({ ok: !failed, completed, reused, jobs,
    ms: Math.round(performance.now() - started), fresh: !resume,
    tier: fullMatrix ? 'long' : 'development', acceptance: !resume && fullMatrix && !failed }));
  if (failed) process.exitCode = 1;
}
