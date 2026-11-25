<!-- READ-ONLY source of truth. Verbatim copy of the body of the original brief
     (2026-10-29T0444--0001.md, front matter stripped). Never edit. -->

# Build "Kart Cup Manager": a local tournament app for Mario Kart 8 Deluxe

## Context
I'm hosting a Mario Kart 8 Deluxe tournament for about 30 people (it should handle anywhere from 4 to 64). We play on a Nintendo Switch 2. Each heat has either **max 8 or max 4 players**, set once per tournament. There is only **one console**, so heats are played **one after another**, never in parallel.
The app runs on **one device** (a laptop hooked up to a TV/beamer). It needs no backend, no accounts and no internet during the event.

Plan the whole thing yourself, build it, test it and make the design look great. Don't ask me questions. Make sensible decisions and write them down in `DECISIONS.md`.

## Tech
- Vite + React + TypeScript (strict), plain CSS or CSS modules (no UI kit), Zustand for state.
- **Persistence:** autosave every change to `localStorage`. Add JSON export/import (full backup) and a CSV export of the standings. Warn before closing the tab only if the last export is older than the last change.
- **Undo:** keep a snapshot history of the last 30 actions, with an Undo button. Every destructive action needs a confirmation.
- `npm run build` must produce a **single self-contained `index.html`** (vite-plugin-singlefile) that also works when opened offline from disk.
- Put all UI strings in one `i18n` file. The default language is English, with German as a second language that you can switch to.
- Use Vitest for unit tests of the tournament engine. Keep the engine as pure functions in `src/engine/` with no React inside.

## Core flow
1. **Setup wizard:** tournament name, date, max players per heat (4 | 8), races per heat (default 4 = one cup), number of qualifying rounds (default 3), finals format, points table, result entry mode, track selection mode. Show a **live time estimate** while settings change: heats × races × configurable minutes per race (default 2.5) + changeover time (default 2 min).
2. **Registration:** a big, touch-friendly kiosk form ("Join the Race!"). Fields are display name (required, unique, case-insensitive), optional nickname/tag, a chosen avatar (original emoji/SVG avatars in kart-racer style plus a color, **no official Nintendo images**) and an optional favourite character as plain text. There is also a fast "quick add" for the organizer (paste a list of names, one per line).
   Players have a status: `registered → checked-in → active → withdrawn`. Registration stays open for the whole qualifying phase.
3. **Qualifying (Swiss-style mixed heats):** each round, all active players are split into balanced heats, then played one by one.
4. **Finals:** top players advance through seeded knockout heats to a Grand Final.
5. **Podium ceremony:** top 3 on a podium with confetti, then final standings.

## Tournament engine rules (implement exactly, with tests)
- **Heat splitting:** `heats = ceil(n / max)`. Heat sizes may differ by at most 1, e.g. 30 players at max 8 → 8, 8, 7, 7, and at max 4 → 4×6 + 3×2. Never create a heat with fewer than 3 players: if that would happen, rebalance, and if it's impossible (n < 3), block it with a clear message.
- **Pairing:** minimize repeated opponents across rounds. Use a greedy pass with randomized restarts (e.g. 200 tries), scoring the sum of repeated pairings squared. Spread the strongest players across heats in later rounds (light seeding by current rank). Also, where possible, avoid having one player in two back-to-back heats across a round boundary.
- **Heat order:** heats in a round get a play order and a queue ("Now racing", "Up next", "Get ready"). The organizer can swap the order of heats that haven't been played yet, and move a player between unplayed heats in the same round if the sizes stay valid.
- **Points (configurable):** the default table for 8-player heats is 15, 12, 10, 8, 6, 4, 2, 1 per race. For 4-player heats it is 10, 6, 3, 1. The table is editable in the setup.
- **Result entry modes:**
  - (A) *Per race:* tap the players in finishing order; the last one fills in automatically. This repeats for each race in the heat. Show the running heat total.
  - (B) *Console totals:* type in the final cup points the Switch shows for each player.
  Validate both (no duplicate places, everyone ranked). Any saved heat can be edited later, and all standings recompute.
- **Qualifying ranking:** rank by **average points per heat played** so that late joiners aren't punished. You need at least `ceil(rounds/2)` heats to be eligible for the finals. Tiebreakers in order: average points → total heat wins → best single-heat result → head-to-head (if they met) → "Sudden death" (the app asks the organizer to pick the winner after a 1-race shoot-out). Show the tiebreak reason in a tooltip.
- **Late registration:** a new player joins from the **next generated round**. If the current round still has an unplayed heat with a free slot, offer to add them there.
- **Withdrawal:** the player is excluded from future rounds, and their past results stay in the record.
- **Finals:** a generic stage engine. A stage is `{ name, fieldSize, heatSize, advancePerHeat, wildcards }`. Validate that the numbers add up and seed with a snake distribution (1, 4, 5, 8… / 2, 3, 6, 7…). Presets:
  - max 8: Top 16 → 2 semifinals of 8 → top 4 of each → Grand Final of 8.
  - max 4: Top 16 → 4 quarterfinals of 4 → top 2 → 2 semifinals of 4 → top 2 → Final of 4.
  - Small fields (< 16 eligible): pick a sensible preset automatically, e.g. Top 8 → Final.
  - Optional "Last Chance" heat: the best non-qualifiers race for 1 to 2 wildcard spots.
  - Finals points start fresh. Placement in the Grand Final decides the podium.
- **Track/cup picker:** a mode of none / random cup / random 4 tracks / organizer picks. It includes the 12 base-game cups and the 12 Booster Course Pass cups (toggle the pass on or off). Avoid repeating cups until all have been used. The cup and track names live in one editable data file. Mark it `// verify names` because the organizer may correct them. Show the pick with a roulette animation.

## Screens
1. **Home/Dashboard:** phase indicator (Registration → Qualifying R1..Rn → Finals → Podium), the next heat called in large letters, quick actions.
2. **Registration** (kiosk) and **Players** (list, search, check-in toggle, edit, withdraw).
3. **Round view:** heat cards with avatars, cup and status. Generate the next round only once the current round is complete. Before saving a round, show a "regenerate" preview.
4. **Result entry** as described above.
5. **Standings:** a live leaderboard with position change arrows (▲▼) and the qualification cut line.
6. **Finals bracket:** a visual bracket of the stages.
7. **Big Screen mode:** a second browser window for the TV, kept in sync through `BroadcastChannel`. It cycles between "Now racing / Up next" and the standings, with large type that reads well from 5 m away, and shows no controls.
8. **Podium ceremony** with a confetti burst and a final standings table.
9. **Settings/Data:** export/import, reset (type the tournament name to confirm), load demo data (30 fake players with a simulated round, for testing), sound on/off.

## Visual design: "Nintendo-like" but 100% original
- The mood is bright, bouncy and playful: a racing-game menu and party atmosphere.
- **Palette** (use CSS tokens): racing red `#E60012`-like, sky blue, item-box yellow/gold, grass green, deep navy for text. Use checkered-flag patterns as accents.
- **Fonts:** a chunky rounded display font such as "Lilita One" or "Baloo 2", plus "Nunito" for body text (Google Fonts, bundled locally for offline use).
- **UI:** big pill buttons with a thick bottom shadow (a pressable 3D look), slightly tilted card headers, rounded corners everywhere, and position badges for 1st/2nd/3rd in gold/silver/bronze.
- **Motion:** springy micro-animations for button press, card entry and leaderboard reordering, plus the cup roulette and confetti. Respect `prefers-reduced-motion`.
- **Sound:** optional and off by default. Synthesize short UI blips and a fanfare with WebAudio. No ripped game audio.
- **Legal:** no official logos, sprites, character art, fonts or audio. Draw everything yourself with CSS/SVG (item boxes, coins, stars, flags). The app name must not contain "Mario" or "Nintendo".
- **Layouts:** a laptop (1366×768) for the organizer, a tablet for kiosk registration, and 1080p for the big screen. Meet WCAG AA contrast and make it fully keyboard-usable.

## Quality bar / definition of done
- Unit tests for: heat splitting (n = 3..64, max 4 and 8), the pairing repeat score, points calculation for both entry modes, ranking and tiebreakers, late join, withdrawal, finals stage validation and seeding. All tests must pass.
- Run the app and click through a complete demo tournament with 30 players and max 8: registration → 3 rounds (including one late registration after round 1 and one withdrawal) → finals → podium. Take screenshots of every screen and fix anything ugly or broken.
- Repeat the run quickly with max 4 and 11 players.
- Reloading the browser in the middle of a round loses nothing.
- `README.md`: how to run it (`npm i && npm run dev`), how to build the single-file version, and a 1-page "organizer cheat sheet" for event day.
- `DECISIONS.md`: every assumption you made and why.

Work in this order: (1) write a short plan and the data model, (2) build and test the engine, (3) build the UI screens, (4) do the visual polish pass, (5) run the end-to-end demo tournament and fix issues, (6) write the docs.
