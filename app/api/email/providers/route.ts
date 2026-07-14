import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

const providerConfig = {
  gmail: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
  outlook: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
} as const;

const statusFor = (keys: readonly string[]) => {
  const missing = keys.filter((key) => !process.env[key]);
  return {
    configured: missing.length === 0,
    missing,
  };
};

export async function GET() {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  return NextResponse.json({
    gmail: statusFor(providerConfig.gmail),
    outlook: statusFor(providerConfig.outlook),
  });
}
