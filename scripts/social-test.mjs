// Pair activities, rivalry/reconciliation, partnership, groups and Glass.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { connectBootedBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = new URL(process.env.GAME_URL || 'http://localhost:8000/');
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
const TAG = process.env.TAG || 'social';
const SCENARIO = process.env.SCENARIO || 'all';
if (SCENARIO === 'settings') TARGET.searchParams.set('race', 'off');
if (!['all', 'settings', 'pair', 'rivalry', 'partnership', 'groups', 'glass'].includes(SCENARIO)) {
  throw new Error(`Unknown social SCENARIO: ${SCENARIO}`);
}
const selected = name => SCENARIO === 'all' || SCENARIO === name;
const FAST = process.env.FAST === '1';
const WIDTH = Number(process.env.WIDTH || 1440);
const HEIGHT = Number(process.env.HEIGHT || 900);
const lowQuality = process.env.LOW_QUALITY === '1';
const qualityScript = lowQuality ? `(() => {
  try {
    localStorage.setItem('gummy.qualityLevel', '3');
    localStorage.setItem('gummy.qualityCap', '3');
    localStorage.setItem('gummy.adaptive', '0');
    localStorage.setItem('gummy.renderScale', '0.6');
    localStorage.setItem('gummy.effects', 'off');
    localStorage.setItem('gummy.profile', 'performance');
  } catch (error) {}
})()` : null;
const initScript = SCENARIO === 'settings' ? `(() => {
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => request(time => {
    if (!window.__ciStopFrames) callback(time);
  });
})();${qualityScript || ''}` : qualityScript;
const REPORT = `${ROOT}/.dev-shots/social-${TAG}-${SCENARIO}.json`;
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });

let launched = null;
let browser = null;
let page = null;
const evaluate = (expression, timeout = 30000) => page.evaluate(expression, timeout);
const report = { tag: TAG, scenario: SCENARIO, fast: FAST, pageErrors: [], checks: [] };
const check = (name, pass, detail = {}) => {
  report.checks.push({ name, pass: !!pass, ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail.value === undefined ? '' : ` (${detail.value})`}`);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  const connected = await connectBootedBrowser({
    page: { url: TARGET.href, width: WIDTH, height: HEIGHT, initScript },
    onRetry: (error, attempt, diag) => {
      report.bootAttempts = error.bootAttempts;
      report.bootRetry = { attempt, error: String(error).slice(0, 300),
        lastWaitError: diag && diag.lastWaitError };
      console.log('STEP boot retry', JSON.stringify(report.bootRetry));
    },
  });
  launched = connected.launched;
  browser = connected.browser;
  page = connected.page;
  report.pageErrors = browser.pageErrors;
  report.bootAttempt = connected.attempt;
  report.bootAttempts = connected.bootAttempts;
  if (process.env.RENDER_COMPARISON === '1') {
    report.rendering = await evaluate(`(() => {
      const { scene, renderer } = window.__gummy.three();
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { override: scene.overrideMaterial?.type || null,
        backend: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    })()`);
    report.rendering.mode = TARGET.searchParams.get('testRender') === 'opaque' ? 'opaque' : 'normal';
    if (report.rendering.override !== (report.rendering.mode === 'opaque' ? 'MeshBasicMaterial' : null)) {
      throw new Error('Comparison rendering mode did not match requested mode');
    }
  }
  if (SCENARIO !== 'settings') {
    await page.waitFor('window.__gummy.glass().count > 0 && window.__gummy.glass().actors.every(a => a.ready)', 150000);
  } else {
    // Settings assert DOM controls, not Glass rendering. Retain a real rendered
    // background, then avoid letting unrelated frames starve DOM/CDP requests.
    await page.waitFor('window.__gummy.three().renderer.info.render.frame > 0', 90000);
    await evaluate('window.__ciStopFrames = true');
  }
  await evaluate('window.__gummy.seed(421337)');
  if (FAST && SCENARIO !== 'settings') await evaluate('window.__gummy.pause(true)');

  if (selected('settings')) {
  const settings = await evaluate(`(() => {
    const ids = ['PairActivities', 'Rivalry', 'Reconciliation', 'Partnership', 'GroupActivities'];
    return ids.map(id => ({
      id, exists: !!document.getElementById('settings' + id),
      checked: document.getElementById('settings' + id)?.checked,
    }));
  })()`);
  check('social settings are present and default off',
    settings.every(row => row.exists && row.checked === false),
    { value: JSON.stringify(settings) });
  const gifting = await evaluate(`(() => {
    const box = document.getElementById('settingsGifting');
    if (!box) return false;
    const checked = box.checked;
    try {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      return window.__gummy.behaviorConfig().features.gifting === true;
    } finally {
      box.checked = checked;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);
  check('gifting setting enables the feature', gifting);
  }

  await evaluate(`(() => {
    const g = window.__gummy;
    for (const feature of ['pairActivities', 'rivalry', 'reconciliation', 'partnership', 'groupActivities']) {
      g.setBehaviorFeature(feature, true);
    }
    return true;
  })()`);
  if (selected('settings')) {
  await evaluate("document.getElementById('settingsBtn').click()");
  await sleep(400);
  await page.screenshot(`${ROOT}/.dev-shots/social_settings.png`);
  await evaluate("document.getElementById('settingsClose').click()");
  await sleep(250);
  }

  const setup = SCENARIO === 'settings' ? null : await evaluate(`(() => {
    const g = window.__gummy;
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    const x = source ? source.approachX : 6;
    const z = source ? source.approachZ : 6;
    const a = g.spawnAt(x, z, 0, 0);
    const b = g.spawnAt(x + .8, z + .1, 0, 0);
    const c = g.spawnAt(x - .8, z + .1, 0, 0);
    const d = g.spawnAt(x + .1, z - .8, 0, 0);
    g.sim(.1, 0);
    const list = g.traits();
    const index = uid => list.findIndex(actor => actor.uid === uid);
    return {
      a: a?.uid, b: b?.uid, c: c?.uid, d: d?.uid,
      ai: index(a?.uid), bi: index(b?.uid), ci: index(c?.uid), di: index(d?.uid),
    };
  })()`);

  if (selected('pair')) {
  const chat = await evaluate(`(() => {
    const g = window.__gummy;
    g.setSocial(${setup.ai}, .8);
    g.setAffection(${setup.ai}, .8);
    const result = g.socialByUid(${setup.a}, ${setup.b}, 'chat');
    g.sim(8, 0);
    const view = g.relationships(${setup.a});
    return {
      result,
      bond: g.traits().find(a => a.uid === ${setup.a})?.bonds?.[String(${setup.b})],
      history: g.relationships(${setup.a})?.events?.some(e => e.kind === 'chat'),
      state: g.traits().find(a => a.uid === ${setup.a})?.ai,
      view,
    };
  })()`);
  check('chat completes and records a reciprocal interaction',
    chat.result?.ok === true && chat.bond >= .02 && chat.history === true,
    { value: JSON.stringify({ result: chat.result, bond: chat.bond, history: chat.history, state: chat.state }) });

  const cuddle = await evaluate(`(() => {
    const g = window.__gummy;
    const snapshot = () => {
      const actors = g.bears.filter(b => b.uid === ${setup.a} || b.uid === ${setup.b});
      return {
        distance: actors.length === 2
          ? Math.hypot(actors[0].cx - actors[1].cx, actors[0].cz - actors[1].cz) : null,
        actors: actors.map(b => ({
          uid: b.uid, x: b.cx, z: b.cz, hunger: b.hunger, thirst: b.thirst,
          energy: b.energy, health: b.health, stage: b.stage, sleeping: b.sleeping,
          grabs: b.grabs, inside: b.inside, state: b.ai.state,
          partnerUid: b.ai.partner ? b.ai.partner.uid : null,
          role: b.ai.activityRole, timer: b.ai.activityT,
          familyTask: b.ai.familyTask ? {
            id: b.ai.familyTask.id, phase: b.ai.familyTask.phase, t: b.ai.familyTask.t,
          } : null,
          moving: b.ai.moving,
          target: b.ai.target ? { x: b.ai.target.x, z: b.ai.target.z } : null,
          path: b.ai.path ? b.ai.path.map(p => ({ x: p.x, z: p.z })) : null,
        })),
      };
    };
    g.setBond(${setup.ai}, ${setup.bi}, .4);
    const before = snapshot();
    const result = g.socialByUid(${setup.a}, ${setup.b}, 'cuddle');
    const admitted = snapshot();
    g.sim(7, 0);
    return {
      result,
      diagnostics: { before, admitted, after: snapshot(), simulatedSeconds: 7 },
      bond: g.traits().find(a => a.uid === ${setup.a})?.bonds?.[String(${setup.b})],
      history: g.relationships(${setup.a})?.events?.some(e => e.kind === 'cuddle'),
    };
  })()`);
  check('cuddle completes for a reciprocally bonded pair',
    cuddle.result?.ok === true && cuddle.bond >= .44 && cuddle.history === true,
    { value: JSON.stringify(cuddle) });
  report.chat = chat;
  report.cuddle = cuddle;
  }

  if (selected('rivalry')) {
  const conflict = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('pairActivities', false);
    g.setBehaviorFeature('partnership', false);
    g.setBehaviorFeature('groupActivities', false);
    g.setBehaviorFeature('reconciliation', false);
    const result = g.forceConflict(${setup.ai}, ${setup.bi});
    g.sim(8, 0);
    return {
      result,
      rivalsA: g.relationships(${setup.a})?.rivals?.map(r => r.uid) || [],
      rivalsB: g.relationships(${setup.b})?.rivals?.map(r => r.uid) || [],
    };
  })()`);
  check('a completed conflict records a symmetric rivalry',
    conflict.result?.ok === true && conflict.rivalsA.includes(setup.b) &&
    conflict.rivalsB.includes(setup.a),
    { value: JSON.stringify(conflict) });

  const reconcile = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('reconciliation', true);
    const before = g.traits().find(a => a.uid === ${setup.a})?.bonds?.[String(${setup.b})] || 0;
    const result = g.socialByUid(${setup.a}, ${setup.b}, 'reconcile');
    g.sim(20, 0);
    return {
      result,
      rivalsA: g.relationships(${setup.a})?.rivals?.map(r => r.uid) || [],
      rivalsB: g.relationships(${setup.b})?.rivals?.map(r => r.uid) || [],
      bond: g.traits().find(a => a.uid === ${setup.a})?.bonds?.[String(${setup.b})],
      before,
      history: g.relationships(${setup.a})?.events?.some(e => e.kind === 'reconcile'),
    };
  })()`);
  check('reconciliation clears both rivalry records and adds bond',
    reconcile.result?.ok === true && reconcile.rivalsA.length === 0 &&
    reconcile.rivalsB.length === 0 && reconcile.bond > reconcile.before &&
    reconcile.history === true,
    { value: JSON.stringify(reconcile) });
  report.conflict = conflict;
  report.reconcile = reconcile;
  }

  if (selected('partnership')) {
  const partner = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('partnership', true);
    const a = g.spawnAt(14, 7, 0, 0);
    const b = g.spawnAt(14.8, 7, 0, 0);
    g.sim(.1, 0);
    const list = g.traits();
    const ai = list.findIndex(actor => actor.uid === a?.uid);
    const bi = list.findIndex(actor => actor.uid === b?.uid);
    const bears = g.bears || [];
    // Force opposite sexes and adult stages for a compatible partnership.
    if (bears[ai]) bears[ai].sex = 'F';
    if (bears[bi]) bears[bi].sex = 'M';
    g.setBond(ai, bi, .7);
    const result = g.socialByUid(a?.uid, b?.uid, 'partner');
    g.sim(8, 0);
    const viewA = g.relationships(a?.uid);
    return {
      result, a: a?.uid, b: b?.uid,
      partner: viewA?.partner?.uid,
      reverse: g.relationships(b?.uid)?.partner?.uid,
      history: viewA?.events?.some(e => e.kind === 'partnered'),
    };
  })()`);
  check('partnership forms reciprocally and appears in the relationship view',
    partner.result?.ok === true && partner.partner === partner.b &&
    partner.reverse === partner.a && partner.history === true,
    { value: JSON.stringify(partner) });

  const separated = await evaluate(`(() => {
    const g = window.__gummy;
    const ok = g.separate(${partner.a});
    return {
      ok,
      left: g.relationships(${partner.a})?.partner,
      right: g.relationships(${partner.b})?.partner,
      history: g.relationships(${partner.a})?.events?.some(e => e.kind === 'separated'),
    };
  })()`);
  check('player separation clears both partnership sides',
    separated.ok === true && !separated.left && !separated.right && separated.history === true,
    { value: JSON.stringify(separated) });
  report.partner = partner;
  report.separated = separated;
  }

  if (selected('groups')) {
  // Keep unrelated mating from claiming these fixtures during their settling step.
  // Group acceptance and completion still use the real command protocol.
  const group = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('pairActivities', false);
    g.setBehaviorFeature('partnership', false);
    g.setBehaviorFeature('reconciliation', false);
    g.setBehaviorFeature('groupActivities', false);
    const actors = [
      g.spawnAt(-1, 8, 0, 0), g.spawnAt(-1.7, 8, 0, 0),
      g.spawnAt(-.3, 8, 0, 0), g.spawnAt(-1, 8.7, 0, 0),
    ];
    for (const actor of actors) {
      const bear = g.bears.find(item => item.uid === actor?.uid);
      if (bear) { bear.sex = 'F'; bear.mateCooldown = 120; }
    }
    g.sim(.1, 0);
    const members = actors.map(actor => actor?.uid);
    g.setBehaviorFeature('groupActivities', true);
    const result = g.groupByUids(members[0], members.slice(1));
    const snapshot = () => {
      const traits = g.traits();
      return members.map(uid => {
        const row = traits.find(a => a.uid === uid);
        const bear = g.bears.find(a => a.uid === uid);
        return { uid, state: row?.ai, x: +bear?.cx?.toFixed?.(2), z: +bear?.cz?.toFixed?.(2) };
      });
    };
    const first = snapshot();
    g.sim(1, 0);
    const after1 = snapshot();
    g.sim(6, 0);
    const after7 = snapshot();
    g.sim(12, 0);
    const traits = g.traits();
    const states = members.map(uid => traits.find(a => a.uid === uid)?.ai);
    const history = members.map(uid => g.relationships(uid)?.events?.some(e => e.kind === 'groupGather'));
    const bonds = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const actor = traits.find(a => a.uid === members[i]);
        bonds.push(actor?.bonds?.[String(members[j])]);
      }
    }
    return { result, members, first, after1, after7, states, history, bonds };
  })()`);
  check('a four-actor group completes with one bond per pair',
    group.result?.ok === true && group.states.every(state => state === 'wander') &&
    group.history.every(Boolean) && group.bonds.every(bond => bond >= .01),
    { value: JSON.stringify(group) });

  const groupDisabled = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('groupActivities', false);
    const actors = [
      g.spawnAt(2, 8, 0, 0), g.spawnAt(1.3, 8, 0, 0),
      g.spawnAt(2.7, 8, 0, 0), g.spawnAt(2, 8.7, 0, 0),
    ];
    for (const actor of actors) {
      const bear = g.bears.find(item => item.uid === actor?.uid);
      if (bear) { bear.sex = 'F'; bear.mateCooldown = 120; }
    }
    g.sim(.1, 0);
    const members = actors.map(actor => actor?.uid);
    g.setBehaviorFeature('groupActivities', true);
    const result = g.groupByUids(members[0], members.slice(1));
    const traits = g.traits();
    const active = members.filter(uid => traits.find(a => a.uid === uid)?.ai === 'group').length;
    g.setBehaviorFeature('groupActivities', false);
    const after = g.traits().filter(a => members.includes(a.uid)).map(a => a.ai);
    return { result, members, active, after };
  })()`);
  check('disabling groups releases every participant',
    groupDisabled.result?.ok === true && groupDisabled.active >= 3 &&
    groupDisabled.after.every(state => state !== 'group'),
    { value: JSON.stringify(groupDisabled) });
  report.group = group;
  report.groupDisabled = groupDisabled;
  }

  if (selected('glass')) {
  const glass = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('groupActivities', false);
    g.setBehaviorFeature('pairActivities', true);
    const state = g.glass();
    const glassActor = state?.actors?.[0];
    if (!glassActor) return { ok: false, reason: 'no glass' };
    const bear = g.spawnAt(glassActor.x + .8, glassActor.z, 0, 0);
    g.sim(.1, 0);
    const result = g.socialByUid(glassActor.uid, bear?.uid, 'chat');
    g.sim(8, 0);
    return {
      ok: result?.ok,
      state: result?.state,
      history: g.relationships(bear?.uid)?.events?.some(e => e.kind === 'chat'),
      glassHistory: g.relationships(glassActor.uid)?.events?.some(e => e.kind === 'chat'),
    };
  })()`);
  check('Glass participates in a pair activity',
    glass.ok === true && glass.history === true && glass.glassHistory === true,
    { value: JSON.stringify(glass) });
  report.glass = glass;
  }

  if (selected('partnership')) {
  const savedSetup = await evaluate(`(async () => {
    const g = window.__gummy;
    g.setBehaviorFeature('gifting', true);
    g.setBehaviorFeature('partnership', true);
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    const x = source ? source.approachX : 4;
    const z = source ? source.approachZ : 4;
    const a = g.spawnAt(x + 2, z + 2, 0, 0);
    const b = g.spawnAt(x + 2.8, z + 2, 0, 0);
    const c = g.spawnAt(x, z, 0, 0);
    const d = g.spawnAt(x + 5.5, z, 0, 0);
    g.sim(.1, 0);
    const list = g.traits();
    const ai = list.findIndex(row => row.uid === a?.uid);
    const bi = list.findIndex(row => row.uid === b?.uid);
    for (const [index, sex] of [[ai, 'F'], [bi, 'M']]) {
      if (g.bears[index]) g.bears[index].sex = sex;
    }
    g.setBond(ai, bi, .7);
    const partner = g.socialByUid(a?.uid, b?.uid, 'partner');
    for (let i = 0; i < 6 && !g.relationships(a?.uid)?.partner; i++) g.sim(4, 0);
    const prePartner = g.relationships(a?.uid)?.partner?.uid;
    const gift = g.giftByUid(c?.uid, d?.uid);
    g.sim(1.2, 0);
    const carriedBefore = g.carried();
    const beforePayload = JSON.parse(g.exportSave()).worlds.field.bears
      .filter(row => row.uid === a?.uid || row.uid === b?.uid)
      .map(row => ({ uid: row.uid, partnerUid: row.partnerUid, actorVersion: row.actorVersion }));
    await g.save('slot4', 'social');
    return {
      partner: { ...partner, a: a?.uid, b: b?.uid, pre: prePartner },
      gift, carriedBefore, beforePayload,
    };
  })()`, 120000);

  const savedAfter = await evaluate(`(async () => {
    const g = window.__gummy;
    const a = ${JSON.stringify(savedSetup.partner.a)};
    const b = ${JSON.stringify(savedSetup.partner.b)};
    await g.load('slot4');
    const afterPayload = JSON.parse(g.exportSave()).worlds.field.bears
      .filter(row => row.uid === a || row.uid === b)
      .map(row => ({ uid: row.uid, partnerUid: row.partnerUid, actorVersion: row.actorVersion }));
    return {
      afterPayload,
      after: {
        partnerA: g.relationships(a)?.partner?.uid,
        partnerB: g.relationships(b)?.partner?.uid,
        carried: g.carried(),
        portions: g.portions()?.list || [],
        version: JSON.parse(g.exportSave()).worlds.field.bears.find(row => row.uid === a)?.actorVersion,
      },
    };
  })()`, 120000);

  await evaluate("window.__gummy.setMap('studio')");
  await page.waitFor("window.__gummy.map().id === 'studio'", 30000);
  await page.waitFor("!document.getElementById('mapWipe').classList.contains('on')");
  const studioPortions = await evaluate("window.__gummy.portions()?.list || []");
  await evaluate("window.__gummy.setMap('field')");
  await page.waitFor("window.__gummy.map().id === 'field'", 30000);
  await page.waitFor("!document.getElementById('mapWipe').classList.contains('on')");
  const back = await evaluate(`(() => {
    const g = window.__gummy;
    return {
      portions: g.portions()?.list || [],
      partner: g.relationships(${JSON.stringify(savedSetup.partner.a)})?.partner?.uid,
    };
  })()`);

  const saved = {
    ...savedSetup,
    ...savedAfter,
    studioPortions,
    backPortions: back.portions,
    backPartner: back.partner,
  };
  check('v8 save restores partnership and converts carried food to a dropped portion',
    saved.partner?.ok === true && saved.carriedBefore.length > 0 &&
    saved.after.partnerA === saved.partner.b && saved.after.partnerB === saved.partner.a &&
    saved.after.carried.length === 0 && saved.after.version === 8 &&
    saved.backPartner === saved.partner.b &&
    (saved.after.portions || []).some(portion => portion.mapId === 'field'),
    { value: JSON.stringify(saved) });
  check('map switches preserve dropped portions on their originating map',
    saved.studioPortions.some(portion => portion.mapId === 'field') &&
    saved.backPortions.some(portion => portion.mapId === 'field'),
    { value: JSON.stringify({ studio: saved.studioPortions, back: saved.backPortions }) });

  const visual = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('partnership', true);
    const a = g.spawnAt(5, 9, 0, 0);
    const b = g.spawnAt(5.8, 9, 0, 0);
    g.sim(.1, 0);
    const list = g.traits();
    const ai = list.findIndex(row => row.uid === a?.uid);
    const bi = list.findIndex(row => row.uid === b?.uid);
    if (g.bears[ai]) g.bears[ai].sex = 'F';
    if (g.bears[bi]) g.bears[bi].sex = 'M';
    g.setBond(ai, bi, .7);
    const result = g.socialByUid(a?.uid, b?.uid, 'partner');
    g.sim(8, 0);
    g.selectBear(ai);
    const view = g.relationships(a?.uid);
    return {
      result, a: a?.uid, b: b?.uid,
      partner: view?.partner?.uid,
      relation: view?.partner?.relation,
      label: view?.bonds?.find(row => row.uid === b?.uid)?.friendship,
    };
  })()`);
  check('the relationship view exposes partner and friendship labels',
    visual.result?.ok === true && visual.partner === visual.b &&
    visual.relation === 'Partner' && visual.label === 'close friend',
    { value: JSON.stringify(visual) });
  if (FAST) await evaluate('window.__gummy.pause(false)');
  await sleep(350);
  await page.screenshot(`${ROOT}/.dev-shots/social_relationships.png`);
  if (FAST) await evaluate('window.__gummy.pause(true)');
  }

  if (selected('settings')) {
  let mobile = page;
  if (SCENARIO === 'settings') {
    // A second WebGL page starves under software rendering; the responsive check
    // only needs the same session at a phone viewport.
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    }, page.sessionId);
    await sleep(400);
  } else {
    await evaluate('window.__gummy.pause(true)');
    mobile = await browser.openPage({ url: TARGET.href, width: 390, height: 844, initScript });
    await mobile.waitFor('!!window.__gummy?.booted', 120000);
  }
  await mobile.evaluate("document.getElementById('settingsBtn').click()");
  await sleep(400);
  const mobileSettings = await mobile.evaluate(`(() => {
    const card = document.querySelector('.settingscard');
    const row = document.getElementById('settingsPairActivities');
    row?.scrollIntoView({ block: 'center' });
    return {
      visible: !!row,
      scrolled: card ? card.scrollTop > 0 : false,
      rows: ['PairActivities', 'Rivalry', 'Reconciliation', 'Partnership', 'GroupActivities']
        .every(id => !!document.getElementById('settings' + id)),
    };
  })()`);
  check('social settings are present at mobile width',
    mobileSettings.visible && mobileSettings.rows,
    { value: JSON.stringify(mobileSettings) });
  await mobile.screenshot(`${ROOT}/.dev-shots/social_settings_mobile.png`);
  const mobileGifting = await mobile.evaluate(`(() => {
    const box = document.getElementById('settingsGifting');
    box.scrollIntoView({ block: 'center' });
    return { visible: !!box, scrolled: document.querySelector('.settingscard').scrollTop > 0 };
  })()`);
  check('the gifting setting is present at mobile width', mobileGifting.visible && mobileGifting.scrolled,
    { value: JSON.stringify(mobileGifting) });
  await mobile.screenshot(`${ROOT}/.dev-shots/gifting_settings_mobile.png`);
  }

  report.setup = setup;
  report.errors = browser.pageErrors;
  const expected = { all: 16, settings: 4, pair: 2, rivalry: 2, partnership: 5, groups: 2, glass: 1 };
  if (report.checks.length !== expected[SCENARIO]) {
    throw new Error(`Incomplete ${SCENARIO} coverage: ${report.checks.length}/${expected[SCENARIO]} checks`);
  }
  console.log('REPORT', REPORT);
} catch (error) {
  report.failure = String(error.stack || error);
  console.error('STOP', report.failure);
} finally {
  report.harness = page ? page.diagnostics()
    : browser ? browser.diagnostics() : report.bootAttempts?.at(-1)?.diagnostics
      ? report.bootAttempts.at(-1).diagnostics
      : { launched: launched ? { stderr: launched.stderr, exit: launched.exit } : null };
  await writeFile(REPORT, JSON.stringify(report, null, 2));
  if (browser) await browser.close();
}

console.log('SUMMARY', JSON.stringify({ scenario: SCENARIO,
  checks: report.checks.map(({ name, pass }) => ({ name, pass })), failure: report.failure }));
if (report.failure || report.pageErrors.length || report.checks.some(check => !check.pass)) process.exitCode = 1;
