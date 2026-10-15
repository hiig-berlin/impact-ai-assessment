import { test, assertEqual, assertThrows } from './harness.js';
import { readTemplate, TEMPLATE_URL } from '../pie.js';
import { CATEGORIES } from '../names.js';

const templateText = await (await fetch(TEMPLATE_URL)).text();

// Template text after removing/changing parts via the DOM.
function brokenTemplate(change) {
  const doc = new DOMParser().parseFromString(templateText, 'image/svg+xml');
  change(doc);
  return new XMLSerializer().serializeToString(doc);
}

test('template: check passes and finds all parts (§7 step 2)', () => {
  const t = readTemplate(templateText);
  assertEqual(t.categories.map((c) => c.id), CATEGORIES.map((c) => c.id));
  assertEqual(t.criteria.size, 24);
  for (const c of t.criteria.values()) {
    assertEqual(c.rings.length, 5);
    const id = c.group.id;
    assertEqual(c.number, Number(id.slice(1)));
    assertEqual([c.wedge.id, c.numberText.id, c.labelText.id], [`${id}-wedge`, `${id}-number`, `${id}-label`]);
  }
  assertEqual(t.sectors.size, 5);
  assertEqual(t.legend.id, 'Legend');
});

test('template: palette read from the template matches §6.1', () => {
  const t = readTemplate(templateText);
  for (const category of t.categories) {
    assertEqual(category.palette, category.colours.map((c) => `rgb(${c})`), category.name);
  }
});

const BROKEN = [
  ['missing ring', (d) => d.getElementById('C05-rating3').remove(), /C05 has no <path id="C05-rating3">/],
  ['missing label', (d) => d.getElementById('C17-label').remove(), /C17-label/],
  ['missing number', (d) => d.getElementById('C24-number').remove(), /C24-number/],
  ['missing wedge', (d) => d.getElementById('C01-wedge').remove(), /C01-wedge/],
  ['missing criterion', (d) => d.getElementById('C09').remove(), /#Governance contains/],
  ['missing category', (d) => d.getElementById('Impact').remove(), /4 children/],
  ['missing legend', (d) => d.getElementById('Legend').remove(), /Legend/],
  ['missing centre sector', (d) => d.getElementById('Centre-Governance').remove(), /Centre-Governance/],
  ['missing centre', (d) => d.getElementById('Centre').remove(), /Centre/],
  ['duplicate id', (d) => d.getElementById('C02-wedge').setAttribute('id', 'C01-wedge'), /duplicate id "C01-wedge"/],
];

for (const [name, change, pattern] of BROKEN) {
  test(`template: check fails with a clear message – ${name}`, () =>
    assertThrows(() => readTemplate(brokenTemplate(change)), pattern, name));
}

test('template: invalid XML is rejected', () =>
  assertThrows(() => readTemplate('<svg'), /not valid XML/));
