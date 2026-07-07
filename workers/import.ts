import { prisma } from '@/lib/prisma';
import { createAppWorker } from '@/lib/bullmq';
import { JobType } from '@/lib/bullmq/types';
import type { ImportParsePayload, ImportChunkPayload, ImportCommitPayload } from '@/lib/bullmq/types';
import { enqueue } from '@/lib/bullmq/enqueue';
import { normalizeEmail, normalizePhone, normalizeLinkedIn } from '@/lib/leads/normalize';
import { createTaskForStep } from '@/lib/sequences/engine';

const CHUNK_SIZE = 500;

const summary = (l: { firstName: string; lastName: string; company: string; email?: string }) =>
  `${l.firstName} ${l.lastName} — ${l.company}${l.email ? ` (${l.email})` : ''}`;

async function handleImportParse(payload: ImportParsePayload) {
  const { batchId, assignedToId, campaignId, tenantId, userId, initialStage, sequenceId, defaultResolution, resolutions } = payload;

  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) return { skipped: true, reason: 'batch_not_found' };

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: 'parsing' } });

  const rows = await prisma.importRow.findMany({
    where: { batchId, status: 'pending' },
    orderBy: { rowIndex: 'asc' },
  });

  // Phase 1: Validate
  const errorRows: { id: string; reason: string }[] = [];
  const validRows: { id: string; rowIndex: number; data: Record<string, unknown> }[] = [];

  for (const row of rows) {
    const d = row.data as Record<string, unknown>;
    const firstName = (d.firstName as string ?? '').trim();
    const lastName = (d.lastName as string ?? '').trim();
    const email = (d.email as string ?? '').trim();

    if (!firstName && !lastName && !email) {
      errorRows.push({ id: row.id, reason: 'Missing name and email' });
    } else {
      validRows.push({ id: row.id, rowIndex: row.rowIndex, data: d });
    }
  }

  // Batch update validation errors
  if (errorRows.length > 0) {
    await prisma.importRow.updateMany({
      where: { id: { in: errorRows.map(e => e.id) } },
      data: { status: 'error', errors: { reason: 'Missing name and email' } },
    });
  }

  // Phase 2: Scoped dedup (existing leads in same tenant + campaign)
  const existingLeads = await prisma.lead.findMany({
    where: { tenantId, campaignId },
    select: { id: true, email: true, firstName: true, lastName: true, company: true, phone: true, title: true },
  });

  const byEmail = new Map<string, (typeof existingLeads)[number]>();
  const byNameCompany = new Map<string, (typeof existingLeads)[number]>();
  const byPhone = new Map<string, (typeof existingLeads)[number]>();
  for (const l of existingLeads) {
    const email = (l.email ?? '').toLowerCase().trim();
    if (email && !byEmail.has(email)) byEmail.set(email, l);
    const nameKey = `${(l.firstName ?? '').toLowerCase()}|${(l.lastName ?? '').toLowerCase()}|${(l.company ?? '').toLowerCase()}`;
    if (!byNameCompany.has(nameKey)) byNameCompany.set(nameKey, l);
    const phone = normalizePhone(l.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, l);
  }

  const cleanRowIds: string[] = [];
  const duplicateUpdates: { id: string; reason: string }[] = [];
  const updateTargets: { id: string; existingLeadId: string; data: Record<string, unknown> }[] = [];
  const seenInBatch = new Set<string>();

  for (const vr of validRows) {
    const firstName = (vr.data.firstName as string ?? '').trim();
    const lastName = (vr.data.lastName as string ?? '').trim();
    const email = (vr.data.email as string ?? '').trim().toLowerCase();
    const company = (vr.data.company as string ?? '').trim();
    const phone = normalizePhone(vr.data.phone as string | null | undefined);

    // In-batch dedup
    if (email && seenInBatch.has(email)) {
      duplicateUpdates.push({ id: vr.id, reason: 'Duplicate email within this batch' });
      continue;
    }
    if (email) seenInBatch.add(email);

    let match: (typeof existingLeads)[number] | undefined;
    let matchType: string | undefined;
    if (email && byEmail.has(email)) {
      match = byEmail.get(email);
      matchType = 'email';
    } else if (firstName && lastName && company) {
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${company.toLowerCase()}`;
      if (byNameCompany.has(key)) {
        match = byNameCompany.get(key);
        matchType = 'name_company';
      }
    }
    if (!match && phone && byPhone.has(phone)) {
      match = byPhone.get(phone);
      matchType = 'phone';
    }

    if (match && matchType) {
      const res = resolutions?.[String(vr.rowIndex)] ?? defaultResolution ?? 'skip';
      if (res === 'skip') {
        duplicateUpdates.push({ id: vr.id, reason: `Duplicate skipped (${matchType} match)` });
      } else if (res === 'update') {
        updateTargets.push({ id: vr.id, existingLeadId: match.id, data: vr.data });
      } else {
        cleanRowIds.push(vr.id);
      }
    } else {
      cleanRowIds.push(vr.id);
    }
  }

  // Mark duplicates as error
  if (duplicateUpdates.length > 0) {
    await Promise.all(duplicateUpdates.map(dup =>
      prisma.importRow.update({
        where: { id: dup.id },
        data: { status: 'error', errors: { reason: dup.reason } },
      })
    ));
  }

  // Handle 'update' resolution — fill empty fields on existing leads
  const existingMap = new Map(existingLeads.map((l) => [l.id, l]));
  let updatedCount = 0;
  const updateWrites: Promise<any>[] = [];
  for (const ut of updateTargets) {
    const existing = existingMap.get(ut.existingLeadId);
    if (!existing) continue;
    const fill: Record<string, string> = {};
    const t = ut.data.title as string | undefined;
    const p = ut.data.phone as string | undefined;
    const e = ut.data.email as string | undefined;
    if (!existing.title && t?.trim()) fill.title = t.trim();
    if (!existing.phone && p?.trim()) fill.phone = p.trim();
    if (!existing.email && e?.trim()) fill.email = e.trim();
    if (Object.keys(fill).length > 0) {
      updateWrites.push(
        prisma.lead.update({ where: { id: ut.existingLeadId }, data: fill })
      );
      updatedCount++;
    }
    updateWrites.push(
      prisma.importRow.update({
        where: { id: ut.id },
        data: { status: 'imported', leadId: ut.existingLeadId },
      })
    );
  }
  await Promise.all(updateWrites);

  // Mark clean rows as valid
  if (cleanRowIds.length > 0) {
    await prisma.importRow.updateMany({
      where: { id: { in: cleanRowIds } },
      data: { status: 'valid' },
    });
  }

  // Phase 3: Chunk valid rows and enqueue
  const chunks: string[][] = [];
  for (let i = 0; i < cleanRowIds.length; i += CHUNK_SIZE) {
    chunks.push(cleanRowIds.slice(i, i + CHUNK_SIZE));
  }

  const rowDataMap = new Map(rows.map((r) => [r.id, r.data as Record<string, unknown>]));

  for (let i = 0; i < chunks.length; i++) {
    const chunkRowIds = chunks[i];
    await enqueue(JobType.IMPORT_CHUNK, {
      batchId,
      chunkIndex: i,
      rowIds: chunkRowIds,
      rows: chunkRowIds.map((id) => rowDataMap.get(id) ?? {}),
      assignedToId,
      userId,
      campaignId,
      tenantId,
      initialStage: initialStage ?? 'new',
      sequenceId,
    } satisfies ImportChunkPayload, { tenantId });
  }

  await enqueue(JobType.IMPORT_COMMIT, { batchId } satisfies ImportCommitPayload, { tenantId });

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: 'parsed',
      parsedRows: cleanRowIds.length + updatedCount,
      errorRows: errorRows.length + duplicateUpdates.length,
    },
  });

  return {
    success: true,
    batchId,
    totalRows: rows.length,
    validationErrors: errorRows.length,
    duplicates: duplicateUpdates.length,
    updated: updatedCount,
    cleanRows: cleanRowIds.length,
    chunks: chunks.length,
  };
}

async function handleImportChunk(payload: ImportChunkPayload) {
  const { batchId, chunkIndex, rowIds, assignedToId, userId, campaignId, tenantId, initialStage, sequenceId } = payload;

  const importRows = await prisma.importRow.findMany({
    where: { id: { in: rowIds } },
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
    const d = row.data as Record<string, unknown>;
    const firstName = (d.firstName as string ?? '').trim();
    const lastName = (d.lastName as string ?? '').trim();
    const email = (d.email as string ?? '').trim();
    const company = (d.company as string ?? '').trim();
    const title = (d.title as string ?? '').trim();
    const phone = (d.phone as string ?? '').trim();
    const linkedIn = (d.linkedIn as string ?? '').trim();
    const rawPriority = ((d.priority as string) ?? '').toLowerCase().trim();
    const priority: 'hot' | 'warm' | 'cold' =
      rawPriority === 'hot' || rawPriority === 'warm' || rawPriority === 'cold'
        ? rawPriority
        : 'warm';

    try {
      // Create or find Account by company name
      let account: { id: string } | null = null;
      if (company) {
        account = await prisma.account.findUnique({
          where: { tenantId_name: { tenantId, name: company } },
        });
        if (!account) {
          account = await prisma.account.create({
            data: { name: company, tenantId },
          });
        }
      }

      // Create or find Contact (person-level dedup)
      const normalizedEmail = normalizeEmail(email);
      const normalizedPhone = normalizePhone(phone);
      const normalizedLinkedIn = normalizeLinkedIn(linkedIn);
      let contact: { id: string } | null = null;
      if (normalizedEmail) {
        contact = await prisma.contact.findUnique({
          where: { tenantId_normalizedEmail: { tenantId, normalizedEmail } },
        });
      }
      if (contact) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { firstName, lastName, company, title, email, phone, linkedIn, normalizedEmail, normalizedPhone, normalizedLinkedIn },
        });
      } else {
        contact = await prisma.contact.create({
          data: { firstName, lastName, company, title, email, phone, linkedIn, normalizedEmail, normalizedPhone, normalizedLinkedIn, tenantId },
        });
      }

      const createdLead = await prisma.lead.create({
        data: {
          contactId: contact.id,
          accountId: account?.id ?? null,
          firstName,
          lastName,
          company,
          title,
          email,
          phone,
          linkedIn,
          stage: sequence ? 'sequence_active' : (initialStage as any),
          crmPriorityScore: priority,
          assignedToId,
          campaignId,
          source: 'csv-import',
          tags: [],
          normalizedEmail,
          normalizedPhone,
          normalizedLinkedIn,
          ...(sequence ? { sequenceId: sequence.id, sequenceStep: 1, sequenceStatus: 'active' as const } : {}),
        },
      });

      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: 'imported', leadId: createdLead.id },
      });

      await prisma.activity.create({
        data: {
          userId,
          leadId: createdLead.id,
          type: 'lead_created',
          description: `Lead ${firstName} ${lastName} imported via CSV`,
        },
      });

      if (sequence && sequence.steps.length > 0) {
        await prisma.activity.create({
          data: {
            userId,
            leadId: createdLead.id,
            type: 'sequence_enrolled',
            description: `Enrolled in ${sequence.name} (CSV import)`,
            metadata: { sequenceId: sequence.id, sequenceName: sequence.name },
          },
        });
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

  const [imported, errored] = await Promise.all([
    prisma.importRow.count({ where: { batchId, status: 'imported' } }),
    prisma.importRow.count({ where: { batchId, status: 'error' } }),
  ]);

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: 'committed',
      parsedRows: imported,
      errorRows: errored,
    },
  });

  return { success: true, batchId, imported, errored };
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
