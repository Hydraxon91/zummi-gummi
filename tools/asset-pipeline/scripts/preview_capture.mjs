// Standalone three.js preview capture runner. Uses the existing CDP harness.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, connectBrowser } from '../../../scripts/browser-harness.mjs';
import { hashBytes } from './verification_report.mjs';

const DEFAULT_VIEWS = 'front,back,left,right,three_quarter,near,far';
const DEFAULT_LIGHTS = 'day,night';

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.PREVIEW_BASE_URL || 'http://localhost:8000',
    asset: 'assets/MSN_Figure/msn.glb',
    out: '.dev-shots/asset-pipeline/preview',
    views: DEFAULT_VIEWS,
    lights: DEFAULT_LIGHTS,
    width: 1440,
    height: 900,
    clip: '',
    fov: 35,
    nearFactor: 0.72,
    farFactor: 2.4,
    margin: 1.15,
    instances: 1,
    backdrop: 'solid',
    headless: true,
    swiftshader: true,
    deviceScaleFactor: 1,
    timeout: 90000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (name === 'clip') args.clip = value || '';
    else if (['width', 'height', 'timeout', 'fov', 'nearFactor',
      'farFactor', 'margin', 'instances', 'deviceScaleFactor'].includes(name)) {
      args[name] = Number(value);
    } else if (name === 'headless' || name === 'swiftshader') {
      args[name] = value !== 'false';
    } else if (name in args) args[name] = value;
    index += 1;
  }
  return args;
}

export async function capturePreview(options) {
  const args = { ...parseArgs([]), ...options };
  const out = args.out;
  mkdirSync(out, { recursive: true });
  const launched = await launchBrowser({
    headless: args.headless,
    swiftshader: args.swiftshader,
    args: [`--window-size=${args.width},${args.height}`],
  });
  const browser = await connectBrowser(launched);
  let page = null;
  const captures = [];
  let report = null;
  try {
    const url = new URL('/tools/asset-pipeline/preview/index.html', args.baseUrl);
    url.searchParams.set('asset', args.asset);
    url.searchParams.set('fov', String(args.fov));
    url.searchParams.set('nearFactor', String(args.nearFactor));
    url.searchParams.set('farFactor', String(args.farFactor));
    url.searchParams.set('margin', String(args.margin));
    url.searchParams.set('instances', String(args.instances));
    url.searchParams.set('backdrop', String(args.backdrop));
    if (args.clip) url.searchParams.set('clip', args.clip);
    page = await browser.openPage({
      url: url.href,
      width: args.width,
      height: args.height,
      deviceScaleFactor: args.deviceScaleFactor,
    });
    await page.waitFor(
      'window.__preview && (window.__preview.report().ready || !!window.__preview.report().error)',
      args.timeout);
    report = await page.evaluate('window.__preview.report()');
    if (report.error) {
      return {
        status: 'fail',
        report,
        captures,
        pageErrors: browser.pageErrors,
        reason: report.error,
      };
    }
    const benchmark = await page.evaluate('window.__preview.benchmark(20)');
    const views = String(args.views).split(',').map(item => item.trim()).filter(Boolean);
    const lights = String(args.lights).split(',').map(item => item.trim()).filter(Boolean);
    for (const light of lights) {
      await page.evaluate(`window.__preview.setLighting(${JSON.stringify(light)})`);
      for (const view of views) {
        await page.evaluate(`window.__preview.setView(${JSON.stringify(view)})`);
        await page.evaluate('window.__preview.renderNow()');
        const path = join(out, `${light}_${view}.png`);
        await page.screenshot(path);
        captures.push({
          light,
          view,
          path,
          sha256: hashBytes(readFileSync(path)),
        });
      }
    }
    report = await page.evaluate('window.__preview.report()');
    const rendererError = Number(report.renderer?.glError || 0) !== 0;
    const status = report.error || rendererError || browser.pageErrors.length
      ? 'review' : 'pass';
    return {
      status,
      report,
      benchmark,
      captures,
      pageErrors: browser.pageErrors,
      reason: report.error || null,
    };
  } catch (error) {
    return {
      status: 'unverified',
      report,
      captures,
      pageErrors: browser.pageErrors,
      reason: String(error),
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  capturePreview(args).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'fail' ? 1 : 0);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
