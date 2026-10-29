/**
 * The HUD panel per Role and Control mode, built from the race state without a page: the gauge (tiller or the
 * Crew's weight), the sail trim bar, the Partner's call, the Partner line and Crew Chemistry, worded through the
 * Italian catalog exactly as the HUD shows them.
 */
import { describe, expect, it } from "vitest";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "../src/race/PlayerChoice";
import { makeFleet } from "../src/race/Fleet";
import { RaceSession } from "../src/race/RaceSession";
import { I420, isTwoPerson, OPTIMIST, type BoatClass } from "../src/sailing/BoatClass";
import { buildPanel } from "../src/ui/hudPanel";

function setup(choice: PlayerChoice, boatClass: BoatClass = I420) {
  const session = new RaceSession({ seed: 7, fleet: makeFleet({ boatClass, choice }) });
  session.step(1 / 60); // fills the telemetry
  const p = session.player!;
  const role = isTwoPerson(boatClass) ? choice.role : "helm";
  const panel = (tiller = 0, autoTrim = false) =>
    buildPanel({ session, role, control: choice.control, twoPerson: isTwoPerson(boatClass), tiller, autoTrim });
  return { session, p, s: p.sim.state, tel: p.sim.telemetry, panel };
}

describe("HUD panel as Helm", () => {
  it("shows the tiller, the mainsail, the Partner's weight and spinnaker, and Crew Chemistry in the 420", () => {
    const { s, tel, panel } = setup(HELM);
    s.crewOut = 0.5; s.spiHoist = 0;
    expect(panel(-0.4, true)).toEqual({
      gauge: { label: "TIMONE", value: -0.4, centered: true, ends: ["◀ SX", "DX ▶"] },
      sail: { label: "RANDA", sheet: s.sheet, optimal: tel.optimalSheet, state: tel.trimState, autoTrim: true },
      call: null,
      partnerLine: "Giulia: in cinghia · spi giù",
      chem: { name: "Giulia", value: 88 },
    });
  });

  it("words the Partner's weight and spinnaker from the boat state", () => {
    const { s, panel } = setup(HELM);
    s.crewOut = 0.2; s.spiHoist = 0.5;
    expect(panel().partnerLine).toBe("Giulia: dentro · spi in manovra");
    s.crewOut = 1; s.spiHoist = 1;
    expect(panel().partnerLine).toBe("Giulia: al trapezio · spi su");
  });
});

describe("HUD panel in Full Boat Control", () => {
  it("reminds the Helm that the spinnaker is on their key", () => {
    const { s, panel } = setup(FULL_BOAT);
    s.crewOut = 0.5; s.spiHoist = 0;
    const p = panel();
    expect(p.partnerLine).toBe("Giulia: in cinghia · spi giù · Spazio = issa/ammaina");
    expect(p.gauge.label).toBe("TIMONE");
    expect(p.call).toBe(null);
  });
});

describe("HUD panel in a single-hander", () => {
  it("shows the tiller and the one sail, with no Partner and no Crew Chemistry", () => {
    const { s, tel, panel } = setup(HELM, OPTIMIST);
    expect(panel(0.25)).toEqual({
      gauge: { label: "TIMONE", value: 0.25, centered: true, ends: ["◀ SX", "DX ▶"] },
      sail: { label: "REGOLAZIONE VELA", sheet: s.sheet, optimal: tel.optimalSheet, state: tel.trimState, autoTrim: false },
      call: null,
      partnerLine: null,
      chem: null,
    });
  });

  it("ignores a Crew Role chosen in the menu", () => {
    const { panel } = setup(CREW, OPTIMIST);
    expect(panel().sail.label).toBe("REGOLAZIONE VELA");
  });
});

describe("HUD panel as Crew", () => {
  /** A quiet boat: Crew on the right side, balanced, prestart (no spinnaker call). */
  function quiet() {
    const ctx = setup(CREW);
    const { s, tel } = ctx;
    s.spiHoist = 0; s.crewOut = 0.5;
    tel.jib!.backed = false; tel.crew!.onWindward = true; tel.crew!.balance = 0; tel.crew!.ideal = 0.4;
    return ctx;
  }

  it("shows the Crew's own weight against the ideal, the jib, the Helm line and Crew Chemistry", () => {
    const { s, tel, panel } = quiet();
    expect(panel(0.9, true)).toEqual({
      gauge: { label: "IN CINGHIA", value: 0.5, centered: false, ideal: 0.4, ends: ["◀ DENTRO", "FUORI ▶"] },
      sail: { label: "FIOCCO", sheet: s.jibSheet, optimal: tel.jib!.optimal, state: tel.jib!.trimState, autoTrim: true },
      call: null,
      partnerLine: "Giulia al timone e alla randa · spi: giù",
      chem: { name: "Giulia", value: 88 },
    });
  });

  it("words the Crew's own weight", () => {
    const { s, panel } = quiet();
    s.crewOut = 0.1;
    expect(panel().gauge.label).toBe("SEDUTO DENTRO");
    s.crewOut = 1;
    expect(panel().gauge.label).toBe("AL TRAPEZIO");
  });

  it("trims the spinnaker once it is drawing", () => {
    const { s, tel, panel } = quiet();
    s.spiHoist = 1;
    tel.spi = { hoist: 1, angle: 0, optimal: 0.6, trimState: "good", collapsed: false, wrongSide: false };
    const p = panel();
    expect(p.sail).toEqual({ label: "SPINNAKER", sheet: s.spiSheet, optimal: 0.6, state: "good", autoTrim: false });
    expect(p.partnerLine).toBe("Giulia al timone e alla randa · spi: su");
  });

  it("warns of a backed jib and of a collapsed spinnaker", () => {
    const { s, tel, panel } = quiet();
    tel.jib!.backed = true; tel.awa = 0; // backed but head to wind: no side-switch call
    expect(panel().sail.text).toBe("Fiocco a collo! Cambia lato (E)");
    s.spiHoist = 1;
    tel.spi = { hoist: 1, angle: 0, optimal: 0.6, trimState: "luffing", collapsed: true, wrongSide: false };
    expect(panel().sail.text).toBe("Lo spi è crollato: troppo all'orza");
  });

  it("passes on the Helm's calls, most urgent first", () => {
    const { session, s, tel, panel } = quiet();
    tel.crew!.balance = 80;
    expect(panel().call).toBe("Giulia: «Fuori! Siamo sbandati» → D / →");
    tel.crew!.balance = -30; s.crewOut = 0.7;
    expect(panel().call).toBe("Giulia: «Dentro! Ci rovesciamo sopravvento» → A / ←");
    tel.crew!.balance = -10;
    expect(panel().call).toBe(null);
    tel.crew!.onWindward = false; tel.awa = 40 * Math.PI / 180;
    expect(panel().call).toBe("Giulia: «Cambia lato!» → premi E");
    tel.crew!.balance = 80; // the side switch comes before hiking out
    expect(panel().call).toBe("Giulia: «Cambia lato!» → premi E");
    tel.crew!.onWindward = true; tel.crew!.balance = 0;
    session.race.phase = "racing";
    session.playerControls.spi = true; // up while the Helm wants it down (beating)
    expect(panel().call).toBe("Giulia: «Ammaina!» → Spazio");
  });
});
