// Menu / pause / slots / help / settings panel view.
//
// This module owns only the existing open classes, aria-hidden state, body
// flags and overlay backdrop listeners. Menu busy state, save refreshes,
// commands, settings application and help/settings mutual exclusion stay in the
// app and arrive as already-decided state.

export function escapeTarget(state = {}) {
  if (state.slots) return 'slots';
  if (state.help || state.settings) return 'modal';
  if (state.paused) return 'pause';
  return null;
}

function syncPanel(element, open) {
  if (!element) return;
  element.classList.toggle('open', !!open);
  element.setAttribute('aria-hidden', String(!open));
}

export function createPanelView({
  documentRef = document,
  menu,
  pause,
  slots,
  help,
  settings,
  body = documentRef.body,
  onBackdrop,
} = {}) {
  const backdropHelp = event => {
    if (event.target === help && onBackdrop) onBackdrop('help');
  };
  const backdropSettings = event => {
    if (event.target === settings && onBackdrop) onBackdrop('settings');
  };

  if (help) help.addEventListener('pointerdown', backdropHelp);
  if (settings) settings.addEventListener('pointerdown', backdropSettings);

  function render(state = {}) {
    syncPanel(menu, state.menu);
    syncPanel(pause, state.paused);
    syncPanel(slots, state.slots);
    syncPanel(help, state.help);
    syncPanel(settings, state.settings);
    if (body) {
      body.classList.toggle('menu-open', !!(state.menu || state.paused));
      body.classList.toggle('modal-open', !!(state.help || state.settings));
    }
  }

  function destroy() {
    if (help) help.removeEventListener('pointerdown', backdropHelp);
    if (settings) settings.removeEventListener('pointerdown', backdropSettings);
  }

  return { render, destroy };
}
