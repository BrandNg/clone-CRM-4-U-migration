import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { exchangeMicrosoftCode } from '@/lib/email/adapters/OutlookAdapter';
import { upsertOAuthEmailAccount } from '@/lib/email/oauthAccounts';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    const res = NextResponse.redirect(new URL('/settings?error=microsoft_auth_failed', req.url));
    res.cookies.delete('oauth_nonce_microsoft');
    return res;
  }

  // CSRF validation: compare state against the nonce stored in the HttpOnly cookie
  const nonce = req.cookies.get('oauth_nonce_microsoft')?.value;
  if (!nonce || state !== nonce) {
    const res = NextResponse.redirect(new URL('/settings?error=microsoft_invalid_state', req.url));
    res.cookies.delete('oauth_nonce_microsoft');
    return res;
  }

  try {
    const { email, accessToken, refreshToken, tokenExpiry } = await exchangeMicrosoftCode(code);

    if (!email) {
      return NextResponse.redirect(new URL('/settings?error=microsoft_no_email', req.url));
    }

    const result = await upsertOAuthEmailAccount({
      user,
      provider: 'outlook',
      email,
      accessToken,
      refreshToken,
      tokenExpiry,
    });

    if (!result.ok) {
      const res = NextResponse.redirect(new URL('/settings?error=microsoft_missing_refresh_token', req.url));
      res.cookies.delete('oauth_nonce_microsoft');
      return res;
    }

    const res = NextResponse.redirect(new URL('/settings?success=outlook_connected', req.url));
    res.cookies.delete('oauth_nonce_microsoft');
    return res;
  } catch (error) {
    console.error('Error exchanging Microsoft OAuth code:', error);
    return NextResponse.redirect(new URL('/settings?error=microsoft_token_exchange_failed', req.url));
  }
}
