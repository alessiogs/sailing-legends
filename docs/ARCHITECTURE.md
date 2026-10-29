# Architecture: module and test map

Every source file and test, one line each. AGENTS.md has the short version; update both when you add or move a file.

## Source tree
```
src/
  core/      math.ts (angles, RNG, segment tests), Input.ts (keyboard/gamepad, tiller vs boat-direction
             steering, what the keys move per Role), ControlSettings.ts (the Commands menu settings and their
             defaults; DOM-free), Sound.ts (WebAudio synthesis, no assets)
  sailing/   BoatClass.ts (class data: Optimist, I420, keyed by the closed `ClassId` union; `isTwoPerson` =
             sailed by a Pair, which has `crewRighting`),
             BoatPhysics.ts (the model), Wind.ts (shifts + puffs), BoatStates.ts (Crew weight in/hiking/trapeze
             and spinnaker down/moving/up from the boat state: the one home of their thresholds)
  race/      Course.ts (marks, start/finish lines and legs, each with a `LegId`),
             Race.ts (start/OCS, rounding, finish, penalties), Rules.ts (RRS 10/11/12/13/31),
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
**Rule:** `core/math.ts`, `sailing/`, `race/`, `ai/`, `sailors/`, `i18n/` and every other file a test imports
(`hudPanel.ts`, `raceEventText.ts`, `PlayerControls.ts`, `RaceFeedback.ts`, `sailShape.ts`, `sceneCache.ts`, …)
import neither Babylon nor browser APIs: they run in Node (tests) and in the browser, and `tsconfig.node.json`
type-checks them without DOM types.

