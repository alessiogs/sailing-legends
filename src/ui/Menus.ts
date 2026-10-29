import { DEFAULT_CONTROLS } from "../core/ControlSettings";
import type { Input } from "../core/Input";
import type { CareerResults, GameController, Mode, Screens } from "../game/GameController";
import { LANGUAGES, t, type Language, type MessageKey } from "../i18n";
import type { Racer } from "../race/Race";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "../race/PlayerChoice";
import { CLASSES, isClassId, isTwoPerson } from "../sailing/BoatClass";
import { crewChemistry, RIVALS, rivalById } from "../sailors/Sailors";
import { CareerScreen, type CareerView } from "./CareerScreen";
import { h } from "./dom";
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
 * The page's menus: the main menu (boat class, wind, Role, Partner, Auto-trim, and the Career entries), the Commands
 * menu, the pause screen, the results screen and the Career screen. Implements the controller's `Screens`; `attach` wires the
 * buttons to the game and shows the current choices.
 */
export class Menus implements Screens {
  private readonly el = {
    menu: $("menu"), pause: $("pause"), results: $("results"), controls: $("controls"),
    autoTrim: $("auto-trim-opt") as HTMLInputElement,
  };
  private game!: GameController;
  private readonly career = new CareerScreen({
    start: age => this.game.newCareer(age),
    startRace: () => this.game.startCareerRace(),
    showCalendar: () => this.game.showCalendar(),
    showStandings: index => this.game.showStandings(index),
    showSummary: () => this.game.showSummary(),
    showNextSeason: () => this.game.showNextSeason(),
    startSeason: choice => this.game.startSeason(choice),
    askAge: () => this.game.askCareerAge(),
    mainMenu: () => this.game.setMode("menu"),
  });
  private continueButton!: HTMLButtonElement;
  private resultsNext!: HTMLButtonElement;
  private resultsCalendar!: HTMLButtonElement;
  private resultsStandings!: HTMLButtonElement;
  private resultsQuick!: HTMLElement;
  private pauseRestart!: HTMLButtonElement;
  /** The Regatta whose standings the results screen offers, or null. */
  private standingsRegatta: number | null = null;

  /**
   * `savePrefs` saves the player's preferences after a change in the Commands menu. `language` is the active
   * language, and `chooseLanguage` is called when the player picks another one in the main menu.
   */
  constructor(
    private readonly input: Input,
    private readonly savePrefs: () => void,
    private readonly language: Language,
    private readonly chooseLanguage: (language: Language) => void,
  ) {}

  // ---------- Screens ----------
  show(m: Mode) {
    this.el.menu.classList.toggle("hidden", m !== "menu");
    this.el.pause.classList.toggle("hidden", m !== "paused");
    this.el.results.classList.toggle("hidden", m !== "results");
    this.el.controls.classList.toggle("hidden", m !== "controls");
    this.career.root.classList.toggle("hidden", m !== "career");
    if (m === "paused") this.pauseRestart.classList.toggle("hidden", this.game.inCareerRace);
    if (m === "menu") this.continueButton.classList.toggle("hidden", this.game.savedCareer() === null);
  }

  showCareer(view: CareerView) { this.career.render(view); }

  fillResults(standings: Racer[], career: CareerResults | null) {
    this.resultsNext.classList.toggle("hidden", !career?.nextRace);
    this.resultsCalendar.classList.toggle("hidden", !career);
    this.standingsRegatta = career?.standings ?? null;
    this.resultsStandings.classList.toggle("hidden", this.standingsRegatta === null);
    this.resultsQuick.classList.toggle("hidden", !!career);
    this.el.results.querySelector(".muted")!.classList.toggle("hidden", !!career);
    $("results-table").replaceChildren(...standings.map((r, i) => {
      const time = r.dsq ? t("results.dsq") : r.finishTime !== null ? `${Math.floor(r.finishTime / 60)}:${String(Math.floor(r.finishTime % 60)).padStart(2, "0")}` : "—";
      return h("tr", { class: r.isPlayer ? "me" : "" },
        h("td", {}, r.dsq ? "–" : t("results.place", { place: i + 1 })), h("td", {}, racerName(r)), h("td", {}, time));
    }));
  }

  autoTrimChosen() { return this.el.autoTrim.checked; }

  showAutoTrim(on: boolean) { this.el.autoTrim.checked = on; }

  // ---------- Wiring ----------
  /** Wires every menu button to `game` and shows the current settings and race setup. Call once, at startup. */
  attach(game: GameController) {
    this.game = game;
    $("start-btn").addEventListener("click", () => game.startFromMenu());
    this.attachCareer();
    this.attachCommands();
    this.attachTouchButtons();
    this.attachBoatMenu();
    this.attachLanguage();
    for (const b of buttons("#wind-opt button")) {
      b.addEventListener("click", () => {
        game.windKn = Number(b.dataset.v);
        for (const o of buttons("#wind-opt button")) o.classList.toggle("on", o === b);
      });
    }
  }

  // ---------- Career ----------
  /** Adds the Career entries to the main menu, the Career overlay to the page and the next-Race buttons to the results. */
  private attachCareer() {
    const { game } = this;
    const entry = (id: string, key: "career.new" | "career.continue", run: () => void) => {
      const b = h("button", { id, class: "ghost" }, t(key));
      b.addEventListener("click", run);
      return b;
    };
    this.continueButton = entry("career-continue", "career.continue", () => game.continueCareer());
    this.continueButton.classList.toggle("hidden", game.savedCareer() === null);
    this.el.menu.querySelector(".sheet")!.insertBefore(
      h("div", { class: "career-btns" }, entry("career-new", "career.new", () => game.askCareerAge()), this.continueButton),
      $("start-btn"));
    this.el.menu.after(this.career.root);

    const button = (id: string, kind: string, key: "career.results.next" | "career.results.calendar" | "career.results.standings", run: () => void) => {
      const b = h("button", { id, class: `${kind} hidden` }, t(key));
      b.addEventListener("click", run);
      return b;
    };
    this.resultsNext = button("results-next", "primary", "career.results.next", () => game.startCareerRace());
    this.resultsStandings = button("results-standings", "primary", "career.results.standings", () => {
      if (this.standingsRegatta !== null) game.showStandings(this.standingsRegatta);
    });
    this.resultsCalendar = button("results-calendar", "ghost", "career.results.calendar", () => game.showCalendar());
    this.el.results.querySelector(".sheet")!.append(this.resultsNext, this.resultsStandings, this.resultsCalendar);
  }

  // ---------- Touch buttons ----------
  /** Adds the buttons the pause and results screens have for the keys R and M, shown only on touch screens (`.touch-only`). */
  private attachTouchButtons() {
    const { game } = this;
    const button = (id: string, kind: string, key: "touch.restart" | "touch.anotherRace" | "touch.menu", run: () => void) => {
      const b = h("button", { id, class: `${kind} touch-only` }, t(key));
      b.addEventListener("click", run);
      return b;
    };
    this.pauseRestart = button("pause-restart", "ghost", "touch.restart", () => game.restart());
    $("pause-menu").before(this.pauseRestart);
    this.resultsQuick = h("div", { class: "stack touch-only" },
      button("results-restart", "primary", "touch.anotherRace", () => game.restart()),
      button("results-menu", "ghost", "touch.menu", () => game.setMode("menu")));
    this.el.results.querySelector(".sheet")!.append(this.resultsQuick);
  }

  // ---------- Language ----------
  /** Adds the language picker to the main menu's options (built here, so the page holds no text of its own for it). */
  private attachLanguage() {
    const options = this.el.menu.querySelector(".options")!;
    options.append(h("div", { class: "opt" },
      h("small", {}, t("menu.label.language")),
      h("div", { class: "seg", id: "language-opt" }, ...LANGUAGES.map(l => {
        const b = h("button", { "data-v": l, class: l === this.language ? "on" : "" }, t(`menu.language.${l}`));
        b.addEventListener("click", () => { if (l !== this.language) this.chooseLanguage(l); });
        return b;
      }))));
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
      b.addEventListener("click", () => {
        const id = b.dataset.v;
        game.boatClass = isClassId(id) ? CLASSES[id] : CLASSES.optimist;
        this.syncBoatMenu();
      });
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
    $("partner-opt").replaceChildren(...RIVALS.map(r => {
      const c = crewChemistry(r);
      return h("button", { "data-v": r.id, class: `partner${r.id === partner.id ? " on" : ""}` },
        h("b", {}, r.name), h("span", { class: "meter" }, h("i", { style: `width:${c}%` })),
        h("small", {}, t("menu.partnerStats", { chemistry: c, technique: Math.round(r.technique * 100), discipline: Math.round(r.discipline * 100) })));
    }));
    for (const b of buttons("#partner-opt button")) {
      b.addEventListener("click", () => { game.partner = rivalById(b.dataset.v!) ?? game.partner; this.syncBoatMenu(); });
    }
  }
}
