// Snapshot tests (§9): the SVGs generated from examples/ratings.csv with the
// default options must equal tests/expected/, except for text x positions,
// which may differ by TEXT_X_TOLERANCE between browsers (snapshot-compare.js).
// On a difference, the actual file can be downloaded from the test page to
// review and, if correct, replace the expected file.

import { test, assert, assertEqual, AssertionError } from './harness.js';
import { base } from './fixture.js';
import { compareSnapshot, TEXT_X_TOLERANCE } from './snapshot-compare.js';
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

const SAMPLE =
  '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg">' +
  '<text id="t" x="100.000px" y="5px">A</text><path d="M1,2"/></svg>\n';

test('snapshot comparison: legend viewBox/transform within tolerance pass', () => {
  const svg = (vb, t) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><g id="Legend" transform="${t}"><path d="M1,2"/></g></svg>\n`;
  const base = svg(
    '0.000 177.204 2481.000 3508.000',
    'translate(0.000,238.354) matrix(1,0,0,1,0,0)',
  );
  assert(
    compareSnapshot(
      base,
      svg('0.000 177.205 2481.000 3508.000', 'translate(0.000,238.355) matrix(1,0,0,1,0,0)'),
    ).equal,
  );
  assert(
    !compareSnapshot(
      base,
      svg('0.000 179.204 2481.000 3508.000', 'translate(0.000,238.354) matrix(1,0,0,1,0,0)'),
    ).equal,
  );
  assert(
    !compareSnapshot(
      base,
      svg('0.000 177.204 2481.000 3508.000', 'translate(0.000,238.354) matrix(2,0,0,1,0,0)'),
    ).equal,
  );
});

test('snapshot comparison: text x within tolerance passes, anything else fails', () => {
  assert(compareSnapshot(SAMPLE, SAMPLE).equal);
  const shifted = compareSnapshot(SAMPLE, SAMPLE.replace('100.000px', '100.990px'));
  assert(shifted.equal, shifted.problem);
  assertEqual(Number(shifted.maxTextDiff.toFixed(3)), 0.99);
  assert(
    !compareSnapshot(SAMPLE, SAMPLE.replace('100.000px', `${100 + TEXT_X_TOLERANCE + 0.5}px`))
      .equal,
  );
  assert(!compareSnapshot(SAMPLE, SAMPLE.replace('y="5px"', 'y="5.5px"')).equal);
  assert(!compareSnapshot(SAMPLE, SAMPLE.replace('M1,2', 'M1,2.001')).equal);
  assert(!compareSnapshot(SAMPLE, SAMPLE.replace('>A<', '>B<')).equal);
});

for (const f of generateFiles(base())) {
  test(`snapshot: ${f.path}`, async () => {
    const response = await fetch(`expected/${f.path}`, { cache: 'no-store' });
    if (!response.ok) {
      offerDownload(f.path, f.svg);
      throw new AssertionError(`tests/expected/${f.path} is missing`);
    }
    const result = compareSnapshot(await response.text(), f.svg);
    if (result.equal) return;
    offerDownload(f.path, f.svg);
    throw new AssertionError(`differs from tests/expected/${f.path}: ${result.problem}`);
  });
}
