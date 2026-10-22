// Auditable support declarations, not a second dispatcher or a promise that all
// modules are toggleable. Unsupported policies do not change legacy behavior.
const contract = (id, configuration, disable = 'unsupported', registration = 'engine') =>
  Object.freeze({ id, configuration, disable, registration });

export const BEHAVIOR_CONTRACTS = Object.freeze([
  contract('hive', 'layered', 'legacy-unverified'),
  contract('rest', 'profile-only'),
  contract('forage', 'profile-only'),
  contract('water', 'profile-only'),
  contract('wander', 'profile-only'),
  contract('social', 'profile-only'),
  contract('mate', 'layered', 'finish-current'),
  contract('conflict', 'layered', 'legacy-unverified'),
  contract('follow', 'profile-only'),
  contract('stargaze', 'layered', 'legacy-unverified'),
  contract('family', 'profile-only'),
  contract('flee', 'profile-only'),
  // Feature flags manage these activities; a config module flag is not a
  // substitute for its separately tested feature-disable cleanup protocol.
  contract('gifting', 'layered', 'feature-only'),
  contract('pairActivities', 'layered', 'feature-only'),
  contract('relationships', 'layered', 'feature-only'),
  contract('groupActivities', 'layered', 'feature-only'),
  contract('directives', 'layered', 'legacy-unverified', 'capability'),
]);

export function checkBehaviorContracts({ engineModules, capabilities = [], configuredIds, contracts = BEHAVIOR_CONTRACTS }) {
  const errors = [];
  const actual = new Map();
  const owners = new Map();
  const opportunities = new Set();
  for (const [registration, modules] of [['engine', engineModules], ['capability', capabilities]]) {
    for (const module of modules) {
      if (actual.has(module.id)) errors.push(`Duplicate module ${module.id}`);
      actual.set(module.id, { module, registration });
      for (const state of module.states) {
        if (owners.has(state)) errors.push(`State ${state} owned by ${owners.get(state)} and ${module.id}`);
        owners.set(state, module.id);
      }
      for (const opportunity of module.opportunities) {
        if (opportunities.has(opportunity.id)) errors.push(`Duplicate opportunity ${opportunity.id}`);
        opportunities.add(opportunity.id);
      }
    }
  }
  const declared = new Set();
  for (const entry of contracts) {
    if (declared.has(entry.id)) errors.push(`Duplicate contract ${entry.id}`);
    declared.add(entry.id);
    if (!['layered', 'profile-only'].includes(entry.configuration) ||
        !['unsupported', 'finish-current', 'legacy-unverified', 'feature-only'].includes(entry.disable) ||
        !['engine', 'capability'].includes(entry.registration)) errors.push(`Invalid contract ${entry.id}`);
    const found = actual.get(entry.id);
    if (!found || found.registration !== entry.registration) errors.push(`Registration mismatch ${entry.id}`);
    if (configuredIds.includes(entry.id) !== (entry.configuration === 'layered')) {
      errors.push(`Config mismatch ${entry.id}`);
    }
    if (entry.configuration === 'profile-only' && entry.disable !== 'unsupported') {
      errors.push(`Unsupported toggle declared as supported ${entry.id}`);
    }
  }
  for (const id of actual.keys()) if (!declared.has(id)) errors.push(`Missing contract ${id}`);
  for (const id of configuredIds) if (!declared.has(id)) errors.push(`Undeclared config ${id}`);
  if (new Set(configuredIds).size !== configuredIds.length) errors.push('Duplicate config id');
  return { ok: errors.length === 0, errors, modules: actual.size, states: owners.size, opportunities: opportunities.size };
}
