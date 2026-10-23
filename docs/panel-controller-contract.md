# Panel controller contract

`src/panelcontroller.js` and `src/savepanel.js` own the menu/settings/save-panel
DOM lifecycle extracted in E4/M20b. Commands, storage, session gating, settings
application and simulation state remain in `src/app.js`.

## Producer and consumers

- `src/savepanel.js`
  - `buildSaveSlotRows(records, { labels, autosaveId, metaText })` produces the
    fixed Settings rows in `slot1..slot5, autosave` order.
  - `buildMenuSaveRows(records, { metaText })` produces menu rows in the
    storage list order.
  - `createSaveSlotsPanel(...)` owns the Settings `#savesList` keyed rows.
  - `createMenuSaveList(...)` owns the main-menu `#menuSaveList` keyed rows and
    empty message.
- `src/panelcontroller.js`
  - `createPanelView(...)` owns `open`/`aria-hidden` updates, `body.menu-open`,
    `body.modal-open` and help/settings backdrop listeners.
  - `escapeTarget(state)` returns the current Escape target priority.
- App consumers: `refreshSavesUI`, `refreshMenuSaves`, `setHelp`, `setSettings`,
  `setMenu`, `setPaused`, `openMenuSlots` and the global Escape handler.

## Save row contract

`buildSaveSlotRows` copies only display values. Missing slots use the injected
`labels[id]` name and `Empty` detail. A present record uses `metaText(rec)` for
its detail. Fields:

| Field | Rule |
| --- | --- |
| `id`, `key` | fixed slot id; `key` is `String(id)` |
| `name` | record name, else `labels[id]` |
| `detail` | `metaText(rec)`, else `Empty` |
| `empty` | no record |
| `canSave` | every slot except the autosave id |
| `canLoad`, `canDelete` | record present |
| `canRename` | record present and not autosave |

`buildMenuSaveRows` keeps input order and emits `{ id, key, name, detail }` from
the supplied records and `metaText`.

The controllers reuse rows and buttons by stable slot/record key. Repeated
renders update title/detail, record association and button visibility without
replacing rows, so focus on a created button survives a refresh. Buttons are
created once per key/action and hidden when unavailable; the autosave row never
creates Save or Rename. `makeButton` is app `saveButton`, so disabled/error
handling is unchanged. The settings controller gates Load/Delete through the
injected `confirm`; Save reuses the current slot name and Rename keeps its
existing prompt. Menu rows use
the injected `load` action, which closes the slots sheet and starts the load in
the app.

`destroy()` removes controller-created rows and makes later renders inert. It
does not remove non-controller content and is not called during normal app
lifetime.

## Panel state contract

`createPanelView({ documentRef, menu, pause, slots, help, settings, body,
onBackdrop })` renders only the supplied state:

- each panel gets `open` and `aria-hidden`;
- `body.menu-open = menu || paused`;
- `body.modal-open = help || settings`;
- clicking the help/settings backdrop calls `onBackdrop('help'|'settings')`.

Help/settings mutual exclusion stays in the app's `setHelp`/`setSettings`
transitions; the view does not silently change supplied booleans.

`escapeTarget(state)` returns `slots`, then `modal` (help/settings), then
`pause`, else `null`. Possession/directive priority and the booted-menu fallback
remain in the app Escape handler.

## Preserved app ownership

`setMenu`, `setPaused`, `openMenuSlots`, `setMenuBusy`, `refreshMenuSaves`
ordering, `menuNote` busy/fixed data, settings refresh order
(`syncSettingsUI()` then `refreshSavesUI()`), save/storage commands, session
gate, `saveButton` and `syncSessionBusyUI`'s `#savesList button` scan are
app-owned. Markup, CSS, save format, settings profiles and graphics panels are
unchanged.

Checks: `tests/savepanel.test.mjs`, `tests/panel-controller.test.mjs`,
`tests/rosterview.test.mjs`, full `node --test tests`, behavior contracts, short
parity, HTTP smoke and the affected browser probe.
