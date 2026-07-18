#!/usr/bin/env node
// VAT MPA-parity test suite — run with: node tests/vat.test.js
// Extracts calcVATmpa from src/core.js so the SHIPPED code is tested, not a copy.
// Exit code 0 = all pass, 1 = failure.
/* eslint-disable sonarjs/code-eval -- new Function() intentionally extracts calcVATmpa
   from the shipped src/core.js so the deployed code is what's tested, not a copy */

'use strict';

const fs = require('fs');
const path = require('path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
const match = mainSrc.match(/function calcVATmpa\([\s\S]*?\n}/);
if (!match) {
  console.error('FATAL: calcVATmpa not found in main.js');
  process.exit(1);
}
const calcVATmpa = new Function(`${match[0]}; return calcVATmpa;`)();

const tests = [
  // [totalBill, vatPercent, expected]
  [1000, 15, 150.0], // simple
  [0, 15, 0.0], // zero
  [null, 15, 0.0], // null safety
  [undefined, 15, 0.0], // undefined safety
  [15.63, 15, 2.34], // 2.3445 → 2.34
  [15.7, 15, 2.36], // 2.355 midpoint → even → 2.36
  [463940, 15, 69591.0], // real wharfrent bill total
  [381150.5, 15, 57172.58], // real re-export bill total
  [0.01, 15, 0.0], // 0.0015 → 0.00
  [0.1, 15, 0.02], // 0.015 midpoint → even → 0.02
  [0.3, 15, 0.04], // 0.045 midpoint → even → 0.04 (half-up dile 0.05 hoto — key test!)
  [117.5, 15, 17.62], // 17.625 midpoint → even → 17.62 (half-up dile 17.63 hoto — key test!)
];

let allPass = true;
tests.forEach(([bill, pct, expected], i) => {
  const got = calcVATmpa(bill, pct);
  const pass = Math.abs(got - expected) < 0.001;
  if (!pass) allPass = false;
  console.log(
    `Test ${i + 1}: bill=${bill} → expected=${expected}, got=${got} → ${pass ? 'PASS' : 'FAIL'}`,
  );
});
console.log(allPass ? 'ALL TESTS PASS ✅' : 'FAILURES — DO NOT DEPLOY ❌');
process.exit(allPass ? 0 : 1);
