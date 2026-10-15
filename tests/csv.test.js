import { test, assert, assertEqual } from './harness.js';
import { decodeCsv, detectDelimiter, formatMessage, parseCsv, readRatings } from '../csv.js';
import { CRITERIA } from '../names.js';

const SAMPLE_SCORES = [3, 5, 4, 5, 5, 5, 2, 4, 3, 5, 3, 5, 3, 5, 5, 3, 4, 5, 4, 5, 5, 5, 5, 5];

function quote(value, delimiter) {
  return /["\r\n]/.test(value) || value.includes(delimiter)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

// A valid CSV with all 24 criteria, built from the names table.
function csvText({
  delimiter = ';',
  eol = '\n',
  scores = SAMPLE_SCORES,
  header,
  names = true,
} = {}) {
  const head = header ?? ['criterion number', 'criterion name', 'score'];
  const lines = [head.map((h) => quote(h, delimiter)).join(delimiter)];
  for (const c of CRITERIA) {
    lines.push(
      [String(c.number), names ? c.label : '', String(scores[c.number - 1])]
        .map((v) => quote(v, delimiter))
        .join(delimiter),
    );
  }
  return lines.join(eol) + eol;
}

function errorTexts(result) {
  return result.errors.map(formatMessage);
}

test('csv: example file parses without messages', async () => {
  const bytes = new Uint8Array(await (await fetch('../examples/ratings.csv')).arrayBuffer());
  const result = readRatings(bytes);
  assertEqual(result.errors, []);
  assertEqual(result.warnings, []);
  assertEqual(result.delimiter, ';');
  assertEqual(result.ratings.length, 24);
  assertEqual(
    result.ratings.map((r) => r.score),
    SAMPLE_SCORES,
  );
  assertEqual(result.ratings[8].name, 'Inclusion, participation & co-design');
  assertEqual(result.ratings[0].row, 2);
});

test('csv: delimiters ; , and tab are detected from the header', () => {
  for (const delimiter of [';', ',', '\t']) {
    const text = csvText({ delimiter });
    assertEqual(detectDelimiter(text), delimiter);
    const result = readRatings(text);
    assertEqual(result.errors, [], `delimiter ${JSON.stringify(delimiter)}`);
    assertEqual(result.ratings[8].name, 'Inclusion, participation & co-design');
    assertEqual(result.ratings[20].name, 'Complexity, energy & emissions');
  }
});

test('csv: quoting with delimiters, "" and line breaks', () => {
  const { records } = parseCsv('a,"b,c","say ""hi""","line\nbreak"\r\nx,y\r\n', ',');
  assertEqual(records, [
    { row: 1, fields: ['a', 'b,c', 'say "hi"', 'line\nbreak'] },
    { row: 2, fields: ['x', 'y'] },
  ]);
  const text =
    'criterion number,criterion name,score\n' +
    csvText({ delimiter: ',' }).split('\n').slice(1).join('\n');
  const result = readRatings(
    text.replace('9,"Inclusion, participation & co-design",3', '9,"Two\nlines ""quoted""",3'),
  );
  assertEqual(result.errors, []);
  assertEqual(result.ratings[8].name, 'Two\nlines "quoted"');
});

test('csv: unclosed quote is an error', () => {
  const result = readRatings(csvText().replace('1;Objective & realisation;3', '1;"Objective;3'));
  assert(
    errorTexts(result).some((t) => /^Row 2: .*not closed/.test(t)),
    errorTexts(result).join(' | '),
  );
  assertEqual(result.ratings, []);
});

test('csv: header names are case-insensitive, trimmed, extra columns ignored', () => {
  const text = csvText({ header: [' Criterion Number ', 'CRITERION NAME', ' Score'] });
  assertEqual(readRatings(text).errors, []);
  const withComment = csvText()
    .split('\n')
    .map((line, i) => (line ? `${line};${i === 0 ? 'comment' : 'note ' + i}` : line))
    .join('\n');
  const result = readRatings(withComment);
  assertEqual(result.errors, []);
  assertEqual(result.ratings[0].score, 3);
});

test('csv: name column is optional; empty names fall back', () => {
  const lines = ['score;criterion number'];
  CRITERIA.forEach((c) => lines.push(`${SAMPLE_SCORES[c.number - 1]};${c.number}`));
  const result = readRatings(lines.join('\n'));
  assertEqual(result.errors, []);
  assert(result.ratings.every((r) => r.name === ''));
  assert(readRatings(csvText({ names: false })).ratings.every((r) => r.name === ''));
});

test('csv: UTF-8 BOM is removed', () => {
  const bytes = new TextEncoder().encode('﻿' + csvText());
  const result = readRatings(bytes);
  assertEqual(result.errors, []);
  assertEqual(decodeCsv(bytes).charCodeAt(0), 'c'.charCodeAt(0));
});

test('csv: Windows-1252 fallback', () => {
  const text = csvText().replace('Accountability', 'Rechenschaftspflicht für Öffentlichkeit');
  const bytes = Uint8Array.from(text, (ch) => ({ ü: 0xfc, Ö: 0xd6 })[ch] ?? ch.charCodeAt(0));
  const result = readRatings(bytes);
  assertEqual(result.errors, []);
  assertEqual(result.ratings[6].name, 'Rechenschaftspflicht für Öffentlichkeit');
  // Valid UTF-8 is decoded as UTF-8.
  assertEqual(
    readRatings(new TextEncoder().encode(text)).ratings[6].name,
    'Rechenschaftspflicht für Öffentlichkeit',
  );
});

test('csv: empty rows are ignored silently but keep row numbers', () => {
  const lines = csvText().split('\n');
  lines.splice(1, 0, '', ';;', ' ; \t;');
  const result = readRatings(lines.join('\r\n') + ';;\r\n\r\n');
  assertEqual(result.errors, []);
  assertEqual(result.warnings, []);
  assertEqual(result.ratings[0].row, 5);
});

test('csv: duplicate criterion → warning, first row wins', () => {
  const text = csvText() + '7;Other;5\n';
  const result = readRatings(text);
  assertEqual(result.errors, []);
  assertEqual(result.warnings.map(formatMessage), [
    'Row 26: Criterion 7 appears again (first in row 8); this row is ignored.',
  ]);
  assertEqual(result.ratings[6].score, 2);
  assertEqual(result.ratings[6].name, 'Accountability');
});

test('csv: missing required columns → error', () => {
  const noNumber = readRatings('number;criterion name;score\n1;x;3\n');
  assertEqual(errorTexts(noNumber), ['Row 1: Required column "criterion number" is missing.']);
  const noScore = readRatings('criterion number;criterion name;rating\n1;x;3\n');
  assertEqual(errorTexts(noScore), ['Row 1: Required column "score" is missing.']);
  assertEqual(errorTexts(readRatings('')).length, 2);
});

test('csv: criterion number not an integer 1–24 → error', () => {
  for (const bad of ['0', '25', '1.5', 'seven', '']) {
    const result = readRatings(csvText() + `${bad};x;3\n`);
    assertEqual(errorTexts(result), [
      `Row 26: Criterion number "${bad}" is not a whole number from 1 to 24.`,
    ]);
  }
});

test('csv: score not an integer 1–5 → error (6, 4.5, Good, 0, empty)', () => {
  for (const bad of ['6', '4.5', 'Good', '0', '', '4,5']) {
    const scores = [...SAMPLE_SCORES];
    scores[2] = bad;
    const result = readRatings(csvText({ scores }));
    assertEqual(errorTexts(result), [
      `Row 4: Score "${bad}" for criterion 3 is not a whole number from 1 to 5.`,
    ]);
    assertEqual(result.ratings, []);
  }
});

test('csv: missing criterion → error', () => {
  const lines = csvText().split('\n');
  lines.splice(7, 1); // criterion 7 (line 0 is the header)
  const result = readRatings(lines.join('\n'));
  assertEqual(errorTexts(result), ['Criterion 7 is missing.']);
});

test('csv: long name → warning with row number', () => {
  const text = csvText().replace('Accountability', 'A very long name');
  const result = readRatings(text, {
    measureLabel: (name) => (name === 'A very long name' ? 800 : 300),
    maxLabelWidth: 700,
  });
  assertEqual(result.errors, []);
  assertEqual(result.warnings.map(formatMessage), [
    'Row 8: The name of criterion 7 is about 800 px wide (more than 700 px), so it would run past the wedge.',
  ]);
});
