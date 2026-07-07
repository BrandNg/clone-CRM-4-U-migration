# Production Smoke Test

## Pre-Deploy

- Confirm `.env.production` exists only on EC2 and is not committed.
- Run `npm run prod:check-env`.
- Confirm RDS is reachable from EC2 and local Redis will run as `redis`.
- Confirm `EMAIL_SEND_DRY_RUN=true` and `SEQUENCE_AUTOSEND_ENABLED=false`.

## Deploy

```bash
cd /opt/crm-4-u
git pull
docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production build web worker
docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production run --rm --no-deps web npx prisma migrate deploy
docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production up -d web worker caddy redis
docker compose -f docker-compose.yml -f docker-compose.aws.yml -f docker-compose.build.yml --env-file .env.production ps
npm run prod:audit
```

## Login Tests

- Director can log in.
- Floor manager can log in.
- Team lead can log in.
- SDR can log in.
- Leadgen can log in.
- Invalid password shows a clear error.
- Inactive users cannot log in if account deactivation is intended.

## User CLI Tests

```bash
npm run create-user -- --email smoke-user@example.com --password 'strong-password' --first-name Smoke --last-name User --role sdr --activate
npm run create-user -- --email smoke-user@example.com --password 'new-strong-password' --role team_lead --activate
npm run list-users
```

Do not delete production users during smoke tests.

## Campaign And Lead Tests

- Create a new client.
- Create a campaign with an existing client.
- Create a campaign with a new client.
- Update campaign status.
- View campaign detail.
- Create a lead.
- Import leads.
- Update lead fields.
- Assign a lead.
- Confirm role-based lead visibility.

## Stage Movement

Move one test lead through:

- `new` to `sequence_active`
- `sequence_active` to `replied`
- `replied` to `meeting_booked`
- `meeting_booked` to `won`
- `meeting_booked` to `lost`

Each failed move should show the backend error details in the UI.

## Tasks And Activities

- Create a task.
- Complete a task.
- Add a note.
- Log a call.
- Log an email.
- Log a LinkedIn touch.
- Confirm the activity timeline updates.

## Sequences

- Create a sequence.
- Enroll a lead.
- Unenroll a lead.
- Confirm live sending remains disabled.

## Rollback Notes

- Keep the previous image tag available.
- If deploy fails before migrations, restart the prior containers.
- If deploy fails after migrations, do not drop data; inspect logs and restore from RDS backup only during a planned maintenance window.

## Safety

- Keep `EMAIL_SEND_DRY_RUN=true`.
- Keep `SEQUENCE_AUTOSEND_ENABLED=false`.
- Do not run seed scripts in production.
- Do not hardcode or paste secrets into docs, issues, or chat.
