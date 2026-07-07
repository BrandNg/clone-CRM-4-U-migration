import { NextResponse } from 'next/server';
import { requireAuth, getLeadgenScope, type SessionUser } from '@/lib/auth';
import { getScopedSequenceStats } from '@/lib/sequences/analytics';

export const dynamic = 'force-dynamic';

/**
 * Role-scoped sequence performance for the manager report views (Team View "Sequences" tab,
 * Leadgen Manager "Outcomes & Reports"). Results are scoped to the viewer's visibility inside
 * getScopedSequenceStats; this gate just restricts the endpoint to managers (incl. Leadgen
 * Managers, matched the same way the /leadgen page does — via getLeadgenScope).
 */
export async function GET() {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const isStandardManager =
    user.role === 'director' ||
    user.role === 'floor_manager' ||
    user.role === 'team_lead' ||
    !!user.isManager;

  let allowed = isStandardManager;
  if (!allowed && user.role === 'leadgen') {
    const scope = await getLeadgenScope(user);
    allowed = scope.kind === 'manager';
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const stats = await getScopedSequenceStats(user);
    // Per-viewer scoped (varies by pod/floor/campaigns) — never share across users.
    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[sequences/team-analytics] GET failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
