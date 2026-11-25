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
