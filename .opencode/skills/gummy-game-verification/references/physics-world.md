# Physics, rigs, navigation and map isolation

Extracted project procedure; use the parent skill's stages and evidence rules.
Paths are repo-relative. Read [browser prerequisites](browser-harness.md) before
live checks and [behavior/parity](behavior-parity.md) for simulation changes.

## Prerequisites and expected evidence

- Drive the served app through a browser and verified `window.__gummy` hooks.
  Record concrete outcomes, console errors and non-finite/bounds failures.
- For physics/rig/solver changes, establish a baseline and rerun the applicable
  local `.selftest.html` checks. This harness is gitignored and not guaranteed to
  exist in another checkout. Inspect it before use; if missing, report that gap
  rather than claiming the 16-check suite passed. Never commit it.
- Shared solver changes need existing-bear regression checks, not just a successful
  new-creature demo. Map changes need state-isolation and relevant collision/nav
  assertions. Verify spawn caps and lifecycle behaviour when those paths change.

Inspect the local self-test and debug implementation to select actual assertions;
do not invent physics hooks or assume another checkout has the same scratch harness.
Use [species/assets/save](species-assets-save.md) for representation and map/save
round trips. Use [rendering/visuals](rendering-visuals.md) for visible rig/surface changes.

## Failure and cleanup

Report missing baseline, missing harness and untested representations separately.
A static screenshot or HTTP smoke pass is not evidence of stable physics over time.
Do not change the fixed step, solver, representation or WASM to make a check pass
without its required approval. Record separate defects under Known follow-ups in
`ROADMAP.md`; discovery is not repair authorization. Close owned browser/server
processes under the parent skill's cleanup rules, including on failure.
