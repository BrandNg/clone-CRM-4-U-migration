---
description: Core company, team, and operational context for the Telestar SDR CRM project
alwaysApply: true
---

# Telestar — Project Context

**TeleStar** is a BPO company providing **SDR-as-a-Service** globally. Clients outsource
their sales development to TeleStar — the team prospects, qualifies leads, books meetings,
and hands off pipeline to the client's closers. Each client gets a dedicated campaign.

## Team

```
Director (1)
 └── Floor Managers (2)
      └── Team Leads (7)
           └── SDRs (12)
```

**BD Manager (Son):** Leads the team, manages clients, coaches reps, reports on performance.
Vietnamese-speaking, based in SEA. **SDRs:** 12 reps, globally distributed, multi-channel
outreach across Email, Phone (VoIP), LinkedIn, and WhatsApp.

## Current Toolstack

| Tool                       | Used for                              |
|----------------------------|---------------------------------------|
| Gmail                      | Primary email outreach                |
| Microsoft Mail (Outlook)   | Email outreach (Exchange accounts)    |
| Roundcube                  | Webmail for custom mail servers       |
| Excel / Sheets             | Lead lists, tracking, reporting       |
| Telegram                   | Internal team communication           |
| VoIP Dialer                | Phone outreach                        |
| LinkedIn / Sales Navigator | Prospecting and outreach              |
| WhatsApp                   | Messaging prospects                   |

The team uses multiple email backends depending on client/campaign. The CRM must be
email-backend agnostic.

## Lead Sources

Primarily **team-uploaded files** (client-provided or scraped lists). Also: Apollo API
enrichment, LinkedIn Sales Navigator manual search. Future goal: connect enrichment
APIs directly into the CRM.

## Outreach Rules

- Max touches per lead are **sequence-defined** — no fixed global cap.
- Sequences support any combination of Email, Phone, LinkedIn, WhatsApp.
- **No fixed KPI targets yet** — building a clean workflow first. KPIs layered in later.
- Lead priority is manually set: **`hot` / `warm` / `cold`**. Used for task sort order
  (high-priority leads surface first) and kanban card badge color.

## Clients vs Users

These are two separate entities — do not conflate them:

- **Clients** are the BPO customers — external companies that outsource their SDR
  function to Telestar. Stored in the `clients` table. Each client has one or more
  `campaigns`. Leads belong to campaigns, not directly to users.
- **Users** are the internal SDR team members who log into the CRM. Stored in the
  `users` table with roles (director / floor_manager / team_lead / sdr).

A lead's data chain: `lead → campaign → client`.

## Workspace Model

- **Personal workspace (default):** each SDR sees only their assigned leads and tasks.
- **"My Leads" filter:** quick toggle in any view to scope to the current user's leads.
- **Team View:** managers see aggregate data, scoped by their role
  (Director = all, Floor Manager = their floor, Team Lead = their pod).
