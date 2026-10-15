import { test, assert, assertClose, assertEqual } from './harness.js';
import { base, exampleRatings, file, layerName } from './fixture.js';
import {
  CENTRE,
  GREY,
  generateFiles,
  normaliseAngle,
  parseMatrix,
  scoreClusters,
  textSide,
} from '../pie.js';

const files = generateFiles(base());

// Mid-angle of a criterion as drawn: direction of its wedge's outer arc midpoint.
function wedgeMidAngle(doc, id) {
  const d = doc.getElementById(`${id}-wedge`).getAttribute('d');
  const [x1, y1] = d
    .match(/^M([-\d.]+),([-\d.]+)/)
    .slice(1)
    .map(Number);
  const [x2, y2] = d
    .match(/A[^A]*? ([-\d.]+),([-\d.]+)L/)
    .slice(1)
    .map(Number);
  const angle = (x, y) => (Math.atan2(x - CENTRE.x, CENTRE.y - y) * 180) / Math.PI;
  let a1 = angle(x1, y1);
  let a2 = angle(x2, y2);
  if (a2 < a1) a2 += 360;
  return normaliseAngle((a1 + a2) / 2);
}

// Reading direction of a text: angle of its baseline direction (matrix a, b).
function textDirection(doc, id) {
  const [a, b] = parseMatrix(doc.getElementById(id).getAttribute('transform'));
  return normaliseAngle((Math.atan2(b, a) * 180) / Math.PI);
}

test('overviews: first four files', () => {
  assertEqual(
    files.slice(0, 4).map((f) => f.path),
    ['overview.svg', 'overview-legend.svg', 'overview-scores.svg', 'overview-scores-legend.svg'],
  );
});

test('overview: category order, centre pie, A4 canvas, legend only in -legend', () => {
  const { doc } = file(files, 'overview.svg');
  const diagram = doc.getElementById('Diagram');
  assertEqual(
    [...diagram.children].map((g) => g.id),
    [
      'Impact',
      'Governance',
      'Social-Sustainability',
      'Environmental-Sustainability',
      'Economic-Sustainability',
    ],
  );
  const order = [...diagram.querySelectorAll(':scope > g > g')].map((g) => g.id);
  assertEqual(
    order,
    Array.from({ length: 24 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`),
  );
  for (let n = 1; n <= 24; n++) {
    assertClose(
      wedgeMidAngle(doc, `C${String(n).padStart(2, '0')}`),
      (n - 1) * 15 + 7.5,
      0.01,
      `C${n}`,
    );
  }
  assertEqual(doc.getElementById('Centre').children.length, 5);
  assertEqual(doc.documentElement.getAttribute('viewBox'), '0 0 2481 3508');
  assert(!doc.getElementById('Legend'), 'no legend');
  assert(file(files, 'overview-legend.svg').doc.getElementById('Legend'), 'legend');
});

test('overview: ring colours follow the scores', () => {
  const { doc } = file(files, 'overview.svg');
  for (const r of exampleRatings) {
    for (let level = 1; level <= 5; level++) {
      const fill = doc
        .getElementById(`C${String(r.number).padStart(2, '0')}-rating${level}`)
        .getAttribute('style')
        .match(/fill:([^;]+)/)[1];
      assert((fill === GREY) === level > r.score, `criterion ${r.number} ring ${level}: ${fill}`);
    }
  }
});

test('score overview: order matches §9, blank centre, separators', () => {
  assertEqual(
    scoreClusters(exampleRatings).map((c) => c.criteria),
    [[2, 4, 5, 6, 10, 12, 14, 15, 18, 20, 21, 22, 23, 24], [3, 8, 17, 19], [1, 9, 11, 13, 16], [7]],
  );
  const { doc } = file(files, 'overview-scores.svg');
  const diagram = doc.getElementById('Diagram');
  const clusters = [...diagram.children].filter((g) => g.id !== 'Separators');
  assertEqual(
    clusters.map((g) => [g.id, layerName(g)]),
    [
      ['Exemplary', 'Exemplary'],
      ['Satisfactory', 'Satisfactory'],
      ['Ambivalent', 'Ambivalent'],
      ['Weak', 'Weak'],
    ],
  );
  const order = clusters.flatMap((g) => [...g.children].map((c) => Number(c.id.slice(1))));
  assertEqual(
    order,
    [2, 4, 5, 6, 10, 12, 14, 15, 18, 20, 21, 22, 23, 24, 3, 8, 17, 19, 1, 9, 11, 13, 16, 7],
  );
  order.forEach((n, i) =>
    assertClose(wedgeMidAngle(doc, `C${String(n).padStart(2, '0')}`), i * 15 + 7.5, 0.01, `C${n}`),
  );
  assert(!doc.getElementById('Centre'), 'blank centre');
  const separators = [...doc.getElementById('Separators').children];
  assertEqual(separators.length, 4);
  // Boundaries at 0°, 14·15°, 18·15°, 23·15°.
  const angles = separators.map((p) => {
    const [, , , x2, y2] = p
      .getAttribute('d')
      .match(/M([-\d.]+),([-\d.]+)L([-\d.]+),([-\d.]+)/)
      .slice(0)
      .map(Number);
    return Math.round(normaliseAngle((Math.atan2(x2 - CENTRE.x, CENTRE.y - y2) * 180) / Math.PI));
  });
  assertEqual(angles, [0, 210, 270, 345]);
  assert(/stroke-width:18px/.test(separators[0].getAttribute('style')));
});

test('score overview: one score cluster → no separators', () => {
  const allFive = exampleRatings.map((r) => ({ ...r, score: 5 }));
  const { doc } = file(generateFiles(base(allFive)), 'overview-scores.svg');
  assert(!doc.getElementById('Separators'));
});

test('text side: mid-angle decides, flips at 12 and 6 o’clock', () => {
  assertEqual(textSide(0), 'right');
  assertEqual(textSide(165), 'right');
  assertEqual(textSide(172), 'right'); // mid 179.5
  assertEqual(textSide(173), 'left'); // mid 180.5
  assertEqual(textSide(180), 'left');
  assertEqual(textSide(345), 'left');
  assertEqual(textSide(352), 'left'); // mid 359.5
  assertEqual(textSide(353), 'right'); // mid 0.5
  assertEqual(textSide(-15), 'left');
});

test('text orientation in both overviews: right half outward, left half inward', () => {
  for (const path of ['overview.svg', 'overview-scores.svg']) {
    const { doc } = file(files, path);
    for (let n = 1; n <= 24; n++) {
      const id = `C${String(n).padStart(2, '0')}`;
      const mid = wedgeMidAngle(doc, id);
      // Outward direction from the centre in SVG angle terms is mid − 90°.
      const outward = normaliseAngle(mid - 90);
      for (const part of ['label', 'number']) {
        const direction = textDirection(doc, `${id}-${part}`);
        const expected = mid < 180 ? outward : normaliseAngle(outward + 180);
        const diff = Math.min(Math.abs(direction - expected), 360 - Math.abs(direction - expected));
        assert(diff < 0.01, `${path} ${id}-${part}: direction ${direction}, expected ${expected}`);
      }
    }
  }
});

test('overview: CSV names replace label and layer name', () => {
  const renamed = exampleRatings.map((r) => (r.number === 13 ? { ...r, name: 'Fairness' } : r));
  const { doc } = file(generateFiles(base(renamed)), 'overview.svg');
  assertEqual(doc.getElementById('C13-label').textContent, 'Fairness');
  assertEqual(layerName(doc.getElementById('C13')), '13 Fairness');
  assertEqual(layerName(doc.getElementById('C07')), '07 Accountability');
});
