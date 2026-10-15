// UI, file handling, downloads and ZIP (SPECS.md §8). The only module that touches the page.

import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from './vendor/fflate-0.8.2/fflate.js';
import { formatMessage, readRatings } from './csv.js';
import { CATEGORIES, CRITERIA, SCORES } from './names.js';
import {
  DEFAULT_LEGEND_POSITION,
  DEFAULT_START_ANGLE,
  LABEL_MAX_WIDTH,
  PIE_POSITION,
  createMeasurer,
  generateFiles,
  loadTemplate,
  prepare,
  serialize,
} from './pie.js';
import { FORMATS, measureLegend, rasterFrame, rasterSvg, renderRaster } from './raster.js';

const EXAMPLE_CSV_URL = 'examples/ratings.csv';
const INPUT_FILE_NAME = 'ratings.csv';
const ZIP_PREFIX = 'rating-pie';
const OPTION_DELAY_MS = 150; // debounce for typing in the start angle field
const TOAST_MS = 4000;

// Tabs of the preview (§8): which files each shows, and their titles.
const TABS = [
  { id: 'overviews', label: 'Overviews', zipName: 'overviews' },
  { id: 'clusters', label: 'Clusters', zipName: 'clusters' },
  { id: 'scores', label: 'Scores', zipName: 'scores' },
  { id: 'slices', label: 'Slices', zipName: 'slices' },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  template: null,
  measurer: null,
  legendBox: null, // the template legend's bounding box, measured once
  csvBytes: null, // the loaded CSV, for ratings.csv in the ZIP
  ratings: null, // valid ratings, or null if there are errors
  files: [], // generated files from pie.js
  previews: new Map(), // file path → object URL of its framed preview SVG
  generation: 0, // increases with every regenerate(), so stale previews are dropped
  tab: 'overviews',
  view: 'gallery',
  selected: {}, // tab id → selected item index
  legendOn: false,
  centre: false,
  busy: false,
};

// --- Helpers ----------------------------------------------------------------------

function element(tag, attributes = {}, text = '') {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  if (text) el.textContent = text;
  return el;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = element('a', { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const baseName = (path) => path.split('/').pop();
const withExtension = (path, extension) => path.replace(/\.svg$/, `.${extension}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function showAppError(error) {
  console.error(error);
  const box = $('#app-error');
  box.textContent = `Something went wrong: ${error.message}`;
  box.hidden = false;
}

let toastTimer = 0;

function toast(text, { sticky = false } = {}) {
  const box = $('#status');
  clearTimeout(toastTimer);
  box.textContent = text;
  box.hidden = false;
  if (!sticky) toastTimer = setTimeout(() => (box.hidden = true), TOAST_MS);
}

// --- Options ----------------------------------------------------------------------

function readOptions() {
  const piePosition = $('input[name="pie-position"]:checked').value;
  const useStart = piePosition === PIE_POSITION.start;
  const field = $('#start-angle');
  const text = field.value.trim();
  const startAngle = /^\d+$/.test(text) ? Number(text) : NaN;
  const angleValid = startAngle >= 0 && startAngle <= 359;

  // The angle controls are only active in "start angle" mode.
  field.disabled = !useStart;
  $$('[data-angle]').forEach((button) => (button.disabled = !useStart));
  $('#start-angle-row').setAttribute('aria-disabled', String(!useStart));
  field.setAttribute('aria-invalid', String(useStart && !angleValid));
  $('#start-angle-error').hidden = !useStart || angleValid;

  return {
    valid: !useStart || angleValid,
    generator: {
      piePosition,
      startAngle: angleValid ? startAngle : DEFAULT_START_ANGLE,
      legendPosition: $('input[name="legend-position"]:checked')?.value ?? DEFAULT_LEGEND_POSITION,
      legendBox: state.legendBox,
    },
    scale: Number($('input[name="scale"]:checked').value),
  };
}

const zipFormats = () => $$('input[name="zip-format"]:checked').map((el) => el.value);

// --- CSV --------------------------------------------------------------------------

function renderMessages(result) {
  const container = $('#messages');
  container.replaceChildren();
  for (const [level, list, title] of [
    ['error', result.errors, 'Please fix these errors in the CSV:'],
    ['warning', result.warnings, 'Warnings:'],
  ]) {
    if (!list.length) continue;
    const box = element('div', {
      class: `message-box ${level}`,
      role: level === 'error' ? 'alert' : 'status',
    });
    box.append(element('h3', {}, title));
    const ul = element('ul');
    for (const msg of list) ul.append(element('li', {}, formatMessage(msg)));
    box.append(ul);
    container.append(box);
  }
}

function renderFileCard(fileName, result) {
  $('#dropzone').hidden = true;
  $('#file-card').hidden = false;
  $('#file-name').textContent = fileName;
  const dot = $('#file-dot');
  dot.className = 'file-dot';
  let meta;
  if (result.errors.length) {
    dot.classList.add('error');
    meta = plural(result.errors.length, 'error');
  } else {
    const scores = new Set(result.ratings.map((r) => r.score)).size;
    meta = `${result.ratings.length} criteria · ${plural(scores, 'score')} · `;
    meta += result.warnings.length ? plural(result.warnings.length, 'warning') : 'no warnings';
    if (result.warnings.length) dot.classList.add('warning');
  }
  $('#file-meta').textContent = meta;
}

async function loadCsv(bytes, fileName) {
  await ready;
  if (!state.measurer) return; // initialisation failed; the error is shown
  state.csvBytes = bytes;
  const result = readRatings(bytes, {
    measureLabel: (name) => state.measurer.measure(name, 'label'),
    maxLabelWidth: LABEL_MAX_WIDTH,
  });
  renderMessages(result);
  renderFileCard(fileName, result);
  state.ratings = result.errors.length ? null : result.ratings;
  await regenerate();
}

async function loadFile(file) {
  if (!file) return;
  try {
    await loadCsv(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (error) {
    showAppError(error);
  }
}

function emptyTemplateCsv() {
  const quote = (value) => (/[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = ['criterion number;criterion name;score'];
  for (const c of CRITERIA) lines.push(`${c.number};${quote(c.label)};`);
  // BOM so that Excel opens the file as UTF-8.
  return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

// --- Generation ---------------------------------------------------------------------

let regenerateTimer = 0;

function scheduleRegenerate() {
  clearTimeout(regenerateTimer);
  regenerateTimer = setTimeout(() => regenerate().catch(showAppError), OPTION_DELAY_MS);
}

async function regenerate() {
  const options = readOptions();
  if (!state.ratings) {
    setFiles([]);
    return;
  }
  if (!options.valid) return; // keep the last valid output while the angle is being fixed
  const base = prepare(state.template, state.ratings, state.measurer);
  setFiles(generateFiles(base, options.generator));
}

function setFiles(files) {
  state.files = files;
  state.generation++;
  for (const url of state.previews.values()) URL.revokeObjectURL(url);
  state.previews.clear();
  $('#download-all').disabled = !files.length || state.busy;
  render();
}

const fileAt = (path) => state.files.find((f) => f.path === path);

// Items of a tab: title, short label and the file shown for the current switches.
// `files` lists every file of the item (for the tab's ZIP).
function tabItems(tabId) {
  if (tabId === 'overviews') {
    return [
      ['Category order', 'Categories', 'overview'],
      ['Score order', 'Scores', 'overview-scores'],
    ].map(([title, short, stem]) => ({
      title,
      short,
      file: fileAt(`${stem}${state.legendOn ? '-legend' : ''}.svg`),
      files: [fileAt(`${stem}.svg`), fileAt(`${stem}-legend.svg`)],
    }));
  }
  if (tabId === 'clusters') {
    return CATEGORIES.map((c) => ({
      title: c.name,
      short: c.name.split(' ')[0],
      file: fileAt(`clusters/${c.slug}${state.centre ? '-centre' : ''}.svg`),
      files: [fileAt(`clusters/${c.slug}.svg`), fileAt(`clusters/${c.slug}-centre.svg`)],
    }));
  }
  if (tabId === 'scores') {
    return SCORES.map((s) => ({ s, file: fileAt(`scores/${s.slug}.svg`) }))
      .filter(({ file }) => file)
      .map(({ s, file }) => ({ title: s.name, short: s.name, file, files: [file] }));
  }
  return CRITERIA.map((c) => {
    const file = fileAt(`slices/${c.slug}.svg`);
    return { title: file.name, short: String(c.number).padStart(2, '0'), file, files: [file] };
  });
}

// Object URL of a file's preview: framed like its PNG, with embedded fonts.
async function previewUrl(file) {
  if (state.previews.has(file.path)) return state.previews.get(file.path);
  const generation = state.generation;
  const svg = await rasterSvg(file.svg, rasterFrame(1, file.layout));
  if (generation !== state.generation) return null; // outdated by a newer generation
  if (!state.previews.has(file.path)) {
    state.previews.set(file.path, URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
  }
  return state.previews.get(file.path);
}

function setImage(img, file) {
  img.dataset.path = file.path;
  previewUrl(file)
    .then((url) => {
      if (url && img.dataset.path === file.path) img.src = url;
    })
    .catch(showAppError);
}

// --- Rendering the preview ------------------------------------------------------------

function render() {
  renderTabs();
  const loaded = state.files.length > 0;
  $('#preview-empty').hidden = loaded;
  $('#gallery').hidden = !loaded || state.view !== 'gallery';
  $('#grid').hidden = !loaded || state.view !== 'grid';
  $('#centre-option').hidden = !loaded || state.tab !== 'clusters';
  $('#tabs').setAttribute('aria-disabled', String(!loaded));
  if (!loaded) return;
  if (state.view === 'gallery') renderGallery();
  else renderGrid();
}

function renderTabs() {
  const loaded = state.files.length > 0;
  const tabs = TABS.map((tab) => {
    const selected = tab.id === state.tab;
    const button = element('button', {
      type: 'button',
      class: 'tab',
      role: 'tab',
      id: `tab-${tab.id}`,
      'aria-selected': String(selected),
      'aria-controls': 'preview-panel',
      tabindex: selected ? '0' : '-1',
    });
    button.append(tab.label);
    if (loaded) {
      button.append(' ', element('span', { class: 'count' }, String(tabItems(tab.id).length)));
    }
    button.addEventListener('click', () => selectTab(tab.id));
    return button;
  });
  $('#tabs').replaceChildren(...tabs);
  $('#preview-panel').setAttribute('aria-labelledby', `tab-${state.tab}`);
}

function selectTab(id, focus = false) {
  state.tab = id;
  render();
  if (focus) $(`#tab-${id}`).focus();
}

function selectedIndex(items) {
  return Math.min(state.selected[state.tab] ?? 0, items.length - 1);
}

function select(index, { view } = {}) {
  state.selected[state.tab] = index;
  if (view) state.view = view;
  $(`input[name="view"][value="${state.view}"]`).checked = true;
  render();
}

function renderGallery() {
  const items = tabItems(state.tab);
  const index = selectedIndex(items);
  const current = items[index];

  const main = $('#main-preview');
  main.alt = `Preview of ${current.file.path}`;
  main.classList.toggle('wide', current.file.layout?.shape === 'wide');
  setImage(main, current.file);

  $('#file-select').replaceChildren(
    ...items.map((item, i) => {
      const option = element('option', { value: String(i) }, item.file.path);
      option.selected = i === index;
      return option;
    }),
  );

  const thumbs = items.map((item, i) => {
    const button = element('button', {
      type: 'button',
      class: 'thumb',
      role: 'option',
      'aria-selected': String(i === index),
      'aria-label': item.file.path,
      title: item.title,
    });
    const img = element('img', { alt: '' });
    setImage(img, item.file);
    button.append(img, element('span', {}, item.short));
    button.addEventListener('click', () => select(i));
    return button;
  });
  $('#thumbs').replaceChildren(...thumbs);
}

function renderGrid() {
  const items = tabItems(state.tab);
  const tab = TABS.find((t) => t.id === state.tab);
  const fileCount = items.flatMap((item) => item.files).length;
  $('#grid-caption').textContent =
    `${plural(items.length, 'graphic')} · click one to open it in the gallery`;
  $('#download-group-label').textContent = `Download ${tab.zipName} (${plural(fileCount, 'file')})`;
  $('#tiles').classList.toggle('two', items.length <= 2);
  const tiles = items.map((item, i) => {
    const button = element('button', {
      type: 'button',
      class: 'tile',
      'aria-label': `Open ${item.file.path} in the gallery`,
    });
    const img = element('img', { alt: '' });
    setImage(img, item.file);
    button.append(
      img,
      element('span', { class: 'tile-title' }, item.title),
      element('span', { class: 'tile-path' }, item.file.path),
    );
    button.addEventListener('click', () => select(i, { view: 'gallery' }));
    return button;
  });
  $('#tiles').replaceChildren(...tiles);
}

// --- Downloads ----------------------------------------------------------------------

async function fileBlob(file, format, scale) {
  if (format === 'svg') return new Blob([file.svg], { type: 'image/svg+xml' });
  return renderRaster(file.svg, { format, scale, layout: file.layout });
}

const pathFor = (file, format) =>
  format === 'svg' ? file.path : withExtension(file.path, FORMATS[format].extension);

function setBusy(busy) {
  state.busy = busy;
  $('#download-all').disabled = busy || !state.files.length;
  $('#download-group').disabled = busy;
  $$('[data-download]').forEach((button) => (button.disabled = busy));
}

async function downloadCurrent(format) {
  if (state.busy) return;
  const items = tabItems(state.tab);
  const file = items[selectedIndex(items)].file;
  setBusy(true);
  try {
    const blob = await fileBlob(file, format, readOptions().scale);
    downloadBlob(blob, baseName(pathFor(file, format)));
  } catch (error) {
    showAppError(error);
  } finally {
    setBusy(false);
  }
}

// ZIP with the same folder structure; raster files are created one after
// another and released after compression (§5.1 "Memory").
async function downloadZip(files, name, { withInput }) {
  if (state.busy) return;
  const formats = zipFormats();
  if (!formats.length) {
    toast('Select at least one format under Options.');
    return;
  }
  const { scale } = readOptions();
  const total = files.length * formats.length + (withInput ? 1 : 0);
  setBusy(true);
  try {
    const chunks = [];
    let finish;
    const done = new Promise((resolve, reject) => {
      finish = (error) => (error ? reject(error) : resolve());
    });
    const zip = new Zip((error, data, final) => {
      if (error) return finish(error);
      chunks.push(data);
      if (final) finish();
    });
    const add = (path, bytes, compress) => {
      const entry = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
      zip.add(entry);
      entry.push(bytes, true);
    };
    let count = 0;
    for (const format of formats) {
      for (const file of files) {
        count++;
        toast(`Preparing ${count} of ${total} files…`, { sticky: true });
        if (format === 'svg') {
          add(file.path, strToU8(file.svg), true);
        } else {
          const blob = await fileBlob(file, format, scale);
          add(pathFor(file, format), new Uint8Array(await blob.arrayBuffer()), false);
        }
      }
    }
    if (withInput) add(INPUT_FILE_NAME, state.csvBytes, true);
    zip.end();
    await done;
    downloadBlob(new Blob(chunks, { type: 'application/zip' }), name);
    toast(`${name} is ready (${plural(total, 'file')}).`);
  } catch (error) {
    toast('The ZIP could not be created.');
    showAppError(error);
  } finally {
    setBusy(false);
  }
}

function downloadAll() {
  return downloadZip(state.files, `${ZIP_PREFIX}-${today()}.zip`, { withInput: true });
}

function downloadGroup() {
  const tab = TABS.find((t) => t.id === state.tab);
  const files = tabItems(state.tab).flatMap((item) => item.files);
  return downloadZip(files, `${ZIP_PREFIX}-${today()}-${tab.zipName}.zip`, { withInput: false });
}

// --- Events -----------------------------------------------------------------------

function setUpDrop() {
  // Dropping a file anywhere shouldn't navigate away from the page.
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (event) => event.preventDefault());
  }
  for (const zone of [$('#dropzone'), $('#file-card')]) {
    zone.addEventListener('dragover', () => zone.classList.add('dragging'));
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', (event) => {
      zone.classList.remove('dragging');
      loadFile(event.dataTransfer.files[0]);
    });
  }
}

function setUpTabsKeyboard() {
  // ARIA tab pattern: arrow keys, Home and End move between tabs.
  $('#tabs').addEventListener('keydown', (event) => {
    const index = TABS.findIndex((t) => t.id === state.tab);
    const last = TABS.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTab(TABS[next].id, true);
  });
}

function setUpEvents() {
  $('#csv-input').addEventListener('change', (event) => {
    loadFile(event.target.files[0]);
    event.target.value = ''; // allow loading the same file again
  });
  setUpDrop();
  $('#use-example').addEventListener('click', async () => {
    try {
      const response = await fetch(EXAMPLE_CSV_URL);
      await loadCsv(new Uint8Array(await response.arrayBuffer()), 'Example scores');
    } catch (error) {
      showAppError(error);
    }
  });
  $('#download-template-csv').addEventListener('click', () =>
    downloadBlob(emptyTemplateCsv(), 'ratings-template.csv'),
  );

  $$('input[name="pie-position"]').forEach((input) =>
    input.addEventListener('change', scheduleRegenerate),
  );
  $('#start-angle').addEventListener('input', scheduleRegenerate);
  $$('[data-angle]').forEach((button) =>
    button.addEventListener('click', () => {
      $('#start-angle').value = button.dataset.angle;
      scheduleRegenerate();
    }),
  );

  $('#legend-switch').addEventListener('click', () => {
    state.legendOn = !state.legendOn;
    $('#legend-switch').setAttribute('aria-checked', String(state.legendOn));
    $('#legend-positions').disabled = !state.legendOn;
    render();
  });
  $$('input[name="legend-position"]').forEach((input) =>
    input.addEventListener('change', scheduleRegenerate),
  );

  $('#centre-toggle').addEventListener('change', (event) => {
    state.centre = event.target.checked;
    render();
  });
  $$('input[name="view"]').forEach((input) =>
    input.addEventListener('change', () => {
      state.view = input.value;
      render();
    }),
  );
  setUpTabsKeyboard();
  $('#file-select').addEventListener('change', (event) => select(Number(event.target.value)));
  $$('[data-download]').forEach((button) =>
    button.addEventListener('click', () => downloadCurrent(button.dataset.download)),
  );
  $('#download-group').addEventListener('click', downloadGroup);
  $('#download-all').addEventListener('click', downloadAll);
}

async function init() {
  setUpEvents();
  readOptions();
  render();
  try {
    state.template = await loadTemplate();
    state.measurer = await createMeasurer(state.template);
    // The legend never changes: measure it once for the legend positions (§5.2).
    state.legendBox = await measureLegend(serialize(state.template.doc));
  } catch (error) {
    showAppError(error);
    $('#use-example').disabled = true;
    $('#csv-input').disabled = true;
  }
}

const ready = init();
