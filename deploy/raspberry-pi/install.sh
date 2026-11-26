#!/bin/bash
# Kart Cup server on a Raspberry Pi (made for a Pi 3 Model B with Raspberry Pi
# OS "trixie" or "bookworm", 32-bit, with desktop). Run on the Pi from this folder:
#   sudo bash install.sh                 own "Kart Cup" Wi-Fi + server + admin screen
#   sudo bash install.sh --no-hotspot    use the party router's network instead
#   sudo bash install.sh --no-desk       no admin screen on the Pi's own screen
#   sudo bash install.sh --wifi-at-boot  set up the Kart Cup Wi-Fi but switch to it only at the next boot
#                                        (keeps an SSH session over the home Wi-Fi alive)
#   sudo bash install.sh --no-optimize   leave the system services as they are
# What it does:
#   * installs Node.js if missing, copies index.html and server.mjs to /opt/kart-cup,
#   * runs the server at every boot on port 80, reached by name: http://kartcup.lan
#     on the Kart Cup Wi-Fi, http://kartcup.local through a router,
#   * opens the Pi's own Wi-Fi "Kart Cup" (hostapd, WPA2, generated password): phones
#     join it with one QR code and the sign-up page opens by itself; with a cable to a
#     router they keep their internet,
#   * opens the organizer's admin screen full screen when the desktop starts.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESK=1
HOTSPOT=1
WIFI_NOW=1
OPTIMIZE=1
for arg in "$@"; do
  case "$arg" in
    --no-desk) DESK=0 ;;
    --no-hotspot) HOTSPOT=0 ;;
    --wifi-at-boot) WIFI_NOW=0 ;;
    --no-optimize) OPTIMIZE=0 ;;
    *) echo "Unknown option $arg" >&2; exit 1 ;;
  esac
done
SSID="${KART_SSID:-Kart Cup}"
NAME="kartcup"

fail() { echo "ERROR: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "Please run with sudo: sudo bash install.sh"
USER_NAME="${SUDO_USER:-}"
if [ -z "$USER_NAME" ] || [ "$USER_NAME" = "root" ]; then
  USER_NAME="$(getent passwd 1000 | cut -d: -f1)"
fi
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"
for f in index.html server.mjs kart-cup.service kart-cup-desk kart-cup-desk.desktop kart-cup-dns.conf kart-cup-dnsmasq.conf kart-cup-ap kart-cup-wifi.service kart-cup-hostapd.service kart-cup-dnsmasq.service; do
  [ -f "$HERE/$f" ] || fail "Missing $f next to install.sh"
done

echo "== Packages"
NEED=""
command -v node >/dev/null 2>&1 || NEED="$NEED nodejs"
if [ "$HOTSPOT" = "1" ]; then
  [ -x /usr/sbin/hostapd ] || NEED="$NEED hostapd"
  [ -x /usr/sbin/dnsmasq ] || NEED="$NEED dnsmasq"
fi
if [ -n "$NEED" ]; then
  apt-get update
  # shellcheck disable=SC2086
  DEBIAN_FRONTEND=noninteractive apt-get install -y $NEED
fi
# Their own services stay off: the Kart Cup units below run them with our settings.
for unit in hostapd dnsmasq; do
  systemctl disable --now "$unit" >/dev/null 2>&1 || true
  systemctl mask "$unit" >/dev/null 2>&1 || true
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js $NODE_MAJOR is too old (18 or newer needed)."
echo "Node.js $(node --version)"

echo "== Name: $NAME"
if [ "$(hostname)" != "$NAME" ]; then
  hostnamectl set-hostname "$NAME"
  if grep -q '^127\.0\.1\.1' /etc/hosts; then sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$NAME/" /etc/hosts; else printf '127.0.1.1\t%s\n' "$NAME" >> /etc/hosts; fi
fi

echo "== Files"
install -d -m 755 /opt/kart-cup
install -m 644 "$HERE/index.html" "$HERE/server.mjs" /opt/kart-cup/
install -d -m 750 -o "$USER_NAME" -g "$USER_NAME" /var/lib/kart-cup

echo "== Settings (/etc/kart-cup/env)"
install -d -m 755 /etc/kart-cup
ENV_FILE=/etc/kart-cup/env
PASS=""
[ -f "$ENV_FILE" ] && PASS="$(sed -n 's/^WIFI_PASSWORD="\(.*\)"$/\1/p' "$ENV_FILE")"
if [ -z "$PASS" ]; then
  # 12 characters without look-alikes (no 0/O, 1/l/I), easy to type on a laptop.
  PASS="$(node -e 'const a="abcdefghjkmnpqrstuvwxyz23456789";const b=require("crypto").randomBytes(12);console.log([...b].map(x=>a[x%a.length]).join(""))')"
fi
{
  echo "PORT=80"
  echo "DATA_DIR=/var/lib/kart-cup"
  if [ "$HOTSPOT" = "1" ]; then
    echo "HOST_NAME=$NAME.lan"
    echo "CAPTIVE=1"
    echo "WIFI_SSID=\"$SSID\""
    echo "WIFI_PASSWORD=\"$PASS\""
    echo "WIFI_COUNTRY=$(raspi-config nonint get_wifi_country 2>/dev/null || echo DE)"
  else
    echo "HOST_NAME=$NAME.local"
  fi
} > "$ENV_FILE"
chmod 640 "$ENV_FILE"

echo "== Service"
sed -e "s/@USER@/$USER_NAME/" "$HERE/kart-cup.service" > /etc/systemd/system/kart-cup.service
systemctl daemon-reload
systemctl enable kart-cup.service
systemctl restart kart-cup.service

if [ "$DESK" = "1" ]; then
  echo "== Admin screen on this Pi"
  install -m 755 "$HERE/kart-cup-desk" /usr/local/bin/kart-cup-desk
  install -d -o "$USER_NAME" -g "$USER_NAME" "$USER_HOME/.config/autostart"
  install -m 644 -o "$USER_NAME" -g "$USER_NAME" "$HERE/kart-cup-desk.desktop" "$USER_HOME/.config/autostart/kart-cup-desk.desktop"
fi

if [ "$OPTIMIZE" = "1" ]; then
  echo "== Optimize for the party (Pi 3, 1 GB)"
  # Not needed on a party server: Bluetooth, NFS, PackageKit, automatic apt runs during the night.
  for unit in bluetooth.service hciuart.service rpcbind.service rpcbind.socket nfs-blkmap.service packagekit.service apt-daily.timer apt-daily-upgrade.timer; do
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
  done
  systemctl mask packagekit.service >/dev/null 2>&1 || true
  # Keep logs small on the SD card.
  install -d /etc/systemd/journald.conf.d
  printf '[Journal]\nSystemMaxUse=50M\n' > /etc/systemd/journald.conf.d/kart-cup.conf
  systemctl restart systemd-journald
  # Desktop session: no camera/phone/online-account file monitors, no Bluetooth media proxy.
  for unit in gvfs-afc-volume-monitor gvfs-goa-volume-monitor gvfs-gphoto2-volume-monitor gvfs-mtp-volume-monitor mpris-proxy; do
    systemctl --global mask "$unit.service" >/dev/null 2>&1 || true
  done
  if [ "$DESK" = "1" ] && command -v raspi-config >/dev/null 2>&1; then
    # The admin screen comes up by itself: log in to the desktop automatically, never blank the screen.
    raspi-config nonint do_boot_behaviour B4 || true
    raspi-config nonint do_blanking 1 || true
  fi
fi

if [ "$HOTSPOT" = "1" ]; then
  echo "== Wi-Fi \"$SSID\" (hostapd + dnsmasq)"
  WIFI_DEV="wlan0"
  ip link show "$WIFI_DEV" >/dev/null 2>&1 || fail "No Wi-Fi device $WIFI_DEV. Use --no-hotspot to skip the Wi-Fi."
  install -m 755 "$HERE/kart-cup-ap" /usr/local/sbin/kart-cup-ap
  install -m 644 "$HERE/kart-cup-dns.conf" "$HERE/kart-cup-dnsmasq.conf" /etc/kart-cup/
  for unit in kart-cup-wifi kart-cup-hostapd kart-cup-dnsmasq; do
    install -m 644 "$HERE/$unit.service" "/etc/systemd/system/$unit.service"
  done
  # NetworkManager leaves wlan0 alone (the cable stays with NetworkManager). Older
  # installs used a NetworkManager hotspot; phones could not join it on a Pi 3.
  install -d /etc/NetworkManager/conf.d
  printf '[keyfile]\nunmanaged-devices=interface-name:%s\n' "$WIFI_DEV" > /etc/NetworkManager/conf.d/kart-cup.conf
  nmcli connection delete kartcup-ap >/dev/null 2>&1 || true
  rm -f /etc/NetworkManager/dnsmasq-shared.d/kart-cup.conf
  systemctl daemon-reload
  systemctl enable kart-cup-wifi kart-cup-hostapd kart-cup-dnsmasq >/dev/null
  if [ "$WIFI_NOW" = "1" ]; then
    echo "Switching $WIFI_DEV to the Kart Cup Wi-Fi now. If you are connected to this Pi over Wi-Fi (SSH), that connection ends here;"
    echo "the Pi's screen or a network cable keep working."
    systemctl reload NetworkManager || true
    systemctl restart kart-cup-wifi kart-cup-hostapd kart-cup-dnsmasq || fail "The Wi-Fi did not start. See: journalctl -u kart-cup-hostapd -n 50"
  else
    echo "The Kart Cup Wi-Fi starts at the next boot."
  fi
fi

sleep 2
systemctl is-active --quiet kart-cup.service || fail "The server did not start. See: journalctl -u kart-cup -n 50"
echo
echo "Kart Cup server is running."
if [ "$HOTSPOT" = "1" ]; then
  echo "  Wi-Fi:      $SSID"
  echo "  Password:   $PASS   (also shown as a QR code on the TV and the station)"
  echo "  App:        http://$NAME.lan   (on the Kart Cup Wi-Fi)"
fi
echo "  Through a router cable: http://$NAME.local"
[ "$DESK" = "1" ] && echo "  Admin screen on this Pi: opens after the next login, or run: kart-cup-desk"
echo "  Status / log: systemctl status kart-cup   /   journalctl -u kart-cup"
