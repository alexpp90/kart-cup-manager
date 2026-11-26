# Requirements

Every requirement of `docs/spec.md` (the original brief, read-only) and every rule of `DECISIONS.md`
has a stable ID. Tests name the IDs they cover in their title, e.g.
`it('[REQ-ENG-004] bye only for 5 at max 4', …)`. `npm run trace:check` reads the table below,
scans the tests and writes `docs/traceability.md`. It **fails if a `must` requirement tagged `auto`
has no test**. Requirements tagged `manual` are verified with the checklist in `docs/manual-test.md`.

Columns: **ID** · statement · **source** (`Spec` = section of docs/spec.md, `D§n` = DECISIONS.md section) ·
**priority** (`must` / `should`) · **kind** (`auto` / `manual`).

> Table format is machine-read. Keep one requirement per row, keep the five columns.

## Engine (REQ-ENG)

| ID | Requirement | Source | Prio | Kind |
|---|---|---|---|---|
| REQ-ENG-001 | Number of heats in a round is `ceil(n / max)` for n = 3..64 at max 4 and 8. | Spec: Engine › Heat splitting; D§3 | must | auto |
| REQ-ENG-002 | Heat sizes differ by at most 1, bigger heats first (30@8 → 8,8,7,7; 30@4 → 4×6 + 3×2). | Spec: Engine › Heat splitting; D§3 | must | auto |
| REQ-ENG-003 | No heat has fewer than 3 players; fewer than 3 players cannot make a round and the user gets a clear message. | Spec: Engine › Heat splitting; D§3 | must | auto |
| REQ-ENG-004 | 5 players at max 4 (only case where 3+2 would appear): one player sits out (bye) and 4 race; the bye goes to whoever played the most heats. | D§3 | must | auto |
| REQ-ENG-005 | Pairing repeat score is the sum over all pairs of (previous meetings)². | Spec: Engine › Pairing; D§4 | must | auto |
| REQ-ENG-006 | Pairing uses a greedy pass with randomized restarts (200) and a swap polish; it is deterministic for a given seed and reduces repeats vs. a naive split. | Spec: Engine › Pairing; D§4 | must | auto |
| REQ-ENG-007 | From round 2 on, the strongest players are spread across heats (light seeding by current rank). | Spec: Engine › Pairing; D§4 | should | auto |
| REQ-ENG-008 | Where possible a player from the previous round's last heat is not in the new first heat (no back-to-back). | Spec: Engine › Pairing; D§4 | should | auto |
| REQ-ENG-009 | Heats have a play order and a queue; the organizer can swap the order of unplayed heats only. | Spec: Engine › Heat order | must | auto |
| REQ-ENG-010 | A player can be moved between two unplayed heats of the same round only if every heat stays within 3..max and the size spread does not grow. | Spec: Engine › Heat order; D§5 | must | auto |
| REQ-ENG-011 | Replaced by REQ-FMT-011. (Was: default points 8-player heats 15-12-10-8-6-4-2-1, 4-player heats 10-6-3-1; both tables editable.) | Spec: Engine › Points; D§6 | must | auto |
| REQ-ENG-012 | Heats smaller than the max use the top of the points table. | D§6 | must | auto |
| REQ-ENG-013 | Per-race entry: the last finisher is filled in automatically; running heat total = sum of race points. | Spec: Engine › Result entry A | must | auto |
| REQ-ENG-014 | Result validation: no duplicate places, everyone ranked, no unknown players, for both entry modes. | Spec: Engine › Result entry | must | auto |
| REQ-ENG-015 | Per-race equal heat totals are split by countback (more 1sts, 2nds, …) then last race, so a per-race heat always has a unique placing. | D§6 | must | auto |
| REQ-ENG-016 | Console-totals entry uses the typed points as-is; equal totals are ordered by the organizer (manual tie order is kept). | Spec: Engine › Result entry B; D§6 | must | auto |
| REQ-ENG-017 | Any saved heat can be edited or cleared and all standings, heat placings and the bracket recompute from raw results. | Spec: Engine › Result entry; D§1 | must | auto |
| REQ-ENG-018 | Qualifying rank is by average points per heat played (exact comparison), so late joiners are not punished. | Spec: Engine › Ranking; D§7 | must | auto |
| REQ-ENG-019 | Finals eligibility needs at least `ceil(rounds/2)` heats and a non-withdrawn player. | Spec: Engine › Ranking; D§7 | must | auto |
| REQ-ENG-020 | Tiebreakers in order: average → heat wins → best single heat → head-to-head → sudden death. | Spec: Engine › Ranking; D§7 | must | auto |
| REQ-ENG-021 | Sudden death is demanded only when an unresolved tie straddles the finals cut or the Last Chance cut; elsewhere tied players share a rank. | D§7 | must | auto |
| REQ-ENG-022 | Every tie result carries its deciding reason (criterion + both values) for the tooltip. | Spec: Engine › Ranking; D§7 | should | auto |
| REQ-ENG-023 | Position change arrows compare to the standings before the latest round with results; first-time players are "New". | Spec: Screens › Standings; D§7 | should | auto |
| REQ-ENG-024 | Names are unique ignoring case and surplus spaces; empty names are rejected. | Spec: Core flow › Registration; D§5 | must | auto |
| REQ-ENG-025 | Only checked-in/active players go into a generated round; they become active when the round is saved; registered no-shows are listed as skipped. | D§5 | must | auto |
| REQ-ENG-026 | A late player joins from the next generated round (`joinedRound`); if the current round has an unplayed heat below max, that slot is offered and can be accepted. | Spec: Engine › Late registration; D§5 | must | auto |
| REQ-ENG-027 | A player who registers after qualifying ended cannot enter the finals (no heats → not eligible). | Spec: Core flow › Registration; D§5, D§7 | must | auto |
| REQ-ENG-028 | Withdrawal removes the player from every unplayed heat and all future rounds; past results stay on record and in standings. | Spec: Engine › Withdrawal; D§5 | must | auto |
| REQ-ENG-029 | A withdrawn player can be reinstated and rejoins with the next generated round; a player can only be deleted while they never raced. | D§5 | must | auto |
| REQ-ENG-030 | The next round can only be generated when the current round is complete, and not beyond the planned number of rounds or after finals started. | Spec: Screens › Round view; D§8 | must | auto |
| REQ-ENG-031 | Finals stage config `{name, fieldSize, heatSize, advancePerHeat, wildcards}` is validated (numbers add up, heat size 3..max, last stage = one heat, enough players, Last Chance pool ≥ 3). | Spec: Engine › Finals; D§8 | must | auto |
| REQ-ENG-032 | Snake seeding distributes 1,4,5,8… / 2,3,6,7… | Spec: Engine › Finals; D§8 | must | auto |
| REQ-ENG-033 | Presets: max 8 Top 16 → 2 semis → GF of 8; max 4 Top 16 → 4 QF → 2 SF → Final of 4; small fields choose a valid preset automatically (valid for 3..64 eligible, with/without Last Chance). | Spec: Engine › Finals; D§8 | must | auto |
| REQ-ENG-034 | Optional Last Chance heat: best non-qualifiers race for 1–2 wildcard spots; auto-off if the pool is too small. | Spec: Engine › Finals; D§8 | must | auto |
| REQ-ENG-035 | Finals points start fresh: advancement is by placing inside the heat, then points, then previous seed; Grand Final placing decides the podium. | Spec: Engine › Finals; D§8 | must | auto |
| REQ-ENG-036 | Editing an earlier finals result re-seeds a later stage as long as that stage has not been raced. | D§8 | must | auto |
| REQ-ENG-037 | Finals can start once the current round is complete (warning if fewer rounds than planned); finals can be cancelled while no finals heat has a result; an extra qualifying round can be added. | D§8 | should | auto |
| REQ-ENG-038 | Final standings: Grand Final places, then earlier knockouts (later stage first), then Last Chance losers, then the rest in qualifying order. | D§8 | must | auto |
| REQ-ENG-039 | Cup picker modes none / random cup / random 4 tracks / organizer picks; Booster Course Pass toggles 12 vs 24 cups; no repeats until all are used, derived from heats so undo/edit stay consistent. | Spec: Engine › Track/cup picker; D§9 | must | auto |
| REQ-ENG-040 | Replaced by REQ-PLAN-001. (Was: time estimate = heats × races × minutes per race + changeover per heat.) | Spec: Core flow › Setup; D§13 | must | auto |
| REQ-ENG-041 | Every active checked-in player sits in exactly one heat per round (or has the documented bye), for any player count 4–64, with late joins/withdrawals/edits. | Spec: Engine; D§3, D§5 (property) | must | auto |
| REQ-ENG-042 | Heat sizes stay valid (3..max, spread ≤ 1) in every generated round. | Spec: Engine; D§3 (property) | must | auto |
| REQ-ENG-043 | No withdrawn player appears in any unplayed or future heat. | Spec: Engine › Withdrawal (property) | must | auto |
| REQ-ENG-044 | Standings are deterministic and identical when recomputed after any result edit and revert. | D§1, D§7 (property) | must | auto |
| REQ-ENG-045 | Points sums per heat equal the points table for the placings (both entry modes). | Spec: Engine › Points (property) | must | auto |
| REQ-ENG-046 | Finals seeding follows the qualifying standings (snake over the ranked eligible players). | Spec: Engine › Finals (property) | must | auto |
| REQ-ENG-047 | CSV export: UTF-8 BOM, comma separated, localized headers, one row per player with rank, played, points, average, wins, best, eligible, status; quotes/commas/emoji in names are escaped. | Spec: Tech; D§10 | must | auto |
| REQ-ENG-048 | "Load demo data" creates 30 fake racers with round 1 simulated. | Spec: Screens › Settings; D§13 | should | auto |
| REQ-ENG-049 | Engine functions are pure: they never mutate their input tournament. | Spec: Tech; D§1 | must | auto |

## Formats, planner and timing (REQ-FMT, REQ-PLAN, REQ-TIME, REQ-ARCH)

Added with the v2 work (plan in `docs/plan-v2.md`, rules in DECISIONS §15). "S" is the heat size.

| ID | Requirement | Source | Prio | Kind |
|---|---|---|---|---|
| REQ-FMT-001 | Heat size S is 2–8 (number of controllers); one heat is one cup of 4 races. Heat size and format are locked once the first round exists. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-002 | The suggested format is League when everyone fits into one heat (n ≤ S) and Knockout cups otherwise; Classic stays available for S ≥ 3. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-003 | League: every cup is one heat with everyone; 1–10 cups (default 3); ranked by total points, then more cup wins, more 2nd places, …, then the better place in the latest cup both raced; a tie for a podium place goes to sudden death. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-004 | Knockout round 1: `ceil(n/S)` heats, sizes differ by at most 1, largest first, random draw with a redraw in the preview. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-005 | The top X of each heat advance; X can be set per round from 1 to (smallest heat − 1), default ⌊S/2⌋ clipped to that range. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-006 | Fill-ups by the best of the rest: next field F = min(ceil(A/S)·S, A + heats, field − heats) with A = advancers; fill-ups are ranked by heat points, then place; a tie on the cut line needs sudden death before the next round. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-007 | Fill-up mode Last Chance (the best of the rest, up to S, race one extra heat for the fill-up places) or Off. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-008 | Rounds after the first are seeded by snake order of the previous round's result (place, then points), fill-ups last; a field of S or fewer races the final (one heat). Fill-ups carry a "lucky loser" mark. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-009 | Heat size 2 with an odd field: one bye (random in round 1, top seed later); the bye player advances and races in the next round. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-010 | Knockout late sign-ups take a free seat in an unplayed round-1 heat; after that registration is closed. An advancer who withdraws is replaced by the next best of the rest. Edits re-seed or drop a later round that nobody has raced yet. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-011 | One points table for every heat size, default 15-12-10-9-8-7-6-5, editable. Result entry once per heat: console totals (default), final ranking only (table[place] × races), or per race. | Brief v2 §1; D§15 | must | auto |
| REQ-FMT-012 | For every n = 2..64, S = 2..8 and every uniform X (plus random X per round): the plan ends in exactly one final heat; heats are 2..S with spread ≤ 1; the field shrinks every round; next field = advancers + fill-ups with fill-ups ≤ heats; everyone races in round 1 or, after a bye, in round 2; the reference cases of the plan are exact. | Brief v2 §1 (property) | must | auto |
| REQ-FMT-013 | A simulated knockout tournament (random results, any n, S, X, fill mode) follows its plan heat for heat and ends with a podium; every player races at least one cup. | Brief v2 §1 (property) | must | auto |
| REQ-FMT-014 | Final standings: knockout by the final's places, then by the round players went out in (later first, then Last Chance place, points, place); league by the league table. | D§15 | must | auto |
| REQ-PLAN-001 | Time per heat = races × minutes per race + cup overhead + changeover (default 4 × 3 + 3 + 2 = 17 min); plan time = heats (incl. Last Chance heats) × time per heat. | Brief v2 §1; D§15 | must | auto |
| REQ-PLAN-002 | Replaced by REQ-UI-031. (Was: the setup has a planner step with diagram, breakdown and end time.) | Brief v2 §1 | must | auto |
| REQ-PLAN-003 | Over 3 hours or over the time available the planner warns and lists cheaper variants computed from the settings (fewer advancing, no fill-ups / no Last Chance, fewer cups or rounds, knockout instead of classic), each with the time saved, the ones that fit first. | Brief v2 §1 | must | auto |
| REQ-PLAN-004 | Replaced by REQ-UI-031. (Was: Home shows the live plan for the real number of players and the difference to the setup plan; with sign-up first the plan is made with the real players.) | Brief v2 §1 | should | auto |
| REQ-TIME-001 | Heat times are measured between consecutive first saves (the first heat from when its round was created); gaps over 2.5× the estimate are breaks; corrected minutes per heat = (2 × guess + Σ measured) / (2 + measured heats). | Brief v2 §1; D§15 | must | auto |
| REQ-TIME-002 | Home and the big screen show minutes per heat (and how many heats were measured), heats left and the expected end time. | Brief v2 §1 | must | auto |
| REQ-ARCH-001 | Every tournament change from the screens goes through `dispatch(command)`; `applyCommand` is pure, validates its input and rejects invalid commands without changing state. | Brief v2 §2; D§15 | must | auto |

## Kart Cup server and phone sign-up (REQ-HOST, REQ-SEC)

Phase 3a of the v2 work (DECISIONS §17). Hosting option A: the server runs on a device on the party
network (a Raspberry Pi 3 at the user's request, or a laptop). The organizer's browser stays the
source of truth for the tournament.

| ID | Requirement | Source | Prio | Kind |
|---|---|---|---|---|
| REQ-HOST-001 | `server.mjs` (Node 18+, no dependencies) serves the app with a server marker and strict headers, starts sign-up sessions with a 6-character join code (no 0/O/1/I/L) and a 128-bit admin key, stores each session as a file written atomically (only a hash of the key), keeps them across restarts and deletes them when they expire. | Brief v2 §2; user 2026-11-26; D§17 | must | auto |
| REQ-HOST-002 | Phone sign-up: the organizer starts it on the Players page and gets a QR code, the join code and the link; the big screen shows the QR code while registration is open; a guest signs up on the phone (name, tag, colour) and appears in the organizer's player list within seconds; taken names, closed registration and a stopped session are refused with a clear message. | Brief v2 §2; user 2026-11-26 | must | auto |
| REQ-HOST-003 | Sign-up form for the server's own screen (`#/desk`, mouse and keyboard) with the same QR codes; it works only on the server itself; before sign-up starts it shows the organizer how to begin (Wi-Fi, address, next step). | User 2026-11-26; D§17, D§19 | must | auto |
| REQ-HOST-004 | QR codes are generated in the app by its own encoder (byte mode, level M, versions 1–10) and read back exactly. | Brief v2 §2 (no third-party requests) | must | auto |
| REQ-HOST-005 | The offline single file and any copy not served by the Kart Cup server make no network request and explain that phone sign-up needs the server. | Brief v2 §2 | must | auto |
| REQ-HOST-006 | On a Raspberry Pi 3 the installer sets up the server as a service on port 8080 and the station full screen; a real phone scans the QR code and signs up. | User 2026-11-26 | must | manual |
| REQ-HOST-007 | Captive sign-up: on the Pi's own "Kart Cup" Wi-Fi, phones' connection checks and any unknown host are sent to the sign-up page (`/join` → the newest session), so joining the Wi-Fi opens the sign-up page by itself. | User 2026-11-26; D§18 | must | auto |
| REQ-HOST-008 | One QR code on the TV and the station joins the Pi's Wi-Fi (WIFI: format with the generated password); a second, smaller one opens the page for phones already on it. Pages are reached by name (`http://kartcup.lan`, port 80), never by IP. | User 2026-11-26; D§18 | must | auto |
| REQ-HOST-009 | The Pi installer creates the "Kart Cup" Wi-Fi hotspot (WPA2, random password), local names for kartcup.lan and the connection-check hosts, runs the server on port 80, and keeps the cable to a router optional (guests then keep internet). | User 2026-11-26; D§18 | must | manual |
| REQ-HOST-010 | The Pi's own screen opens the organizer's admin screen full screen after boot (players, sign-up, races); "Show QR code" puts the join QR codes across the whole screen for guests. | User 2026-11-26; D§19 | must | auto |
| REQ-HOST-011 | The Pi's "Kart Cup" Wi-Fi runs with hostapd (plain WPA2-PSK, CCMP) and dnsmasq (addresses, names, captive-portal DHCP option 114); NetworkManager leaves wlan0 alone; a laptop or phone joins with the password and gets an address, the name and the sign-up redirect. | User 2026-11-26; D§19 | must | manual |
| REQ-HOST-012 | Updating the app on the Pi needs no password and no restart: the app files belong to the Pi user, and the server serves a changed index.html at once. | User 2026-11-26; D§20 | should | auto |
| REQ-SEC-001 | Everything a guest sends is treated as hostile: JSON only, bodies ≤ 16 KB, names ≤ 24 and tags ≤ 8 characters as people see them, control and bidi characters removed, colours only from the palette; admin requests need the key, compared in constant time; guests never see it. | Brief v2 §2 | must | auto |
| REQ-SEC-002 | Rate limits and caps: ≤ 10 sign-ups per minute per device and ≤ 30 per session, ≤ 20 wrong codes per 10 minutes per device, ≤ 5 new sessions per hour per device, a cap on open sessions, ≤ 64 players per session. | Brief v2 §2 | must | auto |
| REQ-SEC-003 | The server makes no outgoing requests and logs no IP addresses. | Brief v2 §2 | must | auto |

## UI and journeys (REQ-UI)

| ID | Requirement | Source | Prio | Kind |
|---|---|---|---|---|
| REQ-UI-001 | Replaced by REQ-UI-030. (Was: setup wizard collects name, date, max per heat, races, qualifying rounds, finals format, points table, entry mode, track mode, and shows a live time estimate.) | Spec: Core flow 1 | must | auto |
| REQ-UI-002 | Replaced by REQ-UI-027. (Was: Kiosk "Join the Race!": name (required, unique), tag, avatar + color, favourite; kiosk sign-ups are checked in automatically (setting).) | Spec: Core flow 2; D§5 | must | auto |
| REQ-UI-003 | Quick add: paste names one per line; duplicates and blanks are skipped; option to check in right away. | Spec: Core flow 2; D§5 | must | auto |
| REQ-UI-004 | Players screen: list, search, check-in toggle, edit, withdraw (with confirmation), reinstate. | Spec: Screens 2 | must | auto |
| REQ-UI-005 | Home shows the phase indicator, the next heat in large letters ("Now racing"), "Up next", and quick actions. | Spec: Screens 1 | must | auto |
| REQ-UI-006 | Round view: heat cards with avatars/cup/status; preview with "regenerate" before saving; the next round only when the current one is complete. | Spec: Screens 3 | must | auto |
| REQ-UI-007 | Result entry per race: tap in finishing order, running heat total, next race opens automatically; fully usable by keyboard (1–9, Backspace). | Spec: Screens 4; D§6 | must | auto |
| REQ-UI-008 | Result entry console totals, with tie-order arrows when totals are equal; the mode can be switched per heat. | Spec: Screens 4; D§6 | must | auto |
| REQ-UI-009 | Standings: live leaderboard with ▲▼ arrows, qualification cut line, finals status and tie tooltip. | Spec: Screens 5 | must | auto |
| REQ-UI-010 | Finals screen: editable stage table, qualified seeds, sudden-death dialog for cut ties, start finals (confirmed), visual bracket. | Spec: Screens 6; D§8 | must | auto |
| REQ-UI-011 | Last Chance heat appears before the first finals stage and its winners fill the wildcard spots. | Spec: Engine › Finals | must | auto |
| REQ-UI-012 | Podium ceremony: top 3 podium with confetti and the final standings table. | Spec: Screens 8 | must | auto |
| REQ-UI-013 | Cup roulette animation shows the picked cup/tracks; the pick happens on "Spin". | Spec: Engine › Track/cup picker; D§9 | must | auto |
| REQ-UI-014 | Late arrivals: organizer-added players get a dialog offering the free slot; kiosk sign-ups show a "Late arrivals" banner. | D§5 | must | auto |
| REQ-UI-015 | A player who signs up after qualifying ended is told they will not be in the finals and why. | Spec: Core flow 2; D§5 | must | auto |
| REQ-UI-016 | Big screen (`#/big`): second window, only listens and never writes storage, shows Now racing/Up next, leaderboard pages, registration grid, roulette and podium; no controls. | Spec: Screens 7; D§11 | must | auto |
| REQ-UI-017 | Big screen survives being closed and reopened mid-heat and follows the live state. | Spec: Screens 7; D§11 | must | auto |
| REQ-UI-018 | Settings screen: edit settings (max per heat locked once a round exists), export/import JSON, export CSV, reset (type the name), demo data, sound, language. | Spec: Screens 9; D§13 | must | auto |
| REQ-UI-019 | Moving a racer and swapping heat order are available on unplayed heat cards. | Spec: Engine › Heat order | must | auto |
| REQ-UI-020 | Very long, emoji and RTL names render without breaking layout or functions. | Quality bar (robustness) | should | auto |
| REQ-UI-021 | Layouts work at 1366×768 (organizer), tablet (kiosk) and 1080p (big screen). | Spec: Visual › Layouts | should | auto |
| REQ-UI-022 | Palette tokens (red #E60012, sky blue, gold, green, navy), Lilita One + Nunito, pill buttons with 3D shadow, tilted ribbons, checkered accents: bright, bouncy, "Nintendo-like" but original. | Spec: Visual design; D§12 | should | manual |
| REQ-UI-023 | Springy micro-animations (button press, card entry, leaderboard reorder, roulette, confetti) feel good. | Spec: Visual › Motion | should | manual |
| REQ-UI-024 | No official logos, sprites, fonts or audio; app name contains neither "Mario" nor "Nintendo"; the single-file build makes no external network requests. | Spec: Visual › Legal | must | auto |
| REQ-UI-025 | Sound is optional, off by default, synthesized; toggling it is remembered and does not touch tournament data. | Spec: Visual › Sound; D§12 | should | auto |
| REQ-UI-026 | Time estimate and "time left" are shown on setup and Home. | D§13 | should | auto |
| REQ-UI-027 | Kiosk "Join the Race!": name (required, unique), optional gamer tag and badge colour (the least-used colour is preselected); no character choice and no favourite character, because players pick their character on the console; kiosk sign-ups are checked in automatically (setting). | User 2026-11-26; D§16 | must | auto |
| REQ-UI-028 | Players are shown everywhere as a badge in their colour with their initials (unique within the tournament where the names allow; earlier sign-ups keep theirs) and readable text colour; marks from the state: crown for the leader or champion, flames for 2+ heat wins in a row, clover for a lucky loser. | User 2026-11-26; D§16 | must | auto |
| REQ-UI-029 | Every heat shows which player takes which controller (1–8) on the round preview, heat cards, Home, result entry and the big screen; result entry lists players in controller order and the number keys are the controller numbers. A late joiner gets the lowest free number; nobody's number changes when someone is moved, withdraws or joins. | User 2026-11-26; D§16 | must | auto |
| REQ-UI-030 | Sign-up comes first: a new tournament needs only a name (and date), then sign-up starts at once (kiosk, phones, station). Heat size, format and race settings are chosen when racing starts; points, times and the rest live in Settings. | User 2026-11-26; D§18 | must | auto |
| REQ-UI-031 | "Start racing" shows the checked-in players, lets the organizer choose the heat size (2–8), the format (suggested from the players), knockout options and the first round's race mode, with the plan (diagram per round, time, end time, warning and shorter options), then draws round 1. | User 2026-11-26; D§18 | must | auto |
| REQ-UI-032 | A "Late sign-ups" switch: on, people can still sign up after racing started (they join where the format allows); off, kiosk, phones and the station say registration is closed once round 1 exists. | User 2026-11-26; D§18 | must | auto |
| REQ-UI-034 | Icons are drawn as SVG (interface symbols and one emblem per cup); the screens and texts use no emoji, so they show on screens without a colour-emoji font (the Raspberry Pi showed empty boxes). | User 2026-11-26; D§20 | must | auto |
| REQ-FMT-015 | Every round has a race mode chosen when it is drawn: Grand Prix (a cup of 4 races) or VS races (1–32 races), and a class (50/100/150/200cc, Mirror). Round 1 defaults to Grand Prix 150cc; later rounds default to the previous round's choice. Result entry, points (final order only: table × races) and time estimates use the round's number of races; Home, heat cards and the TV show mode, class and cup. | User 2026-11-26; D§18 | must | auto |

## Data and persistence (REQ-DATA)

| ID | Requirement | Source | Prio | Kind |
|---|---|---|---|---|
| REQ-DATA-001 | Every change is autosaved to localStorage immediately; reload loses nothing confirmed. | Spec: Tech; Quality bar | must | auto |
| REQ-DATA-002 | A tab close or browser kill at any step of a heat entry loses no confirmed (saved) result. | Task §4 | must | auto |
| REQ-DATA-003 | Half-entered heats are kept as per-heat drafts and restore after reload/kill, in both entry modes. | D§6 | must | auto |
| REQ-DATA-004 | Two windows of the app edit the same tournament without silent loss: writes are serialized through storage, the other window adopts newer data live and tells the user. | Task §4 | must | auto |
| REQ-DATA-005 | localStorage full: no crash, oldest undo snapshots are dropped first, and if the tournament itself cannot be saved a persistent warning offers a backup export; existing stored data is not wiped. | Spec: Tech; D§10 | must | auto |
| REQ-DATA-006 | localStorage unavailable/throwing (private mode): no crash, the app works in memory, shows a clear message and keeps export possible. | Task §4 | must | auto |
| REQ-DATA-007 | Corrupted stored JSON: no crash, no wipe; a recovery screen offers downloading the damaged data, importing a backup or starting fresh; a copy is kept. | Task §4 | must | auto |
| REQ-DATA-008 | Valid JSON with missing fields is repaired with defaults (and reported); structurally broken data goes to the recovery path instead of crashing. | Task §4 | must | auto |
| REQ-DATA-009 | Data carries a schema `version`; older/unversioned backups migrate to the current schema; backups from a newer app are rejected with a clear message. | Task §4 | must | auto |
| REQ-DATA-010 | Export → wipe → import is lossless (deep-equal tournament). | Spec: Tech; Task §4 | must | auto |
| REQ-DATA-011 | Importing an invalid or foreign file is rejected with a message without touching current data. | Spec: Tech; Task §4 | must | auto |
| REQ-DATA-012 | Import asks for confirmation before overwriting an existing tournament. | Spec: Tech (destructive confirm); D§10 | must | auto |
| REQ-DATA-013 | Undo keeps the last 30 snapshots, shows what will be undone, and the history survives a reload. | Spec: Tech; D§10 | must | auto |
| REQ-DATA-014 | Undo across import, reset, demo and finals start reverts that action as exactly one step (documented). | D§10 | must | auto |
| REQ-DATA-015 | Leave warning appears only when changes are newer than the last export (importing counts as exported). | Spec: Tech; D§10 | must | auto |
| REQ-DATA-016 | Different origins keep separate data (file:// vs http://, `.nord` name vs IP); this is documented and the current origin is shown in Settings. | Task §4; D§11 | must | auto |
| REQ-DATA-017 | Ids, change tracking and the leave warning do not depend on the system clock being correct. | Task §4 | must | auto |
| REQ-DATA-018 | Backup format `{app, version, exportedAt, tournament}`; CSV and JSON file names are slugged. | D§10 | must | auto |
| REQ-DATA-019 | Destructive actions (withdraw, delete player/result, import, demo, cancel/start finals, reset) go through a confirmation dialog; reset requires typing the name. | Spec: Tech; D§10 | must | auto |
| REQ-DATA-020 | Language and sound preferences persist across reloads and are not undoable actions. | D§10, D§13 | should | auto |
| REQ-DATA-021 | Big screen window never writes to storage. | D§11 | must | auto |
| REQ-DATA-022 | Autosave is not blocked by an unrelated failing draft or prefs write. | Task §4 | should | auto |
| REQ-DATA-023 | Schema version 2: stored data and backups of version 1 open as Classic with heat size, the points table that was in use and the old timing, and compute the same standings and finals; version 2 data with invalid format fields is repaired. | Brief v2 §1; D§15 | must | auto |
| REQ-DATA-024 | Avatar and favourite fields of version 1 players stay in the data and in backups unchanged, but are not shown and not required. | D§16 | must | auto |
| REQ-DATA-025 | Schema version 3: version 2 data opens with a race setup (Grand Prix when it had 4 races per heat, else VS races), late sign-ups on and its format kept, without reported repairs. | D§18 | must | auto |

## Accessibility (REQ-A11Y)

| ID | Requirement | Source | Prio | Kind |
|---|---|---|---|---|
| REQ-A11Y-001 | The whole organizer flow is usable by keyboard; all controls are real buttons/inputs with visible focus. | Spec: Visual › Layouts; D§12 | must | auto |
| REQ-A11Y-002 | Heat result entry works keyboard-only (digits 1–9, Backspace, Tab to save). | D§12 | must | auto |
| REQ-A11Y-003 | Modals move focus in, trap Tab and close on Esc; focus returns afterwards. | D§12 | must | auto |
| REQ-A11Y-004 | `prefers-reduced-motion`: CSS animations collapse, confetti is skipped, roulette shows the result immediately. | Spec: Visual › Motion; D§12 | must | auto |
| REQ-A11Y-005 | WCAG AA contrast for text and controls. | Spec: Visual › Layouts; D§12 | must | manual |
| REQ-A11Y-006 | Skip link, landmarks, labelled form fields and live toasts; the tiebreak tooltip works on keyboard focus. | D§12 | should | auto |
| REQ-A11Y-007 | Big screen type is legible from 5 m (large type). | Spec: Screens 7 | should | manual |

## Internationalisation (REQ-I18N)

| ID | Requirement | Source | Prio | Kind |
|---|---|---|---|---|
| REQ-I18N-001 | All UI strings live in `src/i18n.ts`; default language is English. | Spec: Tech; D§13 | must | auto |
| REQ-I18N-002 | German is a complete second language: every key exists in both dictionaries with the same placeholders. | Spec: Tech | must | auto |
| REQ-I18N-003 | Switching language mid-event re-renders everything (also the big screen) without changing tournament data. | Spec: Tech; D§13 | must | auto |
| REQ-I18N-004 | The chosen language is remembered and set as `<html lang>`. | D§13 | should | auto |
| REQ-I18N-005 | CSV headers and status words follow the UI language. | D§10 | should | auto |

## Build (REQ-BLD)

| ID | Requirement | Source | Prio | Kind |
|---|---|---|---|---|
| REQ-BLD-001 | `npm run build` produces one self-contained `dist/index.html` (no external files) that works from `file://` and via http. | Spec: Tech; D§1 | must | auto |
| REQ-BLD-002 | The app works offline: no network request leaves the page while running a heat. | Spec: Tech; Context | must | auto |
| REQ-BLD-003 | TypeScript strict; engine in `src/engine/` has no React imports. | Spec: Tech | must | auto |

## Open discrepancies

Where the spec and the implementation disagree, or the spec is silent/ambiguous. Nothing here was changed
silently.

| # | Topic | Spec says | App does | Status |
|---|---|---|---|---|
| D-1 | Heat of fewer than 3 after rebalancing | "Never create a heat with fewer than 3 players: if that would happen, rebalance, and if it's impossible (n < 3), block it." | 5 players at max 4 cannot be rebalanced (4+1, 3+2); the app gives one player a bye so four race (D§3). | **Flagged.** The spec does not say what to do for 5@4; the bye is the only rule-compatible option. Kept. |
| D-2 | Withdrawal from a small unplayed heat | "Never create a heat with fewer than 3 players." Withdrawal: "excluded from future rounds". | Withdrawing from a 3-player unplayed heat leaves a 2-player heat (known limitation, D§5); the organizer can move someone in. | **Flagged**, spec silent about mid-round withdrawals. |
| D-3 | Late registration slot | "If the current round still has an unplayed heat with a free slot, offer to add them there." | Same. A free slot means below the max size, even if the heat is already "Now racing". | Consistent. Noted for organizers. |
| D-4 | Browser kill during heat entry (REQ-DATA-002) | Task §4: a tab close or browser kill loses no confirmed result. | Every save goes to localStorage synchronously, and the E2E test closes the tab without unload handling and reloads mid-heat. Chromium itself writes localStorage to disk with a short delay, so killing the whole browser process (or a power cut) right after a save can lose that last save. This is not covered by an automated test. | Known limitation, documented in DECISIONS §14. |
| D-5 | Character choice at sign-up (REQ-UI-002) | Spec: sign-up with avatar and favourite. | Name, tag and a colour badge with initials. | **Resolved 2026-11-26** (phase 2): no character choice in the app (players pick one in the game). REQ-UI-002 replaced by REQ-UI-027/028. |
