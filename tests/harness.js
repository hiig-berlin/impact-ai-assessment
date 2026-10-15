// Minimal test harness: test(name, fn) collects tests, run() executes them in order.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export class AssertionError extends Error {}

export function assert(condition, message = 'assertion failed') {
  if (!condition) throw new AssertionError(message);
}

export function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new AssertionError(`${message ? message + ': ' : ''}expected ${e}, got ${a}`);
  }
}

export function assertClose(actual, expected, tolerance, message = '') {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new AssertionError(
      `${message ? message + ': ' : ''}expected ${expected} ± ${tolerance}, got ${actual}`,
    );
  }
}

export async function assertThrows(fn, pattern, message = '') {
  try {
    await fn();
  } catch (error) {
    if (pattern && !pattern.test(error.message)) {
      throw new AssertionError(`${message}: wrong error "${error.message}"`);
    }
    return;
  }
  throw new AssertionError(`${message ? message + ': ' : ''}expected an error`);
}

export async function run(onResult) {
  const results = [];
  for (const { name, fn } of tests) {
    const result = { name, passed: true, error: '' };
    try {
      await fn();
    } catch (error) {
      result.passed = false;
      result.error = error instanceof AssertionError ? error.message : String(error.stack || error);
    }
    results.push(result);
    onResult(result);
  }
  return results;
}
