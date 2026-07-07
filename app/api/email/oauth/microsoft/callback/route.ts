import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { exchangeMicrosoftCode } from '@/lib/email/adapters/OutlookAdapter';

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

    const [encAccessToken, encRefreshToken] = await Promise.all([
      accessToken ? encrypt(accessToken) : Promise.resolve(null),
      refreshToken ? encrypt(refreshToken) : Promise.resolve(null),
    ]);

    if (!email) {
      return NextResponse.redirect(new URL('/settings?error=microsoft_no_email', req.url));
    }

    // Check if user already connected this Outlook account
    const existing = await prisma.emailAccount.findFirst({
      where: { userId: user.id, email, provider: 'outlook' },
    });

    if (existing) {
      await prisma.emailAccount.update({
        where: { id: existing.id },
        data: {
          accessToken,
          refreshToken,
          encAccessToken,
          encRefreshToken,
          tokenExpiry,
          isActive: true,
          lastSyncAt: new Date(),
        },
      });
    } else {
      await prisma.emailAccount.create({
        data: {
          userId: user.id,
          email,
          provider: 'outlook',
          accessToken,
          refreshToken,
          encAccessToken,
          encRefreshToken,
          tokenExpiry,
          isActive: true,
          lastSyncAt: new Date(),
        },
      });
    }

    const res = NextResponse.redirect(new URL('/settings?success=outlook_connected', req.url));
    res.cookies.delete('oauth_nonce_microsoft');
    return res;
  } catch (error) {
    console.error('Error exchanging Microsoft OAuth code:', error);
    return NextResponse.redirect(new URL('/settings?error=microsoft_token_exchange_failed', req.url));
  }
}
