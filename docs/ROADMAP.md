# Roadmap

## Done
- **0.1** (ChatGPT) — scene, simple boat, animated water, HUD.
- **0.2** — Optimist physics (apparent wind, no-go zone, lift/drag, inertia, leeway, tacks/gybes), wind
  shifts and puffs, full windward/leeward race with start, OCS, roundings, finish; AI rivals with profiles;
  GPU Gerstner ocean; HUD with trim bar, wind compass, minimap, standings.
- **0.3** — realistic tiller steering + Commands menu; right-of-way rules 10/11/12/13/31 with penalty turns
  and DSQ; AI avoidance; better AI starts; synthesized sound.
- **0.4** — 420 (jib, spinnaker, trapeze), roles Helm / Crew / Full Boat Control, partner choice and Crew
  Chemistry, AI crews; GitHub repo + Pages CI/CD.
- **0.5 Career season** — spec #84. An Optimist Season (4 Regattas × 3 Races, low-point Points, Discard),
  Rivals and generated sailors in fleets that grow with the level, standings and Season summary, a saved
  Career, then stay in the Optimist or move to the 420 with a Partner; Crew Chemistry moves with results.
  Ages and the Optimist Age limit (15) are stored but not enforced yet.
- **0.6a New HUD** — the "Sail number" HUD: top strip, compass pill, one message pill, a Standings/map panel,
  and a thumb deck (tiller bar, vertical sheet slider, context buttons) that works the same on a phone,
  a laptop and a desktop; a portrait camera and a no-overlap check for the HUD.
- **0.6b Boats and sailors** — spec #119. Articulated sailors with looks from their id and height from age,
  animated hiking, trapeze and roll tacks; boat detail: a sail number and class symbol on the mainsail (both faces),
  visible sheets, toe straps and a trapeze handle (visuals only).
- **0.5.x Career tuning** — spec #130. A Sardinian Season: club at Circolo del Mare Fertilia (Alghero), the four
  Zonale Stages (Olbia, La Caletta, Porto Rotondo, Cagliari), Follonica and Riva del Garda (7 Regattas,
  17 Races). AI attributes now shape how a sailor sails; fleets, generated sailors and Rivals follow one
  strength-by-age curve (`career/Strength.ts`), measured with `npm run career-sim`.

## How planning works
This file holds the vision and the order. Details and status live on GitHub: one
[milestone](https://github.com/alessiogs/sailing-legends/milestones) per version, a spec issue for big
versions, and its issues (5–8 per spec). Don't copy issue lists here.

## Next (in order)
- **0.4.x maintenance** — small tech-debt issues, worked in the background (no spec).
- **0.6c Body weight and planing** — fore-aft and side weight in the physics, Optimist hiking and roll tacks,
  bow up to surf and plane.
- **0.7 Training** — drills, a coach, player attributes, "sim this race".
- **0.8 Race tactics** — mark-room (rule 18), rule 16, protests, AI covering/splitting.
- **0.9 Weather and venues** — Garda thermal winds, sea state, current, light; real venues.
- **0.10 Replay** — tactical review of a race from above.
- **1.0 More classes** — ILCA first, then 29er/49er (skiff physics, gennaker, planing); forced class change
  at the Age limit; several championships per Season with qualification
  (see `docs/research/italian-youth-qualification.md`).
- **Later, no milestone:** multiplayer (online).

## Known issues
- AI starts are often 5–25 s late; occasional AI penalty turns in crowded light-wind beats.
- Overpowered 420 in 16 kn heels a lot (depower model favours sheeting in).
- Chemistry has a small effect on spinnaker timing (hoist time dominates).
- Physics tuned for feel, not validated against real polars.
