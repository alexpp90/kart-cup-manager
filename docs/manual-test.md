# Manual test checklist

Requirements of kind `manual` in `docs/requirements.md` are checked here by a person, because a test
can't judge them (looks, feel, legibility at a distance). `npm run trace:check` fails if a `must`
manual requirement is missing from this file.

Run it before an event or a release: `npm run build`, open `dist/index.html` in Chromium (or Chrome),
load the demo (*Welcome → Load demo data*) and generate round 2. Note the date, the browser and the
result of each line.

| Done | ID | Check | How |
|---|---|---|---|
| ☐ | REQ-UI-022 | Bright, bouncy, original look: palette tokens (racing red #E60012, sky blue, gold, grass green, navy), Lilita One headings, Nunito body, pill buttons with a thick bottom shadow that press down, ribbon headers tilted by about 2°, checkered accents. No official logos, sprites or fonts anywhere. | Walk through Home, Players, Rounds, Standings, Finals, Settings, Kiosk and the big screen at 1366×768. |
| ☐ | REQ-UI-023 | Micro-animations feel springy and never get in the way: button press, card entry, leaderboard reordering after a saved heat, the cup roulette, confetti on the podium. | Save a heat and watch Standings; spin a cup; open the podium. Repeat with *prefers-reduced-motion* on (DevTools → Rendering) and check that everything appears at once. |
| ☐ | REQ-A11Y-005 | WCAG AA contrast (4.5:1 for text, 3:1 for large text and control borders) in both languages. Spot-check: grey helper text, white text on red/blue/navy, navy text on gold/green/sky, disabled buttons, the focus ring, toasts, the storage warning banner and the recovery screen. | Chromium DevTools → Inspect → contrast ratio in the colour picker, or the Lighthouse accessibility audit. |
| ☐ | REQ-A11Y-007 | The big screen reads from 5 m: race slide (now racing, up next), the leaderboard pages, roulette, podium. | Open the TV icon window on a TV or beamer at 1080p and stand 5 m away. |
| ☐ | REQ-HOST-006 | Raspberry Pi 3: `sudo bash install.sh` starts the server (port 8080) and, after login, the full-screen station; the server restarts after a reboot; a real phone on the same Wi-Fi scans the QR code from the laptop, the TV and the station and signs up; the player appears on the laptop. | Follow `deploy/raspberry-pi/README.md` steps 1–4 with the Pi and two phones (one Android, one iPhone). |
