import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '@/lib/crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🔐 Encrypting existing OAuth tokens...');

  const accounts = await prisma.emailAccount.findMany({
    where: {
      OR: [
        { accessToken: { not: null }, encAccessToken: null },
        { refreshToken: { not: null }, encRefreshToken: null },
      ],
    },
  });

  console.log(`Found ${accounts.length} account(s) with unencrypted tokens`);

  let updated = 0;
  for (const account of accounts) {
    const encAccessToken = account.accessToken
      ? await encrypt(account.accessToken)
      : null;
    const encRefreshToken = account.refreshToken
      ? await encrypt(account.refreshToken)
      : null;

    if (encAccessToken || encRefreshToken) {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          ...(encAccessToken ? { encAccessToken } : {}),
          ...(encRefreshToken ? { encRefreshToken } : {}),
        },
      });
      updated++;
    }
  }

  console.log(`✅ Encrypted tokens for ${updated} account(s)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
