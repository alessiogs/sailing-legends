import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Matrix, Scene, Vector3,
} from "@babylonjs/core";
import { crewOnWrongSide, wantSpinnaker } from "./ai/CrewAI";
import { RacingAI } from "./ai/RacingAI";
import { AUTOPILOT_HELM, crewChemistry, RIVALS, rivalById, type SailorProfile } from "./sailors/Sailors";
import { DEFAULT_CONTROLS, Input, type ControlSettings } from "./core/Input";
import { Sound } from "./core/Sound";
import { angleDiff, DEG, lerpAngle } from "./core/math";
import { legTarget } from "./race/Course";
import type { Racer } from "./race/Race";
import type { Controls } from "./sailing/BoatPhysics";
import { crewWeight, spinnakerState } from "./sailing/BoatStates";
import { RaceSession } from "./race/RaceSession";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "./race/PlayerChoice";
import { CLASSES, isTwoPerson, type BoatClass } from "./sailing/BoatClass";
import { t, type MessageKey } from "./i18n";
import { crewWeightText, spinnakerText } from "./ui/boatStateText";
import { boatColors } from "./ui/boatColors";
import { Hud, type Panel } from "./ui/Hud";
import { fillPageText } from "./ui/pageText";
import { eventText } from "./ui/raceEventText";
import { racerName } from "./ui/raceNames";
import { Boat420View } from "./world/Boat420View";
import { boatLook, BoatView } from "./world/BoatView";
import { CourseView } from "./world/CourseView";
import { Ocean } from "./world/Ocean";
import { makeWaves, type Wave } from "./world/Waves";
import "./style.css";

// The page's static text first: the code below overwrites some of it, and the loading screen hides the menus until then.
fillPageText();

// ---------- Engine & scene ----------
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const engine = new Engine(canvas, true, { stencil: false, antialias: true, powerPreference: "high-performance" });
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.72, 0.83, 0.9, 1);
scene.skipPointerMovePicking = true;

const camera = new ArcRotateCamera("cam", -Math.PI / 2, 1.18, 12, Vector3.Zero(), scene);
camera.lowerRadiusLimit = 5;
camera.upperRadiusLimit = 120;
camera.lowerBetaLimit = 0.08;
camera.upperBetaLimit = 1.45;
camera.wheelPrecision = 30;
camera.panningSensibility = 0;
camera.minZ = 0.1;
camera.maxZ = 3000;
camera.attachControl(canvas, true);
camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

const hemi = new HemisphericLight("sky", new Vector3(0.1, 1, -0.2), scene);
hemi.intensity = 0.75;
hemi.groundColor = new Color3(0.25, 0.35, 0.42);
const sun = new DirectionalLight("sun", new Vector3(0.45, -0.42, -0.78), scene);
sun.intensity = 1.05;
sun.diffuse = new Color3(1, 0.96, 0.88);

// ---------- Game state ----------
/** Help the game gives by doing a secondary task for the player; each can be switched off. */
type Assists = {
  /** Auto-trim: the player's sail trim is set automatically. */
  autoTrim: boolean;
};

type Mode = "menu" | "racing" | "paused" | "results" | "controls";
let controlsReturn: Mode = "menu";
let mode: Mode = "menu";
let session: RaceSession;
let boats = new Map<string, BoatView | Boat420View>();
let courseView: CourseView | null = null;
let ocean: Ocean | null = null;
let waves: Wave[] = [];
let time = 0;
let windKn = 11;
/** The Assists the player has switched on. */
const assists: Assists = { autoTrim: false };
let boatClass: BoatClass = CLASSES.optimist;
let choice: PlayerChoice = HELM;
let partner: SailorProfile = RIVALS[1];
let camMode: "chase" | "free" | "top" = "chase";
let lastBoomSide = 1;
let ironsHintShown = false;
/** Debug autopilot for the player boat (window.__game.autopilot = true), used by automated tests. */
let autopilot: RacingAI | null = null;
const input = new Input();
const hud = new Hud();
const sound = new Sound();
let lastClock = 0;

// Per-viewer preferences (best effort: storage may be unavailable).
const prefs = (() => {
  try { return JSON.parse(localStorage.getItem("sl-prefs") || "{}") as { controls?: Partial<ControlSettings>; muted?: boolean }; } catch { return {}; }
})();
function savePrefs() {
  try { localStorage.setItem("sl-prefs", JSON.stringify({ controls: input.settings, muted: sound.muted })); } catch { /* ignore */ }
}
{
  const c = prefs.controls ?? {};
  input.settings = {
    steering: c.steering === "boat" ? "boat" : "tiller",
    autoCenter: c.autoCenter !== false,
    tillerSpeed: typeof c.tillerSpeed === "number" ? c.tillerSpeed : 1,
    sheetSpeed: typeof c.sheetSpeed === "number" ? c.sheetSpeed : 1,
  };
}
sound.muted = !!prefs.muted;

const $ = (id: string) => document.getElementById(id)!;
const menuEl = $("menu"), pauseEl = $("pause"), resultsEl = $("results"), controlsEl = $("controls");
const autoTrimEl = $("auto-trim-opt") as HTMLInputElement;

function newRace() {
  for (const b of boats.values()) b.dispose();
  boats.clear();
  courseView?.dispose();
  hud.clearTags();
  const seed = Math.floor(Math.random() * 1e6);
  session = new RaceSession({ seed, windKn, boatClass: boatClass, choice, partner });
  input.role = isTwoPerson(boatClass) ? choice.role : "helm";
  crewSheets = { jib: 0.5, spi: 0.5 };
  wasTacking = false;
  waves = makeWaves(session.wind.meanDir, windKn);
  if (!ocean) ocean = new Ocean(scene, waves);
  else ocean.setWaves(waves);
  courseView = new CourseView(scene, session.race.course);
  for (const r of session.race.racers) {
    const look = boatLook(boatColors(r.id));
    boats.set(r.id, isTwoPerson(r.sim.cls) ? new Boat420View(scene, r.id, look) : new BoatView(scene, r.id, look));
  }
  input.reset();
  lastBoomSide = 0;
  lastClock = session.race.clock;
  ironsHintShown = false;
  // Put the camera behind the player.
  const s = session.player!.sim.state;
  camera.target.set(s.x, 0.8, s.z);
  camera.alpha = Math.atan2(-Math.cos(s.heading), -Math.sin(s.heading));
  camera.beta = 1.18;
  camera.radius = chaseRadius();
  hud.show(true);
  hud.toast(t("toast.startSequence"), "big");
}

function setMode(m: Mode) {
  mode = m;
  menuEl.classList.toggle("hidden", m !== "menu");
  pauseEl.classList.toggle("hidden", m !== "paused");
  resultsEl.classList.toggle("hidden", m !== "results");
  controlsEl.classList.toggle("hidden", m !== "controls");
}

function startFromMenu() {
  sound.init();
  assists.autoTrim = autoTrimEl.checked;
  newRace();
  setMode("racing");
}

$("start-btn").addEventListener("click", startFromMenu);
// ---------- Commands menu ----------
function syncControls() {
  const st = input.settings;
  const mark = (id: string, v: string) => {
    for (const o of Array.from(document.querySelectorAll<HTMLButtonElement>(`#${id} button`))) o.classList.toggle("on", o.dataset.v === v);
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
const bindSeg = (id: string, apply: (v: string) => void) => {
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>(`#${id} button`))) {
    b.addEventListener("click", () => { apply(b.dataset.v!); input.tiller = 0; syncControls(); savePrefs(); });
  }
};
bindSeg("steer-opt", v => { input.settings.steering = v === "boat" ? "boat" : "tiller"; });
bindSeg("center-opt", v => { input.settings.autoCenter = v === "1"; });
bindSeg("tspeed-opt", v => { input.settings.tillerSpeed = Number(v); });
bindSeg("sspeed-opt", v => { input.settings.sheetSpeed = Number(v); });
function openControls() {
  if (mode === "controls") return;
  controlsReturn = mode === "racing" ? "paused" : mode;
  setMode("controls");
}
function closeControls() { setMode(controlsReturn); }
$("open-controls").addEventListener("click", openControls);
$("pause-controls").addEventListener("click", openControls);
$("controls-back").addEventListener("click", closeControls);
$("controls-reset").addEventListener("click", () => { input.settings = { ...DEFAULT_CONTROLS }; syncControls(); savePrefs(); });
$("resume-btn").addEventListener("click", () => setMode("racing"));
$("pause-menu").addEventListener("click", () => setMode("menu"));
syncControls();
// ---------- Boat, Role and Partner choice ----------
/** The three Role buttons (`data-v`), each a Role and Control mode, with its help text. */
const ROLE_OPTIONS = {
  helm: { choice: HELM, help: "menu.roleHelp.helm" },
  crew: { choice: CREW, help: "menu.roleHelp.crew" },
  fullBoat: { choice: FULL_BOAT, help: "menu.roleHelp.fullBoat" },
} as const satisfies Record<string, { choice: PlayerChoice; help: MessageKey }>;
type RoleOption = keyof typeof ROLE_OPTIONS;
const roleOption = (c: PlayerChoice): RoleOption => c.role === "crew" ? "crew" : c.control === "fullBoat" ? "fullBoat" : "helm";
function syncBoatMenu() {
  const two = isTwoPerson(boatClass);
  for (const o of Array.from(document.querySelectorAll<HTMLButtonElement>("#class-opt button"))) o.classList.toggle("on", o.dataset.v === boatClass.id);
  for (const o of Array.from(document.querySelectorAll<HTMLButtonElement>("#role-opt button"))) o.classList.toggle("on", o.dataset.v === roleOption(choice));
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
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#partner-opt button"))) {
    b.addEventListener("click", () => { partner = rivalById(b.dataset.v!) ?? partner; syncBoatMenu(); });
  }
}
for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#class-opt button"))) {
  b.addEventListener("click", () => { boatClass = CLASSES[b.dataset.v!] ?? CLASSES.optimist; syncBoatMenu(); });
}
for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#role-opt button"))) {
  b.addEventListener("click", () => { choice = ROLE_OPTIONS[b.dataset.v as RoleOption].choice; syncBoatMenu(); });
}
syncBoatMenu();

for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#wind-opt button"))) {
  b.addEventListener("click", () => {
    windKn = Number(b.dataset.v);
    for (const o of Array.from(document.querySelectorAll("#wind-opt button"))) o.classList.toggle("on", o === b);
  });
}

function showResults() {
  const rows = session.race.standings().map((r, i) => {
    const time = r.dsq ? t("results.dsq") : r.finishTime !== null ? `${Math.floor(r.finishTime / 60)}:${String(Math.floor(r.finishTime % 60)).padStart(2, "0")}` : "—";
    return `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.dsq ? "–" : t("results.place", { place: i + 1 })}</td><td>${racerName(r)}</td><td>${time}</td></tr>`;
  }).join("");
  $("results-table").innerHTML = rows;
  setMode("results");
}

function handleActions() {
  for (const a of input.consume()) {
    if (a === "mute") {
      sound.init();
      sound.setMuted(!sound.muted);
      savePrefs();
      hud.toast(sound.muted ? t("toast.audioOff") : t("toast.audioOn"));
      continue;
    }
    if (a === "controls") { if (mode === "controls") closeControls(); else openControls(); continue; }
    if (mode === "controls") {
      if (a === "pause") closeControls();
      continue;
    }
    if (mode === "menu") {
      if (a === "start") startFromMenu();
      continue;
    }
    if (a === "pause") setMode(mode === "paused" ? "racing" : mode === "racing" ? "paused" : mode);
    if (a === "restart") { newRace(); setMode("racing"); }
    if (a === "menu" || a === "help") { setMode("menu"); }
    if (a === "autoTrim" && mode === "racing") {
      assists.autoTrim = !assists.autoTrim;
      autoTrimEl.checked = assists.autoTrim;
      if (!assists.autoTrim) input.sheet = input.role === "crew" ? activeCrewSheet() : session.player!.sim.state.sheet;
      hud.toast(assists.autoTrim ? t("toast.autoTrimOn") : t("toast.autoTrimOff"));
    }
    if (a === "spi" && mode === "racing") callSpinnaker();
    if (a === "switch" && mode === "racing" && input.role === "crew") {
      session.playerControls.switchSide = true;
      hud.toast(t("toast.switchSide"));
    }
    if (a === "camera") {
      camMode = camMode === "chase" ? "free" : camMode === "free" ? "top" : "chase";
      hud.toast(t(`toast.camera.${camMode}`));
      if (camMode === "chase") { camera.beta = 1.18; camera.radius = chaseRadius(); }
      if (camMode === "top") { camera.beta = 0.12; camera.radius = isTwoPerson(boatClass) ? 70 : 48; }
    }
  }
}

function updateCamera(dt: number) {
  const s = session.player!.sim.state;
  const far = Math.hypot(s.x - camera.target.x, s.z - camera.target.z) > 25;
  const k = far ? 1 : Math.min(1, dt * 3);
  camera.target.x += (s.x - camera.target.x) * k;
  camera.target.z += (s.z - camera.target.z) * k;
  camera.target.y = isTwoPerson(boatClass) ? 1.6 : 0.9;
  if (camMode === "chase") {
    const behind = Math.atan2(-Math.cos(s.heading), -Math.sin(s.heading));
    camera.alpha = far ? behind : lerpAngle(camera.alpha, behind, Math.min(1, dt * 1.6));
  } else if (camMode === "top") {
    // North-up tactical view (wind from the top of the screen).
    camera.alpha = lerpAngle(camera.alpha, -Math.PI / 2, Math.min(1, dt * 2));
  }
}

function processEvents() {
  const clock = session.race.clock;
  // Countdown signals: beeps in the last 5 seconds and at -30/-10, horn at the gun.
  for (const t of [-30, -10, -5, -4, -3, -2, -1]) if (lastClock < t && clock >= t) sound.beep();
  lastClock = clock;
  for (const e of session.race.drainEvents()) {
    if (e.kind === "gun") sound.horn(1.2);
    if (e.kind === "ocs" && e.racer.isPlayer) sound.horn(0.5);
    // One bump per contact involving the player: on the at-fault boat's event (each boat gets one).
    if (e.kind === "contact" && (e.racer.isPlayer || e.other.isPlayer) && e.atFault === e.racer) sound.bump();
    if (!e.racer.isPlayer) continue;
    if (e.kind === "rounded") sound.chime();
    if (e.kind === "penalty") sound.buzzer();
    if (e.kind === "finish") { sound.horn(0.6); setTimeout(() => sound.horn(0.6), 700); }
    const kind = e.kind === "ocs" || e.kind === "penalty" ? "bad"
      : e.kind === "gun" || e.kind === "finish" ? "big"
      : e.kind === "rounded" || e.kind === "ocs-cleared" || e.kind === "penalty-done" ? "good" : "";
    hud.toast(eventText(e), kind);
    if (e.kind === "finish") setTimeout(() => { if (mode === "racing") showResults(); }, 2500);
  }
  if (session.race.phase === "done" && mode === "racing" && session.player!.finishTime === null) showResults();
}

function playerCoaching() {
  const p = session.player!;
  const s = p.sim.state, tel = p.sim.telemetry;
  if (lastBoomSide === 0) lastBoomSide = s.boomSide;
  if (s.boomSide !== lastBoomSide) {
    const gybe = Math.abs(tel.awa) > 90 * DEG;
    // When the Partner is the Helm, the call comes from them (the player, as Crew, must react).
    if (session.partnerHelm) hud.toast(t(gybe ? "coach.partnerGybe" : "coach.partnerTack", { name: session.partner!.name }), "bad");
    else hud.toast(gybe ? t("coach.gybe") : t("coach.tack"));
    lastBoomSide = s.boomSide;
  }
  if (session.partnerHelm) {
    const tacking = session.partnerHelm.tacking;
    if (tacking && !wasTacking) { hud.toast(t("coach.partnerReadyAbout", { name: session.partner!.name })); sound.beep(); }
    wasTacking = tacking;
  }
  if (!ironsHintShown && tel.trimState === "irons" && Math.abs(tel.speed) < 0.3 && session.race.clock > -40) {
    ironsHintShown = true;
    hud.toast(input.steering === "tiller" ? t("coach.irons.tiller") : t("coach.irons.boat"), "bad");
  }
}

// ---------- Player on board ----------
let crewSheets = { jib: 0.5, spi: 0.5 };
let activeSail: "jib" | "spi" = "jib";
let wasTacking = false;

function chaseRadius() { return isTwoPerson(boatClass) ? 17 : 12; }

function activeCrewSheet() {
  return activeSail === "spi" ? crewSheets.spi : crewSheets.jib;
}

/** Space: hoist/drop the spinnaker (Crew), or call for it (Full Boat Control). */
function callSpinnaker() {
  if (!boatClass.spinnaker) return;
  const pc = session.playerControls;
  if (choice.role === "crew") {
    pc.spi = !pc.spi;
    hud.toast(pc.spi ? t("toast.spi.hoist") : t("toast.spi.drop"));
  } else if (choice.control === "fullBoat" && session.partnerCrew) {
    session.partnerCrew.spiCommand = !session.partnerCrew.spiCommand;
    hud.toast(session.partnerCrew.spiCommand ? t("toast.spi.callHoist") : t("toast.spi.callDrop"));
  } else {
    hud.toast(session.partner ? t("toast.spi.partnerDecides", { name: session.partner.name }) : t("toast.spi.crewDecides"));
  }
}

function applyPlayerControls(dt: number, p: Racer) {
  const pc = session.playerControls;
  const tel = p.sim.telemetry;
  if ((window as any).__game?.autopilot) {
    if (!autopilot || autopilot.racer !== p) autopilot = new RacingAI(p, AUTOPILOT_HELM, session.race, 99, 3);
    const c = autopilot.update(dt, session.wind);
    if (!session.partnerHelm) { pc.rudder = c.rudder; pc.sheet = c.sheet; }
    if (input.role === "crew") autopilotCrew(pc, p);
    return;
  }
  if (input.role === "crew") {
    // The Partner is the Helm (RaceSession fills rudder and mainsheet). We trim and move.
    const nowSail: "jib" | "spi" = p.sim.state.spiHoist > 0.5 ? "spi" : "jib";
    if (nowSail !== activeSail) { activeSail = nowSail; input.sheet = activeCrewSheet(); }
    if (assists.autoTrim) input.sheet = activeSail === "spi" ? tel.spi!.optimal : tel.jib!.optimal;
    crewSheets[activeSail] = input.sheet;
    pc.jibSheet = crewSheets.jib;
    pc.spiSheet = crewSheets.spi;
    pc.crewOut = input.crewOut;
    return;
  }
  pc.rudder = input.rudder;
  if (assists.autoTrim) {
    input.sheet = tel.optimalSheet;
  }
  pc.sheet = input.sheet;
}

/** Test helper: perfect Crew work for the autopilot. */
function autopilotCrew(pc: Controls, p: Racer) {
  const tel = p.sim.telemetry;
  pc.jibSheet = tel.jib?.optimal; pc.spiSheet = tel.spi?.optimal; pc.crewOut = tel.crew?.ideal;
  pc.spi = wantSpinnaker(session.race, p);
  if (crewOnWrongSide(p.sim)) pc.switchSide = true;
}

function buildPanel(p: Racer): Panel {
  const s = p.sim.state, tel = p.sim.telemetry;
  const two = isTwoPerson(boatClass);
  const name = session.partner?.name ?? "";
  const chem = two && session.partner ? { name, value: crewChemistry(session.partner) } : null;
  if (input.role === "crew") {
    const spiUp = s.spiHoist > 0.5;
    const sailTel = spiUp ? tel.spi! : tel.jib!;
    const sheet = spiUp ? s.spiSheet : s.jibSheet;
    // Calls from the Partner (the Helm), most urgent first.
    let call: string | null = null;
    const ideal = tel.crew!.ideal;
    if (crewOnWrongSide(p.sim)) call = t("call.switchSide", { name });
    else if (session.race.phase !== "prestart" && wantSpinnaker(session.race, p) !== !!session.playerControls.spi)
      call = session.playerControls.spi ? t("call.spiDrop", { name }) : t("call.spiHoist", { name });
    else if (tel.crew!.balance > 60) call = t("call.hikeOut", { name });
    else if (s.crewOut - ideal > 0.25 && tel.crew!.balance < -20) call = t("call.comeIn", { name });
    const where = crewWeightText(crewWeight(s.crewOut), "own");
    const spi = spinnakerText(spinnakerState(s.spiHoist));
    return {
      gauge: { label: t("hud.gauge.weight", { position: where }), value: s.crewOut, centered: false, ideal, ends: [t("hud.gauge.in"), t("hud.gauge.out")] },
      sail: { label: spiUp ? t("hud.sail.spinnaker") : t("hud.sail.jib"), sheet, optimal: sailTel.optimal, state: sailTel.trimState, autoTrim: assists.autoTrim,
        text: tel.jib!.backed && !spiUp ? t("trim.jibBacked") : spiUp && tel.spi!.collapsed ? t("trim.spiCollapsed") : undefined },
      call, partnerLine: t("hud.partnerLine.helm", { name, spi }), chem,
    };
  }
  const tillerGauge = { label: t("hud.gauge.tiller"), value: input.tiller, centered: true, ends: [t("hud.gauge.left"), t("hud.gauge.right")] as [string, string] };
  const sail = { label: two ? t("hud.sail.main") : t("hud.sail.single"), sheet: s.sheet, optimal: tel.optimalSheet, state: tel.trimState, autoTrim: assists.autoTrim };
  let partnerLine: string | null = null;
  if (two) {
    const weight = crewWeightText(crewWeight(s.crewOut), "partner");
    const spi = spinnakerText(spinnakerState(s.spiHoist));
    partnerLine = t(choice.control === "fullBoat" ? "hud.partnerLine.crewOnCall" : "hud.partnerLine.crew", { name, weight, spi });
  }
  return { gauge: tillerGauge, sail, call: null, partnerLine, chem };
}

// ---------- Main loop ----------
let fpsAcc = 0, fpsFrames = 0;
const projMat = new Matrix();
const tmp = new Vector3();
engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 1) { (window as any).__fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }

  input.update(dt);
  handleActions();

  if (session) {
    if (mode === "racing") {
      time += dt;
      const p = session.player!;
      applyPlayerControls(dt, p);
      session.advance(dt);
      processEvents();
      playerCoaching();
    }
    for (const r of session.race.racers) boats.get(r.id)!.update(mode === "racing" ? dt : 0, time, r.sim.state, r.sim.telemetry, waves);
    const p = session.player!;
    const leg = p.leg >= 0 && p.leg < session.race.course.legs.length ? session.race.course.legs[p.leg] : null;
    courseView!.setTarget(p.finishTime !== null ? null : leg ? legTarget(leg) : null);
    courseView!.update(time, waves, p.leg < 0, !!leg && leg.kind === "finish");
    updateCamera(dt);
    ocean!.update(time, camera, session.wind);
    hud.update(dt, session.race, p, session.wind, buildPanel(p));
    const tel = p.sim.telemetry;
    const luff = tel.trimState === "luffing" || tel.trimState === "irons" ? Math.max(0.3, 1 - tel.aoa / (6 * DEG)) : 0;
    sound.update(dt, tel.aws, tel.speed, mode === "racing" ? luff : 0, mode === "racing");
    scene.render();
    projMat.copyFrom(scene.getTransformMatrix());
    const vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const scale = canvas.clientWidth / engine.getRenderWidth();
    hud.updateTags(session.race, p, (x, y, z) => {
      tmp.set(x, y, z);
      const toCam = tmp.subtract(camera.globalPosition);
      const fwd = camera.getForwardRay().direction;
      if (Vector3.Dot(toCam, fwd) <= 0) return null;
      const v = Vector3.Project(tmp, Matrix.IdentityReadOnly, projMat, vp);
      return { x: v.x * scale, y: v.y * scale };
    });
  } else {
    scene.render();
  }
});

// Menu background: show the course with AI boats idling until the player starts.
newRace();
hud.show(false);
setMode("menu");

window.addEventListener("resize", () => engine.resize());
setTimeout(() => $("loading").classList.add("hidden"), 300);

// Debug/testing hook (used by automated browser tests).
(window as any).__game = {
  get session() { return session; }, input, get mode() { return mode; },
  start: startFromMenu, angleDiff,
  autopilot: false,
  fastForward(seconds: number) {
    for (let i = 0; i < seconds * 60; i++) {
      if (this.autopilot && autopilot) Object.assign(session.playerControls, autopilot.update(1 / 60, session.wind));
      session.step(1 / 60);
    }
  },
};
