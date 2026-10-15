// Snapshot tests (§9): the SVGs generated from examples/ratings.csv with the
// default options must equal tests/expected/. On a difference, the actual file
// can be downloaded from the test page to review and, if correct, replace the
// expected file.

import { test, AssertionError } from './harness.js';
import { base } from './fixture.js';
import { generateFiles } from '../pie.js';

const actions = document.getElementById('actions');

function offerDownload(path, svg) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  link.download = path.replace(/\//g, '__');
  link.textContent = `actual ${path}`;
  const item = document.createElement('div');
  item.append(link);
  actions.append(item);
}

// Largest difference between numbers at the same place, if only numbers differ.
function numericDifference(a, b) {
  const pattern = /-?\d+(?:\.\d+)?/g;
  if (a.replace(pattern, '#') !== b.replace(pattern, '#')) return null;
  const na = a.match(pattern) || [];
  const nb = b.match(pattern) || [];
  return Math.max(0, ...na.map((v, i) => Math.abs(Number(v) - Number(nb[i]))));
}

for (const f of generateFiles(base())) {
  test(`snapshot: ${f.path}`, async () => {
    const response = await fetch(`expected/${f.path}`, { cache: 'no-store' });
    if (!response.ok) {
      offerDownload(f.path, f.svg);
      throw new AssertionError(`tests/expected/${f.path} is missing`);
    }
    const expected = await response.text();
    if (expected === f.svg) return;
    offerDownload(f.path, f.svg);
    const lineA = expected.split('\n');
    const lineB = f.svg.split('\n');
    const line = lineA.findIndex((l, i) => l !== lineB[i]);
    const numeric = numericDifference(expected, f.svg);
    throw new AssertionError(
      `differs from tests/expected/${f.path} (first at line ${line + 1})` +
        (numeric !== null ? `; only numbers differ, by at most ${numeric}` : ''),
    );
  });
}
