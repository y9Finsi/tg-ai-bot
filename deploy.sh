#!/usr/bin/env bash
set -euo pipefail

SERVER="root@178.215.236.137"
REMOTE_DIR="/opt/tg-bot"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "❌ Git remote 'origin' is not configured."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "📌 Saving current changes to Git..."
  git add -A

  if ! git diff --cached --quiet; then
    git commit -m "chore: sync deployment"
  fi
fi

echo "☁️  Pushing current branch to GitHub..."
git push

echo "🚀 Syncing files to server ($SERVER)..."
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.DS_Store' \
  ./ "$SERVER:$REMOTE_DIR/"

echo "📦 Rebuilding & restarting Docker containers on server..."
ssh "$SERVER" "cd $REMOTE_DIR && docker compose up -d --build"

echo "✅ Deploy complete! Checking Docker container logs:"
ssh "$SERVER" "cd $REMOTE_DIR && docker compose logs --tail=30 bot"
