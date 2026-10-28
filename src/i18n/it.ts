/**
 * Italian catalog: the reference language. It defines every key and the parameters of each message;
 * other catalogs are typed `Catalog` (see `index.ts`) and must match it key for key.
 * Numbers that need fixed decimals or a sign arrive already formatted, as strings.
 */
import { plurals } from "./plural";

const plural = plurals("it");

export const italian = {
  // Main menu.
  "menu.lede.twoPerson": "Regata 420, in due con fiocco, spinnaker e trapezio",
  "menu.lede.single": "Regata Optimist",
  "menu.versionChip": ({ boatClass }: { boatClass: string }) => `PROTOTIPO 0.4 · ${boatClass}`,
  "menu.roleHelp.helm": "Timone e randa. Il tuo prodiere regola fiocco e spi, esce al trapezio e decide quando issare lo spi.",
  "menu.roleHelp.crew": "Il partner timona. Tu: W/S fiocco (o spi), A/D peso dentro/fuori fino al trapezio, E cambio lato dopo virate e strambate, Spazio issa/ammaina lo spi. Ascolta le sue chiamate.",
  "menu.roleHelp.fullBoat": "Timone e randa, e chiami tu le manovre: Spazio = issa/ammaina lo spi. Il prodiere esegue (più in fretta se l'intesa è alta).",
  "menu.partnerStats": ({ chemistry, technique, discipline }: { chemistry: number; technique: number; discipline: number }) =>
    `Intesa ${chemistry}/100 · tecnica ${technique} · affidabilità ${discipline}`,

  // Controls menu.
  "controls.steerHelp.tiller": "→ sposta la barra a destra e la barca gira a sinistra, come nella realtà.",
  "controls.steerHelp.boat": "→ fa girare la barca a destra (la barra va dal lato opposto da sola).",
  "controls.keyLeft.tiller": "Barra a sinistra (la barca gira a destra)",
  "controls.keyLeft.boat": "Gira a sinistra",
  "controls.keyRight.tiller": "Barra a destra (la barca gira a sinistra)",
  "controls.keyRight.boat": "Gira a destra",
  "controls.steerSummary.tiller": "Timone: muovi la barra",
  "controls.steerSummary.boat": "Timone: direzione della barca",

  // Short messages during the race.
  "toast.startSequence": "Procedura di partenza: 45 secondi",
  "toast.audioOff": "Audio disattivato",
  "toast.audioOn": "Audio attivo",
  "toast.autoTrimOn": "Regolazione vela automatica: ON",
  "toast.autoTrimOff": "Regolazione vela: manuale",
  "toast.switchSide": "Cambio lato",
  "toast.camera.chase": "Camera: inseguimento",
  "toast.camera.free": "Camera: libera (trascina col mouse)",
  "toast.camera.top": "Camera: tattica",
  "toast.spi.hoist": "Issa lo spi!",
  "toast.spi.drop": "Ammaina lo spi!",
  "toast.spi.callHoist": "Tu: «Issa!»",
  "toast.spi.callDrop": "Tu: «Ammaina!»",
  "toast.spi.partnerDecides": ({ name }: { name: string }) => `Lo spi lo decide ${name} (in "Barca completa" lo chiami tu)`,
  "toast.spi.crewDecides": `Lo spi lo decide il prodiere (in "Barca completa" lo chiami tu)`,

  // Coaching: manoeuvre feedback and hints.
  "coach.tack": "Virata!",
  "coach.gybe": "Strambata!",
  "coach.partnerTack": ({ name }: { name: string }) => `${name}: «Viro!» — cambia lato (E)`,
  "coach.partnerGybe": ({ name }: { name: string }) => `${name}: «Strambo!» — cambia lato (E)`,
  "coach.partnerReadyAbout": ({ name }: { name: string }) => `${name}: «Pronti a virare… Vira!»`,
  "coach.irons.tiller": "Sei fermo prua al vento: lasca (S) e spingi la barra per poggiare",
  "coach.irons.boat": "Sei fermo prua al vento: lasca (S) e poggia con il timone",

  // Partner calls the player (as Crew) should act on.
  "call.switchSide": ({ name }: { name: string }) => `${name}: «Cambia lato!» → premi E`,
  "call.spiHoist": ({ name }: { name: string }) => `${name}: «Issa lo spi!» → Spazio`,
  "call.spiDrop": ({ name }: { name: string }) => `${name}: «Ammaina!» → Spazio`,
  "call.hikeOut": ({ name }: { name: string }) => `${name}: «Fuori! Siamo sbandati» → D / →`,
  "call.comeIn": ({ name }: { name: string }) => `${name}: «Dentro! Ci rovesciamo sopravvento» → A / ←`,

  // HUD: race card, instruments, bottom panel.
  "hud.phase.prestart": "PRE-PARTENZA",
  "hud.phase.finished": "ARRIVATO",
  "hud.phase.ocs": "OCS — RIENTRA",
  "hud.phase.racing": "IN REGATA",
  "hud.position": ({ position, boats }: { position: number; boats: number }) => `${position}°/${boats}`,
  "hud.leg.ocs": "Partenza anticipata: torna sotto la linea",
  "hud.leg.prestart": "Partenza: resta sotto la linea",
  "hud.leg.cross": "Attraversa la linea di partenza",
  "hud.leg.done": "Regata conclusa",
  "hud.leg.sailing": ({ leg, legs, upwind, target, toPort }: { leg: number; legs: number; upwind: boolean; target: string; toPort: boolean }) =>
    `Lato ${leg}/${legs} · ${upwind ? "Bolina" : "Poppa"} → ${target}${toPort ? " · a sinistra" : ""}`,
  "hud.twa": ({ angle, starboard }: { angle: string; starboard: boolean }) => `${angle}° ${starboard ? "dx" : "sx"}`,
  "hud.leeway": ({ angle }: { angle: string }) => `scarroccio ${angle}°`,
  "hud.shift.lift": ({ shift }: { shift: string }) => `Rotazione ${shift}° · a favore su queste mure`,
  "hud.shift.header": ({ shift }: { shift: string }) => `Rotazione ${shift}° · contro: valuta la virata`,
  "hud.chem.pair": ({ name }: { name: string }) => `Equipaggio con ${name} · Intesa`,
  "hud.chem.value": ({ value }: { value: number }) => `${value}/100`,
  "hud.penalty": ({ turns, done, total }: { turns: number; done: number; total: number }) =>
    `Penalità: ${plural(turns, { one: `${turns} giro`, other: `${turns} giri` })} da fare (${done}° / ${total}°) · gira sempre nello stesso verso`,
  "hud.gauge.tiller": "BARRA DEL TIMONE",
  "hud.gauge.left": "◀ SINISTRA",
  "hud.gauge.right": "DESTRA ▶",
  "hud.gauge.weight": ({ position }: { position: string }) => `IL TUO PESO · ${position.toUpperCase()}`,
  "hud.gauge.in": "◀ DENTRO (A)",
  "hud.gauge.out": "FUORI / TRAPEZIO (D) ▶",
  "hud.sail.main": "RANDA",
  "hud.sail.single": "REGOLAZIONE VELA",
  "hud.sail.jib": "FIOCCO",
  "hud.sail.spinnaker": "SPINNAKER",
  "hud.crewLine.partnerHelms": ({ name, spi }: { name: string; spi: string }) => `${name} al timone e alla randa · spi: ${spi}`,
  "hud.crewLine.partnerCrews": ({ name, weight, spi }: { name: string; weight: string; spi: string }) => `${name}: ${weight} · spi ${spi}`,
  "hud.crewLine.partnerCrewsOnCall": ({ name, weight, spi }: { name: string; weight: string; spi: string }) =>
    `${name}: ${weight} · spi ${spi} · Spazio = issa/ammaina`,
  // Crew weight and spinnaker state, as shown in the lines above and the weight gauge.
  "hud.weight.trapeze": "al trapezio",
  "hud.weight.hiking": "in cinghia",
  "hud.weight.seated": "seduto dentro",
  "hud.weight.in": "dentro",
  "hud.spi.up": "su",
  "hud.spi.moving": "in manovra",
  "hud.spi.down": "giù",
  "hud.minimap.wind": "VENTO",
  "hud.tag": ({ position, name, ocs }: { position: number; name: string; ocs: boolean }) => `${position}° ${name}${ocs ? " · OCS" : ""}`,

  // Sail trim state under the trim bar.
  "trim.good": "Vela regolata ✓",
  "trim.running": "Poppa: vela tutta lascata ✓",
  "trim.luffing": "La vela sventa — cazza (W)",
  "trim.stalled": "Troppo cazzata — lasca (S)",
  "trim.irons": "Prua al vento! Poggia per ripartire",
  "trim.jibBacked": "Fiocco a collo! Cambia lato (E)",
  "trim.spiCollapsed": "Lo spi è crollato: troppo all'orza",

  // Standings list.
  "standings.dsq": "DSQ",
  "standings.penalty": "penalità",
  "standings.ocs": "OCS",
  "standings.prestart": "pre",
  "standings.start": "partenza",
  "standings.leg": ({ leg, legs }: { leg: number; legs: number }) => `lato ${leg}/${legs}`,

  // Results table.
  "results.dsq": "DSQ",
  "results.place": ({ place }: { place: number }) => `${place}°`,
};
