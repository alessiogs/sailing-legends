/**
 * Names in a race: legs and boats are data in the simulation (`LegId`, the sailors on board) and the UI names them
 * through the Italian catalog. Every name reads as the simulation wrote it before it became data (captured from the
 * old `Leg.name` and `Racer.name` of each session setup), including the HUD's leg line, the standings and boat tags.
 */
import { describe, expect, it } from "vitest";
import { t } from "../src/i18n";
import { RIVALS } from "../src/ai/RacingAI";
import { RaceSession, type SessionOptions } from "../src/race/RaceSession";
import { I420, OPTIMIST } from "../src/sailing/BoatClass";
import { legName, racerName } from "../src/ui/raceNames";

const names = (opts: SessionOptions) => new RaceSession(opts).race.racers.map(r => `${r.id}=${racerName(r)}`);

describe("race names", () => {
  it("names the legs of the course", () => {
    expect(new RaceSession().race.course.legs.map(legName)).toEqual(["Boa 1", "Boa 2", "Arrivo"]);
    expect(new RaceSession({ boatClass: I420 }).race.course.legs.map(legName)).toEqual(["Boa 1", "Boa 2", "Arrivo"]);
  });

  it("shows the leg's name as the HUD target", () => {
    const [mark1, mark2, finish] = new RaceSession().race.course.legs;
    const line = (leg: typeof mark1, i: number) =>
      t("hud.leg.sailing", { leg: i + 1, legs: 3, upwind: leg.upwind, target: legName(leg), toPort: leg.kind === "mark" });
    expect(line(mark1, 0)).toBe("Lato 1/3 · Bolina → Boa 1 · a sinistra");
    expect(line(mark2, 1)).toBe("Lato 2/3 · Poppa → Boa 2 · a sinistra");
    expect(line(finish, 2)).toBe("Lato 3/3 · Bolina → Arrivo");
  });

  it("names a single-handed boat by its Helm", () => {
    expect(names({ boatClass: OPTIMIST })).toEqual(["player=Tu", "ai0=Luca", "ai1=Giulia", "ai2=Marco"]);
    expect(names({ boatClass: OPTIMIST, withPlayer: false })).toEqual(["ai0=Luca", "ai1=Giulia", "ai2=Marco"]);
  });

  it("names a two-person boat Helm/Crew, with the player in their Role", () => {
    const rivals = ["ai0=Luca/Sara", "ai1=Marco/Tommaso", "ai2=Elena/Pietro"];
    expect(names({ boatClass: I420, role: "skipper" })).toEqual(["player=Tu/Giulia", ...rivals]);
    expect(names({ boatClass: I420, role: "full" })).toEqual(["player=Tu/Giulia", ...rivals]);
    expect(names({ boatClass: I420, role: "crew" })).toEqual(["player=Giulia/Tu", ...rivals]);
    expect(names({ boatClass: I420, role: "crew", partner: RIVALS[2] }))
      .toEqual(["player=Marco/Tu", "ai0=Luca/Sara", "ai1=Giulia/Tommaso", "ai2=Elena/Pietro"]);
    expect(names({ boatClass: I420, withPlayer: false })).toEqual(["ai0=Luca/Sara", "ai1=Giulia/Tommaso", "ai2=Marco/Pietro"]);
  });

  it("shows the name in the standings tag", () => {
    const player = new RaceSession({ boatClass: I420 }).player!;
    expect(t("hud.tag", { position: 2, name: racerName(player), ocs: true })).toBe("2° Tu/Giulia · OCS");
  });
});
