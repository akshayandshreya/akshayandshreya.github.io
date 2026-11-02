#!/usr/bin/env bash
# Run a command in Docker (node:20-bookworm) on the dev desktop, in $DVD_DIR, as the host user (spec 9.2).
# Ports are published on 127.0.0.1 only; reach them from the Mac with scripts/sync.sh tunnel.
#   scripts/dvd.sh npm ci
#   scripts/dvd.sh npm test
#   scripts/dvd.sh npm run build
#   DVD_PORTS=1 scripts/dvd.sh npm run dev      (publishes 5173 and 4173 on the host's 127.0.0.1)
#   DVD_PORTS='5191 4191' scripts/dvd.sh npx vite preview --host 0.0.0.0 --port 4191   (a parallel copy's own ports)
# Env: DVD_HOST, DVD_DIR (default ~/wedding_site/repo; must be inside ~/wedding_site/, as in scripts/sync.sh),
# DVD_IMAGE (default node:20-bookworm; wedding-site-pw for browsers), DVD_PORTS ("1" = "5173 4173", or a port list),
# VITE_SITE_URL / VITE_BASE (passed through), ALLOW_NO_SITE_URL (default 1 here: a QA build needs no site URL; set 0
# to get the CI behaviour of scripts/lib/site-url.mjs).
# The Mac never runs npm: it only edits, commits and syncs (scripts/sync.sh).
set -euo pipefail
HOST="${DVD_HOST:-dev-dsk-anaaks-2b-9537f078.us-west-2.amazon.com}"
IMAGE="${DVD_IMAGE:-node:20-bookworm}"
REMOTE="${DVD_DIR:-~/wedding_site/repo}"
case "$REMOTE" in
  '~/wedding_site/'?* | /home/*/wedding_site/?*) ;;
  *) echo "DVD_DIR must be inside ~/wedding_site/ (got $REMOTE)" >&2; exit 2 ;;
esac
PORTS=""
TTY=""
case "${DVD_PORTS:-0}" in
  0 | '') ;;
  1) PORTS="-p 127.0.0.1:5173:5173 -p 127.0.0.1:4173:4173"; TTY="-t" ;;
  *) for p in $DVD_PORTS; do PORTS="$PORTS -p 127.0.0.1:$p:$p"; done; TTY="-t" ;;
esac
CMD="$(printf '%q ' "$@")"
ssh $TTY "$HOST" "mkdir -p $REMOTE ~/wedding_site/{cache/npm,cache/ms-playwright,work} && chmod 700 ~/wedding_site && \
  docker run --rm --init $TTY -u \$(id -u):\$(id -g) -e HOME=/tmp/home -e npm_config_cache=/cache/npm \
  -e npm_config_update_notifier=false -e PLAYWRIGHT_BROWSERS_PATH=/cache/ms-playwright -e CI=1 \
  -e ALLOW_NO_SITE_URL=${ALLOW_NO_SITE_URL:-1} -e VITE_SITE_URL=${VITE_SITE_URL:-} -e VITE_BASE=${VITE_BASE:-/} \
  -v $REMOTE:/app -v ~/wedding_site/cache:/cache -v ~/wedding_site/work:/work -w /app $PORTS $IMAGE $CMD"
