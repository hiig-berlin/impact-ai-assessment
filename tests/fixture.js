// Shared test fixture: template, measurer and the example ratings.

import { createMeasurer, loadTemplate, prepare } from '../pie.js';
import { readRatings } from '../csv.js';

export const template = await loadTemplate();
export const measurer = await createMeasurer(template);
export const exampleCsv = await (await fetch('../examples/ratings.csv')).text();
export const exampleRatings = readRatings(exampleCsv).ratings;

export function base(ratings = exampleRatings) {
  return prepare(template, ratings, measurer);
}

export function parseSvg(text) {
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}

export function file(files, path) {
  const found = files.find((f) => f.path === path);
  if (!found) throw new Error(`no output file ${path}`);
  return { ...found, doc: parseSvg(found.svg) };
}

export const AFFINITY_NS = 'https://www.affinity.studio/';
export const layerName = (el) => el.getAttributeNS(AFFINITY_NS, 'id');
