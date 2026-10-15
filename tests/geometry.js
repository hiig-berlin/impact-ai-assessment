// Helpers to read angles back from generated SVGs.

import { CENTRE, normaliseAngle, parseMatrix } from '../pie.js';

const angleOf = (x, y) => normaliseAngle((Math.atan2(x - CENTRE.x, CENTRE.y - y) * 180) / Math.PI);

// Start and mid-angle of an annular sector path (M outer-start A … outer-end L …).
export function pathSpan(d) {
  const [x1, y1] = d
    .match(/^M([-\d.]+),([-\d.]+)/)
    .slice(1)
    .map(Number);
  const [x2, y2] = d
    .match(/^M[^A]*A[^A]*? ([-\d.]+),([-\d.]+)[LZ]/)
    .slice(1)
    .map(Number);
  const start = angleOf(x1, y1);
  let end = angleOf(x2, y2);
  if (end < start) end += 360;
  return { start, mid: normaliseAngle((start + end) / 2), width: end - start };
}

export function wedgeSpan(doc, id) {
  return pathSpan(doc.getElementById(`${id}-wedge`).getAttribute('d'));
}

export function textDirection(doc, id) {
  const [a, b] = parseMatrix(doc.getElementById(id).getAttribute('transform'));
  return normaliseAngle((Math.atan2(b, a) * 180) / Math.PI);
}

export function angleDiff(a, b) {
  const d = Math.abs(normaliseAngle(a) - normaliseAngle(b));
  return Math.min(d, 360 - d);
}

// Texts upright: right half reads outward, left half inward.
export function textIsUpright(doc, id, mid) {
  const outward = mid - 90;
  const expected = normaliseAngle(mid) < 180 ? outward : outward + 180;
  return ['label', 'number'].every(
    (part) => angleDiff(textDirection(doc, `${id}-${part}`), expected) < 0.01,
  );
}

export const cid = (n) => `C${String(n).padStart(2, '0')}`;
