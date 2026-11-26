# Kart Cup server on a Raspberry Pi 3

The Pi runs the Kart Cup server: it serves the app to the organizer's laptop and lets guests sign up
by **scanning a QR code with their phone**. With a screen, mouse and keyboard on the Pi, it also shows
a **sign-up station** ("Join the Race!") as a fallback for guests whose phone can't scan or join the Wi-Fi.

The same two files (`index.html`, `server.mjs`) run on any other device with Node.js 18 or newer
(a laptop: `node server.mjs`), so nothing here ties the app to the Pi. This folder only adds the Pi's
auto-start and the station.

## What you need

* Raspberry Pi 3 Model B (or newer), power supply, micro SD card (8 GB or more; **it will be erased**).
* For the station: an HDMI screen, a USB keyboard and mouse.
* The router of the party. A network cable from the Pi to the router is the most reliable.

## 1. Put Raspberry Pi OS on the SD card (on your computer)

1. Install **Raspberry Pi Imager** (Linux: `sudo apt install rpi-imager`; or from raspberrypi.com).
2. *Device:* Raspberry Pi 3. *OS:* **Raspberry Pi OS (32-bit)** (with desktop; the 32-bit version needs less memory on the Pi 3's 1 GB).
   Use *Raspberry Pi OS Lite* instead if you don't want the station on a screen.
3. *Storage:* the micro SD card. Double-check it is the card and not another drive.
4. *Edit settings* (OS customisation): hostname `kartcup`, a user name and password of your choice,
   your Wi-Fi (only if you can't use a cable), your time zone and keyboard layout. Enable SSH if you
   want to install from your computer.
5. Write the card. Afterwards take it out and put it back in: a drive called **bootfs** appears.
6. Copy the whole **`kart-cup-server`** folder (from `dist/` after `npm run package:server`) onto **bootfs**.

## 2. Install on the Pi

1. Put the card in the Pi, connect the cable (or Wi-Fi), screen, keyboard and mouse, and switch it on.
   The first start takes a few minutes.
2. Open a terminal (or connect with `ssh <user>@kartcup.local`) and run:

   ```bash
   sudo bash /boot/firmware/kart-cup-server/install.sh
   ```

   Without a screen: `sudo bash /boot/firmware/kart-cup-server/install.sh --no-desk`.
3. The installer prints the address, for example `http://192.168.178.50:8080`. The server now starts
   by itself whenever the Pi is switched on. After the next login the station opens full screen;
   start it any time with `kart-cup-desk`, leave it with **Alt+F4**.

## 3. Give the Pi a fixed address

The QR code contains the Pi's address, so it should not change. In your router (e.g. a FRITZ!Box:
*Home Network → Network → the Pi → "Always assign this IPv4 address"*) reserve the address the Pi has now.

## 4. Test with your phone (2 minutes, do it before the party)

1. On the laptop, open the Pi's address (e.g. `http://192.168.178.50:8080`), create a test tournament,
   go to **Players → Phone sign-up → Start phone sign-up**.
2. Scan the QR code with your phone (on the same Wi-Fi). Sign up "Test". Within two seconds "Test"
   appears on the laptop.
3. On the Pi's screen, the station shows the same form and QR code. Sign up "Test 2" with the keyboard.

## On the party day

* Switch on the Pi (and its screen). Open the Pi's address on the organizer's laptop.
* Players → **Start phone sign-up**. The big screen shows the QR code while registration is open.
* Guests' phones must be on the **same network** as the Pi. A separate guest Wi-Fi often blocks this
  ("client isolation"): use the main Wi-Fi or a cheap travel router for the party.
* The tournament lives in the organizer's browser (as before): export a backup now and then.

## If something doesn't work

| Problem | Check |
|---|---|
| The phone says "No connection to the Kart Cup server" | Phone on the same Wi-Fi? Guest Wi-Fi with client isolation? Does `http://<Pi address>:8080` open on the phone? |
| The laptop says "Server not reachable" | Is the Pi on? `systemctl status kart-cup` on the Pi. |
| The QR code shows a wrong address | Reserve the address in the router, or set it fixed: `sudo systemctl edit kart-cup` and add `Environment=PUBLIC_URL=http://192.168.178.50:8080` |
| The station doesn't open after login | Run `kart-cup-desk` in a terminal; install Chromium if missing: `sudo apt install chromium-browser` |
| Logs | `journalctl -u kart-cup -n 50` (the server logs no IP addresses) |

## Update to a new version

Copy the new `kart-cup-server` folder to the Pi and run `sudo bash install.sh` in it again.
Running sign-up sessions are kept (`/var/lib/kart-cup`).
