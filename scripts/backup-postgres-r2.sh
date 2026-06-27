#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT_DIR}/.env.production}"

if [[ "${ENV_FILE}" != /* ]]; then
  ENV_FILE="${ROOT_DIR}/${ENV_FILE}"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[backup] env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${POSTGRES_USER:=crm}"
: "${POSTGRES_DB:=telestar_crm}"
: "${R2_REMOTE:=r2}"
: "${R2_PREFIX:=crm-4-u/postgres}"

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "[backup] POSTGRES_PASSWORD is required" >&2
  exit 1
fi

if [[ -z "${R2_BUCKET:-}" ]]; then
  echo "[backup] R2_BUCKET is required" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[backup] docker is required" >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "[backup] rclone is required" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP_DIR="$(mktemp -d)"
BACKUP_FILE="${TMP_DIR}/${POSTGRES_DB}-${STAMP}.sql.gz"
REMOTE_PATH="${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}/${POSTGRES_DB}-${STAMP}.sql.gz"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

cd "${ROOT_DIR}"

echo "[backup] dumping ${POSTGRES_DB} from postgres container"
docker compose --env-file "${ENV_FILE}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl \
  | gzip -9 > "${BACKUP_FILE}"

echo "[backup] uploading to ${REMOTE_PATH}"
rclone copyto "${BACKUP_FILE}" "${REMOTE_PATH}"

echo "[backup] complete: ${REMOTE_PATH}"
