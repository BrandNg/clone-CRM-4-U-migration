import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAuth } from '@/lib/auth';
import { getMicrosoftAuthUrl } from '@/lib/email/adapters/OutlookAdapter';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET || !process.env.MICROSOFT_REDIRECT_URI) {
    return NextResponse.redirect(new URL('/settings?error=microsoft_not_configured', _req.url));
  }

  try {
    const nonce = randomBytes(32).toString('hex');
    const authUrl = getMicrosoftAuthUrl(nonce);

    const res = NextResponse.redirect(authUrl);
    res.cookies.set('oauth_nonce_microsoft', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    console.error('[oauth/microsoft] Failed to generate auth URL:', err);
    return NextResponse.redirect(new URL('/settings?error=microsoft_auth_failed', _req.url));
  }
}
