// Optional meadow AI inspector. All controls are debug-only: they mutate the
// same AI state used by the normal loop, and the route overlay is a selected-bear
// view rather than a second navigation system.

const STATE_LABELS = {
  wander: 'Wander',
  seekFood: 'Seek food',
  seekWater: 'Seek water',
  eat: 'Eat',
  drink: 'Drink',
  seekHive: 'Seek hive',
  raidHive: 'Raid hive',
  flee: 'Fleeing',
  seekHome: 'Seek home',
  sleep: 'Sleeping',
  seekCompany: 'Seek company',
  invite: 'Inviting',
  social: 'Social',
  decline: 'Declining',
  visit: 'Home visit',
  seekConflict: 'Seek conflict',
  conflict: 'Conflict',
};

export function createAIDebug({ getBears, getAI, getField, isMeadow }) {
  const panel = document.getElementById('aiDebug');
  const button = document.getElementById('aiDebugBtn');
  const closeBtn = document.getElementById('aiDebugClose');
  const bearSel = document.getElementById('aiBear');
  const stateSel = document.getElementById('aiState');
  const hungerInput = document.getElementById('aiHunger');
  const thirstInput = document.getElementById('aiThirst');
  const socialInput = document.getElementById('aiSocial');
  const affectionInput = document.getElementById('aiAffection');
  const hungerVal = document.getElementById('aiHungerVal');
  const thirstVal = document.getElementById('aiThirstVal');
  const socialVal = document.getElementById('aiSocialVal');
  const affectionVal = document.getElementById('aiAffectionVal');
  const applyBtn = document.getElementById('aiApplyState');
  const routeBtn = document.getElementById('aiRoute');
  const hungryBtn = document.getElementById('aiMakeHungry');
  const thirstyBtn = document.getElementById('aiMakeThirsty');
  const lonelyBtn = document.getElementById('aiMakeLonely');
  const resetBtn = document.getElementById('aiResetBear');
  const noteEl = document.getElementById('aiDebugNote');
  const readoutEl = document.getElementById('aiDebugReadout');
  if (!panel || !button || !bearSel || !stateSel) return null;

  let open = false;
  let selectedSlot = null;
  let routeOn = false;
  let acc = 0;
  let optionSig = '';

  function list() {
    return getBears().filter(b => b.active);
  }

  function bear() {
    const bears = list();
    return bears.find(b => b.slot === selectedSlot) || bears[0] || null;
  }

  function ai() {
    return getAI();
  }

  function field() {
    return getField();
  }

  function setNote(text, bad = false) {
    if (!noteEl) return;
    noteEl.textContent = text || '';
    noteEl.classList.toggle('bad', !!bad);
  }

  function setRoute(on) {
    routeOn = !!on;
    if (routeBtn) {
      routeBtn.setAttribute('aria-pressed', String(routeOn));
      routeBtn.classList.toggle('on', routeOn);
      routeBtn.textContent = routeOn ? 'Hide route' : 'Show route';
    }
    if (!routeOn && field()) field().setAIPlan([], null);
  }

  function syncBears() {
    const bears = list();
    const sig = bears.map(b => `${b.slot}:${b.name || ''}:${b.stage || ''}`).join('|');
    if (sig !== optionSig) {
      optionSig = sig;
      const prior = selectedSlot;
      bearSel.innerHTML = '';
      for (const b of bears) {
        const opt = document.createElement('option');
        opt.value = String(b.slot);
        opt.textContent = `${b.name || 'Gummy'}${b.stage && b.stage !== 'adult' ? ` · ${b.stage}` : ''}`;
        bearSel.append(opt);
      }
      selectedSlot = bears.some(b => b.slot === prior) ? prior : (bears[0] ? bears[0].slot : null);
    }
    if (selectedSlot !== null) bearSel.value = String(selectedSlot);
  }

  function syncControls(force = false) {
    const b = bear();
    const a = b && b.ai;
    if (!b) {
      if (readoutEl) readoutEl.textContent = 'No active meadow bears.';
      return;
    }
    if (document.activeElement !== stateSel) {
      const state = a ? a.state : 'wander';
      const forceable = Array.from(stateSel.options).some(o => o.value === state);
      stateSel.value = forceable ? state : '';
    }
    if (document.activeElement !== hungerInput) hungerInput.value = String(b.hunger ?? .3);
    if (document.activeElement !== thirstInput) thirstInput.value = String(b.thirst ?? .3);
    if (socialInput && document.activeElement !== socialInput) socialInput.value = String(b.social ?? .3);
    if (affectionInput && document.activeElement !== affectionInput) affectionInput.value = String(b.affection ?? .25);
    hungerVal.textContent = (b.hunger ?? .3).toFixed(2);
    thirstVal.textContent = (b.thirst ?? .3).toFixed(2);
    if (socialVal) socialVal.textContent = (b.social ?? .3).toFixed(2);
    if (affectionVal) affectionVal.textContent = (b.affection ?? .25).toFixed(2);
    if (readoutEl) {
      const label = a ? (STATE_LABELS[a.state] || a.state) : 'No AI';
      const target = a && a.target ? `${a.target.x.toFixed(1)}, ${a.target.z.toFixed(1)}` : '—';
      const source = a && a.source ? a.source.id : '—';
      const path = a && a.path ? a.path.length : 0;
      const partner = a && a.partner ? (a.partner.name || 'bear') : '—';
      const bond = a && a.partner && ai() ? (() => {
        const p = a.partner;
        const k = (x) => String(x.uid !== undefined ? x.uid : x.slot);
        const ba = Number(b.bonds?.[k(p)] ?? 0);
        const bb = Number(p.bonds?.[k(b)] ?? 0);
        return ((ba + bb) * .5).toFixed(2);
      })() : '—';
      readoutEl.textContent =
        `${label} · hunger ${(b.hunger ?? 0).toFixed(2)} · thirst ${(b.thirst ?? 0).toFixed(2)}\n` +
        `health ${(b.health ?? 0).toFixed(0)} · energy ${(b.energy ?? 0).toFixed(2)} · pace ${(b.hopSpeedMin ?? 0).toFixed(2)}–${(b.hopSpeedMax ?? 0).toFixed(2)} · ${b.home || 'no home'}\n` +
        `social ${(b.social ?? 0).toFixed(2)} · affection ${(b.affection ?? 0).toFixed(2)} · partner ${partner} · bond ${bond}\n` +
        `target ${target} · path ${path} · source ${source}` +
        (a && a.interrupted ? ' · interrupted' : '') +
        (b.sleeping ? ' · sleeping' : '');
    }
  }

  function updateRoute() {
    const f = field();
    const b = bear();
    if (!f || !routeOn || !b || !b.ai || b.ai.interrupted) {
      if (f) f.setAIPlan([], null);
      return;
    }
    const a = b.ai;
    const pts = [{ x: b.cx, z: b.cz }];
    if (a.path) {
      for (const p of a.path) {
        const last = pts[pts.length - 1];
        if (Math.hypot(p.x - last.x, p.z - last.z) > .08) pts.push({ x: p.x, z: p.z });
      }
    }
    const target = a.target || (a.source ? { x: a.source.approachX, z: a.source.approachZ } : null) ||
      (a.waterSpot ? { x: a.waterSpot.x, z: a.waterSpot.z } : null);
    if (target) {
      const last = pts[pts.length - 1];
      if (Math.hypot(target.x - last.x, target.z - last.z) > .08) pts.push({ x: target.x, z: target.z });
    }
    f.setAIPlan(pts, target);
  }

  function applyNeed(kind, value) {
    const b = bear();
    const a = ai();
    if (!b) return;
    if (a) a.setNeed(b, kind, value);
    else b[kind] = Math.max(0, Math.min(1, value));
    if (b.ai) b.ai.nextThink = 0;
    setNote('');
    syncControls(true);
    updateRoute();
  }

  function applyState() {
    const b = bear();
    const a = ai();
    if (!b || !a) return;
    if (!stateSel.value) {
      setNote('automatic states are shown in the readout');
      return;
    }
    const result = a.debugState(b, stateSel.value);
    setNote(result.note || '', !result.ok);
    syncControls(true);
    updateRoute();
  }

  function resetBear() {
    const b = bear();
    const a = ai();
    if (!b) return;
    if (a) {
      a.setNeed(b, 'hunger', .3);
      a.setNeed(b, 'thirst', .3);
      a.setNeed(b, 'social', .3);
      a.setNeed(b, 'affection', .25);
      b.health = 100;
      b.energy = 1;
      a.debugState(b, 'wander');
    }
    setNote('needs and task reset');
    syncControls(true);
    updateRoute();
  }

  function setOpen(on) {
    open = !!on && isMeadow() && !document.body.classList.contains('ui-hidden');
    panel.classList.toggle('on', open);
    panel.setAttribute('aria-hidden', String(!open));
    button.setAttribute('aria-pressed', String(open));
    button.classList.toggle('on', open);
    if (open) {
      syncBears();
      syncControls(true);
      updateRoute();
    } else {
      setRoute(false);
    }
  }

  function toggle() {
    setOpen(!open);
  }

  function selectByIndex(index) {
    const b = getBears()[index];
    if (!b) return false;
    selectedSlot = b.slot;
    if (open) {
      syncBears();
      syncControls(true);
      updateRoute();
    }
    return true;
  }

  function update(dt) {
    if (!isMeadow()) {
      if (open) setOpen(false);
      if (routeOn) setRoute(false);
      return;
    }
    if (!open && !routeOn) return;
    acc += dt;
    if (acc < .20) return;
    acc = 0;
    if (open) {
      syncBears();
      syncControls();
    }
    updateRoute();
  }

  button.addEventListener('click', toggle);
  closeBtn?.addEventListener('click', () => setOpen(false));
  bearSel.addEventListener('change', () => {
    selectedSlot = Number(bearSel.value);
    syncControls(true);
    updateRoute();
  });
  hungerInput?.addEventListener('input', () => applyNeed('hunger', Number(hungerInput.value)));
  thirstInput?.addEventListener('input', () => applyNeed('thirst', Number(thirstInput.value)));
  socialInput?.addEventListener('input', () => applyNeed('social', Number(socialInput.value)));
  affectionInput?.addEventListener('input', () => applyNeed('affection', Number(affectionInput.value)));
  hungryBtn?.addEventListener('click', () => applyNeed('hunger', .90));
  thirstyBtn?.addEventListener('click', () => applyNeed('thirst', .90));
  lonelyBtn?.addEventListener('click', () => applyNeed('social', .92));
  applyBtn?.addEventListener('click', applyState);
  routeBtn?.addEventListener('click', () => setRoute(!routeOn));
  resetBtn?.addEventListener('click', resetBear);

  return {
    update,
    setOpen,
    toggle,
    onMapChanged() { if (!isMeadow()) setOpen(false); },
    selectByIndex,
    showRoute(on) { setRoute(on); return routeOn; },
    state() {
      const b = bear();
      return {
        open,
        selected: b ? b.slot : null,
        routeOn,
        plan: b && b.ai ? ai()?.plan(b) : null,
      };
    },
  };
}
