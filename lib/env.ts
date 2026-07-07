import { z } from 'zod';

/**
 * Fail-fast env validation, run once at boot from instrumentation.ts.
 * Required vars throw; optional integration groups only warn so the app
 * still runs without (e.g.) Microsoft OAuth configured.
 */
const requiredSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
});

const OPTIONAL_GROUPS: Record<string, string[]> = {
  'Gmail OAuth': ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
  'Microsoft OAuth': ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
  'Cron auth': ['CRON_SECRET'],
  // AI SDR assistant: Groq is primary, Gemini the fallback. With neither key the
  // assistant degrades gracefully, so this stays a warning (not a hard requirement).
  'AI assistant': ['GROQ_API_KEY'],
};

export function validateEnv(): void {
  const result = requiredSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${details}`);
  }

  for (const [group, vars] of Object.entries(OPTIONAL_GROUPS)) {
    const missing = vars.filter((v) => !process.env[v]);
    if (missing.length > 0 && missing.length < vars.length) {
      console.warn(`[env] ${group} is partially configured — missing: ${missing.join(', ')}`);
    } else if (missing.length === vars.length && process.env.NODE_ENV === 'production') {
      console.warn(`[env] ${group} not configured (${vars.join(', ')}) — related features disabled`);
    }
  }
}
