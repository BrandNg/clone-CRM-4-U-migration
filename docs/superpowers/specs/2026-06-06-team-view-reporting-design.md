# Team View & Reporting — Design Spec
**Date:** 2026-06-06
**Phase:** 1 of 6 (Premium Platform Upgrade)
**Route:** `/team`
**Status:** Approved, ready for implementation

---

## 1. Overview

The Team View is the reporting hub for Telestar's managers and SDRs. Its primary purpose is giving Son (Director) clean, presentation-ready campaign stats he can show clients live on a screenshare or export as a PDF. Internal coaching data (leaderboard, overdue alerts, at-risk leads) lives behind a separate tab so it never accidentally appears during a client call.

---

## 2. Page Structure & Navigation

The `/team` page has two top-level states managed via `useState` — no URL changes, no page reloads:

### State 1: Overview (all campaigns)
- Shown to Director, Floor Managers, Team Leads on page load
- SDRs skip this state entirely (see SDR behavior below)

### State 2: Campaign Detail (single campaign drill-down)
- Triggered by clicking any campaign row in the Overview
- Breadcrumb header: `Team View > [Campaign Name]`
- `← Back` link returns to Overview state

### Tab switcher (both states)
Two tabs always visible at the top of the page:

| Tab | Visible to | Content |
|---|---|---|
| **Campaigns** | All roles | Client-facing campaign stats |
| **Team Performance** | Director, Floor Manager, Team Lead only | Internal leaderboard, alerts |

### Date range filter
- Shared across both tabs and both states
- Presets: Today / This Week / This Month / Custom
- Persists when navigating between overview and detail

### SDR behavior
- SDRs land directly on Campaign Detail for their assigned campaign
- Tab switcher not shown to SDRs
- If an SDR has no campaign assignment → "Telestar Campaign" shown automatically (mandatory fallback — always exists in the database)
- SDRs see only their own stats in the rep breakdown row

---

## 3. Role Scoping

Scoping is enforced at the API query layer (MVP). The tree-walk query:

```
Director
  → All campaigns

Floor Manager
  → Team Leads where users.managerId = floorManager.id
    → SDRs where users.managerId = teamLead.id
      → Campaigns via campaignSdr join table

Team Lead
  → SDRs where users.managerId = teamLead.id
    → Campaigns via campaignSdr join table

SDR
  → Their own assigned campaign(s) only
  → Fallback: Telestar Campaign if unassigned
```

**Telestar Campaign seed requirement:** A campaign named "Telestar Campaign" linked to a client named "Telestar" must always exist in the database. The seed script must create it. It is the permanent fallback for unassigned SDRs and must never be deletable from the admin UI.

Two Floor Managers see different campaign sets because they own different Team Leads. There are 2 Floor Managers and 7 Team Leads split across them — the split is encoded in `users.managerId`.

---

## 4. Campaigns Tab — Overview Panel

Shown when no campaign is selected. Safe to screenshare with any client (no rep names or internal data).

### Aggregate KPI row
Four metric cards spanning the full width:
- **Total Meetings Booked** — sum across all visible campaigns
- **Contacts Touched** — unique leads with at least one activity logged
- **Avg Reply Rate** — weighted average across campaigns
- **Active Campaigns** — count of campaigns with `isActive = true`

All figures scoped to the selected date range.

### Campaign table
| Column | Notes |
|---|---|
| Status dot | Filled = active, hollow = paused |
| Campaign name | |
| Client name | |
| Meetings Booked | |
| Contacts Touched | |
| Reply Rate | `replies / contacts touched` |
| Drill-in `[→]` | Navigates to Campaign Detail state |

- Default sort: Meetings Booked descending
- Column headers are clickable to re-sort
- No pagination for MVP (expected < 20 campaigns)

---

## 5. Campaigns Tab — Campaign Detail View

Shown after clicking a campaign row. This is the primary screenshare view for client calls and the source for PDF export.

### Header
```
← Team View  /  [Campaign Name]        [Date range ▾]  [Export PDF]
```

### Six KPI cards
| Metric | Source |
|---|---|
| Meetings Booked | `activities` where `type = meeting_booked` |
| Contacts Touched | Unique `leadId` values in `activities` |
| Unique Replies | `activities` where `type = email_replied` |
| Reply Rate | `replies / contacts_touched` |
| Sequences Running | `sequences` where `isActive = true` for this campaign |
| Tasks Done | `tasks` where `status = completed` for campaign's SDRs |

### Pipeline Funnel
- Built with recharts `BarChart` (horizontal)
- One bar per pipeline stage: New → Sequence Active → Replied → Meeting Booked → Won → Lost
- Bar width proportional to lead count
- Conversion percentage shown between stages (e.g. `57%` from New → Sequence Active)
- Colors match existing stage badge palette:
  - New = gray
  - Sequence Active = blue
  - Replied = amber
  - Meeting Booked = emerald
  - Won = green
  - Lost = red

### Sequences table
Columns: Sequence Name · Enrolled · Completed · Reply Rate · Meetings Booked
- Only sequences with ≥ 1 enrolled lead in this campaign
- Sorted by Meetings Booked descending
- No pagination for MVP

### Reps table
Columns: Rep (first name + last initial) · Tasks Done · Emails · Calls · LinkedIn · WhatsApp · Meetings
- Only SDRs assigned to this campaign
- Sorted by Meetings Booked descending
- First name + last initial only (e.g. "Maria G.") — appropriate for client screenshare
- Data pulled from `activities` filtered by `campaignId` + `userId` + date range

---

## 6. PDF Export

Triggered by the `[Export PDF]` button on the Campaign Detail header.

### Content
Exports exactly what is visible on screen:
- Telestar logo — top left
- Client name + Campaign name — top right
- Date range label — below header
- Six KPI cards
- Pipeline funnel chart
- Sequences table
- Reps table (rep names included — clients paid for this team)
- Generated date — footer

### Implementation approach
Use `window.print()` with a print-specific CSS stylesheet (`@media print`) that:
- Hides sidebar, topbar, tab switcher, back button, date filter, and export button
- Expands the content to full page width
- Forces white background
- Breaks page before the sequences table if content overflows

This requires zero extra dependencies and works offline. A server-side PDF library (e.g. Puppeteer) can replace it in a future phase if higher fidelity is needed.

---

## 7. Team Performance Tab — Internal View

Visible to Director, Floor Manager, and Team Lead only. Hidden from SDRs. **Never exported.**

The `[Export PDF]` button is hidden on this tab.

### Activity Leaderboard
Full-width table of all SDRs visible to the current user (role-scoped):

| Column | Notes |
|---|---|
| Rank | 🥇🥈🥉 medals for top 3, numbers for the rest |
| Rep name | Full name (internal view) |
| Calls | `activities` count where `type = call_logged` |
| Emails | `activities` count where `type = email_sent` |
| LinkedIn | `activities` count where `type = linkedin_touch` |
| WhatsApp | `activities` count where `type = whatsapp_touch` |
| Meetings | `activities` count where `type = meeting_booked` |
| Total | Sum of all activity columns |

- Sorted by Total descending
- Scoped to selected date range
- Floor Manager sees only SDRs under their Team Leads

### Overdue Alerts
Two-column layout:

**Left — SDRs with overdue tasks:**
| Column | Notes |
|---|---|
| Rep name | Clickable → navigates to `/` (Dashboard) with `?userId=[id]&tab=overdue` query params, which scopes the task hub to that rep's overdue tasks |
| Overdue count | Number of incomplete tasks past due date |
| Oldest | Relative time of the oldest overdue task |

Sorted by overdue count descending. Role-scoped.

**Right — At-risk leads:**
Leads where the current sequence step task is ≥ 3 days overdue (⚠️ indicator per SKILL.md §3):

| Column | Notes |
|---|---|
| Lead name | Clickable → opens lead slide-over panel |
| Company | |
| Assigned to | Rep name |
| Days overdue | Number of days the step task is past due |

Limited to top 10 rows. "View all" link if more exist.

---

## 8. Data & API Requirements

### New API endpoints needed
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/team/campaigns` | GET | Campaign overview list with KPIs, role-scoped |
| `/api/team/campaigns/[id]` | GET | Single campaign detail — funnel, sequences, reps |
| `/api/team/leaderboard` | GET | Activity counts per SDR, role-scoped, date-filtered |
| `/api/team/alerts` | GET | Overdue task counts + at-risk leads, role-scoped |

### Auth & scoping
All endpoints read the current user from the session (NextAuth `getServerSession`). Role and `managerId` are pulled from the session user record. No `userId` query param — scoping is derived server-side from the authenticated user only.

### Query parameters (all endpoints)
- `from` — ISO date string, range start
- `to` — ISO date string, range end

### New dependency
- `recharts` — add to `dependencies` in `package.json` for the pipeline funnel chart

### Existing tables used
`activities` · `tasks` · `leads` · `sequences` · `users` · `campaigns` · `campaignSdr`

No schema changes required.

---

## 9. Component Structure

```
app/team/page.tsx                  — page shell, tab state, date range state
components/team/
  CampaignOverview.tsx             — campaign table + aggregate KPIs
  CampaignDetail.tsx               — six KPIs + funnel + sequences + reps
  PipelineFunnel.tsx               — recharts BarChart wrapper
  SequencesTable.tsx               — sequences performance table
  RepsTable.tsx                    — per-rep activity breakdown
  TeamLeaderboard.tsx              — internal activity leaderboard
  OverdueAlerts.tsx                — overdue tasks + at-risk leads side by side
```

---

## 10. Out of Scope (this phase)

- Live client portal (own login, separate auth) — Phase 1b
- Real-time leaderboard updates (Supabase Realtime) — Phase 3
- Server-side PDF generation (Puppeteer) — future polish
- Email delivery of PDF reports — future integration
