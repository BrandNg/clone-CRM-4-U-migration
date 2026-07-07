# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Detailed context lives in `.claude/rules/` — Claude Code loads these automatically:

| File                              | Content                                                   | Loads                   |
|-----------------------------------|-----------------------------------------------------------|-------------------------|
| `rules/project-context.md`        | Company, team hierarchy, toolstack, clients vs users      | Always                  |
| `rules/brand-design.md`           | Brand palette, design guidelines, channel + stage colors  | Always + UI files       |
| `rules/architecture.md`           | Stack, file layout, DB tables, auth, slide-over rule, state mgmt | Always + code files |
| `rules/modules.md`                | All 6 module routes, key UX per module, sidebar structure | When building modules   |
| `rules/dev-commands.md`           | npm, Prisma/Drizzle, TypeScript check, env setup          | package.json + DB files |
| `rules/workflow.md`               | SKILL.md rule, build sequence, iteration patterns, UX gotchas | Always            |
| `rules/runtime-hardening.md`      | Active initiative: runtime law, constraints, guardrails (→ plan) | Always         |

**Product spec:** `SKILL.md` — the authoritative reference for all modules, data models,
UI requirements, and iteration patterns. Always read it before writing code.

## 🔴 Active initiative — Runtime Hardening + BullMQ migration

The current primary bug-fix + update flow. Before doing correctness, sequencing, email,
import, or worker/runtime work:

1. Read **`docs/runtime-hardening/STATUS.md`** — the resume pointer (current phase, next task, blockers).
2. Execute the next unchecked task in **`docs/runtime-hardening/PLAN.md`** (corrected P0–P11 roadmap + acceptance tests).
3. Tick the checkbox + update `STATUS.md` when done.

Guardrails and runtime constraints auto-load from `.claude/rules/runtime-hardening.md`.
This supersedes the original `CRM-4U_BullMQ_Runtime_Hardening_Plan.md`.
