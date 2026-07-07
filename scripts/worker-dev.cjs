#!/usr/bin/env node
/**
 * Development worker runner.
 * Usage: node scripts/worker-dev.cjs
 *
 * Starts the worker entry point with tsx (transpile-only) and
 * watches for file changes via nodemon (if installed) or runs directly.
 */
const { spawn } = require('child_process');
const path = require('path');

const workerEntry = path.resolve(__dirname, '..', 'workers', 'index.ts');

const useWatch = process.argv.includes('--watch');
const runtime = useWatch
  ? ['nodemon', '--exec', `npx tsx ${workerEntry}`]
  : ['npx', 'tsx', workerEntry];

const child = spawn(runtime.shift(), runtime, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development',
    IS_WORKER: 'true',
  },
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
