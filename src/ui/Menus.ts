import { DEFAULT_CONTROLS } from "../core/ControlSettings";
import type { Input } from "../core/Input";
import type { GameController, Mode, Screens } from "../game/GameController";
import { t, type MessageKey } from "../i18n";
import type { Racer } from "../race/Race";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "../race/PlayerChoice";
import { CLASSES, isTwoPerson } from "../sailing/BoatClass";
import { crewChemistry, RIVALS, rivalById } from "../sailors/Sailors";
import { racerName } from "./raceNames";

const $ = (id: string) => document.getElementById(id)!;
const buttons = (selector: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(selector));

/** The three Role buttons (`data-v`), each a Role and Control mode, with its help text. */
const ROLE_OPTIONS = {
  helm: { choice: HELM, help: "menu.roleHelp.helm" },
  crew: { choice: CREW, help: "menu.roleHelp.crew" },
  fullBoat: { choice: FULL_BOAT, help: "menu.roleHelp.fullBoat" },
} as const satisfies Record<string, { choice: PlayerChoice; help: MessageKey }>;
type RoleOption = keyof typeof ROLE_OPTIONS;
const roleOption = (c: PlayerChoice): RoleOption => c.role === "crew" ? "crew" : c.control === "fullBoat" ? "fullBoat" : "helm";

/**
 * The page's menus: the main menu (boat class, wind, Role, Partner, Auto-trim), the Commands menu,
 * the pause screen and the results screen. Implements the controller's `Screens`; `attach` wires the
 * buttons to the game and shows the current choices.
 */
export class Menus implements Screens {
  private readonly el = {
    menu: $("menu"), pause: $("pause"), results: $("results"), controls: $("controls"),
    autoTrim: $("auto-trim-opt") as HTMLInputElement,
  };
  private game!: GameController;

  /** `savePrefs` saves the player's preferences after a change in the Commands menu. */
  constructor(private readonly input: Input, private readonly savePrefs: () => void) {}

  // ---------- Screens ----------
  show(m: Mode) {
    this.el.menu.classList.toggle("hidden", m !== "menu");
    this.el.pause.classList.toggle("hidden", m !== "paused");
    this.el.results.classList.toggle("hidden", m !== "results");
    this.el.controls.classList.toggle("hidden", m !== "controls");
  }

  fillResults(standings: Racer[]) {
    const rows = standings.map((r, i) => {
      const time = r.dsq ? t("results.dsq") : r.finishTime !== null ? `${Math.floor(r.finishTime / 60)}:${String(Math.floor(r.finishTime % 60)).padStart(2, "0")}` : "—";
      return `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.dsq ? "–" : t("results.place", { place: i + 1 })}</td><td>${racerName(r)}</td><td>${time}</td></tr>`;
    }).join("");
    $("results-table").innerHTML = rows;
  }

  autoTrimChosen() { return this.el.autoTrim.checked; }

  showAutoTrim(on: boolean) { this.el.autoTrim.checked = on; }

  // ---------- Wiring ----------
  /** Wires every menu button to `game` and shows the current settings and race setup. Call once, at startup. */
  attach(game: GameController) {
    this.game = game;
    $("start-btn").addEventListener("click", () => game.startFromMenu());
    this.attachCommands();
    this.attachBoatMenu();
    for (const b of buttons("#wind-opt button")) {
      b.addEventListener("click", () => {
        game.windKn = Number(b.dataset.v);
        for (const o of buttons("#wind-opt button")) o.classList.toggle("on", o === b);
      });
    }
  }

  // ---------- Commands menu ----------
  private attachCommands() {
    const { game, input } = this;
    const bindSeg = (id: string, apply: (v: string) => void) => {
      for (const b of buttons(`#${id} button`)) {
        b.addEventListener("click", () => { apply(b.dataset.v!); input.tiller = 0; this.syncControls(); this.savePrefs(); });
      }
    };
    bindSeg("steer-opt", v => { input.settings.steering = v === "boat" ? "boat" : "tiller"; });
    bindSeg("center-opt", v => { input.settings.autoCenter = v === "1"; });
    bindSeg("tspeed-opt", v => { input.settings.tillerSpeed = Number(v); });
    bindSeg("sspeed-opt", v => { input.settings.sheetSpeed = Number(v); });
    $("open-controls").addEventListener("click", () => game.openControls());
    $("pause-controls").addEventListener("click", () => game.openControls());
    $("controls-back").addEventListener("click", () => game.closeControls());
    $("controls-reset").addEventListener("click", () => { input.settings = { ...DEFAULT_CONTROLS }; this.syncControls(); this.savePrefs(); });
    $("resume-btn").addEventListener("click", () => game.setMode("racing"));
    $("pause-menu").addEventListener("click", () => game.setMode("menu"));
    this.syncControls();
  }

  /** Highlights the chosen control settings and words the steering help to match. */
  private syncControls() {
    const st = this.input.settings;
    const mark = (id: string, v: string) => {
      for (const o of buttons(`#${id} button`)) o.classList.toggle("on", o.dataset.v === v);
    };
    mark("steer-opt", st.steering);
    mark("center-opt", st.autoCenter ? "1" : "0");
    mark("tspeed-opt", String(st.tillerSpeed));
    mark("sspeed-opt", String(st.sheetSpeed));
    const tiller = st.steering === "tiller";
    $("steer-help").textContent = tiller ? t("controls.steerHelp.tiller") : t("controls.steerHelp.boat");
    $("key-left-label").textContent = tiller ? t("controls.keyLeft.tiller") : t("controls.keyLeft.boat");
    $("key-right-label").textContent = tiller ? t("controls.keyRight.tiller") : t("controls.keyRight.boat");
    $("steer-summary").textContent = tiller ? t("controls.steerSummary.tiller") : t("controls.steerSummary.boat");
  }

  // ---------- Boat, Role and Partner choice ----------
  private attachBoatMenu() {
    const { game } = this;
    for (const b of buttons("#class-opt button")) {
      b.addEventListener("click", () => { game.boatClass = CLASSES[b.dataset.v!] ?? CLASSES.optimist; this.syncBoatMenu(); });
    }
    for (const b of buttons("#role-opt button")) {
      b.addEventListener("click", () => { game.choice = ROLE_OPTIONS[b.dataset.v as RoleOption].choice; this.syncBoatMenu(); });
    }
    this.syncBoatMenu();
  }

  /** Highlights the chosen boat class, Role and Partner, and rebuilds the Partner list. */
  private syncBoatMenu() {
    const { game } = this;
    const { boatClass, choice, partner } = game;
    const two = isTwoPerson(boatClass);
    for (const o of buttons("#class-opt button")) o.classList.toggle("on", o.dataset.v === boatClass.id);
    for (const o of buttons("#role-opt button")) o.classList.toggle("on", o.dataset.v === roleOption(choice));
    $("pair-block").classList.toggle("hidden", !two);
    $("lede-class").textContent = two ? t("menu.lede.twoPerson") : t("menu.lede.single");
    $("version-chip").textContent = t("menu.versionChip", { boatClass: boatClass.name.toUpperCase() });
    $("role-help").textContent = t(ROLE_OPTIONS[roleOption(choice)].help);
    $("partner-opt").innerHTML = RIVALS.map(r => {
      const c = crewChemistry(r);
      return `<button data-v="${r.id}" class="partner${r.id === partner.id ? " on" : ""}">
      <b>${r.name}</b><span class="meter"><i style="width:${c}%"></i></span>
      <small>${t("menu.partnerStats", { chemistry: c, technique: Math.round(r.technique * 100), discipline: Math.round(r.discipline * 100) })}</small></button>`;
    }).join("");
    for (const b of buttons("#partner-opt button")) {
      b.addEventListener("click", () => { game.partner = rivalById(b.dataset.v!) ?? game.partner; this.syncBoatMenu(); });
    }
  }
}
