#!/usr/bin/env bash
# Gummy Bears — launcher for Linux. Run this file or use:
#   ./launch-gummy-bears.sh
# To add it to your application menu / desktop:
#   python3 launch.py --install-shortcut
cd "$(dirname "$0")" || exit 1
for py in python3 python; do
  if command -v "$py" >/dev/null 2>&1 && "$py" -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)' 2>/dev/null; then
    exec "$py" launch.py "$@"
  fi
done
if command -v zenity >/dev/null 2>&1; then
  zenity --error --title="Gummy Bears" --text="Python 3 is required.\nInstall it with your package manager (python3), then try again."
else
  echo
  echo "Python 3 is required to start Gummy Bears."
  echo "Install it with your package manager (for example: sudo apt install python3)."
  echo
  read -r -p "Press Enter to close..."
fi
exit 1
