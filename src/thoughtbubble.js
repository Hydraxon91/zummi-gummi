// UI-only thought bubbles.
//
// Reads the existing debug plan (`plan().reason`) and projects actor positions.
// It never draws RNG, calls behavior code or writes actor state. The overlay is
// disabled unless the `thoughtBubbles` feature flag is on.

export function thoughtBubbleRows(actors, getPlan, project, maxBubbles = 12) {
  const rows = [];
  for (const actor of actors || []) {
    if (!actor || !actor.active || !actor.ai) continue;
    const screen = project(actor);
    if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y) ||
        screen.z < -1 || screen.z > 1 ||
        screen.x < -80 || screen.y < -80 ||
        screen.x > screen.width + 80 || screen.y > screen.height + 80) continue;
    const plan = getPlan(actor);
    if (!plan || !plan.reason) continue;
    rows.push({
      uid: actor.uid, text: plan.reason, x: screen.x, y: screen.y,
      width: screen.width, height: screen.height,
      mood: Number.isFinite(plan.mood) ? plan.mood : null,
      moodLabel: plan.moodLabel || null,
    });
    if (rows.length >= maxBubbles) break;
  }
  return rows;
}

// Deterministic label placement: keep bubbles inside the central safe area and
// push overlapping boxes upward (then sideways). No RNG and no per-frame churn.
export function layoutThoughtRows(rows, viewport = null, { maxWidth = 210, gap = 5 } = {}) {
  if (!rows.length) return rows;
  const width = viewport?.width || rows[0].width || 1440;
  const height = viewport?.height || rows[0].height || 900;
  const inset = width > 900 ? Math.max(180, width * .27) : Math.max(8, width * .05);
  const minX = inset + maxWidth / 2;
  const maxX = width - inset - maxWidth / 2;
  const minY = 46;
  const maxY = height - 46;
  const placed = [];
  const ordered = rows.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.uid - b.uid));
  for (const row of ordered) {
    const boxWidth = Math.min(maxWidth, 22 + row.text.length * 6.1);
    const boxHeight = 26;
    const half = boxWidth / 2;
    let x = Math.max(minX, Math.min(maxX, row.x));
    let y = Math.max(minY + boxHeight, Math.min(maxY, row.y));
    for (let attempt = 0; attempt < 14; attempt++) {
      const hit = placed.find(other =>
        x + half > other.left && x - half < other.right &&
        y > other.top && y - boxHeight < other.bottom);
      if (!hit) break;
      if (attempt < 8) {
        y = hit.top - gap;
      } else {
        x = hit.right + half + gap;
        if (x > maxX) x = hit.left - half - gap;
        y = row.y;
      }
      x = Math.max(minX, Math.min(maxX, x));
      y = Math.max(minY + boxHeight, Math.min(maxY, y));
    }
    row.x = x;
    row.y = y;
    placed.push({ left: x - half, right: x + half, top: y - boxHeight, bottom: y });
  }
  return rows;
}

export function createThoughtBubbleOverlay({
  container,
  project,
  getActors,
  getPlan,
  isEnabled,
  maxBubbles = 12,
} = {}) {
  if (!container || typeof project !== 'function') {
    throw new Error('thought bubble overlay needs a container and projector');
  }
  const doc = container.ownerDocument || document;
  const bubbles = new Map();
  let accum = 0;
  let last = { enabled: false, count: 0, rows: [] };
  let active = false;

  function hide() {
    for (const el of bubbles.values()) el.style.display = 'none';
    container.hidden = true;
    container.classList.remove('on');
    active = false;
    last = { enabled: false, count: 0, rows: [] };
    return last;
  }

  function update(dt = 0, force = false) {
    if (!isEnabled || !isEnabled()) return hide();
    if (!force) {
      accum += Math.max(0, Number(dt) || 0);
      if (active && accum < .18) return last;
      accum = 0;
    }
    const rows = thoughtBubbleRows(getActors ? getActors() : [], getPlan, project, maxBubbles);
    if (rows.length) layoutThoughtRows(rows, { width: rows[0].width, height: rows[0].height });
    const live = new Set(rows.map(row => String(row.uid)));
    for (const [uid, el] of bubbles) {
      if (!live.has(uid)) el.style.display = 'none';
    }
    for (const row of rows) {
      const key = String(row.uid);
      let el = bubbles.get(key);
      if (!el) {
        el = doc.createElement('div');
        el.className = 'thoughtBubble';
        el.setAttribute('aria-hidden', 'true');
        container.append(el);
        bubbles.set(key, el);
      }
      if (el.textContent !== row.text) el.textContent = row.text;
      if (row.moodLabel) el.dataset.mood = row.moodLabel;
      else delete el.dataset.mood;
      el.style.display = 'block';
      el.style.left = `${row.x.toFixed(1)}px`;
      el.style.top = `${row.y.toFixed(1)}px`;
    }
    container.hidden = false;
    container.classList.add('on');
    active = true;
    last = { enabled: true, count: rows.length, rows: rows.map(row => ({ ...row })) };
    return last;
  }

  return {
    update,
    refresh: () => update(1, true),
    state: () => ({ ...last, rows: last.rows.map(row => ({ ...row })) }),
    hide,
    destroy() {
      for (const el of bubbles.values()) el.remove();
      bubbles.clear();
      container.replaceChildren();
      hide();
    },
  };
}
