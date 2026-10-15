import { test, assert, assertClose, assertEqual, assertThrows } from './harness.js';
import { base, exampleRatings, file, layerName, parseSvg } from './fixture.js';
import { cid, pathSpan, textIsUpright, wedgeSpan } from './geometry.js';
import {
  CROP,
  CENTRE,
  ICON_RADIUS,
  generateFiles,
  normaliseAngle,
  polar,
  serializeElement,
  LEGEND_POSITIONS,
  legendLayout,
} from '../pie.js';
import { CATEGORIES, CRITERIA, SCORES } from '../names.js';

const prepared = base();
const original = generateFiles(prepared);
const CROP_VIEWBOX = `${CROP.x} ${CROP.y} ${CROP.size} ${CROP.size}`;

test('files: complete list with names from §6.1–§6.3', () => {
  const expected = [
    'overview.svg',
    'overview-legend.svg',
    'overview-scores.svg',
    'overview-scores-legend.svg',
    ...CATEGORIES.flatMap((c) => [`clusters/${c.slug}.svg`, `clusters/${c.slug}-centre.svg`]),
    'scores/5-exemplary.svg',
    'scores/4-satisfactory.svg',
    'scores/3-ambivalent.svg',
    'scores/2-weak.svg',
    'scores/1-insufficient.svg',
    ...CRITERIA.map((c) => `slices/${c.slug}.svg`),
  ];
  assertEqual(
    original.map((f) => f.path),
    expected,
  );
  assert(original.every((f) => f.legend === f.path.includes('-legend')));
});

test('files: unique ids in every output', () => {
  for (const options of [{}, { piePosition: 'start', startAngle: 7 }]) {
    for (const f of generateFiles(prepared, options)) {
      const ids = [...parseSvg(f.svg).querySelectorAll('[id]')].map((el) => el.id);
      assertEqual(ids.length, new Set(ids).size, `${f.path} has duplicate ids`);
    }
  }
});

test('files: valid XML with the Affinity namespace', () => {
  for (const f of original) {
    const doc = parseSvg(f.svg);
    assert(!doc.querySelector('parsererror'), `${f.path} parses`);
    assert(f.svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg'), f.path);
    assert(f.svg.includes('xmlns:affinity="https://www.affinity.studio/"'), f.path);
    // Exactly one XML declaration (Firefox's XMLSerializer adds its own).
    assertEqual(f.svg.match(/<\?xml/g).length, 1, `${f.path}: XML declarations`);
  }
});

test('files: layer names of clusters and criteria', () => {
  const impact = file(original, 'clusters/impact.svg').doc;
  const group = impact.getElementById('Diagram').children[0];
  assertEqual(layerName(group), 'Impact');
  assertEqual([...group.children].map(layerName), [
    '01 Objective & realisation',
    '02 Impact achievements',
    '03 Relevance of impact achievements',
    '04 Potential harm & mitigation',
    '05 Harm-management',
  ]);
  assertEqual([...impact.getElementById('C01').children].map(layerName), [
    'Wedge',
    'Rating 1',
    'Rating 2',
    'Rating 3',
    'Rating 4',
    'Rating 5',
    'Number',
    'Label',
  ]);
  const social = file(original, 'clusters/social-sustainability.svg').doc;
  assertEqual(layerName(social.getElementById('Social-Sustainability')), 'Social Sustainability');
  const weak = file(original, 'scores/2-weak.svg').doc;
  assertEqual(layerName(weak.getElementById('Weak')), 'Weak');
  assertEqual(layerName(weak.getElementById('C07')), '07 Accountability');
  const slice = file(original, 'slices/09-inclusion-participation-co-design.svg').doc;
  assertEqual(layerName(slice.getElementById('Governance')), 'Governance');
  assertEqual(layerName(slice.getElementById('C09')), '09 Inclusion, participation & co-design');
});

test('files: crop, contents, centre and legend per file type', () => {
  for (const f of original.filter((f) => f.kind !== 'overview')) {
    const doc = parseSvg(f.svg);
    assertEqual(doc.documentElement.getAttribute('viewBox'), CROP_VIEWBOX, f.path);
    assert(!doc.getElementById('Legend'), `${f.path}: no legend`);
    assert(!doc.getElementById('Separators'), `${f.path}: no separators`);
    const centre = doc.getElementById('Centre');
    assertEqual(Boolean(centre), f.path.endsWith('-centre.svg'), `${f.path}: centre`);
  }
  for (const category of CATEGORIES) {
    const doc = file(original, `clusters/${category.slug}-centre.svg`).doc;
    assertEqual(
      [...doc.getElementById('Centre').children].map((g) => g.id),
      [`Centre-${category.id}`],
    );
    const numbers = [...doc.querySelectorAll('#Diagram > g > g')].map((g) => Number(g.id.slice(1)));
    assertEqual(
      numbers,
      CRITERIA.filter((c) => c.category.slug === category.slug).map((c) => c.number),
    );
  }
  for (const score of SCORES) {
    const doc = file(original, `scores/${score.slug}.svg`).doc;
    const numbers = [...doc.querySelectorAll('#Diagram > g > g')].map((g) => Number(g.id.slice(1)));
    assertEqual(
      numbers,
      exampleRatings.filter((r) => r.score === score.score).map((r) => r.number),
      score.name,
    );
  }
});

test('files: no score file for a score that does not occur', () => {
  const noInsufficient = exampleRatings.map((r) => (r.score === 1 ? { ...r, score: 2 } : r));
  const paths = generateFiles(base(noInsufficient)).map((f) => f.path);
  assert(!paths.includes('scores/1-insufficient.svg'), 'no 1-insufficient file');
  assert(paths.includes('scores/2-weak.svg'), '2-weak file');
});

test('original position: clusters and slices keep their category-overview position', () => {
  const overview = file(original, 'overview.svg').doc;
  for (const f of original.filter((f) => f.kind === 'cluster' || f.kind === 'slice')) {
    const doc = parseSvg(f.svg);
    for (const g of doc.querySelectorAll('#Diagram > g > g')) {
      assertEqual(
        doc.getElementById(`${g.id}-wedge`).getAttribute('d'),
        overview.getElementById(`${g.id}-wedge`).getAttribute('d'),
        `${f.path} ${g.id}`,
      );
      assertEqual(
        doc.getElementById(`${g.id}-label`).getAttribute('transform'),
        overview.getElementById(`${g.id}-label`).getAttribute('transform'),
      );
    }
  }
});

test('original position: score files keep their score-overview position', () => {
  const overview = file(original, 'overview-scores.svg').doc;
  for (const f of original.filter((f) => f.kind === 'score')) {
    const doc = parseSvg(f.svg);
    for (const g of doc.querySelectorAll('#Diagram > g > g')) {
      for (const part of ['wedge', 'rating5', 'label', 'number']) {
        const el = doc.getElementById(`${g.id}-${part}`);
        const ref = overview.getElementById(`${g.id}-${part}`);
        for (const attr of ['d', 'transform', 'x']) {
          assertEqual(
            el.getAttribute(attr),
            ref.getAttribute(attr),
            `${f.path} ${g.id}-${part} ${attr}`,
          );
        }
      }
    }
  }
});

for (const startAngle of [0, 270, 7]) {
  test(`start angle ${startAngle}°: every cluster and score file is a gauge from the start angle`, () => {
    const files = generateFiles(prepared, { piePosition: 'start', startAngle });
    for (const f of files.filter((f) => f.kind === 'cluster' || f.kind === 'score')) {
      const doc = parseSvg(f.svg);
      const groups = [...doc.querySelectorAll('#Diagram > g > g')];
      groups.forEach((g, i) => {
        const span = wedgeSpan(doc, g.id);
        assertClose(span.width, 15, 0.01);
        const diff = Math.abs(normaliseAngle(span.start - (startAngle + i * 15) + 180) - 180);
        assert(
          diff < 0.01,
          `${f.path} ${g.id}: starts at ${span.start}, expected ${startAngle + i * 15}`,
        );
        assert(textIsUpright(doc, g.id, span.mid), `${f.path} ${g.id}: text upright`);
      });
    }
    // Overviews and slices ignore the option.
    for (const f of files.filter((f) => f.kind === 'overview' || f.kind === 'slice')) {
      assertEqual(f.svg, original.find((o) => o.path === f.path).svg, f.path);
    }
  });
}

test('start angle 270°: Impact starts at 9 o’clock and runs over the top', () => {
  const doc = file(
    generateFiles(prepared, { piePosition: 'start', startAngle: 270 }),
    'clusters/impact.svg',
  ).doc;
  assertEqual(
    [1, 2, 3, 4, 5].map((n) => Math.round(wedgeSpan(doc, cid(n)).start)),
    [270, 285, 300, 315, 330],
  );
});

test('start angle: centre sector rotates with the cluster, icon moves but stays upright', () => {
  const files = generateFiles(prepared, { piePosition: 'start', startAngle: 270 });
  const doc = file(files, 'clusters/governance-centre.svg').doc;
  const before = file(original, 'clusters/governance-centre.svg').doc;
  const sector = (d) => d.querySelector('#Centre-Governance > path').getAttribute('d');
  // Governance sector 75°–135° → 270°–330°.
  const span = pathSpan(sector(doc).replace(/^M[^L]*L/, 'M'));
  assertClose(span.start, 270, 0.01);
  assertClose(span.width, 60, 0.01);
  const icon = (d) => d.querySelector('#Centre-Governance > g');
  const t = (d) =>
    icon(d)
      .getAttribute('transform')
      .match(/translate\(([-\d.]+),([-\d.]+)\)/)
      .slice(1)
      .map(Number);
  const from = polar(ICON_RADIUS, 105);
  const to = polar(ICON_RADIUS, 300);
  assertClose(t(doc)[0] - t(before)[0], to.x - from.x, 0.002);
  assertClose(t(doc)[1] - t(before)[1], to.y - from.y, 0.002);
  // Icon paths keep their (upright) matrices.
  assertEqual(
    [...icon(doc).children].map((p) => p.getAttribute('transform')),
    [...icon(before).children].map((p) => p.getAttribute('transform')),
  );
  assert(CENTRE.x > 0);
});

test('start angle: invalid values throw', async () => {
  for (const startAngle of [-1, 360, 4.5, '90']) {
    await assertThrows(
      () => generateFiles(prepared, { piePosition: 'start', startAngle }),
      /start angle/,
    );
  }
});

test('CSV name changes label and layer name in all outputs, not file names', () => {
  const renamed = exampleRatings.map((r) =>
    r.number === 7 ? { ...r, name: 'Responsibility & oversight' } : r,
  );
  const files = generateFiles(base(renamed));
  assertEqual(
    files.map((f) => f.path),
    original.map((f) => f.path),
  );
  for (const f of files) {
    const doc = parseSvg(f.svg);
    const group = doc.getElementById('C07');
    if (!group) continue;
    assertEqual(layerName(group), '07 Responsibility & oversight', f.path);
    assertEqual(doc.getElementById('C07-label').textContent, 'Responsibility & oversight', f.path);
    const mid = wedgeSpan(doc, 'C07').mid;
    assert(textIsUpright(doc, 'C07', mid), f.path);
  }
});

test('serializer: escapes text and attributes, keeps namespaces, self-closes empty elements', () => {
  const doc = parseSvg(
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:affinity="https://www.affinity.studio/">' +
      '<g affinity:id="a &amp; &quot;b&quot;"><text>x &lt; y &amp; z</text><path d="M0,0"/></g></svg>',
  );
  assertEqual(
    serializeElement(doc.documentElement),
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:affinity="https://www.affinity.studio/">' +
      '<g affinity:id="a &amp; &quot;b&quot;"><text>x &lt; y &amp; z</text><path d="M0,0"/></g></svg>',
  );
});

test('legend position: only the two -legend overviews have a legend; bottom is unchanged', async () => {
  const { measureLegend } = await import('../raster.js');
  const legendBox = await measureLegend(file(original, 'overview-legend.svg').svg);
  const bottom = generateFiles(prepared, { legendPosition: 'bottom', legendBox });
  assertEqual(
    bottom.map((f) => f.svg),
    original.map((f) => f.svg),
  );
  for (const position of LEGEND_POSITIONS) {
    const files = generateFiles(prepared, { legendPosition: position, legendBox });
    for (const f of files) {
      const hasLegend = Boolean(parseSvg(f.svg).getElementById('Legend'));
      assertEqual(hasLegend, f.path.endsWith('-legend.svg'), `${position} ${f.path}`);
      assertEqual(Boolean(f.layout), hasLegend, `${position} ${f.path} layout`);
    }
    // Files without legend never change with the legend position.
    for (const f of files.filter((x) => !x.legend)) {
      assertEqual(f.svg, original.find((o) => o.path === f.path).svg, `${position} ${f.path}`);
    }
  }
});

test('legend position: legend moved beside, above or below the crop square; page shape', async () => {
  const { measureLegend } = await import('../raster.js');
  const box = await measureLegend(file(original, 'overview-legend.svg').svg);
  const crop = { left: CROP.x, top: CROP.y, right: CROP.x + CROP.size, bottom: CROP.y + CROP.size };
  const gap = box.y - crop.bottom;
  const inset = crop.right - (box.x + box.width);
  const near = (a, b, what) => assertClose(a, b, 1e-6, what);
  const right = legendLayout(box, 'right').box;
  near(right.x, crop.right + gap, 'right x');
  near(right.y + right.height, crop.bottom - inset, 'right bottom');
  const left = legendLayout(box, 'left').box;
  near(left.x + left.width, crop.left - gap, 'left x');
  near(left.y + left.height, crop.bottom - inset, 'left bottom');
  const top = legendLayout(box, 'top').box;
  near(top.y + top.height, crop.top - gap, 'top y');
  near(top.x, box.x, 'top x');
  assertEqual(legendLayout(box, 'bottom').box, box);
  // Page shapes: A4 for top/bottom, 16:9 for left/right.
  for (const position of LEGEND_POSITIONS) {
    const { shape, viewBox } = legendLayout(box, position);
    const ratio = viewBox.height / viewBox.width;
    if (position === 'top' || position === 'bottom') {
      assertEqual(shape, 'a4');
      assertEqual([viewBox.width, viewBox.height], [2481, 3508]);
    } else {
      assertEqual(shape, 'wide');
      assertClose(ratio, 9 / 16, 1e-9, position);
    }
  }
  // The SVG moves the legend with a translate and uses the layout's viewBox.
  const files = generateFiles(prepared, { legendPosition: 'right', legendBox: box });
  const doc = file(files, 'overview-legend.svg').doc;
  assert(
    /^translate\([-\d.]+,[-\d.]+\) matrix\(/.test(
      doc.getElementById('Legend').getAttribute('transform'),
    ),
  );
  const vb = doc.documentElement.getAttribute('viewBox').split(' ').map(Number);
  assertClose(vb[3] / vb[2], 9 / 16, 1e-3, 'viewBox ratio');
  await assertThrows(() => generateFiles(prepared, { legendPosition: 'left' }), /legend box/);
  await assertThrows(
    () => generateFiles(prepared, { legendPosition: 'middle', legendBox: box }),
    /legend position/,
  );
});
