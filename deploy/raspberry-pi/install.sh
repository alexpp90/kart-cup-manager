#!/bin/bash
# Kart Cup server on a Raspberry Pi (tested design for a Pi 3 Model B with
# Raspberry Pi OS Bookworm). Run on the Pi from this folder:
#   sudo bash install.sh            server + sign-up station on the Pi's screen
#   sudo bash install.sh --no-desk  server only (no screen attached)
# What it does: installs Node.js if missing, copies index.html and server.mjs
# to /opt/kart-cup, starts the server now and at every boot (port 8080), and
# opens the sign-up station full screen when the desktop starts.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESK=1
[ "${1:-}" = "--no-desk" ] && DESK=0
PORT="${PORT:-8080}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: sudo bash install.sh" >&2
  exit 1
fi
USER_NAME="${SUDO_USER:-}"
if [ -z "$USER_NAME" ] || [ "$USER_NAME" = "root" ]; then
  USER_NAME="$(getent passwd 1000 | cut -d: -f1)"
fi
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"

for f in index.html server.mjs kart-cup.service; do
  [ -f "$HERE/$f" ] || { echo "Missing $f next to install.sh" >&2; exit 1; }
done

echo "== Node.js"
if ! command -v node >/dev/null 2>&1; then
  apt-get update
  apt-get install -y nodejs
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js $NODE_MAJOR is too old (18 or newer needed)." >&2
  exit 1
fi
echo "Node.js $(node --version)"

echo "== Files"
install -d -m 755 /opt/kart-cup
install -m 644 "$HERE/index.html" "$HERE/server.mjs" /opt/kart-cup/
install -d -m 750 -o "$USER_NAME" -g "$USER_NAME" /var/lib/kart-cup

echo "== Service"
sed -e "s/@USER@/$USER_NAME/" -e "s/@PORT@/$PORT/" "$HERE/kart-cup.service" > /etc/systemd/system/kart-cup.service
systemctl daemon-reload
systemctl enable --now kart-cup.service
systemctl restart kart-cup.service

if [ "$DESK" = "1" ]; then
  echo "== Sign-up station on this screen"
  install -m 755 "$HERE/kart-cup-desk" /usr/local/bin/kart-cup-desk
  sed -i "s/@PORT@/$PORT/" /usr/local/bin/kart-cup-desk
  install -d -o "$USER_NAME" -g "$USER_NAME" "$USER_HOME/.config/autostart"
  install -m 644 -o "$USER_NAME" -g "$USER_NAME" "$HERE/kart-cup-desk.desktop" "$USER_HOME/.config/autostart/kart-cup-desk.desktop"
fi

sleep 2
echo
if systemctl is-active --quiet kart-cup.service; then
  echo "Kart Cup server is running."
  for ip in $(hostname -I); do
    case "$ip" in *:*) ;; *) echo "  Open on the organizer's laptop:  http://$ip:$PORT" ;; esac
  done
  echo "  Sign-up station on this Pi:      kart-cup-desk   (starts by itself after the next login)"
  echo "  Status / log:                     systemctl status kart-cup   /   journalctl -u kart-cup"
else
  echo "The service did not start. See: journalctl -u kart-cup -n 50" >&2
  exit 1
fi
