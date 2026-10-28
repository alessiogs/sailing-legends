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

## Next (suggested order)
1. **Short career season** — 4–5 regattas with points, persistent rivals (localStorage first), chemistry
   that changes with results, simple progression screen, choice Optimist → 420/ILCA at the end.
2. **Weight/hiking in the Optimist** and roll tacks.
3. **Training mode** — drills for tacks, starts, roundings with time and coach feedback.
4. **Race tactics** — mark-room (rule 18), rule 16, protests, AI covering/splitting.
5. **Weather & venues** — Garda thermal winds, sea state, current, light.
6. **Replay / tactical review** of the race from above.
7. **More classes** — ILCA, 29er/49er (skiff physics, gennaker, planing).
8. Online multiplayer (much later).

## Known issues
- AI starts are often 5–25 s late; occasional AI penalty turns in crowded light-wind beats.
- Overpowered 420 in 16 kn heels a lot (depower model favours sheeting in).
- Chemistry has a small effect on spinnaker timing (hoist time dominates).
- Sailors are simple capsule figures; no animations.
- Physics tuned for feel, not validated against real polars.
