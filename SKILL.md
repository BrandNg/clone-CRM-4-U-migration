---
name: telestar-sdr-crm
description: >
  Build and iterate on the Telestar SDR CRM — a Next.js fullstack platform
  with PostgreSQL (local) / Supabase (production) backend for BPO SDR teams. Covers lead pipeline
  management (New → Sequence Active → Replied → Meeting Booked → Won/Lost),
  multi-channel sequence builder (Email, Phone, LinkedIn, WhatsApp), daily
  task management (today/yesterday/overdue), email and message template
  drafting, per-lead notes and reminders, and team overview dashboards.
  Trigger on: CRM, lead tracker, pipeline view, sequence builder, task
  dashboard, SDR workspace, template editor, lead stages, outreach sequence,
  contact management, kanban board, daily tasks, overdue tasks, team dashboard,
  SDR platform, or any request to build, modify, or extend the Telestar CRM
  application — even if the user just says "update the CRM" or "add a feature
  to the platform." Also trigger when the user asks to build any SDR tooling,
  sales development workspace, or BPO lead management interface for Telestar.
---

# Telestar SDR CRM — Platform Skill

Build a production-grade SDR workspace for **Telestar**, a BPO company running
SDR-as-a-Service. This is the team's daily operating system — every pixel
matters because SDRs live in this tool 8 hours a day.

**Tech stack:** Next.js (fullstack with API routes) · PostgreSQL · Node.js
runtime · React · TailwindCSS (if applicable)

**Database strategy:** Local PostgreSQL for MVP development → Supabase
(hosted PostgreSQL) for production. Same engine, same schema — just swap
the connection string.

**Deployment:** MVP runs locally (`npm run dev` + local PostgreSQL), then
migrates to Supabase + hosted infrastructure after validation.

---

## 1. Product Context

**Who uses it:** A BPO SDR organization at Telestar structured as:

```
Director (1)
 └── Floor Managers (2)
      └── Team Leads (7)
           └── SDRs (12)
```

Plus 1 BD Manager (Son) who leads the team operationally, manages clients,
coaches reps, and reports on performance. Son functions at the Director level
but focuses on business development and client relationships.

**Core problem:** SDRs need one place to manage leads, run multi-channel
sequences, complete daily tasks, draft outreach, and take notes — without
switching between spreadsheets, email, and messaging apps.

**Email tooling note:** The team uses **multiple email platforms** depending
on client and campaign: Gmail, Microsoft Mail (Outlook/Exchange), Roundcube,
and other mail clients. The CRM must be email-backend agnostic and able to
integrate with any of these.

**Workspace model:** Each SDR sees their own leads by default (personal
workspace). A "Team View" tab shows aggregate data across all SDRs.
A "My Leads" filter lets each SDR focus on their assigned pipeline.
Floor Managers and Team Leads get scoped views of their respective pods.

---

## 2. Lead Pipeline

Leads flow through five stages. The pipeline is the backbone of the CRM.

```
New → Sequence Active → Replied → Meeting Booked → Won/Lost
```

### Lead data model

Every lead record contains at minimum:

| Field           | Type       | Notes                                        |
|-----------------|------------|----------------------------------------------|
| id              | string     | Unique identifier (uuid or nanoid)           |
| firstName       | string     | Required                                     |
| lastName        | string     | Required                                     |
| company         | string     | Required                                     |
| title           | string     | Job title / role                              |
| email           | string     | Primary email                                |
| phone           | string     | Phone number                                 |
| linkedIn        | string     | LinkedIn profile URL                         |
| whatsApp        | string     | WhatsApp number                              |
| stage           | enum       | One of the five pipeline stages               |
| assignedTo      | string     | SDR user ID                                  |
| campaignId      | string     | FK → Campaign this lead belongs to           |
| sequenceId      | string     | Active sequence (null if none)               |
| sequenceStep    | number     | Current step in the sequence                 |
| source          | string     | Where the lead came from                     |
| tags            | string[]   | Freeform tags for filtering                  |
| priority        | enum       | hot / warm / cold                            |
| lastContactedAt | datetime   | Timestamp of most recent touchpoint          |
| nextTaskDue     | datetime   | When the next action is due                  |
| createdAt       | datetime   | When the lead was added                      |
| updatedAt       | datetime   | Last modification                            |

### Pipeline views

Provide **two views** of the pipeline, togglable by the user:

1. **Kanban board** — columns for each stage, leads as draggable cards.
   Each card shows: name, company, priority badge, last contacted relative
   time, and the next task type icon (📧 📞 💼 💬).
2. **List/table view** — sortable, filterable table with all lead fields.
   Include bulk actions (change stage, assign to SDR, add to sequence).

Both views support:
- Filter by: stage, priority, assigned SDR, tags, source, date range
- Search by: name, company, email
- Sort by: created date, last contacted, next task due, priority

---

## 3. Sequence Builder

Sequences are multi-step, multi-channel outreach cadences. An SDR creates
a sequence once, then enrolls leads into it.

### Sequence data model

```
Sequence {
  id: string
  name: string
  description: string
  steps: SequenceStep[]
  isActive: boolean
  createdBy: string
  createdAt: datetime
  enrolledCount: number
}

SequenceStep {
  id: string
  order: number
  channel: "email" | "phone" | "linkedin" | "whatsapp"
  delayDays: number          // days to wait after previous step
  delayHours: number         // hours to wait (finer control)
  templateId: string | null  // linked template (optional)
  instructions: string       // what to do on this step
  autoComplete: boolean      // mark done automatically or needs manual check
}
```

### Sequence UI requirements

- **Sequence list page:** shows all sequences with name, step count,
  enrolled leads, active/paused status, and quick actions (edit, duplicate,
  archive).
- **Sequence builder:** visual step-by-step editor. Each step is a card
  showing: step number, channel icon+label, delay, linked template preview,
  and instructions. Steps can be reordered via drag or up/down arrows.
  New steps are added via a "+ Add Step" button that lets the user pick
  a channel first.
- **Enrollment:** from a lead detail view or bulk from the pipeline, the
  SDR can enroll a lead into a sequence. The CRM tracks which step the
  lead is on and when the next step is due.

### Enrollment rules

- A lead can only be in **one active sequence at a time**. Enrolling in a
  new sequence auto-unenrolls from the current one — a confirmation modal
  shows which step the lead was on and what will be skipped.
- Unenrolling does **not** delete completed step history; past activity
  remains in the lead's activity feed.

### Auto-unenrollment triggers

| Trigger                                | Action                                                     |
|----------------------------------------|------------------------------------------------------------|
| Lead replies to an outreach email      | Pause sequence · create "Handle Reply" task for SDR        |
| Email hard bounce                      | Pause sequence · flag email as invalid · notify SDR        |
| Lead stage → Meeting Booked            | Pause sequence · SDR decides whether to continue           |
| Lead stage → Won or Lost               | End sequence (archived)                                    |
| SDR manually unenrolls                 | End sequence (archived)                                    |
| All steps completed                    | Mark sequence complete · notify SDR                        |

### Step execution rules

- Steps with `autoComplete: true` auto-advance when the task is checked off.
- Steps with `autoComplete: false` (calls, LinkedIn, WhatsApp) require the
  SDR to log an outcome before the step advances.
- Skipping a step advances the sequence to the next step; the skip is logged
  as an activity record.
- If a sequence step task is overdue by 3+ days, the lead card shows a
  ⚠️ at-risk indicator visible in the pipeline view and in Team View.

### Channel indicators

Use consistent icons and color coding throughout:
- 📧 **Email** — blue accent
- 📞 **Phone/Call** — green accent
- 💼 **LinkedIn** — indigo/navy accent
- 💬 **WhatsApp** — emerald/teal accent

---

## 4. Task Management

Tasks are the SDR's daily heartbeat — this is the first screen they see.

### Task data model

```
Task {
  id: string
  leadId: string
  type: "email" | "phone" | "linkedin" | "whatsapp" | "manual"
  title: string
  description: string
  dueDate: datetime
  completedAt: datetime | null
  status: "pending" | "completed" | "skipped"
  sequenceId: string | null   // if generated by a sequence
  sequenceStep: number | null
  priority: "high" | "medium" | "low"
  createdAt: datetime
}
```

### Task views — three tabs, always visible

| Tab             | Shows                                                     |
|-----------------|-----------------------------------------------------------|
| **Today**       | All tasks due today, sorted by priority then by time       |
| **Yesterday**   | Tasks that were due yesterday (completed ✓ and missed ✗)  |
| **Overdue**     | All incomplete tasks with dueDate < today, oldest first    |

Each task card displays:
- Channel icon + task type label
- Lead name + company (clickable → opens lead detail)
- Due time or "X days overdue" badge
- Quick actions: ✅ Complete, ⏭ Skip, 📝 Add Note, 🔁 Reschedule

> **Phone tasks:** ✅ Complete opens the Call Logging modal (§21) instead
> of auto-completing. The task only closes after an outcome is selected.
>
> **LinkedIn / WhatsApp tasks:** ✅ Complete opens the Manual Activity
> Logger (§22). Skip bypasses the modal on all non-email channel types.

The task dashboard header shows summary counters:
```
Today: 14 tasks (8 done, 6 remaining)  |  Overdue: 3  |  Completed yesterday: 22/25
```

---

## 5. Templates

SDRs draft and reuse message templates for each channel.

### Template data model

```
Template {
  id: string
  name: string
  channel: "email" | "linkedin" | "whatsapp" | "phone"
  subject: string | null    // email only
  body: string              // supports {{firstName}}, {{company}} etc.
  category: string          // e.g., "cold outreach", "follow-up", "break-up"
  createdBy: string
  createdAt: datetime
  updatedAt: datetime
}
```

### Template UI requirements

- **Template library:** filterable grid/list by channel and category
- **Template editor:** side panel or modal with:
  - Name, channel selector, category tag
  - Subject line field (shown only for email)
  - Rich text body with merge field insertion toolbar
    (buttons for {{firstName}}, {{lastName}}, {{company}}, {{title}})
  - Preview pane showing the template with sample data filled in
- **Usage from sequences:** when building a sequence step, the SDR can
  pick a template from the library or write inline instructions

### Merge fields supported

```
{{firstName}}, {{lastName}}, {{company}}, {{title}},
{{email}}, {{phone}}, {{sdrName}}, {{sdrTitle}}
```

---

## 6. Notes & Reminders

### Notes

Every lead has a notes timeline — a reverse-chronological feed of
freeform notes attached to the lead record.

```
Note {
  id: string
  leadId: string
  content: string        // plain text or light markdown
  createdBy: string
  createdAt: datetime
  isPinned: boolean      // pinned notes show at top
}
```

- Notes appear in the lead detail side panel
- Quick-add note from the task card (📝 action)
- Pinned notes are always visible at the top of the lead detail

### Reminders

Reminders are time-triggered alerts tied to a lead or standalone.

```
Reminder {
  id: string
  leadId: string | null  // can be standalone
  text: string
  dueAt: datetime
  isDismissed: boolean
  createdAt: datetime
}
```

- Reminders appear as a notification badge in the top nav
- A "Reminders" dropdown shows upcoming and overdue reminders
- Creating a reminder: from lead detail, from task view, or from
  a global "+ Reminder" button

---

## 7. Team View (Manager Dashboard)

The Director, Floor Managers, and BD Manager need a bird's-eye view across
the organization. Team Leads see their pod's performance.

### Team view shows:

1. **Activity leaderboard:** table of all SDRs ranked by tasks completed
   today, this week, this month — with columns for calls, emails,
   LinkedIn touches, WhatsApp messages, meetings booked.

2. **Pipeline summary:** total leads per stage across the team,
   visualized as a horizontal funnel or stacked bar.

3. **Overdue alert:** list of SDRs with overdue tasks, sorted by
   count (most overdue first).

4. **Sequence performance:** which sequences are running, how many
   leads are enrolled, reply rates if trackable.

5. **Client report export (BPO):** per-campaign summary exportable as
   CSV or PDF showing meetings booked, leads contacted, sequence
   performance, and activity breakdown. Designed to be shared directly
   with the BPO client without exposing internal team data.

### Role-based views

- **Director / BD Manager:** sees all SDRs, all campaigns, full org metrics
- **Floor Managers:** see the SDRs and Team Leads under their floor
- **Team Leads:** see only their pod's SDRs and metrics
- **SDRs:** personal workspace only (their own leads and tasks)

### Filtering

- Filter by SDR to drill into one person's pipeline and tasks
- Filter by Team Lead or Floor Manager to scope by pod
- Filter by date range for activity metrics
- Filter by client/campaign if leads have source tags

---

## 8. Navigation & Layout

### Sidebar navigation (always visible)

```
🏠  Dashboard (task hub — default landing)
👥  Leads (pipeline kanban + list)
🔄  Sequences
📝  Templates
👁  Team View
⚙️  Settings
```

### Top bar

- Search (global — searches leads, templates, notes)
- "+ New" dropdown (New Lead, New Task, New Reminder)
- 🔔 Reminders bell with badge count
- SDR profile avatar + name

### Lead detail panel

Opens as a **slide-over panel** from the right (not a separate page)
when clicking a lead anywhere in the app. Contains:

1. Lead header: name, company, title, stage badge, priority
2. Contact info: email, phone, LinkedIn, WhatsApp (clickable)
3. Active sequence progress bar (if enrolled)
4. Notes timeline (with add-note input)
5. Task history (completed + upcoming)
6. Reminders tied to this lead
7. Quick actions: change stage, reassign, edit, archive

---

## 9. Data Persistence

### Database strategy: Local PostgreSQL → Supabase

The CRM uses **PostgreSQL** as its database engine across both phases:

| Phase          | Database                    | Connection                          |
|---------------|-----------------------------|------------------------------------||
| **MVP (local)** | Local PostgreSQL instance   | `DATABASE_URL` in `.env.local`      |
| **Production**  | Supabase (hosted PostgreSQL) | Supabase connection string          |

Since Supabase **is** PostgreSQL, the migration is seamless — same schema,
same queries, same migrations. Write all SQL and queries against standard
PostgreSQL; avoid local-only features that won't work on Supabase.

### Database tables (map to data models above)

```
leads              → lead records (includes campaignId FK)
sequences          → sequence definitions
sequence_steps     → individual steps within sequences
tasks              → SDR tasks
templates          → message templates
notes              → per-lead notes
reminders          → time-triggered alerts
users              → user profiles, roles (director/floor_manager/team_lead/sdr)
clients            → BPO client companies
campaigns          → client campaigns (FK → clients)
activities         → activity log for reporting (FK → users, leads)
email_accounts     → connected email providers per user
```

### Local PostgreSQL setup (MVP phase)

- Install PostgreSQL locally (or use Docker: `docker run -p 5432:5432 postgres`)
- Create a `telestar_crm` database
- Run migration scripts from `/supabase` or `/db` directory
- Seed demo data for development
- Connect via `DATABASE_URL=postgresql://user:pass@localhost:5432/telestar_crm`

### Supabase migration (production phase)

When ready to go online:
- Create a Supabase project
- Run the same migration scripts against Supabase
- Enable **Row Level Security (RLS)** for workspace isolation
  (SDRs see only their leads, Team Leads see their pod, etc.)
- Enable Supabase Auth for user authentication and role management
- Enable Supabase Realtime for live updates (task completion, lead changes)
- Switch `DATABASE_URL` to the Supabase connection string

### Best practices (both phases)

- Use a database migration tool (e.g., Prisma, Drizzle, or raw SQL files)
  to keep schema changes versioned and reproducible
- Create database indexes on frequently filtered columns
  (stage, assignedTo, dueDate, clientId)
- Include an "Export Data" option in settings (downloads CSV/JSON)
- Include an "Import Data" option to bulk-upload leads from CSV
- Include a "Seed Demo Data" function for development/demo that creates
  20 realistic leads, 3 sequences, 15 tasks, and 5 templates

---

## 10. Design Direction

### Aesthetic: Industrial-utilitarian SaaS

This is a **work tool**, not a marketing site. Prioritize information
density, scannability, and speed. Think: Linear, Attio, HubSpot.

- **Typography:** Use a clean sans-serif system stack or a distinctive
  workhorse font. Body text 13-14px for density. Monospace accents for
  IDs and timestamps.
- **Color palette:** Dark sidebar using brand dark (`#0A0A0A` to `#1A1A1A`)
  with a light main content area. Use the **Telestar brand palette**:
  - **Fire red `#D42B1E`** — primary action color (buttons, active states)
  - **Flame orange `#E8611A`** — secondary accent (hover states, badges)
  - **Gold/amber `#F5A623`** — highlights, success states (won deals)
  - **Hot yellow `#FEDD44`** — sparingly, for attention-grabbing elements
  Stage badges use semantic colors:
  - New = gray
  - Sequence Active = blue
  - Replied = amber/yellow
  - Meeting Booked = emerald/green
  - Won = green with checkmark
  - Lost = red with X
- **Spacing:** Tight but breathable. 12-16px padding in cards. 8px gaps
  in lists. Dense tables with 36-40px row height.
- **Borders:** 1px solid, muted. No heavy shadows — use subtle
  elevation only for modals and slide-over panels.
- **Icons:** Use Lucide icons consistently. Every channel, stage, and
  action gets a recognizable icon.

### Responsive considerations

Optimize for **desktop-first** (1280px+ viewport). The CRM is a desktop
work tool. On narrower screens, collapse the sidebar to icons-only and
stack the kanban columns vertically.

---

## 11. Technical Stack & Constraints

### Runtime & Framework

- **Runtime:** Node.js
- **Framework:** Next.js (fullstack — pages/app router + API routes)
- **Language:** JavaScript / TypeScript
- **Package manager:** npm

### Frontend

- **UI library:** React (via Next.js)
- **Styling:** CSS (or Tailwind if user prefers)
- **Icons:** lucide-react
- **Charts:** recharts (team view analytics)
- **State management:** React `useState`, `useReducer`, and
  React Context for shared state. No external state libraries (Redux,
  Zustand, etc.) unless explicitly requested.

### Backend & Database

- **Database:** PostgreSQL (local for MVP → Supabase for production)
- **ORM / Query layer:** Prisma or Drizzle (recommended for type-safe
  queries and migration management across local ↔ Supabase)
- **Auth (MVP):** Simple session-based auth or NextAuth.js
- **Auth (Production):** Supabase Auth (email/password, role-based access)
- **API:** Next.js API routes for server-side logic
- **Realtime (Production):** Supabase Realtime for live updates
- **File storage (Production):** Supabase Storage (attachments, imports)

### Email Integration Architecture

The team uses **multiple email platforms** (Gmail, Microsoft Mail/Outlook,
Roundcube, and others). The CRM must:

- Abstract email sending/receiving behind a provider-agnostic interface
- Support connecting multiple email accounts per SDR
- Store email provider config per user (SMTP/IMAP settings or OAuth tokens)
- Future-proof for adding new mail providers without rewriting core logic

### Development & Deployment

- **Local dev:** `npm run dev` (Next.js dev server) + local PostgreSQL
- **MVP phase:** everything runs locally — no cloud dependencies needed
- **Production:** migrate database to Supabase, deploy app to hosted
  infrastructure (Vercel, VPS, or similar) after MVP validation
- **Environment variables:** use `.env.local` for `DATABASE_URL` and
  other secrets — never commit secrets to the repo
- **Migration:** switching from local PG to Supabase requires only
  changing `DATABASE_URL` and enabling Supabase-specific features (RLS,
  Auth, Realtime)

### Code Organization

```
/app (or /pages)     → Next.js routes and page components
/components          → Reusable UI components
/lib                 → Utilities, Supabase client, helpers
/api                 → API route handlers
/styles              → Global styles
/public              → Static assets (logo, images)
/supabase            → Migration files, seed scripts
```

Keep components focused and reusable. Avoid monolithic files — split by
feature area (leads/, sequences/, tasks/, templates/, team/).

---

## 12. Build Sequence

When building or rebuilding the CRM, follow this order to deliver
working value at each stage:

1. **Project setup:** Next.js init, local PostgreSQL connection, env config,
   auth scaffolding
2. **Shell:** sidebar nav, top bar, routing between views, global search
3. **Database schema:** PostgreSQL tables, migrations, seed script
4. **Leads:** data model, pipeline kanban + list view, lead detail panel
5. **Tasks:** task model, today/yesterday/overdue tabs, task cards
6. **Sequences:** sequence model, list page, step builder, enrollment
7. **Templates:** template model, library, editor with merge fields
8. **Notes & Reminders:** note timeline, reminder bell + dropdown
9. **Team View:** activity table, pipeline funnel, overdue alerts,
   role-based scoping (Director → Floor Manager → Team Lead → SDR)
10. **Email integration:** provider-agnostic email send/receive layer
11. **Polish:** loading states, empty states, animations, keyboard shortcuts

If the user asks for a specific module only, build just that module but
keep the navigation shell so it feels like part of the larger app.

---

## 13. Iteration Patterns

The user will come back to extend, fix, or restyle the CRM. Common
requests and how to handle them:

| Request                        | Approach                                      |
|-------------------------------|-----------------------------------------------|
| "Add a new field to leads"    | Update PostgreSQL schema + model + all views   |
| "New sequence channel"        | Add to channel enum + icon map + color map     |
| "Change the pipeline stages"  | Update the stage enum + kanban columns + badges |
| "Add reporting / analytics"   | Extend team view with recharts components      |
| "Connect to Google Calendar"  | Add Google Calendar API integration via API routes |
| "Connect to Gmail"            | Add Gmail API / SMTP integration to email layer |
| "Connect to Outlook"          | Add Microsoft Graph API integration to email layer |
| "Connect to Roundcube"        | Add IMAP/SMTP integration to email layer       |
| "Export to spreadsheet"       | Generate CSV/XLSX export via API route          |
| "Import leads from CSV"       | Build CSV parser + bulk insert via API route    |
| "Make it mobile-friendly"     | Collapse sidebar, stack views, larger tap targets|
| "Add a new view/page"         | Add Next.js route + sidebar nav entry           |
| "Add role-based permissions"  | Extend PostgreSQL RLS (or Supabase RLS in prod) + auth middleware |

When modifying an existing build, always re-read the current source files
before making changes — never rely on stale context from an earlier turn.

---

## 14. Seed Data Specification

When generating demo data, make it realistic for a BPO SDR team:

- **Users:** Seed the full org hierarchy:
  - 1 Director, 2 Floor Managers, 7 Team Leads, 12 SDRs
  - Use realistic names, assign `managerId` relationships
  - Include Son as BD Manager (director-level role)
- **Clients:** 3-4 active clients across industries (SaaS, fintech,
  logistics, e-commerce)
- **Campaigns:** 1-2 campaigns per client, assigned to specific SDRs
- **Lead companies:** Mix of real-sounding B2B companies across
  industries (SaaS, fintech, logistics, e-commerce, healthcare tech)
- **Lead names:** Diverse, international names reflecting SEA + global
  prospects
- **Sequences:** Include at least:
  1. "Cold Outreach — 5 Step" (email → email → call → LinkedIn → email)
  2. "Warm Re-engage" (email → WhatsApp → call)
  3. "Post-Meeting Follow-up" (email → LinkedIn)
- **Tasks:** Spread across today (8-12), yesterday (5-8 completed,
  2-3 missed), and overdue (3-5 from past week). Seed dates relative
  to **June 3, 2026** as "today" — yesterday = June 2, overdue tasks
  should span May 27–June 2.
- **Templates:** At least one per channel, labeled clearly
  ("Cold Email Intro", "LinkedIn Connection Request",
  "WhatsApp Follow-up", "Call Script — Discovery")
- **Activities:** Seed 50-100 activity records over the past 2 weeks
  to populate the Team View leaderboard and charts

---

## 15. Relationship to telestar-bd-manager Skill

This CRM skill builds the **platform UI** — the interactive application
the SDR team works in daily. The existing `telestar-bd-manager` skill
handles **operational outputs** for the BD Manager (scorecards, 1:1
agendas, outreach drafts, pipeline reports).

They complement each other:
- CRM skill → builds and extends the Next.js application
- BD Manager skill → generates documents, emails, and reports

If the user asks to "generate a scorecard" or "draft an outreach
email," defer to `telestar-bd-manager`. If they ask to "build,"
"add a feature," "fix the CRM," or "update the platform," use this
skill.

---

## 16. Email Platform Compatibility

The team uses multiple email providers. The CRM email integration layer
must support:

| Provider         | Protocol / API                    | Notes                        |
|-----------------|-----------------------------------|------------------------------|
| Gmail            | Gmail API (OAuth 2.0) or SMTP     | Most SDRs use this           |
| Microsoft Mail   | Microsoft Graph API or SMTP/IMAP  | Outlook / Exchange accounts  |
| Roundcube        | IMAP / SMTP (standard protocols)  | Self-hosted webmail          |
| Other providers  | IMAP / SMTP (generic fallback)    | Any standard mail server     |

### Design principles for email integration

- **Provider-agnostic interface:** A single `EmailService` abstraction
  with provider-specific adapters behind it
- **Per-user configuration:** Each SDR connects their own email account(s)
  via settings — the CRM doesn't assume one provider for everyone
- **Graceful degradation:** If an SDR hasn't connected email, they can
  still use the CRM for all non-email workflows (phone, LinkedIn, WhatsApp)
- **Outbox pattern:** Queue emails through the CRM, send via the
  configured provider, and track delivery status

---

## 17. User & Auth Model

The CRM has four user roles with hierarchical permissions. Define users
clearly — every data model references `userId` or `assignedTo`.

### User data model

```
User {
  id: string
  email: string                 // login email
  firstName: string
  lastName: string
  role: "director" | "floor_manager" | "team_lead" | "sdr"
  managerId: string | null      // who this user reports to
  avatarUrl: string | null
  timezone: string              // e.g., "Asia/Ho_Chi_Minh"
  isActive: boolean
  createdAt: datetime
  updatedAt: datetime
}
```

### Role permissions matrix

| Capability                        | Director | Floor Manager | Team Lead | SDR  |
|----------------------------------|----------|---------------|-----------|------|
| View own leads/tasks             | ✅       | ✅            | ✅        | ✅   |
| View team leads/tasks            | All      | Their floor   | Their pod | ❌   |
| Create/edit leads                | ✅       | ✅            | ✅        | ✅   |
| Reassign leads between SDRs     | ✅       | ✅            | Their pod | ❌   |
| Create/edit sequences            | ✅       | ✅            | ✅        | ✅   |
| Create/edit templates            | ✅       | ✅            | ✅        | ✅   |
| View Team View dashboard        | ✅       | ✅            | ✅ (pod)  | ❌   |
| View personal stats widget      | ✅       | ✅            | ✅        | ✅   |
| Manage users (add/deactivate)   | ✅       | ✅ (their floor) | ❌     | ❌   |
| Manage clients/campaigns        | ✅       | ✅            | ✅ (view) | ❌   |
| Export data                      | ✅       | ✅            | ✅ (pod)  | ❌   |
| Access settings (global)        | ✅       | ✅ (limited)  | ❌        | ❌   |
| Access settings (personal)      | ✅       | ✅            | ✅        | ✅   |

> **Note on SDR dashboard:** SDRs don't see the full Team View, but they
> DO see a personal stats widget on their Dashboard showing their own
> activity counts, tasks completed, and pipeline summary for the day/week.
> This keeps them motivated without exposing other SDRs' data.

### Auth flow (MVP — local)

- Simple email/password login via NextAuth.js or custom session
- Store hashed passwords in the `users` table
- Session token in HTTP-only cookie
- No registration — admin/Director creates user accounts

### Auth flow (Production — Supabase)

- Migrate to Supabase Auth
- Row Level Security (RLS) enforces the permission matrix at the DB level
- Role stored in user metadata or a separate `user_roles` table

---

## 18. Client / Campaign Model

Every lead belongs to a client campaign. Clients are the BPO customers
who outsource their SDR function to Telestar.

### Client data model

```
Client {
  id: string
  name: string                  // e.g., "Acme Corp"
  industry: string              // e.g., "SaaS", "Fintech"
  contactName: string           // main point of contact
  contactEmail: string
  status: "active" | "paused" | "churned"
  createdAt: datetime
  updatedAt: datetime
}

Campaign {
  id: string
  clientId: string              // FK → Client
  name: string                  // e.g., "Acme Q3 Outreach"
  assignedSdrs: string[]        // SDR user IDs working this campaign
  targetVertical: string | null
  targetGeo: string | null
  status: "active" | "paused" | "completed"
  startDate: datetime
  endDate: datetime | null
  createdAt: datetime
}
```

### How campaigns connect to leads

- Every lead has a `campaignId` field (add to lead data model)
- SDRs are assigned to campaigns — they see leads from their campaigns
- Filtering by campaign is available in pipeline, task, and team views
- One SDR typically runs 1 campaign, sometimes 2

---

## 19. Activity Log

Track every meaningful action for reporting, coaching, and accountability.
This is the data source for the Team View leaderboard and analytics.

### Activity data model

```
Activity {
  id: string
  userId: string               // who performed the action
  leadId: string | null        // related lead (if applicable)
  type: "email_sent" | "call_made" | "call_logged" |
        "linkedin_sent" | "whatsapp_sent" |
        "note_added" | "stage_changed" | "task_completed" |
        "task_skipped" | "lead_created" | "meeting_booked" |
        "sequence_enrolled" | "sequence_completed"
  metadata: json               // shape varies by type:
                               //   stage_changed:  { from: "New", to: "Replied" }
                               //   call_made:      { outcome: "connected_interested", duration_seconds: 187, notes: "..." }
                               //   linkedin_sent:  { action: "Connection Request Sent", response_received: false }
                               //   whatsapp_sent:  { action: "Follow-up Message Sent", response_received: true }
  channel: string | null       // email / phone / linkedin / whatsapp
  createdAt: datetime
}
```

### Auto-logging rules

Activities are created automatically when:
- An SDR completes or skips a task
- A lead's stage changes
- A note is added to a lead
- An email/message is sent through the CRM
- A lead is enrolled in or completes a sequence
- A meeting is booked

### Usage in Team View

- **Leaderboard** queries activities grouped by `userId` and `type`
- **Activity feed** shows a chronological timeline for a specific SDR
- **Channel breakdown** counts activities by `channel` for the period
- **Conversion tracking** uses `stage_changed` and `meeting_booked` events

---

## 20. Settings Page

The Settings page has two scopes: **personal** (every user) and
**admin** (Director only).

### Personal settings (all roles)

| Setting                 | Description                                      |
|------------------------|--------------------------------------------------|
| Profile                | Name, avatar, timezone                           |
| Email accounts         | Connect/disconnect email providers (Gmail,       |
|                        | Outlook, Roundcube, SMTP/IMAP)                   |
| Notifications          | Toggle in-app notifications per event type        |
| Display preferences    | Default pipeline view (kanban/list), theme,       |
|                        | items per page                                    |
| Password               | Change password                                   |

### Admin settings (Director only)

| Setting                 | Description                                      |
|------------------------|--------------------------------------------------|
| User management        | Create, edit, deactivate user accounts            |
| Client management      | Add/edit clients and campaigns                    |
| Role assignments       | Assign users to roles, assign SDRs to Team Leads  |
| Pipeline stages        | Customize stage names and order (future)          |
| Data export            | Export all data as CSV/JSON for a date range       |
| Seed / Reset data      | Seed demo data (dev only) or reset database        |

### Email account connection flow

1. User goes to Settings → Email Accounts → "Connect Account"
2. Picks provider: Gmail, Outlook, Roundcube / Other
3. **Gmail / Outlook:** OAuth flow → store tokens securely
4. **Roundcube / Other:** Manual IMAP/SMTP config form
   (server, port, username, password — encrypted at rest)
5. CRM validates the connection (test send / test fetch)
6. Connected accounts appear in a list with status indicator

---

## 21. Call Logging & VoIP

Phone is a primary outreach channel. The CRM must capture call outcomes
every time an SDR dials — this data drives coaching, sequence advancement,
and the activity leaderboard.

### Call Logging modal

Triggered when an SDR completes a phone task (or via "Log Call" on the
lead detail panel). Outcome is required — the task does not close until
one is selected.

**Call outcome options:**

| Value                       | Label shown to SDR               |
|-----------------------------|----------------------------------|
| `no_answer`                 | No Answer                        |
| `voicemail_left`            | Voicemail Left                   |
| `voicemail_not_left`        | Went to Voicemail — No Message   |
| `connected_interested`      | Connected — Interested           |
| `connected_not_interested`  | Connected — Not Interested       |
| `connected_meeting_booked`  | Connected — Meeting Booked       |
| `wrong_number`              | Wrong Number                     |
| `do_not_call`               | Do Not Call (Requested)          |
| `callback_requested`        | Call Back Requested              |

**Modal fields:**

```
Call Outcome      [required — select]
Duration          [optional — mm:ss, auto-filled if VoIP integrated]
Notes             [optional — short free text]
Change stage?     [toggle — shown only for "connected" outcomes]
Create follow-up? [toggle — pre-fills a new phone task]
```

**Post-log automation:**

- `lastContactedAt` updates on any connected outcome.
- `callback_requested` → auto-creates a follow-up phone task due next
  business day with "Callback requested" pre-filled in description.
- `connected_meeting_booked` → prompts to move lead to "Meeting Booked"
  stage and optionally enroll in a post-meeting follow-up sequence.
- `do_not_call` or `wrong_number` → flags the lead; future phone tasks
  for that lead show a ⚠️ warning banner.

### Activity record generated

```
Activity {
  type: "call_made",
  channel: "phone",
  metadata: {
    outcome: "connected_interested",
    duration_seconds: 187,
    notes: "Interested in Q3 pilot, wants deck. Follow up Friday."
  }
}
```

### Click-to-call (VoIP integration)

- Every phone number in the CRM shows a ☎ icon button.
- If a VoIP integration is connected: clicking initiates the call via the
  VoIP API and opens the Call Logging modal in "in-call" mode with a
  live duration timer.
- If no integration: ☎ copies the number to clipboard and opens the modal
  for manual logging.
- VoIP provider is configured per user in Settings → Integrations.

---

## 22. Manual Activity Logging (LinkedIn & WhatsApp)

LinkedIn and WhatsApp have no open APIs for CRM-initiated messaging. SDRs
work these channels externally and return to the CRM to log what they did.
Logging must be fast — if it takes more than 10 seconds, SDRs skip it.

### "Log & Complete" flow

For LinkedIn and WhatsApp tasks, the ✅ Complete button label becomes
**"Log & Complete"**. Clicking opens a lightweight logging modal specific
to the channel.

### LinkedIn Logging modal

```
Action type    [required — select]
  → Connection Request Sent
  → InMail Sent
  → Follow-up Message Sent
  → Profile Viewed / Engaged
  → Comment Left on Post

Notes          [optional — what was sent/done, short]
Response?      [toggle — did the prospect reply?]
  └ If yes: brief note on response + option to advance lead stage
```

### WhatsApp Logging modal

```
Action type    [required — select]
  → First Message Sent
  → Follow-up Message Sent
  → Voice Note Sent
  → Document / Media Sent

Notes          [optional]
Response?      [toggle]
  └ If yes: brief note + option to advance lead stage
```

### "Log Activity" quick action (ad-hoc)

SDRs can log activity that wasn't tied to a scheduled task:
- Lead detail panel → Quick Actions → **"Log Activity"**
- Channel picker (LinkedIn / WhatsApp / Email / Phone) → same modals

### Activity records generated

```
Activity { type: "linkedin_sent",  channel: "linkedin",
           metadata: { action: "Connection Request Sent", response_received: false } }

Activity { type: "whatsapp_sent", channel: "whatsapp",
           metadata: { action: "Follow-up Message Sent", response_received: true,
                       notes: "Replied asking for pricing" } }
```

---

## 23. Notification System

Notifications surface time-sensitive events without requiring SDRs to
check a separate view. All notifications are in-app for MVP.

### Notification bell (top bar)

- Badge shows count of **unread** notifications.
- Clicking opens a slide-down panel (max height ~400px, scrollable).
- Each notification has a dismiss button; "Mark all read" clears the badge.
- Clicking a notification deep-links to the relevant lead, task, or view.

### Event trigger table

| Event                                    | Text                                                   | Recipient             |
|------------------------------------------|--------------------------------------------------------|-----------------------|
| Task overdue (crossed midnight unfinished) | "You have [N] overdue tasks"                          | Assigned SDR          |
| Reminder due                             | "Reminder: [text]"                                     | Creator               |
| Sequence step due today                  | "Step [N] due for [Lead Name]: [channel]"              | Assigned SDR          |
| Sequence completed                       | "[Lead Name] completed [Sequence Name]"                | Assigned SDR          |
| Lead stage changed (by someone else)     | "[Lead Name] moved to [Stage] by [SDR]"                | Assigned SDR          |
| Lead reassigned to me                    | "[Lead Name] was assigned to you by [Manager]"         | New assignee          |
| Meeting booked                           | "Meeting booked with [Lead Name]! 🎉"                  | SDR + their Team Lead |
| SDR overdue alert (manager view)         | "[SDR Name] has [N] overdue tasks"                     | Team Lead, FM         |

### Notification data model

```
Notification {
  id: string
  userId: string        // recipient
  type: string          // event key from table above
  text: string          // rendered message
  linkTo: string | null // e.g., /leads/[id], /tasks
  isRead: boolean
  createdAt: datetime
}
```

### Notification preferences (Settings → Notifications)

Users can toggle each event type on or off. Exceptions:
- **Reminder due** — always on (cannot be disabled).
- **Lead reassigned to me** — always on.

Manager-only events (overdue alerts) only appear in the preferences for
roles that receive them (Team Lead, Floor Manager, Director).

---

## 24. Lead Import & Deduplication

The primary lead source is uploaded files (client-provided or scraped
lists). The import flow must be transparent about what it found and
prevent duplicate contamination of the pipeline.

### Import flow

1. **Upload** — drag-and-drop or file picker in Leads → "Import Leads".
   Accepted formats: `.csv`, `.xlsx`.
2. **Column mapping** — CRM auto-detects common column names and shows a
   mapping UI. User confirms or adjusts which CSV column maps to which
   lead field. Required: at least one of `email` or (`firstName` +
   `lastName`). Optional: company, title, phone, linkedIn, whatsApp,
   source, tags.
3. **Preview** — shows first 10 rows as they'll be imported, with inline
   warnings for missing required fields or formatting issues (e.g., invalid
   email format).
4. **Duplicate check** — before importing, the CRM scans existing leads and
   reports a summary (see below). User resolves before confirming.
5. **Assignment** — user selects: which SDR(s) to assign to (or "distribute
   evenly"), which campaign, initial stage (defaults to New), optional
   auto-enroll in a sequence.
6. **Confirm & Import** — shows result: [N] imported, [N] skipped, [N]
   errors. Errors are downloadable as a report.

### Duplicate detection

Match strategy (evaluated in this priority order):

1. **Email match** (exact, case-insensitive) — highest confidence
2. **Name + Company match** (case-insensitive) — medium confidence
3. **Phone match** (normalized to digits) — medium confidence

**Pre-import summary shown to user:**

```
Import Summary
──────────────────────────────────────
Total rows in file:       150
New leads to import:      132   ✅
Exact duplicates found:    14   ⚠️  Already in CRM
Possible matches:           4   ⚠️  Review recommended
Rows with errors:           0
```

For each duplicate group, the user chooses (can be set globally for the
batch or overridden per duplicate):

| Choice          | Behavior                                                     |
|-----------------|--------------------------------------------------------------|
| **Skip** (default) | Don't import — existing lead is untouched                 |
| **Update**      | Overwrite empty fields on the existing lead with new data    |
| **Import anyway** | Create a new lead record (allows intentional duplicates)   |

### Error handling

Rows missing both email and name are rejected and listed in a downloadable
error CSV after the import completes.

