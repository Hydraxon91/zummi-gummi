// Identity reservation: a loaded game reserves every uid before spawning,
// duplicate uids are rejected, new games start clean, and map switches keep
// allocations monotonic.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = new URL(process.env.GAME_URL || 'http://localhost:8000/');
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
const TAG = process.env.TAG || 'uid';
const REPORT = `${ROOT}/.dev-shots/uid-${TAG}.json`;
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

  const loaded = await evaluate(`(() => {
    const g = window.__gummy;
    const payload = JSON.parse(g.exportSave());
    const field = payload.worlds.field;
    const studio = payload.worlds.studio;
    const template = (field.glass || [])[0];
    if (!template) return { found: false, reason: 'no Glass template' };

    const highActive = {
      ...template, uid: 600000, stage: 'teen', age: 90, scale: .8,
      parentUids: [], bonds: {}, skills: {}, history: [], playdates: {},
      pregnant: false, gestation: 0, mateCooldown: 0,
    };
    const highInactive = {
      ...template, uid: 500000, stage: 'teen', age: 90, scale: .8,
      parentUids: [], bonds: {}, skills: {}, history: [], playdates: {},
      pregnant: false, gestation: 0, mateCooldown: 0,
    };
    delete highActive.guardianUid;
    delete highInactive.guardianUid;
    field.glass.push(highActive);
    studio.glass = [highInactive];
    studio.initialized = true;

    const baby = field.bears.find(a => a.stage === 'baby');
    let identity = null;
    if (baby) {
      const guardian = field.bears.find(a => a.stage === 'adult' &&
        a.species === baby.species && a.uid !== baby.uid &&
        !(baby.parentUids || []).includes(a.uid));
      if (guardian) {
        baby.guardianUid = guardian.uid;
        baby.actorVersion = 5;
        baby.bonds = { ...(baby.bonds || {}), [String(guardian.uid)]: .42 };
      }
      identity = {
        uid: baby.uid,
        parents: (baby.parentUids || []).slice(),
        guardianUid: baby.guardianUid || null,
        bondUid: guardian ? guardian.uid : null,
        bond: guardian ? .42 : null,
      };
    }
    payload.mapId = 'field';
    g.importSave(payload);
    const highField = g.glass().actors.find(a => a.uid === 600000) || null;
    g.setCeiling(64);
    const bearSpawn = g.spawnAt(0, 0, 0, 0);
    const glassSpawn = g.spawnGlass();
    const current = identity ? g.traits().find(a => a.uid === identity.uid) : null;
    return {
      found: true,
      highField: !!highField,
      highInactive: (payload.worlds.studio.glass || []).some(a => a.uid === 500000),
      bearUid: bearSpawn ? bearSpawn.uid : null,
      glassUid: glassSpawn ? glassSpawn.uid : null,
      identity,
      current: current ? {
        parents: current.parentUids,
        guardianUid: g.guardian(g.traits().findIndex(a => a.uid === identity.uid)),
        bond: identity.bondUid ? current.bonds[String(identity.bondUid)] : null,
      } : null,
    };
  })()`);
  check('the active and inactive maps keep their high Glass identities',
    loaded.found && loaded.highField && loaded.highInactive, { value: JSON.stringify(loaded) });
  check('new soft-body and Glass identities are reserved above the loaded maximum',
    loaded.bearUid > 600000 && loaded.glassUid > 600000 &&
    loaded.bearUid !== loaded.glassUid, { value: `${loaded.bearUid}/${loaded.glassUid}` });
  check('parents, guardians and bonds still point at the intended actors',
    loaded.identity && loaded.current &&
    JSON.stringify(loaded.identity.parents) === JSON.stringify(loaded.current.parents) &&
    loaded.identity.guardianUid === loaded.current.guardianUid &&
    loaded.identity.bond === loaded.current.bond,
    { value: JSON.stringify({ identity: loaded.identity, current: loaded.current }) });
  report.loaded = loaded;

  const duplicate = await evaluate(`(() => {
    const g = window.__gummy;
    const before = g.traits().map(a => a.uid).sort((a, b) => a - b);
    const payload = JSON.parse(g.exportSave());
    const first = payload.worlds.field.bears[0];
    payload.worlds.field.bears.push({ ...first });
    let error = null;
    try { g.importSave(payload); } catch (err) { error = String(err.message || err); }
    return {
      error,
      before,
      after: g.traits().map(a => a.uid).sort((a, b) => a - b),
    };
  })()`);
  check('a duplicate uid is rejected before the live session changes',
    /duplicate actor uid/.test(duplicate.error || '') &&
    JSON.stringify(duplicate.before) === JSON.stringify(duplicate.after),
    { value: duplicate.error });
  report.duplicate = duplicate;

  await evaluate("window.__gummy.save('slot4', 'uid')");
  await evaluate("window.__gummy.newGame()");
  const fresh = await evaluate(`(() => {
    const g = window.__gummy;
    g.setCeiling(64);
    const spawned = g.spawnAt(0, 0, 0, 0);
    return { uid: spawned ? spawned.uid : null, max: Math.max(0, ...g.traits().map(a => a.uid)) };
  })()`);
  check('a new game starts its own identity space', fresh.uid !== null && fresh.uid < 500000,
    { value: JSON.stringify(fresh) });
  report.fresh = fresh;

  await evaluate("window.__gummy.load('slot4')");
  await evaluate("window.__gummy.setMap('studio')");
  await page.waitFor("window.__gummy.map().id === 'studio'", 30000);
  const studioSpawn = await evaluate(`(() => {
    const g = window.__gummy;
    g.setCeiling(64);
    const spawned = g.spawnAt(0, 0, 0, 0);
    return spawned ? spawned.uid : null;
  })()`);
  await new Promise(resolve => setTimeout(resolve, 800));
  await evaluate("window.__gummy.setMap('field')");
  await page.waitFor("window.__gummy.map().id === 'field'", 30000);
  const fieldSpawn = await evaluate(`(() => {
    const g = window.__gummy;
    g.setCeiling(64);
    const spawned = g.spawnAt(0, 0, 0, 0);
    return spawned ? spawned.uid : null;
  })()`);
  check('both map-switch directions keep the allocator ahead of restored ids',
    studioSpawn > 600000 && fieldSpawn > 600000 && studioSpawn !== fieldSpawn,
    { value: `${studioSpawn}/${fieldSpawn}` });
  report.switches = { studioSpawn, fieldSpawn };
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
