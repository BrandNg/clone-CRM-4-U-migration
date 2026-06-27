# AWS Docker Deployment Runbook

This runbook keeps the same GHCR image + Docker Compose deployment model, but
uses AWS managed services for state:

- EC2 runs `web`, `worker`, and `caddy`.
- RDS PostgreSQL stores CRM data.
- ElastiCache Redis backs BullMQ queues.
- GHCR remains the private image registry.
- Host cron triggers app cron endpoints and daily database backups.

Use `docker-compose.aws.yml` together with the base compose file. The AWS
override makes `web` and `worker` use managed `DATABASE_URL` and `REDIS_URL`
instead of the all-in-one local `postgres` and `redis` services.

## 1. Target Architecture

Use this first production shape:

- **EC2**: Ubuntu 24.04 LTS, `t3.small` minimum, `t3.medium` preferred.
- **RDS PostgreSQL**: PostgreSQL 16, private subnet, single AZ to start.
- **ElastiCache Redis**: Redis 7, private subnet.
- **Caddy**: runs on EC2, owns ports `80` and `443`.
- **Route 53/DNS**: `A` record points CRM domain to the EC2 public IP.

Avoid RDS Proxy for the first deploy. Prisma uses prepared statements, which can
cause RDS Proxy session pinning. Add RDS Proxy later only after watching
`DatabaseConnectionsCurrentlySessionPinned`.

## 2. AWS Resources

### VPC and Security Groups

Create or reuse one VPC with public and private subnets.

Security groups:

- `crm-ec2-sg`
  - inbound `22` from your IP only
  - inbound `80` from `0.0.0.0/0`
  - inbound `443` from `0.0.0.0/0`
  - outbound allowed
- `crm-rds-sg`
  - inbound `5432` from `crm-ec2-sg`
- `crm-redis-sg`
  - inbound `6379` from `crm-ec2-sg`

### RDS PostgreSQL

Recommended initial settings:

- Engine: PostgreSQL 16
- DB name: `telestar_crm`
- Master user: `crm`
- Public access: **No**
- Storage: gp3, 20-50 GB, autoscaling enabled
- Backups: 7-14 days retention
- Deletion protection: enabled after first successful restore drill

Production connection strings:

```env
DATABASE_URL=postgresql://crm:<password>@<rds-writer-endpoint>:5432/telestar_crm?schema=public&sslmode=require&connection_limit=15
DIRECT_URL=postgresql://crm:<password>@<rds-writer-endpoint>:5432/telestar_crm?schema=public&sslmode=require
```

Use the direct RDS writer endpoint for migrations. Do not run migrations through
RDS Proxy.

### ElastiCache Redis

Recommended initial settings:

- Engine: Redis 7
- Private access only
- Transit encryption/auth token optional for first private-subnet deploy; enable
  if your AWS baseline requires it.

Private Redis URL:

```env
REDIS_URL=redis://<redis-primary-endpoint>:6379
```

If AUTH token is enabled:

```env
REDIS_URL=redis://:<redis-auth-token>@<redis-primary-endpoint>:6379
```

## 3. EC2 Bootstrap

SSH into EC2 and install runtime tools:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git rclone
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Log out and back in so the `docker` group applies.

Clone the migration repo:

```bash
sudo mkdir -p /opt/crm-4-u
sudo chown ubuntu:ubuntu /opt/crm-4-u
git clone https://github.com/BrandNg/clone-CRM-4-U-migration.git /opt/crm-4-u
cd /opt/crm-4-u
```

Log in to private GHCR:

```bash
echo '<github_pat_with_read_packages>' | docker login ghcr.io -u BrandNg --password-stdin
```

## 4. Production Env

Create the env file:

```bash
cp .env.docker.example .env.production
chmod 600 .env.production
```

Set at minimum:

```env
CRM_DOMAIN=crm.example.com
APP_ENV_FILE=.env.production
IMAGE_TAG=latest
NEXTAUTH_URL=https://crm.example.com
AUTH_SECRET=<random-secret>
ENCRYPTION_KEY=<64-character-hex>
CRON_SECRET=<random-secret>

DATABASE_URL="postgresql://crm:<password>@<rds-writer-endpoint>:5432/telestar_crm?schema=public&sslmode=require&connection_limit=15"
DIRECT_URL="postgresql://crm:<password>@<rds-writer-endpoint>:5432/telestar_crm?schema=public&sslmode=require"
REDIS_URL=redis://<redis-primary-endpoint>:6379
BACKUP_DATABASE_URL="postgresql://crm:<password>@<rds-writer-endpoint>:5432/telestar_crm?schema=public&sslmode=require"

SEQUENCE_AUTOSEND_ENABLED=false
EMAIL_SEND_DRY_RUN=true
```

Quote database URLs in `.env.production`; the backup script sources this file
with Bash, and unquoted `&` characters will break shell parsing.

Keep `SEQUENCE_AUTOSEND_ENABLED=false` and `EMAIL_SEND_DRY_RUN=true` for the
first smoke test. Flip them only after login, worker, email account, and cron
checks pass.

## 5. First Deploy

Pull the image:

```bash
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production pull web worker caddy
```

Start Caddy only after DNS points to the EC2 public IP. For initial state and
migrations:

```bash
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production run --rm web npx prisma migrate deploy
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production run --rm web npm run create-admin -- --email admin@example.com --password '<strong-password>' --name 'Admin'
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production up -d web worker caddy
```

Check:

```bash
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production ps
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production logs --tail=100 web
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production logs --tail=100 worker
curl -fsS https://$CRM_DOMAIN/api/health
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production run --rm web npm run worker:healthcheck
```

## 6. Host Cron

Edit cron:

```bash
crontab -e
```

Add:

```cron
*/5 * * * * . /opt/crm-4-u/.env.production; curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://$CRM_DOMAIN/api/cron/sequence-engine" >/tmp/crm-sequence-cron.log 2>&1
*/10 * * * * . /opt/crm-4-u/.env.production; curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://$CRM_DOMAIN/api/cron/inbox-sync" >/tmp/crm-inbox-cron.log 2>&1
15 2 * * * cd /opt/crm-4-u && ./scripts/backup-postgres-r2.sh >>/var/log/crm-pg-backup.log 2>&1
```

## 7. Future Deploys

After `main` builds and pushes a new GHCR image:

```bash
cd /opt/crm-4-u
git pull
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production pull web worker caddy
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production run --rm web npx prisma migrate deploy
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production up -d web worker caddy
docker image prune -f
```

## 8. Backup and Restore

Keep RDS automated backups on, and keep the existing offsite `pg_dump` flow for
portable recovery.

Backup smoke:

```bash
cd /opt/crm-4-u
./scripts/backup-postgres-r2.sh
```

Restore drill to the same database should only happen during maintenance:

```bash
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production stop web worker
gunzip -c backup.sql.gz | docker run --rm -i postgres:16-bookworm psql "$DIRECT_URL"
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production run --rm web npx prisma migrate deploy
docker compose -f docker-compose.yml -f docker-compose.aws.yml --env-file .env.production up -d web worker caddy
```

## 9. CloudWatch Watchlist

Watch these during the first week:

- EC2 CPU and memory
- RDS `DatabaseConnections`
- RDS `FreeableMemory`
- RDS `CPUUtilization`
- RDS `FreeStorageSpace`
- Redis `CurrConnections`
- Redis memory usage
- Caddy/web 5xx logs

If DB connections climb too high, first lower `connection_limit`; only evaluate
RDS Proxy or a pooler after measuring pinning behavior.
