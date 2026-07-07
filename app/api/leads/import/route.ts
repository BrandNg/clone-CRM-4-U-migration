import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, canImportExport, canAccessUser, getLeadgenScope } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { startImportWorkflow } from '@/lib/workflows/import';
import {
  normalizeImportRow,
  validateNormalizedImportRow,
  type EmailQualityMode,
  type ImportLeadRow,
  type ImportResolution,
  type NormalizedImportLeadRow,
} from '@/lib/leads/importRows';
import { normalizeEmail, normalizePhone, normalizeLinkedIn } from '@/lib/leads/normalize';

const importResolution = z.enum(['skip', 'update', 'import']);
const emailQualityMode = z.enum(['recommended', 'strict', 'aggressive']);

const importRowSchema = z.object({
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  seniority: z.string().optional(),
  email: z.string().optional(),
  emailValidation: z.string().optional(),
  emailScore: z.union([z.string(), z.number()]).optional(),
  alternateEmail: z.string().optional(),
  alternateEmailValidation: z.string().optional(),
  phone: z.string().optional(),
  secondaryPhone: z.string().optional(),
  companyPhone: z.string().optional(),
  linkedIn: z.string().optional(),
  whatsApp: z.string().optional(),
  contactCountry: z.string().optional(),
  companyCountry: z.string().optional(),
  website: z.string().optional(),
  companyLinkedIn: z.string().optional(),
  industry: z.string().optional(),
  staffCountRange: z.string().optional(),
  importListName: z.string().optional(),
  vendorSource: z.string().optional(),
  source: z.string().optional(),
  priority: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const importBodySchema = z.object({
  leads: z.array(importRowSchema).min(1).max(10000),
  dryRun: z.boolean().optional(),
  assignedToId: z.string().optional(),
  campaignId: z.string().min(1),
  initialStage: z.enum(['new', 'replied', 'meeting_booked', 'won', 'lost']).optional(),
  sequenceId: z.string().optional(),
  resolutions: z.record(z.string(), importResolution).optional(),
  defaultResolution: importResolution.optional(),
  emailQualityMode: emailQualityMode.optional(),
  filename: z.string().optional(),
});

type ImportBody = z.infer<typeof importBodySchema>;
type ExistingLead = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string | null;
  linkedIn: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  normalizedLinkedIn: string | null;
};

const summary = (l: Pick<ExistingLead, 'firstName' | 'lastName' | 'company' | 'email'>) =>
  `${l.firstName} ${l.lastName} - ${l.company}${l.email ? ` (${l.email})` : ''}`;

const nameCompanyKey = (row: Pick<NormalizedImportLeadRow, 'firstName' | 'lastName' | 'company'>) =>
  `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}|${row.company.toLowerCase()}`;

const indexExistingLeads = (existingLeads: ExistingLead[]) => {
  const byEmail = new Map<string, ExistingLead>();
  const byPhone = new Map<string, ExistingLead>();
  const byLinkedIn = new Map<string, ExistingLead>();
  const byNameCompany = new Map<string, ExistingLead>();

  for (const lead of existingLeads) {
    const email = lead.normalizedEmail || normalizeEmail(lead.email);
    const phone = lead.normalizedPhone || normalizePhone(lead.phone);
    const linkedIn = lead.normalizedLinkedIn || normalizeLinkedIn(lead.linkedIn);
    if (email && !byEmail.has(email)) byEmail.set(email, lead);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, lead);
    if (linkedIn && !byLinkedIn.has(linkedIn)) byLinkedIn.set(linkedIn, lead);
    const key = nameCompanyKey(lead);
    if (!byNameCompany.has(key)) byNameCompany.set(key, lead);
  }

  return { byEmail, byPhone, byLinkedIn, byNameCompany };
};

const findDuplicate = (
  row: NormalizedImportLeadRow,
  indexes: ReturnType<typeof indexExistingLeads>
): { matchType: 'email' | 'phone' | 'linkedin' | 'name_company'; lead: ExistingLead } | null => {
  const email = normalizeEmail(row.email);
  const alternateEmail = normalizeEmail(row.alternateEmail);
  const phone = normalizePhone(row.phone);
  const linkedIn = normalizeLinkedIn(row.linkedIn);

  const byEmail = (email && indexes.byEmail.get(email)) || (alternateEmail && indexes.byEmail.get(alternateEmail));
  if (byEmail) return { matchType: 'email', lead: byEmail };
  const byPhone = phone && indexes.byPhone.get(phone);
  if (byPhone) return { matchType: 'phone', lead: byPhone };
  const byLinkedIn = linkedIn && indexes.byLinkedIn.get(linkedIn);
  if (byLinkedIn) return { matchType: 'linkedin', lead: byLinkedIn };
  const byNameCompany = indexes.byNameCompany.get(nameCompanyKey(row));
  return byNameCompany ? { matchType: 'name_company', lead: byNameCompany } : null;
};

const buildDryRun = async (body: ImportBody, tenantId: string) => {
  const mode = (body.emailQualityMode ?? 'recommended') as EmailQualityMode;
  const normalizedRows = body.leads.map((row) => normalizeImportRow(row as ImportLeadRow, { filename: body.filename }));
  const existingLeads = await prisma.lead.findMany({
    where: { tenantId, campaignId: body.campaignId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      company: true,
      phone: true,
      linkedIn: true,
      normalizedEmail: true,
      normalizedPhone: true,
      normalizedLinkedIn: true,
    },
  });
  const indexes = indexExistingLeads(existingLeads);
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const duplicates: Array<{
    row: number;
    matchType: 'email' | 'phone' | 'linkedin' | 'name_company';
    existingLeadId: string;
    existingSummary: string;
    incoming: ImportLeadRow;
  }> = [];
  const errorRows: Array<{ row: number; reason: string }> = [];
  const warnings: Array<{ row: number; reason: string }> = [];
  let riskyEmails = 0;
  let undeliverableEmails = 0;

  normalizedRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const validationReason = validateNormalizedImportRow(row, mode);
    if (row.emailValidation === 'risky' || row.emailValidation === 'unknown') riskyEmails++;
    if (row.emailValidation === 'undeliverable' || row.emailScore === 0) undeliverableEmails++;
    if (validationReason) {
      errorRows.push({ row: rowNumber, reason: validationReason });
      return;
    }

    const email = normalizeEmail(row.email);
    const phone = normalizePhone(row.phone);
    if (email && seenEmails.has(email)) {
      errorRows.push({ row: rowNumber, reason: 'Duplicate email within this file' });
      return;
    }
    if (phone && seenPhones.has(phone)) {
      warnings.push({ row: rowNumber, reason: 'Duplicate phone within this file' });
    }
    if (email) seenEmails.add(email);
    if (phone) seenPhones.add(phone);

    const duplicate = findDuplicate(row, indexes);
    if (duplicate) {
      duplicates.push({
        row: rowNumber,
        matchType: duplicate.matchType,
        existingLeadId: duplicate.lead.id,
        existingSummary: summary(duplicate.lead),
        incoming: body.leads[index] as ImportLeadRow,
      });
    }
  });

  const duplicateRows = new Set(duplicates.map((d) => d.row));
  const errorRowNumbers = new Set(errorRows.map((e) => e.row));
  const toImport = normalizedRows.filter((_, index) => {
    const row = index + 1;
    return !duplicateRows.has(row) && !errorRowNumbers.has(row);
  }).length;

  return {
    total: normalizedRows.length,
    toImport,
    duplicates,
    errorRows,
    warnings,
    exactDuplicates: duplicates.filter((d) => d.matchType === 'email').length,
    possibleMatches: duplicates.filter((d) => d.matchType !== 'email').length,
    rowsWithErrors: errorRows.length,
    riskyEmails,
    undeliverableEmails,
    previewRows: normalizedRows.slice(0, 5),
  };
};

const validateContext = async (body: ImportBody, user: SessionUser) => {
  if (user.role === 'leadgen') {
    const scope = await getLeadgenScope(user);
    if (scope.kind === 'member' && !scope.campaignIds.includes(body.campaignId)) {
      return NextResponse.json({ error: 'Forbidden: campaign not assigned to you' }, { status: 403 });
    }
  }

  const assignedToId = body.assignedToId || user.id;
  if (assignedToId !== user.id && !(await canAccessUser(user, assignedToId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.sequenceId) {
    const sequence = await prisma.sequence.findUnique({
      where: { id: body.sequenceId },
      select: { id: true, isActive: true },
    });
    if (!sequence || !sequence.isActive) {
      return NextResponse.json({ error: 'Sequence not found or inactive' }, { status: 400 });
    }
  }

  return null;
};

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  if (!canImportExport(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = importBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid import request',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const contextError = await validateContext(body, user);
  if (contextError) return contextError;

  const tenantId = user.tenantId || 'default-tenant';
  if (body.dryRun) {
    return NextResponse.json(await buildDryRun(body, tenantId));
  }

  const importBatch = await prisma.importBatch.create({
    data: {
      campaignId: body.campaignId,
      userId: user.id,
      filename: body.filename || 'import.csv',
      totalRows: body.leads.length,
      status: 'pending',
      tenantId,
    },
  });

  await prisma.importRow.createMany({
    data: body.leads.map((row, index) => ({
      batchId: importBatch.id,
      rowIndex: index + 1,
      data: normalizeImportRow(row as ImportLeadRow, { filename: body.filename }) as unknown as Prisma.InputJsonValue,
      status: 'pending' as const,
      tenantId,
    })),
  });

  await startImportWorkflow({
    batchId: importBatch.id,
    assignedToId: body.assignedToId || user.id,
    campaignId: body.campaignId,
    tenantId,
    userId: user.id,
    initialStage: body.sequenceId ? 'sequence_active' : body.initialStage || 'new',
    sequenceId: body.sequenceId || undefined,
    defaultResolution: body.defaultResolution || 'skip',
    resolutions: body.resolutions as Record<string, ImportResolution> | undefined,
    emailQualityMode: body.emailQualityMode || 'recommended',
    filename: body.filename,
  });

  return NextResponse.json(
    { batchId: importBatch.id, totalRows: body.leads.length, status: 'queued' },
    { status: 202 }
  );
}
