# Runtime Hardening — Active Initiative (primary bug + update flow)

> This is the **active workstream** for CRM-4-U. Full roadmap + task list:
> [`docs/runtime-hardening/PLAN.md`](../../docs/runtime-hardening/PLAN.md).
> Resume pointer (read first): [`docs/runtime-hardening/STATUS.md`](../../docs/runtime-hardening/STATUS.md).

When the user asks for a bug fix, correctness work, or runtime/worker changes, check
`STATUS.md` for the current phase and execute the next unchecked task in `PLAN.md`.
Tick the checkbox and update `STATUS.md` when done.

## Runtime Law

```
API route records intent.   Worker executes intent.   Database records truth.
UI reads database truth.    BullMQ can be rebuilt from database truth.
```

## Constraints that bite (verified against the code)

- **Neon HTTP driver has no interactive transactions.** Single-statement compare-and-set
  (`updateMany({where:{...status:'pending'}})`) is fine; multi-step atomic work in
  **workers must use `DIRECT_URL`** (TCP).
- **Web is Vercel serverless only** (pinned `sin1`). BullMQ workers run on a **separate
  always-on host + managed Redis** — never on Vercel routes.
- **Next.js 16** breaking changes — read `node_modules/next/dist/docs/` before route/runtime code.
- Reuse existing **`lib/crypto.ts`** (AES-256-GCM, `ENCRYPTION_KEY`) — don't roll new crypto.
- `User.timezone` already exists; sequence engine (`lib/sequences/engine.ts`) already has
  `pauseSequence`/`advanceSequence`/`unenrollLead` — reuse, don't reinvent.

## Guardrails

**Forbidden:** direct provider send from API routes · `email_sent` activity without provider
success · sequence-field mutation via the generic Lead API · hard delete for archive · fake
demo data as a runtime dependency · blind tenant defaults in runtime writes · BullMQ-only
state as UI truth · sequence-step deletion while active enrollments exist · sending without a
suppression check · any non-idempotent worker job.

**Required:** every worker writes `JobRun` progress · every state transition writes an
Activity/audit · every send goes through `OutboundMessage` · every delayed job is rebuildable
from the DB · every endpoint checks access **before** enqueueing work · every schema change
has Vitest acceptance tests.
