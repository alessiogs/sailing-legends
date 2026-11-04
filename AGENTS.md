# Sailing Legends — developer guide

Browser sailing game (Babylon.js 9 + TypeScript + Vite) aiming at a FIFA-style career mode.

**Further docs, read when needed:**

- Concept: `docs/CONCEPT.md`
- Plan: `docs/ROADMAP.md`
- Vocabulary: `GLOSSARY.md`
- Decisions: `docs/adr/`
- Every file and test: `docs/ARCHITECTURE.md`
- Building without npm: `docs/agents/sandbox-build.md`

**Languages:** code, comments, docs and the README are English and use the glossary's terms. In-game text is
Italian or English (the player's choice) and lives only in the catalogs in `src/i18n/` (ADR 0001: the simulation emits data
and the UI words it).

## Branches, PRs, deploys

- `main` is published at https://alessiogs.github.io/sailing-legends/ and `develop` at the same address under
  `/dev/`. Publishing (`develop` → `main`) is the user's call, so only when asked.
- To make a change:
  1. Branch from `develop` as `feature/…`, `fix/…`, `chore/…` or `docs/…`.
  2. Open a PR into `develop`.
  3. Once CI is green, merge it yourself with a merge commit.
- Use the REST API for PRs (`gh api repos/alessiogs/sailing-legends/pulls`, then `…/pulls/<n>/merge`). GraphQL is
  blocked in agent sessions.
- CI (`.github/workflows/deploy.yml`): a PR runs `npm test` and `tsc -b` and never deploys. A push to `main` or
  `develop` tests, builds and deploys both branches, since one Pages deploy replaces the whole site. Never use
  workflow_dispatch. Keep Vite's `base: "./"`.

## Commands

`npm run dev` (localhost:5173) · `npm test` (Vitest: smoke races, golden races, rule verdicts and unit tests)
· `npm run build` (type-check and bundle) · `npm run polar` (speed table, after any physics change)
· `npm run golden:update` (only when behaviour is meant to change; review the diff)
· `npm run format` (Prettier with its defaults; CI runs `npm run format:check`).
`tsc -b` checks two projects: `tsconfig.app.json` (`src/`, DOM types) and `tsconfig.node.json` (`tests/`,
`scripts/` and the simulation code they import, with Node types and no DOM).

## Layout (full map: `docs/ARCHITECTURE.md`)

- `src/core/`: math and RNG, input, control settings, sound.
- `src/sailing/`: boat classes (`ClassId`), physics, wind, the Crew weight and spinnaker states.
- `src/race/`: course, race (start, rounding, finish, penalties), rules, `RaceSession` (one race at a fixed 60 Hz,
  no rendering), `Fleet`, collisions, `PlayerChoice` (Role + Control mode).
- `src/ai/`: `RacingAI` (the Helm) composes `BeatTactics`, `TackStateMachine`, `Avoidance` and
  `StartPlanning`. `CrewAI` is the Crew.
- `src/sailors/`: sailor profiles, Rivals and Crew Chemistry. Sailors are matched by `id`, never by name.
- `src/career/`: the pure Career rules (Season, scoring, save, sailor pool, Chemistry); returns data, the UI words it.
- `src/world/`: the Babylon visuals (ocean, boats, sails, course).
- `src/i18n/`: `t(key, params)` and the catalogs (`it.ts` is the reference, `en.ts` follows it).
- `src/ui/`: HUD, the pure `buildPanel`, menus, how events and names are worded, boat colours, `h()` for markup.
- `src/game/`: `GameController` (state and modes), `PlayerControls`, `RaceFeedback`, the camera, preferences and
  the test hook.
- `src/main.ts`: startup wiring.
- `tests/`: one test file per module, plus `smoke`, `golden` and `rules`.
- `scripts/`: `polar.ts` and `golden-update.ts`, and `hud-overlap.cjs` (the HUD no-overlap check, run by hand in a
  browser; see `docs/agents/sandbox-build.md`). After any HUD change, run it.

**Rule:** `core/math.ts`, `sailing/`, `race/`, `ai/`, `sailors/`, `career/`, `i18n/` and every other file a test imports
use neither Babylon nor browser APIs. They also run in Node.

## Conventions (get these right)

- **Vocabulary:**
  - **Helm**, never skipper, is the sailor who steers.
  - **Crew** is only the sailor who trims the jib or spinnaker and moves their weight.
  - **Pair** is a boat's two sailors.
  - **Partner** is the player's AI teammate.
  - **Role** (`helm | crew`) plus **Control mode** (`playerCareer | fullBoat`) is the player's choice.
  - **Auto-trim** is one of the **Assists**.
- **World:** Babylon left-handed, +Z is north and +X is east. A heading or bearing is 0 at +Z and grows
  clockwise (`dirX = sin`, `dirZ = cos`, `Mesh.rotation.y = heading`).
- **Wind:** `fromDir` is where the wind comes from. By default it comes from 0, so the windward mark is at +Z.
- **Angles off the bow (`twa`, `awa`):** + means from starboard, so starboard tack ⇔ `twa > 0`.
- **Sides** (`boomSide`, `jibSide`, `spiSide`, `crewSide`): +1 is starboard and −1 is port.
  Leeward = `awa >= 0 ? -1 : 1`, and the boom visual is `rig.rotation.y = -boomSide * angle`.
- **Rudder:** `rudder` +1 turns the bow to starboard. The tiller works the other way (`Input.rudder = -tiller`).
  Tiller steering is the default; "boat" steering is the option.
- **Sheets and weight:** 0 is sheeted in and 1 is eased. For `crewOut`, 0 is sitting in, 0.5 hiking, 1 trapeze.
- **Port rounding:** the bearing from the mark to the boat decreases.
- **Text:** never a string literal in code.
  - Add a key to every catalog, named `area.name` in camelCase, and show it with `t(key, params)`.
  - Counts go through `plurals(locale)`.
  - `index.html` elements get `data-i18n` or `data-i18n-aria-label` and stay empty.
  - Runtime text goes in through `textContent` or `h()`, never `innerHTML`.
  - The only Italian in the page is `#loading`.

## Behaviour guards

- **Golden races:** `tests/golden.test.ts` sails twelve fixed-seed races: AI-only races in both classes at 7, 11
  and 16 kn, an AI-only ILCA 6, 29er and 49er race at 11 kn each, plus 420 races with the player as Helm, as Crew and in Full Boat Control. It compares them with
  `tests/golden/races.json`. A diff means behaviour changed, so in a refactor fix the code, never the snapshot.
- **Physics** (`BoatPhysics.ts`): target speeds at 11 kn:
  - Optimist: about 2.3 kn upwind, 3.9 reaching, 3.5 running.
  - 420: about 4 kn upwind, 6.5 reaching, 6–7 with the spinnaker.
  - ILCA 4 / 6 / 7 (ideal sailor weight 53 / 68 / 82 kg; `npm run polar` prints the table and the best downwind VMG). At 11 kn:
    about 4.3 kn close-hauled (45°) in all three, 5.9 / 6.1 / 6.4 reaching and 4.6 / 4.8 / 5.0 downwind VMG; at 16 kn about
    4.5 / 4.6 / 4.7 upwind, 7.2 / 7.6 / 8.0 on a planing broad reach (120°) and 5.7 / 6.0 / 6.2 VMG; at 7 kn about 3.0 / 3.2 / 3.5
    upwind, 4.3 / 4.4 / 4.4 reaching and 3.2 / 3.3 / 3.6 VMG. The spec's table is 0.1-0.4 kn higher at 11 kn and the 7 kn
    downwind VMG is about 0.8-0.9 kn under it. A steep wave-drag wall at about 2 m/s pins the upwind speed; the ILCA planes
    from 9.5 kn (`planing.onsetKn`). A sailor lighter than the rig's ideal loses drive in a breeze, so light sailors are
    quickest in the 4 and heavy ones in the 7.
  - 29er (gennaker, `npm run polar`): at 7 / 11 / 16 kn close-hauled (45°) about 4.1 / 6.2 / 6.7 kn, reaching (best of 90–120°) 6.5 /
    11.1 / 14.8 kn, best downwind VMG with the gennaker 5.3 @ 150° / 8.4 @ 145° / 11.7 @ 140°. The spec's table is 4.7 / 5.8 / 6.5 up,
    7 / 10.5 / 14 reaching, 6 / 9 / 12 VMG: light air (7 kn) runs 0.5–0.8 kn under it (a steep wave-drag wall caps the hull at
    about 3 m/s; planing from 6.2 kn frees it only partly), 11 kn upwind and reaching 0.4–0.6 over. The gennaker is a spinnaker with
    `gennaker: true`: it works from an apparent wind angle of 45° and keeps a quarter of its power dead astern; the best VMG angle
    stays in 135–155°. Raising the sails or lowering hull drag to close the 7 kn gap pushed 11 kn up past the table.
  - 49er (`npm run polar`; both sailors on the trapeze, the Helm's `helmOut` spans in / hiking / trapeze like the Crew's `crewOut`):
    at 7 / 11 / 16 kn close-hauled (45°) about 4.9 / 7.1 / 7.8 kn, reaching (best of 90–120°) 7.5 / 13.2 / 18.0 kn, best downwind VMG
    with the gennaker 6.3 @ 150° / 10.2 @ 150° / 14.5 @ 150°. The spec's table is 5.4 / 6.7 / 8.1 up, 8 / 13.5 / 18 reaching,
    6.9 / 10.9 / 14.2 VMG: 7 kn runs 0.5–0.7 kn under it and 11 kn VMG 0.7 under (the wave-drag wall caps the hull; two tuning attempts
    made, as for the 29er); the best VMG angle sits at 150° rather than the table's 142–140°. Planes from 6.2 kn (`onsetKn`).
  - At 16 kn the 420 planes (weight aft, flat, reach to broad reach, from 12–13 kn): about 8–9 kn reaching, 9–10 with the
    spinnaker. The Optimist gains 3–5% downwind from 12 kn with its bow up. Upwind and 11 kn do not change.

  After a physics change, run `polar` and `npm test`, and check that a tack from close-hauled still gets through
  the wind.

- **AI pitfalls, keep them fixed:**
  - A tack is committed (`sail | tack | recover`). Too slow to tack, the boat bears away round instead.
  - Tack decisions use the persistent `onStbd`, with hysteresis and a minimum interval.
  - Going backwards, the rudder is reversed.
  - Distances scale with the boat's length (`k`).
  - Rule 13: don't tack within 7k of another boat, but wait at most 6 s.
  - Skiffs (gennaker classes) run at the VMG angle (`RunTactics`, the beat mirrored about the wind): a persistent gybe `onStbd`,
    hysteresis, a committed gybe, a gybe on the layline, straight at the mark inside 14k. Its draws are on their own stream
    (`seed ^ 0x6e11`) and no other class uses it. The gennaker goes up past a 100° TWA and down 40 m from the mark.
  - The start plan draws its two random numbers first. Changing that order changes every golden race.
- **Rules:**
  - Judged only on hull contact, one penalty per incident.
  - Rule 31 counts only the marks of the current leg, plus the start marks before the start.
  - A penalty still owed at the finish means DSQ.
  - Events and verdicts are data with no text: legs have a `LegId` and racers have their `sailors`, and the UI
    names them through `ui/raceNames.ts`.

## Working with agents (keep token use down)

- **Model by task:**
  - **Opus:** specs, issue breakdowns, design calls, subtle work (golden diffs, RNG order) and the final review.
  - **Sonnet:** implementing a clearly specified issue.
  - **Haiku:** mechanical work (searches, docs passes, CI polling).
  - If a cheaper model fails the same check twice, hand the task to the stronger one.
- **Size:** aim for about 5–8 issues per spec.
- **Grouping:** give one agent 2–3 related issues in one context, not one agent per issue: each fresh agent spends
  30–50k tokens re-reading the docs and code.
- **Browser checks:** run the headless-browser check once per milestone, at the end, not in every issue. Issues rely
  on unit tests, the golden races and CI.
- **Ceremony:** use the spec, grilling and TDD skills for big or risky work, and plain instructions for small fixes.
- **Context:** keep one task per context, with durable facts in files, and start fresh when the topic changes.
- **This file:** it is loaded into every agent, so keep it short and put detail in `docs/`.

## Agent skills

- Matt Pocock's skills are vendored in `.claude/skills/` (`mattpocock/skills` @ 59db609; update by re-copying).
- Issues are on GitHub through `gh` (`docs/agents/issue-tracker.md`).
- Labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`
  (`docs/agents/triage-labels.md`).
- Domain docs: `GLOSSARY.md` and `docs/adr/`. Add an ADR when a decision is hard to reverse (`docs/agents/domain.md`).
