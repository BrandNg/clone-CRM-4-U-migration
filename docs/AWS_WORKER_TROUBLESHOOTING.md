# AWS Worker / Redis Troubleshooting — "Send Now works but nothing sends"

**Symptom:** pressing *Send Now* (run-now) returns OK in the UI, but the email never sends
and the job stays at `status='queued'` (never `active`).

**Root cause class:** the API only *records intent* (writes a `JobRun` row + enqueues to Redis)
and returns 200. The **worker** — a separate always-on process — is what actually executes the
send. If the worker isn't running, or the web app and worker point at different/unreachable
Redis instances, jobs pile up at `queued` forever.

> Runtime law: *API records intent → worker executes → DB records truth.* A stuck `queued` row
> means the "worker executes" link is broken. This is **operational**, not a code bug — the code
> changes in this PR make run-now *correct*, but the worker must be running for anything to send.

## 1. Read the JobRun table (fastest signal)

In the DB (or the `/admin/jobs` page):

```sql
SELECT status, count(*) FROM "JobRun"
WHERE "jobName" = 'sequence.execute-task'
GROUP BY status;
```

- **Rows stuck at `queued`, none `active`** → worker not consuming. Go to step 2.
- **Rows flipping to `failed`** → worker runs but the handler throws. Check worker logs for the
  `failedReason`; usually a DB URL/driver issue (see step 4) or a provider send error.
- **No rows created at all after Send Now** → producer-side enqueue failing (web app can't reach
  Redis, or the route 500'd). Check web app logs.

## 2. Is the worker container actually up?

```bash
docker compose ps            # is the `worker` service "Up"?
docker compose logs worker | tail -50
```

Healthy worker logs show on boot:

```
[worker] REDIS_URL=set  DIRECT_URL=set
[worker] ready
```

If the container is missing, it was never brought up:

```bash
docker compose -f docker-compose.yml -f docker-compose.aws.yml up -d web worker caddy redis
```

If it's crash-looping, `scripts/worker-start.cjs` exits when `REDIS_URL` **or** `DIRECT_URL` is
missing — set both (step 3/4).

## 3. Redis must be shared and reachable

Both the **web app (producer)** and the **worker (consumer)** must use the **same** `REDIS_URL`.

- Not set → `lib/bullmq/connection.ts` falls back to `redis://localhost:6379`, which resolves to
  each container's own (empty) localhost → producer and consumer never meet. **Always set it.**
- **ElastiCache with in-transit encryption** → the URL must use the TLS scheme: `rediss://…`.
  A plain `redis://` against a TLS-required endpoint never connects.
- Confirm reachability from inside the worker container:

```bash
docker compose exec worker sh -lc 'echo $REDIS_URL'
# then, if redis-cli is available:
docker compose exec worker sh -lc 'redis-cli -u "$REDIS_URL" ping'   # → PONG
```

The connection now retries indefinitely with capped backoff, so a late-starting Redis will be
picked up automatically once reachable (previously it gave up after ~10 attempts).

## 4. Worker DB URL

The worker sets `IS_WORKER=true` and uses `DIRECT_URL` (a direct TCP Postgres connection) for its
multi-step transactions. Requirements:

- `DIRECT_URL` **must be set** (worker refuses to start otherwise).
- It must be a **direct** endpoint, not a pgBouncer/RDS-Proxy pooled host — interactive
  transactions (used by the import worker) break on a pooled endpoint.

## 5. End-to-end pipeline check

```bash
npm run worker:healthcheck
```

Enqueues a health job; if the worker + Redis + DB are wired correctly it processes it and the
corresponding `JobRun` flips `queued → active → completed`. If it stays `queued`, re-check steps 2–4.

## 6. (Separate issue) inbound mail + auto-send scanner need a scheduler

`/api/cron/*` routes (inbox sync, smart-send scan) were previously driven by Vercel Cron. On AWS
there is no equivalent unless a host scheduler curls them, e.g.:

```bash
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sequence-engine
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/inbox-sync
```

Also set `SEQUENCE_AUTOSEND_ENABLED="true"` to enable the unattended scanner (it defaults off).
Note: **Send Now / run-now does NOT depend on this cron** — it enqueues directly. The cron only
matters for received-mail sync and unattended auto-send.
