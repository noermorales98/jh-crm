#!/usr/bin/env bash
# Idempotently ensure a local MariaDB server is running and the dev
# database/user exist. Safe to run repeatedly (install + every boot).
set -euo pipefail

DB_NAME="jhcrm"
DB_USER="jhcrm"
DB_PASS="jhcrm"

sudo mkdir -p /var/run/mysqld
sudo chown mysql:mysql /var/run/mysqld

# Initialize the data directory the first time only.
if [ ! -d /var/lib/mysql/mysql ]; then
  sudo mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null 2>&1 || true
fi

# Start the daemon if it is not already accepting connections.
if ! sudo mariadb -e "SELECT 1;" >/dev/null 2>&1; then
  sudo -b bash -c 'mariadbd --user=mysql >/var/log/mariadb-dev.log 2>&1'
  for _ in $(seq 1 30); do
    if sudo mariadb -e "SELECT 1;" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
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
