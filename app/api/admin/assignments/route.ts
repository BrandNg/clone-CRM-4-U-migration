import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  getVisibleUserIds,
  getVisibleCampaignIds,
  getLeadgenScope,
} from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody, id } from '@/lib/validation/core';
import { z } from 'zod';
import { handleApiError } from '@/lib/api/errors';

/**
 * Control plane for user↔account assignments (`CampaignSdr`). Two non-overlapping
 * admin domains, both enforced server-side from the session user (never a
 * client-supplied scope):
 *   - SDR org   — Director (any) + Floor Manager (their floor: visible users ↔
 *                 floor accounts). Team Leads are valid targets too (a TL can
 *                 personally run an account).
 *   - Leadgen   — Leadgen Manager (his direct leadgen-member reports ↔ any
 *                 account). He cannot touch SDRs / team membership.
 * A cross-domain or out-of-scope mutation returns 403.
 */

type ManageScope =
  | { kind: 'all' } // director — any user ↔ any account
  | { kind: 'floor'; userIds: Set<string>; campaignIds: Set<string> } // floor manager
  | { kind: 'leadgen'; userIds: Set<string> } // leadgen manager — any account
  | { kind: 'none' };

async function getManageScope(user: SessionUser): Promise<ManageScope> {
  if (user.role === 'director') return { kind: 'all' };

  if (user.role === 'floor_manager') {
    const [userIds, campaignIds] = await Promise.all([
      getVisibleUserIds(user),
      getVisibleCampaignIds(user),
    ]);
    return {
      kind: 'floor',
      userIds: new Set(userIds ?? []),
      campaignIds: new Set(campaignIds ?? []),
    };
  }

  if (user.role === 'leadgen') {
    const scope = await getLeadgenScope(user);
    if (scope.kind !== 'manager') return { kind: 'none' };
    const reports = await prisma.user.findMany({
      where: { managerId: user.id, role: 'leadgen', isActive: true },
      select: { id: true },
    });
    return { kind: 'leadgen', userIds: new Set(reports.map((r) => r.id)) };
  }

  return { kind: 'none' };
}

/** Whether `scope` permits creating/removing the (userId, campaignId) assignment. */
function canManage(scope: ManageScope, userId: string, campaignId: string): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'floor':
      return scope.userIds.has(userId) && scope.campaignIds.has(campaignId);
    case 'leadgen':
      return scope.userIds.has(userId); // any account for his own members
    case 'none':
      return false;
  }
}

/**
 * Returns everything the Settings "Team & Accounts" panel needs in one scoped
 * call: which domain to render, the assignable members + account options the
 * caller may touch, the manager choices for team-membership editing, and the
 * current `CampaignSdr` assignments — all already scoped server-side.
 */
export async function GET() {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const scope = await getManageScope(user);
  if (scope.kind === 'none') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isLeadgen = scope.kind === 'leadgen';
  const userFilter = scope.kind === 'all' ? {} : { userId: { in: [...scope.userIds] } };

  try {
    // Assignable members + manager choices, scoped to the caller's domain.
    const userScopeWhere = scope.kind === 'all' ? {} : { id: { in: [...scope.userIds] } };
    const memberRoles = isLeadgen
      ? (['leadgen'] as const)
      : (['sdr', 'team_lead'] as const);

    const [memberRows, managerRows, campaignRows, assignmentRows] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true, role: { in: [...memberRoles] }, ...userScopeWhere },
        select: { id: true, firstName: true, lastName: true, role: true, managerId: true },
        orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
      }),
      // Manager choices for team-membership editing (SDR org only).
      isLeadgen
        ? Promise.resolve([])
        : prisma.user.findMany({
            where: {
              isActive: true,
              role: { in: ['team_lead', 'floor_manager'] },
              ...userScopeWhere,
            },
            select: { id: true, firstName: true, lastName: true, role: true },
            orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
          }),
      // Assignable accounts: floor manager → only floor campaigns; else all.
      prisma.campaign.findMany({
        where: scope.kind === 'floor' ? { id: { in: [...scope.campaignIds] } } : {},
        select: { id: true, name: true, client: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.campaignSdr.findMany({
        where: userFilter,
        select: { userId: true, campaignId: true },
      }),
    ]);

    return NextResponse.json({
      domain: isLeadgen ? 'leadgen' : 'sdr_org',
      canEditTeam: scope.kind === 'all' || scope.kind === 'floor',
      members: memberRows.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        role: m.role,
        managerId: m.managerId,
      })),
      managers: managerRows.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        role: m.role,
      })),
      campaigns: campaignRows.map((c) => ({
        id: c.id,
        name: c.name,
        clientName: c.client.name,
      })),
      assignments: assignmentRows.map((a) => ({ userId: a.userId, campaignId: a.campaignId })),
    });
  } catch (err) {
    return handleApiError('api/admin/assignments GET', err);
  }
}

const assignmentSchema = z.object({ userId: id, campaignId: id });

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, assignmentSchema, 'Invalid assignment create');
  if (parsed.error) return parsed.error;
  const { userId, campaignId } = parsed.data;

  const scope = await getManageScope(user);
  if (!canManage(scope, userId, campaignId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Validate the referenced rows exist (clear 404 instead of an FK error).
    const [target, campaign] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
      prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } }),
    ]);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    // Idempotent on the composite PK [campaignId, userId].
    await prisma.campaignSdr.upsert({
      where: { campaignId_userId: { campaignId, userId } },
      create: { campaignId, userId },
      update: {},
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return handleApiError('api/admin/assignments POST', err);
  }
}

export async function DELETE(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, assignmentSchema, 'Invalid assignment delete');
  if (parsed.error) return parsed.error;
  const { userId, campaignId } = parsed.data;

  const scope = await getManageScope(user);
  if (!canManage(scope, userId, campaignId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await prisma.campaignSdr.deleteMany({ where: { campaignId, userId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError('api/admin/assignments DELETE', err);
  }
}
