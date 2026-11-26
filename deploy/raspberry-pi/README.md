# Kart Cup server on a Raspberry Pi 3

The Pi opens its own Wi-Fi called **Kart Cup** and runs the Kart Cup server:

* Guests scan **one QR code** on the TV: the phone joins the Kart Cup Wi-Fi and the
  "Join the Race!" sign-up opens by itself. No app, no typing of addresses.
* The app is reached by name: **http://kartcup.lan** (on the Kart Cup Wi-Fi) or
  **http://kartcup.local** (through a router cable). Never by IP.
* With a screen, keyboard and mouse on the Pi, the Pi is the **organizer's console**: after
  boot it opens the admin screen full screen (add players, start phone sign-up, **Show QR code**
  across the whole screen, run the races). A laptop can open the same app as `http://kartcup.lan`.
* With a network cable from the Pi to a router, guests on the Kart Cup Wi-Fi keep their
  internet. Without a cable everything still works, only the internet is missing.

The two app files (`index.html`, `server.mjs`) run on any device with Node.js 18+ as well
(`node server.mjs` on a laptop); this folder only adds the Pi's Wi-Fi, auto-start and station.

## What you need

* Raspberry Pi 3 Model B (or newer), power supply, micro SD card (8 GB or more, it is erased).
* For the station: an HDMI screen, a USB keyboard and mouse. (Recommended for the first setup anyway.)
* Optional: a network cable to a router (internet for guests, and the organizer's laptop can
  stay on its normal Wi-Fi).

## 1. The SD card

Either use **Raspberry Pi Imager** (*Device:* Raspberry Pi 3, *OS:* Raspberry Pi OS (32-bit)
with desktop, optionally *Edit settings* for user, keyboard and time zone), or write the
image directly. Then copy the **`kart-cup-server`** folder onto the card's **bootfs** drive.

## 2. First start and install (on the Pi, with screen and keyboard)

1. Put the card in the Pi, connect screen, keyboard, mouse (and the cable, if you have one), switch on.
   The first start takes a few minutes; the Pi asks for country, user name, password and a
   Wi-Fi to use for the installation (skip the Wi-Fi if the cable is connected).
2. Open the terminal (black icon at the top) and type:

   ```bash
   sudo bash /boot/firmware/kart-cup-server/install.sh
   ```

   It installs Node.js, sets the name `kartcup`, starts the server on port 80 and finally turns
   the Pi's Wi-Fi into the **Kart Cup** Wi-Fi. At the end it shows the **Wi-Fi password**
   (it is also printed on the TV and the station next to the QR code, and kept in
   `/etc/kart-cup/env`).
3. Restart the Pi: it logs in by itself and opens the admin screen full screen. Leave it with
   **Alt+F4**, open it again with `kart-cup-desk` (`kart-cup-desk form` opens the plain sign-up
   form for guests instead).

Options: `--no-hotspot` uses the party router's network instead of the Pi's own Wi-Fi (then
use `http://kartcup.local`); `--no-desk` skips the station; `--wifi-at-boot` switches to the
Kart Cup Wi-Fi only at the next boot (when you install over SSH on the home Wi-Fi);
`--no-optimize` leaves the system services alone.

The Wi-Fi runs with **hostapd** (plain WPA2) and **dnsmasq** (addresses, `kartcup.lan`, the
sign-up redirect). NetworkManager keeps the cable but leaves the Wi-Fi alone. To give the Wi-Fi
back to NetworkManager: `sudo systemctl disable --now kart-cup-wifi` and
`sudo rm /etc/NetworkManager/conf.d/kart-cup.conf`, then reboot.

The installer also tunes the Pi 3 for the night: Bluetooth, NFS, PackageKit and the automatic
apt runs are switched off, logs are capped at 50 MB, unused desktop helpers (camera, phone,
online-account monitors) are masked, and with the station the desktop logs in by itself and
the screen never blanks.

**Power supply:** use a proper 5.1 V / 2.5 A supply (e.g. the official one). With a weak supply
or a thin cable the Pi slows down and the Wi-Fi can drop; `vcgencmd get_throttled` shows
`0x0` when all is well.

## 3. Test (5 minutes, do it before the party)

1. On the Pi's admin screen (or a laptop on the Kart Cup Wi-Fi at **http://kartcup.lan**):
   create a test tournament, *Home → Start phone sign-up*, then **Show QR code**.
2. (The QR codes are also on the TV window and in the phone card on Home.)
3. Phone: scan the **left** QR code with the camera → "Join Kart Cup?" → join. The sign-up page
   opens by itself (iPhone: a sheet; Android: tap the **"Sign in to Wi-Fi network"** notification).
   Sign up "Test".
4. Within two seconds "Test" appears on the laptop. On the Pi's screen the station shows the same QR codes.

## On the party day

* Switch on the Pi (and its screen). Organizer: laptop on the Kart Cup Wi-Fi, open **http://kartcup.lan**.
* *Start phone sign-up*; the TV shows the QR codes while registration is open.
* When everyone is there: **Start racing** (heat size, format, Grand Prix or VS races).
* The tournament lives in the organizer's browser as before: export a backup now and then.

## If something doesn't work

| Problem | Check |
|---|---|
| The phone joins the Wi-Fi but no page opens | Android: pull down the notifications and tap **"Sign in to Wi-Fi network"**. Opening `kartcup.lan` in the browser only works when mobile data is off (or the Pi has a router cable): otherwise the phone sends the browser over mobile data. |
| "Kart Cup" Wi-Fi doesn't appear | `systemctl status kart-cup-hostapd` and `journalctl -u kart-cup-hostapd -n 50` on the Pi |
| The laptop says "Server not reachable" | Laptop on the Kart Cup Wi-Fi? `systemctl status kart-cup` on the Pi. |
| Guests have no internet on the Kart Cup Wi-Fi | Only with a router cable on the Pi. Without, it's sign-up only (phones may switch back to mobile data). |
| The admin screen doesn't open after boot | Run `kart-cup-desk` in a terminal; install Chromium if missing: `sudo apt install chromium` |
| Logs | `journalctl -u kart-cup -n 50` (the server logs no IP addresses) |

To go back to the Pi's normal Wi-Fi: see the note under step 2.

## Update to a new version

Copy the new `kart-cup-server` folder onto the Pi (USB stick or the SD card's bootfs) and run
`sudo bash install.sh` in it again. The Wi-Fi password stays the same.
