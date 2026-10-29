/**
 * Names in a race: legs and boats are data in the simulation (`LegId`, the sailors on board) and the UI names them
 * through the Italian catalog. Every name reads as the simulation wrote it before it became data (captured from the
 * old `Leg.name` and `Racer.name` of each session setup), including the HUD's leg line, the standings and boat tags.
 */
import { describe, expect, it } from "vitest";
import { t } from "../src/i18n";
import { RIVALS } from "../src/sailors/Sailors";
import { CREW, FULL_BOAT, HELM } from "../src/race/PlayerChoice";
import { makeFleet, type FleetOptions } from "../src/race/Fleet";
import { RaceSession } from "../src/race/RaceSession";
import { I420, OPTIMIST } from "../src/sailing/BoatClass";
import { legName, racerName } from "../src/ui/raceNames";

const names = (opts: FleetOptions) => new RaceSession({ fleet: makeFleet(opts) }).race.racers.map(r => `${r.id}=${racerName(r)}`);

describe("race names", () => {
  it("names the legs of the course", () => {
    expect(new RaceSession().race.course.legs.map(legName)).toEqual(["Boa 1", "Boa 2", "Arrivo"]);
    expect(new RaceSession({ fleet: makeFleet({ boatClass: I420 }) }).race.course.legs.map(legName)).toEqual(["Boa 1", "Boa 2", "Arrivo"]);
  });

  it("shows the leg's name as the HUD target", () => {
    const [mark1, mark2, finish] = new RaceSession().race.course.legs;
    const line = (leg: typeof mark1, i: number) =>
      t("hud.leg.sailing", { leg: i + 1, legs: 3, target: legName(leg) });
    expect(line(mark1, 0)).toBe("Lato 1/3 · Boa 1");
    expect(line(mark2, 1)).toBe("Lato 2/3 · Boa 2");
    expect(line(finish, 2)).toBe("Lato 3/3 · Arrivo");
  });

  it("names a single-handed boat by its Helm", () => {
    expect(names({ boatClass: OPTIMIST })).toEqual(["player=Tu", "ai0=Luca", "ai1=Giulia", "ai2=Marco"]);
    expect(names({ boatClass: OPTIMIST, withPlayer: false })).toEqual(["ai0=Luca", "ai1=Giulia", "ai2=Marco"]);
  });

  it("names a two-person boat Helm/Crew, with the player in their Role", () => {
    const rivals = ["ai0=Luca/Sara", "ai1=Marco/Tommaso", "ai2=Elena/Pietro"];
    expect(names({ boatClass: I420, choice: HELM })).toEqual(["player=Tu/Giulia", ...rivals]);
    expect(names({ boatClass: I420, choice: FULL_BOAT })).toEqual(["player=Tu/Giulia", ...rivals]);
    expect(names({ boatClass: I420, choice: CREW })).toEqual(["player=Giulia/Tu", ...rivals]);
    expect(names({ boatClass: I420, choice: CREW, partner: RIVALS[2] }))
      .toEqual(["player=Marco/Tu", "ai0=Luca/Sara", "ai1=Giulia/Tommaso", "ai2=Elena/Pietro"]);
    expect(names({ boatClass: I420, withPlayer: false })).toEqual(["ai0=Luca/Sara", "ai1=Giulia/Tommaso", "ai2=Marco/Pietro"]);
  });

  it("shows the name in the standings tag", () => {
    const player = new RaceSession({ fleet: makeFleet({ boatClass: I420 }) }).player!;
    expect(t("hud.tag", { position: 2, name: racerName(player), ocs: true })).toBe("2° Tu/Giulia · OCS");
  });
});
