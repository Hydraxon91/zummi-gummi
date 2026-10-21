// Gifting lifecycle: settings, accepted gift, refusal, daily cap and v7 save.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = new URL(process.env.GAME_URL || 'http://localhost:8000/');
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
const TAG = process.env.TAG || 'gifting';
const REPORT = `${ROOT}/.dev-shots/gifting-${TAG}.json`;
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
    const box = document.getElementById('settingsGifting');
    if (box) {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    g.setBehaviorFeature('gifting', true);
    g.setCeiling(64);
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    if (!source) return { found: false, reason: 'no source' };
    const giver = g.spawnAt(source.approachX, source.approachZ, 0, 0);
    const receiver = g.spawnAt(source.approachX + .8, source.approachZ, 0, 0);
    if (!giver || !receiver) return { found: false, reason: 'spawn failed' };
    const list = g.traits();
    const giverIndex = list.findIndex(a => a.uid === giver.uid);
    const receiverIndex = list.findIndex(a => a.uid === receiver.uid);
    g.setHunger(giverIndex, .2);
    g.setBond(giverIndex, receiverIndex, .1);
    g.setHunger(receiverIndex, .6);
    return {
      found: true,
      sourceId: source.id,
      giverUid: giver.uid,
      receiverUid: receiver.uid,
      giverIndex,
      receiverIndex,
      feature: g.behaviorConfig()?.features?.gifting,
    };
  })()`);
  check('gifting settings and feature are on', setup.found && setup.feature === true,
    { value: JSON.stringify(setup) });
  await evaluate("document.getElementById('settingsBtn').click()");
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.screenshot(`${ROOT}/.dev-shots/gifting_settings.png`);
  await evaluate("document.getElementById('settingsClose').click()");
  await new Promise(resolve => setTimeout(resolve, 350));

  const started = await evaluate(`(() => {
    const g = window.__gummy;
    const result = g.gift(${setup.giverIndex}, ${setup.receiverIndex});
    if (result.ok) g.selectBear(${setup.giverIndex});
    return result;
  })()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot(`${ROOT}/.dev-shots/gifting_offer.png`);
  const accepted = await evaluate(`(() => {
    const g = window.__gummy;
    g.sim(5, 0);
    const giver = g.traits().find(a => a.uid === ${setup.giverUid});
    const receiver = g.traits().find(a => a.uid === ${setup.receiverUid});
    const source = g.foodSources().find(s => s.id === ${JSON.stringify(started.sourceId)});
    return {
      sourceRipe: source?.ripe,
      receiverHunger: receiver?.hunger,
      bond: giver?.bonds?.[String(${setup.receiverUid})],
      giftHistory: giver?.history?.some(e => e.kind === 'gift'),
      received: receiver?.history?.some(e => e.kind === 'receivedGift'),
      state: giver?.ai,
    };
  })()`);
  check('an accepted gift consumes one source, feeds the receiver and records both sides',
    started.ok === true && accepted.sourceRipe === false &&
    accepted.receiverHunger < .6 && accepted.bond > .1 &&
    accepted.giftHistory === true && accepted.received === true,
    { value: JSON.stringify({ started, accepted }) });

  const cap = await evaluate(`(() => {
    const g = window.__gummy;
    const result = g.gift(${setup.giverIndex}, ${setup.receiverIndex});
    return { result, lastGiftDay: JSON.parse(g.exportSave()).worlds.field.bears
      .find(a => a.uid === ${setup.giverUid})?.lastGiftDay };
  })()`);
  check('the daily gift cap blocks a second gift', cap.result?.ok === false &&
    Number.isFinite(cap.lastGiftDay), { value: JSON.stringify(cap) });

  const persisted = await evaluate(`(async () => {
    const g = window.__gummy;
    await g.save('slot5', 'gift');
    await g.load('slot5');
    const payload = JSON.parse(g.exportSave());
    const actor = payload.worlds.field.bears.find(a => a.uid === ${setup.giverUid});
    return { version: actor?.actorVersion, lastGiftDay: actor?.lastGiftDay };
  })()`);
  check('the gift day persists in actorVersion 7', persisted.version === 7 &&
    Number.isFinite(persisted.lastGiftDay), { value: JSON.stringify(persisted) });

  const refused = await evaluate(`(() => {
    const g = window.__gummy;
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    if (!source) return { found: false };
    const giver = g.spawnAt(source.approachX, source.approachZ, 0, 0);
    const receiver = g.spawnAt(source.approachX + .8, source.approachZ, 0, 0);
    const list = g.traits();
    const giverIndex = list.findIndex(a => a.uid === giver.uid);
    const receiverIndex = list.findIndex(a => a.uid === receiver.uid);
    g.setHunger(giverIndex, .2);
    g.setHunger(receiverIndex, .1);
    g.sim(.1, 0);
    const result = g.gift(giverIndex, receiverIndex);
    return { found: true, result, ripe: g.foodSources().find(s => s.id === source.id)?.ripe };
  })()`);
  check('a receiver who is not hungry refuses without consuming the source',
    refused.found && refused.result?.ok === false && refused.ripe === true,
    { value: JSON.stringify(refused) });

  await evaluate("window.__gummy.setBehaviorFeature('gifting', false)");
  const off = await evaluate(`(() => {
    const g = window.__gummy;
    return { result: g.gift(${setup.giverIndex}, ${setup.receiverIndex}) };
  })()`);
  check('gifting off prevents a new offer', off.result?.ok === false,
    { value: JSON.stringify(off) });

  await evaluate("window.__gummy.setBehaviorFeature('gifting', true)");
  const startedSwitch = await evaluate(`(() => {
    const g = window.__gummy;
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    if (!source) return { ok: false, reason: 'no source' };
    const giver = g.spawnAt(source.approachX, source.approachZ, 0, 0);
    const receiver = g.spawnAt(source.approachX + .8, source.approachZ, 0, 0);
    const list = g.traits();
    const giverIndex = list.findIndex(a => a.uid === giver.uid);
    const receiverIndex = list.findIndex(a => a.uid === receiver.uid);
    g.setHunger(giverIndex, .2);
    g.setHunger(receiverIndex, .6);
    g.sim(.1, 0);
    return { ...g.gift(giverIndex, receiverIndex), sourceId: source.id };
  })()`);
  await evaluate("window.__gummy.setMap('studio')");
  await page.waitFor("window.__gummy.map().id === 'studio'", 30000);
  await new Promise(resolve => setTimeout(resolve, 500));
  await evaluate("window.__gummy.setMap('field')");
  await page.waitFor("window.__gummy.map().id === 'field'", 30000);
  await new Promise(resolve => setTimeout(resolve, 500));
  const switched = await evaluate(`(() => {
    const g = window.__gummy;
    return {
      activeGift: g.traits().some(a => a.ai === 'seekGift' || a.ai === 'gift'),
      claimed: g.foodSources().some(s => s.claimed),
    };
  })()`);
  check('a map switch abandons an active offer and releases food claims',
    startedSwitch.ok === true && switched.activeGift === false && switched.claimed === false,
    { value: JSON.stringify({ startedSwitch, switched }) });

  const mobile = await browser.openPage({ url: TARGET.href, width: 390, height: 844 });
  await mobile.waitFor('!!window.__gummy?.booted', 60000);
  await mobile.evaluate("document.getElementById('settingsBtn').click()");
  await new Promise(resolve => setTimeout(resolve, 500));
  const mobileRow = await mobile.evaluate(`(() => {
    const card = document.querySelector('.settingscard');
    document.getElementById('settingsGifting').scrollIntoView({ block: 'center' });
    return {
      visible: !!document.getElementById('settingsGifting'),
      checked: document.getElementById('settingsGifting')?.checked,
      scrolled: card.scrollTop > 0,
    };
  })()`);
  check('the gifting setting is present at mobile width', mobileRow.visible === true &&
    mobileRow.scrolled === true, { value: JSON.stringify(mobileRow) });
  await mobile.screenshot(`${ROOT}/.dev-shots/gifting_settings_mobile.png`);

  report.setup = setup;
  report.started = started;
  report.accepted = accepted;
  report.cap = cap;
  report.persisted = persisted;
  report.refused = refused;
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
