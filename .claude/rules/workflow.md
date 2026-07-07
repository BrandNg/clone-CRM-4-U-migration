---
description: Behavioral rules for how Claude should approach work on the Telestar CRM — when to use which skills, communication style, and constraints
alwaysApply: true
---

# Workflow — How to Work on This Project

## Building or Modifying the CRM

- **Always read `SKILL.md` before generating or modifying code.** It is the authoritative
  product spec: data models, UI requirements, build sequence, iteration patterns, and all
  24 module sections. Never assume — check the spec.
- **When modifying existing code, re-read the current source files first.** Never rely on
  stale context from an earlier turn in the conversation.
- Use the Telestar brand palette (see `brand-design.md`). Every pixel should feel on-brand.
- Prioritize working functionality over pixel-perfection.
- Seed data spec is in SKILL.md §14. Use **June 3, 2026** as the "today" anchor for all
  seed dates (yesterday = June 2, overdue tasks = May 27–June 2).
- Use `DATABASE_URL` from `.env.local`. Never hardcode connection strings.
- Write standard PostgreSQL — must run on both local PG and Supabase without changes.
- If asked to build only one module, still include the navigation shell so it feels like
  part of the full app.
- **Leverage ECC-native skills loaded in `.claude/skills/ecc/`:**
  - For database operations, reference [prisma-patterns](file:///.claude/skills/ecc/prisma-patterns/SKILL.md) (handling the `@updatedAt` bulk-write trap, connection singletons, and `findFirstOrThrow` soft-delete query trap).
  - For schema alterations, reference [database-migrations](file:///.claude/skills/ecc/database-migrations/SKILL.md) (expand-contract patterns, concurrent indexing).
  - For DB indexing and performance, reference [postgres-patterns](file:///.claude/skills/ecc/postgres-patterns/SKILL.md) (composite index order: equality columns first).
  - For endpoint structure, reference [api-design](file:///.claude/skills/ecc/api-design/SKILL.md) (standard query wrappers and error envelopes).
  - For outreach tasks and mail delivery verification, reference [lead-intelligence](file:///.claude/skills/ecc/lead-intelligence/SKILL.md) and [email-ops](file:///.claude/skills/ecc/email-ops/SKILL.md) (graceful degradation, outbox-pattern checks).

## Build Sequence (Starting from Scratch)

Follow this order (SKILL.md §12) to deliver working value at each stage:

1. Project setup — Next.js init, DB connection, env config, auth scaffolding
2. Shell — sidebar nav, top bar, routing between views
3. Database schema — tables, migrations, seed script
4. Leads — kanban + list view + slide-over panel
5. Tasks — today / yesterday / overdue tabs + task cards
6. Sequences — list page + step builder + enrollment
7. Templates — library + editor + merge fields
8. Notes & Reminders — notes timeline + reminder bell
9. Team View — leaderboard + pipeline funnel + role-based scoping
10. Email integration — provider-agnostic send/receive layer
11. Polish — loading states, empty states, keyboard shortcuts

## Common Iteration Patterns

Quick reference for how to handle extension requests (full table: SKILL.md §13):

| Request | Approach |
|---|---|
| Add a new lead field | Update DB schema + data model + all views that show the field |
| New outreach channel | Add to channel enum + icon map + color map throughout |
| Change pipeline stages | Update stage enum + kanban columns + stage badge colors |
| Add analytics | Extend Team View with recharts components |
| Connect Gmail | Add Gmail API / OAuth adapter to the EmailService layer |
| Connect Outlook | Add Microsoft Graph API adapter to the EmailService layer |
| Connect Roundcube | Add IMAP/SMTP adapter to the EmailService layer |
| Export to spreadsheet | CSV/XLSX generation via API route |
| Import leads from CSV | CSV parser + dedup check + bulk insert via API route (SKILL.md §24) |
| Add role-based permissions | Extend query-layer scoping (MVP) or Supabase RLS (production) |
| Add a new page | New Next.js route + sidebar nav entry + link from top-bar "+ New" if applicable |

## Non-Obvious UX Rules

These affect the daily SDR workflow — getting them wrong breaks the core loop:

- **Phone task → modal:** ✅ Complete on a phone task opens the **Call Logging modal**
  (outcome required). The task does NOT auto-close. Skip bypasses the modal. (SKILL.md §21)
- **LinkedIn / WhatsApp task → Log & Complete:** button label is **"Log & Complete"**, not
  just "Complete". Opens the manual activity logger before closing the task. (SKILL.md §22)
- **Lead detail is always a slide-over panel** — never a separate page or route.
- **One active sequence per lead at a time** — enrolling in a new sequence auto-unenrolls
  from the current one (confirmation modal required).
- **SDRs have no Team View access** — they see a personal stats widget on their Dashboard
  instead (their own activity counts and pipeline summary).

## Generating Operational Content

For scorecards, 1:1 agendas, coaching notes, pipeline reports, and outreach drafts:
→ use the **`telestar-bd-manager`** skill, not this context.

Team context for that skill: Director + 2 Floor Managers + 7 Team Leads + 12 SDRs,
global, multi-client BPO. Son (BD Manager) is the audience.

## Communication Style

- Son manages a live team — keep responses **action-oriented and concise**.
- When in doubt, build and iterate rather than asking clarifying questions.
- Present options only when an architectural decision has genuine tradeoffs.

## Future Integrations

Design decisions should not block these from being added later:

Google Calendar · Gmail API · Microsoft Graph (Outlook) · IMAP/SMTP (Roundcube) ·
Apollo (enrichment) · Sales Navigator · VoIP click-to-call · Telegram · Supabase
Realtime · Supabase Auth

The `EmailService` adapter pattern (SKILL.md §16) is the template for plugging in
new external services without rewriting core logic.
