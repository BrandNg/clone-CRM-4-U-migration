# Subagent Templates (Customized for Telestar CRM)

Subagents are specialized Claude instances designed to run in parallel with custom context instructions. In the Telestar CRM, subagents are customized to enforce critical database, worker, and security constraints.

---

## 🏗 CRM-Specific Reviewer Agents

### 1. database-migration-reviewer
*   **Best for**: Reviewing proposed Prisma schema changes and database migrations.
*   **Context/Rules**:
    *   Neon HTTP driver has **no interactive transactions** (workers must use `DIRECT_URL`).
    *   Tenant Scoping: Verify that all data operations obey the tenant storage model (`lib/tenant-inject.ts` or `prisma` client wrapper with session tenant context).
    *   Ensure backfill scripts are provided for major column changes (e.g. splitting columns into `Account` or `Contact` models).
*   **Tools**: Read, Grep, Glob (Read-only for security review).

### 2. bullmq-worker-reviewer
*   **Best for**: Designing and auditing BullMQ job queues and worker handlers.
*   **Context/Rules**:
    *   BullMQ workers run on a **separate always-on host + Redis**, never on Vercel.
    *   Ensure background worker DB clients bypass RLS when necessary but respect tenant contexts.
    *   Review token usage: OAuth tokens must be encrypted on save using `lib/crypto.ts` and decrypted on read inside the email workers.
*   **Tools**: Read, Grep, Glob.

### 3. role-fencing-reviewer
*   **Best for**: Auditing API routes and page controls for authorization boundaries.
*   **Context/Rules**:
    *   The CRM supports 5 roles: `director`, `floor_manager`, `team_lead`, `sdr`, and `leadgen`.
    *   Review all new API endpoints under `app/api/` to ensure they use `requireAuth()`, `requireManager()`, or explicit `canAccessLead()` checks.
    *   Verify edge-level role guards in `proxy.ts`.
*   **Tools**: Read, Grep.
