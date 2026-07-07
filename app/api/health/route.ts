import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Lightweight keep-alive endpoint. Runs a trivial `SELECT 1` to keep the Neon
// compute instance warm while the app is in active use, preventing the free-tier
// auto-suspend (5 min idle) that causes cold-start lag on the next query.
//
// Uses $queryRaw, which is a root client operation — it is NOT intercepted by the
// tenant RLS middleware (that only wraps model operations), so no tenant context
// is required and nothing sensitive is read or returned.

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
