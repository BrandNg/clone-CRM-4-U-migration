import { describe, expect, it } from 'vitest';
import {
  detectImportPreset,
  normalizeImportRow,
  parseStaffCountRange,
  VENDOR_1CH_FIELD_MAP,
  validateNormalizedImportRow,
} from '@/lib/leads/importRows';

describe('vendor import row helpers', () => {
  it('detects the 1CH enrichment export preset', () => {
    expect(detectImportPreset([
      'Contact Full Name',
      'Company Name - Cleaned',
      'Email 1 Validation',
      'Score Email',
    ])).toBe('vendor_1ch');
    expect(VENDOR_1CH_FIELD_MAP.company).toBe('Company Name - Cleaned');
  });

  it('parses staff count ranges', () => {
    expect(parseStaffCountRange('51 - 200 employees')).toEqual({ min: 51, max: 200, size: 126 });
    expect(parseStaffCountRange('10,001+ employees')).toEqual({ min: 10001, max: null, size: 10001 });
    expect(parseStaffCountRange('2 - 10 employees')).toEqual({ min: 2, max: 10, size: 6 });
  });

  it('falls back to alternate email when primary email is empty', () => {
    const row = normalizeImportRow({
      fullName: 'Elijah Phua',
      company: '1CloudHub',
      email: '',
      alternateEmail: 'elijah@1cloudhub.com',
      emailValidation: 'deliverable',
      emailScore: 100,
      staffCountRange: '51 - 200 employees',
      website: 'https://www.1cloudhub.com/path',
    });

    expect(row.firstName).toBe('Elijah');
    expect(row.lastName).toBe('Phua');
    expect(row.email).toBe('elijah@1cloudhub.com');
    expect(row.domain).toBe('1cloudhub.com');
    expect(row.priority).toBe('hot');
  });

  it('validates email quality by mode', () => {
    const bad = normalizeImportRow({
      firstName: 'Bad',
      lastName: 'Email',
      company: 'Acme',
      email: 'bad@example.com',
      emailValidation: 'undeliverable',
      emailScore: 0,
    });
    expect(validateNormalizedImportRow(bad, 'recommended')).toBe('Email is undeliverable');
    expect(validateNormalizedImportRow(bad, 'aggressive')).toBeNull();
  });
});
