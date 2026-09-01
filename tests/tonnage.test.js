#!/usr/bin/env node
// Tonnage rounding test suite — run with: node tests/tonnage.test.js
// Extracts ceilTon from src/core.js so the SHIPPED code is tested, not a copy.
// Exit code 0 = all pass, 1 = failure.
/* eslint-disable sonarjs/code-eval -- new Function() intentionally extracts ceilTon
   from the shipped src/core.js so the deployed code is what's tested, not a copy */

'use strict';

const fs = require('fs');
const path = require('path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
const match = mainSrc.match(/function ceilTon\([\s\S]*?\n}/);
if (!match) {
  console.error('FATAL: ceilTon not found in src/core.js');
  process.exit(1);
}
const ceilTon = new Function(`${match[0]}; return ceilTon;`)();

const tests = [
  // [input, expected] — CLAUDE.md "Tonnage rounding": whole numbers only, always rounded UP
  [2.1, 3], // fractional always rounds up, never nearest
  [2.9, 3],
  [2.0, 2], // exact integer stays put
  [0, 0],
  [0.0001, 1], // even a hair over an integer rounds up
  [-5, 0], // negative clamps to 0, never a negative ton
  [-0.5, 0],
  ['7.5', 8], // string input parses first
  ['abc', 0], // unparseable → 0, not NaN
  [undefined, 0],
  [null, 0],
  [Infinity, 0], // non-finite clamps to 0
];

let allPass = true;
tests.forEach(([input, expected], i) => {
  const got = ceilTon(input);
  const pass = Object.is(got, expected);
  if (!pass) allPass = false;
  console.log(
    `Test ${i + 1}: ceilTon(${String(input)}) → expected=${expected}, got=${got} → ${pass ? 'PASS' : 'FAIL'}`,
  );
});
console.log(allPass ? 'ALL TESTS PASS ✅' : 'FAILURES — DO NOT DEPLOY ❌');
process.exit(allPass ? 0 : 1);
