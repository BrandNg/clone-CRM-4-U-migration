import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { compare } from 'bcryptjs';
import { prisma, tenantStorage } from '@/lib/prisma';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_CLIENT_ID || 'dummy-id',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'dummy-secret',
      issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/v2.0`,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        return await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
          if (!credentials?.email || !credentials?.password) return null;

          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

          if (!user || !user.isActive) return null;

          const passwordMatch = await compare(
            credentials.password as string,
            user.password
          );
          if (!passwordMatch) return null;

          const reportsCount = await prisma.user.count({
            where: { managerId: user.id, isActive: true },
          });

          return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            isManager: reportsCount > 0 || ['director', 'floor_manager', 'team_lead'].includes(user.role),
            tenantId: user.tenantId,
          };
        });
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      return await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
        if (account?.provider === 'microsoft-entra-id') {
          if (!user.email) return false;

          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
          });

          if (!existingUser || !existingUser.isActive) {
            return false;
          }
        }
        return true;
      });
    },
    async jwt({ token, user, account }) {
      return await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
        if (user) {
          if (account?.provider === 'microsoft-entra-id' && user.email) {
            const dbUser = await prisma.user.findUnique({
              where: { email: user.email },
            });
            if (dbUser) {
              const reportsCount = await prisma.user.count({
                where: { managerId: dbUser.id, isActive: true },
              });
              token.id = dbUser.id;
              token.firstName = dbUser.firstName;
              token.lastName = dbUser.lastName;
              token.role = dbUser.role;
              token.isManager = reportsCount > 0 || ['director', 'floor_manager', 'team_lead'].includes(dbUser.role);
              token.tenantId = dbUser.tenantId;
              return token;
            }
          }
          token.id = user.id;
          token.firstName = (user as any).firstName;
          token.lastName = (user as any).lastName;
          token.role = (user as any).role;
          token.isManager = (user as any).isManager;
          token.tenantId = (user as any).tenantId;
        }
        return token;
      });
    },
  },
});

