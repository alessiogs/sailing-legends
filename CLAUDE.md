# Sailing Legends — developer guide

Browser sailing game (Babylon.js 9 + TypeScript + Vite), aiming at a FIFA-style career mode.
The game concept is in `docs/CONCEPT.md`, the plan and known issues in `docs/ROADMAP.md`.
The player-facing README is in Italian; **in-game UI text is Italian**, code and comments are English.

Live: https://alessiogs.github.io/sailing-legends/ — every push to `main` deploys via
`.github/workflows/deploy.yml` (install → `npm test` → `npm run build` (tsc + vite) → Pages).
PRs are built and tested only.

## Commands
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # headless AI-only races, Optimist + 420, 7/11/16 kn; fails if a race doesn't finish
npm run polar    # speed table (polar) per class: use after any physics change
npm run build    # type-check + production build into dist/
```

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
  ui/        Hud.ts (role-driven panel, compass, minimap, standings, tags)
  main.ts    scene, camera, menus, game loop, player controls per role
scripts/     sim-test.ts (npm test), polar.ts (npm run polar)
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

## Building without npm (sandboxed sessions)
Some agent sandboxes can't reach the npm registry. Workaround used so far: sparse-clone Babylon.js
(`packages/dev/core`), generate its shader `.ts` files from `.fx` with the build-tools `BuildShader`, then
bundle with esbuild using `--alias:@babylonjs/core=<core/src> --alias:core=<core/src>` and a stub for
`draco3dgltf`. Headless Chromium (`--use-angle=swiftshader`) renders it at ~10 fps — fine for screenshots.
`window.__game` exposes `session`, `input`, `autopilot`, `fastForward(sec)` for scripted browser tests.
