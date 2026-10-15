// Template parsing, geometry, ordering and SVG export (SPECS.md §6, §7). No UI code.

import {
  CATEGORIES,
  CRITERIA,
  CRITERION_COUNT,
  SCORES,
  criterionId,
  criterionLayerName,
} from './names.js';

// --- Constants (values from SPECS.md §6) -------------------------------------

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const AFFINITY_NS = 'https://www.affinity.studio/';
export const TEMPLATE_URL = new URL('./template/template.svg', import.meta.url).href;

// Chart centre and angular layout: 24 positions of 15°, clockwise from 12 o'clock.
export const CENTRE = { x: 1240.157, y: 1472.634 };
export const POSITION_ANGLE = 15;
export const FULL_CIRCLE = 360;
export const HALF_CIRCLE = 180;

// Square crop around the chart centre for cluster, score and slice files (§5).
export const CROP = { x: 40.157, y: 272.634, size: 2400 };
// The template's A4 page (viewBox of template.svg).
export const PAGE = { width: 2481, height: 3508 };
// Raster margin around the crop square, as a share of the image side (§5.1).
export const FRAME_MARGIN_RATIO = 0.05;
// Legend positions for the two -legend overviews (§5.2).
export const LEGEND_POSITIONS = ['left', 'right', 'top', 'bottom'];
export const DEFAULT_LEGEND_POSITION = 'bottom';
export const WIDE_ASPECT = 16 / 9;

// Radius of the centre icons' midpoint in their sector (§6).
export const ICON_RADIUS = 102;

// Text x positions in the text's local (rotated) frame (§6 "Text").
export const LABEL_X_RIGHT = 1658.0;
export const LABEL_END_X_LEFT = 2371.8;
export const NUMBER_CENTRE_X = 1684.45;
// Criterion names wider than this would run past the wedge (§4.2).
export const LABEL_MAX_WIDTH = 700;

// Template criteria whose text transforms are the reference for each half (§7.1).
export const TEXT_REFERENCE = {
  right: { number: 1, midAngle: 7.5 },
  left: { number: 13, midAngle: 187.5 },
};

// Rings above the score (§6.1).
export const GREY = 'rgb(233,233,233)';

// Separators between score clusters in the score overview (§7 step 7).
export const SEPARATOR = { innerRadius: 150, outerRadius: 1190, strokeWidth: 18 };

export const RING_COUNT = 5;

// --- Template loading and check (§7 steps 1–2) -------------------------------

export async function loadTemplate(url = TEMPLATE_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Template: could not load ${url} (HTTP ${response.status}).`);
  }
  return readTemplate(await response.text());
}

function templateError(message) {
  return new Error(`Template check failed: ${message}`);
}

function childElements(element) {
  return [...element.children];
}

/**
 * Parse the template SVG and find its parts (§6). Throws with a developer
 * message if the structure doesn't match §7 step 2.
 * @returns {{ doc: Document, categories: object[], criteria: Map<number, object>,
 *   centre: Element, legend: Element, diagram: Element }}
 */
export function readTemplate(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) throw templateError(`not valid XML (${parseError.textContent.trim()}).`);
  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS) {
    throw templateError('the root element is not <svg>.');
  }

  // All ids must be unique, so lookups by id are unambiguous.
  const ids = new Set();
  for (const el of doc.querySelectorAll('[id]')) {
    if (ids.has(el.id)) throw templateError(`duplicate id "${el.id}".`);
    ids.add(el.id);
  }
  const byId = (id) => doc.getElementById(id);

  const diagram = byId('Diagram');
  if (!diagram) throw templateError('no #Diagram group.');
  const groups = childElements(diagram);
  if (groups.length !== CATEGORIES.length) {
    throw templateError(
      `#Diagram has ${groups.length} children, expected ${CATEGORIES.length} category groups.`,
    );
  }

  const criteria = new Map();
  const categories = CATEGORIES.map((category, index) => {
    const group = groups[index];
    if (group.localName !== 'g' || group.id !== category.id) {
      throw templateError(
        `child ${index + 1} of #Diagram is <${group.localName} id="${group.id}">, expected <g id="${category.id}">.`,
      );
    }
    const expected = CRITERIA.filter((c) => c.category === category).map((c) =>
      criterionId(c.number),
    );
    const actual = childElements(group).map((el) => el.id);
    if (actual.join() !== expected.join()) {
      throw templateError(
        `#${category.id} contains [${actual.join(', ')}], expected [${expected.join(', ')}].`,
      );
    }
    return { ...category, group, palette: null };
  });

  for (const c of CRITERIA) {
    const id = criterionId(c.number);
    const group = byId(id);
    const part = (suffix, tag) => {
      const el = byId(`${id}-${suffix}`);
      if (!el || el.parentNode !== group || el.localName !== tag) {
        throw templateError(`#${id} has no <${tag} id="${id}-${suffix}">.`);
      }
      return el;
    };
    const rings = [];
    for (let level = 1; level <= RING_COUNT; level++) rings.push(part(`rating${level}`, 'path'));
    criteria.set(c.number, {
      ...c,
      group,
      wedge: part('wedge', 'path'),
      rings,
      numberText: part('number', 'text'),
      labelText: part('label', 'text'),
    });
  }
  if (criteria.size !== CRITERION_COUNT) throw templateError('expected 24 criteria.');

  // Palette: level 0 from the wedge, levels 1–5 from the rings ("everything Exemplary").
  for (const category of categories) {
    const first = criteria.get(category.first);
    category.palette = [first.wedge, ...first.rings].map((el, level) => {
      const fill = styleProperty(el, 'fill');
      if (!fill) throw templateError(`#${el.id} has no fill (palette level ${level}).`);
      return fill;
    });
  }

  const centre = byId('Centre');
  if (!centre) throw templateError('no #Centre group.');
  const sectors = new Map();
  for (const category of categories) {
    const group = byId(`Centre-${category.id}`);
    if (!group || group.parentNode !== centre) {
      throw templateError(`no #Centre-${category.id} group in #Centre.`);
    }
    const sector = childElements(group).find((el) => el.localName === 'path');
    const icon = childElements(group).find((el) => el.localName === 'g');
    if (!sector || !icon)
      throw templateError(`#Centre-${category.id} needs a sector path and an icon group.`);
    sectors.set(category.id, { group, sector, icon });
  }
  if (childElements(centre).length !== categories.length) {
    throw templateError(`#Centre should contain exactly ${categories.length} sectors.`);
  }

  const legend = byId('Legend');
  if (!legend || legend.parentNode !== root) throw templateError('no top-level #Legend group.');

  return { doc, root, diagram, categories, criteria, centre, sectors, legend };
}

// Value of a property in an element's style attribute, e.g. fill.
export function styleProperty(el, name) {
  const style = el.getAttribute('style') || '';
  const match = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`));
  return match ? match[1].trim() : '';
}

// --- Number formatting (§11: coordinates 3 decimals, matrices 6) -------------

function fixed(value, decimals) {
  const text = value.toFixed(decimals);
  return /^-0\.?0*$/.test(text) ? text.slice(1) : text;
}

export const fmt3 = (value) => fixed(value, 3);
export const fmt6 = (value) => fixed(value, 6);

// --- Geometry ---------------------------------------------------------------

const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function normaliseAngle(degrees) {
  return ((degrees % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
}

// Point at `radius` and `angle` (degrees clockwise from 12 o'clock).
export function polar(radius, angle) {
  const a = toRadians(angle);
  return { x: CENTRE.x + radius * Math.sin(a), y: CENTRE.y - radius * Math.cos(a) };
}

// Rotation about the chart centre as an SVG matrix [a, b, c, d, e, f].
// Positive angles turn clockwise on screen (y points down).
export function rotationMatrix(angle) {
  const a = toRadians(angle);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    cos,
    sin,
    -sin,
    cos,
    CENTRE.x - CENTRE.x * cos + CENTRE.y * sin,
    CENTRE.y - CENTRE.x * sin - CENTRE.y * cos,
  ];
}

// m1 × m2 (apply m2 first, then m1).
export function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function rotatePoint(x, y, angle) {
  const [a, b, c, d, e, f] = rotationMatrix(angle);
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

export function parseMatrix(transform) {
  const match = /^\s*matrix\(([^)]*)\)\s*$/.exec(transform || '');
  const values = match ? match[1].split(/[\s,]+/).map(Number) : [];
  if (values.length !== 6 || values.some(Number.isNaN)) {
    throw new Error(`Template: expected a matrix(…) transform, got "${transform}".`);
  }
  return values;
}

export function formatMatrix(m) {
  return `matrix(${m.map(fmt6).join(',')})`;
}

/**
 * Rotate an absolute path (M, L, A, Z commands as in the template) about the
 * chart centre. Arc radii and flags are kept verbatim, end points are rotated
 * and written with 3 decimals, so a rotation by 0° reproduces the template.
 */
export function rotatePath(d, angle) {
  const commands = d.match(/[A-Za-z][^A-Za-z]*/g) || [];
  return commands
    .map((command) => {
      const type = command[0];
      const args = command
        .slice(1)
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean);
      const point = (x, y) => {
        const p = rotatePoint(Number(x), Number(y), angle);
        return `${fmt3(p.x)},${fmt3(p.y)}`;
      };
      if ((type === 'M' || type === 'L') && args.length === 2)
        return type + point(args[0], args[1]);
      if (type === 'A' && args.length === 7) {
        return `A${args[0]},${args[1]} ${args[2]} ${args[3]},${args[4]} ${point(args[5], args[6])}`;
      }
      if (type === 'Z' && args.length === 0) return 'Z';
      throw new Error(
        `Template: unsupported path command "${command}" (only absolute M, L, A, Z).`,
      );
    })
    .join('');
}

// --- Text measurement (§7 step 8) -------------------------------------------

const MEASURE_FAMILY = 'Rating Pie PT Sans';
// Texts are measured at this multiple of their size and the result divided
// back: some browsers (Firefox) round glyph advances to whole pixels at small
// sizes, which adds up to several units over a long label.
const MEASURE_SCALE = 100;
export const FONT_URLS = {
  regular: new URL('./fonts/pt-sans-regular.woff2', import.meta.url).href,
  bold: new URL('./fonts/pt-sans-bold.woff2', import.meta.url).href,
};

/**
 * Measures label and number widths with the vendored PT Sans in a hidden SVG
 * attached to `doc`. Returns { measure(text, kind), dispose() }, kind being
 * 'label' or 'number'.
 */
export async function createMeasurer(template, doc = document) {
  const faces = [
    new FontFace(MEASURE_FAMILY, `url(${FONT_URLS.regular})`, { weight: '400' }),
    new FontFace(MEASURE_FAMILY, `url(${FONT_URLS.bold})`, { weight: '700' }),
  ];
  await Promise.all(faces.map((face) => face.load()));
  faces.forEach((face) => doc.fonts.add(face));
  await doc.fonts.ready;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText =
    'position:absolute;left:-10000px;top:0;width:10px;height:10px;visibility:hidden;';
  const first = template.criteria.get(1);
  const texts = {};
  for (const [kind, source] of [
    ['label', first.labelText],
    ['number', first.numberText],
  ]) {
    const text = doc.createElementNS(SVG_NS, 'text');
    text.setAttribute('style', source.getAttribute('style'));
    text.style.fontFamily = `'${MEASURE_FAMILY}'`;
    text.style.fontSize = `${parseFloat(styleProperty(source, 'font-size')) * MEASURE_SCALE}px`;
    text.style.textRendering = 'geometricPrecision';
    text.style.fontKerning = 'normal';
    svg.append(text);
    texts[kind] = text;
  }
  doc.body.append(svg);

  const cache = new Map();
  return {
    measure(content, kind) {
      const key = `${kind}\n${content}`;
      if (!cache.has(key)) {
        texts[kind].textContent = content;
        cache.set(key, texts[kind].getComputedTextLength() / MEASURE_SCALE);
      }
      return cache.get(key);
    },
    dispose() {
      svg.remove();
      faces.forEach((face) => doc.fonts.delete(face));
    },
  };
}

// --- Ordering (§7 step 5) ---------------------------------------------------

// Score clusters in score order: [{ score, criteria: [numbers ascending] }],
// skipping scores that don't occur.
export function scoreClusters(ratings) {
  return SCORES.map((s) => ({
    ...s,
    criteria: ratings
      .filter((r) => r.score === s.score)
      .map((r) => r.number)
      .sort((a, b) => a - b),
  })).filter((cluster) => cluster.criteria.length > 0);
}

// Template position start angle of a criterion.
export function templateAngle(number) {
  return (number - 1) * POSITION_ANGLE;
}

// Start angles for a list of criteria laid out one after another from `start`.
export function consecutiveAngles(numbers, start) {
  return new Map(numbers.map((n, i) => [n, start + i * POSITION_ANGLE]));
}

// Text side from the mid-angle of a span starting at `start` (§7.1).
export function textSide(start) {
  return normaliseAngle(start + POSITION_ANGLE / 2) < HALF_CIRCLE ? 'right' : 'left';
}

// --- Document building --------------------------------------------------------

function setStyleProperty(el, name, value) {
  const style = el.getAttribute('style') || '';
  const pattern = new RegExp(`(^|;)(\\s*${name}\\s*:)\\s*[^;]+`);
  el.setAttribute(
    'style',
    pattern.test(style) ? style.replace(pattern, `$1$2${value}`) : `${name}:${value};${style}`,
  );
}

function setLayerName(el, name) {
  el.setAttributeNS(AFFINITY_NS, 'affinity:id', name);
}

/**
 * Apply scores and names (§7 step 4) to a copy of the template and measure the
 * texts. Returns the base that every output document is cloned from.
 */
export function prepare(template, ratings, measurer) {
  const doc = template.doc.cloneNode(true);
  const byNumber = new Map(ratings.map((r) => [r.number, r]));
  const widths = new Map();
  const labels = new Map();
  for (const c of template.criteria.values()) {
    const rating = byNumber.get(c.number);
    if (!rating) throw new Error(`prepare: no rating for criterion ${c.number}.`);
    const id = criterionId(c.number);
    const category = template.categories.find((cat) => cat.id === c.category.id);
    for (let level = 1; level <= RING_COUNT; level++) {
      const ring = doc.getElementById(`${id}-rating${level}`);
      setStyleProperty(ring, 'fill', level <= rating.score ? category.palette[level] : GREY);
    }
    const labelText = doc.getElementById(`${id}-label`);
    const label = rating.name || labelText.textContent;
    if (rating.name) {
      labelText.textContent = rating.name;
      setLayerName(doc.getElementById(id), criterionLayerName(c.number, rating.name));
    }
    labels.set(c.number, label);
    widths.set(c.number, {
      label: measurer.measure(label, 'label'),
      number: measurer.measure(doc.getElementById(`${id}-number`).textContent, 'number'),
    });
  }
  const reference = (side) => {
    const c = template.criteria.get(TEXT_REFERENCE[side].number);
    return {
      midAngle: TEXT_REFERENCE[side].midAngle,
      label: {
        matrix: parseMatrix(c.labelText.getAttribute('transform')),
        y: c.labelText.getAttribute('y'),
      },
      number: {
        matrix: parseMatrix(c.numberText.getAttribute('transform')),
        y: c.numberText.getAttribute('y'),
      },
    };
  };
  return {
    template,
    doc,
    ratings: [...byNumber.values()].sort((a, b) => a.number - b.number),
    labels,
    widths,
    references: { right: reference('right'), left: reference('left') },
  };
}

// Move a criterion to the span starting at `start` and orient its texts (§7.1).
function placeCriterion(base, doc, number, start) {
  const id = criterionId(number);
  const delta = start - templateAngle(number);
  for (const suffix of [
    'wedge',
    ...Array.from({ length: RING_COUNT }, (_, i) => `rating${i + 1}`),
  ]) {
    const path = doc.getElementById(`${id}-${suffix}`);
    path.setAttribute('d', rotatePath(path.getAttribute('d'), delta));
  }
  const side = textSide(start);
  const reference = base.references[side];
  const mid = start + POSITION_ANGLE / 2;
  const rotation = rotationMatrix(mid - reference.midAngle);
  const widths = base.widths.get(number);
  const x = {
    label: side === 'right' ? LABEL_X_RIGHT : LABEL_END_X_LEFT - widths.label,
    number: NUMBER_CENTRE_X - widths.number / 2,
  };
  for (const kind of ['number', 'label']) {
    const text = doc.getElementById(`${id}-${kind}`);
    text.setAttribute('transform', formatMatrix(multiply(rotation, reference[kind].matrix)));
    text.setAttribute('x', `${fmt3(x[kind])}px`);
    text.setAttribute('y', reference[kind].y);
  }
}

// Keep only one category's centre sector, rotated by `delta`; the icon moves
// with the sector but stays upright.
function keepCentreSector(base, doc, categoryId, delta) {
  for (const category of base.template.categories) {
    const group = doc.getElementById(`Centre-${category.id}`);
    if (category.id !== categoryId) {
      group.remove();
      continue;
    }
    const sector = [...group.children].find((el) => el.localName === 'path');
    const icon = [...group.children].find((el) => el.localName === 'g');
    sector.setAttribute('d', rotatePath(sector.getAttribute('d'), delta));
    const mid = (templateAngle(category.first) + templateAngle(category.last + 1)) / 2;
    const from = polar(ICON_RADIUS, mid);
    const to = polar(ICON_RADIUS, mid + delta);
    const match = /^\s*translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)\s*$/.exec(
      icon.getAttribute('transform') || '',
    );
    if (!match)
      throw new Error(`Template: centre icon of ${categoryId} needs a translate(…) transform.`);
    icon.setAttribute(
      'transform',
      `translate(${fmt3(Number(match[1]) + to.x - from.x)},${fmt3(Number(match[2]) + to.y - from.y)})`,
    );
  }
}

function separatorGroup(doc, angles) {
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('id', 'Separators');
  setLayerName(group, 'Separators');
  angles.forEach((angle, i) => {
    const inner = polar(SEPARATOR.innerRadius, angle);
    const outer = polar(SEPARATOR.outerRadius, angle);
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('id', `Separator-${i + 1}`);
    setLayerName(path, 'Separator');
    path.setAttribute('d', `M${fmt3(inner.x)},${fmt3(inner.y)}L${fmt3(outer.x)},${fmt3(outer.y)}`);
    path.setAttribute(
      'style',
      `fill:none;stroke:white;stroke-width:${SEPARATOR.strokeWidth}px;stroke-linecap:butt;`,
    );
    group.append(path);
  });
  return group;
}

/**
 * Build one output document.
 * @param {object} base from prepare()
 * @param {object} spec
 *   groups: [{ id, name, criteria: Map<number, startAngle> }] cluster groups in order
 *   centre: 'all' | { categoryId, delta } | null
 *   legend: boolean; separators: angles[]; crop: boolean
 */
export function buildDocument(base, spec) {
  const doc = base.doc.cloneNode(true);
  const root = doc.documentElement;
  const diagram = doc.getElementById('Diagram');
  const categoryGroups = new Map([...diagram.children].map((el) => [el.id, el]));
  const criterionGroups = new Map();
  for (const group of categoryGroups.values()) {
    for (const el of [...group.children]) criterionGroups.set(el.id, el);
    group.replaceChildren();
  }
  diagram.replaceChildren();

  for (const groupSpec of spec.groups) {
    let group = categoryGroups.get(groupSpec.id);
    if (!group) {
      group = doc.createElementNS(SVG_NS, 'g');
      group.setAttribute('id', groupSpec.id);
      setLayerName(group, groupSpec.name);
    }
    diagram.append(group);
    for (const [number, start] of groupSpec.criteria) {
      group.append(criterionGroups.get(criterionId(number)));
      placeCriterion(base, doc, number, start);
    }
  }
  if (spec.separators?.length) diagram.append(separatorGroup(doc, spec.separators));

  const centre = doc.getElementById('Centre');
  if (!spec.centre) centre.remove();
  else if (spec.centre !== 'all')
    keepCentreSector(base, doc, spec.centre.categoryId, spec.centre.delta);

  const legend = doc.getElementById('Legend');
  if (!spec.legend) {
    legend.remove();
  } else if (spec.legend.position !== 'bottom') {
    // Move the legend as a whole; it is otherwise left as it is (§5.2).
    const { dx, dy, viewBox } = spec.legend;
    legend.setAttribute(
      'transform',
      `translate(${fmt3(dx)},${fmt3(dy)}) ${legend.getAttribute('transform') || ''}`.trim(),
    );
    root.setAttribute(
      'viewBox',
      [viewBox.x, viewBox.y, viewBox.width, viewBox.height].map(fmt3).join(' '),
    );
  }
  if (spec.crop) root.setAttribute('viewBox', `${CROP.x} ${CROP.y} ${CROP.size} ${CROP.size}`);
  return doc;
}

// Our own serialiser instead of XMLSerializer, whose output differs between
// browsers (Firefox, for example, adds its own XML declaration). Attributes are
// written in DOM order with their qualified names; namespace declarations are
// ordinary attributes of the root, as parsed from the template.
const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeText = (text) => text.replace(/[&<>]/g, (ch) => XML_ESCAPES[ch]);
const escapeAttribute = (text) =>
  text
    .replace(/[&<>"]/g, (ch) => XML_ESCAPES[ch])
    .replace(/[\t\n\r]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function serializeNode(node) {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const attributes = [...node.attributes]
        .map((attr) => ` ${attr.name}="${escapeAttribute(attr.value)}"`)
        .join('');
      const children = [...node.childNodes].map(serializeNode).join('');
      return children
        ? `<${node.nodeName}${attributes}>${children}</${node.nodeName}>`
        : `<${node.nodeName}${attributes}/>`;
    }
    case Node.TEXT_NODE:
      return escapeText(node.data);
    case Node.CDATA_SECTION_NODE:
      return `<![CDATA[${node.data}]]>`;
    case Node.COMMENT_NODE:
      return `<!--${node.data}-->`;
    default:
      return '';
  }
}

// An SVG element (usually the root) as XML text, identical in every browser.
export function serializeElement(element) {
  return serializeNode(element);
}

// A whole output document, with XML declaration.
export function serialize(doc) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializeElement(doc.documentElement)}\n`;
}

// --- Legend position (§5.2) ---------------------------------------------------

// The square frame around the crop square: crop plus FRAME_MARGIN_RATIO of the frame side on each side.
export function squareFrame() {
  const side = CROP.size / (1 - 2 * FRAME_MARGIN_RATIO);
  const margin = (side - CROP.size) / 2;
  return { x: CROP.x - margin, y: CROP.y - margin, width: side, height: side, margin };
}

/**
 * Where the legend goes and which page it gets (§5.2).
 * @param {{x,y,width,height}|null} box the legend's tight bounding box in the template
 *   (bottom position); not needed for 'bottom'
 * @param {string} position 'left' | 'right' | 'top' | 'bottom'
 * @returns {{ position, shape: 'a4'|'wide', dx, dy, box, viewBox: {x,y,width,height} }}
 */
export function legendLayout(box, position = DEFAULT_LEGEND_POSITION) {
  if (!LEGEND_POSITIONS.includes(position)) {
    throw new Error(`legendLayout: unknown legend position "${position}".`);
  }
  if (position === 'bottom') {
    return {
      position,
      shape: 'a4',
      dx: 0,
      dy: 0,
      box,
      viewBox: { x: 0, y: 0, width: PAGE.width, height: PAGE.height },
    };
  }
  if (!box) throw new Error(`legendLayout: the legend box is needed for position "${position}".`);
  const crop = { left: CROP.x, top: CROP.y, right: CROP.x + CROP.size, bottom: CROP.y + CROP.size };
  // In the template the legend sits below the crop square (gap, negative = overlap)
  // and is inset from its right edge; the other sides keep both distances, turned.
  const gap = box.y - crop.bottom;
  const inset = crop.right - (box.x + box.width);
  let { x, y } = box;
  if (position === 'top') {
    y = crop.top - gap - box.height;
  } else {
    y = crop.bottom - inset - box.height;
    x = position === 'right' ? crop.right + gap : crop.left - gap - box.width;
  }
  const moved = { x, y, width: box.width, height: box.height };
  let viewBox;
  if (position === 'top') {
    // A4 page: the legend is as far from the page top as the chart is in the bottom layout.
    viewBox = { x: 0, y: moved.y - CROP.y, width: PAGE.width, height: PAGE.height };
  } else {
    // 16:9 page: the square frame's height; chart and legend centred as one group.
    const frame = squareFrame();
    const width = frame.height * WIDE_ASPECT;
    const left = Math.min(crop.left, moved.x);
    const right = Math.max(crop.right, moved.x + moved.width);
    viewBox = { x: (left + right) / 2 - width / 2, y: frame.y, width, height: frame.height };
  }
  return {
    position,
    shape: position === 'top' ? 'a4' : 'wide',
    dx: moved.x - box.x,
    dy: moved.y - box.y,
    box: moved,
    viewBox,
  };
}

// --- Output files (§5) --------------------------------------------------------

function categoryOrderGroups(base, angleOf, numbers = null) {
  return base.template.categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      criteria: new Map(
        CRITERIA.filter(
          (c) => c.category.id === category.id && (!numbers || numbers.includes(c.number)),
        ).map((c) => [c.number, angleOf(c.number)]),
      ),
    }))
    .filter((group) => group.criteria.size > 0);
}

// Score overview layout: score clusters with their start angles from 12 o'clock.
function scoreLayout(base) {
  let start = 0;
  return scoreClusters(base.ratings).map((cluster) => {
    const angles = consecutiveAngles(cluster.criteria, start);
    const result = { ...cluster, start, angles };
    start += cluster.criteria.length * POSITION_ANGLE;
    return result;
  });
}

export const PIE_POSITION = { original: 'original', start: 'start' };
export const DEFAULT_START_ANGLE = 270;

/**
 * All output documents (§5) as [{ path, kind, name, legend, svg }]; svg is a string.
 * @param {object} base from prepare()
 * @param {object} [options]
 * @param {'original'|'start'} [options.piePosition] cluster and score files (§7.1)
 * @param {number} [options.startAngle] whole number 0–359, for 'start'
 * @param {string} [options.legendPosition] 'left' | 'right' | 'top' | 'bottom' (default)
 * @param {object} [options.legendBox] the template legend's bounding box (raster.js
 *   measureLegend), needed for positions other than bottom
 */
export function generateFiles(base, options = {}) {
  const piePosition = options.piePosition ?? PIE_POSITION.original;
  const startAngle = options.startAngle ?? DEFAULT_START_ANGLE;
  if (!Object.values(PIE_POSITION).includes(piePosition)) {
    throw new Error(`generateFiles: unknown pie position "${piePosition}".`);
  }
  if (!Number.isInteger(startAngle) || startAngle < 0 || startAngle >= FULL_CIRCLE) {
    throw new Error(`generateFiles: start angle must be a whole number 0–359, got ${startAngle}.`);
  }
  const ownLayout = piePosition === PIE_POSITION.start;
  const layout = legendLayout(
    options.legendBox ?? null,
    options.legendPosition ?? DEFAULT_LEGEND_POSITION,
  );

  const files = [];
  const add = (path, kind, name, spec) =>
    files.push({
      path,
      kind,
      name,
      legend: Boolean(spec.legend),
      layout: spec.legend || null,
      svg: serialize(buildDocument(base, spec)),
    });

  // Overviews always start at 12 o'clock.
  const categoryGroups = categoryOrderGroups(base, templateAngle);
  for (const legend of [false, true]) {
    add(legend ? 'overview-legend.svg' : 'overview.svg', 'overview', 'Overview', {
      groups: categoryGroups,
      centre: 'all',
      legend: legend ? layout : null,
    });
  }

  const scores = scoreLayout(base);
  const scoreGroups = scores.map((s) => ({ id: s.name, name: s.name, criteria: s.angles }));
  const separators = scores.length > 1 ? scores.map((s) => s.start) : [];
  for (const legend of [false, true]) {
    add(
      legend ? 'overview-scores-legend.svg' : 'overview-scores.svg',
      'overview',
      'Overview by score',
      {
        groups: scoreGroups,
        centre: null,
        legend: legend ? layout : null,
        separators,
      },
    );
  }

  for (const category of base.template.categories) {
    const numbers = CRITERIA.filter((c) => c.category.id === category.id).map((c) => c.number);
    const angles = ownLayout
      ? consecutiveAngles(numbers, startAngle)
      : new Map(numbers.map((n) => [n, templateAngle(n)]));
    const groups = [{ id: category.id, name: category.name, criteria: angles }];
    const delta = angles.get(numbers[0]) - templateAngle(numbers[0]);
    add(`clusters/${category.slug}.svg`, 'cluster', category.name, { groups, crop: true });
    add(`clusters/${category.slug}-centre.svg`, 'cluster', `${category.name} with centre`, {
      groups,
      crop: true,
      centre: { categoryId: category.id, delta },
    });
  }

  for (const score of scores) {
    const angles = ownLayout ? consecutiveAngles(score.criteria, startAngle) : score.angles;
    add(`scores/${score.slug}.svg`, 'score', score.name, {
      groups: [{ id: score.name, name: score.name, criteria: angles }],
      crop: true,
    });
  }

  // Slices always keep their category-overview position.
  for (const c of CRITERIA) {
    add(`slices/${c.slug}.svg`, 'slice', criterionLayerName(c.number, base.labels.get(c.number)), {
      groups: categoryOrderGroups(base, templateAngle, [c.number]),
      crop: true,
    });
  }
  return files;
}
