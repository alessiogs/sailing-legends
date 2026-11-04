/**
 * The HUD's bottom panel, built from the race state and the player's choices: the gauge (the tiller for the Helm,
 * their own weight for the Crew), the sail trim bar, the Partner's call, the Partner line and Crew Chemistry.
 * A pure function: it reads the race and touches no page element; `Hud` draws the result.
 */
import { crewOnWrongSide, wantSpinnaker } from "../ai/CrewAI";
import { t } from "../i18n";
import type { ControlMode, Role } from "../race/PlayerChoice";
import type { RaceSession } from "../race/RaceSession";
import type { TrimState } from "../sailing/BoatPhysics";
import { crewWeight, spinnakerState } from "../sailing/BoatStates";
import { crewChemistry } from "../sailors/Sailors";
import { crewWeightText, spinnakerText } from "./boatStateText";

type Gauge = {
  label: string;
  value: number;
  centered: boolean;
  ideal?: number;
  ends: [string, string];
};

/** What the bottom panel shows; depends on the player's Role on board. */
export type Panel = {
  gauge: Gauge;
  /** The Helm's hike gauge (0 = in or sitting to leeward, 1 = fully out) while the player hikes by hand, else absent. */
  hike?: Gauge;
  sail: {
    label: string;
    sheet: number;
    optimal: number;
    state: TrimState;
    autoTrim: boolean;
    text?: string;
  };
  /** True while the player's boat planes (the HUD shows a tag by the speed); absent otherwise. */
  planing?: true;
  /** A call from the Partner the player should act on (the Helm's to the Crew, or the Crew's to the Helm), or null. */
  call: string | null;
  /** One-line status of the Partner on board, or null. */
  partnerLine: string | null;
  /** Crew Chemistry with the Partner, or null for single-handers. */
  chem: { name: string; value: number } | null;
};

/** What the panel is built from: the race with the player's boat, and the player's choices as the game holds them. */
export type PanelView = {
  session: Pick<RaceSession, "race" | "player" | "partner" | "playerControls">;
  /** The player's Role on board (always the Helm in a single-hander). */
  role: Role;
  control: ControlMode;
  /** Whether the chosen class is sailed by a Pair. */
  twoPerson: boolean;
  /** The tiller position the player holds, -1..1. */
  tiller: number;
  /** Whether the Auto-trim Assist is on. */
  autoTrim: boolean;
  /** Whether the Auto-hike Assist is on. */
  autoHike: boolean;
};

/** The bottom panel for the player's boat. */
export function buildPanel({
  session,
  role,
  control,
  twoPerson: two,
  tiller,
  autoTrim,
  autoHike,
}: PanelView): Panel {
  const p = session.player!;
  const s = p.sim.state,
    tel = p.sim.telemetry;
  const name = session.partner?.name ?? "";
  // A skiff flies a gennaker where the 420 flies a spinnaker: the same sail in the physics, worded apart.
  const gen = p.sim.cls.spinnaker?.gennaker === true;
  const chem =
    two && session.partner
      ? { name, value: crewChemistry(session.partner) }
      : null;
  if (role === "crew") {
    const spiUp = s.spiHoist > 0.5;
    const sailTel = spiUp ? tel.spi! : tel.jib!;
    const sheet = spiUp ? s.spiSheet : s.jibSheet;
    // Calls from the Partner (the Helm), most urgent first.
    let call: string | null = null;
    const ideal = tel.crew!.ideal;
    if (crewOnWrongSide(p.sim)) call = t("call.switchSide", { name });
    else if (
      session.race.phase !== "prestart" &&
      wantSpinnaker(session.race, p) !== !!session.playerControls.spi
    )
      call = session.playerControls.spi
        ? t(gen ? "call.gennakerDrop" : "call.spiDrop", { name })
        : t(gen ? "call.gennakerHoist" : "call.spiHoist", { name });
    else if (tel.crew!.balance > 60) call = t("call.hikeOut", { name });
    else if (s.crewOut - ideal > 0.25 && tel.crew!.balance < -20)
      call = t("call.comeIn", { name });
    const where = crewWeightText(crewWeight(s.crewOut), "own");
    const spi = spinnakerText(spinnakerState(s.spiHoist));
    return {
      gauge: {
        label: t("hud.gauge.weight", { position: where }),
        value: s.crewOut,
        centered: false,
        ideal,
        ends: [t("hud.gauge.in"), t("hud.gauge.out")],
      },
      sail: {
        label: spiUp
          ? t(gen ? "hud.sail.gennaker" : "hud.sail.spinnaker")
          : t("hud.sail.jib"),
        sheet,
        optimal: sailTel.optimal,
        state: sailTel.trimState,
        autoTrim,
        text:
          tel.jib!.backed && !spiUp
            ? t("trim.jibBacked")
            : spiUp && tel.spi!.collapsed
              ? t(gen ? "trim.gennakerCollapsed" : "trim.spiCollapsed")
              : undefined,
      },
      call,
      partnerLine: t(
        gen ? "hud.partnerLine.helmGennaker" : "hud.partnerLine.helm",
        {
          name,
          spi,
        },
      ),
      chem,
      ...(tel.planing ? { planing: true as const } : {}),
    };
  }
  const tillerGauge = {
    label: t("hud.gauge.tiller"),
    value: tiller,
    centered: true,
    ends: [t("hud.gauge.left"), t("hud.gauge.right")] as [string, string],
  };
  const sail = {
    label: two ? t("hud.sail.main") : t("hud.sail.single"),
    sheet: s.sheet,
    optimal: tel.optimalSheet,
    state: tel.trimState,
    autoTrim,
  };
  let partnerLine: string | null = null;
  if (two) {
    const weight = crewWeightText(crewWeight(s.crewOut), "partner");
    const spi = spinnakerText(spinnakerState(s.spiHoist));
    partnerLine = t(
      control === "fullBoat"
        ? gen
          ? "hud.partnerLine.crewOnCallGennaker"
          : "hud.partnerLine.crewOnCall"
        : gen
          ? "hud.partnerLine.crewGennaker"
          : "hud.partnerLine.crew",
      { name, weight, spi },
    );
  }
  const panel: Panel = {
    gauge: tillerGauge,
    sail,
    call: null,
    partnerLine,
    chem,
  };
  if (tel.planing) panel.planing = true;
  // The Crew's call to a Helm who is over-heeling in the 420: flatten with the main, and hike too if the Helm's own weight is short.
  if (two && control === "playerCareer" && tel.crew && tel.crew.balance > 60) {
    const short =
      !autoHike && tel.helm !== undefined && tel.helm.ideal - s.helmOut > 0.25;
    panel.call = t(short ? "call.easeHike" : "call.flatten", { name });
  }
  if (!autoHike) {
    // Along the gauge: from the class's lowest weight position (sitting to leeward in the 420) to fully out.
    const low = p.sim.cls.helmRighting.leewardMin,
      along = (out: number) => (out - low) / (1 - low);
    panel.hike = {
      label: t("hud.gauge.hike"),
      value: along(s.helmOut),
      centered: false,
      ideal: along(tel.helm!.ideal),
      ends: [
        t(low < 0 ? "hud.slider.hikeLeeward" : "hud.slider.hikeIn"),
        t("hud.slider.hikeOut"),
      ],
    };
  }
  return panel;
}
