// Snapshot comparison with a tolerance for text x positions.
//
// Text widths are measured by the browser (§7 step 8), and browsers differ
// slightly (Firefox vs Chromium by up to about 1 template unit, 0.04 % of the
// pie). So the x of <text> elements may differ by TEXT_X_TOLERANCE; everything
// else must match exactly.

import { serializeElement } from '../pie.js';

export const TEXT_X_TOLERANCE = 1; // template units

const parse = (text) => new DOMParser().parseFromString(text, 'image/svg+xml');
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
