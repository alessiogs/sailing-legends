/** The Career's standings sheets: the Regatta and Season rankings with the Rival lines, and the Season summary. */
import { t } from "../i18n";
import { seasonCalendar, venueName } from "../career/Calendar";
import type { CareerState } from "../career/CareerSave";
import { PLAYER_ID } from "../career/RecordRace";
import type { RegattaStanding, SeasonStanding } from "../career/Scoring";
import type { RegattaReport, RivalComparison, SeasonSummary } from "../career/Standings";
import { RIVALS } from "../sailors/Sailors";
import { h } from "./dom";
import { rivalLine } from "./rivalText";

const RIVAL_IDS: ReadonlySet<string> = new Set(RIVALS.map(r => r.id));

/** Names sailors by id: the player is "You", everyone else is named in the pool. */
function namer(state: CareerState) {
  return (id: string) => id === PLAYER_ID ? t("career.standings.you") : state.pool.find(s => s.id === id)?.name ?? id;
}

type Row = { id: string; place: number; detail: (Node | string)[]; points: number };

function table(rows: Row[], name: (id: string) => string, id: string) {
  return h("table", { class: "ranking", id },
    ...rows.map(r => h("tr", { class: r.id === PLAYER_ID ? "me" : RIVAL_IDS.has(r.id) ? "rival" : "", "data-id": r.id },
      h("td", { class: "pl" }, t("results.place", { place: r.place })),
      h("td", {}, name(r.id)),
      h("td", { class: "sc" }, ...r.detail),
      h("td", { class: "pt" }, String(r.points)))));
}

/** Race scores of a Regatta ranking, the Discard struck through. */
function raceScores(s: RegattaStanding): (Node | string)[] {
  return s.scores.flatMap((v, i) => [i ? " · " : "", i === s.discarded ? h("s", {}, String(v)) : String(v)]);
}

const seasonRow = (s: SeasonStanding): Row =>
  ({ id: s.id, place: s.place, detail: [s.regattaPlaces.join(" · ")], points: s.points });

function rivalLines(lines: RivalComparison[], name: (id: string) => string, id: string) {
  return h("ul", { class: "rival-lines", id }, ...lines.map(c => h("li", { class: c.rivalAhead ? "ahead" : "behind" }, rivalLine(c, name(c.rivalId)))));
}

/** After a Regatta: its ranking, the Season ranking so far and a line for each Rival. */
export function standingsSheet(state: CareerState, report: RegattaReport): (HTMLElement | string)[] {
  const name = namer(state);
  const regatta = seasonCalendar(state.classId)[report.regattaIndex];
  return [
    h("div", { class: "brand" }, t("career.standings.title", { number: report.regattaIndex + 1, venue: venueName(regatta) })),
    h("h3", {}, t("career.standings.regatta")),
    table(report.regatta.map(s => ({ id: s.id, place: s.place, detail: raceScores(s), points: s.points })), name, "career-regatta-table"),
    rivalLines(report.regattaRivals, name, "career-regatta-rivals"),
    h("h3", {}, t("career.standings.season")),
    table(report.season.map(seasonRow), name, "career-season-table"),
    rivalLines(report.seasonRivals, name, "career-season-rivals"),
  ];
}

/** After the Season's last Regatta: the final place, the Regatta places, the ranking and the Rivals. */
export function summarySheet(state: CareerState, summary: SeasonSummary): (HTMLElement | string)[] {
  const name = namer(state);
  const { player } = summary;
  return [
    h("div", { class: "brand" }, t("career.summary.title", { season: state.season })),
    h("p", { class: "lede", id: "career-summary-result" }, t("career.summary.result", { place: player.place, points: player.points })),
    h("p", { class: "muted", id: "career-summary-places" },
      `${t("career.summary.places")}: ${player.regattaPlaces.map(place => t("results.place", { place })).join(" · ")}`),
    h("h3", {}, t("career.standings.season")),
    table(summary.standings.map(seasonRow), name, "career-summary-table"),
    h("h3", {}, t("career.summary.rivals")),
    rivalLines(summary.rivals, name, "career-summary-rivals"),
  ];
}
