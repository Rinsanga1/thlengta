#!/usr/bin/env bash
set -e

DB="/home/enfuego_r/thlengta/data.sqlite"

# Delete anything older than 90 days
sqlite3 "$DB" "DELETE FROM attendance_logs WHERE created_at < datetime('now','-90 days');"
sqlite3 "$DB" "VACUUM;"
