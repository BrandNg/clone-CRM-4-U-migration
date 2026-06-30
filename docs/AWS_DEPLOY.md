# AWS Docker Deployment Runbook

This deployment runs the CRM on EC2 with Docker Compose, RDS PostgreSQL, a local
Redis container for phase one, and Caddy as the reverse proxy.

## Production Env

Create `.env.production` on EC2 only. Do not commit it.

IP mode:

```env
APP_ENV_FILE=.env.production
IMAGE_TAG=latest
CRM_DOMAIN=46.137.208.100
CADDY_SITE_ADDRESS=:80
NEXTAUTH_URL=http://46.137.208.100

DATABASE_URL="postgresql://crm:<password>@<rds-writer-endpoint>:5432/telestar_crm?schema=public&sslmode=require&connection_limit=15"
DIRECT_URL="postgresql://crm:<password>@<rds-writer-endpoint>:5432/telestar_crm?schema=public&sslmode=require"
BACKUP_DATABASE_URL="postgresql://crm:<password>@<rds-writer-endpoint>:5432/telestar_crm?schema=public&sslmode=require"
REDIS_URL=redis://redis:6379

AUTH_SECRET=<random-secret>
ENCRYPTION_KEY=<64-character-hex>
CRON_SECRET=<random-secret>
EMAIL_SEND_DRY_RUN=true
SEQUENCE_AUTOSEND_ENABLED=false
```

Domain mode:

```env
CRM_DOMAIN=crm.example.com
CADDY_SITE_ADDRESS=crm.example.com
NEXTAUTH_URL=https://crm.example.com
```

Keep database URLs quoted because shell parsing breaks on unquoted `&`.

## Deploy Commands

```bash
cd /opt/crm-4-u
git pull
npm run prod:check-env
docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production build web worker
docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production run --rm --no-deps web npx prisma migrate deploy
docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production up -d web worker caddy redis
docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production ps
npm run prod:audit
```

The AWS overlay prevents local Postgres from starting. RDS is used through
`DATABASE_URL`, `DIRECT_URL`, and `BACKUP_DATABASE_URL`. Local Redis remains
enabled with `REDIS_URL=redis://redis:6379`.

## User CLI

Create or update a production user without manual SQL:

```bash
npm run create-user -- --email user@domain.com --password 'strong-password' --first-name 'First' --last-name 'Last' --role team_lead --activate
npm run list-users
```

Supported roles are `director`, `floor_manager`, `team_lead`, `sdr`, and
`leadgen`.

`create-admin` remains available for the first director account, but
`create-user` is the recommended production CLI.

## Switching From IP To Domain

1. Point DNS `A` record to the EC2 public IP.
2. Update `.env.production`:
   ```env
   CRM_DOMAIN=crm.example.com
   CADDY_SITE_ADDRESS=crm.example.com
   NEXTAUTH_URL=https://crm.example.com
   ```
3. Run:
   ```bash
   npm run prod:check-env
   docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production up -d caddy web worker redis
   npm run prod:audit
   ```

## Safety

- Do not run `npm run db:seed` in production.
- Do not enable live email until smoke tests pass.
- Keep `EMAIL_SEND_DRY_RUN=true` and `SEQUENCE_AUTOSEND_ENABLED=false` for this deployment.
- Never drop tables or delete production users as part of deploy cleanup.
- Check `docker compose logs --tail=100 web worker caddy` after every deploy.
