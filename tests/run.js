// Test page entry: imports all test modules, runs them and shows pass/fail.
// The results are also exposed as window.testResults for headless runs.

import { run } from './harness.js';
import './names.test.js';
import './csv.test.js';

const list = document.getElementById('results');
const summary = document.getElementById('summary');

const results = await run((result) => {
  const item = document.createElement('li');
  item.className = result.passed ? 'pass' : 'fail';
  item.textContent = `${result.passed ? 'PASS' : 'FAIL'} – ${result.name}`;
  if (!result.passed) {
    const pre = document.createElement('pre');
    pre.textContent = result.error;
    item.append(pre);
  }
  list.append(item);
});

const failed = results.filter((r) => !r.passed).length;
summary.textContent = `${results.length - failed} of ${results.length} tests passed` + (failed ? `, ${failed} failed` : '');
summary.className = failed ? 'fail' : 'pass';
window.testResults = results;
