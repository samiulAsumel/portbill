#!/usr/bin/env node
// Runs every tests/*.test.js suite as a separate process (each one calls its
// own process.exit) and fails if any of them fail. Run with: npm test
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = __dirname;
const suites = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let allPass = true;
suites.forEach((file) => {
  console.log(`\n── ${file} ──`);
  const result = spawnSync(process.execPath, [path.join(testsDir, file)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) allPass = false;
});

console.log(`\n${suites.length} suite(s) run.`);
console.log(allPass ? 'ALL SUITES PASS ✅' : 'SUITE FAILURES — DO NOT DEPLOY ❌');
process.exit(allPass ? 0 : 1);
