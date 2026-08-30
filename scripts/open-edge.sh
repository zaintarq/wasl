#!/usr/bin/env bash
# Open a URL in Microsoft Edge (macOS / Windows / Linux).
set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Usage: open-edge.sh <url>" >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    if [[ -d "/Applications/Microsoft Edge.app" ]]; then
      exec open -a "Microsoft Edge" "$URL"
    fi
    exec open "$URL"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    exec cmd.exe /c start "" "msedge" "$URL"
    ;;
  *)
    if command -v microsoft-edge >/dev/null 2>&1; then
      exec microsoft-edge "$URL"
    fi
    if command -v xdg-open >/dev/null 2>&1; then
      exec xdg-open "$URL"
    fi
    echo "Open this URL in Microsoft Edge: $URL" >&2
    exit 1
    ;;
esac
