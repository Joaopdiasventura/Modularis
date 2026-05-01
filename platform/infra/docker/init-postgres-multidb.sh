#!/bin/sh
set -eu

for db in modularis_onboarding modularis_identity modularis_membership modularis_webhook; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    SELECT 'CREATE DATABASE $db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
done
