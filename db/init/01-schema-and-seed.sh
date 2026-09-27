#!/bin/bash
# Runs once, on the first start of the gvenzl/oracle-free container, after the
# image has created APP_USER in the default pluggable database (FREEPDB1).
#
# The image's own *.sql handling runs as SYSDBA in the root container, so this
# script connects as APP_USER instead: the tables land in the application schema.
# The image sources this file unless it is executable, and aborts start-up if it
# fails, so the healthcheck never turns healthy on a half-built schema.
set -Eeuo pipefail

sqlplus -s /nolog <<SQL
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
CONNECT ${APP_USER}/"${APP_USER_PASSWORD}"@//localhost:1521/FREEPDB1
@/opt/transfers/schema.sql
@/opt/transfers/seed.sql
EXIT
SQL
