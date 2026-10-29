# Sailing Legends — Prototype 0.4 (Optimist and 420)

**Play:** https://alessiogs.github.io/sailing-legends/ · Concept: [docs/CONCEPT.md](docs/CONCEPT.md) · Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md) · Developer guide: [AGENTS.md](AGENTS.md)

A browser-first prototype in Babylon.js + TypeScript + Vite. A full Optimist race against three AI
Rivals (Luca, Giulia, Marco) with simplified but "real" sailing physics: apparent wind, the no-go zone,
sail lift and drag, inertia, leeway, tacks and gybes.

The game itself is in Italian: in-game labels quoted below (in quotes or italics) are shown as the player sees them,
with their English meaning.

## Getting started
```bash
npm install
npm run dev        # open the address Vite prints (usually http://localhost:5173)
npm run build      # optimised build into dist/
```
Requirements: Node.js 20+, a desktop browser with WebGL 2.

## Tests and publishing
- `npm test` (Vitest, no browser):
  - smoke races: AI-only Optimist and 420 races in light, medium and strong wind; every boat finishes and every
    penalty is served;
  - golden races: nine fixed-seed races (six AI-only, three 420 races with a player boat as Helm, as Crew and in
    Full Boat Control) must match the snapshot `tests/golden/races.json` exactly; `npm run golden:update`
    rewrites it, only when behaviour is meant to change;
  - unit tests: rule verdicts and penalty turns, translation catalogs, race event wording, the AI's parts, the
    HUD panel, the player's controls and more (the full list is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- `npm run polar`: speed table (polar) per class, after any physics change.
- Every push to `main` or `develop` runs the GitHub Action `.github/workflows/deploy.yml`: it installs, runs the
  tests, type-checks and builds both branches, and publishes them together to GitHub Pages: `main` at
  https://alessiogs.github.io/sailing-legends/, `develop` (the test build) under
  https://alessiogs.github.io/sailing-legends/dev/. Pull requests are only tested and type-checked, never deployed.

## Controls
| Keyboard | Gamepad | Action |
|---|---|---|
| A / D, ← / → (Shift = fine) | Left stick | Tiller (see below) |
| W / ↑ | RT | Sheet in |
| S / ↓ | LT | Ease the sheet |
| T | X | Auto-trim (an Assist; in game: "Regolazione vela automatica") |
| C | Y | Camera: chase / free / tactical |
| P / Esc | Start | Pause |
| R | Back | New race |
| M / H | — | Menu |
| K | — | Commands menu ("Comandi") |
| V | — | Audio on/off |

**Commands menu (K, or from the main menu or the pause screen):**
- *Muovi la barra* ("move the tiller", the default, realistic): → moves the tiller to the right and the boat turns
  left, as on a real Optimist.
- *Direzione della barca* ("boat direction"): → turns the boat to the right.
- The tiller either springs back to the centre or stays where you leave it; tiller and sheet speed.
The settings are remembered in the browser.

## The race
Windward-leeward course: start (45 s procedure) → **Mark 1** ("Boa 1") upwind → **Mark 2** ("Boa 2") downwind →
**finish** ("Arrivo") upwind. Marks are left to port. If you are over the line at the gun you are **OCS**: you must
return below the line and start again. The darker, rippled patches of water are puffs (more wind, a different
direction).

## New in 0.4: the 420
- **New boat**: the 420, with mainsail, jib, spinnaker and trapeze (`I420` in `src/sailing/BoatClass.ts`).
  The physics handles several sails: the jib and the spinnaker must be to leeward (after tacks and gybes the Crew
  moves them across, otherwise the jib is backed), the spinnaker only pays off with the wind on the quarter or
  dead astern, and the Pair's weight (in, hiking, on the trapeze) must be to windward and balance the boat:
  too little and it heels and loses power, too much and it heels to windward and slows down.
- **Three choices** (menu → Boat: 420), a Role plus a Control mode:
  - *Timoniere* (Helm): rudder and mainsail; the AI Crew does the rest and decides when to hoist the spinnaker.
  - *Prodiere* (Crew): the Partner steers; you trim the jib or spinnaker with W/S, move your weight in/out up to
    the trapeze with A/D, switch sides with E, hoist/drop with Space. The Partner calls the manoeuvres
    ("Vira!" = tack, "Cambia lato!" = switch sides, "Issa lo spi!" = hoist the spinnaker).
  - *Barca completa* (Full Boat Control): rudder and mainsail, and you call the spinnaker yourself (Space);
    the Crew carries it out.
- **Choose your Partner from the Optimist Rivals** (Luca, Giulia, Marco). **Crew Chemistry** (0–100, in game
  "Intesa") comes from shared history, technique and reliability: more chemistry = quicker reactions and more
  precise trim.
- The 420 opponents are full AI Pairs (Helm + Crew), with a longer course and a wider start line.

## New in 0.3
- **Realistic tiller** with an indicator in the HUD; optional arcade mode.
- **Right-of-way rules** (`src/race/Rules.ts`), judged on contact between hulls:
  rule 10 (port tack keeps clear of starboard tack), 11 (windward keeps clear of leeward),
  12 (clear astern keeps clear), 13 (a boat that is tacking keeps clear), 31 (touching a mark of the leg being
  sailed or the start marks). Penalty: 2 turns (720°) for rules 10–13, 1 turn for rule 31, all in the same
  direction; the HUD shows the progress. A boat that finishes without serving it is disqualified (DSQ).
- **Rule-abiding AI**: it passes astern of right-of-way boats, luffs when it is to windward,
  slows down when coming from behind, doesn't tack on top of others and serves its own penalties.
- **Better AI starts**: boats start already in a holding position and time their run to the line.
- **Synthesised audio** (`src/core/Sound.ts`): wind, water, flapping sail, start signals,
  mark rounded, penalty, collisions.
- Capsule-shaped hulls for contacts (no longer circles); leeward mark moved below the start line.

## What's new since 0.1
- **Sailing physics** (`src/sailing/BoatPhysics.ts`): true wind + boat speed → apparent wind; the
  sheet limits the boom angle; the angle of attack gives lift and drag (the sail *luffs* if eased too much and
  *stalls* if sheeted in too much); no drive within ~40° of the wind; hull drag with a "wall" at hull speed;
  leeway resisted by the centreboard (worse at low speed); the rudder only works with speed; tacks cost speed;
  in a puff the boat heels and depowers.
- **Wind** (`src/sailing/Wind.ts`): direction shifts + puffs that move down the course.
- **Racing rules** (`src/race/`): start procedure, OCS, mark rounding (on the correct side), finish, standings.
- **AI** (`src/ai/RacingAI.ts`): holds position and times the start, beats upwind choosing the better tack
  (tacks on wind shifts), rounds marks on the correct side. Each Rival has a profile
  (technique, tactics, speed, discipline): Marco, not very disciplined, sometimes starts early.
- **GPU sea** (`src/world/Ocean.ts`): Gerstner waves in the vertex shader, sky reflection, puffs
  visible on the water. The CPU no longer updates the grid; the boats use the same wave function.
- **Boat graphics** (`src/world/BoatView.ts`): pram hull, sprit rig, sail with camber, twist and
  luffing, Helm hiking out, heel and pitch on the waves, masthead wind indicator.
- **HUD**: trim bar with the optimal zone, wind compass (no-go zone, optimal close-hauled angle, mark
  direction), favourable/unfavourable wind shift indicator, minimap with puffs and laylines, live standings.

## Architecture
```
src/
├── core/        math.ts (angles, RNG), Input.ts (keyboard + gamepad), ControlSettings.ts, Sound.ts
├── sailing/     BoatClass.ts (class data), BoatPhysics.ts, Wind.ts, BoatStates.ts
├── race/        Course.ts, Race.ts, Rules.ts, RaceSession.ts (fixed-step simulation, no graphics),
│                Fleet.ts, Collisions.ts, PlayerChoice.ts (Role + Control mode)
├── ai/          RacingAI.ts (the Helm) with StartPlanning, BeatTactics, TackStateMachine, Avoidance;
│                CrewAI.ts (the Crew)
├── sailors/     Sailors.ts (Rivals, sailor profiles, Crew Chemistry)
├── world/       Ocean.ts, Waves.ts, the boat views (BoatViewBase, BoatView, Boat420View), sails, CourseView.ts
├── i18n/        translation catalogs (it.ts: Italian) and the typed lookup
├── ui/          Hud.ts, hudPanel.ts, Menus.ts, race event and name wording, boat colours
├── game/        GameController.ts (game state and modes), PlayerControls, RaceFeedback, CameraRig, Preferences
└── main.ts      startup wiring and render loop
```
The simulation (`sailing/`, `race/`, `ai/`, `sailors/`) doesn't depend on Babylon: it runs at a fixed 60 Hz and can
be tested in Node without a browser. It emits data, never text: every in-game text lives in the catalogs in
`src/i18n/`. A new class (ILCA…) starts from a new entry in `BoatClass.ts`. The full module map and the
conventions are in the developer guide, [AGENTS.md](AGENTS.md).

## Known limitations
- The physics model is tuned by feel, not validated against real data. Optimist at 11 knots: ~2.3 kn upwind,
  ~3.9 kn reaching, ~3.5 kn downwind.
- Simplified rules: no mark-room (rule 18), no rule 16; breaches only count if there is contact.
- AI starts are still sometimes late (typically 0–15 s); no covering tactics.
- In light wind the AI sometimes struggles to keep clear of right-of-way boats and takes penalties.
- `window.__game` exposes debug hooks (autopilot, fast-forward) used by the automated tests.
