#!/usr/bin/env bash
# Build and start the CareBridge web interface.
#   ./run_web.sh            -> http://localhost:8080
#   ./run_web.sh 9090       -> another port
#   CAREBRIDGE_HOST=0.0.0.0 ./run_web.sh    -> listen on every interface
#                                              (containers / Codespaces / hosting)
set -e
cd "$(dirname "$0")"

PORT="${1:-8080}"
HOST="${CAREBRIDGE_HOST:-127.0.0.1}"

if ! command -v g++ >/dev/null 2>&1; then
  echo "g++ not found. Install a C++17 compiler (e.g. 'sudo apt install g++')." >&2
  exit 1
fi

echo "Building the web server..."
g++ -std=c++17 -O2 -o carebridge_web src/server.cpp src/CareBridge.cpp

echo
echo "CareBridge starting on port ${PORT} (UI folder: web/, data folder: data/)"
if [ "$HOST" = "0.0.0.0" ]; then
  echo "Listening on all interfaces - only do this on a demo/container host."
else
  echo "Open http://localhost:${PORT} in your browser."
fi
echo "Demo logins: patient P001 / pat123, doctor D001 / doc123"
echo "Press Ctrl+C to stop."
echo

CAREBRIDGE_HOST="$HOST" exec ./carebridge_web "$PORT"
