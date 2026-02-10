#!/bin/bash

# Configuration
PROJECT_DIR="/home/someone/site_walk"
BACKUP_FILE="$PROJECT_DIR/backup_n8n.json"

# Perform backup
# We use docker compose from the project directory
cd "$PROJECT_DIR" || exit 1

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    exit 1
fi

if docker compose exec -T n8n n8n export:workflow --all --pretty > "$BACKUP_FILE"; then
  : # Success
else
  rm -f "$BACKUP_FILE" # Remove partial/empty file
  exit 1
fi
