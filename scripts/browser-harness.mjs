// Small portable CDP harness for local browser regression checks.
//
// There is no Playwright/Puppeteer dependency. Point BROWSER_BIN at a
// Chromium-family executable, or let the resolver find Brave/Chrome/Chromium.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  const child = spawn(browser, [
    ...(headless ? ['--headless=new'] : []),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    ...(swiftshader ? ['--enable-unsafe-swiftshader'] : []),
    '--window-size=1440,900',
    ...args,
    'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  const deadline = Date.now() + 20000;
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
    throw new Error(`Browser CDP endpoint did not start on port ${port}`);
  }
  return { browser, child, port, profile, version };
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
  ws.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch (error) { return; }
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
    if (initScript) {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: initScript }, sessionId);
    }
    if (width && height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor, mobile,
      }, sessionId);
    }
    await send('Page.navigate', { url }, sessionId);

    async function evaluate(expression, timeout = 60000) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      }, sessionId, timeout);
      if (result.exceptionDetails) {
        throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 1800));
      }
      return result.result.value;
    }

    async function waitFor(expression, timeout = 30000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        try { if (await evaluate(expression)) return true; } catch (error) {}
        await sleep(200);
      }
      throw new Error(`Wait timeout: ${expression}`);
    }

    async function screenshot(path) {
      const result = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(path, Buffer.from(result.data, 'base64'));
      return path;
    }

    return { targetId: created.targetId, sessionId, evaluate, waitFor, screenshot };
  }

  async function close() {
    try { await send('Browser.close', {}, null, 5000); } catch (error) {}
    try { ws.close(); } catch (error) {}
    try { launched.child.kill(); } catch (error) {}
    await removeProfile(launched.profile).catch(() => {});
  }

  return { send, openPage, close, pageErrors };
}
