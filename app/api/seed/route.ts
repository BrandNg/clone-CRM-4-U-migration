import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

// Dev-only route. With real DB, run: npm run db:seed
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production.' }, { status: 403 });
  }

  const userOrRes = await requireRole('director');
  if (userOrRes instanceof NextResponse) return userOrRes;

  return NextResponse.json({
    success: false,
    message: 'With a real database, reset seed data from the CLI: npm run db:seed',
  });
}
