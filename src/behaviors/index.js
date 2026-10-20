// Behavior engine facade.
//
// The modular engine is the default. The legacy oracle in src/behavior.js stays
// available through `?behaviors=legacy` (or an explicit `engine: 'legacy'`).

import { createBehavior as createLegacyBehavior } from '../behavior.js';
import { createBehaviorModules } from './engine.js';
import { createBehaviorConfig, FEATURE_DEFAULTS } from './config.js';

export const BEHAVIOR_ENGINES = Object.freeze(['legacy', 'modules']);

export function behaviorEngineFromSearch(search = '') {
  const params = new URLSearchParams(search);
  const value = params.get('behaviors');
  return value === 'legacy' ? 'legacy' : 'modules';
}

export function createBehavior(options = {}) {
  const engine = options.engine === 'legacy' ? 'legacy' : 'modules';
  if (engine === 'modules') return createBehaviorModules(options);
  return createLegacyBehavior(options);
}

export { createBehaviorModules, createBehaviorConfig, FEATURE_DEFAULTS };
