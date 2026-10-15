// Template parsing, geometry, ordering and SVG export (SPECS.md §6, §7). No UI code.

import { CATEGORIES, CRITERIA, CRITERION_COUNT, criterionId } from './names.js';

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
    if (!sector || !icon) throw templateError(`#Centre-${category.id} needs a sector path and an icon group.`);
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
