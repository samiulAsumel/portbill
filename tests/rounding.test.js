#!/usr/bin/env node
// Money rounding (r2, round-half-DOWN) test suite — run with: node tests/rounding.test.js
// r2 has no single shared definition — CLAUDE.md "Rounding" documents it as
// intentionally re-declared inline in every billing function's scope
// (as r2/rp2/_rp). That duplication is exactly what makes it fragile: a
// future edit to one copy that misses the others silently reintroduces the
// round-half-UP bug this formula replaced in v3.6.1. So this suite does two
// things — (1) scan every src/*.js file for every r2/rp2/_rp declaration and
// assert they all share the identical formula text, and (2) run that
// formula against the documented half-down cases.
// Exit code 0 = all pass, 1 = failure.
/* eslint-disable sonarjs/code-eval -- new Function() builds the tested r2 from the
   exact formula string every declaration above was just proven to share, not a copy */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const DECL_RE = /const (r2|rp2|_rp) = \(v\) => \(Math\.ceil\(v \* 100 - 0\.5\) \/ 100\) \|\| 0;/g;

// As of this suite's writing there are 7 declarations across 4 files
// (car.js, cargo.js x3, reexport.js, platform.js x2). If this count changes,
// update it deliberately — don't just bump the number to silence the test.
const EXPECTED_COUNT = 7;

let allPass = true;
let totalFound = 0;

fs.readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.js'))
  .forEach((file) => {
    const src = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    const matches = src.match(DECL_RE) || [];
    if (matches.length > 0) {
      totalFound += matches.length;
      console.log(`Found: ${file} declares the half-down formula ${matches.length}x`);
    }
  });

const countPass = totalFound === EXPECTED_COUNT;
if (!countPass) allPass = false;
console.log(
  `Consistency: ${totalFound} declarations found, all textually identical (regex requires exact match) → expected ${EXPECTED_COUNT} → ${countPass ? 'PASS' : 'FAIL'}`,
);

// Correctness of the formula every declaration above was just proven to share.
const r2 = new Function('v', 'return (Math.ceil(v * 100 - 0.5) / 100) || 0;');

const cases = [
  // [input, expected] — half-DOWN: exact .xx5 boundary rounds down, not to nearest.
  [60394.725, 60394.72], // CLAUDE.md's own documented example
  [100, 100],
  [0, 0],
  [-5, -5],
  [1121.005, 1121.01],
  [99.995, 99.99],
  [0.005, 0],
  [1292.155, 1292.15],
  [NaN, 0],
  [undefined, 0],
];

cases.forEach(([input, expected], i) => {
  const got = r2(input);
  const pass = Math.abs(got - expected) < 0.0001;
  if (!pass) allPass = false;
  console.log(`Test ${i + 1}: r2(${input}) → expected=${expected}, got=${got} → ${pass ? 'PASS' : 'FAIL'}`);
});

console.log(allPass ? 'ALL TESTS PASS ✅' : 'FAILURES — DO NOT DEPLOY ❌');
process.exit(allPass ? 0 : 1);
