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
since a Pages deploy replaces the whole site. PRs are built and tested only. Keep Vite's `base: "./"` so the
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
             steering, crew station), Sound.ts (WebAudio synthesis, no assets)
  sailing/   BoatClass.ts (class data: Optimist, I420), BoatPhysics.ts (the model), Wind.ts (shifts + puffs)
  race/      Course.ts, Race.ts (start/OCS, rounding, finish, penalties), Rules.ts (RRS 10/11/12/13/31),
             RaceSession.ts (one race: wind, boats, AIs, contacts; fixed 60 Hz; no rendering)
  ai/        RacingAI.ts (helm: tactics, tacking state machine, avoidance, penalties, start timing),
             CrewAI.ts (crew: jib/spi trim, weight, side switch, spinnaker; Crew Chemistry)
  world/     Ocean.ts (Gerstner waves in GLSL), Waves.ts (same waves on CPU), BoatView.ts (Optimist),
             Boat420View.ts, SailMesh.ts, CourseView.ts
  i18n/      index.ts (`t(key, params)`: typed lookup), it.ts (Italian catalog, the reference: it defines the
             keys), plural.ts (plural forms from Intl.PluralRules). All player-facing text lives in a catalog
  ui/        Hud.ts (role-driven panel, compass, minimap, standings, tags), pageText.ts (fills index.html's
             data-i18n text from the catalog at startup), raceEventText.ts (words race events from their data),
             raceNames.ts (names legs by `LegId` and boats by the sailors on board)
  main.ts    scene, camera, menus, game loop, player controls per role
tests/       Vitest tests (npm test): smoke.test.ts (every AI-only race finishes, every penalty served),
             golden.test.ts + golden/ (races.ts sails and records the golden races, races.json is the snapshot),
             rules.test.ts (rule 10/11/12/13 verdicts and penalty turns, two boats placed by hand)
             i18n.test.ts (lookup, parameters, plural rules; catalogs with missing or extra keys fail the type-check)
             page-text.test.ts (index.html filled from the catalog reads as page-text/original.json)
             event-text.test.ts (every race event kind, worded through the Italian catalog, reads as before)
             race-names.test.ts (leg and boat names of every session setup read as before)
scripts/     polar.ts (npm run polar), golden-update.ts (npm run golden:update)
```
**Rule:** `sailing/`, `race/`, `ai/` must not import Babylon. They run in Node (tests) and in the browser.

## Conventions (get these right)
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
the chord. Righting = crew force (by `crewOut`, must be on windward side) + helm hiking up to `hikeForce`;
excess side force → heel + depower (`drive *= sqrt(k)`), too much weight out → windward heel + drag.
The centreboard rotates velocity toward the heading (costs speed when turning) only when moving forward.
Optimal sheets are found by sampling (`optimalSheetFor`). Target speeds at 11 kn:
Optimist ≈ 2.3 kn upwind / 3.9 reach / 3.5 run; 420 ≈ 4 kn upwind / 6.5 reach / 6–7 with spinnaker.
After changing physics run `npm run polar` and `npm test`, and check tacks still complete
(a tack from close-hauled must get through the wind and recover).

## AI notes (RacingAI.ts)
Pitfalls already fixed — keep them fixed:
- Turning through the wind is a committed **tack** (state machine `sail | tack | recover`); without
  commitment the AI dithers into irons. Too slow to tack → it bears away round (gybe).
- Tack decisions use the persistent `onStbd` + hysteresis + min interval, never just "closest tack".
- Going backwards the rudder works in reverse (`rud = -rud`).
- Distances scale with boat length (`this.k`): holding spot, rounding orbit, look-ahead.
- Don't tack within `7k` m of another boat (rule 13), but cap the wait (6 s) or boats sail off forever.
Start quality is still the weakest part (often 5–25 s late).

## Rules (Rules.ts / Race.ts / RaceSession.ts)
Judged only on hull contact (capsule shapes). One penalty per incident (no stacking while one is owed).
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
`window.__game` exposes `session`, `input`, `autopilot`, `fastForward(sec)` for scripted browser tests.

## Agent skills

Matt Pocock's engineering and productivity skills are vendored in `.claude/skills/`
(from `mattpocock/skills` @ 59db609; update by re-copying from that repo).

### Issue tracker

Issues are tracked in this repo's GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root (created lazily when needed). See `docs/agents/domain.md`.
