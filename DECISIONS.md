# Decisions & assumptions

Everything I decided without asking, and why. Grouped by topic. "Spec" means the original brief.

## 1. Plan and architecture

Work order followed the brief: data model → engine + tests → screens → visual polish → end-to-end run → docs.

```
src/
  engine/        pure TypeScript, no React: types, heats, pairing, points, ranking,
                 finals, cups, schedule, csv, demo, tournament (state transitions)
  data/          cups.ts (editable, "// verify names"), avatars.ts
  store/         Zustand store (autosave, undo), BroadcastChannel sync, dialogs/toasts
  components/    shared UI (heat card, tap grid, roulette, confetti, icons…)
  screens/       one file per screen
  styles/        tokens.css (design tokens) + app.css
  i18n.ts        every UI string, English + German
e2e/             Playwright scripts that click through whole tournaments
```

* **One object holds the whole tournament** (`Tournament` in `src/engine/types.ts`). Every engine function takes a tournament and returns a new one, never mutating. This makes autosave, JSON export, undo snapshots and the Big Screen sync trivial: they all just pass that object around.
* **Derived data is never stored.** Standings, heat placings, queue status ("Now racing"), used cups, finals advancement and final standings are recomputed from raw results. Editing any saved heat therefore recomputes everything automatically (spec: "Any saved heat can be edited later, and all standings recompute").
* **Hash routing** (`#/standings`) so the single-file build works from `file://` without a server.

## 2. Data model (short)

| Entity | Key fields |
|---|---|
| `Settings` | name, date, maxPerHeat (4/8), racesPerHeat, qualRounds, points8, points4, entryMode, trackMode, boosterPass, finals format, Last Chance, minutes per race, changeover, expected players, kiosk auto check-in |
| `Player` | id, name, tag, avatar, color, favorite, status (`registered → checked-in → active → withdrawn`), joinedRound |
| `Round` | index, heats (array order = play order), byes |
| `Heat` | playerIds, cup pick, result |
| `HeatResult` | per-race: finishing order per race · totals: console points + heat placing |
| `FinalsState` | stages (config, seeds, heats, optional Last Chance heat), frozen qualifying order |
| `SuddenDeath` | tied group → organizer's order |

## 3. Heat splitting

* `heats = ceil(n / max)`, sizes differ by at most 1, bigger heats first. Matches the spec examples (30 @ 8 → 8,8,7,7; 30 @ 4 → 4×6 + 3×2).
* **The only case where a heat below 3 would appear is 5 players at max 4** (3 + 2). Fewer heats would exceed the max (and max 4 usually means 4 controllers / split screen), so "rebalance" here means **one player gets a bye** for that round (4 race, 1 sits out). The bye goes to whoever has played the most heats. Because ranking uses the *average*, a bye does not hurt. This is tested for every n from 3 to 64.
* n < 3 is blocked with a message.

## 4. Pairing

* Greedy placement with **200 randomized restarts**, scoring **Σ (previous meetings of each pair)²**. A pair meeting for the 2nd time costs 1, for the 3rd time 4. So the algorithm prefers two second meetings over one third meeting.
* After the best greedy result, a **small swap search** (try swapping two players between heats, keep it if the score improves) polishes it. That is cheap and finds perfect rounds when they exist (e.g. 16 players at max 4).
* **Light seeding from round 2 on:** players are placed strongest tier first. A tier is as many players as there are heats. Two players of the same top-2 tier in one heat cost 0.3, so the leaders are spread out without overriding repeat avoidance.
* **Back-to-back avoidance:** a player who was in the previous round's last heat costs 0.5 if placed in the new first heat. That is cheaper than a repeat ("where possible"). The heat with the fewest such players is also always played first.
* The preview shows repeat pairings and back-to-back count. Regenerate uses a new seed; nothing is saved until "Save round".

## 5. Players and registration

* **Kiosk sign-ups are checked in automatically** (setting, on by default): whoever stands at the kiosk is physically there. **Quick add creates `registered` players** by default, because a pasted list is usually the invite list; there is a "check them in right away" toggle.
* Only `checked-in` and `active` players go into a generated round. They become `active` when the round is saved. Registered no-shows are listed as a warning in the preview.
* Names are unique ignoring case and surplus spaces. A player can be deleted only while they never raced; afterwards it's "withdraw".
* **Late registration:** a new player gets `joinedRound = number of existing rounds`, so they start with the next generated round. If the current round still has an unplayed heat below the max size, the app offers that slot: a dialog right after an organizer adds someone, or a "Late arrivals" banner on Home/Players for kiosk sign-ups. Registration stays open until the finals start.
* **Withdrawal:** status `withdrawn`, removed from every unplayed heat, results stay. Withdrawn players stay in the organizer's standings (struck through) but are never eligible and are hidden from the TV leaderboard. They can be reinstated (they rejoin with the next round). Known limitation: withdrawing someone from a 3-player heat leaves 2; the organizer can move a player in with the move button.
* **Moving a player** between unplayed heats of the same round is allowed if every heat stays within 3..max and the size spread doesn't get worse than before.

## 6. Points and result entry

* Defaults exactly as specified (8: 15-12-10-8-6-4-2-1, 4: 10-6-3-1), both editable in setup and settings. Editing the table later recomputes every per-race heat.
* **Heats smaller than the max use the top of the table** (a 7-player heat awards 15…2). The alternative (shifting to the bottom) would punish the winner of a small heat. Heat sizes differ by at most 1, so the effect is small.
* **Per-race mode:** tap in finishing order (or press 1–8), last place auto-fills, the next race opens automatically. Equal heat totals are split by countback (more 1st places, then more 2nds…) and finally by the last race. A per-race heat therefore always has a unique placing, and finals never need sudden death.
* **Console totals mode:** the typed points are used as-is (they may follow the console's own scale). If totals are equal, the organizer orders the tied players with arrow buttons ("who was ahead on the console?").
* The entry mode can be switched per heat (e.g. a race was forgotten, so type in totals). Every result stores its mode.
* Half-entered heats are kept as a per-heat **draft** in localStorage, so a reload during entry loses nothing either.

## 7. Ranking and tiebreakers

* Average points per heat, compared exactly (cross-multiplication, no float rounding).
* Order: average → heat wins → best single heat → head-to-head → sudden death. Head-to-head for larger tied groups is a mini league (net "finished ahead" count within the group).
* **Sudden death is only demanded when it matters:** when an unresolved tie straddles the finals cut or the Last Chance cut, the Finals screen asks the organizer to run a one-race shoot-out and tap the order. Elsewhere unresolved ties simply share a rank (shown as equal numbers, explained in the tooltip).
* The tooltip (ⓘ next to the average) names the neighbour and the deciding criterion with both values. It works on hover and keyboard focus.
* **Position arrows** compare with the standings before the latest round that has results, so they show "movement this round". Players with their first result show "New".
* Eligibility: at least `ceil(rounds / 2)` heats and not withdrawn. With 3 rounds that's 2 heats, so a player who joined after round 1 can still make the finals.

## 8. Finals

* Generic stage engine `{ name, fieldSize, heatSize, advancePerHeat, wildcards }` with validation: heat size 3..max, field divisible into equal heats, 1 ≤ advance < heat size (0 in the last stage), last stage is a single heat, next field = heats × advance + wildcards, enough eligible players, wildcards 0..2, and a Last Chance pool of at least 3.
* **`wildcards` means "spots in *this* stage won through a Last Chance heat"** among those who just missed it. The presets put the Last Chance before the first finals stage: the best eligible non-qualifiers (up to one heat's worth) race, and the top 1–2 join. The engine also supports Last Chance heats before later stages.
* Presets: spec presets for ≥ 16 eligible. Small fields: max 8 → 12–15: 2 semis of 6 (top 4) → Grand Final of 8; 8–11: Top 8 → Grand Final; < 8: everyone in one final. Max 4 → 8–15: 2 semis of 4 (top 2) → final of 4; 4–7: final of 4; 3: final of 3. Every preset is validated in tests for 3–64 eligible players, with and without Last Chance. If the pool is too small, Last Chance switches off automatically.
* Snake seeding (1,4,5,8… / 2,3,6,7…). Advancers are re-seeded for the next stage by heat placing, then points, then previous seed. Wildcards come last.
* **Finals points start fresh**: only the placing inside each finals heat matters. The Grand Final placing decides the podium. Final standings: Grand Final places, then earlier knockouts (later stage first), then Last Chance losers, then everyone else in qualifying order.
* Editing an earlier finals result re-seeds a later stage automatically **as long as that later stage has not been raced**. The stage table can be edited before starting. "Back to qualifying" works while no finals heat has a result.
* The finals can start as soon as the current round is complete; if fewer rounds than planned were played, the app shows a warning (useful when time runs out). An extra qualifying round can also be added.

## 9. Cup and track picker

* Modes: none / random cup / random 4 tracks (as many as races per heat) / organizer picks. Booster Course Pass toggle.
* **No repeats until all are used:** derived from the cups/tracks already stored on heats, not from a separate counter, so undo and edits stay consistent. After a full cycle it starts over.
* The pick happens when the organizer presses "Spin" for a heat (Home or heat card), not when the round is generated. That way the reveal happens live, and the Big Screen plays its own roulette when the pick arrives.
* Cup and track names are plain text in `src/data/cups.ts`, marked `// verify names`. Cup emblems are self-drawn shields with a generic emoji glyph; no logos.

## 10. Persistence, undo, safety

* Autosave on every change to `localStorage` (`kart-cup-manager:v1`). If storage is full, the oldest undo snapshots are dropped first.
* Undo keeps **30 snapshots**, persisted too, so undo survives a reload. The top bar shows what will be undone. Language and sound preferences are not undoable actions.
* Destructive actions all go through a confirmation dialog: withdraw, delete player, delete result, import, demo, cancel finals, start finals, and reset. Reset needs the tournament name typed in.
* The **leave-page warning** only appears if the last change is newer than the last export (importing a backup counts as exported).
* JSON backup = `{ app, version, exportedAt, tournament }`. Import validates the shape. CSV uses a UTF-8 BOM and commas so Excel/Numbers open it with umlauts intact.

## 11. Big Screen

* Opens as a second window (`#/big`). It **only listens** and never writes storage, so two windows can't fight over the data. Sync: BroadcastChannel (primary) plus the `storage` event as a fallback for browsers that isolate `file://` pages. This only reaches windows of the **same browser on the same machine**; there is no network sync (no backend by spec). `npm run serve` makes the app reachable over Meshnet/LAN, but every device then has its own data.
* Slides: "Now racing / Up next / Get ready" (16 s) and the leaderboard in pages of 10 (10 s each, top 30). The registration grid shows before round 1 and podium + final top 10 at the end. Between rounds the race slide is skipped. No controls; the cursor hides after 2 s; double-click toggles fullscreen.

## 12. Visual design, legal, accessibility

* Name: **Kart Cup Manager** (no "Mario"/"Nintendo"). All graphics are drawn in SVG/CSS from scratch: item box, coin, star, checkered flag, trophy, helmet avatars, cup shields, podium, confetti. Avatars are system emoji animals inside a self-drawn helmet badge, in one of 12 colors. No official art, logos, fonts or audio.
* Fonts **Lilita One** (display) and **Nunito** (body) are bundled through `@fontsource` (Latin subset, which covers German umlauts) and inlined into the single HTML file. Emoji use the system emoji font. Bundling a color emoji font would add ~10 MB.
* Palette as CSS tokens (`src/styles/tokens.css`): racing red `#E60012`, sky blue, item-box gold, grass green, deep navy text. Checkered strips as accents. Pill buttons with a thick bottom shadow that presses down, ribbon headers tilted by about 2°, gold/silver/bronze position badges.
* Contrast: white text only on red/blue/navy (≥ 4.8:1), navy text on gold/green/sky. Grey helper text sitting directly on the sky background is switched to navy (AA). Thick gold-and-navy focus ring everywhere. All controls are real buttons/inputs; modals trap focus and close on Esc. Result entry works fully by keyboard (1–9, Backspace).
* `prefers-reduced-motion`: CSS animations collapse, confetti is skipped, the roulette shows the result immediately.
* Sound is **off by default**; short WebAudio square/triangle blips and a fanfare, synthesized at runtime.

## 13. Smaller choices

* Default language **English** (spec); the top bar toggles EN/DE and the choice is remembered.
* Time estimate = (qualifying heats + finals heats) × (races × minutes per race + changeover). It uses "expected players" in the wizard and the real player count later. Home shows an estimate of the time left.
* Settings stay editable during the event, except "max per heat" once a round exists. Qualifying rounds can't go below the rounds already played.
* "Load demo data" = 30 fake racers, round 1 simulated (skill + noise) with cups picked.
* Tooling: Vite 8, React 19, TypeScript 7 (strict), Zustand 5, Vitest 5, vite-plugin-singlefile. E2E uses `playwright-core` with the system Chromium (no browser download).

## 14. Robustness and tests (phase 0 of the v2 work)

* **Schema version.** `Tournament.version` is checked on load and import (`src/store/persist.ts`). Unversioned data counts as version 1. Data from a newer app is refused with a clear message, never half-read.
* **Repair vs. recovery.** Missing *simple* fields (a setting, a player's tag, `suddenDeath`, …) are filled with defaults and reported once as a toast ("N missing fields were filled"). *Structure* that is broken (players or rounds not lists, a player without id or name, a heat without a player list) is not guessed at: the app shows a **recovery screen** with *Download damaged data*, *Import a backup* and *Start fresh*. Before anything else happens, the damaged text is copied to `kart-cup-manager:v1:corrupt`. Autosave is paused while the screen is shown, so the original stays under the main key until the organizer chooses.
* **Storage failures.** If storage throws or is missing (blocked, some private modes), the app runs in memory and shows a permanent red banner with *Export backup*. If the tournament no longer fits even after dropping all undo snapshots, nothing is written (the last good copy stays) and the same banner says the latest changes are not saved.
* **Change tracking without the clock.** "Unsaved changes" compares a change counter with the counter at the last export or import, instead of wall-clock times, so a clock that jumps (DST, NTP, a laptop with a dead RTC battery) can't hide or invent the leave warning. The export time is still stored, for display only. Old envelopes keep their unsaved flag when migrated.
* **Two windows.** Every write first adopts newer data from storage if another window wrote since (the change counter decides), then applies the action. So two windows edit in turn, never over each other. A window also adopts changes live through the `storage` event and shows "Updated with changes from another window". The big screen still only listens; it doesn't even probe the storage with a test write.
* **Sign-ups that can't reach the finals.** When the remaining qualifying rounds (plus a free slot in the current round) are fewer than `ceil(rounds/2)`, a new kiosk or organizer sign-up is told that this racer can't reach the finals but can still race for fun.
* **Clearing a heat result** puts the heat back into the queue, so players who withdrew in the meantime are taken out of it. Editing a result in place keeps the line-up as raced. Found by the property tests.
* **Deleting a player** is an engine rule now (`deletePlayer`): only while they were never in a heat.
* **File names** drop accents instead of turning them into dashes (`Ölberg` → `olberg`).
* **Known limitation:** Chromium writes localStorage to disk with a short delay. Killing the whole browser process or a power cut right after a save can lose that save. Tab closes, renderer crashes and reloads lose nothing. (requirements D-4)
* **Test setup.** Playwright runs against the built `dist/index.html`, over `vite preview` and from `file://`, with the system Chromium. The old `e2e/run-demo.mjs` script is replaced by the specs. `readme-shots.mjs` and `quick.mjs` stay as screenshot helpers.

## 15. Formats, planner and time (phase 1 of the v2 work)

The design record with worked examples is `docs/plan-v2.md` §1. What was built:

* **Heat size and points.** `heatSize` (2–8, the number of controllers) replaces `maxPerHeat`. One heat is one cup of 4 races. One points table for every heat size, default **15-12-10-9-8-7-6-5**; smaller heats use its top. Heat size and format lock once the first round exists.
* **Three formats.** *League* (n ≤ S: everyone races every cup, 1–10 cups), *Knockout cups* (n > S) and *Classic* (the v1 format, unchanged; S ≥ 3). The planner suggests league or knockout from the expected players until the organizer picks a format.
* **Knockout rule** (`src/engine/knockout.ts`, used by the planner and the live tournament alike): round 1 has `ceil(n/S)` heats with sizes differing by at most 1, drawn at random (redraw in the preview). The top X of each heat go on; X is 1..(smallest heat − 1), default ⌊S/2⌋, set per round and frozen on the round when it is drawn. The next field is `F = min(ceil(A/S)·S, A + heats, field − heats)`; the `F − A` fill-ups are the best of the rest by heat points, then place. Fill-ups carry a self-drawn clover ("lucky loser") in tables, cards and on the TV. A field of S or fewer races the final.
  * *Last Chance* mode: the best of the rest (up to S) race one extra heat for the fill-up places; it is queued after the round's heats and appears as soon as the pool is known. *Off*: only the top X go on.
  * A tie on the fill-up cut or the Last Chance pool cut needs the existing sudden death before the next round can be drawn. With "final order only" entry ties are common (every 3rd place has the same points); console totals or per-race entry avoid most of them.
  * Heat size 2 with an odd field: one bye, random in round 1, the top seed later. The bye counts as advancing, so the bye player races in the next round.
  * Rounds after the first are snake seeded by place, then points; bigger heats play first.
  * Late sign-ups can only take a free seat in an unplayed round-1 heat; after that the kiosk says registration is closed. An advancer who withdraws is replaced by the next best of the rest (also with fill-ups off).
  * Editing a result re-seeds a later round nobody has raced yet, or drops it if the round is open again; raced heats are never changed. A raced Last Chance heat keeps counting even if an edit changed its pool.
  * Final standings: the final's places, then by the round players went out in (later first; inside a round Last Chance place, then points, then place; withdrawn last).
* **League ranking:** total points, then more cup wins, more 2nd places, …, then the better place in the latest cup both raced; a tie that still touches the podium needs sudden death. Players who joined after cup 1 are marked "started late".
* **Result entry once per heat**, default *console totals*; also *final order only* (points = table[place] × races) and *per race*. The entry screen can switch per heat.
* **Planner** (`src/engine/plan.ts`): minutes per heat = races × minutes per race + **cup overhead** (new, default 3) + changeover = 17 min. The setup's Format step shows a diagram per round, a breakdown, the end time (with a start time) and a warning over 3 hours or over the time available. Cheaper variants are computed from the settings (fewer advancing, no Last Chance / no fill-ups, fewer cups or rounds, knockout instead of classic), the ones that fit first, then the most cups per player. Settings shows the same plan for the real players; Home shows the difference to the setup plan before round 1.
* **Measured time** (`src/engine/timing.ts`): a heat's time is the gap between consecutive *first* saves (`finishedAt`; re-saving an old heat doesn't move it); the first heat counts from when round 1 was created. Gaps over 2.5× the estimate are breaks. Minutes per heat = (2 × guess + Σ measured) / (2 + measured heats). Home and the TV show "≈ 19 min per heat (measured over 4 heats) · 3 heats left · ends ≈ 22:10".
* **Schema version 2.** v1 data opens as Classic with its heat size, the table it used (8-player or 4-player), its timing and no cup overhead. A test runs three real tournaments written by the v1 code (`src/store/fixtures/v1-tournaments.json`) and checks standings and finals are identical after migration.
* **Commands.** Every change from the screens is `dispatch(command)`; `applyCommand(t, cmd, {now, newId})` in `src/engine/commands.ts` is pure, validates and rejects bad input without changing state. Offline the store keeps its snapshot undo. A server can apply the same function to a log later (phase 3); round draws take a seed, so a command replays to the same heats.
* **Demo** is now a knockout night (30 players, round 1 raced).
* **Traceability:** a requirement whose text starts with "Replaced by REQ-…" stays as history and needs no test (`REQ-ENG-011`, `REQ-ENG-040`).
* **Players without characters** (decided 2026-11-26): nobody picks a character in the app, because they pick one in the game. The avatar picker and the favourite-character field go in phase 2 (plan §3); until then they are unchanged.

## 16. Players without characters, controller numbers (phase 2 of the v2 work)

* **No character choice** (your decision of 2026-11-26): everyone picks a character on the console, and a second, different character in the app would only confuse. The avatar picker, the "favourite character" field and the mix-and-match driver builder of the plan are gone.
* **A player is their name, gamer tag and a colour badge with initials** (`src/components/Avatar.tsx`, `src/engine/identity.ts`).
  * New players get the palette colour used least so far (30 players spread over 12 colours, at most one apart); the organizer or the player can pick another. Colours must come from the palette.
  * Initials: first letters of the first and last word, else the first two letters, else the first letter with another one of the name, so they are unique where the names allow. They are given in sign-up order, so a new player never changes somebody's badge.
  * The initials are navy or white, whichever contrasts more; three palette colours were adjusted (blue `#2A6FD6`, pink `#C2308F`, grey `#8D99AD`) so every badge reaches 4.5:1.
  * Marks from the state, drawn from scratch: **crown** for the leader (or champion), **flames** for two or more heat wins in a row, **clover** for a lucky loser. They show on badges from 28 px up; the "plaster after a last place" idea was dropped as unkind.
* **Old data:** version 1 players keep their `avatar` and `favorite` fields in the data and in backups (unchanged, no repairs); the app no longer shows or needs them. New players don't get them.
* **Controller numbers** (your request of 2026-11-26): every heat shows which player takes which controller (1–8): round preview, heat cards, Home (Now racing, Up next), result entry and the big screen. Result entry lists the players in controller order, and the number keys are the controller numbers. A heat stores its numbers (`Heat.seats`) as soon as its line-up changes after the draw: a late joiner gets the lowest free number, and moving or withdrawing a player never renumbers the others. Without stored numbers the line-up order counts (the draw order, or the snake seeding in later knockout rounds).

## 17. Kart Cup server and phone sign-up (phase 3a of the v2 work)

* **Hosting option A**, on a **Raspberry Pi 3 Model B** (your choice of 2026-11-26), built so the same files run on any device with Node.js 18+ (a laptop: `node server.mjs`). `npm run package:server` puts the app, the server and the Pi installer into `dist/kart-cup-server/`.
* **This step is phone sign-up only.** The organizer's browser stays the source of truth for the tournament, as before: it starts a sign-up session on the server, pulls new sign-ups every 1.5 s and turns them into players with the normal `addPlayer` command, and reports to the server which names are taken and whether registration is open. Only one organizer window pulls at a time (a short lease in localStorage). Co-organizers on other devices, the guests' live view and the remote TV (the rest of plan §4) come later on the same server.
* **Server** (`src/server/`, built to one 15 KB file): `node:http`, `node:crypto` and `node:fs` only, Node 18 features only (Raspberry Pi OS Bookworm ships Node 18). It serves `index.html` with a marker; without the marker (the offline file, `vite preview`) the app makes no request and the phone card explains that the server is needed.
  * Sessions: a 6-character join code without look-alike characters, a 128-bit admin key that the organizer's browser keeps; the server stores only its SHA-256 hash and compares in constant time. One JSON file per session, written to a temp file and renamed, so a power cut can't leave half a file. Sessions expire (24 h by default, at most `MAX_SESSION_HOURS`).
  * Hostile input and limits as in plan §4.4 (REQ-SEC-001/002). Sign-up requests must be JSON, so a web page elsewhere can't post a form to the server. The server logs no IP addresses; limits keep them in memory only.
  * The join link uses the address the organizer opened the app with; when that is `localhost`, the server's home-network address (192.168/10/172.16–31 before VPN ranges). `PUBLIC_URL` overrides it.
* **Sign-up station** (your request): `#/desk` on the server's own screen, full screen in Chromium, with mouse and keyboard and the QR code next to the form. It finds the newest session through an endpoint that only answers requests from the server itself, so a phone can't use it to discover codes.
* **QR codes** come from an encoder written for this app (`src/lib/qr.ts`, ~5 KB, byte mode, level M, versions 1–10). Tests check Reed–Solomon and the format/version bits against values from the standard and read every mask back with a separate reader. A real scan is on the manual checklist.
* **Pi installer** (`deploy/raspberry-pi/`): installs Node.js from the OS if missing, copies the two files to `/opt/kart-cup`, runs the server as a hardened systemd service on port 8080 (data in `/var/lib/kart-cup`), and starts the station when the desktop starts. 32-bit Raspberry Pi OS with desktop is recommended for the Pi 3's 1 GB. Not yet run on a real Pi.
* **Known limits:** guests' phones must be on the same network as the Pi; guest Wi-Fi with client isolation blocks them. The organizer's laptop must reach the Pi too. If the organizer's browser is closed, sign-ups wait on the Pi and arrive when it is open again.

## 18. Sign-up first, race mode per round, the Pi's own Wi-Fi (phase 3b of the v2 work)

Your feedback of 2026-11-26: the setup was too complex, sign-up should come first with an option for late sign-ups, the Pi should give one QR code for Wi-Fi + page, pages should be reached by name, and the setup should match Mario Kart 8 Deluxe (Switch 2, up to 8 players, heat size varies, Grand Prix first, later rounds depending on the players).

* **Sign-up first.** "New tournament" asks only for a name (and date) and opens sign-up: Home shows the kiosk and the phone sign-up. The setup wizard is gone; points, timing, tracks and entry mode live in Settings.
* **Start racing** (when everyone is there): shows how many players are checked in, the heat size (2–8, the controllers you use tonight), the format suggested from the *real* number of players (league if everyone fits into one heat, otherwise knockout cups; the format follows the suggestion until you pick one: `formatAuto`), the knockout options, how round 1 is raced, and the **Late sign-ups** switch, next to the plan (diagram, time, warning, shorter options). Then the round preview with redraw.
* **Late sign-ups** (on by default): off closes kiosk, phones and the station once round 1 is drawn; on, people join where the format has room (classic and league from the next round/cup, knockout only into a free round-1 seat). The organizer can always add someone by hand.
* **Race mode per round**, in the game's terms: **Grand Prix** (a cup of 4 races) or **VS races** (1–32), and the class **50/100/150/200cc or Mirror**. Chosen in Start racing for round 1 and in the preview of every later round (defaults to the previous round's), changeable while nobody has raced the round. Final-order-only entry scores table × the round's races, per-race entry asks for the round's races, random tracks give a VS round as many tracks as races. Home, heat cards and the TV show "Grand Prix · 150cc" / "VS · 6 races · 200cc". The cup list is the Mario Kart 8 Deluxe one, with the Booster Course cups.
* **Schema version 3** (race setup per round and in the settings, `lateSignups`, `formatAuto`). Version 2 data opens with a Grand Prix if it had 4 races per heat (else VS races), late sign-ups on and its format kept.
* **The Pi's own Wi-Fi** (your choice): the installer turns the Pi's Wi-Fi into a WPA2 hotspot "Kart Cup" with a generated 12-character password (NetworkManager shared mode; it survives reinstalls). Its DNS answers `kartcup.lan` and the connection checks of phones and laptops with the Pi, and our server sends those checks and any unknown host to `/join` → the newest sign-up. So a phone that joins the Wi-Fi gets the sign-up page by itself (iPhone sheet, Android "Sign in to network"). All other names are looked up normally, so with a router cable guests keep their internet.
* **One QR code** joins the Wi-Fi (`WIFI:` format, understood by iPhone and Android cameras); a second, smaller one opens `kartcup.lan` for phones already on the Wi-Fi. The password is printed next to it for laptops. The server runs on **port 80** (systemd ambient capability, not root), so addresses have no port: `http://kartcup.lan`, or `http://kartcup.local` through a router (mDNS).
* **Not yet tried on a real Pi or real phones:** the hotspot, the DNS entries, the connection-check redirect and the station (manual checklist REQ-HOST-006/009).
* **First run on the real Pi 3 (2026-11-26):** the hotspot did not start: the Pi 3's Wi-Fi chip (brcmfmac) cannot run an access point with protected management frames, which NetworkManager enables by default (`WPA-PSK-SHA256`). The installer now sets `pmf disable` (still WPA2) and Wi-Fi power saving off. Checked on the Pi: "Kart Cup" is visible as WPA2, its DHCP hands out 10.42.0.x, and a phone's connection check is redirected to `http://kartcup.lan/join`.
* **Pi optimization** (your request): the installer switches off Bluetooth, NFS, PackageKit and the automatic apt runs, caps the journal at 50 MB, masks unused desktop helpers, and for the station enables desktop auto-login and disables screen blanking (`--no-optimize` skips all of it). The Pi reported past under-voltage (`throttled=0x50000`): a better power supply is recommended.

## 19. The Pi as the organizer's console; hotspot with hostapd (phase 3c)

* **Phones could not join the NetworkManager hotspot** on the Pi 3 (found with debug logs on the Pi): the handshake failed after message 3/4 because NetworkManager advertises `WPA-PSK-SHA256` in hotspot mode even with PMF off, which the Pi 3's chip cannot do; devices reject that inconsistent offer. The hotspot now runs with **hostapd** (plain WPA2-PSK, CCMP, PMF off) and **dnsmasq** (DHCP 10.42.0.10–250, `kartcup.lan` and the connection-check names → the Pi, DHCP option 114 with the captive-portal URL), as three small systemd units (`kart-cup-wifi`, `-hostapd`, `-dnsmasq`). NetworkManager keeps the cable and leaves wlan0 alone. Guests reach the internet through a router cable by NAT (nftables), when there is one. Tested on the Pi with the laptop: joined with the password, got 10.42.0.165, `kartcup.lan` → 10.42.0.1, the app answered, a connection check was redirected to `/join`.
* **The Pi is the organizer's console** (your correction): after boot it opens the **admin screen** full screen (`http://localhost/`), not the guest form. "Show QR code" on the phone card puts the join QR codes across the whole screen for guests to scan. The plain guest form is still there (`kart-cup-desk form`, `#/desk`), and before sign-up starts it explains how to begin.

