#!/usr/bin/env node
/**
 * Production worker runner.
 * Usage: node scripts/worker-start.cjs
 *
 * Starts the worker entry point with tsx. Designed for process managers
 * like PM2, Supervisord, or container entrypoints.
 *
 * Environment variables expected:
 *   REDIS_URL   - Redis connection string (required in production)
 *   DIRECT_URL  - Direct Postgres connection string for workers (required in production)
 *   NODE_ENV    - 'production' (defaults to 'production' if not set)
 */
const { spawn } = require('child_process');
const path = require('path');

const required = ['REDIS_URL', 'DIRECT_URL'];
const missing = required.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[worker] FATAL: missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const workerEntry = path.resolve(__dirname, '..', 'workers', 'index.ts');
const child = spawn('npx', ['tsx', workerEntry], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
    IS_WORKER: 'true',
  },
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
