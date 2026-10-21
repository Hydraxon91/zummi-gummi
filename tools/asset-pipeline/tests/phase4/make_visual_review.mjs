// Build a hash-linked visual-review record from a preview capture report.
import { readFileSync, writeFileSync } from 'node:fs';

const args = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--')) continue;
  args[key.slice(2)] = process.argv[index + 1];
  index += 1;
}
if (!args.captures || !args.out || args.inspected !== 'true') {
  console.error('usage: make_visual_review.mjs --captures preview.json --out visual-review.json --inspected true [--notes text] [--views front,three_quarter] [--lights day,night]');
  process.exit(2);
}
const preview = JSON.parse(readFileSync(args.captures, 'utf8'));
const views = args.views
  ? new Set(args.views.split(',').map(item => item.trim()).filter(Boolean))
  : null;
const lights = args.lights
  ? new Set(args.lights.split(',').map(item => item.trim()).filter(Boolean))
  : null;
const selected = (preview.captures || []).filter(capture =>
  (!views || views.has(capture.view)) && (!lights || lights.has(capture.light)));
if (!selected.length) {
  console.error('No captures matched the requested views/lights.');
  process.exit(2);
}
const captures = selected.map(capture => ({
  path: capture.path,
  sha256: capture.sha256,
  view: capture.view,
  light: capture.light,
  notes: 'Inspected in session',
}));
const review = {
  inspected: true,
  reviewer: 'agent',
  notes: [args.notes || 'Listed captures inspected.'],
  source_capture_count: (preview.captures || []).length,
  selected_capture_count: captures.length,
  captures,
};
writeFileSync(args.out, JSON.stringify(review, null, 2));
console.log(JSON.stringify({
  out: args.out,
  sourceCaptures: (preview.captures || []).length,
  captures: captures.length,
  reviewed: review.inspected,
}, null, 2));
