#!/usr/bin/env node
// Amount-in-words test suite — run with: node tests/words.test.js
// Extracts numToWordsBDT from src/core.js so the SHIPPED code is tested, not a copy.
// Exit code 0 = all pass, 1 = failure.
/* eslint-disable sonarjs/code-eval -- new Function() intentionally extracts numToWordsBDT
   from the shipped src/core.js so the deployed code is what's tested, not a copy */

'use strict';

const fs = require('fs');
const path = require('path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
const match = mainSrc.match(/function numToWordsBDT\([\s\S]*?\n}/);
if (!match) {
  console.error('FATAL: numToWordsBDT not found in src/core.js');
  process.exit(1);
}
const numToWordsBDT = new Function(`${match[0]}; return numToWordsBDT;`)();

const tests = [
  // [amount, expected]
  [0, 'Taka Zero Only'],
  [0.5, 'Taka Zero and Fifty Poysha Only'], // sub-one-taka amount
  [1, 'Taka One Only'], // exact taka, no poysha clause
  [72.72, 'Taka Seventy Two and Seventy Two Poysha Only'],
  [60394.72, 'Taka Sixty Thousand Three Hundred Ninety Four and Seventy Two Poysha Only'], // CLAUDE.md's r2 boundary example
  [1000, 'Taka One Thousand Only'],
  [99999, 'Taka Ninety Nine Thousand Nine Hundred Ninety Nine Only'], // lakh boundary, just below
  [100000, 'Taka One Lakh Only'], // lakh boundary, exact
  [9999999, 'Taka Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Only'], // crore boundary, just below
  [10000000, 'Taka One Crore Only'], // crore boundary, exact
  [1234567.89, 'Taka Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Poysha Only'],
  [100000.5, 'Taka One Lakh and Fifty Poysha Only'],
  [381150.58, 'Taka Three Lakh Eighty One Thousand One Hundred Fifty and Fifty Eight Poysha Only'], // real re-export bill total
  [-5.5, 'Taka Five and Fifty Poysha Only'], // negative clamps to its magnitude, never a signed word
  [NaN, 'Taka Zero Only'], // non-finite clamps to 0, never "NaN"
  [Infinity, 'Taka Zero Only'],
  [0.001, 'Taka Zero Only'], // sub-poysha rounds away (Math.round(0.1) === 0 poysha)
  [0.005, 'Taka Zero and One Poysha Only'], // half-poysha rounds up (Math.round, not banker's — this is display text, not calcVATmpa)
];

let allPass = true;
tests.forEach(([amount, expected], i) => {
  const got = numToWordsBDT(amount);
  const pass = got === expected;
  if (!pass) allPass = false;
  console.log(
    `Test ${i + 1}: numToWordsBDT(${String(amount)}) → expected="${expected}", got="${got}" → ${pass ? 'PASS' : 'FAIL'}`,
  );
});
console.log(allPass ? 'ALL TESTS PASS ✅' : 'FAILURES — DO NOT DEPLOY ❌');
process.exit(allPass ? 0 : 1);
