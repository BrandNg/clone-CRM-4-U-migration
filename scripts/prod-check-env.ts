import { parseEnvFile } from './prod-env';

type Level = 'PASS' | 'WARN' | 'FAIL';
type Check = { level: Level; message: string };

const envPath = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : '.env.production';

const requiredKeys = [
  'DATABASE_URL',
  'DIRECT_URL',
  'BACKUP_DATABASE_URL',
  'REDIS_URL',
  'CRM_DOMAIN',
  'NEXTAUTH_URL',
  'CADDY_SITE_ADDRESS',
  'AUTH_SECRET',
  'ENCRYPTION_KEY',
  'CRON_SECRET',
  'EMAIL_SEND_DRY_RUN',
  'SEQUENCE_AUTOSEND_ENABLED',
];

const placeholderPattern = /<[^>]+>|replace|change-me|todo|localhost|example\.com/i;

const add = (checks: Check[], level: Level, message: string) => {
  checks.push({ level, message });
};

const parseUrl = (value: string | undefined): URL | null => {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isLocalHost = (host: string): boolean =>
  ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host.toLowerCase());

const validate = (): Check[] => {
  const checks: Check[] = [];
  let env: Record<string, string>;
  try {
    env = parseEnvFile(envPath);
  } catch (err) {
    add(checks, 'FAIL', err instanceof Error ? err.message : 'Unable to read env file');
    return checks;
  }

  for (const key of requiredKeys) {
    if (!env[key]) add(checks, 'FAIL', `${key} is required`);
  }

  for (const [key, value] of Object.entries(env)) {
    if (value && placeholderPattern.test(value)) {
      add(checks, 'FAIL', `${key} contains a placeholder or local/example value`);
    }
  }

  const dbUrls = ['DATABASE_URL', 'DIRECT_URL', 'BACKUP_DATABASE_URL'].map((key) => ({
    key,
    url: parseUrl(env[key]),
  }));
  for (const item of dbUrls) {
    if (!item.url) {
      add(checks, 'FAIL', `${item.key} must be a valid URL`);
    } else if (!item.url.protocol.startsWith('postgres')) {
      add(checks, 'FAIL', `${item.key} must use a postgres protocol`);
    } else if (isLocalHost(item.url.hostname)) {
      add(checks, 'FAIL', `${item.key} must point to RDS, not ${item.url.hostname}`);
    }
  }

  const dbHosts = dbUrls.map((item) => item.url?.hostname).filter(Boolean);
  if (dbHosts.length === 3 && new Set(dbHosts).size !== 1) {
    add(checks, 'FAIL', 'DATABASE_URL, DIRECT_URL, and BACKUP_DATABASE_URL must use the same host');
  }

  const redisUrl = parseUrl(env.REDIS_URL);
  if (!redisUrl || !['redis:', 'rediss:'].includes(redisUrl.protocol)) {
    add(checks, 'FAIL', 'REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  const nextAuthUrl = parseUrl(env.NEXTAUTH_URL);
  if (!nextAuthUrl || !['http:', 'https:'].includes(nextAuthUrl.protocol)) {
    add(checks, 'FAIL', 'NEXTAUTH_URL must be a valid http(s) URL');
  } else if (env.CADDY_SITE_ADDRESS === ':80' && nextAuthUrl.protocol !== 'http:') {
    add(checks, 'FAIL', 'IP HTTP mode requires NEXTAUTH_URL to use http://');
  } else if (env.CADDY_SITE_ADDRESS && env.CADDY_SITE_ADDRESS !== ':80' && nextAuthUrl.protocol !== 'https:') {
    add(checks, 'FAIL', 'Domain mode requires NEXTAUTH_URL to use https://');
  }
  if (nextAuthUrl && env.CRM_DOMAIN && nextAuthUrl.hostname !== env.CRM_DOMAIN) {
    add(checks, 'FAIL', 'NEXTAUTH_URL hostname must match CRM_DOMAIN');
  }

  if (env.ENCRYPTION_KEY && !/^[0-9a-f]{64}$/i.test(env.ENCRYPTION_KEY)) {
    add(checks, 'FAIL', 'ENCRYPTION_KEY must be 64 hex characters');
  }
  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) {
    add(checks, 'FAIL', 'AUTH_SECRET should be at least 32 characters');
  }
  if (env.CRON_SECRET && env.CRON_SECRET.length < 32) {
    add(checks, 'FAIL', 'CRON_SECRET should be at least 32 characters');
  }
  if (env.EMAIL_SEND_DRY_RUN !== 'true') {
    add(checks, 'FAIL', 'EMAIL_SEND_DRY_RUN must remain true for this deployment');
  }
  if (env.SEQUENCE_AUTOSEND_ENABLED !== 'false') {
    add(checks, 'FAIL', 'SEQUENCE_AUTOSEND_ENABLED must remain false for this deployment');
  }

  if (!checks.some((check) => check.level === 'FAIL')) {
    add(checks, 'PASS', 'Production env passed validation');
  }
  return checks;
};

const checks = validate();
for (const check of checks) {
  console.log(`${check.level}: ${check.message}`);
}

if (checks.some((check) => check.level === 'FAIL')) {
  process.exit(1);
}
