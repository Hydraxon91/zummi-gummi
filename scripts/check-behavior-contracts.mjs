import { pathToFileURL } from 'node:url';
import { createBehaviorModules } from '../src/behaviors/engine.js';
import { CONFIGURED_MODULE_IDS } from '../src/behaviors/config.js';
import { directivesModule } from '../src/behaviors/directives.js';
import { checkBehaviorContracts } from '../src/behaviors/contracts.js';

export function currentBehaviorInventory() {
  const engine = createBehaviorModules({ getActors: () => [] });
  return { engineModules: [...engine.api.modules.values()], capabilities: [directivesModule],
    configuredIds: CONFIGURED_MODULE_IDS };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkBehaviorContracts(currentBehaviorInventory());
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
