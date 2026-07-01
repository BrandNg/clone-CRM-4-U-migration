import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAppWorker } from '@/lib/bullmq';
import { JobType } from '@/lib/bullmq/types';
import type { ImportParsePayload, ImportChunkPayload, ImportCommitPayload } from '@/lib/bullmq/types';
import { enqueue } from '@/lib/bullmq/enqueue';
import { normalizeEmail, normalizePhone, normalizeLinkedIn } from '@/lib/leads/normalize';
import { createTaskForStep } from '@/lib/sequences/engine';
import {
  normalizeImportRow,
  validateNormalizedImportRow,
  type EmailQualityMode,
  type NormalizedImportLeadRow,
} from '@/lib/leads/importRows';

const CHUNK_SIZE = 500;

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
  contactId: string | null;
  accountId: string | null;
  title: string | null;
};

type ImportRowData = NormalizedImportLeadRow & {
  forceDuplicateLead?: boolean;
};

const nameCompanyKey = (row: Pick<NormalizedImportLeadRow, 'firstName' | 'lastName' | 'company'>) =>
  `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}|${row.company.toLowerCase()}`;

const buildLeadSummary = (lead: Pick<ExistingLead, 'firstName' | 'lastName' | 'company' | 'email'>) =>
  `${lead.firstName} ${lead.lastName} - ${lead.company}${lead.email ? ` (${lead.email})` : ''}`;

const fill = (
  existing: Record<string, unknown> | null | undefined,
  data: Record<string, unknown>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === '' || value === null || value === undefined) continue;
    const current = existing?.[key];
    if (current === '' || current === null || current === undefined) {
      out[key] = value;
    }
  }
  return out;
};

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

const accountData = (row: NormalizedImportLeadRow, tenantId: string) => ({
  name: row.company,
  website: row.website || null,
  domain: row.domain || null,
  industry: row.industry || null,
  linkedIn: row.companyLinkedIn || null,
  country: row.companyCountry || null,
  companyPhone: row.companyPhone || null,
  staffCountRange: row.staffCountRange || null,
  staffCountMin: row.staffCountMin,
  staffCountMax: row.staffCountMax,
  size: row.staffSize,
  tenantId,
});

const contactData = (row: NormalizedImportLeadRow, tenantId: string) => ({
  fullName: row.fullName || `${row.firstName} ${row.lastName}`.trim(),
  firstName: row.firstName,
  lastName: row.lastName,
  company: row.company,
  title: row.title || null,
  department: row.department || null,
  seniority: row.seniority || null,
  country: row.contactCountry || null,
  email: row.email,
  emailValidation: row.emailValidation || null,
  emailScore: row.emailScore,
  alternateEmail: row.alternateEmail || null,
  alternateEmailValidation: row.alternateEmailValidation || null,
  phone: row.phone || null,
  secondaryPhone: row.secondaryPhone || null,
  linkedIn: row.linkedIn || null,
  whatsApp: row.whatsApp || null,
  normalizedEmail: normalizeEmail(row.email) || null,
  normalizedPhone: normalizePhone(row.phone) || null,
  normalizedLinkedIn: normalizeLinkedIn(row.linkedIn) || null,
  tenantId,
});

async function enrichExistingLead(
  existingLeadId: string,
  row: NormalizedImportLeadRow,
  userId: string,
  tenantId: string,
  importRowId: string
) {
  await prisma.$transaction(async (tx) => {
    const existingLead = await tx.lead.findUnique({
      where: { id: existingLeadId },
      include: { contact: true, account: true },
    });
    if (!existingLead) throw new Error('Existing lead not found');

    const leadPatch = fill(existingLead, {
      title: row.title || null,
      phone: row.phone || null,
      linkedIn: row.linkedIn || null,
      source: row.source || null,
      importListName: row.importListName || null,
      emailValidation: row.emailValidation || null,
      emailScore: row.emailScore,
      vendorSource: row.vendorSource || null,
    });
    if (Object.keys(leadPatch).length > 0) {
      await tx.lead.update({ where: { id: existingLeadId }, data: leadPatch });
    }

    if (existingLead.contactId) {
      const patch = fill(existingLead.contact, contactData(row, tenantId));
      if (Object.keys(patch).length > 0) {
        await tx.contact.update({ where: { id: existingLead.contactId }, data: patch });
      }
    }

    if (existingLead.accountId) {
      const patch = fill(existingLead.account, accountData(row, tenantId));
      if (Object.keys(patch).length > 0) {
        await tx.account.update({ where: { id: existingLead.accountId }, data: patch });
      }
    }

    await tx.importRow.update({
      where: { id: importRowId },
      data: { status: 'updated', leadId: existingLeadId },
    });

    await tx.activity.create({
      data: {
        userId,
        leadId: existingLeadId,
        type: 'lead_created',
        description: `Lead enriched from import: ${row.importListName || row.vendorSource || 'uploaded file'}`,
        tenantId,
      },
    });
  });
}

async function handleImportParse(payload: ImportParsePayload) {
  const {
    batchId,
    assignedToId,
    campaignId,
    tenantId,
    userId,
    initialStage,
    sequenceId,
    defaultResolution,
    resolutions,
    emailQualityMode,
    filename,
  } = payload;
  const mode = (emailQualityMode ?? 'recommended') as EmailQualityMode;

  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) return { skipped: true, reason: 'batch_not_found' };

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: 'parsing' } });

  const rows = await prisma.importRow.findMany({
    where: { batchId, status: 'pending' },
    orderBy: { rowIndex: 'asc' },
  });

  const existingLeads = await prisma.lead.findMany({
    where: { tenantId, campaignId },
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
      contactId: true,
      accountId: true,
      title: true,
    },
  });
  const indexes = indexExistingLeads(existingLeads);
  const cleanRowIds: string[] = [];
  const duplicateErrors: { id: string; reason: string }[] = [];
  const updateTargets: { id: string; existingLeadId: string; data: NormalizedImportLeadRow }[] = [];
  const seenEmails = new Set<string>();
  let validationErrors = 0;

  for (const row of rows) {
    const data = normalizeImportRow(row.data as Record<string, unknown>, { filename });
    const validationReason = validateNormalizedImportRow(data, mode);
    if (validationReason) {
      validationErrors++;
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: 'error', errors: { reason: validationReason } },
      });
      continue;
    }

    const email = normalizeEmail(data.email);
    if (email && seenEmails.has(email)) {
      duplicateErrors.push({ id: row.id, reason: 'Duplicate email within this file' });
      continue;
    }
    if (email) seenEmails.add(email);

    const duplicate = findDuplicate(data, indexes);
    if (!duplicate) {
      cleanRowIds.push(row.id);
      continue;
    }

    const resolution = resolutions?.[String(row.rowIndex)] ?? defaultResolution ?? 'skip';
    if (resolution === 'skip') {
      duplicateErrors.push({
        id: row.id,
        reason: `Duplicate skipped (${duplicate.matchType} match: ${buildLeadSummary(duplicate.lead)})`,
      });
    } else if (resolution === 'update') {
      updateTargets.push({ id: row.id, existingLeadId: duplicate.lead.id, data });
    } else {
      await prisma.importRow.update({
        where: { id: row.id },
        data: { data: { ...data, forceDuplicateLead: duplicate.matchType === 'email' } as unknown as Prisma.InputJsonValue },
      });
      cleanRowIds.push(row.id);
    }
  }

  await Promise.all(
    duplicateErrors.map((dup) =>
      prisma.importRow.update({
        where: { id: dup.id },
        data: { status: 'error', errors: { reason: dup.reason } },
      })
    )
  );

  for (const target of updateTargets) {
    await enrichExistingLead(target.existingLeadId, target.data, userId, tenantId, target.id);
  }

  if (cleanRowIds.length > 0) {
    await prisma.importRow.updateMany({
      where: { id: { in: cleanRowIds } },
      data: { status: 'valid' },
    });
  }

  const chunks: string[][] = [];
  for (let i = 0; i < cleanRowIds.length; i += CHUNK_SIZE) {
    chunks.push(cleanRowIds.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    await enqueue(JobType.IMPORT_CHUNK, {
      batchId,
      chunkIndex: i,
      rowIds: chunks[i],
      rows: [],
      assignedToId,
      userId,
      campaignId,
      tenantId,
      initialStage: sequenceId ? 'sequence_active' : initialStage ?? 'new',
      sequenceId,
    } satisfies ImportChunkPayload, { tenantId });
  }

  await enqueue(JobType.IMPORT_COMMIT, { batchId } satisfies ImportCommitPayload, { tenantId });

  const [accepted, errored] = await Promise.all([
    prisma.importRow.count({ where: { batchId, status: { in: ['valid', 'updated', 'imported'] } } }),
    prisma.importRow.count({ where: { batchId, status: 'error' } }),
  ]);
  await prisma.importBatch.update({
    where: { id: batchId },
    data: { status: 'parsed', parsedRows: accepted, errorRows: errored },
  });

  return {
    success: true,
    batchId,
    totalRows: rows.length,
    validationErrors,
    duplicates: duplicateErrors.length,
    updated: updateTargets.length,
    cleanRows: cleanRowIds.length,
    chunks: chunks.length,
  };
}

async function handleImportChunk(payload: ImportChunkPayload) {
  const { batchId, chunkIndex, rowIds, assignedToId, userId, campaignId, tenantId, initialStage, sequenceId } = payload;

  const importRows = await prisma.importRow.findMany({
    where: { id: { in: rowIds }, status: 'valid' },
  });
  if (importRows.length === 0) return { skipped: true, reason: 'no_rows_found' };

  const sequence = sequenceId
    ? await prisma.sequence.findUnique({
        where: { id: sequenceId },
        include: { steps: { orderBy: { order: 'asc' } } },
      })
    : null;

  let created = 0;
  let errors = 0;

  for (const row of importRows) {
    const rawData = row.data as unknown as ImportRowData;
    const data: ImportRowData = {
      ...normalizeImportRow(rawData as any),
      forceDuplicateLead: rawData.forceDuplicateLead,
    };
    const normalizedEmail = normalizeEmail(data.email);
    const normalizedPhone = normalizePhone(data.phone);
    const normalizedLinkedIn = normalizeLinkedIn(data.linkedIn);

    try {
      const createdLead = await prisma.$transaction(async (tx) => {
        let account = await tx.account.findUnique({
          where: { tenantId_name: { tenantId, name: data.company } },
        });
        if (account) {
          const patch = fill(account, accountData(data, tenantId));
          if (Object.keys(patch).length > 0) {
            account = await tx.account.update({ where: { id: account.id }, data: patch });
          }
        } else {
          account = await tx.account.create({ data: accountData(data, tenantId) });
        }

        let contact = normalizedEmail
          ? await tx.contact.findUnique({
              where: { tenantId_normalizedEmail: { tenantId, normalizedEmail } },
            })
          : null;
        if (contact) {
          const patch = fill(contact, contactData(data, tenantId));
          if (Object.keys(patch).length > 0) {
            contact = await tx.contact.update({ where: { id: contact.id }, data: patch });
          }
        } else {
          contact = await tx.contact.create({ data: contactData(data, tenantId) });
        }

        const leadNormalizedEmail = data.forceDuplicateLead ? null : normalizedEmail || null;
        const lead = await tx.lead.create({
          data: {
            contactId: contact.id,
            accountId: account.id,
            firstName: data.firstName,
            lastName: data.lastName,
            company: data.company,
            title: data.title || null,
            email: data.email,
            phone: data.phone || null,
            linkedIn: data.linkedIn || null,
            whatsApp: data.whatsApp || null,
            stage: sequence ? 'sequence_active' : (initialStage as any),
            crmPriorityScore: data.priority,
            assignedToId,
            campaignId,
            source: data.source,
            importListName: data.importListName || null,
            emailValidation: data.emailValidation || null,
            emailScore: data.emailScore,
            vendorSource: data.vendorSource || null,
            tags: data.tags ?? [],
            normalizedEmail: leadNormalizedEmail,
            normalizedPhone: normalizedPhone || null,
            normalizedLinkedIn: normalizedLinkedIn || null,
            tenantId,
            ...(sequence ? { sequenceId: sequence.id, sequenceStep: 1, sequenceStatus: 'active' as const } : {}),
          },
        });

        await tx.importRow.update({
          where: { id: row.id },
          data: { status: 'imported', leadId: lead.id },
        });

        await tx.activity.create({
          data: {
            userId,
            leadId: lead.id,
            type: 'lead_created',
            description: `Lead ${data.firstName} ${data.lastName} imported from ${data.importListName || data.vendorSource || 'uploaded file'}`,
            tenantId,
          },
        });

        if (sequence && sequence.steps.length > 0) {
          await tx.activity.create({
            data: {
              userId,
              leadId: lead.id,
              type: 'sequence_enrolled',
              description: `Enrolled in ${sequence.name} (import)`,
              metadata: { sequenceId: sequence.id, sequenceName: sequence.name },
              tenantId,
            },
          });
        }

        return lead;
      });

      if (sequence && sequence.steps.length > 0) {
        await createTaskForStep(createdLead, sequence, sequence.steps[0], new Date());
      }

      created++;
    } catch (err) {
      console.error(`[import.chunk] row ${row.rowIndex} failed:`, err);
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: 'error', errors: { reason: 'Database error while creating lead' } },
      });
      errors++;
    }
  }

  return { success: true, batchId, chunkIndex, created, errors };
}

async function handleImportCommit(payload: ImportCommitPayload) {
  const { batchId } = payload;

  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) return { skipped: true, reason: 'batch_not_found' };
  if (batch.status === 'committed') return { skipped: true, reason: 'already_committed' };

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: 'committing' } });

  const [imported, updated, errored] = await Promise.all([
    prisma.importRow.count({ where: { batchId, status: 'imported' } }),
    prisma.importRow.count({ where: { batchId, status: 'updated' } }),
    prisma.importRow.count({ where: { batchId, status: 'error' } }),
  ]);

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: 'committed',
      parsedRows: imported + updated,
      errorRows: errored,
    },
  });

  return { success: true, batchId, imported, updated, errored };
}

export { handleImportParse, handleImportChunk, handleImportCommit };

function createImportWorker() {
  return createAppWorker(
    'import',
    async (job) => {
      if (job.name === JobType.IMPORT_PARSE) {
        return handleImportParse(job.data as ImportParsePayload);
      }
      if (job.name === JobType.IMPORT_CHUNK) {
        return handleImportChunk(job.data as ImportChunkPayload);
      }
      if (job.name === JobType.IMPORT_COMMIT) {
        return handleImportCommit(job.data as ImportCommitPayload);
      }
    },
    { concurrency: 3 }
  );
}

export { createImportWorker };
