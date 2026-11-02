#!/usr/bin/env bash
# Serve the built dist/ on the dev desktop the way a static host does (spec 9.4, 9.5): the README's nginx snippet,
# so the real CSP and other headers, the 301 aliases, /en -> /en/ and the 404.html fallback all apply. `vite preview`
# does none of that. Run it from the Mac after `scripts/dvd.sh npm run build`:
#   scripts/serve-dist.sh            start nginx:alpine on the dvd's 127.0.0.1:$PORT (default 4173), dist/ read-only
#   scripts/serve-dist.sh stop       stop it
# Then `scripts/sync.sh tunnel` (or TUNNEL_PORTS=$PORT for another port) and open http://127.0.0.1:$PORT/.
# Env: DVD_HOST, DVD_DIR (as in scripts/sync.sh), PORT, NAME (container name, default wedsite-dist-$PORT).
set -euo pipefail
HOST="${DVD_HOST:-dev-dsk-anaaks-2b-9537f078.us-west-2.amazon.com}"
REMOTE="${DVD_DIR:-~/wedding_site/repo}"
PORT="${PORT:-4173}"
NAME="${NAME:-wedsite-dist-$PORT}"
LOCAL="$(cd "$(dirname "$0")/.." && pwd)"
case "$REMOTE" in
  '~/wedding_site/'?* | /home/*/wedding_site/?*) ;;
  *) echo "DVD_DIR must be inside ~/wedding_site/ (got $REMOTE)" >&2; exit 2 ;;
esac
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "PORT must be a number (got $PORT)" >&2; exit 2; }

if [[ "${1:-}" == "stop" ]]; then
  ssh "$HOST" "docker rm -f $NAME >/dev/null && echo stopped $NAME"
  exit 0
fi

# The README block is the one nginx config (tests/unit/hosting.test.ts checks it); only the listen port changes.
CONF="$(awk '/^```nginx$/ {f = 1; next} f && /^```$/ {exit} f' "$LOCAL/README.md" | sed 's/listen 80;/listen 8080;/')"
[[ "$CONF" == *"listen 8080;"* ]] || { echo "no nginx block found in README.md" >&2; exit 1; }

printf '%s\n' "$CONF" | ssh "$HOST" "set -e; test -f $REMOTE/dist/index.html || { echo 'no dist/ in $REMOTE: build first' >&2; exit 1; }
  mkdir -p ~/wedding_site/work && chmod 700 ~/wedding_site && cat > ~/wedding_site/work/$NAME.conf
  docker rm -f $NAME >/dev/null 2>&1 || true
  docker run -d --name $NAME -p 127.0.0.1:$PORT:8080 -v $REMOTE/dist:/srv/wedding:ro \
    -v ~/wedding_site/work/$NAME.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine >/dev/null
  sleep 1; curl -s -o /dev/null -w 'serve-dist: /en/ answers %{http_code} on 127.0.0.1:$PORT\n' http://127.0.0.1:$PORT/en/"
echo "serve-dist: $NAME on $HOST 127.0.0.1:$PORT; TUNNEL_PORTS=$PORT scripts/sync.sh tunnel, then http://127.0.0.1:$PORT/"
