// Small portable CDP harness for local browser regression checks.
//
// There is no Playwright/Puppeteer dependency. Point BROWSER_BIN at a
// Chromium-family executable, or let the resolver find Brave/Chrome/Chromium.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exec = promisify(execFile);

async function removeProfile(profile) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(150);
    }
  }
}

export function resolveBrowser() {
  const candidates = [
    process.env.BROWSER_BIN,
    process.env.CHROME_BIN,
    process.env.BRAVE_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find(candidate => existsSync(candidate)) || null;
}

export async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export async function launchBrowser({
  browser = resolveBrowser(), port, profile, args = [],
  headless = true, swiftshader = true,
} = {}) {
  if (!browser) {
    throw new Error('No Chromium-family browser found. Set BROWSER_BIN or CHROME_BIN.');
  }
  if (!port) port = await getFreePort();
  if (!profile) profile = await mkdtemp(join(tmpdir(), 'gummy-browser-'));
  let stderr = '';
  let exit = null;
  const child = spawn(browser, [
    ...(headless ? ['--headless=new'] : []),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    // Container /dev/shm is small; software-rendered WebGL can exhaust it and
    // wedge the renderer before the first frame.
    '--disable-dev-shm-usage',
    ...(swiftshader ? ['--enable-unsafe-swiftshader'] : []),
    '--window-size=1440,900',
    ...args,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr?.on('data', chunk => {
    stderr = (stderr + String(chunk)).slice(-65536);
  });
  child.on('exit', (code, signal) => {
    exit = { code, signal, at: Date.now() };
  });

  let version = null;
  // Hosted runners can be slow to publish the CDP endpoint under load; keep a
  // bounded allowance and report browser stderr when it never appears.
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        version = await response.json();
        break;
      }
    } catch (error) {}
    await sleep(150);
  }
  if (!version?.webSocketDebuggerUrl) {
    child.kill();
    await removeProfile(profile).catch(() => {});
    throw new Error(`Browser CDP endpoint did not start on port ${port}${stderr ? `: ${stderr.slice(-1200)}` : ''}`);
  }
  return {
    browser, child, port, profile, version,
    get stderr() { return stderr; },
    get exit() { return exit; },
  };
}

export async function connectBrowser(launched) {
  const ws = new WebSocket(launched.version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const pageErrors = [];
  const lifecycle = [];
  const pausedStacks = new Map();
  let connectionClosed = null;
  ws.addEventListener('close', event => {
    connectionClosed = {
      code: event.code,
      reason: event.reason || '',
      at: Date.now(),
    };
    for (const [id, request] of pending) {
      clearTimeout(request.timer);
      pending.delete(id);
      request.reject(new Error('CDP connection closed'));
    }
  });
  ws.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch (error) { return; }
    if (message.method === 'Debugger.paused') {
      pausedStacks.set(message.sessionId, message.params.callFrames.map(frame => ({
        functionName: frame.functionName, url: frame.url, location: frame.location,
      })));
    }
    if (['Inspector.targetCrashed', 'Inspector.detached', 'Target.targetCrashed',
      'Target.detachedFromTarget', 'Network.loadingFailed', 'Log.entryAdded'].includes(message.method)) {
      lifecycle.push({ at: Date.now(), method: message.method, sessionId: message.sessionId,
        params: message.params });
      if (lifecycle.length > 100) lifecycle.shift();
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails;
      pageErrors.push(details?.text || details?.exception?.description || 'Runtime exception');
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      pageErrors.push((message.params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' '));
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message || 'CDP error'));
    else request.resolve(message.result);
  });

  function send(method, params = {}, sessionId = null, timeout = 60000) {
    return new Promise((resolve, reject) => {
      if (connectionClosed || launched.exit || ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`CDP unavailable: ${method}`));
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async function openPage({
    url, width = 1440, height = 900, mobile = false,
    deviceScaleFactor = 1, initScript = null,
  } = {}) {
    const created = await send('Target.createTarget', { url: 'about:blank' });
    const attached = await send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
    const sessionId = attached.sessionId;
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Inspector.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    await send('Log.enable', {}, sessionId);
    if (process.env.STALL_DIAGNOSTICS === '1') await send('Debugger.enable', {}, sessionId);
    if (initScript) {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: initScript }, sessionId);
    }
    if (width && height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor, mobile,
      }, sessionId);
    }
    await send('Page.navigate', { url }, sessionId);

    let lastWaitError = null;
    let lastWaitExpression = null;
    let stall = null;
    const timings = [];

    async function captureStall(expression) {
      stall = { at: Date.now(), expression, browserPid: launched.child.pid };
      // Collect independent browser/process evidence before requesting a JS pause.
      const probes = await Promise.allSettled([
        send('SystemInfo.getProcessInfo', {}, null, 1000),
        process.platform === 'darwin'
          ? exec('/usr/bin/sample', [String(launched.child.pid), '1', '10'], { timeout: 3000, maxBuffer: 1024 * 1024 })
          : Promise.resolve(null),
        send('Debugger.enable', {}, sessionId, 1000),
      ]);
      stall.probes = probes.map(result => result.status === 'fulfilled'
        ? result.value : { error: String(result.reason) });
      try {
        await send('Debugger.pause', {}, sessionId, 1000);
        await sleep(100);
        stall.stack = pausedStacks.get(sessionId) || null;
      } catch (error) {
        stall.pauseError = String(error);
      } finally {
        await send('Debugger.resume', {}, sessionId, 1000).catch(() => {});
      }
    }

    async function evaluate(expression, timeout = 60000) {
      let result;
      const start = performance.now();
      try {
      result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      }, sessionId, timeout);
      } catch (error) {
        if (process.env.STALL_DIAGNOSTICS === '1' && !stall &&
            String(error).includes('CDP timeout: Runtime.evaluate')) await captureStall(expression);
        throw error;
      } finally {
        const ms = Math.round(performance.now() - start);
        timings.push({ ms, expression: String(expression).slice(0, 240) });
        if (timings.length > 200) timings.shift();
        if (process.env.CI && ms >= 1000) console.log('CDP_TIMING', JSON.stringify(timings.at(-1)));
      }
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 1800));
      }
      return result.result.value;
    }

    async function waitFor(expression, timeout = 30000) {
      const deadline = Date.now() + timeout;
      lastWaitExpression = expression;
      lastWaitError = null;
      while (Date.now() < deadline) {
        try {
          if (await evaluate(expression, Math.min(5000, Math.max(1, deadline - Date.now())))) return true;
        } catch (error) {
          lastWaitError = String(error && error.stack || error);
          if (connectionClosed || launched.exit) throw error;
        }
        await sleep(Math.min(200, Math.max(0, deadline - Date.now())));
      }
      const error = new Error(`Wait timeout: ${expression}`);
      error.lastWaitError = lastWaitError;
      throw error;
    }

    function diagnostics() {
      return {
        targetId: created.targetId,
        stall,
        timings: timings.slice(),
        sessionId,
        lastWaitExpression,
        lastWaitError,
        connectionClosed,
        lifecycle: lifecycle.slice(),
        pageErrors: pageErrors.slice(),
        browserStderr: launched.stderr,
        browserExit: launched.exit,
      };
    }

    async function screenshot(path) {
      const result = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(path, Buffer.from(result.data, 'base64'));
      return path;
    }

    return {
      targetId: created.targetId, sessionId, evaluate, waitFor, screenshot, diagnostics,
    };
  }

  async function close() {
    try { await send('Browser.close', {}, null, 5000); } catch (error) {}
    try { ws.close(); } catch (error) {}
    try { launched.child.kill(); } catch (error) {}
    await removeProfile(launched.profile).catch(() => {});
  }

  function diagnostics() {
    return {
      connectionClosed,
      lifecycle: lifecycle.slice(),
      pageErrors: pageErrors.slice(),
      browserStderr: launched.stderr,
      browserExit: launched.exit,
    };
  }

  return { send, openPage, close, pageErrors, diagnostics };
}

// Boot a page with one fresh browser process when `booted` never appears. Closing
// only the target keeps the same wedged GPU process, so the relaunch replaces it.
// The first attempt's diagnostics are reported so a real application boot failure
// stays visible instead of being hidden by the relaunch.
export async function connectBootedBrowser({
  launch = {}, page: pageOptions = {}, timeout = 180000, attempts = 2, onRetry = null,
} = {}) {
  let lastError = null;
  const bootAttempts = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let launched = null;
    let browser = null;
    let page = null;
    const started = performance.now();
    try {
      launched = await launchBrowser(launch);
      browser = await connectBrowser(launched);
      page = await browser.openPage(pageOptions);
      await page.waitFor('!!window.__gummy?.booted', timeout);
      bootAttempts.push({ attempt, elapsedMs: Math.round(performance.now() - started), success: true });
      return { browser, launched, page, attempt, bootAttempts };
    } catch (error) {
      lastError = error;
      const diagnostics = page ? page.diagnostics() : browser ? browser.diagnostics()
        : { launched: launched ? { stderr: launched.stderr } : null };
      bootAttempts.push({ attempt, elapsedMs: Math.round(performance.now() - started),
        success: false, error: String(error), diagnostics });
      error.bootAttempts = bootAttempts.slice();
      try {
        if (onRetry) onRetry(error, attempt, diagnostics);
      } finally {
        if (browser) await browser.close().catch(() => {});
        else if (launched) { try { launched.child.kill(); } catch (killError) {} }
      }
      if (attempt >= attempts) throw error;
    }
  }
  throw lastError;
}
