---
description: Development commands for running, building, linting, and managing the database for the Telestar CRM Next.js app
globs: "**/package.json, **/package-lock.json, **/prisma/**, **/drizzle/**, .env*, **/.env*"
---

# Development Commands

> App not scaffolded yet. Update actual command names once `package.json` exists.

## Running the App

```bash
npm run dev        # Start Next.js dev server → http://localhost:3000
npm run build      # Production build
npm run lint       # ESLint check
npx tsc --noEmit   # TypeScript type check (no output files)
```

## Database — Prisma

```bash
npx prisma migrate dev --name <migration-name>   # Create and apply a migration
npx prisma migrate deploy                        # Apply migrations (CI / production)
npx prisma studio                                # Open DB browser GUI
npx prisma generate                              # Regenerate Prisma client after schema change
npm run seed                                     # Populate demo/seed data
```

## Database — Drizzle (alternative to Prisma)

```bash
npx drizzle-kit push        # Push schema changes to DB (dev)
npx drizzle-kit generate    # Generate migration files
npx drizzle-kit studio      # Open DB browser GUI
```

## Environment Setup

Copy `.env.local.example` → `.env.local` and set:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/telestar_crm
```

Never commit `.env.local`. All secrets live here — no hardcoded connection strings.

## Local PostgreSQL (if not using Docker)

```bash
# Docker shortcut
docker run --name telestar-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres

# Create the database
psql -U postgres -c "CREATE DATABASE telestar_crm;"
```
