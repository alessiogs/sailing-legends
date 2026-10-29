import { crewOnWrongSide, wantSpinnaker } from "../ai/CrewAI";
import { RacingAI } from "../ai/RacingAI";
import { t } from "../i18n";
import type { Role } from "../race/PlayerChoice";
import type { Racer } from "../race/Race";
import type { RaceSession } from "../race/RaceSession";
import type { Controls } from "../sailing/BoatPhysics";
import { AUTOPILOT_HELM } from "../sailors/Sailors";

/** Help the game gives by doing a secondary task for the player; each can be switched off. */
export type Assists = {
  /** Auto-trim: the player's sail trim is set automatically. */
  autoTrim: boolean;
};

/**
 * What the player's input gives this module: the Role (what the keys move), the rudder, the sheet of the sail
 * the player trims (written back by Auto-trim and when the Crew changes sail) and the Crew's weight.
 * `core/Input` provides it in the browser.
 */
export type PlayerInput = {
  readonly role: Role;
  readonly rudder: number;
  sheet: number;
  readonly crewOut: number;
};

/**
 * Turns the player's input into the player boat's controls (`session.playerControls`) for each Role and
 * Control mode: the Helm steers and trims the mainsail, the Crew trims the jib or spinnaker and moves their
 * weight, with Auto-trim and the spinnaker call. Also sails the player's boat on the browser autopilot.
 * DOM- and Babylon-free: it returns texts for the HUD instead of showing them.
 */
export class PlayerControls {
  /** Debug autopilot for the player boat (window.__game.autopilot = true), used by automated tests. */
  autopilotOn = false;
  /** The autopilot's Helm, made when the autopilot first sails the player's boat. */
  autopilot: RacingAI | null = null;
  /** The Crew's jib and spinnaker sheets: each keeps its trim while the other sail draws. */
  private crewSheets = { jib: 0.5, spi: 0.5 };
  /** The sail the Crew is trimming. */
  private activeSail: "jib" | "spi" = "jib";

  constructor(private readonly input: PlayerInput, private readonly assists: Readonly<Assists>) {}

  /** A new race starts: both Crew sheets are eased to the middle. */
  newRace() {
    this.crewSheets = { jib: 0.5, spi: 0.5 };
  }

  /** One frame of racing: sets the player boat's controls from the input, or from the autopilot when it is on. */
  apply(dt: number, session: RaceSession) {
    const { input, crewSheets } = this;
    const p = session.player!;
    const pc = session.playerControls;
    const tel = p.sim.telemetry;
    if (this.autopilotOn) {
      if (!this.autopilot || this.autopilot.racer !== p) this.autopilot = new RacingAI(p, AUTOPILOT_HELM, session.race, 99, 3);
      const c = this.autopilot.update(dt, session.wind);
      if (!session.partnerHelm) { pc.rudder = c.rudder; pc.sheet = c.sheet; }
      if (input.role === "crew") this.autopilotCrew(session, pc, p);
      return;
    }
    if (input.role === "crew") {
      // The Partner is the Helm (RaceSession fills rudder and mainsheet). We trim and move.
      const nowSail: "jib" | "spi" = p.sim.state.spiHoist > 0.5 ? "spi" : "jib";
      if (nowSail !== this.activeSail) { this.activeSail = nowSail; input.sheet = this.activeCrewSheet(); }
      if (this.assists.autoTrim) input.sheet = this.activeSail === "spi" ? tel.spi!.optimal : tel.jib!.optimal;
      crewSheets[this.activeSail] = input.sheet;
      pc.jibSheet = crewSheets.jib;
      pc.spiSheet = crewSheets.spi;
      pc.crewOut = input.crewOut;
      return;
    }
    pc.rudder = input.rudder;
    if (this.assists.autoTrim) {
      input.sheet = tel.optimalSheet;
    }
    pc.sheet = input.sheet;
  }

  /** Auto-trim was switched off: the sheet the player takes over starts where the sail is trimmed now. */
  autoTrimOff(session: RaceSession) {
    this.input.sheet = this.input.role === "crew" ? this.activeCrewSheet() : session.player!.sim.state.sheet;
  }

  /**
   * The spinnaker key: the Crew hoists or drops it, the Helm in Full Boat Control calls for it, and in Player
   * Career the Helm is told the Crew decides. Returns the HUD message, or null in a boat without a spinnaker.
   */
  callSpinnaker(session: RaceSession): string | null {
    if (!session.player!.sim.cls.spinnaker) return null;
    const pc = session.playerControls;
    const { choice } = session;
    if (choice.role === "crew") {
      pc.spi = !pc.spi;
      return pc.spi ? t("toast.spi.hoist") : t("toast.spi.drop");
    }
    if (choice.control === "fullBoat" && session.partnerCrew) {
      session.partnerCrew.spiCommand = !session.partnerCrew.spiCommand;
      return session.partnerCrew.spiCommand ? t("toast.spi.callHoist") : t("toast.spi.callDrop");
    }
    return session.partner ? t("toast.spi.partnerDecides", { name: session.partner.name }) : t("toast.spi.crewDecides");
  }

  /** The side-switch key: the Crew moves to the other side. Returns whether it applied (only to the Crew). */
  switchSide(session: RaceSession): boolean {
    if (this.input.role !== "crew") return false;
    session.playerControls.switchSide = true;
    return true;
  }

  /** Test hook: one fixed step of the race, the autopilot steering when it is on and has been made. */
  fastForwardStep(session: RaceSession, dt: number) {
    if (this.autopilotOn && this.autopilot) Object.assign(session.playerControls, this.autopilot.update(dt, session.wind));
    session.step(dt);
  }

  private activeCrewSheet() {
    return this.activeSail === "spi" ? this.crewSheets.spi : this.crewSheets.jib;
  }

  /** Test helper: perfect Crew work for the autopilot. */
  private autopilotCrew(session: RaceSession, pc: Controls, p: Racer) {
    const tel = p.sim.telemetry;
    pc.jibSheet = tel.jib?.optimal; pc.spiSheet = tel.spi?.optimal; pc.crewOut = tel.crew?.ideal;
    pc.spi = wantSpinnaker(session.race, p);
    if (crewOnWrongSide(p.sim)) pc.switchSide = true;
  }
}
