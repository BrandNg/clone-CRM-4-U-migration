export type ImportResolution = 'skip' | 'update' | 'import';
export type EmailQualityMode = 'recommended' | 'strict' | 'aggressive';

export interface ImportLeadRow {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  department?: string;
  seniority?: string;
  email?: string;
  emailValidation?: string;
  emailScore?: number | string;
  alternateEmail?: string;
  alternateEmailValidation?: string;
  phone?: string;
  secondaryPhone?: string;
  companyPhone?: string;
  linkedIn?: string;
  whatsApp?: string;
  contactCountry?: string;
  companyCountry?: string;
  website?: string;
  companyLinkedIn?: string;
  industry?: string;
  staffCountRange?: string;
  importListName?: string;
  vendorSource?: string;
  source?: string;
  priority?: 'hot' | 'warm' | 'cold' | string;
  tags?: string[];
}

export interface NormalizedImportLeadRow {
  fullName: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  department: string;
  seniority: string;
  email: string;
  emailValidation: string;
  emailScore: number | null;
  alternateEmail: string;
  alternateEmailValidation: string;
  phone: string;
  secondaryPhone: string;
  companyPhone: string;
  linkedIn: string;
  whatsApp: string;
  contactCountry: string;
  companyCountry: string;
  website: string;
  domain: string;
  companyLinkedIn: string;
  industry: string;
  staffCountRange: string;
  staffCountMin: number | null;
  staffCountMax: number | null;
  staffSize: number | null;
  importListName: string;
  vendorSource: string;
  source: string;
  priority: 'hot' | 'warm' | 'cold';
  tags: string[];
}

export interface ImportRowIssue {
  row: number;
  reason: string;
}

export const VENDOR_1CH_FIELD_MAP: Record<string, string> = {
  fullName: 'Contact Full Name',
  firstName: 'First Name',
  lastName: 'Last Name',
  title: 'Title',
  department: 'Department',
  seniority: 'Seniority',
  company: 'Company Name - Cleaned',
  website: 'Website',
  importListName: 'List',
  linkedIn: 'Contact LI Profile URL',
  email: 'Email 1',
  emailValidation: 'Email 1 Validation',
  emailScore: 'Score Email',
  alternateEmail: 'Contact Email',
  alternateEmailValidation: 'Contact Email Validation',
  phone: 'ContactPhone1',
  companyPhone: 'CompanyPhone1',
  secondaryPhone: 'ContactPhone2',
  contactCountry: 'Contact Country',
  companyCountry: 'Company Country',
  industry: 'Company Industry',
  companyLinkedIn: 'Company LI Profile Url',
  staffCountRange: 'Company Staff Count Range',
};

const trim = (value: unknown): string => String(value ?? '').trim();

export const detectImportPreset = (headers: string[]) => {
  const headerSet = new Set(headers.map((h) => h.trim().toLowerCase()));
  const has1chHeaders =
    headerSet.has('company name - cleaned') &&
    headerSet.has('email 1 validation') &&
    headerSet.has('score email');
  return has1chHeaders ? 'vendor_1ch' : 'generic';
};

export const normalizeDomain = (website: string): string => {
  const value = website.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return value.split('/')[0].toLowerCase();
};

export const parseStaffCountRange = (value: string) => {
  const cleaned = value.replace(/employees?/i, '').replace(/,/g, '').trim();
  if (!cleaned) return { min: null, max: null, size: null };

  if (cleaned.endsWith('+')) {
    const min = Number.parseInt(cleaned.slice(0, -1).trim(), 10);
    return Number.isFinite(min) ? { min, max: null, size: min } : { min: null, max: null, size: null };
  }

  const range = cleaned.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const min = Number.parseInt(range[1], 10);
    const max = Number.parseInt(range[2], 10);
    return {
      min,
      max,
      size: Math.round((min + max) / 2),
    };
  }

  const exact = Number.parseInt(cleaned, 10);
  return Number.isFinite(exact) ? { min: exact, max: exact, size: exact } : { min: null, max: null, size: null };
};

const splitFullName = (fullName: string) => {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const parseEmailScore = (value: unknown): number | null => {
  const parsed = Number.parseInt(trim(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const deriveImportPriority = (
  score: number | null,
  validation: string,
  explicit?: string
): 'hot' | 'warm' | 'cold' => {
  const raw = explicit?.toLowerCase().trim();
  if (raw === 'hot' || raw === 'warm' || raw === 'cold') return raw;
  if (validation === 'deliverable' && score !== null && score >= 90) return 'hot';
  if (validation === 'risky' || (score !== null && score >= 75)) return 'warm';
  return 'cold';
};

export const shouldSkipForEmailQuality = (
  row: Pick<NormalizedImportLeadRow, 'email' | 'emailValidation' | 'emailScore'>,
  mode: EmailQualityMode
) => {
  if (!row.email) return 'Missing email';
  if (mode === 'aggressive') return null;
  if (row.emailValidation === 'undeliverable') return 'Email is undeliverable';
  if (row.emailScore === 0) return 'Email score is 0';
  if (mode === 'strict' && row.emailValidation !== 'deliverable') {
    return `Email validation is ${row.emailValidation || 'unknown'}`;
  }
  return null;
};

export const normalizeImportRow = (
  row: ImportLeadRow,
  options: { filename?: string } = {}
): NormalizedImportLeadRow => {
  const fullName = trim(row.fullName);
  const splitName = splitFullName(fullName);
  const firstName = trim(row.firstName) || splitName.firstName;
  const lastName = trim(row.lastName) || splitName.lastName;
  const primaryEmail = trim(row.email);
  const alternateEmail = trim(row.alternateEmail);
  const email = primaryEmail || alternateEmail;
  const emailScore = parseEmailScore(row.emailScore);
  const emailValidation = trim(row.emailValidation).toLowerCase();
  const staff = parseStaffCountRange(trim(row.staffCountRange));
  const importListName = trim(row.importListName) || trim(row.source);
  const source = importListName || trim(options.filename) || 'csv-import';
  const website = trim(row.website);

  return {
    fullName,
    firstName,
    lastName,
    company: trim(row.company),
    title: trim(row.title),
    department: trim(row.department),
    seniority: trim(row.seniority),
    email,
    emailValidation,
    emailScore,
    alternateEmail: primaryEmail ? alternateEmail : '',
    alternateEmailValidation: trim(row.alternateEmailValidation).toLowerCase(),
    phone: trim(row.phone) || trim(row.secondaryPhone),
    secondaryPhone: trim(row.secondaryPhone),
    companyPhone: trim(row.companyPhone),
    linkedIn: trim(row.linkedIn),
    whatsApp: trim(row.whatsApp),
    contactCountry: trim(row.contactCountry),
    companyCountry: trim(row.companyCountry),
    website,
    domain: normalizeDomain(website),
    companyLinkedIn: trim(row.companyLinkedIn),
    industry: trim(row.industry),
    staffCountRange: trim(row.staffCountRange),
    staffCountMin: staff.min,
    staffCountMax: staff.max,
    staffSize: staff.size,
    importListName,
    vendorSource: trim(row.vendorSource) || trim(options.filename),
    source,
    priority: deriveImportPriority(emailScore, emailValidation, row.priority),
    tags: Array.isArray(row.tags) ? row.tags.map(trim).filter(Boolean) : [],
  };
};

export const validateNormalizedImportRow = (
  row: NormalizedImportLeadRow,
  mode: EmailQualityMode
): string | null => {
  if (!row.firstName || !row.lastName) return 'Missing first or last name';
  if (!row.company) return 'Missing company';
  const qualityReason = shouldSkipForEmailQuality(row, mode);
  if (qualityReason) return qualityReason;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return 'Invalid email';
  return null;
};
