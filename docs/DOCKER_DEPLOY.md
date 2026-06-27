# Docker Deploy Runbook

This runbook uses GitHub Actions to build the CRM image and GitHub Container
Registry (GHCR) to distribute it. The VPS pulls the image; it does not build it.

Image:

```text
ghcr.io/brandng/clone-crm-4-u-migration:latest
ghcr.io/brandng/clone-crm-4-u-migration:<short-git-sha>
```

Stack:

- `web`: Next.js CRM, internal port `3000`
- `worker`: BullMQ worker runtime, same image as `web`, different command
- `postgres`: local Docker PostgreSQL 16
- `redis`: local Docker Redis 7 with append-only persistence
- `caddy`: public HTTPS reverse proxy on ports `80` and `443`
- host cron: calls CRM cron routes and runs daily R2 backups

## 1. Build and Publish Image

The workflow `.github/workflows/docker-image.yml` builds the Dockerfile with
BuildKit/buildx.

- Pull requests build the image but do not push it.
- Pushes to `main` publish `latest` and short-SHA tags to GHCR.
- Manual `workflow_dispatch` also publishes an image.

After pushing to `main`, confirm the workflow passed in GitHub Actions and that
the package exists in GitHub Packages.

The GHCR package should stay private. The VPS pulls it with a GitHub PAT that
has `read:packages`.

## 2. Optional Local Build Fallback

If a machine has Docker available and you want to build locally, use the build
override file:

```bash
cp .env.docker.example .env.docker
docker compose -f docker-compose.yml -f docker-compose.build.yml --env-file .env.docker build
docker compose -f docker-compose.yml -f docker-compose.build.yml --env-file .env.docker up -d postgres redis
docker compose -f docker-compose.yml -f docker-compose.build.yml --env-file .env.docker run --rm web npx prisma migrate deploy
docker compose -f docker-compose.yml -f docker-compose.build.yml --env-file .env.docker up -d
```

Without `docker-compose.build.yml`, Compose expects to pull from GHCR.

## 3. VPS Setup

Install runtime packages on Hostinger:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git rclone
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Log out and back in so the Docker group applies.

Clone the repo:

```bash
sudo mkdir -p /opt/crm-4-u
sudo chown "$USER":"$USER" /opt/crm-4-u
git clone https://github.com/BrandNg/clone-CRM-4-U-migration.git /opt/crm-4-u
cd /opt/crm-4-u
cp .env.docker.example .env.production
```

Edit `/opt/crm-4-u/.env.production`:

```dotenv
APP_ENV_FILE=.env.production
IMAGE_TAG=latest
CRM_DOMAIN=crm.yourdomain.com
NEXTAUTH_URL=https://crm.yourdomain.com
POSTGRES_PASSWORD=<long-random-password>
AUTH_SECRET=<openssl-rand-base64-32>
ENCRYPTION_KEY=<64-hex-chars>
CRON_SECRET=<openssl-rand-hex-32>
SEQUENCE_AUTOSEND_ENABLED=false
EMAIL_SEND_DRY_RUN=true
```

Also update OAuth redirect URIs if Gmail or Microsoft OAuth will be enabled:

```dotenv
GOOGLE_REDIRECT_URI=https://crm.yourdomain.com/api/email/oauth/google/callback
MICROSOFT_REDIRECT_URI=https://crm.yourdomain.com/api/email/oauth/microsoft/callback
```

Point the DNS `A` record for `CRM_DOMAIN` to the VPS IP before starting Caddy.

## 4. GHCR Login

Create a GitHub personal access token with `read:packages`. For a private repo or
private package, make sure the token owner can access the package.

Log in on the VPS:

```bash
echo '<PAT_WITH_READ_PACKAGES>' | docker login ghcr.io -u BrandNg --password-stdin
```

Pull the published image:

```bash
docker compose --env-file .env.production pull
```

## 5. First Launch

Start Postgres and Redis:

```bash
docker compose --env-file .env.production up -d postgres redis
```

Apply migrations:

```bash
docker compose --env-file .env.production run --rm web npx prisma migrate deploy
```

Create the first Director:

```bash
docker compose --env-file .env.production run --rm web npm run create-admin -- \
  --email you@yourdomain.com \
  --password 'replace-with-a-strong-password' \
  --name 'Your Name'
```

Start the full stack:

```bash
docker compose --env-file .env.production up -d
```

Verify:

```bash
docker compose --env-file .env.production config
docker compose --env-file .env.production ps
curl -I https://crm.yourdomain.com
curl https://crm.yourdomain.com/api/health
docker compose --env-file .env.production run --rm worker npm run worker:healthcheck
```

The login page must not show demo credentials in production.

## 6. Future Deploys

Push to `main`, wait for the Docker Image workflow to pass, then on the VPS:

```bash
cd /opt/crm-4-u
git pull
docker compose --env-file .env.production pull
docker compose --env-file .env.production run --rm web npx prisma migrate deploy
docker compose --env-file .env.production up -d
```

To pin a specific image instead of `latest`, set:

```dotenv
IMAGE_TAG=<short-git-sha>
```

Then run:

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d
```

## 7. Host Cron

Create a root-owned cron file:

```bash
sudo crontab -e
```

Add:

```cron
SHELL=/bin/bash
CRM_DIR=/opt/crm-4-u

*/5 * * * *  cd $CRM_DIR && source .env.production && curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://$CRM_DOMAIN/api/cron/sequence-engine" >/dev/null
*/10 * * * * cd $CRM_DIR && source .env.production && curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://$CRM_DOMAIN/api/cron/inbox-sync" >/dev/null
15 2 * * *   cd $CRM_DIR && bash scripts/backup-postgres-r2.sh .env.production >> /var/log/crm-4-u-backup.log 2>&1
```

Keep `SEQUENCE_AUTOSEND_ENABLED=false` and `EMAIL_SEND_DRY_RUN=true` until the
worker, cron, and email path have been smoke-tested.

## 8. Cloudflare R2 Backups

Create a Cloudflare R2 bucket, then configure `rclone` on the VPS:

```bash
rclone config
```

Recommended remote name:

```text
r2
```

Set these in `.env.production`:

```dotenv
R2_REMOTE=r2
R2_BUCKET=your-r2-bucket
R2_PREFIX=crm-4-u/postgres
```

Manual backup smoke:

```bash
bash scripts/backup-postgres-r2.sh .env.production
rclone ls r2:your-r2-bucket/crm-4-u/postgres
```

## 9. Restore Drill

Use a disposable restore target first. For the live stack, stop the app processes:

```bash
docker compose --env-file .env.production stop web worker
```

Download one backup:

```bash
rclone copy r2:your-r2-bucket/crm-4-u/postgres ./restore-test --max-depth 1
```

Restore:

```bash
gunzip -c ./restore-test/telestar_crm-YYYYMMDDTHHMMSSZ.sql.gz \
  | docker compose --env-file .env.production exec -T postgres \
      psql -U crm -d telestar_crm
```

Re-apply migrations and restart:

```bash
docker compose --env-file .env.production run --rm web npx prisma migrate deploy
docker compose --env-file .env.production up -d
```

## 10. Operations Cheatsheet

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f web
docker compose --env-file .env.production logs -f worker
docker compose --env-file .env.production logs -f caddy
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d
```

Postgres and Redis are private Docker-network services. Do not publish their
ports on the VPS firewall.
