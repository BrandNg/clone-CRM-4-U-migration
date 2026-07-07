/**
 * Next.js instrumentation hook — runs once per server boot.
 * Validates required env vars so misconfiguration fails fast at startup
 * instead of mid-request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/env');
    validateEnv();
  }
}
