import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseEnvFile } from '@/scripts/prod-env';

describe('production env parser', () => {
  it('parses quoted and unquoted values without exposing secrets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crm-env-'));
    const file = join(dir, '.env.production');
    writeFileSync(file, 'DATABASE_URL="postgresql://u:p@rds:5432/db?sslmode=require"\nCADDY_SITE_ADDRESS=:80\n');

    try {
      const env = parseEnvFile(file);
      expect(env.DATABASE_URL).toBe('postgresql://u:p@rds:5432/db?sslmode=require');
      expect(env.CADDY_SITE_ADDRESS).toBe(':80');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
