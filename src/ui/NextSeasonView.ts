/**
 * The end-of-Season choice: stay in the Optimist or move to the 420, and in the 420 pick the Partner among the sailors
 * raced against, with the Role and Control mode. Built with `h()`; the choice itself is `startNextSeason`'s.
 */
import { t } from "../i18n";
import type { CareerState } from "../career/CareerSave";
import { partnerOffers, type SeasonChoice } from "../career/SeasonClose";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "../race/PlayerChoice";
import { h } from "./dom";

const ROLES = [
  { id: "helm", label: "menu.role.helm", choice: HELM },
  { id: "crew", label: "menu.role.crew", choice: CREW },
  { id: "fullBoat", label: "menu.role.fullBoat", choice: FULL_BOAT },
] as const satisfies readonly { id: string; label: "menu.role.helm" | "menu.role.crew" | "menu.role.fullBoat"; choice: PlayerChoice }[];

/** What the sheet's buttons do. */
export interface NextSeasonActions {
  /** Closes the Season with this choice and shows the new Season's calendar. */
  choose(choice: SeasonChoice): void;
  /** Back to the Season summary. */
  back(): void;
}

/** The sheet for the Season just sailed (`state` has all its Races). `rerender` redraws it after a pick. */
export function nextSeasonSheet(state: CareerState, actions: NextSeasonActions, rerender: (content: (HTMLElement | string)[]) => void): (HTMLElement | string)[] {
  const in420 = state.classId === "420";
  const offers = partnerOffers(state);
  const nameOf = (id: string) => state.pool.find(s => s.id === id)?.name ?? id;
  let picking = in420;
  let partnerId = (in420 && state.partnerId !== null && offers.some(o => o.id === state.partnerId) ? state.partnerId : offers[0]?.id) ?? "";
  let role: (typeof ROLES)[number]["id"] = in420 ? (state.choice.role === "crew" ? "crew" : state.choice.control === "fullBoat" ? "fullBoat" : "helm") : "helm";

  const draw = () => rerender(sheet());
  const button = (kind: "primary" | "ghost", text: string, id: string, onClick: () => void) => {
    const b = h("button", { class: kind, id }, text);
    b.addEventListener("click", onClick);
    return b;
  };

  const sheet = (): (HTMLElement | string)[] => {
    const head = h("div", { class: "brand" }, t("career.next.title", { season: state.season + 1 }));
    if (!picking) {
      return [head, h("p", { class: "lede" }, t("career.next.help")),
        h("div", { class: "row-btns" },
          button("ghost", t("career.back"), "career-next-back", () => actions.back()),
          button("ghost", t("career.next.stay"), "career-stay", () => actions.choose({ classId: "optimist" })),
          button("primary", t("career.next.move"), "career-move", () => { picking = true; draw(); }))];
    }
    const partners = offers.map(o => {
      const b = h("button", { "data-v": o.id, class: `partner${o.id === partnerId ? " on" : ""}` },
        h("b", {}, nameOf(o.id)), h("span", { class: "meter" }, h("i", { style: `width:${o.chemistry}%` })),
        h("small", {}, t("career.next.chemistry", { chemistry: Math.round(o.chemistry) })));
      b.addEventListener("click", () => { partnerId = o.id; draw(); });
      return b;
    });
    const roles = ROLES.map(r => {
      const b = h("button", { "data-v": r.id, class: r.id === role ? "on" : "" }, t(r.label));
      b.addEventListener("click", () => { role = r.id; draw(); });
      return b;
    });
    return [head, h("p", { class: "lede" }, t("career.next.partner")),
      h("div", { class: "partners", id: "career-partners" }, ...partners),
      h("h3", {}, t("menu.label.role")),
      h("div", { class: "seg", id: "career-role" }, ...roles),
      h("div", { class: "row-btns" },
        button("ghost", t("career.back"), "career-next-back", () => in420 ? actions.back() : (picking = false, draw())),
        button("primary", t("career.next.start"), "career-start-season", () =>
          actions.choose({ classId: "420", partnerId, choice: ROLES.find(r => r.id === role)!.choice })))];
  };
  return sheet();
}
