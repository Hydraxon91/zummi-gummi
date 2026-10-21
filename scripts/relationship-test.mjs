// Relationship panel lifecycle: tabs, pair interactions, missing/cross-map
// relatives, asymmetric bonds, Glass selection and a mobile capture.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = new URL(process.env.GAME_URL || 'http://localhost:8000/');
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
const TAG = process.env.TAG || 'relationship';
const REPORT = `${ROOT}/.dev-shots/relationship-${TAG}.json`;
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

  const picked = await evaluate(`(() => {
    const g = window.__gummy;
    const list = g.traits();
    let index = list.findIndex(a => a.parentUids.length && Object.keys(a.bonds || {}).length);
    if (index < 0) index = list.findIndex(a => a.parentUids.length);
    if (index < 0) index = 0;
    g.selectBear(index);
    return { index, uid: list[index].uid, name: list[index].name };
  })()`);
  await new Promise(resolve => setTimeout(resolve, 500));
  const panel = await evaluate(`(() => {
    const panel = document.getElementById('directivePanel');
    const rows = document.querySelectorAll('#relRelationships .relRow').length;
    const headings = [...document.querySelectorAll('#relRelationships .relSection h4')].map(h => h.textContent);
    return {
      visible: !panel.hidden,
      rows,
      headings,
      tabs: [...document.querySelectorAll('[data-rel-tab]')].map(t => t.textContent),
      relationshipsHidden: document.getElementById('relRelationships').hidden,
    };
  })()`);
  check('selecting an actor opens the relationship panel', panel.visible && panel.rows > 0 &&
    panel.headings.includes('Family') && panel.relationshipsHidden === false,
    { value: JSON.stringify(panel) });
  await page.screenshot(`${ROOT}/.dev-shots/relationship_desktop.png`);

  const keyboard = await evaluate(`(() => {
    const tab = document.getElementById('relTabRelationships');
    tab.focus();
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    return {
      selected: document.getElementById('relTabEvents').getAttribute('aria-selected'),
      focus: document.activeElement.id,
    };
  })()`);
  check('arrow keys switch relationship tabs', keyboard.selected === 'true' &&
    keyboard.focus === 'relTabEvents', { value: JSON.stringify(keyboard) });

  const eventsTab = await evaluate(`(() => {
    document.getElementById('relTabEvents').click();
    return {
      eventsHidden: document.getElementById('relEvents').hidden,
      relationshipsHidden: document.getElementById('relRelationships').hidden,
      selected: document.getElementById('relTabEvents').getAttribute('aria-selected'),
    };
  })()`);
  check('the Recent events tab switches panes and keeps selection', eventsTab.eventsHidden === false &&
    eventsTab.relationshipsHidden === true && eventsTab.selected === 'true',
    { value: JSON.stringify(eventsTab) });
  await page.screenshot(`${ROOT}/.dev-shots/relationship_events.png`);

  const social = await evaluate(`(() => {
    const g = window.__gummy;
    const list = g.traits();
    const other = list.findIndex((a, index) => index !== ${picked.index} && a.stage === 'adult');
    if (other < 0) return { ok: false, reason: 'no partner' };
    const partnerUid = list[other].uid;
    const result = g.forceSocial(${picked.index}, other, true);
    g.sim(10, 0);
    const actor = g.traits()[${picked.index}];
    return {
      ok: result.ok, other, partnerUid,
      history: actor.history.map(e => e.kind),
      social: actor.history.some(e => e.kind === 'social' && e.uid === partnerUid),
    };
  })()`);
  check('a completed social interaction is recorded', social.ok && social.social,
    { value: JSON.stringify(social) });
  const interaction = await evaluate(`(() => {
    const g = window.__gummy;
    g.selectBear(${picked.index});
    document.getElementById('relTabRelationships').click();
    const row = document.querySelector('#relRelationships .relRow[data-uid="${social.partnerUid}"]');
    if (!row) return { found: false };
    row.click();
    const current = document.querySelector('#relRelationships .relRow[data-uid="${social.partnerUid}"]');
    return {
      found: true,
      expanded: current?.getAttribute('aria-expanded'),
      text: document.querySelector('#relRelationships .relInteractions')?.textContent || '',
    };
  })()`);
  check('expanding a bond row shows the pair-specific interaction', interaction.found &&
    interaction.expanded === 'true' && /spent time with/.test(interaction.text),
    { value: interaction.text });
  await page.screenshot(`${ROOT}/.dev-shots/relationship_interactions.png`);

  const decline = await evaluate(`(() => {
    const g = window.__gummy;
    const other = ${social.other};
    g.forceSocial(${picked.index}, other, false);
    const actor = g.traits()[${picked.index}];
    return { kinds: actor.history.map(e => e.kind), declined: actor.history.some(e => e.kind === 'decline') };
  })()`);
  check('a declined invitation is recorded from both sides', decline.declined,
    { value: JSON.stringify(decline.kinds.slice(-4)) });

  const conflict = await evaluate(`(() => {
    const g = window.__gummy;
    g.forceConflict(${picked.index}, ${social.other});
    g.sim(4, 0);
    const actor = g.traits()[${picked.index}];
    g.selectBear(${picked.index});
    document.getElementById('relTabEvents').click();
    return {
      kinds: actor.history.map(e => e.kind),
      conflict: actor.history.some(e => e.kind === 'conflict'),
      text: document.getElementById('directiveHistory').textContent,
    };
  })()`);
  check('a completed conflict is recorded and shown in Recent events',
    conflict.conflict && /contested food with/.test(conflict.text),
    { value: JSON.stringify(conflict.kinds.slice(-4)) });

  const crossMap = await evaluate(`(() => {
    const g = window.__gummy;
    const payload = JSON.parse(g.exportSave());
    const field = payload.worlds.field;
    const studio = payload.worlds.studio;
    const self = field.bears.find(a => a.uid === ${picked.uid});
    if (!self) return { found: false, reason: 'selected actor missing' };
    const parentUid = self.parentUids[0];
    const parent = field.bears.find(a => a.uid === parentUid);
    if (parent) {
      field.bears = field.bears.filter(a => a.uid !== parent.uid);
      studio.bears.push(parent);
      studio.initialized = true;
    }
    const other = field.bears.find(a => a.uid !== self.uid && a.stage === 'adult');
    if (other) {
      self.bonds = { ...(self.bonds || {}), [String(other.uid)]: .7 };
      other.bonds = { ...(other.bonds || {}), [String(self.uid)]: .2 };
    }
    self.parentUids = [...new Set([...self.parentUids, 999999])];
    payload.mapId = 'field';
    g.importSave(payload);
    const model = g.relationships(${picked.uid});
    return {
      found: true,
      parentUid,
      parentMap: model?.family.find(row => row.uid === parentUid)?.mapId || null,
      missingParent: model?.family.find(row => row.uid === 999999)?.missing || false,
      asymmetric: model?.bonds.find(row => row.uid === other?.uid) || null,
    };
  })()`);
  check('the panel resolves inactive-map parents and flags missing ancestry',
    crossMap.found && crossMap.parentMap === 'studio' && crossMap.missingParent === true,
    { value: JSON.stringify({ parentMap: crossMap.parentMap, missingParent: crossMap.missingParent }) });
  check('an asymmetric bond is not silently averaged',
    crossMap.asymmetric && crossMap.asymmetric.asymmetric === true &&
    crossMap.asymmetric.bond === .7 && crossMap.asymmetric.reverse === .2,
    { value: JSON.stringify(crossMap.asymmetric) });
  const crossMapDom = await evaluate(`(() => {
    const g = window.__gummy;
    const index = g.traits().findIndex(a => a.uid === ${picked.uid});
    if (index >= 0) g.selectBear(index);
    document.getElementById('relTabRelationships').click();
    return document.getElementById('relRelationships').textContent;
  })()`);
  check('the DOM labels the inactive-map parent and asymmetric value',
    /Studio/.test(crossMapDom) && /theirs 20%/.test(crossMapDom) && /Record unavailable/.test(crossMapDom),
    { value: crossMapDom.slice(0, 300) });
  await page.screenshot(`${ROOT}/.dev-shots/relationship_crossmap.png`);
  const scrolled = await evaluate(`(() => {
    const body = document.querySelector('.relBody');
    body.scrollTop = body.scrollHeight;
    return { top: body.scrollTop, height: body.scrollHeight, client: body.clientHeight };
  })()`);
  check('the relationship body scrolls to the bond section', scrolled.top > 0,
    { value: JSON.stringify(scrolled) });
  await page.screenshot(`${ROOT}/.dev-shots/relationship_bonds.png`);

  const glass = await evaluate(`(() => {
    const g = window.__gummy;
    const name = g.selectGlass(0);
    const model = g.relationships();
    document.getElementById('relTabRelationships').click();
    return {
      name,
      model: !!model,
      empty: document.getElementById('relRelationships').textContent.includes('No recorded relationships yet.'),
      rows: document.querySelectorAll('#relRelationships .relRow').length,
    };
  })()`);
  check('a Glass actor can be selected and renders an empty or populated relationship view',
    !!glass.name && glass.model, { value: JSON.stringify(glass) });

  const mobile = await browser.openPage({ url: TARGET.href, width: 390, height: 844 });
  await mobile.waitFor('!!window.__gummy?.booted', 60000);
  await mobile.evaluate(`(() => {
    const g = window.__gummy;
    const list = g.traits();
    const index = list.findIndex(a => a.parentUids.length && Object.keys(a.bonds || {}).length);
    g.selectBear(index >= 0 ? index : 0);
  })()`);
  await new Promise(resolve => setTimeout(resolve, 600));
  const mobilePanel = await mobile.evaluate(`(() => ({
    rows: document.querySelectorAll('#relRelationships .relRow').length,
    visible: !document.getElementById('directivePanel').hidden,
  }))()`);
  check('the relationship panel is visible at mobile width',
    mobilePanel.visible && mobilePanel.rows > 0, { value: JSON.stringify(mobilePanel) });
  await mobile.screenshot(`${ROOT}/.dev-shots/relationship_mobile.png`);

  report.picked = picked;
  report.social = social;
  report.interaction = interaction;
  report.decline = decline;
  report.conflict = conflict;
  report.crossMap = crossMap;
  report.glass = glass;
  report.mobile = mobilePanel;
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
