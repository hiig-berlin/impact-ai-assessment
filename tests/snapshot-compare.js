// Snapshot comparison with a tolerance for values that depend on the browser's
// measurements.
//
// Text widths (§7 step 8) and the legend's bounding box (§5.2) are measured by
// the browser, and browsers differ slightly (Firefox vs Chromium by up to about
// 1 template unit, 0.04 % of the pie). So these may differ by TEXT_X_TOLERANCE:
// the x of <text> elements, and the numbers in the root viewBox and in the
// legend's transform (both follow from the legend box). Everything else must
// match exactly.

import { serializeElement } from '../pie.js';

export const TEXT_X_TOLERANCE = 1; // template units

const parse = (text) => new DOMParser().parseFromString(text, 'image/svg+xml');
const NUMBER = /-?\d+(?:\.\d+)?/g;

// If two attribute values differ only in numbers, each by at most the tolerance,
// return the largest difference; otherwise null.
function numericDiff(a, b) {
  if (a === null || b === null || a.replace(NUMBER, '#') !== b.replace(NUMBER, '#')) return null;
  const na = a.match(NUMBER) || [];
  const nb = b.match(NUMBER) || [];
  const diff = Math.max(0, ...na.map((v, i) => Math.abs(Number(v) - Number(nb[i]))));
  return diff <= TEXT_X_TOLERANCE ? diff : null;
}
const xValue = (el) => parseFloat(el.getAttribute('x'));

// Element tag, attributes and own text, for locating the first difference.
function describe(el) {
  const attributes = [...el.attributes].map((a) => `${a.name}="${a.value}"`).join(' ');
  const text = [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.data.trim())
    .join('');
  return `<${el.nodeName} ${attributes}>${text}`;
}

/**
 * Compare an expected and an actual SVG.
 * @returns {{ equal: boolean, maxTextDiff: number, problem: string }}
 */
export function compareSnapshot(expectedText, actualText) {
  if (expectedText === actualText) return { equal: true, maxTextDiff: 0, problem: '' };
  const expected = parse(expectedText);
  const actual = parse(actualText);
  const expectedTexts = [...expected.querySelectorAll('text')];
  const actualTexts = [...actual.querySelectorAll('text')];
  let maxTextDiff = 0;
  if (expectedTexts.length === actualTexts.length) {
    actualTexts.forEach((el, i) => {
      const reference = expectedTexts[i];
      if (!el.hasAttribute('x') || !reference.hasAttribute('x')) return;
      const diff = Math.abs(xValue(el) - xValue(reference));
      if (Number.isNaN(diff) || diff > TEXT_X_TOLERANCE) return;
      maxTextDiff = Math.max(maxTextDiff, diff);
      el.setAttribute('x', reference.getAttribute('x'));
    });
  }
  // Root viewBox and the legend's leading translate(…) follow from the measured
  // legend box; the rest of the legend transform must match exactly.
  const translatePart = (value) => /^translate\([^)]*\)/.exec(value || '')?.[0] ?? null;
  const pairs = [
    [actual.documentElement, expected.documentElement, 'viewBox', (v) => v],
    [
      actual.getElementById('Legend'),
      expected.getElementById('Legend'),
      'transform',
      translatePart,
    ],
  ];
  for (const [el, reference, name, part] of pairs) {
    if (!el || !reference) continue;
    const a = el.getAttribute(name);
    const r = reference.getAttribute(name);
    const pa = part(a);
    const pr = part(r);
    if (pa === null || pr === null || a.slice(pa.length) !== r.slice(pr.length)) continue;
    const diff = numericDiff(pr, pa);
    if (diff === null) continue;
    maxTextDiff = Math.max(maxTextDiff, diff);
    el.setAttribute(name, r);
  }
  const declaration = (text) => text.slice(0, text.indexOf('<svg'));
  if (
    declaration(expectedText) === declaration(actualText) &&
    serializeElement(expected.documentElement) === serializeElement(actual.documentElement)
  ) {
    return { equal: true, maxTextDiff, problem: '' };
  }
  const expectedElements = [
    expected.documentElement,
    ...expected.documentElement.querySelectorAll('*'),
  ];
  const actualElements = [actual.documentElement, ...actual.documentElement.querySelectorAll('*')];
  const index = expectedElements.findIndex(
    (el, i) => !actualElements[i] || describe(el) !== describe(actualElements[i]),
  );
  const problem =
    index < 0
      ? actualElements.length !== expectedElements.length
        ? `actual has ${actualElements.length - expectedElements.length} extra element(s)`
        : 'XML declaration or formatting differs'
      : `first difference at element ${index + 1}` +
        `\n  expected: ${describe(expectedElements[index]).slice(0, 300)}` +
        `\n  actual:   ${actualElements[index] ? describe(actualElements[index]).slice(0, 300) : '(missing)'}`;
  return { equal: false, maxTextDiff, problem };
}
