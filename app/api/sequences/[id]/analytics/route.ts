import { NextRequest, NextResponse } from 'next/server';
import { getSequenceAnalytics } from '@/lib/sequences/analytics';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const analytics = await getSequenceAnalytics(id);
    return NextResponse.json(analytics);
  } catch {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  }
}
