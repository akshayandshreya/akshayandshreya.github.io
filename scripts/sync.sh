#!/usr/bin/env bash
# Mac <-> dev desktop sync with tar over SSH (spec 9.3; scp and openrsync are unreliable from this Mac).
#   scripts/sync.sh push [--clean]   Mac working tree -> $DVD_DIR (no node_modules, dist, .git, AppleDouble files)
#                                    --clean first empties $DVD_DIR except node_modules (only after deletions)
#   scripts/sync.sh pull-generated   dvd -> Mac: src/i18n/*.json, src/generated/*, package-lock.json
#   scripts/sync.sh pull-assets      dvd -> Mac: generated assets (src/assets, public/og, icons, generated, i18n)
#   scripts/sync.sh tunnel           forward 127.0.0.1:5173 (dev) and :4173 (preview) from dvd; Ctrl-C ends it
#                                    (TUNNEL_PORTS='4191' for a parallel copy's own port)
#   scripts/sync.sh status           free space on both sides, size of the dvd copy, running site containers
# Env: DVD_HOST (default: the dev desktop below), DVD_DIR (default ~/wedding_site/repo; give a parallel working
# copy its own directory, for example DVD_DIR='~/wedding_site/s9'), TUNNEL_PORTS (default "5173 4173").
# Pulls refuse to run when the Mac would keep less than 500 MB free (the Mac disk is small, spec 9.1).
set -euo pipefail
HOST="${DVD_HOST:-dev-dsk-anaaks-2b-9537f078.us-west-2.amazon.com}"
LOCAL="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${DVD_DIR:-~/wedding_site/repo}"
MIN_FREE_KB=$((500 * 1024))

case "$REMOTE" in
  '~/wedding_site/'?* | /home/*/wedding_site/?*) ;;
  *) echo "DVD_DIR must be inside ~/wedding_site/ (got $REMOTE)" >&2; exit 2 ;;
esac

remote_tar() { # $1 = space-separated paths relative to $REMOTE; missing paths are skipped
  ssh "$HOST" "cd $REMOTE && tar -cf - \$(ls -d $1 2>/dev/null)"
}

guard_space() { # $1 = paths on dvd; abort when the pull would leave the Mac below MIN_FREE_KB
  local need free
  need="$(ssh "$HOST" "cd $REMOTE && du -sk \$(ls -d $1 2>/dev/null) 2>/dev/null | awk '{s+=\$1} END {print s+0}'")"
  free="$(df -k "$LOCAL" | awk 'NR==2 {print $4}')"
  echo "pull: ${need} KB from dvd, ${free} KB free on the Mac"
  if (( free - need < MIN_FREE_KB )); then
    echo "pull: refused, the Mac would keep less than $((MIN_FREE_KB / 1024)) MB free" >&2
    exit 1
  fi
}

case "${1:-}" in
  push)
    if [[ "${2:-}" == "--clean" ]]; then
      ssh "$HOST" "mkdir -p $REMOTE && find $REMOTE -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +"
    fi
    # COPYFILE_DISABLE + --no-mac-metadata keep macOS ._* files out; the exclude catches any already on disk
    COPYFILE_DISABLE=1 tar -C "$LOCAL" --exclude=node_modules --exclude=dist --exclude=dist-ssr --exclude=.git \
      --exclude=.vite --exclude=coverage --exclude=playwright-report --exclude=test-results --exclude=.DS_Store \
      --exclude='._*' --no-xattrs --no-mac-metadata -cf - . |
      ssh "$HOST" "mkdir -p $REMOTE && chmod 700 ~/wedding_site && tar --warning=no-unknown-keyword -C $REMOTE -xf - && \
        find $REMOTE -name '._*' -not -path '*/node_modules/*' -delete"
    echo "pushed to $HOST:$REMOTE"
    ;;
  pull-generated)
    PATHS='src/i18n src/generated package-lock.json'
    guard_space "$PATHS"
    remote_tar "$PATHS" | tar -C "$LOCAL" -xf -
    echo "pulled $PATHS"
    ;;
  pull-assets)
    PATHS='src/assets public/og public/favicon.svg public/apple-touch-icon.png public/icon-512.png public/site.webmanifest src/generated src/i18n'
    guard_space "$PATHS"
    remote_tar "$PATHS" | tar -C "$LOCAL" -xf -
    echo "pulled generated assets"
    ;;
  tunnel)
    PORTS="${TUNNEL_PORTS:-5173 4173}" # unset TUNNEL_PORTS must not trip `set -u` (bash 4+ treats ${X%% *} as a use)
    ARGS=()
    for p in $PORTS; do ARGS+=(-L "$p:127.0.0.1:$p"); done
    echo "tunnel: http://127.0.0.1:${PORTS%% *}/ (Ctrl-C to stop); nothing listens on a public interface"
    exec ssh -N -o ExitOnForwardFailure=yes "${ARGS[@]}" "$HOST"
    ;;
  status)
    df -h "$LOCAL" | awk 'NR==2 {print "mac free: " $4}'
    ssh "$HOST" "df -h ~ | awk 'NR==2 {print \"dvd free: \" \$4}'; du -sh $REMOTE 2>/dev/null | sed 's/^/dvd copy: /'; \
      docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | grep -E 'wedsite|node:20|wedding-site|nginx' || true"
    ;;
  *)
    sed -n '2,12p' "$0"
    exit 2
    ;;
esac
