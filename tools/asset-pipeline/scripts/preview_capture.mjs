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
    timeout: 90000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (name === 'clip') args.clip = value || '';
    else if (name === 'width' || name === 'height' || name === 'timeout') {
      args[name] = Number(value);
    } else if (name in args) args[name] = value;
    index += 1;
  }
  return args;
}

export async function capturePreview(options) {
  const args = { ...parseArgs([]), ...options };
  const out = args.out;
  mkdirSync(out, { recursive: true });
  const launched = await launchBrowser();
  const browser = await connectBrowser(launched);
  let page = null;
  const captures = [];
  let report = null;
  try {
    const url = new URL('/tools/asset-pipeline/preview/index.html', args.baseUrl);
    url.searchParams.set('asset', args.asset);
    if (args.clip) url.searchParams.set('clip', args.clip);
    page = await browser.openPage({
      url: url.href,
      width: args.width,
      height: args.height,
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
