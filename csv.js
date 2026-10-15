// CSV decoding, parsing and validation (SPECS.md §4.2). Pure functions, no UI.

import { CRITERION_COUNT, MAX_SCORE, MIN_SCORE } from './names.js';

export const COLUMN_NUMBER = 'criterion number';
export const COLUMN_NAME = 'criterion name';
export const COLUMN_SCORE = 'score';

const DELIMITERS = [';', ',', '\t'];

// Bytes → text: UTF-8 (with or without BOM), falling back to Windows-1252.
export function decodeCsv(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    text = new TextDecoder('windows-1252').decode(data);
  }
  return text.replace(/^﻿/, '');
}

// The delimiter that occurs most often (outside quotes) in the header row.
export function detectDelimiter(text) {
  const counts = new Map(DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  let seenContent = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (seenContent) break; // end of the header row; skip leading empty lines
    } else if (!inQuotes && counts.has(ch)) {
      counts.set(ch, counts.get(ch) + 1);
    }
    if (ch.trim() !== '' && !counts.has(ch)) seenContent = true;
  }
  let best = DELIMITERS[0];
  for (const d of DELIMITERS) {
    if (counts.get(d) > counts.get(best)) best = d;
  }
  return best;
}

// RFC 4180 parser. Returns { records: [{ row, fields }], unclosedQuoteRow }.
// `row` is the 1-based record number (the row number shown in Excel).
export function parseCsv(text, delimiter) {
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let quoteStartRow = 0;
  let row = 1;
  let i = 0;

  const endRecord = () => {
    fields.push(field);
    records.push({ row, fields });
    fields = [];
    field = '';
    row++;
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      // A quote at the start of a field (after optional spaces) opens a quoted field.
      field = '';
      inQuotes = true;
      quoteStartRow = row;
    } else if (ch === delimiter) {
      fields.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      endRecord();
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
    i++;
  }
  if (field !== '' || fields.length > 0 || inQuotes) endRecord();
  return { records, unclosedQuoteRow: inQuotes ? quoteStartRow : 0 };
}

function isEmptyRecord(record) {
  return record.fields.every((f) => f.trim() === '');
}

function normaliseHeader(name) {
  return name.trim().toLowerCase();
}

function parseInteger(value, min, max) {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return number >= min && number <= max ? number : null;
}

function message(level, row, text) {
  return { level, row, text };
}

// Message as shown to the user, e.g. "Row 5: …".
export function formatMessage(msg) {
  return msg.row ? `Row ${msg.row}: ${msg.text}` : msg.text;
}

/**
 * Parse and validate a scores CSV.
 * @param {string|Uint8Array|ArrayBuffer} input CSV text or raw bytes
 * @param {object} [options]
 * @param {(name: string) => number} [options.measureLabel] width of a label in template units
 * @param {number} [options.maxLabelWidth] labels wider than this give a warning
 * @returns {{ ratings: {number, name, score, row}[], errors: object[], warnings: object[], delimiter: string }}
 *   `ratings` is sorted by criterion number; `name` is '' when the CSV has none.
 */
export function readRatings(input, options = {}) {
  const text = typeof input === 'string' ? input.replace(/^﻿/, '') : decodeCsv(input);
  const delimiter = detectDelimiter(text);
  const { records, unclosedQuoteRow } = parseCsv(text, delimiter);
  const errors = [];
  const warnings = [];
  const result = () => ({
    ratings: errors.length ? [] : [...byNumber.values()].sort((a, b) => a.number - b.number),
    errors,
    warnings,
    delimiter,
  });
  const byNumber = new Map();

  if (unclosedQuoteRow) {
    errors.push(message('error', unclosedQuoteRow, 'A quoted field is not closed (missing ").'));
  }

  const rows = records.filter((r) => !isEmptyRecord(r));
  const header = rows.shift();
  const headerNames = header ? header.fields.map(normaliseHeader) : [];
  const headerRow = header ? header.row : 1;
  const columns = {
    number: headerNames.indexOf(COLUMN_NUMBER),
    name: headerNames.indexOf(COLUMN_NAME),
    score: headerNames.indexOf(COLUMN_SCORE),
  };
  for (const [key, column] of [
    ['number', COLUMN_NUMBER],
    ['score', COLUMN_SCORE],
  ]) {
    if (columns[key] < 0) {
      errors.push(message('error', headerRow, `Required column "${column}" is missing.`));
    }
  }
  if (errors.length) return result();

  const field = (record, index) => (index >= 0 ? (record.fields[index] ?? '') : '');

  for (const record of rows) {
    const rawNumber = field(record, columns.number);
    const number = parseInteger(rawNumber, 1, CRITERION_COUNT);
    if (number === null) {
      errors.push(
        message(
          'error',
          record.row,
          `Criterion number "${rawNumber.trim()}" is not a whole number from 1 to ${CRITERION_COUNT}.`,
        ),
      );
      continue;
    }
    const first = byNumber.get(number);
    if (first) {
      warnings.push(
        message(
          'warning',
          record.row,
          `Criterion ${number} appears again (first in row ${first.row}); this row is ignored.`,
        ),
      );
      continue;
    }
    const rawScore = field(record, columns.score);
    const score = parseInteger(rawScore, MIN_SCORE, MAX_SCORE);
    if (score === null) {
      errors.push(
        message(
          'error',
          record.row,
          `Score "${rawScore.trim()}" for criterion ${number} is not a whole number from ${MIN_SCORE} to ${MAX_SCORE}.`,
        ),
      );
    }
    const name = field(record, columns.name).trim();
    byNumber.set(number, { number, name, score, row: record.row });

    if (name && options.measureLabel && options.maxLabelWidth) {
      const width = options.measureLabel(name);
      if (width > options.maxLabelWidth) {
        warnings.push(
          message(
            'warning',
            record.row,
            `The name of criterion ${number} is about ${Math.round(width)} px wide ` +
              `(more than ${options.maxLabelWidth} px), so it would run past the wedge.`,
          ),
        );
      }
    }
  }

  for (let number = 1; number <= CRITERION_COUNT; number++) {
    if (!byNumber.has(number)) {
      errors.push(message('error', 0, `Criterion ${number} is missing.`));
    }
  }
  return result();
}
