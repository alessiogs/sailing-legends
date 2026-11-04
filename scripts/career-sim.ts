/**
 * Career simulator: a stand-in AI player sails whole Seasons through the real Career rules and prints how it fares.
 * Run with `npm run career-sim` (flags: `--skills=0.45,0.6,0.75 --seasons=6 --seed=1 --age=10 --plan=optimist,optimist,optimist,420`; the plan lists each Season's class: optimist, 420, ilca4/6/7, 29er, 49er). Not a test.
 *
 * The stand-in at skill `s` is a Racing AI Helm with all four attributes = `s` steering the player's boat; in the
 * 420 the Partner (Giulia) trims as the Crew. Seasons 1-3 are the Optimist, then the 420 as Helm with Giulia. The fleet,
 * wind, seed, scoring, growth and Season close are the Career's own functions, so the report is what a player would meet.
 *
 * Output per skill, one row per Season: the player's place / fleet size in each Regatta of the calendar (in order,
 * tagged by level), the Season place, the Rivals' ratings at the Season's start, and the Pair's Chemistry after it.
 */
import { nextRaceSetup, startCareer } from "../src/career/Career";
import { seasonCalendar } from "../src/career/Calendar";
import type { CareerState } from "../src/career/CareerSave";
import { sailorRating } from "../src/career/Pool";
import {
  isSeasonOver,
  raceEntries,
  recordRace,
} from "../src/career/RecordRace";
import { scoreRegatta } from "../src/career/Scoring";
import { boatClassOf, pathOf } from "../src/career/Classes";
import {
  partnerCandidates,
  startNextSeason,
  type SeasonChoice,
} from "../src/career/SeasonClose";
import { seasonSummary } from "../src/career/Standings";
import { RacingAI } from "../src/ai/RacingAI";
import { startSlot } from "../src/race/Fleet";
import { HELM } from "../src/race/PlayerChoice";
import { FIXED_DT, RaceSession } from "../src/race/RaceSession";
import { isTwoPerson } from "../src/sailing/BoatClass";
import { RIVALS, type SailorProfile } from "../src/sailors/Sailors";

/** A race still running after this many simulated seconds is cut off (the boats left on the water are DNF). */
const MAX_RACE_S = 900;
const OPTIMIST_SEASONS = 3;
const PLAN_USAGE =
  "--plan=optimist,optimist,optimist,420,29er,29er,49er  (the class of each Season from Season 1 on; the last one repeats)";
const PARTNER_ID = "giulia";
const LEVEL_TAG = {
  club: "cl",
  regional: "rg",
  national: "nt",
  international: "in",
} as const;

function arg(name: string, fallback: string): string {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
}
const skills = arg("skills", "0.45,0.6,0.75").split(",").map(Number);
const seasons = Number(arg("seasons", "6"));
/** The class of each Season: Optimist for three Seasons, then the 420, unless `--plan` says otherwise. */
const plan = arg(
  "plan",
  Array.from({ length: OPTIMIST_SEASONS }, () => "optimist")
    .concat("420")
    .join(","),
).split(",");
const PLAN_CLASSES = [
  "optimist",
  "420",
  "ilca4",
  "ilca6",
  "ilca7",
  "29er",
  "49er",
];
if (plan.some((c) => !PLAN_CLASSES.includes(c)))
  throw new Error(
    `Usage: career-sim ${PLAN_USAGE}; classes: ${PLAN_CLASSES.join(", ")}`,
  );

/** The end-of-Season choice for a plan entry: Giulia as Partner if raced against (else the first candidate), Helm. */
function planChoice(state: CareerState, entry: string): SeasonChoice {
  if (entry === "optimist") return { classId: "optimist" };
  if (entry.startsWith("ilca"))
    return { classId: "ilca", rig: Number(entry.slice(4)) as 4 | 6 | 7 };
  const candidates = partnerCandidates(state);
  const partnerId = candidates.includes(PARTNER_ID)
    ? PARTNER_ID
    : candidates[0];
  return {
    classId: entry as "420" | "29er" | "49er",
    partnerId,
    choice: state.partnerId === null ? HELM : state.choice,
  };
}
const seed = Number(arg("seed", "1"));
const startingAge = Number(arg("age", "10"));
if (
  skills.some((s) => !(s >= 0 && s <= 1)) ||
  !Number.isInteger(seasons) ||
  seasons < 1 ||
  !Number.isInteger(seed) ||
  seed < 0
) {
  throw new Error(
    "Usage: career-sim [--skills=0.45,0.6,0.75] [--seasons=6] [--seed=1]  (skills 0..1, whole seasons and seed)",
  );
}

/** Sails the Career's next Race with the stand-in steering the player's boat; returns the state with it recorded. */
function sailRace(state: CareerState, skill: number): CareerState {
  const setup = nextRaceSetup(state)!;
  const session = new RaceSession({
    seed: setup.seed,
    windKn: setup.windKn,
    fleet: setup.fleet,
  });
  const player = session.player!;
  const profile: SailorProfile = {
    id: "standin",
    name: "Stand-in",
    technique: skill,
    tactics: skill,
    speed: skill,
    discipline: skill,
  };
  const boats = setup.fleet.opponents.length + 1;
  const helm = new RacingAI(
    player,
    profile,
    session.race,
    setup.seed * 17,
    startSlot(setup.fleet.opponents.length, boats),
  );
  const alone = !isTwoPerson(setup.fleet.boatClass);
  const pc = session.playerControls;
  const maxSteps = MAX_RACE_S / FIXED_DT;
  for (let i = 0; i < maxSteps && session.race.phase !== "done"; i++) {
    const c = helm.update(FIXED_DT, session.wind);
    // In the Optimist the AI sets every control; in the 420 the Partner Crew (session.partnerCrew) does the rest.
    if (alone) Object.assign(pc, c);
    else {
      pc.rudder = c.rudder;
      pc.sheet = c.sheet;
    }
    session.step(FIXED_DT);
  }
  return recordRace(state, raceEntries(setup.fleet, session.race.racers));
}

const f2 = (v: number) => v.toFixed(2);
const pad = (s: string, n: number) => s.padEnd(n);

for (const skill of skills) {
  console.log(
    `\nStand-in skill ${skill} (seed ${seed}, start age ${startingAge})`,
  );
  console.log(
    `${pad("S", 2)} ${pad("class", 8)} ${pad("regattas (place/fleet by level)", 44)} ${pad("season", 6)} ${pad("rivals luca/giulia/marco", 25)} chem`,
  );
  let state = startCareer({ seed, startingAge });
  for (let n = 1; n <= seasons; n++) {
    const calendar = seasonCalendar(state.classId);
    const rivalRatings = RIVALS.map((r) =>
      f2(sailorRating(state.pool.find((s) => s.id === r.id)!)),
    ).join("/");
    while (!isSeasonOver(state)) state = sailRace(state, skill);
    const cells = calendar.map((r, i) => {
      const me = scoreRegatta(state.results[i], r.discard).find(
        (s) => s.id === "player",
      )!;
      return `${LEVEL_TAG[r.level]} ${me.place}/${state.results[i][0].length}`;
    });
    const summary = seasonSummary(state)!;
    const chem =
      state.chemistry === null ? "-" : String(Math.round(state.chemistry));
    console.log(
      `${pad(String(n), 2)} ${pad(boatClassOf(pathOf(state)).name, 8)} ${pad(cells.join(", "), 44)} ${pad(`${summary.player.place}/${summary.standings.length}`, 6)} ${pad(rivalRatings, 25)} ${chem}`,
    );
    if (n === seasons) break;
    const next = planChoice(state, plan[n] ?? plan[plan.length - 1]);
    state = startNextSeason(state, next);
  }
}
