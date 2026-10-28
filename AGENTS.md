# Sailing Legends — developer guide

Browser sailing game (Babylon.js 9 + TypeScript + Vite), aiming at a FIFA-style career mode.
The game concept is in `docs/CONCEPT.md`, the plan and known issues in `docs/ROADMAP.md`.
The player-facing README is in Italian; **in-game UI text is Italian**, code and comments are English.

## Branches and deploys
- `main` = published build: https://alessiogs.github.io/sailing-legends/
- `develop` = test build: https://alessiogs.github.io/sailing-legends/dev/
- Every change: branch from `develop` as `<type>/<short-name>` (`feature/`, `fix/`, `chore/`, `docs/`, …),
  then open a PR into `develop` and merge it yourself (merge commit, keeps every commit) once CI is green.
- Publishing is the user's call: merge `develop` → `main` only when asked.
- `gh` GraphQL is blocked in agent sessions; open and merge PRs via REST
  (`gh api repos/alessiogs/sailing-legends/pulls`, then `.../pulls/<n>/merge`).

`.github/workflows/deploy.yml`: every push to `main` or `develop` runs `npm test` + `npm run build` on that
commit, then rebuilds **both** branches (main at the root, develop under `/dev/`) and deploys them together,
since a Pages deploy replaces the whole site. PRs are only tested and type-checked
(`tsc -b`, no production bundle) and never deploy. Keep Vite's `base: "./"` so the
same build works at the root and under `/dev/`.

## Commands
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: headless smoke races (every race finishes, every penalty served), the golden
                 # races (nine fixed-seed races must match tests/golden/races.json exactly) and rule verdicts
npm run golden:update  # rewrite the golden snapshot: only when behaviour is meant to change; review its diff
npm run polar    # speed table (polar) per class: use after any physics change
npm run build    # type-check + production build into dist/
```
`tsc -b` checks two projects: `tsconfig.app.json` (`src/`, browser: DOM types, no Node types) and
`tsconfig.node.json` (`tests/`, `scripts/`, Node types, no DOM; it also checks the simulation code they import,
so that code can't use browser APIs).

## Architecture
```
src/
  core/      math.ts (angles, RNG, segment tests), Input.ts (keyboard/gamepad, tiller vs boat-direction
             steering, what the keys move per Role), ControlSettings.ts (the Commands menu settings and their
             defaults; DOM-free), Sound.ts (WebAudio synthesis, no assets)
  sailing/   BoatClass.ts (class data: Optimist, I420, keyed by the closed `ClassId` union; `isTwoPerson` =
             sailed by a Pair, which has `crewRighting`),
             BoatPhysics.ts (the model), Wind.ts (shifts + puffs), BoatStates.ts (Crew weight in/hiking/trapeze
             and spinnaker down/moving/up from the boat state: the one home of their thresholds)
  race/      Course.ts, Race.ts (start/OCS, rounding, finish, penalties), Rules.ts (RRS 10/11/12/13/31),
             RaceSession.ts (one race from a `Fleet`: wind, course, boats, AIs, contacts; fixed 60 Hz; no rendering)
             Fleet.ts (`makeFleet`: the player's boat with the Partner, the opponents with their Crews, and every
             boat's starting spot, from the class, the player's choices and the Rivals; plain data)
             Collisions.ts (hull capsules, mark discs and the committee capsule; closest points; pushing
             overlaps apart. Geometry only: the session tells the race about contacts and mark touches)
             PlayerChoice.ts (the player's Role, helm | crew, plus Control mode, playerCareer | fullBoat;
             Full Boat Control only for the Helm; presets HELM, CREW, FULL_BOAT = the three menu buttons)
  ai/        RacingAI.ts (the Helm: composes the parts below; mark rounding, trim error, penalty turns, rudder),
             BeatTactics.ts (steering toward a point, beating upwind: the persistent tack `onStbd`, hysteresis,
             the tack timer shared with the start and the tack state machine; implements `CourseSteering`),
             TackStateMachine.ts (`sail | tack | recover`: committed tacks, gybe round when too slow, the rule-13
             wait near other boats, recovery from irons), Avoidance.ts (`giveWay`: keep clear of right-of-way
             boats under rules 10/11/12; `boatWithin`),
             StartPlanning.ts (the Helm's start: line point, holding spot, start bias, timing the run to the line,
             OCS return; borrows the rest of the Helm's steering through `CourseSteering`),
             angles.ts (`CLOSE_HAULED`, shared by the AI parts),
             CrewAI.ts (the Crew: jib/spi trim, weight, side switch, spinnaker; `crewOnWrongSide` is the one
             wrong-side check, shared by the Crew AI, the browser autopilot and the HUD). Both read sailor profiles
  sailors/   Sailors.ts (sailor profiles, the Rival roster, the opponents' Crews, the extra Helm, the autopilot
             Helm, the Crew Chemistry formula; sailors are matched by `id`, never by name)
  world/     Ocean.ts (Gerstner waves in GLSL), Waves.ts (same waves on CPU), BoatViewBase.ts (what both boat
             visuals share: wave riding, heel, boom swing, rudder, burgee; each class gives its `BoatMotion` and
             draws its own sails and sailors), BoatView.ts (Optimist), Boat420View.ts, SailorFigure.ts (the sailor
             figure and its placement on the gunwale), boatMaterials.ts (`boatLook` from the colour table,
             `boatMaterial`: the one material cache of both boat views, per scene via sceneCache.ts), SailMesh.ts (the
             one sail mesh, for every sail of both classes) and sailShape.ts (its Babylon-free grid maths; a
             `SailCut` per class: the 420's in proportion to the chord, the Optimist's fixed offsets), CourseView.ts
  i18n/      index.ts (`t(key, params)`: typed lookup), it.ts (Italian catalog, the reference: it defines the
             keys), plural.ts (plural forms from Intl.PluralRules). All player-facing text lives in a catalog
  ui/        Hud.ts (draws the panel, compass, minimap, standings, tags), hudPanel.ts (`buildPanel`: the
             Role-driven bottom panel built from the race and the player's choices; pure, DOM-free),
             pageText.ts (fills index.html's data-i18n text from the catalog at startup), raceEventText.ts (words race events from their data),
             raceNames.ts (names legs by `LegId` and boats by the sailors on board),
             boatStateText.ts (words the Crew weight and spinnaker states for the HUD),
             boatColors.ts (the one boat colour table by racer id: 3D hull/sail/jacket/stripe and the HUD dot),
             dom.ts (`h(tag, attributes, ...children)`: builds elements; strings become text, never markup),
             Menus.ts (main menu: class, wind, Role, Partner, Auto-trim; Commands menu; pause and results
             screens. Implements the controller's `Screens`; `attach(game)` wires the buttons)
  game/      GameController.ts (owns the game state: race session, class, Role and Control mode, Partner, wind,
             Assists; the menu / racing / paused / results / controls modes; one `frame(dt)` per render; plays the
             race feedback's cues). Drives the page through `Screens`.
             RaceFeedback.ts (countdown beeps, race events as sounds and messages, coaching hints: tack/gybe
             calls, the Partner's calls, the irons hint; returns `Cue`s for the controller to play; DOM/audio-free)
             PlayerControls.ts (the player's input turned into the boat's controls per Role and Control mode:
             steering, sheets, weight, side switch, spinnaker key, Auto-trim, the browser autopilot; DOM-free)
             CameraRig.ts (the orbit camera and its chase / free / top views), Preferences.ts (`loadPrefs`,
             `savePrefs`: controls and mute under `sl-prefs`; keep the stored format so saved preferences load),
             testHook.ts (the typed `window.__game` test hook, `GameTestHook`, and `window.__fps`)
  main.ts    startup wiring: scene, camera rig, preferences, `Menus`, render loop, installs the test hook
tests/       Vitest tests (npm test): smoke.test.ts (every AI-only race finishes, every penalty served),
             golden.test.ts + golden/ (races.ts sails and records the golden races, races.json is the snapshot),
             rules.test.ts (rule 10/11/12/13 verdicts and penalty turns, two boats placed by hand)
             i18n.test.ts (lookup, parameters, plural rules; catalogs with missing or extra keys fail the type-check)
             page-text.test.ts (index.html filled from the catalog reads as page-text/original.json)
             event-text.test.ts (every race event kind, worded through the Italian catalog, reads as before)
             race-names.test.ts (leg and boat names of every session setup read as before)
             sailors.test.ts (rosters, Partner swap, Crew Chemistry values as the menu shows them)
             player-choice.test.ts (Crew with Full Boat Control is a type error; the Partner set up per choice)
             crew-side.test.ts (the shared Crew wrong-side check)
             boat-states.test.ts (Crew weight and spinnaker thresholds, and their HUD wording)
             boat-colors.test.ts (every boat has its colours; 3D and HUD colours as before)
             preferences.test.ts (saved preferences still load; saving keeps the `sl-prefs` format)
             player-controls.test.ts (what the player's input does per Role and Control mode, Auto-trim, autopilot)
             hud-panel.test.ts (the HUD panel's lines per Role and Control mode, as the HUD shows them)
             race-feedback.test.ts (which sounds, messages and hints the race gives, and when)
             boat-class.test.ts (class ids: a misspelt id is a type error; every class keyed by its own id)
             start-planning.test.ts (the AI's holding spot, line point, RNG draws and start decisions)
             racing-ai-parts.test.ts (the AI's avoidance, beat tactics and tack state machine on their own)
             collisions.test.ts (hull capsules, closest points, hulls pushed apart and out of marks)
             fleet.test.ts (who races per class and choice, starting spots, the session racing the fleet it is given)
             scene-cache.test.ts (boat materials made once per scene, again for a recreated scene)
             sail-shape.test.ts (the shared sail grid draws the Optimist and 420 sails exactly as before)
scripts/     polar.ts (npm run polar), golden-update.ts (npm run golden:update)
```
**Rule:** `sailing/`, `race/`, `ai/`, `sailors/` must not import Babylon. They run in Node (tests) and in the browser.

## Conventions (get these right)
- Vocabulary: names in code, comments and docs follow `GLOSSARY.md`. The steering sailor is the **Helm** (never
  skipper); **Crew** is only the sailor who trims the jib/spinnaker and moves their weight; the two sailors of a
  boat are the **Pair**; the player's AI teammate is the **Partner**; the player's choice is a **Role**
  (`Input.role`, `PlayerChoice.role`) plus a **Control mode**; **Auto-trim** is one of the **Assists**.
- World: Babylon left-handed, seen from above **+Z = north, +X = east**. A *bearing/heading* is 0 at +Z and
  grows clockwise toward +X (`bearingTo`, `dirX = sin`, `dirZ = cos`). `Mesh.rotation.y = heading`.
- Wind `fromDir` is where the wind comes **from** (bearing). The default course has wind from 0 (north),
  so the windward mark is at +Z.
- Signed angles relative to the bow (`twa`, `awa`): **+ = from starboard**. Starboard tack ⇔ `twa > 0`.
- Sides (`boomSide`, `jibSide`, `spiSide`, `crewSide`): +1 starboard, −1 port. Leeward = `awa >= 0 ? -1 : 1`.
  Boom visual: `rig.rotation.y = -boomSide * angle`.
- Controls: `rudder` +1 turns the bow to starboard. The **tiller** is the opposite: `Input.rudder = -tiller`.
  Default steering = tiller (→ moves the tiller right, the boat turns left); "boat" mode is the option.
- Sheets 0 = sheeted in, 1 = eased. Crew weight `crewOut` 0 = in, 0.5 = hiking, 1 = trapeze.
- Port rounding = bearing from mark to boat **decreasing** (counter-clockwise from above).
- Player-facing text: never a string literal in code. Add a key to `src/i18n/it.ts` (and every other catalog),
  named `area.name` in camelCase (`toast.audioOn`, `hud.leg.sailing`), and show it with `t(key, params)`.
  Messages with parameters are functions of a typed object; counts use `plurals(locale)`, never `n === 1`.
  Text in `index.html` is no exception: give the element `data-i18n="key"` (or `data-i18n-aria-label="key"`)
  and leave it empty; `ui/pageText.ts` fills it at startup, before child elements such as key hints.
  Runtime text, sailor names above all, reaches the page as text (`textContent`, or `h` from `ui/dom.ts`), never
  through `innerHTML`, so a player-created name can't break the page.
  The only Italian kept in the page is `#loading` (shown before the scripts run; a test keeps it equal to `menu.loading`).

## Golden races
`tests/golden.test.ts` sails six AI-only races (Optimist and 420 at 7/11/16 kn) and three 420 races with a
player boat as Helm, as Crew and in Full Boat Control, driven by a test-only player in `tests/golden/races.ts`.
It compares positions, headings and speeds every 10 s, finish times, standings, DSQs and event kinds (with
boats, times and penalty turns, never wording) against `tests/golden/races.json`. `npm test` only reads the
snapshot. A golden diff means behaviour changed: in a refactor, fix the code, never the snapshot.

## Physics notes (BoatPhysics.ts)
Each sail: sheet limits its angle; if eased past the apparent wind it weathervanes (luffs); on the windward
side it is pinned (backed jib / by the lee). Lift/drag from angle of attack; lift points to the leeward side of
the chord. Righting = Crew force (by `crewOut`, must be on windward side) + Helm hiking up to `hikeForce`;
excess side force → heel + depower (`drive *= sqrt(k)`), too much weight out → windward heel + drag.
The centreboard rotates velocity toward the heading (costs speed when turning) only when moving forward.
Optimal sheets are found by sampling (`optimalSheetFor`). Target speeds at 11 kn:
Optimist ≈ 2.3 kn upwind / 3.9 reach / 3.5 run; 420 ≈ 4 kn upwind / 6.5 reach / 6–7 with spinnaker.
After changing physics run `npm run polar` and `npm test`, and check tacks still complete
(a tack from close-hauled must get through the wind and recover).

## AI notes (RacingAI.ts and the parts it composes)
Pitfalls already fixed — keep them fixed:
- Turning through the wind is a committed **tack** (state machine `sail | tack | recover`); without
  commitment the AI dithers into irons. Too slow to tack → it bears away round (gybe).
- Tack decisions use the persistent `onStbd` + hysteresis + min interval, never just "closest tack".
- Going backwards the rudder works in reverse (`rud = -rud`).
- Distances scale with boat length (`this.k`): holding spot, rounding orbit, look-ahead.
- Don't tack within `7k` m of another boat (rule 13), but cap the wait (6 s) or boats sail off forever.
- The start plan draws its two numbers (line point, start bias) from the Helm's RNG first, before any trim
  error: keep that order, or every golden race changes.
Start quality is still the weakest part (often 5–25 s late); it lives in `StartPlanning.ts`.

## Rules (Rules.ts / Race.ts / RaceSession.ts)
Judged only on hull contact (capsule shapes, in `Collisions.ts`). One penalty per incident (no stacking while one is owed).
Rule 31 counts only the marks of the leg being sailed (finish buoys sit on the first beat!) and the start
marks before starting. Unserved penalty at the finish ⇒ DSQ.
Race events (`RaceEvent`) and verdicts (`Verdict`) are data: kind, racer, other, rule, turns, who was at fault,
reason. No text: `ui/raceEventText.ts` words them, and the UI reads facts (e.g. fault) from the data.
Legs carry a `LegId` (`mark1`, `mark2`, `finish`) and racers their `sailors` (Helm, Crew; the player is
`{ kind: "player" }`), never a display name: `ui/raceNames.ts` (`legName`, `racerName`) names them.

## Building without npm (sandboxed sessions)
Some agent sandboxes can't reach the npm registry. Workaround used so far: sparse-clone Babylon.js
(`packages/dev/core`), generate its shader `.ts` files from `.fx` with the build-tools `BuildShader`, then
bundle with esbuild using `--alias:@babylonjs/core=<core/src> --alias:core=<core/src>` and a stub for
`draco3dgltf`. Headless Chromium (`--use-angle=swiftshader`) renders it at ~10 fps — fine for screenshots.
`window.__game` (typed as `GameTestHook` in `src/game/testHook.ts`) exposes `session`, `input`, `mode`, `start()`,
`angleDiff`, `autopilot`, `fastForward(sec)` for scripted browser tests; `window.__fps` is the frame rate.

## Agent skills

Matt Pocock's engineering and productivity skills are vendored in `.claude/skills/`
(from `mattpocock/skills` @ 59db609; update by re-copying from that repo).

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root (created lazily when needed). See `docs/agents/domain.md`.
