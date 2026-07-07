# CRM-4-U — Runtime Hardening + BullMQ Migration Plan

> **This is the primary bug-fix + update flow for CRM-4-U.** Any agent or developer
> working on runtime correctness, sequencing, email, import, or the worker runtime
> follows this document. Supersedes the original `CRM-4U_BullMQ_Runtime_Hardening_Plan.md`
> (which had real holes — see "Corrections" below).

## How to use this doc (read this first, every session)

1. Open [`STATUS.md`](./STATUS.md) — it names the **current phase**, the **next unchecked task**, and any **blockers**.
2. Find that task in the roadmap below. Read its acceptance criteria.
3. Implement it. Re-read the actual source files first (they change); never trust stale context.
4. Write/extend the **Vitest** test for it (framework is already configured; `tests/` exists).
5. Tick the checkbox here, update `STATUS.md`, commit with a `fix:`/`feat:` message referencing the task id (e.g. `P0.8`).

**Runtime constraints that bite (verified):**
- DB is **Neon**. The serverless **HTTP driver has no interactive transactions** — single-statement compare-and-set (`updateMany`) is fine, but multi-step atomic work in **workers must use `DIRECT_URL`** (TCP).
- Web runs on **Vercel serverless only** (functions pinned to `sin1`). BullMQ workers need a **separate always-on host + managed Redis** — they do **not** run on Vercel. See P10.
- **Next.js 16** has breaking changes vs training data — read `node_modules/next/dist/docs/` before writing route/runtime code (per `AGENTS.md`).
- Encryption already exists: `lib/crypto.ts` (AES-256-GCM + optional KMS), `ENCRYPTION_KEY` env. Reuse it; don't roll new crypto.

---

## Why this plan exists

CRM-4-U is a solid Next.js + Prisma SDR CRM skeleton but is **not yet safe as a real SDR runtime**. Verified bugs: access-scope leaks, fake sequence state writable through the Lead API, hard-delete where the UI says archive, non-idempotent task completion, reassignment that strands tasks, server-timezone task days, plaintext OAuth tokens, non-atomic send quota, and no durable job/outbound/idempotency model. This plan fixes correctness first (P0), hardens the schema (P1), then migrates async execution onto **BullMQ** (P2–P7) with Postgres as source of truth, wires the UI to real runtime (P9), and ships a separate worker service (P10).

## Runtime Law

```
API route records intent.   Worker executes intent.   Database records truth.
UI reads database truth.    BullMQ can be rebuilt from database truth.
```

---

## Verified codebase findings (grounding)

| Area | Reality in code | Effect |
|---|---|---|
| Lead scope (BUG-001) | `app/api/leads/route.ts` spreads `...roleScope` then filters; real collision on `assignedToId`/`campaignId`/`OR` | AND-compose fix |
| Seq enroll (002) | `app/api/sequences/[id]/enroll/route.ts` only checks existence | add `canAccessLead` |
| Activity POST (003) | `app/api/activities/route.ts` POST has no access check (GET does) | add check |
| Fake seq state (013/014) | `updateLeadSchema` exposes `sequenceId`/`sequenceStep`; `stage:'sequence_active'` allowed | strip from schema |
| Hard delete (009) | `prisma.lead.delete()`; **no `archivedAt`** | soft archive |
| Task idempotency (017) | plain `prisma.task.update({where:{id}})` | compare-and-set |
| Reassign (018) | PUT changes `assignedToId`, leaves tasks | move pending tasks |
| Timezone (025) | `app/api/tasks/route.ts` uses local `new Date()`; **`User.timezone` already exists** | **API-only fix** |
| Reply pause (015) | `pauseSequence()` in `lib/sequences/engine.ts`, called by `inbox-sync` cron; gap only on manual stage→replied | reuse engine |
| OAuth tokens (026) | `accessToken`/`refreshToken` plaintext; **`lib/crypto.ts` + `ENCRYPTION_KEY` exist** | reuse crypto |
| Quota (024) | `canSendNow()`→`incrementSendCount()` read-then-write | atomic reservation |
| Tenant (010/011) | 17 models `@default("default-tenant")`; **seed never creates Tenant**; **schema AHEAD of migrations** | P1.0 reconcile |
| Send engines (022) | 3 paths: inline `app/api/email/send`, Inngest `lib/inngest/functions.ts`, cron `lib/sequences/smartSend.ts` | consolidate + teardown |
| Tests | **Vitest**; `tests/podScoping.test.ts`, `tests/access-control.test.ts` exist | extend |

## Corrections to the original plan (real holes — do these the corrected way)

- 🔴 **Double-send (orig P4.4) not closed:** provider-send ok → DB mark-`sent` fails → retry sees `sending` (not `sent`) → re-sends. **Set provider idempotency (`Message-ID`/dedup header) BEFORE send; on retry treat `sending` as reconcile (query provider), not resend.**
- 🔴 **Quota double-count:** reservation increments `dailySendCount` once — **remove the second post-send increment.**
- 🔴 **Quota never resets per day:** add `OR dailySendDate <> today` reset branch to the CAS.
- 🔴 **One active enrollment per lead has no DB enforcement:** **partial unique index `WHERE status='active'`** (raw SQL). Extend `SequenceEnrollmentStatus` (`active|paused` today) with `completed|unenrolled`.
- 🟡 **JobRun `@@unique([queueName,jobName,bullJobId])` is dead** (null at create) — use deterministic `dedupeKey @unique`.
- 🟡 **OutboundMessage `idempotencyKey` server-derived**, not optional client value.
- 🟡 **Reply/bounce apply must be idempotent** on provider `messageId`.
- 🟡 **Bounce:** distinguish hard vs soft; only hard-bounce suppresses.
- 🟡 **SuppressionEntry null `campaignId`** breaks PG uniqueness — sentinel or partial index.
- 🟡 **Avoid multi-day BullMQ delayed jobs** — use repair/scan job to (re)enqueue due sends.

---

## Roadmap (the durable task list)

### P0 — Workflow correctness (no new infra; Vitest per item)
- [x] **P0.1** `app/api/leads/route.ts` — `const where={AND:[roleScope,...clauses]}`; validate `stage`/`priority` enums (no `as any`). Tests: `tests/podScoping.test.ts`. *Accept:* TL/leadgen search/campaignId cannot escape scope. *(Already applied to codebase)*
- [x] **P0.2** `sequences/[id]/enroll` — `canAccessLead` + same-tenant + sequence-active before enroll/unenroll.
- [x] **P0.3** `activities` POST — `canAccessLead(leadId)` before create; callback task → lead assignee.
- [x] **P0.4** `email/send` — lead-access check; `min(1)` subject/body in `sendEmailSchema`; suppression gate after P1.4.
- [x] **P0.5** `lib/validation/schemas.ts` — remove `sequenceId`/`sequenceStep`(/`sequenceStatus`) from lead update; forbid create `stage:'sequence_active'`.
- [x] **P0.6** Lead PUT stage→`replied`/`meeting_booked`/`won`/`lost` calls `pauseSequence`/unenrollLead (`lib/sequences/engine.ts`); idempotent if already paused.
- [x] **P0.7** Soft archive: `archivedAt`/`archivedById`/`archiveReason`; DELETE→archive; default lists exclude archived; manager filter to include.
- [x] **P0.8** Task completion CAS: `updateMany({where:{id,status:'pending'}})`; already-done→409; email task → `email_task_completed` (not `email_sent`).
- [x] **P0.9** Lead reassign moves **pending** tasks to new owner; completed keep old; `lead_reassigned` activity + notify both.
- [x] **P0.10** Task day boundaries via `User.timezone` — `lib/dates/timezone.ts` local-day→UTC; manager filter uses target SDR tz. **API-only.**
- [x] **P0.11** Fence Topbar role simulation — never authorize from simulated role; prod banner/hide.

### P1 — Schema hardening (`DIRECT_URL` for migrations)
- [x] **P1.0** Reconcile drift: migrate already-in-schema `Tenant`/`tenantId`/`AiMemory`; seed `upsert`s default tenant **first**.
- [x] **P1.1** Tenant cleanup — explicit `tenantId` on all creates; remove blind defaults where safe; worker rejects tenant mismatch.
- [x] **P1.2** `JobRun` model (durable mirror) — deterministic `dedupeKey @unique`.
- [x] **P1.3** `OutboundMessage` model — server-derived `idempotencyKey @unique`.
- [x] **P1.4** `SuppressionEntry` model — order email→domain→company→campaign→tenant→global; fix null-campaignId uniqueness.
- [x] **P1.5** `SequenceEnrollment` model + **partial unique `WHERE status='active'`**; enum `completed|unenrolled`; lead fields → read-model.
- [x] **P1.6** `ImportBatch` + `ImportRow` models.
- [x] **P1.7** Lead `normalizedEmail/Phone/LinkedIn` + partial-unique dedupe (raw SQL; key = `tenant+campaign+normalizedEmail`).
- [x] **P1.8** `SequenceStep @@unique([sequenceId, order])`; order 1..n no gaps; no step mutation while active enrollments; `version` for clone-on-edit.
- [x] **P1.9** Encrypt `accessToken`/`refreshToken` via `lib/crypto.ts`; backfill; **drop plaintext columns after**; never `select` tokens to UI.

### P2 — BullMQ foundation
- [x] Install `bullmq` + `ioredis`; create `lib/bullmq/{connection,types,queues,jobOptions,enqueue,events,index}.ts`, `workers/{index,healthcheck}.ts`, `scripts/{worker-dev,worker-start}.cjs`.
- [x] `lib/workflows/*` — workflow definitions for multi-step processes.
- [x] **Workers use `DIRECT_URL`** (TCP). Queues, default job options, `maintenance.healthcheck` smoke.

### P3 — Sequence worker
- [x] Jobs `enroll/advance/pause/unenroll/rebuild`; enroll creates `SequenceEnrollment` (one-active via P1.5 index); advance = CAS on `currentStep`; clone-on-edit when active enrollments exist.

### P4 — Email worker (single send path)
- [x] All sends → `OutboundMessage` + `email.send`. Remove inline send + smartSend + Inngest send.
- [x] Provider idempotency (`sending`-on-retry ⇒ reconcile not resend); **one** atomic quota increment with date-aware reset; suppression gate.
- [x] Hard-vs-soft bounce handling (deferred to P6).

### P5 — Import worker
- [x] `import.parse/chunk/commit`; scoped dedupe (`duplicate_exists_outside_visible_scope`, no ids leaked); 10k rows non-blocking; row-level errors.

### P6 — Sync / reply / bounce worker
- [x] Port `inbox-sync` into `sync.worker`; `apply-reply`/`apply-bounce` idempotent on provider `messageId`; hard-bounce → `SuppressionEntry`; reply → `sequence.pause`.

### P7 — Reminder / notification / maintenance
- [x] `reminder.due`, `digest.daily`, repair jobs (orphans, stale `sending`, stuck `running`, missing delayed jobs, reassignment drift) — idempotent + audit.

### P8 — (optional) Premium data model
- [x] **Phase 1:** Add `Account` model; add `accountId` + `engagementScore` to Lead; rename `priority` → `crmPriorityScore`.  Migration populates Account from existing Lead companies.
- [x] **Phase 2:** Add `Contact` model (person-level dedup); add `contactId` FK to Lead. Migration populates Contact from existing Lead data. Lead creation paths create/find Contact first. Person fields retained on Lead for backward compat (`lead.contact.firstName` available for new code).

### P9 — UI wiring (no demo/fake state)
- [x] Lead/Task/Sequence/Import/Email surfaces read real runtime; add `/admin/{jobs,outbound,imports,worker-health}`.

### P10 — Deployment (the runtime fork)
- [ ] Managed Redis (Upstash/etc); separate always-on worker host (Railway/Render/Fly/VM) running `workers/index.ts`; web stays on Vercel. Package scripts; `EMAIL_SEND_DRY_RUN=true` until proven. *(Runbook: `docs/DEPLOY.md`.)*
- [x] **Teardown (Inngest):** removed `lib/inngest/*`, `app/api/inngest/route.ts`, and the `inngest` dep. The scheduled auto-send (formerly `crm/task.execute`) is now a delayed BullMQ `sequence.execute-task` job → `workers/sequence.ts:handleExecuteTask`, enqueued from `lib/sequences/engine.ts`. Rebuildable via the `JobRun` mirror. Tests: `tests/sequence-execute.test.ts`.
- [ ] **Teardown (smartSend):** retire the `lib/sequences/smartSend.ts` cron scanner once the worker path is proven in production.

### P11 — Verification
- [ ] Vitest unit (scope compose, lead-update can't mutate seq, task CAS, suppression, quota reservation, tz boundaries) + integration + worker + 10–20 SDR pilot smoke.

---

## Guardrails (forbidden / required)

**Forbidden:** direct provider send from API routes · `email_sent` without provider success · sequence-field mutation via generic Lead API · hard delete for archive · fake demo data as runtime dependency · blind tenant defaults in runtime writes · BullMQ-only state for UI truth · sequence-step deletion while active enrollments exist · sending without suppression check · any non-idempotent worker job.

**Required:** every worker writes `JobRun` progress · every state transition writes an Activity/audit · every send uses `OutboundMessage` · every delayed job rebuildable from DB · every endpoint checks access before enqueueing · every schema change has acceptance tests · every runtime path is wired to UI or an admin UI.

## Recommended order

`P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P9 → P10 → P11`, then optional `P8`.
Do **not** start email live-send; keep `EMAIL_SEND_DRY_RUN=true` until suppression, idempotency, counters, and admin visibility are verified.
