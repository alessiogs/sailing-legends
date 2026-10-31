/**
 * Smoke test of the Career flow without a browser: the three Races of the first Regatta sailed through `RaceSession`
 * on the setups `career` gives, each result recorded and scored. The player's boat is left on the water (it never
 * finishes), so the Races also cover a DNF; every other boat sails with its AI.
 */
import { describe, expect, it } from "vitest";
import { nextRaceSetup, startCareer } from "../src/career/Career";
import { decodeCareer, encodeCareer } from "../src/career/CareerSave";
import { FLEET_SIZE } from "../src/career/Fleets";
import { raceEntries, recordRace } from "../src/career/RecordRace";
import { scoreRegatta } from "../src/career/Scoring";
import { RaceSession } from "../src/race/RaceSession";

const DT = 1 / 60;
/** A boat still on the water after this many simulated seconds counts as not finishing. */
const MAX_RACE_S = 900;

describe("a Career Regatta of AI-only Races", () => {
  it("sails three Races into the Career and ranks the fleet", () => {
    let state = startCareer({ seed: 2024 });
    for (let n = 0; n < 3; n++) {
      const setup = nextRaceSetup(state)!;
      expect(setup.raceIndex).toBe(n);
      const s = new RaceSession({ seed: setup.seed, windKn: setup.windKn, fleet: setup.fleet });
      for (let t = 0; t < MAX_RACE_S && !s.race.racers.every(r => r.isPlayer || r.finishTime !== null); t += DT) s.step(DT);
      const entries = raceEntries(setup.fleet, s.race.racers);
      expect(entries).toHaveLength(FLEET_SIZE.club);
      expect(entries.filter(e => e.status === "finished").length).toBeGreaterThanOrEqual(FLEET_SIZE.club - 2);
      expect(entries.find(e => e.id === "player")!.status).toBe("dnf");
      state = recordRace(state, entries);
      expect(decodeCareer(encodeCareer(state))).toEqual({ ok: true, state });
    }
    expect(state.regattaIndex).toBe(1);
    expect(nextRaceSetup(state)!.regattaId).toBe("optimist-regional-1");

    const standing = scoreRegatta(state.results[0], false);
    expect(standing).toHaveLength(FLEET_SIZE.club);
    expect(standing.map(s => s.place).sort((a, b) => a - b)).toEqual(Array.from({ length: FLEET_SIZE.club }, (_, i) => i + 1));
    expect(standing.find(s => s.id === "player")!.place).toBe(FLEET_SIZE.club);
  }, 120_000);
});
