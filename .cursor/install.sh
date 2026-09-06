#!/usr/bin/env bash
# One-time (per snapshot) setup for the J&H Multiservices CRM.
# Idempotent: installs system packages, node deps, the local database,
# a dev .env.local, applies migrations and seeds the OWNER user.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. System dependency: MariaDB server (local MySQL-compatible database).
if ! command -v mariadbd >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server
fi

# 2. Bring up the database (idempotent).
bash .cursor/start-db.sh

# 3. Node dependencies (postinstall runs `prisma generate`).
npm ci

# 4. Local dev environment file with generated secrets (only if missing).
if [ ! -f .env.local ]; then
  cat > .env.local <<ENV
DATABASE_URL="mysql://jhcrm:jhcrm@127.0.0.1:3306/jhcrm"
AUTH_SECRET="$(openssl rand -base64 32)"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

CRON_SECRET="$(openssl rand -hex 16)"
FIELD_ENCRYPTION_KEY="$(openssl rand -base64 32)"

BOOTSTRAP_OWNER_EMAIL="owner@jhcrm.local"
BOOTSTRAP_OWNER_PASSWORD="ChangeMe123!"
BOOTSTRAP_OWNER_NAME="Owner Dev"

OPENROUTER_API_KEY=""
OPENROUTER_API_KEY_SECONDARY=""

FEATURE_PUBLIC_INTAKE="false"
FEATURE_CONSULTATION_PAYMENTS="false"
FEATURE_CLIENT_PORTAL="false"

S3_ENDPOINT=""
S3_REGION="auto"
S3_BUCKET=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_FORCE_PATH_STYLE="true"
UPLOAD_MAX_MB="15"
ENV
  echo "Created .env.local with generated dev secrets."
fi

# 5. Apply database migrations (idempotent).
npm run db:deploy

# 6. Seed organization + OWNER user (idempotent upserts).
npx tsx --env-file=.env.local scripts/bootstrap.ts

echo "Install complete."
