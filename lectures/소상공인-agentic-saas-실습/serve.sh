#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PORT="${1:-8800}"
echo "강의 덱: http://localhost:${PORT}/index.html"
python3 -m http.server "${PORT}"
