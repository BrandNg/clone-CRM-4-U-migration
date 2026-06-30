import { existsSync, readFileSync } from 'fs';

export type EnvMap = Record<string, string>;

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const parseEnvFile = (path: string): EnvMap => {
  if (!existsSync(path)) {
    throw new Error(`${path} not found`);
  }

  const env: EnvMap = {};
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = unquote(match[2]);
  }
  return env;
};

export const loadEnvFile = (path: string): EnvMap => {
  const env = parseEnvFile(path);
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value;
  }
  return env;
};

export const mask = (value: string | undefined): string => {
  if (!value) return '<missing>';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};
