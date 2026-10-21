// Adoption lifecycle: parentless save -> automatic guardian -> save/load,
// parent return, other-map parent, guardian removal and a clean new game.
// Start launch.py first, then run with GAME_URL.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = new URL(process.env.GAME_URL || 'http://localhost:8000/');
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
const TAG = process.env.TAG || 'adoption';
const REPORT = `${ROOT}/.dev-shots/adoption-${TAG}.json`;
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });

const launched = await launchBrowser();
const browser = await connectBrowser(launched);
const page = await browser.openPage({ url: TARGET.href, width: 1440, height: 900 });
const evaluate = (expression, timeout = 30000) => page.evaluate(expression, timeout);
const report = { tag: TAG, pageErrors: browser.pageErrors, checks: [] };
const check = (name, pass, detail = {}) => {
  report.checks.push({ name, pass: !!pass, ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail.value === undefined ? '' : ` (${detail.value})`}`);
};

try {
  await page.waitFor('!!window.__gummy?.booted', 60000);
  await page.waitFor('window.__gummy.glass().actors.every(a => a.ready)', 30000);

  const setup = await evaluate(`(() => {
    const g = window.__gummy;
    const box = document.getElementById('settingsAdoption');
    if (box) {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    g.setBehaviorFeature('adoption', true);
    const payload = JSON.parse(g.exportSave());
    const world = payload.worlds.field;
    const baby = world.bears.find(a => a.stage === 'baby');
    if (!baby) return { found: false, reason: 'no baby' };
    const parentUids = (baby.parentUids || []).slice();
    const parents = world.bears.filter(a => parentUids.includes(a.uid));
    const guardian = world.bears.find(a => a.stage === 'adult' &&
      a.species === baby.species && a.uid !== baby.uid &&
      !parentUids.includes(a.uid));
    if (!guardian) return { found: false, reason: 'no non-parent adult' };
    world.bears = world.bears.filter(a => !parentUids.includes(a.uid));
    for (const row of world.bears) delete row.guardianUid;
    guardian.home = baby.home;
    payload.mapId = 'field';
    g.importSave(payload);
    g.sim(20, 0);
    const index = g.traits().findIndex(a => a.uid === baby.uid);
    const guardianIndex = g.traits().findIndex(a => a.uid === guardian.uid);
    return {
      found: true,
      babyUid: baby.uid,
      babySpecies: baby.species,
      babyHome: baby.home,
      babyParents: parentUids,
      guardianUid: guardian.uid,
      parentRecords: parents,
      features: g.behaviorConfig()?.features,
      index,
      adoption: index >= 0 ? g.adoption(index) : null,
      guardianSpecies: guardian.species,
      guardianHome: guardianIndex >= 0 ? g.traits()[guardianIndex].home : null,
    };
  })()`);
  check('adoption UI and feature are on', setup.found && setup.features?.adoption === true, {
    value: JSON.stringify(setup.features),
  });
  check('a parentless baby gets a same-species guardian',
    setup.found && setup.adoption?.guardianUid === setup.guardianUid &&
    setup.guardianSpecies === setup.babySpecies, { value: JSON.stringify(setup.adoption) });
  const babyNow = setup.index >= 0 ? await evaluate(`(() => {
    const g = window.__gummy;
    const index = g.traits().findIndex(a => a.uid === ${setup.babyUid});
    if (index < 0) return null;
    const actor = g.traits()[index];
    return { home: actor.home, parentUids: actor.parentUids, guardianUid: g.guardian(index) };
  })()`) : null;
  check('adoption leaves home and ancestry unchanged',
    babyNow && babyNow.home === setup.babyHome &&
    JSON.stringify(babyNow.parentUids) === JSON.stringify(setup.babyParents) &&
    babyNow.guardianUid === setup.guardianUid, { value: JSON.stringify(babyNow) });
  report.setup = { ...setup, babyNow };

  const saved = await evaluate(`(async () => {
    const g = window.__gummy;
    const before = g.guardian(g.traits().findIndex(a => a.uid === ${setup.babyUid}));
    await g.save('slot4', 'guardian');
    await g.load('slot4');
    const afterIndex = g.traits().findIndex(a => a.uid === ${setup.babyUid});
    const after = afterIndex >= 0 ? g.guardian(afterIndex) : null;
    await g.newGame();
    const fresh = g.traits().every((a, i) => g.guardian(i) === null);
    await g.load('slot4');
    const againIndex = g.traits().findIndex(a => a.uid === ${setup.babyUid});
    return {
      before, after, fresh,
      again: againIndex >= 0 ? g.guardian(againIndex) : null,
    };
  })()`);
  check('a guardian survives its save and a new game starts clean',
    saved.before === setup.guardianUid && saved.after === setup.guardianUid &&
    saved.fresh === true && saved.again === setup.guardianUid, { value: JSON.stringify(saved) });
  report.save = saved;

  const parentReturn = await evaluate(`(async () => {
    const g = window.__gummy;
    const payload = JSON.parse(g.exportSave());
    const world = payload.worlds.field;
    for (const row of ${JSON.stringify(setup.parentRecords)}) {
      if (!world.bears.some(a => a.uid === row.uid)) world.bears.push(row);
    }
    payload.mapId = 'field';
    g.importSave(payload);
    g.sim(20, 0);
    const index = g.traits().findIndex(a => a.uid === ${setup.babyUid});
    return index < 0 ? null : {
      guardian: g.guardian(index),
      adoption: g.adoption(index),
      parentUid: ${JSON.stringify(setup.babyParents[0] || null)},
    };
  })()`);
  check('a returning parent clears the guardian and becomes the follow target',
    parentReturn && parentReturn.guardian === null &&
    parentReturn.adoption?.parent === parentReturn.parentUid &&
    parentReturn.adoption?.target === parentReturn.parentUid,
    { value: JSON.stringify(parentReturn) });
  report.parentReturn = parentReturn;

  const elsewhere = await evaluate(`(() => {
    const g = window.__gummy;
    const payload = JSON.parse(g.exportSave());
    const world = payload.worlds.field;
    const studio = payload.worlds.studio;
    world.bears = world.bears.filter(a => ![${setup.babyParents.join(',')}].includes(a.uid));
    for (const row of world.bears) delete row.guardianUid;
    for (const row of ${JSON.stringify(setup.parentRecords)}) {
      if (!studio.bears.some(a => a.uid === row.uid)) studio.bears.push(row);
    }
    studio.initialized = true;
    payload.mapId = 'field';
    g.importSave(payload);
    g.sim(20, 0);
    const index = g.traits().findIndex(a => a.uid === ${setup.babyUid});
    return index < 0 ? null : { guardian: g.guardian(index), adoption: g.adoption(index) };
  })()`);
  check('a parent on the other map prevents adoption',
    elsewhere && elsewhere.guardian === null && elsewhere.adoption?.parentElsewhere === true,
    { value: JSON.stringify(elsewhere) });
  report.elsewhere = elsewhere;

  const removed = await evaluate(`(async () => {
    const g = window.__gummy;
    await g.load('slot4');
    const payload = JSON.parse(g.exportSave());
    const world = payload.worlds.field;
    world.bears = world.bears.filter(a => a.uid !== ${setup.guardianUid});
    for (const row of world.bears) {
      if (row.uid === ${setup.babyUid}) row.parentUids = [];
    }
    payload.mapId = 'field';
    g.importSave(payload);
    g.sim(20, 0);
    const index = g.traits().findIndex(a => a.uid === ${setup.babyUid});
    return index < 0 ? null : { guardian: g.guardian(index), adoption: g.adoption(index) };
  })()`);
  check('a save without the guardian drops stale guardian references',
    removed && removed.guardian === null, { value: JSON.stringify(removed) });
  report.removed = removed;

  const off = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('adoption', false);
    const payload = JSON.parse(g.exportSave());
    const world = payload.worlds.field;
    world.bears = world.bears.filter(a => ![${setup.babyParents.join(',')}].includes(a.uid));
    for (const row of world.bears) delete row.guardianUid;
    payload.mapId = 'field';
    g.importSave(payload);
    g.sim(20, 0);
    const index = g.traits().findIndex(a => a.uid === ${setup.babyUid});
    const result = index < 0 ? null : { guardian: g.guardian(index), adoption: g.adoption(index) };
    g.setBehaviorFeature('adoption', true);
    return result;
  })()`);
  check('adoption off leaves the baby without a guardian',
    off && off.guardian === null && off.adoption?.enabled === false,
    { value: JSON.stringify(off) });
  report.off = off;
  report.errors = browser.pageErrors;
  console.log('REPORT', REPORT);
} catch (error) {
  report.failure = String(error.stack || error);
  console.log('STOP', report.failure.slice(0, 2000));
  process.exitCode = 1;
} finally {
  await writeFile(REPORT, JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.checks.some(entry => !entry.pass)) process.exitCode = 1;
