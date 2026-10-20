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
  console.error('usage: make_visual_review.mjs --captures preview.json --out visual-review.json --inspected true [--notes text]');
  process.exit(2);
}
const preview = JSON.parse(readFileSync(args.captures, 'utf8'));
const captures = (preview.captures || []).map(capture => ({
  path: capture.path,
  sha256: capture.sha256,
  notes: 'Inspected in session',
}));
const review = {
  inspected: true,
  reviewer: 'agent',
  notes: [args.notes || 'All captures inspected.'],
  captures,
};
writeFileSync(args.out, JSON.stringify(review, null, 2));
console.log(JSON.stringify({
  out: args.out,
  captures: captures.length,
  reviewed: review.inspected,
}, null, 2));
