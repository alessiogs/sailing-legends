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
· `npm run golden:update` (only when behaviour is meant to change; review the diff).
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
- `src/world/`: the Babylon visuals (ocean, boats, sails, course).
- `src/i18n/`: `t(key, params)` and the catalogs (`it.ts` is the reference, `en.ts` follows it).
- `src/ui/`: HUD, the pure `buildPanel`, menus, how events and names are worded, boat colours, `h()` for markup.
- `src/game/`: `GameController` (state and modes), `PlayerControls`, `RaceFeedback`, the camera, preferences and
  the test hook.
- `src/main.ts`: startup wiring.
- `tests/`: one test file per module, plus `smoke`, `golden` and `rules`.
- `scripts/`: `polar.ts` and `golden-update.ts`.

**Rule:** `core/math.ts`, `sailing/`, `race/`, `ai/`, `sailors/`, `i18n/` and every other file a test imports
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
- **Golden races:** `tests/golden.test.ts` sails nine fixed-seed races: AI-only races in both classes at 7, 11
  and 16 kn, plus 420 races with the player as Helm, as Crew and in Full Boat Control. It compares them with
  `tests/golden/races.json`. A diff means behaviour changed, so in a refactor fix the code, never the snapshot.
- **Physics** (`BoatPhysics.ts`): target speeds at 11 kn:
  - Optimist: about 2.3 kn upwind, 3.9 reaching, 3.5 running.
  - 420: about 4 kn upwind, 6.5 reaching, 6–7 with the spinnaker.

  After a physics change, run `polar` and `npm test`, and check that a tack from close-hauled still gets through
  the wind.
- **AI pitfalls, keep them fixed:**
  - A tack is committed (`sail | tack | recover`). Too slow to tack, the boat bears away round instead.
  - Tack decisions use the persistent `onStbd`, with hysteresis and a minimum interval.
  - Going backwards, the rudder is reversed.
  - Distances scale with the boat's length (`k`).
  - Rule 13: don't tack within 7k of another boat, but wait at most 6 s.
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
- **Size:** aim for about 5–8 issues per spec. One agent can implement a group of related issues in one context.
- **Ceremony:** use the spec, grilling and TDD skills for big or risky work, and plain instructions for small fixes.
- **Context:** keep one task per context, with durable facts in files, and start fresh when the topic changes.
- **This file:** it is loaded into every agent, so keep it short and put detail in `docs/`.

## Agent skills
- Matt Pocock's skills are vendored in `.claude/skills/` (`mattpocock/skills` @ 59db609; update by re-copying).
- Issues are on GitHub through `gh` (`docs/agents/issue-tracker.md`).
- Labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`
  (`docs/agents/triage-labels.md`).
- Domain docs: `GLOSSARY.md` and `docs/adr/`. Add an ADR when a decision is hard to reverse (`docs/agents/domain.md`).
