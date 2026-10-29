/**
 * Race feedback: what the player hears and reads as the race goes on. The countdown beeps, race events turned
 * into sounds and messages, and the coaching hints (tack and gybe calls, the Partner's calls to the Crew, the
 * stuck-in-irons hint). It only decides: it returns cues, and the game controller plays them. DOM-, Babylon-
 * and audio-free, so it can be tested in Node.
 */
import type { SteeringMode } from "../core/ControlSettings";
import { DEG } from "../core/math";
import { t } from "../i18n";
import type { RaceSession } from "../race/RaceSession";
import { eventText } from "../ui/raceEventText";

/** How a message is shown: plain, big (gun, finish), bad news or good news. */
export type ToastStyle = "" | "big" | "bad" | "good";

/** One thing to play or show. `afterMs` delays it (0 = now). */
export type Cue =
  | { kind: "beep" | "bump" | "chime" | "buzzer" }
  | { kind: "horn"; seconds: number; afterMs: number }
  | { kind: "toast"; text: string; style: ToastStyle }
  /** Show the results, if the race is still being sailed then. */
  | { kind: "results"; afterMs: number };

/** Countdown signals (race clock): beeps at -30/-10 and in the last 5 seconds; the gun's horn is an event. */
const COUNTDOWN_BEEPS = [-30, -10, -5, -4, -3, -2, -1];

/** Remembers what the player was told, so each signal and hint comes once, at the moment it applies. */
export class RaceFeedback {
  private lastClock = 0;
  /** The player's boom side at the last frame; 0 = not seen yet. */
  private lastBoomSide = 0;
  private ironsHintShown = false;
  /** Whether the Partner (as Helm) was tacking at the last frame. */
  private wasTacking = false;

  /** Starts over for a new race. */
  newRace(session: RaceSession) {
    this.lastClock = session.race.clock;
    this.lastBoomSide = 0;
    this.ironsHintShown = false;
    this.wasTacking = false;
  }

  /** The cues of one racing frame, after the race has advanced, in the order to play them. */
  update(session: RaceSession, steering: SteeringMode): Cue[] {
    const cues: Cue[] = [];
    this.raceEvents(session, cues);
    this.coaching(session, steering, cues);
    return cues;
  }

  private raceEvents(session: RaceSession, cues: Cue[]) {
    const clock = session.race.clock;
    for (const at of COUNTDOWN_BEEPS) if (this.lastClock < at && clock >= at) cues.push({ kind: "beep" });
    this.lastClock = clock;
    for (const e of session.race.drainEvents()) {
      if (e.kind === "gun") cues.push({ kind: "horn", seconds: 1.2, afterMs: 0 });
      if (e.kind === "ocs" && e.racer.isPlayer) cues.push({ kind: "horn", seconds: 0.5, afterMs: 0 });
      // One bump per contact involving the player: on the at-fault boat's event (each boat gets one).
      if (e.kind === "contact" && (e.racer.isPlayer || e.other.isPlayer) && e.atFault === e.racer) cues.push({ kind: "bump" });
      if (!e.racer.isPlayer) continue;
      if (e.kind === "rounded") cues.push({ kind: "chime" });
      if (e.kind === "penalty") cues.push({ kind: "buzzer" });
      if (e.kind === "finish") cues.push({ kind: "horn", seconds: 0.6, afterMs: 0 }, { kind: "horn", seconds: 0.6, afterMs: 700 });
      const style: ToastStyle = e.kind === "ocs" || e.kind === "penalty" ? "bad"
        : e.kind === "gun" || e.kind === "finish" ? "big"
        : e.kind === "rounded" || e.kind === "ocs-cleared" || e.kind === "penalty-done" ? "good" : "";
      cues.push({ kind: "toast", text: eventText(e), style });
      if (e.kind === "finish") cues.push({ kind: "results", afterMs: 2500 });
    }
    if (session.race.phase === "done" && session.player!.finishTime === null) cues.push({ kind: "results", afterMs: 0 });
  }

  private coaching(session: RaceSession, steering: SteeringMode, cues: Cue[]) {
    const p = session.player!;
    const s = p.sim.state, tel = p.sim.telemetry;
    if (this.lastBoomSide === 0) this.lastBoomSide = s.boomSide;
    if (s.boomSide !== this.lastBoomSide) {
      const gybe = Math.abs(tel.awa) > 90 * DEG;
      // When the Partner is the Helm, the call comes from them (the player, as Crew, must react).
      if (session.partnerHelm) cues.push({ kind: "toast", text: t(gybe ? "coach.partnerGybe" : "coach.partnerTack", { name: session.partner!.name }), style: "bad" });
      else cues.push({ kind: "toast", text: gybe ? t("coach.gybe") : t("coach.tack"), style: "" });
      this.lastBoomSide = s.boomSide;
    }
    if (session.partnerHelm) {
      const tacking = session.partnerHelm.tacking;
      if (tacking && !this.wasTacking) cues.push({ kind: "toast", text: t("coach.partnerReadyAbout", { name: session.partner!.name }), style: "" }, { kind: "beep" });
      this.wasTacking = tacking;
    }
    if (!this.ironsHintShown && tel.trimState === "irons" && Math.abs(tel.speed) < 0.3 && session.race.clock > -40) {
      this.ironsHintShown = true;
      cues.push({ kind: "toast", text: steering === "tiller" ? t("coach.irons.tiller") : t("coach.irons.boat"), style: "bad" });
    }
  }
}
