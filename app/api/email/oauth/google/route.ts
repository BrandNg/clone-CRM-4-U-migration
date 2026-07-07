import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAuth } from '@/lib/auth';
import { getGoogleAuthUrl } from '@/lib/email/adapters/GmailAdapter';

export async function GET(_req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    return NextResponse.redirect(new URL('/settings?error=google_not_configured', _req.url));
  }

  try {
    const nonce = randomBytes(32).toString('hex');
    const authUrl = getGoogleAuthUrl(nonce);

    const res = NextResponse.redirect(authUrl);
    res.cookies.set('oauth_nonce_google', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    console.error('[oauth/google] Failed to generate auth URL:', err);
    return NextResponse.redirect(new URL('/settings?error=google_auth_failed', _req.url));
  }
}
