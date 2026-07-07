---
description: Quick reference for all 6 CRM modules — routes, key UX decisions, what each page contains, and the sidebar navigation structure
---

# Modules — Quick Reference

Full specs in SKILL.md §1–§9. This file is the cheat sheet for routes and
key per-module decisions.

## Sidebar Routes

```
/              → Dashboard  (task hub — default landing page)
/leads         → Leads      (pipeline: kanban + list toggle)
/sequences     → Sequences  (sequence list + step builder)
/templates     → Templates  (library + editor)
/team          → Team View  (managers only — Director, FM, TL, BD Manager)
/settings      → Settings   (personal + admin scopes)
```

Top bar (persistent): global search · "+ New" dropdown (Lead / Task / Reminder) ·
🔔 bell (badge = unread count) · user avatar + name

The 🔔 bell covers **both** reminders (time-triggered from the `reminders` table) and
system notifications (events from the `notifications` table — overdue alerts, stage changes,
reassignments, etc.). Clicking opens a unified slide-down panel; each item is dismissible.
Full event trigger list: SKILL.md §23.

---

## Dashboard `/`

The SDR's daily starting point. Three tabs on one route:

| Tab | Contents |
|---|---|
| **Today** | All tasks due today, sorted priority → time |
| **Yesterday** | Tasks due yesterday (completed ✓ and missed ✗) |
| **Overdue** | Incomplete tasks past due date, oldest first |

Header counters: `Today: 14 (8 done, 6 remaining) | Overdue: 3 | Yesterday: 22/25`

Task card anatomy: channel icon · lead name + company (→ opens slide-over) ·
due time / "X days overdue" badge · quick actions: ✅ Complete · ⏭ Skip · 📝 Note · 🔁 Reschedule

Phone tasks: Complete → **Call Logging modal** (outcome required, §21).
LinkedIn/WhatsApp tasks: button is **"Log & Complete"** (opens activity logger, §22).

SDRs also see a **personal stats widget** here: their own activity counts, tasks
completed, and pipeline summary for today / this week. (SDRs have no Team View.)

---

## Leads `/leads`

Two views on one route, toggled by the user:

**Kanban view:** one column per pipeline stage, leads as draggable cards.
Card shows: name · company · priority badge · last contacted (relative) · next task icon.

**List/table view:** sortable, filterable. Bulk actions: change stage, assign SDR, add to sequence.

Both views: filter by stage / priority / SDR / tags / date range. Search by name / company / email.

**Lead detail** — always a **slide-over panel from the right**, never a page:
header (name, company, title, stage, priority) · contact info (clickable email/phone/LinkedIn/WA) ·
active sequence progress bar · notes timeline + add-note input · task history ·
reminders · quick actions (change stage, reassign, edit, archive)

---

## Sequences `/sequences`

**List page:** sequence cards showing name, step count, enrolled lead count, active/paused status.
Quick actions: edit, duplicate, archive.

**Builder:** visual step editor. Each step is a card: step number · channel icon + label ·
delay (days + hours) · linked template preview · instructions text.
Steps reorder via drag-and-drop or ↑↓ arrows. "+ Add Step" shows channel picker first.

**Enrollment:** from lead detail or bulk from pipeline. One active sequence per lead at a time.
Enrolling in a new sequence auto-unenrolls from the current one (confirmation modal).

Auto-unenrollment triggers: lead replies · email bounces · stage → Meeting Booked/Won/Lost ·
all steps completed. Full rules: SKILL.md §3.

---

## Templates `/templates`

**Library:** grid or list filterable by channel and category tag.

**Editor** (side panel or modal):
- Name · channel selector · category tag
- Subject line field (email only)
- Body with merge field insertion toolbar
- Preview pane with sample data substituted in

Supported merge fields:
`{{firstName}}` `{{lastName}}` `{{company}}` `{{title}}` `{{email}}` `{{phone}}` `{{sdrName}}` `{{sdrTitle}}`

---

## Notes & Reminders (no separate route)

Notes and reminders are NOT standalone pages. They live inside other modules.

**Notes** — per-lead, accessed only from the lead detail slide-over:
- Reverse-chronological timeline of freeform notes (plain text or light markdown).
- Pinned notes float to the top of the timeline.
- Quick-add: 📝 button on any task card writes a note to that task's lead.
- No `/notes` route exists — notes are always accessed via the lead slide-over.

**Reminders** — time-triggered alerts, standalone or tied to a lead:
- Created from: lead detail panel, task view, or "+ New → Reminder" in the top bar.
- Appear in the 🔔 bell dropdown alongside system notifications.
- A reminder can be lead-linked (opens lead slide-over on click) or standalone.
- `isDismissed: boolean` — dismissed reminders leave the dropdown; they are not deleted.

**Data models** (SKILL.md §6):
```
Note      { id, leadId, content, createdBy, createdAt, isPinned }
Reminder  { id, leadId (nullable), text, dueAt, isDismissed, createdAt }
```

---

## Team View `/team`

Role-gated: Director / BD Manager → all SDRs. Floor Manager → their floor.
Team Lead → their pod only. SDRs → no access (redirect to Dashboard).

Contains:
1. **Activity leaderboard** — SDRs ranked by tasks completed today / this week / this month.
   Columns: calls · emails · LinkedIn · WhatsApp · meetings booked.
   Data source: `activities` table grouped by `userId` + `type`.
2. **Pipeline funnel** — total leads per stage across the team (horizontal funnel or stacked bar via recharts).
3. **Overdue alert** — SDRs with overdue tasks, sorted by count descending.
4. **Sequence performance** — active sequences, enrolled count, reply rate.
5. **Client report export** — per-campaign summary (CSV or PDF) for BPO clients.
   Shares meetings booked, contacts touched, sequence stats — no internal team data exposed.

---

## Settings `/settings`

**Personal (all roles):** profile (name, avatar, timezone) · email account connections ·
notification preferences · display prefs (default pipeline view, theme) · password.

**Admin (Director only):** user management · client + campaign management ·
role assignments · data export (CSV/JSON) · seed/reset data (dev only).

Email account connection flow: Gmail / Outlook → OAuth. Roundcube / other → manual
IMAP/SMTP form with encrypted credential storage. Validation: test send/fetch on save.
