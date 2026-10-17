#!/bin/bash
# Gummy Bears — double-click launcher for macOS.
cd "$(dirname "$0")" || exit 1
for py in python3 python; do
  if command -v "$py" >/dev/null 2>&1 && "$py" -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)' 2>/dev/null; then
    exec "$py" launch.py "$@"
  fi
done
echo
echo "Python 3 is required to start Gummy Bears."
echo "Install it from https://www.python.org/downloads/"
echo "Then double-click this file again."
echo
read -n 1 -s -r -p "Press any key to close..."
