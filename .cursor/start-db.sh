#!/usr/bin/env bash
# Idempotently ensure a local MariaDB server is running and the dev
# database/user exist. Safe to run repeatedly (install + every boot).
set -euo pipefail

DB_NAME="jhcrm"
DB_USER="jhcrm"
DB_PASS="jhcrm"
LOG=/var/log/mariadb-dev.log

sudo mkdir -p /run/mysqld
sudo chown mysql:mysql /run/mysqld
sudo chown -R mysql:mysql /var/lib/mysql

# Initialize the data directory the first time only.
if [ ! -d /var/lib/mysql/mysql ]; then
  sudo mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null 2>&1 || true
fi

# Start the daemon if it is not already accepting connections.
if ! sudo mariadb-admin ping >/dev/null 2>&1; then
  # Clear any stale pid so a fresh daemon can bind cleanly.
  sudo rm -f /run/mysqld/mysqld.pid
  # Fully detach the daemon so it survives the install step.
  sudo bash -c "setsid mariadbd --user=mysql >'$LOG' 2>&1 < /dev/null &"

  ready=0
  for _ in $(seq 1 60); do
    if sudo mariadb-admin ping >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done

  if [ "$ready" -ne 1 ]; then
    echo "MariaDB did not become ready in time. Recent log:" >&2
    sudo tail -n 40 "$LOG" >&2 || true
    exit 1
  fi
fi

# Create database and user (idempotent).
sudo mariadb <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "MariaDB ready (database '${DB_NAME}')."
