---
description: Intended technical architecture, file structure, database design, auth strategy, and integration patterns for the Telestar CRM
globs: "**/*.ts, **/*.tsx, **/*.js, **/*.jsx, **/prisma/**, **/drizzle/**, **/supabase/**"
alwaysApply: true
---

# Architecture — Telestar SDR CRM

> Pre-development. Update this file to reflect what was actually built once the app is scaffolded.

## Stack

Next.js (App Router + API routes) · Node.js · PostgreSQL · Prisma **or** Drizzle ORM ·
React · Tailwind CSS · lucide-react · recharts (charts in Team View)

**Database strategy:** Local PostgreSQL for MVP → Supabase (hosted PostgreSQL) for production.
Same engine, same schema — only `DATABASE_URL` changes. Write standard SQL; no local-only
features that won't run on Supabase.

## Intended File Layout

```
/app (or /pages)      → Next.js routes and page components
/components           → Reusable UI, split by feature area:
  /leads  /sequences  /tasks  /templates  /team
/lib                  → DB client, utilities, shared helpers
/styles               → Global CSS
/public               → Static assets (logo, images)
/prisma (or /drizzle) → Schema + migration history
/supabase             → Seed scripts, RLS policies
```

## Key Database Tables

Full data models in SKILL.md §2–§9 and §17–§24.

```
leads            campaigns        activities
sequences        users            email_accounts
sequence_steps   clients          notifications
tasks            notes
templates        reminders
```

Indexes on: `stage`, `assignedTo`, `dueDate`, `campaignId`.

`notifications` — in-app notification records (recipient userId, type, text, linkTo, isRead).
Full schema: SKILL.md §23. Auto-created by the same events that trigger the notification bell.

## Auth

| Phase       | Approach                                          |
|-------------|---------------------------------------------------|
| MVP (local) | NextAuth.js or custom session — email/password, HTTP-only cookie. No self-registration; Director creates accounts. |
| Production  | Supabase Auth + Row Level Security (RLS) enforcing the role matrix at the DB layer. |

## Role Hierarchy

`Director → Floor Manager → Team Lead → SDR`

DB role enum: `"director" | "floor_manager" | "team_lead" | "sdr"`.
**Son (BD Manager) maps to the `director` role** in the database — there is no
`bd_manager` enum value. BD Manager is a title, not a distinct permission level.

Pod scoping is driven by `managerId` on the `users` table (FK → the user's direct
manager). Team Leads see SDRs where `users.managerId = teamLead.id`. Floor Managers
see all users under their Team Leads. Queries must walk this relationship to scope data.

SDRs see only their own leads and tasks. Full permissions matrix: SKILL.md §17.
Enforced at the query layer in MVP; at RLS in production.

## Email Integration Pattern

Provider-agnostic `EmailService` abstraction with per-provider adapters behind it:
- Gmail → OAuth 2.0 (Gmail API)
- Outlook/Exchange → Microsoft Graph API
- Roundcube / other → IMAP/SMTP (manual config, credentials encrypted at rest)

Each SDR connects their own email account(s) in Settings. Details: SKILL.md §16.
Use this same adapter pattern for future integrations (VoIP, Telegram, etc.).

**Graceful degradation:** if an SDR has not connected an email account, all non-email
workflows (phone, LinkedIn, WhatsApp, notes, tasks) must still work normally. Never
block the CRM for missing email config — show a "Connect email" prompt on email-specific
actions only.

## Activity Auto-Logging (Cross-Cutting Pattern)

Every meaningful SDR action MUST create an `activities` record automatically — the
backend is responsible, not the frontend. This table is the source of truth for the
Team View leaderboard, coaching, and reporting.

Auto-log an activity when:
- A task is completed or skipped
- A lead's stage changes
- A note is added to a lead
- An email, call, LinkedIn, or WhatsApp action is logged
- A lead is enrolled in or completes a sequence
- A meeting is booked

The `type`, `userId`, `leadId`, `channel`, and `metadata` fields must all be populated
correctly. Metadata shapes per type: SKILL.md §19.

## Pipeline Stages

```
New → Sequence Active → Replied → Meeting Booked → Won / Lost
```

## Critical UX Architecture Decisions

Non-obvious decisions that directly affect routing and component structure:

- **Lead detail is a slide-over panel** — clicking any lead anywhere opens a right-side
  slide-over. It is **never** a separate page or route. No `/leads/[id]` page exists.
- **Kanban and list view share the same `/leads` route** — toggle is component state
  (or a URL param like `?view=kanban`), not separate routes.
- **Task dashboard is the root `/` route** — three tabs (Today / Yesterday / Overdue)
  on one page, not three pages.

## State Management

React `useState` and `useReducer` for local state. React Context for shared/cross-component
state (current user session, active campaign filter, notification count).

**No external state libraries** (no Redux, Zustand, Jotai, MobX, etc.) unless the user
explicitly requests one.

## Language & Tooling

- **TypeScript** preferred. JavaScript acceptable if scaffolded without TS.
- **Package manager:** npm (not yarn or pnpm).
- **API layer:** Next.js API routes for all server-side logic — keeps the backend explicit
  and queryable. Avoid Server Actions for MVP; they complicate debugging.
- **Components:** split by feature area under `/components` — `leads/`, `sequences/`,
  `tasks/`, `templates/`, `team/`. No monolithic page-level components.
