import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, canImportExport, canAccessUser, getLeadgenScope } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { startImportWorkflow } from '@/lib/workflows/import';

interface ImportRow {
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  priority?: string;
}

type Resolution = 'skip' | 'update' | 'import';

interface ImportBody {
  leads: ImportRow[];
  dryRun?: boolean;
  assignedToId?: string;
  campaignId?: string;
  initialStage?: string;
  sequenceId?: string;
  resolutions?: Record<string, Resolution>;
  defaultResolution?: Resolution;
  filename?: string;
}

interface DuplicateInfo {
  row: number;
  matchType: 'email' | 'name_company' | 'phone';
  existingLeadId: string;
  existingSummary: string;
  incoming: ImportRow;
}

const normalizePhone = (p?: string | null) => (p ?? '').replace(/\D/g, '');

const summary = (l: { firstName: string; lastName: string; company: string; email?: string }) =>
  `${l.firstName} ${l.lastName} — ${l.company}${l.email ? ` (${l.email})` : ''}`;

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  if (!canImportExport(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: ImportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.leads) || body.leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 });
  }
  if (body.leads.length > 10000) {
    return NextResponse.json({ error: 'Too many rows — max 10000 per import' }, { status: 400 });
  }

  if (user.role === 'leadgen' && body.campaignId) {
    const scope = await getLeadgenScope(user);
    if (scope.kind === 'member' && !scope.campaignIds.includes(body.campaignId)) {
      return NextResponse.json({ error: 'Forbidden: campaign not assigned to you' }, { status: 403 });
    }
  }

  const campaignId = body.campaignId;
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }

  // Dry run: classify duplicates without writing anything
  if (body.dryRun) {
    const existingLeads = await prisma.lead.findMany({
      where: { campaignId },
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

    const duplicates: DuplicateInfo[] = [];
    const errorRows: { row: number; reason: string }[] = [];

    for (let i = 0; i < body.leads.length; i++) {
      const rowNum = i + 1;
      const row = body.leads[i];
      const firstName = (row.firstName ?? '').trim();
      const lastName = (row.lastName ?? '').trim();
      const email = (row.email ?? '').trim().toLowerCase();
      const company = (row.company ?? '').trim();
      const phone = normalizePhone(row.phone);

      if (!firstName && !lastName && !email) {
        errorRows.push({ row: rowNum, reason: 'Missing name and email' });
        continue;
      }

      let match: (typeof existingLeads)[number] | undefined;
      let matchType: DuplicateInfo['matchType'] | undefined;
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
        duplicates.push({ row: rowNum, matchType, existingLeadId: match.id, existingSummary: summary(match), incoming: row });
      }
    }

    return NextResponse.json({
      total: body.leads.length,
      toImport: body.leads.length - duplicates.length - errorRows.length,
      duplicates,
      errorRows,
      exactDuplicates: duplicates.filter((d) => d.matchType === 'email').length,
      possibleMatches: duplicates.filter((d) => d.matchType !== 'email').length,
      rowsWithErrors: errorRows.length,
    });
  }

  // Real import: validate sequence if provided
  const sequence = body.sequenceId
    ? await prisma.sequence.findUnique({
        where: { id: body.sequenceId },
        select: { id: true, isActive: true, steps: { where: { order: 1 }, select: { id: true } } },
      })
    : null;
  if (body.sequenceId && (!sequence || !sequence.isActive)) {
    return NextResponse.json({ error: 'Sequence not found or inactive' }, { status: 400 });
  }

  const assignedToId = body.assignedToId || user.id;
  if (assignedToId !== user.id && !(await canAccessUser(user, assignedToId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = user.tenantId || 'default-tenant';

  // Create the persistent ImportBatch
  const importBatch = await prisma.importBatch.create({
    data: {
      campaignId,
      userId: user.id,
      filename: body.filename || 'import.csv',
      totalRows: body.leads.length,
      status: 'pending',
      tenantId,
    },
  });

  // Create ImportRows for all rows
  const rowCreates = body.leads.map((row, i) => ({
    batchId: importBatch.id,
    rowIndex: i + 1,
    data: row as unknown as Prisma.InputJsonValue,
    status: 'pending' as const,
    tenantId,
  }));

  await prisma.importRow.createMany({ data: rowCreates });

  // Enqueue the import parse job
  await startImportWorkflow({
    batchId: importBatch.id,
    assignedToId,
    campaignId,
    tenantId,
    userId: user.id,
    initialStage: body.initialStage || 'new',
    sequenceId: body.sequenceId || undefined,
    defaultResolution: body.defaultResolution || 'skip',
    resolutions: body.resolutions as Record<string, 'skip' | 'update' | 'import'> | undefined,
  });

  return NextResponse.json(
    { batchId: importBatch.id, totalRows: body.leads.length },
    { status: 202 }
  );
}
