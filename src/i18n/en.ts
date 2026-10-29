/**
 * English catalog. Typed `Catalog` (see `index.ts`), so it has exactly the keys, and the parameters, of the Italian
 * reference. Wording follows GLOSSARY.md: Helm, Crew, Pair, Partner, Role, Control mode, Assists, Auto-trim.
 */
import type { Catalog } from "./index";
import { plurals } from "./plural";

const plural = plurals("en");
const ordinals = new Intl.PluralRules("en", { type: "ordinal" });
const SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "st", two: "nd", few: "rd" };
/** 1 → "1st", 2 → "2nd", 11 → "11th". */
const ordinal = (n: number) => `${n}${SUFFIX[ordinals.select(n)] ?? "th"}`;

export const english: Catalog = {
  // Main menu.
  "menu.lede.twoPerson": "420 racing, in a Pair with jib, spinnaker and trapeze",
  "menu.lede.single": "Optimist racing",
  "menu.versionChip": ({ boatClass }) => `PROTOTYPE 0.4 · ${boatClass}`,
  "menu.roleHelp.helm": "Helm and mainsail. Your Partner, as Crew, trims the jib and spinnaker, goes out on the trapeze and decides when to hoist the spinnaker.",
  "menu.roleHelp.crew": "Your Partner steers. You: W/S jib (or spinnaker) sheet, A/D weight in/out up to the trapeze, E switch sides after tacks and gybes, Space hoist/drop the spinnaker. Listen for their calls.",
  "menu.roleHelp.fullBoat": "Helm and mainsail, and you call the manoeuvres: Space = hoist/drop the spinnaker. The Crew carries them out (faster when Crew Chemistry is high).",
  "menu.partnerStats": ({ chemistry, technique, discipline }) =>
    `Chemistry ${chemistry}/100 · technique ${technique} · reliability ${discipline}`,

  // Main menu, static page text (index.html, data-i18n attributes).
  "menu.loading": "Loading race…",
  "menu.lede.course": "Windward-leeward course (upwind – downwind – upwind). 45-second start sequence. Read the wind: the darker patches of water are gusts.",
  "menu.keys.tiller": "Tiller (Shift = fine)",
  "menu.keys.camera": "Camera: chase / free / tactical",
  "menu.keys.audio": "Audio",
  "menu.keys.gamepad": "Gamepad: left stick tiller · RT/LT sheet in/out · Y camera · X Auto-trim",
  "menu.label.boat": "BOAT",
  "menu.label.wind": "WIND",
  "menu.wind.light": "Light 7 kn",
  "menu.wind.medium": "Medium 11 kn",
  "menu.wind.strong": "Strong 15 kn",
  "menu.label.controls": "CONTROLS",
  "menu.openControls": "Controls…",
  "menu.autoTrim": "Auto-trim (Assist)",
  "menu.label.role": "YOUR ROLE",
  "menu.role.helm": "Helm",
  "menu.role.crew": "Crew",
  "menu.role.fullBoat": "Full Boat Control",
  "menu.label.partner": "YOUR PARTNER · CREW CHEMISTRY",
  "menu.tips.title": "How to go fast",
  "menu.tips.upwind": "You can't sail straight into the wind: below ~40° the sail luffs. Work upwind in a zig-zag, tacking.",
  "menu.tips.trimBar": "The bar at the bottom shows the ideal trim (green zone): keep the indicator inside it.",
  "menu.tips.tacks": "Tacks cost speed: do them while the boat is moving, not from a standstill.",
  "menu.tips.marksAndStart": "Leave the marks to port. At the start, stay behind the line until the gun.",
  "menu.tips.rightOfWay": "Right of way: port tack gives way to starboard tack, windward gives way to leeward, the boat astern keeps clear of the boat ahead. If you touch because of your own fault: 2 penalty turns; if you touch a mark: 1 turn.",
  "menu.start": "Start race",
  "menu.label.language": "LANGUAGE",
  "menu.language.it": "Italiano",
  "menu.language.en": "English",

  // Pause menu.
  "pause.title": "PAUSED",
  "pause.resume": "Resume",
  "pause.controls": "Controls",
  "pause.mainMenu": "Main menu",
  "pause.restartHint": "R to restart the race",

  // Controls menu.
  "controls.steerHelp.tiller": "→ pushes the tiller to starboard and the boat turns to port, as on a real boat.",
  "controls.steerHelp.boat": "→ turns the boat to starboard (the tiller goes the other way by itself).",
  "controls.keyLeft.tiller": "Tiller to port (the boat turns to starboard)",
  "controls.keyLeft.boat": "Turn to port",
  "controls.keyRight.tiller": "Tiller to starboard (the boat turns to port)",
  "controls.keyRight.boat": "Turn to starboard",
  "controls.steerSummary.tiller": "Steering: move the tiller",
  "controls.steerSummary.boat": "Steering: the boat's direction",
  "controls.title": "CONTROLS",
  "controls.steering.label": "Steering: what the arrows control",
  "controls.steering.tiller": "Move the tiller",
  "controls.steering.boat": "The boat's direction",
  "controls.autoCenter.label": "Tiller returns to centre",
  "controls.autoCenter.help": "When off, the tiller stays where you leave it, like a real tiller.",
  "controls.autoCenter.on": "Automatic",
  "controls.autoCenter.off": "Stays put",
  "controls.tillerSpeed": "Tiller speed",
  "controls.sheetSpeed": "Sheet speed",
  "controls.speed.slow": "Slow",
  "controls.speed.normal": "Normal",
  "controls.speed.fast": "Fast",
  "controls.table.action": "Action",
  "controls.table.keyboard": "Keyboard",
  "controls.table.gamepad": "Gamepad",
  "controls.table.crew420": "420 as Crew",
  "controls.pad.leftStick": "Left stick",
  // Actions, in the controls table (and the short key list of the main menu).
  "controls.action.fineTiller": "Fine tiller movement",
  "controls.action.sheetIn": "Sheet in",
  "controls.action.sheetOut": "Ease the sheet",
  "controls.action.autoTrim": "Auto-trim",
  "controls.action.camera": "Camera",
  "controls.action.pause": "Pause",
  "controls.action.restart": "Restart",
  "controls.action.crewWeight": "Weight in / out (up to the trapeze)",
  "controls.action.crewSheet": "Sheet in / ease jib or spinnaker",
  "controls.action.switchSide": "Switch sides after a tack or gybe",
  "controls.action.spinnaker": `Hoist / drop the spinnaker (also in "Full Boat Control")`,
  "controls.action.menus": "Audio · Controls · Menu",
  "controls.reset": "Reset to defaults",
  "controls.done": "Done",

  // Key names that differ by language.
  "key.enter": "Enter",
  "key.space": "Space",
  "key.arrows": "arrows",

  // Short messages during the race.
  "toast.startSequence": "Start sequence: 45 seconds",
  "toast.audioOff": "Audio off",
  "toast.audioOn": "Audio on",
  "toast.autoTrimOn": "Auto-trim: ON",
  "toast.autoTrimOff": "Trim: manual",
  "toast.switchSide": "Switch sides",
  "toast.camera.chase": "Camera: chase",
  "toast.camera.free": "Camera: free (drag with the mouse)",
  "toast.camera.top": "Camera: tactical",
  "toast.spi.hoist": "Hoist the spinnaker!",
  "toast.spi.drop": "Drop the spinnaker!",
  "toast.spi.callHoist": "You: “Hoist!”",
  "toast.spi.callDrop": "You: “Drop it!”",
  "toast.spi.partnerDecides": ({ name }) => `${name} decides on the spinnaker (in "Full Boat Control" you call it)`,
  "toast.spi.crewDecides": `The Crew decides on the spinnaker (in "Full Boat Control" you call it)`,

  // Names in a race (ui/raceNames.ts): the course's legs, the player, and a boat as "Helm/Crew".
  "race.leg.mark1": "Mark 1",
  "race.leg.mark2": "Mark 2",
  "race.leg.finish": "Finish",
  "race.player": "You",
  "race.pair": ({ helm, crew }) => `${helm}/${crew}`,

  // Race events (ui/raceEventText.ts words each event the race emits).
  "event.warning": ({ seconds }) => `${seconds} seconds to the start`,
  "event.gun": "START!",
  "event.ocs": "OCS! Over the line early: go back behind the line",
  "event.ocsCleared": "Back behind the line: you can start now",
  "event.start": ({ next }) => `Started · ${next}`,
  "event.rounded": ({ rounded, next }) => `${rounded} rounded · now: ${next}`,
  "event.finish": ({ place }) => `FINISH! ${ordinal(place)} place`,
  "event.finishDsq": "FINISH, but penalty not served: disqualified (DSQ)",
  "event.penalty": ({ turns, reason }) =>
    `Penalty: ${plural(turns, { one: "one turn", other: `${turns} turns` })} (${reason})`,
  "event.penalty.rule": ({ rule }) => `rule ${rule}`,
  "event.penalty.markTouched": "mark touched, rule 31",
  "event.penaltyDone": "Penalty turns done",
  "event.contact.atFault": ({ other, rule, reason }) =>
    `Contact with ${other}: rule ${rule}, ${reason}`,
  "event.contact.touchedBy": ({ other, rule }) =>
    `${other} touched you (rule ${rule}): penalty for ${other}`,
  // Why the boat at fault had to keep clear (Rules.ts VerdictReason).
  "event.reason.tacking": "tacking",
  "event.reason.portStarboard": "port tack against starboard tack",
  "event.reason.clearAstern": "clear astern",
  "event.reason.windward": "windward boat, overlapped",

  // Coaching: manoeuvre feedback and hints.
  "coach.tack": "Tack!",
  "coach.gybe": "Gybe!",
  "coach.partnerTack": ({ name }) => `${name}: “Tacking!” — switch sides (E)`,
  "coach.partnerGybe": ({ name }) => `${name}: “Gybing!” — switch sides (E)`,
  "coach.partnerReadyAbout": ({ name }) => `${name}: “Ready about… Hard a-lee!”`,
  "coach.irons.tiller": "You're stuck head to wind: ease the sheet (S) and push the tiller to bear away",
  "coach.irons.boat": "You're stuck head to wind: ease the sheet (S) and bear away with the helm",

  // Partner calls the player (as Crew) should act on.
  "call.switchSide": ({ name }) => `${name}: “Switch sides!” → press E`,
  "call.spiHoist": ({ name }) => `${name}: “Hoist the spinnaker!” → Space`,
  "call.spiDrop": ({ name }) => `${name}: “Drop it!” → Space`,
  "call.hikeOut": ({ name }) => `${name}: “Hike out! We're heeling” → D / →`,
  "call.comeIn": ({ name }) => `${name}: “In! We'll capsize to windward” → A / ←`,

  // HUD: race card, instruments, bottom panel.
  "hud.label.position": "POSITION",
  "hud.label.speed": "SPEED",
  "hud.label.vmg": "VMG TO MARK",
  "hud.label.trueWind": "TRUE WIND",
  "hud.label.heel": "HEEL",
  "hud.compass": "Wind compass",
  "hud.minimap.label": "Map of the race course",
  "hud.hint": "H: help · C: camera · T: Auto-trim · V: audio · P: pause",
  "hud.autoTrimChip": "AUTO",
  "hud.sheet.in": "◀ SHEET IN (W)",
  "hud.sheet.out": "EASE (S) ▶",
  "hud.phase.prestart": "PRE-START",
  "hud.phase.finished": "FINISHED",
  "hud.phase.ocs": "OCS — GO BACK",
  "hud.phase.racing": "RACING",
  "hud.position": ({ position, boats }) => `${ordinal(position)}/${boats}`,
  "hud.leg.ocs": "Over the line early: go back behind the line",
  "hud.leg.prestart": "Start: stay behind the line",
  "hud.leg.cross": "Cross the start line",
  "hud.leg.done": "Race finished",
  "hud.leg.sailing": ({ leg, legs, upwind, target, toPort }) =>
    `Leg ${leg}/${legs} · ${upwind ? "Upwind" : "Downwind"} → ${target}${toPort ? " · to port" : ""}`,
  "hud.twa": ({ angle, starboard }) => `${angle}° ${starboard ? "stbd" : "port"}`,
  "hud.leeway": ({ angle }) => `leeway ${angle}°`,
  "hud.shift.lift": ({ shift }) => `Shift ${shift}° · lifted on this tack`,
  "hud.shift.header": ({ shift }) => `Shift ${shift}° · headed: consider tacking`,
  "hud.chem.pair": ({ name }) => `Pair with ${name} · Chemistry`,
  "hud.chem.value": ({ value }) => `${value}/100`,
  "hud.penalty": ({ turns, done, total }) =>
    `Penalty: ${plural(turns, { one: `${turns} turn`, other: `${turns} turns` })} to do (${done}° / ${total}°) · always turn the same way`,
  "hud.gauge.tiller": "TILLER",
  "hud.gauge.left": "◀ PORT",
  "hud.gauge.right": "STARBOARD ▶",
  "hud.gauge.weight": ({ position }) => `YOUR WEIGHT · ${position.toUpperCase()}`,
  "hud.gauge.in": "◀ IN (A)",
  "hud.gauge.out": "OUT / TRAPEZE (D) ▶",
  "hud.sail.main": "MAINSAIL",
  "hud.sail.single": "SAIL TRIM",
  "hud.sail.jib": "JIB",
  "hud.sail.spinnaker": "SPINNAKER",
  "hud.partnerLine.helm": ({ name, spi }) => `${name} on the helm and mainsheet · spinnaker: ${spi}`,
  "hud.partnerLine.crew": ({ name, weight, spi }) => `${name}: ${weight} · spinnaker ${spi}`,
  "hud.partnerLine.crewOnCall": ({ name, weight, spi }) =>
    `${name}: ${weight} · spinnaker ${spi} · Space = hoist/drop`,
  // Crew weight and spinnaker state (sailing/BoatStates), worded by ui/boatStateText for the lines above and the weight gauge.
  "hud.weight.trapeze": "on the trapeze",
  "hud.weight.hiking": "hiking",
  "hud.weight.seated": "sitting in",
  "hud.weight.in": "in",
  "hud.spi.up": "up",
  "hud.spi.moving": "moving",
  "hud.spi.down": "down",
  "hud.minimap.wind": "WIND",
  "hud.tag": ({ position, name, ocs }) => `${ordinal(position)} ${name}${ocs ? " · OCS" : ""}`,

  // Sail trim state under the trim bar.
  "trim.good": "Sail trimmed ✓",
  "trim.running": "Running: sail fully eased ✓",
  "trim.luffing": "The sail is luffing — sheet in (W)",
  "trim.stalled": "Oversheeted — ease (S)",
  "trim.irons": "Head to wind! Bear away to get going",
  "trim.jibBacked": "Jib backed! Switch sides (E)",
  "trim.spiCollapsed": "The spinnaker has collapsed: sailing too high",

  // Standings list.
  "standings.dsq": "DSQ",
  "standings.penalty": "penalty",
  "standings.ocs": "OCS",
  "standings.prestart": "pre",
  "standings.start": "start",
  "standings.leg": ({ leg, legs }) => `leg ${leg}/${legs}`,

  // Results table.
  "results.title": "RESULTS",
  "results.hint": "R for another race · M for the menu",
  "results.dsq": "DSQ",
  "results.place": ({ place }) => ordinal(place),
};
