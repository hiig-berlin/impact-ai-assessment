// UI, file handling, downloads and ZIP (SPECS.md §8). The only module that touches the page.

import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from './vendor/fflate-0.8.2/fflate.js';
import { formatMessage, readRatings } from './csv.js';
import { CRITERIA } from './names.js';
import {
  DEFAULT_START_ANGLE,
  LABEL_MAX_WIDTH,
  PIE_POSITION,
  createMeasurer,
  generateFiles,
  loadTemplate,
  prepare,
} from './pie.js';
import { FORMATS, measureLegend, rasterFrame, rasterSvg, renderRaster } from './raster.js';

const EXAMPLE_CSV_URL = 'examples/ratings.csv';
const INPUT_FILE_NAME = 'ratings.csv';
const OPTION_DELAY_MS = 150; // debounce for typing in the start angle field
const PREVIEW_FILES = [
  { path: 'overview.svg', caption: 'Overview (category order)' },
  { path: 'overview-scores.svg', caption: 'Overview (score order)' },
  { path: 'clusters/impact.svg', caption: 'Impact pie' },
];
const FILE_GROUPS = [
  { kind: 'overview', title: 'Overviews' },
  { kind: 'cluster', title: 'Category clusters' },
  { kind: 'score', title: 'Score clusters' },
  { kind: 'slice', title: 'Slices' },
];

const $ = (selector) => document.querySelector(selector);

const state = {
  template: null,
  measurer: null,
  csvBytes: null, // the loaded CSV, for ratings.csv in the ZIP
  ratings: null, // valid ratings, or null if there are errors
  files: [], // generated files from pie.js
  legendBox: undefined, // measured once (the legend never changes)
  previewUrls: [],
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

function baseName(path) {
  return path.split('/').pop();
}

function withExtension(path, extension) {
  return path.replace(/\.svg$/, `.${extension}`);
}

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

// --- Options ----------------------------------------------------------------------

function readOptions() {
  const piePosition = document.querySelector('input[name="pie-position"]:checked').value;
  const scale = Number(document.querySelector('input[name="scale"]:checked').value);
  const field = $('#start-angle');
  const text = field.value.trim();
  const startAngle = /^\d+$/.test(text) ? Number(text) : NaN;
  const angleValid = startAngle >= 0 && startAngle <= 359;
  const useStart = piePosition === PIE_POSITION.start;
  $('#start-angle-controls').hidden = !useStart;
  field.setAttribute('aria-invalid', String(useStart && !angleValid));
  $('#start-angle-error').hidden = !useStart || angleValid;
  return {
    valid: !useStart || angleValid,
    generator: { piePosition, startAngle: angleValid ? startAngle : DEFAULT_START_ANGLE },
    scale,
  };
}

function zipFormats() {
  return [...document.querySelectorAll('input[name="zip-format"]:checked')].map((el) => el.value);
}

// --- CSV --------------------------------------------------------------------------

function renderMessages(result) {
  const container = $('#messages');
  container.replaceChildren();
  for (const [level, list, title] of [
    ['error', result.errors, 'The CSV has errors – nothing can be generated until they are fixed:'],
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

async function loadCsv(bytes, fileName) {
  await ready;
  if (!state.measurer) return; // initialisation failed; the error is shown
  state.csvBytes = bytes;
  const result = readRatings(bytes, {
    measureLabel: (name) => state.measurer.measure(name, 'label'),
    maxLabelWidth: LABEL_MAX_WIDTH,
  });
  renderMessages(result);
  const summary = result.errors.length
    ? `${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`
    : `${result.ratings.length} criteria` +
      (result.warnings.length
        ? `, ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`
        : '');
  $('#file-status').textContent = `Loaded “${fileName}”: ${summary}.`;
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

// --- Generation and preview ------------------------------------------------------------

let regenerateTimer = 0;

function scheduleRegenerate() {
  clearTimeout(regenerateTimer);
  regenerateTimer = setTimeout(() => regenerate().catch(showAppError), OPTION_DELAY_MS);
}

async function regenerate() {
  const options = readOptions();
  if (!state.busy) $('#zip-status').textContent = '';
  if (!state.ratings) {
    state.files = [];
    renderFileList();
    renderPreview();
    return;
  }
  if (!options.valid) return; // keep the last valid output while the angle is being fixed
  const base = prepare(state.template, state.ratings, state.measurer);
  state.files = generateFiles(base, options.generator);
  if (state.legendBox === undefined) {
    state.legendBox = await measureLegend(state.files.find((f) => f.legend).svg);
  }
  renderFileList();
  await renderPreview();
}

async function renderPreview() {
  const container = $('#preview');
  state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.previewUrls = [];
  if (!state.files.length) {
    container.replaceChildren(
      element('p', { class: 'placeholder' }, 'Load a valid CSV to see the preview.'),
    );
    return;
  }
  // Shown like the PNG files: square frame, embedded fonts.
  const frame = rasterFrame(1);
  const figures = await Promise.all(
    PREVIEW_FILES.map(async ({ path, caption }) => {
      const file = state.files.find((f) => f.path === path);
      const svg = await rasterSvg(file.svg, frame);
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      state.previewUrls.push(url);
      const figure = element('figure');
      figure.append(
        element('img', { src: url, alt: `Preview of ${path}` }),
        element('figcaption', {}, caption),
      );
      return figure;
    }),
  );
  container.replaceChildren(...figures);
}

// --- Downloads ----------------------------------------------------------------------

async function fileBlob(file, format, scale) {
  if (format === 'svg') return new Blob([file.svg], { type: 'image/svg+xml' });
  return renderRaster(file.svg, { format, scale, legendBox: file.legend ? state.legendBox : null });
}

async function downloadSingle(file, format, button) {
  if (state.busy) return;
  const { scale } = readOptions();
  button.disabled = true;
  try {
    const blob = await fileBlob(file, format, scale);
    downloadBlob(
      blob,
      baseName(format === 'svg' ? file.path : withExtension(file.path, FORMATS[format].extension)),
    );
  } catch (error) {
    showAppError(error);
  } finally {
    button.disabled = false;
  }
}

function renderFileList() {
  const container = $('#file-list');
  $('#download-zip').disabled = !state.files.length || state.busy;
  if (!state.files.length) {
    container.replaceChildren(
      element('p', { class: 'placeholder' }, 'Load a valid CSV to see the files.'),
    );
    return;
  }
  const table = element('table');
  for (const group of FILE_GROUPS) {
    const tbody = element('tbody');
    const head = element('tr');
    head.append(element('th', { scope: 'rowgroup', colspan: '2' }, group.title));
    tbody.append(head);
    for (const file of state.files.filter((f) => f.kind === group.kind)) {
      const row = element('tr');
      row.append(element('td', { class: 'path' }, file.path));
      const actions = element('td', { class: 'actions' });
      for (const format of ['svg', 'png', 'jpg']) {
        const button = element(
          'button',
          {
            type: 'button',
            class: 'button small',
            'aria-label': `Download ${withExtension(file.path, format)}`,
          },
          format.toUpperCase(),
        );
        button.addEventListener('click', () => downloadSingle(file, format, button));
        actions.append(button);
      }
      row.append(actions);
      tbody.append(row);
    }
    table.append(tbody);
  }
  const input = element('tbody');
  const inputHead = element('tr');
  inputHead.append(element('th', { scope: 'rowgroup', colspan: '2' }, 'Input'));
  const inputRow = element('tr');
  inputRow.append(element('td', { class: 'path' }, INPUT_FILE_NAME));
  const actions = element('td', { class: 'actions' });
  const button = element(
    'button',
    { type: 'button', class: 'button small', 'aria-label': 'Download ratings.csv' },
    'CSV',
  );
  button.addEventListener('click', () =>
    downloadBlob(new Blob([state.csvBytes], { type: 'text/csv' }), INPUT_FILE_NAME),
  );
  actions.append(button);
  inputRow.append(actions);
  input.append(inputHead, inputRow);
  table.append(input);
  container.replaceChildren(table);
}

// ZIP with the same folder structure; raster files are created one after
// another and released after compression (§5.1 "Memory").
async function downloadZip() {
  const formats = zipFormats();
  const status = $('#zip-status');
  if (!formats.length) {
    status.textContent = 'Select at least one format.';
    return;
  }
  const { scale } = readOptions();
  const files = state.files;
  const total = files.length * formats.length + 1;
  state.busy = true;
  $('#download-zip').disabled = true;
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
        status.textContent = `Creating file ${count} of ${total}…`;
        const path =
          format === 'svg' ? file.path : withExtension(file.path, FORMATS[format].extension);
        if (format === 'svg') {
          add(path, strToU8(file.svg), true);
        } else {
          const blob = await fileBlob(file, format, scale);
          add(path, new Uint8Array(await blob.arrayBuffer()), false);
        }
      }
    }
    add(INPUT_FILE_NAME, state.csvBytes, true);
    zip.end();
    await done;
    const name = `rating-pie-${today()}.zip`;
    downloadBlob(new Blob(chunks, { type: 'application/zip' }), name);
    status.textContent = `${name} is ready (${total} files).`;
  } catch (error) {
    status.textContent = 'The ZIP could not be created.';
    showAppError(error);
  } finally {
    state.busy = false;
    $('#download-zip').disabled = !state.files.length;
  }
}

// --- Events -----------------------------------------------------------------------

function setUpEvents() {
  const dropzone = $('#dropzone');
  $('#csv-input').addEventListener('change', (event) => {
    loadFile(event.target.files[0]);
    event.target.value = ''; // allow loading the same file again
  });
  // Dropping a file anywhere shouldn't navigate away from the page.
  for (const type of ['dragover', 'drop'])
    window.addEventListener(type, (event) => event.preventDefault());
  dropzone.addEventListener('dragover', () => dropzone.classList.add('dragging'));
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', (event) => {
    dropzone.classList.remove('dragging');
    loadFile(event.dataTransfer.files[0]);
  });
  $('#use-example').addEventListener('click', async () => {
    try {
      const response = await fetch(EXAMPLE_CSV_URL);
      await loadCsv(new Uint8Array(await response.arrayBuffer()), 'examples/ratings.csv');
    } catch (error) {
      showAppError(error);
    }
  });
  $('#download-template-csv').addEventListener('click', () =>
    downloadBlob(emptyTemplateCsv(), 'ratings-template.csv'),
  );
  for (const input of document.querySelectorAll('input[name="pie-position"]')) {
    input.addEventListener('change', scheduleRegenerate);
  }
  $('#start-angle').addEventListener('input', scheduleRegenerate);
  for (const button of document.querySelectorAll('[data-angle]')) {
    button.addEventListener('click', () => {
      $('#start-angle').value = button.dataset.angle;
      scheduleRegenerate();
    });
  }
  for (const input of document.querySelectorAll('input[name="scale"]')) {
    input.addEventListener('change', readOptions);
  }
  $('#download-zip').addEventListener('click', downloadZip);
}

async function init() {
  setUpEvents();
  readOptions();
  try {
    state.template = await loadTemplate();
    state.measurer = await createMeasurer(state.template);
  } catch (error) {
    showAppError(error);
    for (const el of document.querySelectorAll('#csv-input, #use-example')) el.disabled = true;
  }
}

const ready = init();
