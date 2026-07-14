import type { EmailProvider } from '@prisma/client';
import { encrypt } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import type { SessionUser } from '@/lib/auth';

type OAuthAccountInput = {
  user: SessionUser;
  provider: Extract<EmailProvider, 'gmail' | 'outlook'>;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
};

export const upsertOAuthEmailAccount = async ({
  user,
  provider,
  email,
  accessToken,
  refreshToken,
  tokenExpiry,
}: OAuthAccountInput) => {
  const existing = await prisma.emailAccount.findFirst({
    where: { userId: user.id, email, provider },
  });

  if (!refreshToken && !existing?.encRefreshToken && !existing?.refreshToken) {
    return { ok: false as const, reason: 'missing_refresh_token' as const };
  }

  const [encAccessToken, encRefreshToken] = await Promise.all([
    encrypt(accessToken),
    refreshToken ? encrypt(refreshToken) : Promise.resolve(undefined),
  ]);

  const tokenData = {
    accessToken: null,
    encAccessToken,
    ...(encRefreshToken ? { refreshToken: null, encRefreshToken } : {}),
    tokenExpiry,
    isActive: true,
    lastSyncAt: new Date(),
  };

  const account = existing
    ? await prisma.emailAccount.update({
        where: { id: existing.id },
        data: tokenData,
      })
    : await prisma.emailAccount.create({
        data: {
          userId: user.id,
          email,
          provider,
          ...tokenData,
        },
      });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: existing ? 'reconnect_email' : 'connect_email',
      tableName: 'EmailAccount',
      recordId: account.id,
      changedFields: {
        provider,
        email,
        isActive: true,
        tokenStorage: 'encrypted',
      },
      tenantId: user.tenantId,
    },
  });

  return { ok: true as const, account, reconnected: Boolean(existing) };
};
