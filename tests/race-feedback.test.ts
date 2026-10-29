/**
 * Race feedback: the sounds, messages and coaching hints the player gets from the race, decided without a
 * browser (the controller plays the cues).
 */
import { describe, expect, it } from "vitest";
import { RaceFeedback, type Cue } from "../src/game/RaceFeedback";
import { CREW, HELM, type PlayerChoice } from "../src/race/PlayerChoice";
import { makeFleet } from "../src/race/Fleet";
import { RaceSession } from "../src/race/RaceSession";
import { I420, OPTIMIST, type BoatClass } from "../src/sailing/BoatClass";

function setup(choice: PlayerChoice = HELM, boatClass: BoatClass = OPTIMIST, countdown?: number) {
  const session = new RaceSession({ seed: 7, countdown, fleet: makeFleet({ boatClass, choice }) });
  session.step(1 / 60); // fills the telemetry
  const feedback = new RaceFeedback();
  feedback.newRace(session);
  return { session, feedback, p: session.player!, ai: session.race.racers.find(r => !r.isPlayer)! };
}

/** Sails `seconds` of race and collects every cue, with the race clock at which it came. */
function sail(s: ReturnType<typeof setup>, seconds: number) {
  const cues: { at: number; cue: Cue }[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    s.session.step(1 / 60);
    for (const cue of s.feedback.update(s.session, "tiller")) cues.push({ at: s.session.race.clock, cue });
  }
  return cues;
}

const kinds = (cues: Cue[]) => cues.map(c => c.kind);

describe("race feedback", () => {
  it("beeps at 30 and 10 seconds to the gun and at each of the last five", () => {
    const s = setup();
    const beeps = sail(s, 46).filter(c => c.cue.kind === "beep").map(c => Math.round(c.at));
    expect(beeps).toEqual([-30, -10, -5, -4, -3, -2, -1]);
  });

  it("sounds the horn and shows the start in big at the gun", () => {
    const s = setup(HELM, OPTIMIST, 1);
    const cues = sail(s, 1.1).map(c => c.cue);
    expect(cues).toContainEqual({ kind: "horn", seconds: 1.2, afterMs: 0 });
    expect(cues).toContainEqual({ kind: "toast", text: "PARTENZA!", style: "big" });
  });

  it("chimes and shows a good message when the player rounds a mark", () => {
    const { session, feedback, p } = setup();
    const [mark1, mark2] = session.race.course.legs;
    session.race.events.push({ kind: "rounded", racer: p, rounded: mark1, next: mark2 });
    expect(feedback.update(session, "tiller")).toEqual([
      { kind: "chime" },
      { kind: "toast", text: "Boa 1 girata · ora: Boa 2", style: "good" },
    ]);
  });

  it("says nothing about other boats' roundings and penalties", () => {
    const { session, feedback, ai } = setup();
    const [mark1, mark2] = session.race.course.legs;
    session.race.events.push({ kind: "rounded", racer: ai, rounded: mark1, next: mark2 });
    session.race.events.push({ kind: "penalty", racer: ai, turns: 2, rule: "10" });
    expect(feedback.update(session, "tiller")).toEqual([]);
  });

  it("buzzes on the player's penalty and sounds a short horn when the player is over the line", () => {
    const { session, feedback, p } = setup();
    session.race.events.push({ kind: "penalty", racer: p, turns: 2, rule: "10" });
    session.race.events.push({ kind: "ocs", racer: p });
    const cues = feedback.update(session, "tiller");
    expect(kinds(cues)).toEqual(["buzzer", "toast", "horn", "toast"]);
    expect(cues[2]).toEqual({ kind: "horn", seconds: 0.5, afterMs: 0 });
    expect([cues[1], cues[3]].map(c => c.kind === "toast" && c.style)).toEqual(["bad", "bad"]);
  });

  it("bumps once per contact involving the player", () => {
    const { session, feedback, p, ai } = setup();
    const contact = { kind: "contact", rule: "10", reason: "portStarboard" } as const;
    session.race.events.push({ ...contact, racer: ai, other: p, atFault: ai });
    session.race.events.push({ ...contact, racer: p, other: ai, atFault: ai });
    const cues = feedback.update(session, "tiller");
    expect(kinds(cues)).toEqual(["bump", "toast"]);
    expect(cues[1]).toMatchObject({ kind: "toast", style: "" });
  });

  it("sounds two horns at the player's finish and shows the results 2.5 s later", () => {
    const { session, feedback, p } = setup();
    session.race.events.push({ kind: "finish", racer: p, place: 2 });
    expect(feedback.update(session, "tiller")).toEqual([
      { kind: "horn", seconds: 0.6, afterMs: 0 },
      { kind: "horn", seconds: 0.6, afterMs: 700 },
      { kind: "toast", text: "ARRIVO! 2° posto", style: "big" },
      { kind: "results", afterMs: 2500 },
    ]);
  });

  it("shows the results at once when the race ends before the player finishes", () => {
    const { session, feedback } = setup();
    session.race.phase = "done";
    expect(feedback.update(session, "tiller")).toEqual([{ kind: "results", afterMs: 0 }]);
  });

  it("calls the player's own tack and gybe", () => {
    const { session, feedback, p } = setup();
    feedback.update(session, "tiller");
    p.sim.state.boomSide = -p.sim.state.boomSide;
    p.sim.telemetry.awa = 40 * Math.PI / 180;
    expect(feedback.update(session, "tiller")).toEqual([{ kind: "toast", text: "Virata!", style: "" }]);
    p.sim.state.boomSide = -p.sim.state.boomSide;
    p.sim.telemetry.awa = 150 * Math.PI / 180;
    expect(feedback.update(session, "tiller")).toEqual([{ kind: "toast", text: "Strambata!", style: "" }]);
    expect(feedback.update(session, "tiller")).toEqual([]);
  });

  it("gives the Crew the Partner's call to change side", () => {
    const { session, feedback, p } = setup(CREW, I420);
    const name = session.partner!.name;
    feedback.update(session, "tiller");
    p.sim.state.boomSide = -p.sim.state.boomSide;
    p.sim.telemetry.awa = 40 * Math.PI / 180;
    expect(feedback.update(session, "tiller")).toEqual([
      { kind: "toast", text: `${name}: «Viro!» — cambia lato (E)`, style: "bad" },
    ]);
  });

  it("warns the Crew with a beep when the Partner starts a tack", () => {
    const s = setup(CREW, I420);
    const call = `${s.session.partner!.name}: «Pronti a virare… Vira!»`;
    const cues = sail(s, 300).map(c => c.cue);
    const i = cues.findIndex(c => c.kind === "toast" && c.text === call);
    expect(i >= 0).toBe(true);
    expect(cues[i + 1]).toEqual({ kind: "beep" });
  });

  it("hints once how to get out of irons, worded for the steering mode", () => {
    for (const [steering, text] of [
      ["tiller", "Sei fermo prua al vento: lasca (S) e spingi la barra per poggiare"],
      ["boat", "Sei fermo prua al vento: lasca (S) e poggia con il timone"],
    ] as const) {
      const { session, feedback, p } = setup(HELM, OPTIMIST, 30); // no hint before 40 s to the gun
      feedback.update(session, steering);
      p.sim.telemetry.trimState = "irons";
      p.sim.telemetry.speed = 0.1;
      expect(feedback.update(session, steering)).toEqual([{ kind: "toast", text, style: "bad" }]);
      expect(feedback.update(session, steering)).toEqual([]);
    }
  });
});
