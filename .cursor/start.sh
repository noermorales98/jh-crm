#!/usr/bin/env bash
# Per-boot startup: ensure the local database is running before the
# dev server (launched via the `terminals` entry) connects to it.
set -euo pipefail

cd "$(dirname "$0")/.."

bash .cursor/start-db.sh
