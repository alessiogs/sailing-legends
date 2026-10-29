import { t } from "../i18n";
import { ageInSeason, DEFAULT_STARTING_AGE, MAX_STARTING_AGE, MIN_STARTING_AGE } from "../career/Ages";
import { seasonCalendar } from "../career/Calendar";
import type { CareerState } from "../career/CareerSave";
import { FLEET_SIZE } from "../career/Fleets";
import { isSeasonOver } from "../career/RecordRace";
import { CLASSES } from "../sailing/BoatClass";
import { h } from "./dom";

/** What the Career overlay shows: the starting-age choice, the unreadable-save prompt, or the Season calendar. */
export type CareerView =
  | { kind: "age"; /** A saved Career exists and will be replaced. */ replaces: boolean }
  | { kind: "unreadable" }
  | { kind: "calendar"; state: CareerState };

/** What the Career overlay's buttons do; the game implements them. */
export interface CareerActions {
  /** Starts a new Career at this starting age. */
  start(age: number): void;
  /** Starts the next Race of the Season. */
  startRace(): void;
  /** Asks for the starting age (after the unreadable-save prompt). */
  askAge(): void;
  /** Goes back to the main menu. */
  mainMenu(): void;
}

/** The Career overlay: its own sheet in the page, built here so `index.html` holds no text for it. */
export class CareerScreen {
  readonly root = h("section", { id: "career", class: "overlay hidden" });

  constructor(private readonly actions: CareerActions) {}

  /** Replaces what the overlay shows. */
  render(view: CareerView) {
    const sheet = h("div", { class: "sheet" }, ...this.content(view));
    this.root.replaceChildren(sheet);
  }

  private content(view: CareerView): (HTMLElement | string)[] {
    switch (view.kind) {
      case "age": return this.age(view.replaces);
      case "unreadable": return this.unreadable();
      case "calendar": return this.calendar(view.state);
    }
  }

  private button(kind: "primary" | "ghost", text: string, onClick: () => void, id?: string) {
    const b = h("button", { class: kind, ...(id ? { id } : {}) }, text);
    b.addEventListener("click", onClick);
    return b;
  }

  private age(replaces: boolean) {
    let age = DEFAULT_STARTING_AGE;
    const ages = Array.from({ length: MAX_STARTING_AGE - MIN_STARTING_AGE + 1 }, (_, i) => MIN_STARTING_AGE + i);
    const buttons = ages.map(a => {
      const b = h("button", { "data-v": String(a), class: a === age ? "on" : "" }, String(a));
      b.addEventListener("click", () => { age = a; for (const o of buttons) o.classList.toggle("on", o === b); });
      return b;
    });
    return [
      h("div", { class: "brand" }, t("career.age.title")),
      h("p", { class: "lede" }, t("career.age.help")),
      h("div", { class: "seg", id: "career-age" }, ...buttons),
      ...(replaces ? [h("p", { class: "muted" }, t("career.age.replaces"))] : []),
      h("div", { class: "row-btns" },
        this.button("ghost", t("career.back"), () => this.actions.mainMenu(), "career-back"),
        this.button("primary", t("career.age.start"), () => this.actions.start(age), "career-begin")),
    ];
  }

  private unreadable() {
    return [
      h("div", { class: "brand" }, t("career.unreadable.title")),
      h("p", { class: "lede" }, t("career.unreadable.text")),
      h("div", { class: "row-btns" },
        this.button("ghost", t("career.unreadable.no"), () => this.actions.mainMenu(), "career-no"),
        this.button("primary", t("career.unreadable.yes"), () => this.actions.askAge(), "career-yes")),
    ];
  }

  private calendar(state: CareerState) {
    const calendar = seasonCalendar(state.classId);
    const over = isSeasonOver(state);
    const sailed = state.results[state.regattaIndex].length;
    const rows = calendar.map((r, i) => {
      const done = i < state.regattaIndex || (over && i === state.regattaIndex);
      const current = i === state.regattaIndex && !over;
      const status = done ? t("career.regatta.done") : current ? t("career.regatta.next", { race: sailed + 1, races: r.races }) : t("career.regatta.upcoming");
      return h("li", { class: current ? "current" : done ? "done" : "" },
        h("span", { class: "n" }, String(i + 1)),
        h("span", {},
          h("b", {}, t("career.calendar.regatta", { number: i + 1, venue: r.venue })),
          h("small", {}, `${t(`career.level.${r.level}`)} · ${t("career.calendar.detail", { boatClass: CLASSES[r.classId].name, boats: FLEET_SIZE[r.level], races: r.races })}`)),
        h("span", { class: "s" }, status));
    });
    return [
      h("div", { class: "brand" }, t("career.calendar.title", { season: state.season, age: ageInSeason(state.startingAge, state.season) })),
      h("ol", { class: "regattas", id: "career-calendar" }, ...rows),
      ...(over ? [h("p", { class: "muted", id: "career-over" }, t("career.seasonOver"))] : []),
      h("div", { class: "row-btns" },
        this.button("ghost", t("career.mainMenu"), () => this.actions.mainMenu(), "career-menu"),
        ...(over ? [] : [this.button("primary", t("career.race.start", { race: sailed + 1 }), () => this.actions.startRace(), "career-race")])),
    ];
  }
}
