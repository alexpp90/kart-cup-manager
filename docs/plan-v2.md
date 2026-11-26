# Plan: formats, hosted sessions, players, LAN party show

Status: **proposal, waiting for your go.** Nothing has been built or committed. This file is untracked;
I'll commit it on the branch with phase 1 as the design record.

Contents: 0 Starting point · 1 Format and timing · 2 Open game questions · 3 Players without characters ·
4 Hosted sessions and sync · 5 Hosting options · 6 The show (idea list) · 7 Results from the console ·
8 Phases · 9 What I need from you

---

## 0. Starting point (what I found)

- The build is **662 KB** (`dist/index.html`). I'll measure it again on the branch before I change anything.
- **The uncommitted work does not pass its own checks yet.** This matters because every phase has
  to end green:
  - `npm run trace:check` fails: **60 "must" requirements have no test**, and `docs/manual-test.md` is missing.
  - `npm run e2e` now runs `playwright test`, but there is no Playwright config and no spec file.
    The real E2E scripts are still the `e2e/*.mjs` scripts.
  - Four requirements are **not implemented at all**, not just untested: REQ-DATA-004 (two windows
    write without silent loss), -007 (recovery screen for corrupted storage), -008 (repair missing
    fields), -009 (schema `version`, migration, rejecting backups from a newer app). Today a corrupted
    store is silently replaced with an empty one.
- So I propose a **phase 0** before phase 1: get the existing app green. That means a Playwright
  config, porting the demo runs to specs with requirement IDs, tests for the uncovered musts, the
  four missing DATA behaviours, and `docs/manual-test.md`. Phase 1 needs schema versioning and
  migration anyway ("old backups must still open").

---

## 1. Format and timing

### 1.1 Terms

- **S** = heat size = number of controllers, **2–8**.
- **Heat = one cup** = 4 races at 150cc.
- **Minutes per heat** = 4 × race (3) + cup overhead (3) + changeover (2) = **17**. All three numbers
  can be edited. "Cup overhead" is a new setting.
- **Points table**: one table for every heat size, default **15-12-10-9-8-7-6-5** (the game's places 1–8).
  Heats smaller than 8 use the top of the table, as today. It stays editable.

### 1.2 Entering a result (once per heat by default)

| Mode | What you type | Heat points | Default |
|---|---|---|---|
| Console totals | each player's cup total from the console | as typed | **yes** |
| Final ranking only | tap the humans in final cup order | table[place] × 4 (same scale as a cup where you finished that place every race) | |
| Per race (optional) | tap the order after every race, as today | sum of race points | |

Console totals is the default because it gives both the order and the points in one pass, even
with computer racers in the field. Equal totals keep today's "who was ahead?" arrows.

### 1.3 Which format

| Players vs heat size | Default format | Also possible |
|---|---|---|
| n ≤ S (everyone fits into one heat) | **League** | Classic |
| n > S | **Knockout cups** | Classic |

**Classic** is today's format (qualifying rounds by average, then finals). It keeps its rules. Its
finals presets generalise to heat sizes 3–8; the 4 and 8 presets stay exactly as they are, so old
backups compute the same result.

### 1.4 League (n ≤ S)

- Every cup, everyone races together. Default 3 cups, configurable 1–10.
- The total points decide. Ties: more cup wins, then more 2nd places, and so on, then the better
  result in the last cup. If it is still tied for a podium place, the existing sudden death decides.
- Someone who arrives late joins from the next cup if a seat is free and is ranked by total. The app
  warns that they started late.

### 1.5 Knockout cups (n > S)

**Round 1:** everyone is split into `ceil(n/S)` heats. Sizes differ by at most 1, largest first.
The draw is random, and the preview has "Redraw", like "Regenerate" today.

**Advancing:** the top X of each heat go on. X can be set per round, from 1 to (smallest heat − 1).
The default is ⌊S/2⌋.

**Fill-ups ("best of the rest"):** the next round's field size is

```
A = advancers (Σ min(X, heat size))
F = min( ceil(A/S) × S,         ← fill the next round's heats completely
         A + heats in round,    ← at most one fill-up per heat, so most places are earned
         field − heats in round ) ← the field always shrinks, so the plan always ends
```

The F − A fill-ups are the best non-advancers. They are ranked by heat points, then by place in the
heat. A tie on the cut line triggers the existing sudden death. Instead of fill-ups by points, you
can choose **Last Chance**: the best non-advancers (up to S) race one extra heat for those spots.
That costs one heat (17 min) per round. Fill-ups can also be switched off.

**Later rounds:** snake seeding by the previous round's result (place, then points). Fill-ups come
last. Fill-ups get a visible "lucky loser" mark (🍀-style badge, self-drawn) in every table, card and on the TV.

**Heat size 2, odd number of players:** a heat of 1 is impossible, so one player gets a bye in that
round. The bye goes to a random player in round 1. That player still races in round 2, so
"everyone drives at least one cup" holds.

**Late sign-ups and withdrawals:**
- A late sign-up goes into an unplayed round-1 heat with a free seat. If there is none, the planner
  offers to re-split round 1's unplayed heats.
- Registration closes when the last round-1 heat starts.
- If a player who advanced withdraws, the next best of the rest moves up.

### 1.6 Worked examples (17 min per heat; I checked these with a prototype of the rule above)

| Players | S | X | Structure | Heats | Time |
|---|---|---|---|---|---|
| 8 | 8 | – | league of 3 cups | 3 | 51 min ✔ |
| 20 | 8 | 2 | [7,7,6] top 2 **+2 best others** → final of 8 | 4 | 68 min ✔ |
| 30 | 8 | 4 | [8,8,7,7] top 4 → 2 semis [8,8] top 4 → final of 8 | 7 | 119 min ✔ |
| 30 | 4 | 2 | [4×6, 3×2] top 2 → [4,4,4,4] top 2 → [4,4] top 2 → final of 4 | 15 | 255 min ⚠ warning |
| 20 | 8 | 4 | [7,7,6] top 4 +3 → [8,7] top 4 → final of 8 | 6 | 102 min |
| 30 | 8 | 2 | [8,8,7,7] top 2 → final of 8 | 5 | 85 min |
| 9 | 8 | 4→3 | [5,4] top 3 (4 is too many for a heat of 4) +1 → final of 7 | 3 | 51 min |
| 64 | 8 | 2 | [8×8] top 2 → [8,8] top 2 +2 → final of 6 | 11 | 187 min |
| 7 | 2 | 1 | [2,2,2] + bye → [2,2] → final of 2 | 6 | 102 min |

The 64/8/2 row shows the "one fill-up per heat" cap: the final has 6 players, not 8. If you'd rather
fill finals completely, that is a one-line rule change. Tell me.

### 1.7 The planner (setup step "Format", replaces today's "Basics" estimate)

- **Inputs:** expected players, heat size, format (auto suggestion), X per round, fill-ups
  (best of rest / Last Chance / off), optional "time we have" and start time.
- **Output:** a small diagram, one column per round:

  ```
  Round 1            Final
  [7] [7] [6]  ──▶   [8]
  top 2 each + 2 best others
  ```

  Below it is a breakdown table: "Round 1: 3 heats × 17 min = 51 min · Final: 1 × 17 = 17 min ·
  **Total 68 min · ends ≈ 20:38**".
- **Over the time you have:** the planner lists cheaper variants, computed rather than hand-written,
  sorted by cups per player, e.g. "Advance 2 instead of 4: saves 34 min", "Last Chance off: saves
  17 min", "League of 2 cups instead of 3: saves 17 min".
- **Warning** when the plan runs over 3 hours, or over the time you have (30 @ 4 → 4 h 15 min).
- **Re-plan:** on "Start round 1", the plan is rebuilt for the real number of checked-in players.
  Home shows the live plan and highlights the difference from the setup plan.

### 1.8 Time during the event

- The app measures each heat as the time between consecutive result saves. Gaps longer than
  2.5× the estimate count as breaks and are ignored. The first heat is measured from when it
  became "Now racing".
- Corrected minutes per heat = (2 × guess + Σ measured) / (2 + measured heats), so a single slow
  heat doesn't swing the estimate.
- Home and the TV show "≈ 19 min per heat (measured over 4 heats) · 3 heats left · ends ≈ 22:10".
- These are pure functions (`estimateRemaining(t, now)`), unit tested with fixed timestamps.

### 1.9 Engine changes and tests

- `src/engine/plan.ts` (planner, pure), `knockout.ts` (rounds, advancement, fill-ups, seeding),
  `league.ts`, and `schedule.ts` rewritten. Pairing, ranking and finals stay for Classic.
- Data model **version 2**: `settings.format`, `heatSize` (replaces `maxPerHeat`), one `points`
  table, `cupOverheadMinutes`, knockout settings. The migration from v1 maps
  `maxPerHeat` to `heatSize`, keeps the old table that was actually used, sets format Classic. Backups and localStorage from v1 open; files from a newer
  version are rejected.
- **Property tests**, for every n = 2..64, every S = 2..8 and every valid uniform X, plus fast-check
  for mixed X per round:
  - the plan ends in exactly one final heat;
  - heats are 2..S with spread ≤ 1;
  - the field shrinks every round;
  - next field = advancers + fill-ups, with fill-ups ≤ heats;
  - everyone races in round 1, or in round 2 with a bye;
  - time = heats × minutes per heat;
  - the reference cases are exact.
- Advancement, fill-up order, sudden death on the cut, withdrawal replacement and the measured
  estimate each get example tests.

---

## 2. Open game questions (please check on the console)

1. Which modes allow 5–8 players in split-screen? Grand Prix (cups) and/or VS Race? This decides
   whether "one heat = one cup" is real Grand Prix or 4 VS races.
2. Can computer racers be turned off in that mode?
3. With fewer than 12 karts (CPUs off), which points does the game give? Still 15-12-10-9…, or a
   shorter table? A photo of a 4-player cup result with CPUs off answers it.
4. With 8 humans (and CPUs on, if possible): does the results screen show every human's cup total?
5. For phase 7, later: photos of the cup results screen with 4 and with 8 players (section 7).

Until you answer, I build with: Grand Prix cups, totals typed as shown, and the 15-12-10-9-8-7-6-5
table for per-race and ranking-only entry.

---

## 3. Players without characters (changed 2026-11-26)

**Your decision:** nobody picks a character in the app. Everyone picks one in the game anyway, and
if the two differ, the app makes things more confusing, not less. So:

- **Dropped:** the driver builder (creature, helmet, kart, accessory), the avatar picker and the
  "favourite character" field at sign-up. Phase 2 shrinks to removing them.
- **What identifies a player instead:** the name, the optional gamer tag, and a colour badge with
  the initials. The app assigns the least-used colour automatically, so 30 players stay
  distinguishable; the organizer can change it. Nothing on the badge looks like a character.
- **Marks earned during the night stay** (crown for the leader, flames for 2+ heat wins in a row,
  clover for a lucky loser): they hang on the badge and come from the state.
- **Old backups:** the avatar and favourite fields are ignored (kept in the file, not shown); the
  old colour stays the badge colour.
- **Controller numbers** (your request, 2026-11-26): every heat shows which player takes which
  controller 1–8, and the numbers stay put when someone joins late, moves or withdraws. Built in phase 2.

## 4. Hosted sessions and sync

### 4.1 Start page

"Host a tournament" · "Join with a code" · "Play offline on this device".

The offline single file never probes the network. When the server serves the app, it injects a marker
into `index.html`. Without that marker, Host and Join are disabled with "Open the app from a Kart
Cup server to host (see README)", and offline works exactly as today.

### 4.2 Roles and links

| Role | Link | Can do |
|---|---|---|
| Admin | `/#/s/K7QF2M/admin/<key>` (the key is only in the fragment, which is never sent in a request line or logged) | everything the organizer does today, plus open/close registration, rename/remove a player, mute emotes, end the session |
| Guest | `/#/s/K7QF2M` (QR on the TV) | sign up, change their name, tag and colour until their first heat starts, send emotes, predict, watch |
| Screen | `/#/s/K7QF2M/screen` | read only |

- **Join code:** 6 characters from an unambiguous alphabet (no 0/O/1/I/L), about 10⁹ codes.
- **Admin key:** 128 random bits. The server stores only its SHA-256 hash, and the key is never sent
  to guests or screens. The browser that created the session keeps it in localStorage. The admin
  link reopens the session on another device or hands it to a co-organizer.
- **Guests:** sign-up returns a random guest token bound to the player. It is kept on that phone and
  is the only way to edit that player.

### 4.3 Sync design

- **Transport: Server-Sent Events for server → clients, plain `POST` for writes.** It needs no
  dependency, reconnects by itself (`EventSource`), passes proxies, and arrives well within a second.
- **Server = source of truth = an event log.** Clients send **commands** (`signUp`, `saveResult`,
  `generateRound`, …), not whole states. The server checks the role, validates, applies the pure
  engine, appends to the log, bumps `rev` and pushes the new state.
- **This means the UI refactor:** today screens call `apply(label, closure)` in 22 places. These become
  `dispatch(command)`. In offline mode, dispatch applies locally with today's snapshot undo. In
  hosted mode, it goes to the server. The engine gains `applyCommand(t, cmd)` (pure, tested), and the
  server uses exactly that function.
- **Undo without losing guests:** hosted undo marks the admin's last command as undone and rebuilds
  the state by replaying the log. A guest's sign-up after that command survives. A command that no
  longer applies after replay is dropped and the admin is told. A test covers "admin saves result,
  guest signs up, admin undoes".
- **Admin connection drop:** the admin client applies commands optimistically and keeps an **outbox**
  in localStorage. Each command has a client-generated id, and the server ignores duplicates.
  - Result entry never waits for the network.
  - The top bar shows **Live / Reconnecting… (2 changes waiting) / Offline**.
  - On reconnect the outbox is sent in order and the state resyncs.
  - A command the server rejects (e.g. a co-admin edited the same heat) is shown as a toast.
- **Guests get a redacted state:** no tokens, no admin data.
- **Persistence:** one JSON file per session, written atomically (temp file + rename), so a server
  restart loses nothing.
- **Expiry:** each session ends after a time the admin picks at creation (6 h / 24 h / 7 days). The
  server operator sets the maximum (env var). "End session" deletes it at once, after offering a
  backup download.

### 4.4 Hostile input (server side, unit tested)

- Nickname ≤ 24 characters (grapheme count), motto ≤ 40. Control characters and bidi overrides are
  stripped.
- ≤ 64 players per session. Request bodies ≤ 16 KB. Colours must come from the fixed palette.
- Rate limits, all in memory:
  - sign-ups ≤ 30/min per session and 10/min per IP;
  - wrong join codes ≤ 20 per 10 min per IP, then a cool-down;
  - session creation ≤ 5/hour per IP;
  - emotes 1 per 5 s per guest, and the screen shows at most 2 per second;
  - SSE connections ≤ 100 per session.

  Limits are per IP *and* per session, because at a party every guest on a public server has the
  router's IP.
- No third-party requests anywhere: no CDN, fonts or analytics. The QR code is generated locally
  (a small encoder of my own, ~6 KB, no dependency).

### 4.5 The guest's phone after sign-up

- The player card shows: next heat and opponents, "Grab controller 3" (the seat in the heat, P1..P8;
  label your controllers 1–8), rank, the bracket, and "You're up next!".
- `navigator.vibrate` works on Android. **iPhones have no vibration API in the browser**, so they get a
  full-screen flash card plus an optional sound.
- The remote big screen is the same `BigScreen` component, fed by SSE instead of BroadcastChannel.

---

## 5. Hosting options (decide before phase 3)

The server is the same small Node program in all three options. It has no runtime dependencies (only
`node:http`, `node:crypto`, `node:fs`), is bundled with Vite's SSR build into `dist/server.mjs`, and
serves the app itself.

| | A. Your laptop on the party Wi-Fi | B. Small VPS in Germany | C. Cloudflare Workers + Durable Objects |
|---|---|---|---|
| Cost | €0 | ~€4–6/month VPS (e.g. Hetzner CX22) + ~€1/month domain (check current prices) | €0 on the free plan |
| Effort | lowest: `npm run host`, like your `kart` tmux setup | medium: server setup, Caddy for HTTPS, updates | medium–high: separate Workers runtime code, wrangler, an account |
| Guests need | to be on the same Wi-Fi as the laptop | any internet | any internet |
| Drawbacks | guest networks often block device-to-device traffic (client isolation); plain http (fine for everything except live camera in phase 7) | public, so legal duties (below); you maintain a server | a US provider processes the data; vendor lock-in; harder to test locally |
| Legal | private event, not publicly offered: no imprint needed | imprint + privacy note | imprint + privacy note + provider's DPA |

**Recommendation: A now, built so that B is a drop-in later.**

- A costs nothing, keeps every byte at home, and fits how you already serve `kart-cup-night` on the LAN.
- If client isolation bites, the fix is the main Wi-Fi or a €20 travel router, not a different architecture.
- B is the same `dist/server.mjs` behind Caddy, when you want guests on mobile data.
- I'd skip C: it means a second server runtime to keep in sync with the engine.

**What a public deployment (B or C) in Germany needs from you.** I won't write these texts; a
generator or a lawyer should.

- **Imprint (§ 5 DDG)**, since the site is publicly reachable and offered regularly: your name, a
  postal address where you can be served (no PO box), and a fast contact (e-mail). Possibly
  exemptible for purely private use, but don't rely on that.
- **Privacy note (Art. 13 GDPR):**
  - who is responsible;
  - what is processed: IP addresses (connection, in-memory rate limiting, server/proxy logs),
    nicknames, colours, results, emotes and predictions;
  - why and on which legal basis (likely Art. 6(1)(f), legitimate interest in running the event);
  - how long: the session expiry, plus log retention, which you set (I'll make the server log
    no IPs by default);
  - the hoster as processor, with a signed DPA (Hetzner provides one);
  - the rights of data subjects and the right to complain to a supervisory authority.
- **No cookie banner**: the app sets no cookies, and the localStorage entries (admin key, guest token,
  preferences) are strictly necessary (§ 25(2) TDDDG). Still mention them in the privacy note.
- A domain and DNS, an HTTPS certificate (Caddy does this automatically), and someone who applies
  OS updates.

---

## 6. The show: idea list (please pick, cut or add)

Rules for all of it:
- the TV only listens;
- every celebration comes from a **pure `detectEvents(prev, next)`** with ids derived from content;
- the TV keeps a "seen" set in sessionStorage and treats the first state after load or after a
  reconnect gap as a baseline, so undo, edits, reloads and reconnects never replay anything;
- Effects preference per device: **Off / Subtle / Full party**, defaulting to Off under
  `prefers-reduced-motion`;
- sound off by default, at most 3 flashes per second, everything skippable, canvas pauses when hidden.

| # | Idea | Where | My take | Phase |
|---|---|---|---|---|
| 1 | 3-2-1-GO start lights when a heat becomes "Now racing" | TV, guests in it | keep | 5 |
| 2 | Announcer banners + synth stingers: heat win, upset (lowest seed wins), photo finish (1st–2nd ≤ 2 pts), new league leader, knockout, lucky loser gets in | TV | keep; own lines in EN/DE, several per event, picked without repeats | 5 |
| 3 | News ticker with generated headlines ("Rematch! Lena and Tom meet for the 3rd time") | TV | keep, pure `headlines(t)` | 5 |
| 4 | Standings/brackets count up, glide, light up on advance | TV (glide), admin (instant) | keep; FLIP like today, WAAPI | 5 |
| 5 | Cup roulette as a slot machine with a drum roll | TV + admin (short) | keep; admin's spin stays ≤ 1 s | 5 |
| 6 | "Player joined the server" console lines | TV | keep, merged with a small "server log" corner: joins, knockouts, emotes | 5 |
| 7 | Preset emotes to the TV (no free text, rate-limited, admin mute) | guest → TV | keep; ~12 emotes drawn as SVG | 6 |
| 8 | Predict the next heat's winner, "oracle points" | guests | keep; locks when the heat starts | 6 |
| 9 | Attract mode: starfield/plasma, bouncing logo, join QR, scroller greeting every racer | TV | keep; canvas, 30 fps cap, pauses when hidden | 5 |
| 10 | Boot-screen intro for the final; podium with suspense (3rd, 2nd, drum roll, 1st), fireworks, credits | TV | keep | 5 |
| 11 | End-of-night awards (Iron Driver, Comeback, Bridesmaid = most 2nds, Photo Finish, Giant Slayer, Lucky Loser who went furthest, Mr./Ms. Consistent) | TV + NFO | keep, pure `awards(t)` | 5 |
| 12 | Results as an ASCII-art `.nfo` next to the CSV | admin export | keep; own ASCII logo, CP437-safe characters | 6 |
| 13 | Easter egg behind a key sequence | TV | keep; my own sequence (V-R-O-O-M on the TV keyboard), not a famous code | 6 |
| 14 | "LAN party" skin: dark, neon, scanlines, pixel font | TV + guests first | keep; fonts **Silkscreen** (display) and **VT323** (console), both OFL, bundled via @fontsource, ~40 KB | 6 |
| 15 | *New:* controller hand-off panel on the TV and phones ("P3 → Lena") | TV, guests | add; saves shouting | 3/5 |
| 16 | *New:* player badges roll onto the starting grid at heat start | TV | add | 5 |
| 17 | *New:* heat clock on the TV ("Heat 3 · running 12:40 · night ends ≈ 22:10") | TV | add, uses the measured estimate | 5 |
| 18 | *New:* loading-screen tips during changeover, my own jokes ("Tip: the brake pedal is load-bearing") | TV | add, cheap | 6 |
| 19 | *New:* LAN-style sound pack: tracker-flavoured stingers, noise drum roll, a "modem" join sound | TV | add, extends the WebAudio synth | 6 |

The admin screens get only snappy micro-feedback: press depth, a 150 ms saved tick, and a row
highlight on save. Nothing waits for an animation.

---

## 7. Experimental: results from the console (phase 7)

1. **First I need your photos/captures** of the cup results screen with 4 and with 8 players, ideally
   one with CPUs on. From them I'll work out how a row maps to a person (player tag, name, colour,
   character icon).
2. Then two paths, both of which prefill the result entry, always confirmed by the admin, typing always possible:
   - **HDMI capture stick (recommended first):** the laptop sees the console as a webcam. Frames are
     pixel-exact and the layout is fixed, so plain template matching (digits, row colours) on canvas
     works, with no ML and a few KB of code. You need a USB HDMI capture stick (~€15–25) **plus an HDMI
     splitter or a stick with pass-through** so the TV still gets a picture. I don't buy anything.
   - **Phone photo:** perspective, glare and moiré make this much harder. On-device OCR (e.g.
     tesseract.js) would add several MB and would load only in hosted admin mode, never into the
     offline file. I expect this path to be less reliable.
3. External vision services: not planned. If I think one is needed, I'll ask first with cost and
   what data leaves.
4. This phase may end with "not reliable enough" and a write-up.

---

## 8. Phases

Branch `kart-cup-v2`. Every phase ends with typecheck, unit tests, build, E2E and `trace:check` green,
then a commit. After that I check it in Chromium at 390×844 (phone), 1366×768 and 1920×1080, in EN
and DE, and send you screenshots.

| Phase | Content |
|---|---|
| 0 | Get the current app green: Playwright config + specs, tests for the 60 uncovered musts, REQ-DATA-004/007/008/009, `docs/manual-test.md` |
| 1 | Format, planner, time estimate, schema v2 + migration, `dispatch(command)` refactor |
| 2 | Players without characters: remove the avatar picker and favourite field, colour + initials badge, marks |
| 3 | Server, roles, join flow, live sync, outbox, guest view, remote big screen (after your hosting choice) |
| 4 | Motion foundation, Effects preference, admin micro-feedback |
| 5 | Big-screen show, final and podium, awards |
| 6 | LAN party skin, sound pack, NFO, emotes, predictions, easter egg |
| 7 | Results from the console (after your photos) |

The `dispatch(command)` refactor sits in phase 1 because both the new formats and the server need it.

- **Docs:** `spec.md` stays untouched. Each phase adds to `DECISIONS.md` (new sections) and
  `docs/requirements.md`. Requirements this replaces get the status `replaced by REQ-…`, not
  deletion. That needs a small change to `trace-check.mjs` so replaced rows don't count as uncovered.
- **Size:** I'll report the build size after each phase. Rough guess: 662 KB → 850–950 KB for the
  offline file. The server is a separate file and doesn't count.
- **Not touched:** `../kart-cup-night`, `docs/spec.md`, your uncommitted files (until you say how to
  commit them).

---

## 9. What I need from you

1. **Uncommitted changes:** may I commit them as they are, as one commit "Traceability tooling and
   requirement IDs (WIP)" on `main`, and then branch? Or do you want to commit them yourself?
2. **Phase 0:** OK to do it, so "green after every phase" is possible? Or is another session already
   working on the "Task §4" requirements (REQ-DATA-004…009)?
3. **Game questions** in section 2 (they can come later; I'll use the defaults until then).
4. **Hosting:** A, B or C (needed before phase 3).
5. **Idea list:** cut or add anything?
6. **Rules to confirm:** default X = half the heat size; at most one fill-up per heat (64/8/2 gives a
   final of 6); console totals as the default entry.
