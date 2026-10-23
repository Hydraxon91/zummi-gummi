// Pure save-panel descriptors and keyed DOM controllers.
//
// The descriptors copy only the values the save lists display. The controllers
// own row/button reuse and their own listeners. Storage, commands, notes and
// the session gate stay in the app and arrive through injected actions.

const SAVE_SLOT_ORDER = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

function recordList(records) {
  return Array.isArray(records) ? records : [];
}

function byId(records) {
  return new Map(recordList(records).map(rec => [rec.id, rec]));
}

// Fixed Settings storage rows. `metaText` preserves the app's formatting;
// empty slots use the current label/“Empty” fallbacks.
export function buildSaveSlotRows(records, {
  labels = {},
  autosaveId = 'autosave',
  metaText = () => '',
} = {}) {
  const saved = byId(records);
  return [...SAVE_SLOT_ORDER, autosaveId].map(id => {
    const rec = saved.get(id);
    const empty = !rec;
    return {
      id,
      key: String(id),
      name: rec ? rec.name : labels[id],
      detail: rec ? metaText(rec) : 'Empty',
      empty,
      canSave: id !== autosaveId,
      canLoad: !empty,
      canDelete: !empty,
      canRename: !empty && id !== autosaveId,
    };
  });
}

// Menu load rows preserve the storage list order exactly.
export function buildMenuSaveRows(records, { metaText = () => '' } = {}) {
  return recordList(records).map(rec => ({
    id: rec.id,
    key: String(rec.id),
    name: rec.name,
    detail: metaText(rec),
  }));
}

function removeChild(child) {
  if (child && child.parentNode) child.parentNode.removeChild(child);
}

function runAction(action, id, record, actions, confirm) {
  if (action === 'load' && confirm && !confirm('Load this save? Current progress will be replaced.')) return;
  if (action === 'delete' && confirm && !confirm('Delete this save?')) return;
  const fn = actions && actions[action];
  return fn ? fn(id, record) : undefined;
}

// Settings save-slot list. One controller listener binding per created button;
// repeated renders reuse both rows and buttons.
export function createSaveSlotsPanel({
  list,
  labels = {},
  autosaveId = 'autosave',
  metaText = () => '',
  actions = {},
  makeButton,
  confirm,
  documentRef = document,
}) {
  const rows = new Map();
  let initialized = false;
  let destroyed = false;

  function claimList() {
    if (initialized || !list) return;
    list.textContent = '';
    initialized = true;
  }

  function ensureButton(state, action, label, primary) {
    if (state.buttons.has(action)) return state.buttons.get(action);
    const button = makeButton(label, () => {
      if (destroyed) return;
      return runAction(action, state.id, state.record, actions, confirm);
    }, !!primary);
    state.buttons.set(action, button);
    state.row.append(button);
    return button;
  }

  function createRow(desc) {
    const row = documentRef.createElement('div');
    row.className = 'saveRow';
    const meta = documentRef.createElement('div');
    meta.className = 'saveMeta';
    const title = documentRef.createElement('b');
    const detail = documentRef.createElement('small');
    meta.append(title, detail);
    row.append(meta);
    const state = {
      id: desc.id,
      key: desc.key,
      row,
      meta,
      title,
      detail,
      record: null,
      buttons: new Map(),
    };
    rows.set(desc.key, state);
    if (desc.canSave) ensureButton(state, 'save', 'Save', true);
    return state;
  }

  function syncButtons(state, desc) {
    const visible = {
      save: desc.canSave,
      load: desc.canLoad,
      delete: desc.canDelete,
      rename: desc.canRename,
    };
    if (visible.load) ensureButton(state, 'load', 'Load', false);
    if (visible.delete) ensureButton(state, 'delete', 'Delete', false);
    if (visible.rename) ensureButton(state, 'rename', 'Rename', false);
    for (const [action, enabled] of Object.entries(visible)) {
      const button = state.buttons.get(action);
      if (button) button.hidden = !enabled;
    }
  }

  function render(records) {
    if (destroyed || !list) return;
    claimList();
    // A previous storage failure may have replaced the list text directly.
    // Recover by clearing that foreign content before reattaching owned rows.
    if (initialized && rows.size && list.children.length === 0) list.textContent = '';
    const saved = byId(records);
    const descriptors = buildSaveSlotRows(records, { labels, autosaveId, metaText });
    for (const desc of descriptors) {
      let state = rows.get(desc.key);
      if (!state) {
        state = createRow(desc);
        list.append(state.row);
      } else if (state.row.parentNode !== list) {
        list.append(state.row);
      }
      state.record = saved.get(desc.id) || null;
      state.title.textContent = desc.name;
      state.detail.textContent = desc.detail;
      syncButtons(state, desc);
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const state of rows.values()) removeChild(state.row);
    rows.clear();
  }

  return { render, destroy };
}

// Main-menu load list. Rows are keyed by record id and moved into input order;
// the empty message is created once per empty transition and reused.
export function createMenuSaveList({
  list,
  actions = {},
  makeButton,
  metaText = () => '',
  documentRef = document,
}) {
  const rows = new Map();
  let emptyEl = null;
  let initialized = false;
  let destroyed = false;

  function claimList() {
    if (initialized || !list) return;
    list.textContent = '';
    initialized = true;
  }

  function createRow(desc) {
    const row = documentRef.createElement('div');
    row.className = 'menuSaveRow';
    const meta = documentRef.createElement('div');
    meta.className = 'saveMeta';
    const title = documentRef.createElement('b');
    const detail = documentRef.createElement('small');
    meta.append(title, detail);
    const button = makeButton('Load', () => {
      if (destroyed) return;
      return runAction('load', state.id, state.record, actions, undefined);
    }, true);
    row.append(meta, button);
    const state = { id: desc.id, key: desc.key, row, title, detail, record: null, button };
    rows.set(desc.key, state);
    return state;
  }

  function render(records) {
    if (destroyed || !list) return;
    claimList();
    const source = recordList(records);
    const saved = byId(source);
    const descriptors = buildMenuSaveRows(source, { metaText });
    const seen = new Set();
    const desired = [];
    for (const desc of descriptors) {
      seen.add(desc.key);
      let state = rows.get(desc.key);
      if (!state) {
        state = createRow(desc);
      }
      state.record = saved.get(desc.id) || null;
      state.title.textContent = desc.name;
      state.detail.textContent = desc.detail;
      desired.push(state);
    }
    for (const [key, state] of rows) {
      if (seen.has(key)) continue;
      removeChild(state.row);
      rows.delete(key);
    }
    if (!descriptors.length) {
      if (!emptyEl) {
        emptyEl = documentRef.createElement('p');
        emptyEl.className = 'menuEmpty';
        emptyEl.textContent = 'No saves yet. Start a new game, then save from Settings.';
      }
      list.append(emptyEl);
    } else {
      removeChild(emptyEl);
      const sameOrder = list.children.length === desired.length
        && desired.every((state, index) => list.children[index] === state.row);
      if (!sameOrder) for (const state of desired) list.append(state.row);
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const state of rows.values()) removeChild(state.row);
    rows.clear();
    removeChild(emptyEl);
    emptyEl = null;
  }

  return { render, destroy };
}
