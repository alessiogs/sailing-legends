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

## How planning works
This file holds the vision and the order. Details and status live on GitHub: one
[milestone](https://github.com/alessiogs/sailing-legends/milestones) per version, a spec issue for big
versions, and its issues (5–8 per spec). Don't copy issue lists here.

## Next (in order)
- **0.4.x maintenance** — small tech-debt issues, worked in the background (no spec).
- **0.5 Career season** — spec #84. An Optimist Season (4 Regattas × 3 Races, low-point Points, Discard),
  Rivals and generated sailors in fleets that grow with the level, standings and Season summary, a saved
  Career, then stay in the Optimist or move to the 420 with a Partner; Crew Chemistry moves with results.
  Ages and the Optimist Age limit (15) are stored but not enforced yet.
- **0.6 Training and Optimist hiking** — weight/hiking and roll tacks in the Optimist, training drills with
  coach feedback, player attributes, "sim this race" to shorten a Season.
- **0.7 Race tactics** — mark-room (rule 18), rule 16, protests, AI covering/splitting.
- **0.8 Weather and venues** — Garda thermal winds, sea state, current, light; real venues.
- **0.9 Replay** — tactical review of a race from above.
- **1.0 More classes** — ILCA first, then 29er/49er (skiff physics, gennaker, planing); forced class change
  at the Age limit; several championships per Season with qualification
  (see `docs/research/italian-youth-qualification.md`).
- **Later, no milestone:** online multiplayer.

## Known issues
- AI starts are often 5–25 s late; occasional AI penalty turns in crowded light-wind beats.
- Overpowered 420 in 16 kn heels a lot (depower model favours sheeting in).
- Chemistry has a small effect on spinnaker timing (hoist time dominates).
- Sailors are simple capsule figures; no animations.
- Physics tuned for feel, not validated against real polars.
