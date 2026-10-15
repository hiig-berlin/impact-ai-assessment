import { test, assert, assertEqual } from './harness.js';
import {
  CATEGORIES,
  CRITERIA,
  SCORES,
  criterion,
  criterionLayerName,
  scoreInfo,
  slugify,
} from '../names.js';

test('names: 5 categories covering criteria 1–24 without gaps', () => {
  assertEqual(
    CATEGORIES.map((c) => [c.first, c.last]),
    [
      [1, 5],
      [6, 9],
      [10, 20],
      [21, 22],
      [23, 24],
    ],
  );
  assertEqual(CRITERIA.length, 24);
  for (const c of CRITERIA) assert(c.category, `criterion ${c.number} has a category`);
});

test('names: category slugs and ids (§6.1)', () => {
  assertEqual(
    CATEGORIES.map((c) => [c.name, c.slug, c.id]),
    [
      ['Impact', 'impact', 'Impact'],
      ['Governance', 'governance', 'Governance'],
      ['Social Sustainability', 'social-sustainability', 'Social-Sustainability'],
      ['Environmental Sustainability', 'environmental-sustainability', 'Environmental-Sustainability'],
      ['Economic Sustainability', 'economic-sustainability', 'Economic-Sustainability'],
    ],
  );
});

test('names: colour levels are evenly spaced (§6.1)', () => {
  for (const category of CATEGORIES) {
    const levels = category.colours.map((c) => c.split(',').map(Number));
    for (let level = 1; level <= 4; level++) {
      const expected = levels[0].map((v, i) => Math.round(v + ((levels[5][i] - v) * level) / 5));
      assertEqual(levels[level], expected, `${category.name} level ${level}`);
    }
  }
});

test('names: criterion slugs follow the slug rule (§6.2)', () => {
  for (const c of CRITERIA) assertEqual(c.slug, slugify(c.number, c.label), `criterion ${c.number}`);
  assertEqual(criterion(9).slug, '09-inclusion-participation-co-design');
  assertEqual(criterion(5).slug, '05-harm-management');
  assertEqual(criterion(9).category.name, 'Governance');
  assertEqual(criterion(21).category.name, 'Environmental Sustainability');
});

test('names: criterion layer names', () => {
  assertEqual(criterionLayerName(7, 'Accountability'), '07 Accountability');
  assertEqual(criterionLayerName(24, 'Other name'), '24 Other name');
});

test('names: scores (§6.3)', () => {
  assertEqual(
    SCORES.map((s) => [s.score, s.name, s.slug]),
    [
      [5, 'Exemplary', '5-exemplary'],
      [4, 'Satisfactory', '4-satisfactory'],
      [3, 'Ambivalent', '3-ambivalent'],
      [2, 'Weak', '2-weak'],
      [1, 'Insufficient', '1-insufficient'],
    ],
  );
  assertEqual(scoreInfo(2).name, 'Weak');
});
