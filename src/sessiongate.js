// Single-flight gate for session-mutating operations.
//
// The gate owns only which operation (if any) currently holds the session. It
// does not queue work, schedule retries, cancel an operation or roll back game
// state; callers acquire before mutation and release in `finally`. The app
// composes this with its own operation wrappers and UI, so the module stays
// portable and has no imports, RNG draws or asynchronous behavior.

export const SESSION_OPERATION_KINDS = Object.freeze([
  'save',
  'export',
  'load',
  'import',
  'map-switch',
  'new-game',
  'autosave',
]);

const VALID_KINDS = new Set(SESSION_OPERATION_KINDS);

export function createSessionGate({ onChange } = {}) {
  let active = null;
  const notify = kind => {
    if (typeof onChange === 'function') onChange(kind);
  };

  return {
    begin(kind) {
      if (!VALID_KINDS.has(kind) || active !== null) return false;
      active = kind;
      notify(active);
      return true;
    },
    end(kind) {
      if (active === null || kind !== active) return false;
      active = null;
      notify(null);
      return true;
    },
    current() {
      return active;
    },
    isBusy() {
      return active !== null;
    },
  };
}
