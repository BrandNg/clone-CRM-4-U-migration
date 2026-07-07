import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { leadStage, priority } from '@/lib/validation/schemas';

export interface LeadListFilters {
  stage?: z.infer<typeof leadStage>;
  priority?: z.infer<typeof priority>;
  assignedTo?: string;
  campaignId?: string;
  source?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  includeArchived?: boolean;
}

/**
 * Compose the Prisma `where` for the lead list.
 *
 * The role scope is ALWAYS the first `AND` clause and is never spread into the
 * same object as the filters — so a search `OR`, a `campaignId`, or an
 * `assignedTo` query param can only *narrow* results, never widen them past the
 * caller's role scope. (The old `{ ...roleScope, ...filters }` spread let a
 * colliding key silently override the scope — that was BUG-001.)
 */
export function buildLeadListWhere(
  roleScope: Prisma.LeadWhereInput,
  filters: LeadListFilters
): Prisma.LeadWhereInput {
  const clauses: Prisma.LeadWhereInput[] = [roleScope];

  if (!filters.includeArchived) {
    clauses.push({ archivedAt: null });
  }

  if (filters.stage) clauses.push({ stage: filters.stage });
  if (filters.priority) clauses.push({ crmPriorityScore: filters.priority });
  if (filters.assignedTo) clauses.push({ assignedToId: filters.assignedTo });
  if (filters.campaignId) clauses.push({ campaignId: filters.campaignId });
  if (filters.source) clauses.push({ source: { contains: filters.source, mode: 'insensitive' } });
  if (filters.tag) clauses.push({ tags: { has: filters.tag } });

  if (filters.dateFrom || filters.dateTo) {
    clauses.push({
      createdAt: {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo + 'T23:59:59Z') } : {}),
      },
    });
  }

  if (filters.search) {
    clauses.push({
      OR: [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { company: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }

  return { AND: clauses };
}
