<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Active initiative — Runtime Hardening + BullMQ migration

The primary bug-fix + update flow for this repo. Any agent (Claude Code, Gemini CLI,
OpenCode, etc.) working on runtime correctness, sequencing, email, import, or workers:

1. Read **`docs/runtime-hardening/STATUS.md`** first — current phase, next unchecked task, blockers.
2. Execute that task from **`docs/runtime-hardening/PLAN.md`** (corrected P0–P11 roadmap with acceptance tests).
3. Tick the checkbox + update `STATUS.md`; commit referencing the task id (e.g. `P0.1`).

Key constraints: Neon HTTP driver has **no interactive transactions** (workers use
`DIRECT_URL`); BullMQ workers run on a **separate always-on host + Redis**, never on
Vercel; reuse existing `lib/crypto.ts` and `lib/sequences/engine.ts`. Claude Code users:
full guardrails are in `.claude/rules/runtime-hardening.md`.
