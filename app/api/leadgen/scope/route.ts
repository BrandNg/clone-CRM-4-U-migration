import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getLeadgenScope } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  // Let managers (director, floor_manager) view as leadgen manager
  if (user.role !== 'leadgen' && user.role !== 'director' && user.role !== 'floor_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const scope = await getLeadgenScope(user);
    return NextResponse.json(scope);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
