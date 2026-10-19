// Advanced graphics settings: validation, local persistence and DOM controls.
// Runtime systems remain owned by app/effects/field/trees.
export const GRAPHICS_GROUPS = [
  ['display', 'Display & shadows', [
    ['tier', 'Quality tier', 'select', -1, [[-1, 'Preset / adaptive'], [0, '1 · highest'], [1, '2 · high'], [2, '3 · medium'], [3, '4 · low']]],
    ['shadows', 'Shadow resolution', 'select', -1, [[-1, 'Follow tier'], [0, 'Blob only'], [512, '512'], [1024, '1024'], [2048, '2048']]],
    ['foliageShadows', 'Foliage shadows ⚠', 'checkbox', false],
  ]],
  ['foliage', 'Grass & tree LOD', [
    ['grassNear', 'Grass detail distance (m)', 'range', 30, 10, 70, 1],
    ['grassFar', 'Grass low-detail distance (m)', 'range', 36, 12, 76, 1],
    ['leafNear', 'Tree thinning starts (m)', 'range', 42, 10, 100, 1],
    ['leafFar', 'Tree thinning ends (m)', 'range', 68, 12, 150, 1],
    ['leafKeep', 'Far leaf density', 'range', .6, .25, 1, .01],
  ]],
  ['effects', 'Post-processing detail', [
    ['bloom', 'Bloom strength', 'range', 1, 0, 2, .01],
    ['threshold', 'Bloom threshold offset', 'range', 0, -.5, .5, .01],
    ['exposure', 'Exposure multiplier', 'range', 1, .25, 1.5, .01],
    ['ao', 'Ambient occlusion strength', 'range', 1, 0, 2, .01],
    ['aa', 'SMAA antialiasing', 'checkbox', true],
    ['aperture', 'Depth-of-field strength', 'range', 1, 0, 2, .01],
  ]],
  ['rays', 'God rays · experimental ⚠', [
    ['rays', 'Enable god rays', 'checkbox', false],
    ['rayStrength', 'Ray strength', 'range', 1.4, 0, 3, .01],
    ['rayTint', 'Ray colour tint', 'color', '#ffffff'],
    ['rayDensity', 'Air density', 'range', 1 / 85, .001, .05, .001],
    ['rayMaxDensity', 'Maximum density', 'range', .6, .05, 1, .01],
    ['rayDistance', 'Ray distance (m)', 'range', 90, 10, 150, 1],
    ['raySteps', 'Ray samples ⚠', 'range', 24, 8, 64, 1],
    ['rayResolution', 'Ray resolution ⚠', 'select', .25, [[.125, 'Eighth'], [.25, 'Quarter'], [.5, 'Half'], [1, 'Full']]],
    ['rayDepthAware', 'Depth-aware sharpening', 'checkbox', true],
  ]],
  ['environment', 'Environment', [
    ['wind', 'Wind strength', 'range', 1, 0, 1.8, .05],
  ]],
];
const descriptors = GRAPHICS_GROUPS.flatMap(g => g[2]);
export const GRAPHICS_DEFAULTS = Object.fromEntries(descriptors.map(d => [d[0], d[3]]));
export function normalizeGraphics(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const out = { ...GRAPHICS_DEFAULTS };
  for (const [key, , type, fallback, min, max] of descriptors) {
    const v = input[key];
    if (type === 'checkbox') out[key] = typeof v === 'boolean' ? v : fallback;
    else if (type === 'color') out[key] = typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    else if (type === 'select') out[key] = Number.isFinite(v) && min.some(o => o[0] === v) ? v : fallback;
    else out[key] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  }
  out.raySteps = Math.round(out.raySteps);
  out.grassFar = Math.max(out.grassNear + 2, out.grassFar);
  out.leafFar = Math.max(out.leafNear + 2, out.leafFar);
  return out;
}
export function readGraphics() {
  let stored = {};
  try {
    const parsed = JSON.parse(localStorage.getItem('gummy.graphics') || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
  } catch (err) {}
  const flags = new URLSearchParams(location.search);
  if (flags.get('godrays') === 'good') stored.rays = true;
  if (flags.get('foliageShadows') === '1') stored.foliageShadows = true;
  return normalizeGraphics(stored);
}
export function createGraphicsPanel(root, { get, change, reset }) {
  const controls = [];
  for (const [id, title, rows] of GRAPHICS_GROUPS) {
    const section = document.createElement('details');
    section.className = 'settingsSection advancedGraphics';
    const summary = document.createElement('summary');
    summary.textContent = title;
    section.append(summary);
    for (const [key, text, type, , min, max, step] of rows) {
      const row = document.createElement('label');
      row.className = 'settingsRow';
      const label = document.createElement('span');
      label.textContent = text;
      const input = document.createElement(type === 'select' ? 'select' : 'input');
      input.id = `graphics_${key}`;
      input.setAttribute('aria-label', text);
      if (type === 'select') {
        for (const [value, name] of min) {
          const option = document.createElement('option');
          option.value = value; option.textContent = name; input.append(option);
        }
      } else {
        input.type = type;
        if (type === 'range') { input.min = min; input.max = max; input.step = step; }
      }
      const value = document.createElement('b');
      row.append(label, input, value);
      input.addEventListener(type === 'range' ? 'input' : 'change', () => {
        change({ [key]: type === 'checkbox' ? input.checked : type === 'color' ? input.value : Number(input.value) });
      });
      section.append(row);
      controls.push({ key, type, input, value });
    }
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'settingsAction';
    button.textContent = 'Reset section'; button.addEventListener('click', () => reset(id));
    section.append(button);
    root.append(section);
  }
  const note = document.createElement('p');
  note.className = 'settingsNote';
  root.append(note);
  return {
    sync(status = '') {
      const state = get();
      for (const c of controls) {
        if (c.type === 'checkbox') c.input.checked = state[c.key];
        else c.input.value = String(state[c.key]);
        c.value.textContent = c.type === 'range' ? Number(state[c.key].toFixed(3)) : '';
      }
      note.textContent = status;
    },
  };
}
