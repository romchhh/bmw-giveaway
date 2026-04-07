#!/bin/bash
set -euo pipefail

# Каталог, де лежить цей скрипт (наприклад .../bmw-giveaway/bot)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

activate_venv() {
  for name in myenv venv .venv; do
    if [ -f "$DIR/$name/bin/activate" ]; then
      # shellcheck source=/dev/null
      source "$DIR/$name/bin/activate"
      return 0
    fi
  done
  return 1
}

if ! activate_venv; then
  echo "Не знайдено venv. Створи в каталозі bot, наприклад:"
  echo "  python3 -m venv myenv && source myenv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

nohup python3 "$DIR/main.py" > /dev/null 2>&1 &
echo "Bot started (PID $!)"
