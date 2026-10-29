# Sailing Legends — game concept

A sports game about a sailing career, in the spirit of FIFA's career mode: you start as a kid in the
Optimist and grow into an international sailor. Not a hard simulator and not an arcade game: intuitive
controls, spectacular races, authentic tactics (**hybrid realism**).

## Career
1. **Young talent** — Optimist: training, local/national/international regattas, the first recurring rivals.
2. **The choice** — after the Optimist, specialise:
   single-handed (ILCA/Laser), double-handed technical (420, 470), high-performance skiffs (29er, 49er),
   multihulls, or bigger boats. Each class plays differently; it is not a ladder where the next boat is
   simply better. Available classes can depend on results and club invitations.
3. **Build your crew** — in double-handed classes, recruit rivals you raced against for years, or create a
   crew freely. Athletes have attributes, personality, ambitions and compatibility.
4. **Elite career** — national championships, international circuits, selections and, where relevant,
   Olympic campaigns; or a career on bigger boats.

Your past keeps mattering: yesterday's rivals can become your crew — or your opponents for a world title.

## Recurring rivals (invented characters)
- **Luca — the tactician**: reads the wind brilliantly, risks too much at starts. Could become a great crew.
- **Giulia — the perfectionist**: rarely fails a manoeuvre; ideal partner for a technical class.
- **Marco — the natural talent**: very fast in strong wind, hard to manage off the water (low discipline).
Opponent crews in the prototype: Sara, Tommaso, Pietro; extra helm Elena.

## Crew Chemistry
A 0–100 rating for a pair that grows with training, races and shared decisions and can drop with constant
role changes, arguments or bad results. Four dimensions: technical compatibility, personal compatibility,
ambition, experience together. A weaker partner with perfect chemistry can beat a champion you can't
coordinate with. It should not over-punish changing partner. Effects: manoeuvre precision, communication
speed in critical phases.
*Prototype:* chemistry = 0.5·bond + 0.25·technique + 0.25·discipline; affects crew reaction time and trim
precision.

## Roles and control modes
- **Helm (timoniere)**: steering, mainsheet, route, tacks, start positioning, tactical calls.
- **Crew (prodiere)**: weight and trapeze, jib, spinnaker/gennaker hoist and trim, side changes in
  manoeuvres, communication about wind and boat.
- **Player Career** — control only your role; the partner is AI.
- **Full Boat Control** — decide all manoeuvres, without simulating every physical movement.
- **Assist mode** — AI helps with secondary adjustments; assists can be removed as you improve.
Difficulty grows by removing assists, not by making controls arbitrarily complicated.

## A race
Pre-start (study the course, wind, line bias) → start (countdown, position, acceleration) → beat (find wind,
tack on shifts, control opponents) → marks and downwind (manoeuvres, spinnaker) → finish (points,
reputation, offers). Variable wind, puffs, shifts, current, penalties, manoeuvre errors.

## Attributes (planned)
Technique, Tactics, Reflexes, Athleticism, Consistency, Communication, Adaptability. Improve by training and
racing; specialisations possible. Career extras: coaches, clubs, sponsors, selections, rivalries, crew transfers.
Choices must have consequences.

## Platform and tech decisions
Browser-first (desktop PC first), realistic 3D, keyboard + gamepad. Babylon.js + TypeScript + Vite, custom
sailing physics separate from rendering. Open source on GitHub, deployed to GitHub Pages.

## What the first prototypes must prove
1. The boat responds intuitively to the controls.
2. You understand how to use the wind without a manual.
3. A good tack can win you a place.
4. Crew feels different from Helm.
5. After a race you want to start another one.
