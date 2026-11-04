/**
 * The end-of-Season choice: the classes the player's age allows, each with its weight hint (the ILCA by rig); in a
 * two-person class, the Partner among the sailors raced against, with the Role and Control mode. Built with `h()`; the
 * choice itself is `startNextSeason`'s.
 */
import { t } from "../i18n";
import type { CareerState } from "../career/CareerSave";
import {
  boatClassOf,
  classOffers,
  isPairClass,
  pathOf,
  samePath,
  type ClassPath,
  type PairClassId,
} from "../career/Classes";
import { partnerOffers, type SeasonChoice } from "../career/SeasonClose";
import { PAIR_IDEAL_KG, RIG_IDEAL_KG } from "../career/Weight";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "../race/PlayerChoice";
import { h } from "./dom";

const ROLES = [
  { id: "helm", label: "menu.role.helm", choice: HELM },
  { id: "crew", label: "menu.role.crew", choice: CREW },
  { id: "fullBoat", label: "menu.role.fullBoat", choice: FULL_BOAT },
] as const satisfies readonly {
  id: string;
  label: "menu.role.helm" | "menu.role.crew" | "menu.role.fullBoat";
  choice: PlayerChoice;
}[];

/** What the sheet's buttons do. */
export interface NextSeasonActions {
  /** Closes the Season with this choice and shows the new Season's calendar. */
  choose(choice: SeasonChoice): void;
  /** Back to the Season summary. */
  back(): void;
}

/** The sheet for the Season just sailed (`state` has all its Races). `rerender` redraws it after a pick. */
export function nextSeasonSheet(
  state: CareerState,
  actions: NextSeasonActions,
  rerender: (content: (HTMLElement | string)[]) => void,
): (HTMLElement | string)[] {
  const classes = classOffers(state);
  const nameOf = (id: string) =>
    state.pool.find((s) => s.id === id)?.name ?? id;
  const current = pathOf(state);
  let picked: ClassPath = current;
  let partnerId = "";
  let role: (typeof ROLES)[number]["id"] =
    state.partnerId === null
      ? "helm"
      : state.choice.role === "crew"
        ? "crew"
        : state.choice.control === "fullBoat"
          ? "fullBoat"
          : "helm";

  const draw = () => rerender(sheet());
  const button = (
    kind: "primary" | "ghost",
    text: string,
    id: string,
    onClick: () => void,
  ) => {
    const b = h("button", { class: kind, id }, text);
    b.addEventListener("click", onClick);
    return b;
  };

  const classButtons = () =>
    classes.map((o) => {
      const cls = boatClassOf(o.path);
      const detail =
        o.path.rig !== null
          ? t("career.next.rig", {
              from: RIG_IDEAL_KG[o.path.rig].min,
              to: RIG_IDEAL_KG[o.path.rig].max,
              kg: Math.round(o.kg),
              hint: t(`career.next.hint.${o.hint!}`),
            })
          : isPairClass(o.path.classId)
            ? t("career.next.pairClass", {
                from: PAIR_IDEAL_KG[o.path.classId].min,
                to: PAIR_IDEAL_KG[o.path.classId].max,
              })
            : t("career.next.single");
      const b = h(
        "button",
        {
          "data-v": `${o.path.classId}${o.path.rig ?? ""}`,
          class: `partner${samePath(o.path, picked) ? " on" : ""}`,
        },
        h("b", {}, cls.name),
        h("small", { class: `hint ${o.hint ?? ""}` }, detail),
        ...(samePath(o.path, current)
          ? [h("small", {}, t("career.next.current"))]
          : []),
      );
      b.addEventListener("click", () => {
        picked = o.path;
        draw();
      });
      return b;
    });

  const partnerSection = (classId: PairClassId) => {
    const offers = partnerOffers(state, classId);
    if (!offers.some((o) => o.id === partnerId))
      partnerId =
        (state.partnerId !== null &&
        offers.some((o) => o.id === state.partnerId)
          ? state.partnerId
          : offers[0]?.id) ?? "";
    const partners = offers.map((o) => {
      const b = h(
        "button",
        { "data-v": o.id, class: `partner${o.id === partnerId ? " on" : ""}` },
        h("b", {}, nameOf(o.id)),
        h(
          "span",
          { class: "meter" },
          h("i", { style: `width:${o.chemistry}%` }),
        ),
        h(
          "small",
          {},
          t("career.next.chemistry", {
            chemistry: Math.round(o.chemistry),
            kg: Math.round(o.kg),
          }),
        ),
        h(
          "small",
          { class: `hint ${o.hint}` },
          t("career.next.pair", {
            kg: Math.round(o.pairKg),
            hint: t(`career.next.hint.${o.hint}`),
          }),
        ),
      );
      b.addEventListener("click", () => {
        partnerId = o.id;
        draw();
      });
      return b;
    });
    const roles = ROLES.map((r) => {
      const b = h(
        "button",
        { "data-v": r.id, class: r.id === role ? "on" : "" },
        t(r.label),
      );
      b.addEventListener("click", () => {
        role = r.id;
        draw();
      });
      return b;
    });
    return [
      h("p", { class: "lede" }, t("career.next.partner")),
      h("div", { class: "partners", id: "career-partners" }, ...partners),
      h("h3", {}, t("menu.label.role")),
      h("div", { class: "seg", id: "career-role" }, ...roles),
    ];
  };

  const sheet = (): (HTMLElement | string)[] => {
    const pair = isPairClass(picked.classId) ? picked.classId : null;
    const choice = (): SeasonChoice =>
      pair
        ? {
            classId: pair,
            partnerId,
            choice: ROLES.find((r) => r.id === role)!.choice,
          }
        : picked.rig !== null
          ? { classId: "ilca", rig: picked.rig }
          : { classId: "optimist" };
    return [
      h(
        "div",
        { class: "brand" },
        t("career.next.title", { season: state.season + 1 }),
      ),
      h("p", { class: "lede" }, t("career.next.help")),
      h("h3", {}, t("career.next.classes")),
      h("div", { class: "partners", id: "career-classes" }, ...classButtons()),
      ...(pair ? partnerSection(pair) : []),
      h(
        "div",
        { class: "row-btns" },
        button("ghost", t("career.back"), "career-next-back", () =>
          actions.back(),
        ),
        button("primary", t("career.next.start"), "career-start-season", () =>
          actions.choose(choice()),
        ),
      ),
    ];
  };
  return sheet();
}
