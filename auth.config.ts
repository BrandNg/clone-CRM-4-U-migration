import type { NextAuthConfig } from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

// Edge-compatible auth config — no Prisma, no bcrypt.
// Used by proxy.ts to validate JWT tokens without importing heavy Node.js modules.
// The full credentials provider (with Prisma) lives in auth.ts.
export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_CLIENT_ID || 'dummy-id',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'dummy-secret',
      issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/v2.0`,
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
        token.role = (user as any).role;
        token.isManager = (user as any).isManager;
        token.tenantId = (user as any).tenantId;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as any).firstName = token.firstName;
        (session.user as any).lastName = token.lastName;
        (session.user as any).role = token.role;
        (session.user as any).isManager = token.isManager;
        (session.user as any).tenantId = token.tenantId;
      }
      return session;
    },
  },
};
