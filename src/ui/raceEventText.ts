/**
 * Words a race event for the player (ADR 0001): the race emits data, this module turns it into catalog text.
 * Contact events are worded from the point of view of the boat they concern (`racer`): the boat at fault is
 * told the rule and why, the other boat is told who touched it.
 */
import { t } from "../i18n";
import type { RaceEvent } from "../race/Race";
import type { Rule, VerdictReason } from "../race/Rules";

const REASON = {
  tacking: "event.reason.tacking",
  portStarboard: "event.reason.portStarboard",
  clearAstern: "event.reason.clearAstern",
  windward: "event.reason.windward",
} as const satisfies Record<VerdictReason, string>;

/** Why a penalty was given, as shown in brackets after the turns. */
function penaltyReason(rule: Rule): string {
  return rule === "31" ? t("event.penalty.markTouched") : t("event.penalty.rule", { rule });
}

/** The toast text of a race event, in the active language. */
export function eventText(e: RaceEvent): string {
  switch (e.kind) {
    case "warning": return t("event.warning", { seconds: e.seconds });
    case "gun": return t("event.gun");
    case "ocs": return t("event.ocs");
    case "ocs-cleared": return t("event.ocsCleared");
    case "start": return t("event.start", { next: e.next.name });
    case "rounded": return t("event.rounded", { rounded: e.rounded.name, next: e.next.name });
    case "finish": return e.place === null ? t("event.finishDsq") : t("event.finish", { place: e.place });
    case "penalty": return t("event.penalty", { turns: e.turns, reason: penaltyReason(e.rule) });
    case "penalty-done": return t("event.penaltyDone");
    case "contact":
      return e.atFault === e.racer
        ? t("event.contact.atFault", { other: e.other.name, rule: e.rule, reason: t(REASON[e.reason]) })
        : t("event.contact.touchedBy", { other: e.other.name, rule: e.rule });
  }
}
