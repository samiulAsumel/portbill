#!/usr/bin/env node
// Wharfrent slab progression test suite — run with: node tests/slabs.test.js
// Extracts calcSlabs (and its addD dependency) from src/core.js so the SHIPPED
// code is tested, not a copy. calcSlabs is the shared slab calculator behind
// Car, Cargo, and Self-Drive billing — see CLAUDE.md "Split billing".
// Exit code 0 = all pass, 1 = failure.
/* eslint-disable sonarjs/code-eval -- new Function() intentionally extracts calcSlabs
   from the shipped src/core.js so the deployed code is what's tested, not a copy */

'use strict';

const fs = require('fs');
const path = require('path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');

const addDMatch = mainSrc.match(/const addD = \(d, n\) => \{[\s\S]*?\n\};/);
const slabsMatch = mainSrc.match(/function calcSlabs\([\s\S]*?\n\}/);
if (!addDMatch) {
  console.error('FATAL: addD not found in src/core.js');
  process.exit(1);
}
if (!slabsMatch) {
  console.error('FATAL: calcSlabs not found in src/core.js');
  process.exit(1);
}
const calcSlabs = new Function(`${addDMatch[0]}\n${slabsMatch[0]}\nreturn calcSlabs;`)();

// Compact a slab result for comparison: dates → YYYY-MM-DD, drop nothing else.
const compact = (slabs) =>
  slabs.map((s) => ({
    label: s.label,
    rate: s.rate,
    days: s.days,
    from: s.from.toISOString().slice(0, 10),
    to: s.to.toISOString().slice(0, 10),
    amt: s.amt,
  }));

const tests = [
  {
    name: 'plain 20-day bill (no split) — all three slabs',
    args: [20, 10, 20, 25, 30, '2026-09-05', '2026-09-24', 0],
    expected: [
      { label: '1st 7 days', rate: 10, days: 7, from: '2026-09-05', to: '2026-09-11', amt: 2100 },
      { label: '8th to 14th day', rate: 20, days: 7, from: '2026-09-12', to: '2026-09-18', amt: 4200 },
      { label: '15th day onwards', rate: 25, days: 6, from: '2026-09-19', to: '2026-09-24', amt: 4500 },
    ],
  },
  {
    name: 'split-billing continuation block (daysOffset=10) — skips 1st-7-days slab entirely',
    args: [5, 70, 185, 245, 10, '2026-09-05', '2026-09-09', 10],
    expected: [
      { label: '8th to 14th day', rate: 185, days: 4, from: '2026-09-05', to: '2026-09-08', amt: 7400 },
      { label: '15th day onwards', rate: 245, days: 1, from: '2026-09-09', to: '2026-09-09', amt: 2450 },
    ],
  },
  {
    name: 'zero days → no slabs at all',
    args: [0, 10, 20, 25, 30, '2026-09-05', '2026-09-05', 0],
    expected: [],
  },
  {
    name: 'exactly 7 days — 1st-7-days slab only, nothing spills into slab 2',
    args: [7, 10, 20, 25, 1, '2026-01-01', '2026-01-07', 0],
    expected: [
      { label: '1st 7 days', rate: 10, days: 7, from: '2026-01-01', to: '2026-01-07', amt: 70 },
    ],
  },
];

let allPass = true;
tests.forEach((t, i) => {
  const got = compact(calcSlabs(...t.args));
  const pass = JSON.stringify(got) === JSON.stringify(t.expected);
  if (!pass) allPass = false;
  console.log(`Test ${i + 1}: ${t.name} → ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) {
    console.log('  expected:', JSON.stringify(t.expected));
    console.log('  got     :', JSON.stringify(got));
  }
});
console.log(allPass ? 'ALL TESTS PASS ✅' : 'FAILURES — DO NOT DEPLOY ❌');
process.exit(allPass ? 0 : 1);
