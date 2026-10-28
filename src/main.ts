import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Matrix, Scene, Vector3,
} from "@babylonjs/core";
import { chemistry, wantSpinnaker } from "./ai/CrewAI";
import { RacingAI, RIVALS, type SailorProfile } from "./ai/RacingAI";
import { DEFAULT_CONTROLS, Input, type ControlSettings } from "./core/Input";
import { Sound } from "./core/Sound";
import { angleDiff, DEG, lerpAngle } from "./core/math";
import { legTarget } from "./race/Course";
import type { Racer } from "./race/Race";
import type { Controls } from "./sailing/BoatPhysics";
import { RaceSession, type PlayerRole } from "./race/RaceSession";
import { CLASSES, type BoatClass } from "./sailing/BoatClass";
import { Hud, type Panel } from "./ui/Hud";
import { Boat420View } from "./world/Boat420View";
import { BoatView, type BoatLook } from "./world/BoatView";
import { CourseView } from "./world/CourseView";
import { Ocean } from "./world/Ocean";
import { makeWaves, type Wave } from "./world/Waves";
import "./style.css";

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
const LOOKS: Record<string, BoatLook> = {
  player: { hull: new Color3(0.95, 0.96, 0.95), sail: new Color3(0.98, 0.98, 0.96), jacket: new Color3(0.95, 0.35, 0.12), stripe: new Color3(0.85, 0.12, 0.12) },
  ai0: { hull: new Color3(0.2, 0.45, 0.85), sail: new Color3(0.93, 0.95, 0.98), jacket: new Color3(0.2, 0.3, 0.8), stripe: new Color3(0.95, 0.95, 0.95) },
  ai1: { hull: new Color3(0.98, 0.83, 0.25), sail: new Color3(0.98, 0.96, 0.86), jacket: new Color3(0.95, 0.75, 0.1), stripe: new Color3(0.15, 0.15, 0.2) },
  ai2: { hull: new Color3(0.86, 0.22, 0.18), sail: new Color3(0.98, 0.93, 0.92), jacket: new Color3(0.8, 0.12, 0.12), stripe: new Color3(0.95, 0.95, 0.95) },
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
let autoTrim = false;
let boatClass: BoatClass = CLASSES.optimist;
let role: PlayerRole = "skipper";
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
const assistEl = $("assist") as HTMLInputElement;

function newRace() {
  for (const b of boats.values()) b.dispose();
  boats.clear();
  courseView?.dispose();
  hud.clearTags();
  const seed = Math.floor(Math.random() * 1e6);
  session = new RaceSession({ seed, windKn, boatClass: boatClass, role, partner });
  input.station = boatClass.crew && role === "crew" ? "crew" : "helm";
  crewSheets = { jib: 0.5, spi: 0.5 };
  wasTacking = false;
  waves = makeWaves(session.wind.meanDir, windKn);
  if (!ocean) ocean = new Ocean(scene, waves);
  else ocean.setWaves(waves);
  courseView = new CourseView(scene, session.race.course);
  for (const r of session.race.racers) {
    const look = LOOKS[r.id] ?? LOOKS.ai0;
    boats.set(r.id, r.sim.cls.crew ? new Boat420View(scene, r.id, look) : new BoatView(scene, r.id, look));
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
  hud.toast("Procedura di partenza: 45 secondi", "big");
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
  autoTrim = assistEl.checked;
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
  $("steer-help").textContent = tiller
    ? "→ sposta la barra a destra e la barca gira a sinistra, come nella realtà."
    : "→ fa girare la barca a destra (la barra va dal lato opposto da sola).";
  $("key-left-label").textContent = tiller ? "Barra a sinistra (la barca gira a destra)" : "Gira a sinistra";
  $("key-right-label").textContent = tiller ? "Barra a destra (la barca gira a sinistra)" : "Gira a destra";
  $("steer-summary").textContent = tiller ? "Timone: muovi la barra" : "Timone: direzione della barca";
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
// ---------- Boat, role and partner choice ----------
const ROLE_HELP: Record<PlayerRole, string> = {
  skipper: "Timone e randa. Il tuo prodiere regola fiocco e spi, esce al trapezio e decide quando issare lo spi.",
  crew: "Il partner timona. Tu: W/S fiocco (o spi), A/D peso dentro/fuori fino al trapezio, E cambio lato dopo virate e strambate, Spazio issa/ammaina lo spi. Ascolta le sue chiamate.",
  full: "Timone e randa, e chiami tu le manovre: Spazio = issa/ammaina lo spi. Il prodiere esegue (più in fretta se l'intesa è alta).",
};
function syncBoatMenu() {
  const two = !!boatClass.crew;
  for (const o of Array.from(document.querySelectorAll<HTMLButtonElement>("#class-opt button"))) o.classList.toggle("on", o.dataset.v === boatClass.id);
  for (const o of Array.from(document.querySelectorAll<HTMLButtonElement>("#role-opt button"))) o.classList.toggle("on", o.dataset.v === role);
  $("crew-block").classList.toggle("hidden", !two);
  $("lede-class").textContent = two ? "Regata 420, in due con fiocco, spinnaker e trapezio" : "Regata Optimist";
  $("version-chip").textContent = `PROTOTIPO 0.4 · ${boatClass.name.toUpperCase()}`;
  $("role-help").textContent = ROLE_HELP[role];
  $("partner-opt").innerHTML = RIVALS.map(r => {
    const c = chemistry(r);
    return `<button data-v="${r.name}" class="partner${r.name === partner.name ? " on" : ""}">
      <b>${r.name}</b><span class="meter"><i style="width:${c}%"></i></span>
      <small>Intesa ${c}/100 · tecnica ${Math.round(r.technique * 100)} · affidabilità ${Math.round(r.discipline * 100)}</small></button>`;
  }).join("");
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#partner-opt button"))) {
    b.addEventListener("click", () => { partner = RIVALS.find(r => r.name === b.dataset.v) ?? partner; syncBoatMenu(); });
  }
}
for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#class-opt button"))) {
  b.addEventListener("click", () => { boatClass = CLASSES[b.dataset.v!] ?? CLASSES.optimist; syncBoatMenu(); });
}
for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#role-opt button"))) {
  b.addEventListener("click", () => { role = b.dataset.v as PlayerRole; syncBoatMenu(); });
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
    const t = r.dsq ? "DSQ" : r.finishTime !== null ? `${Math.floor(r.finishTime / 60)}:${String(Math.floor(r.finishTime % 60)).padStart(2, "0")}` : "—";
    return `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.dsq ? "–" : `${i + 1}°`}</td><td>${r.name}</td><td>${t}</td></tr>`;
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
      hud.toast(sound.muted ? "Audio disattivato" : "Audio attivo");
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
    if (a === "autotrim" && mode === "racing") {
      autoTrim = !autoTrim;
      assistEl.checked = autoTrim;
      if (!autoTrim) input.sheet = input.station === "crew" ? activeCrewSheet() : session.player!.sim.state.sheet;
      hud.toast(autoTrim ? "Regolazione vela automatica: ON" : "Regolazione vela: manuale");
    }
    if (a === "spi" && mode === "racing") callSpinnaker();
    if (a === "switch" && mode === "racing" && input.station === "crew") {
      session.playerControls.switchSide = true;
      hud.toast("Cambio lato");
    }
    if (a === "camera") {
      camMode = camMode === "chase" ? "free" : camMode === "free" ? "top" : "chase";
      hud.toast(camMode === "chase" ? "Camera: inseguimento" : camMode === "free" ? "Camera: libera (trascina col mouse)" : "Camera: tattica");
      if (camMode === "chase") { camera.beta = 1.18; camera.radius = chaseRadius(); }
      if (camMode === "top") { camera.beta = 0.12; camera.radius = boatClass.crew ? 70 : 48; }
    }
  }
}

function updateCamera(dt: number) {
  const s = session.player!.sim.state;
  const far = Math.hypot(s.x - camera.target.x, s.z - camera.target.z) > 25;
  const k = far ? 1 : Math.min(1, dt * 3);
  camera.target.x += (s.x - camera.target.x) * k;
  camera.target.z += (s.z - camera.target.z) * k;
  camera.target.y = boatClass.crew ? 1.6 : 0.9;
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
    if (e.kind === "contact" && (e.racer.isPlayer || e.other?.isPlayer) && e.text.startsWith("Contatto")) sound.bump();
    if (!e.racer.isPlayer) continue;
    if (e.kind === "rounded") sound.chime();
    if (e.kind === "penalty") sound.buzzer();
    if (e.kind === "finish") { sound.horn(0.6); setTimeout(() => sound.horn(0.6), 700); }
    const kind = e.kind === "ocs" || e.kind === "penalty" ? "bad"
      : e.kind === "gun" || e.kind === "finish" ? "big"
      : e.kind === "rounded" || e.kind === "ocs-cleared" || e.kind === "penalty-done" ? "good" : "";
    hud.toast(e.text, kind);
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
    // When the partner helms, the call comes from them (the crew must react).
    if (session.partnerHelm) hud.toast(`${session.partner!.name}: «${gybe ? "Strambo!" : "Viro!"}» — cambia lato (E)`, "bad");
    else hud.toast(gybe ? "Strambata!" : "Virata!");
    lastBoomSide = s.boomSide;
  }
  if (session.partnerHelm) {
    const t = session.partnerHelm.tacking;
    if (t && !wasTacking) { hud.toast(`${session.partner!.name}: «Pronti a virare… Vira!»`); sound.beep(); }
    wasTacking = t;
  }
  if (!ironsHintShown && tel.trimState === "irons" && Math.abs(tel.speed) < 0.3 && session.race.clock > -40) {
    ironsHintShown = true;
    hud.toast(input.steering === "tiller"
      ? "Sei fermo prua al vento: lasca (S) e spingi la barra per poggiare"
      : "Sei fermo prua al vento: lasca (S) e poggia con il timone", "bad");
  }
}

// ---------- Player on board ----------
let crewSheets = { jib: 0.5, spi: 0.5 };
let activeSail: "jib" | "spi" = "jib";
let wasTacking = false;

function chaseRadius() { return boatClass.crew ? 17 : 12; }

function activeCrewSheet() {
  return activeSail === "spi" ? crewSheets.spi : crewSheets.jib;
}

/** Space: hoist/drop the spinnaker (crew), or call for it (full boat). */
function callSpinnaker() {
  if (!boatClass.spinnaker) return;
  const pc = session.playerControls;
  if (role === "crew") {
    pc.spi = !pc.spi;
    hud.toast(pc.spi ? "Issa lo spi!" : "Ammaina lo spi!");
  } else if (role === "full" && session.partnerCrew) {
    session.partnerCrew.spiCommand = !session.partnerCrew.spiCommand;
    hud.toast(`Tu: «${session.partnerCrew.spiCommand ? "Issa!" : "Ammaina!"}»`);
  } else {
    hud.toast(`Lo spi lo decide ${session.partner?.name ?? "il prodiere"} (in "Barca completa" lo chiami tu)`);
  }
}

function applyPlayerControls(dt: number, p: Racer) {
  const pc = session.playerControls;
  const tel = p.sim.telemetry;
  if ((window as any).__game?.autopilot) {
    if (!autopilot || autopilot.racer !== p) autopilot = new RacingAI(p, { name: "Auto", technique: 0.95, tactics: 0.9, speed: 0.9, discipline: 0.9 }, session.race, 99, 3);
    const c = autopilot.update(dt, session.wind);
    if (!session.partnerHelm) { pc.rudder = c.rudder; pc.sheet = c.sheet; }
    if (input.station === "crew") autoCrew(pc, p);
    return;
  }
  if (input.station === "crew") {
    // The partner helms (RaceSession fills rudder and mainsheet). We trim and move.
    const nowSail: "jib" | "spi" = p.sim.state.spiHoist > 0.5 ? "spi" : "jib";
    if (nowSail !== activeSail) { activeSail = nowSail; input.sheet = activeCrewSheet(); }
    if (autoTrim) input.sheet = activeSail === "spi" ? tel.spi!.optimal : tel.jib!.optimal;
    crewSheets[activeSail] = input.sheet;
    pc.jibSheet = crewSheets.jib;
    pc.spiSheet = crewSheets.spi;
    pc.crewOut = input.crewOut;
    return;
  }
  pc.rudder = input.rudder;
  if (autoTrim) {
    input.sheet = tel.optimalSheet;
  }
  pc.sheet = input.sheet;
}

/** Test helper: perfect crew work for the autopilot. */
function autoCrew(pc: Controls, p: Racer) {
  const t = p.sim.telemetry;
  pc.jibSheet = t.jib?.optimal; pc.spiSheet = t.spi?.optimal; pc.crewOut = t.crew?.ideal;
  pc.spi = wantSpinnaker(session.race, p);
  if (t.jib?.backed || !t.crew?.onWindward) pc.switchSide = Math.abs(t.awa) > 22 * DEG;
}

function buildPanel(p: Racer): Panel {
  const s = p.sim.state, tel = p.sim.telemetry;
  const two = !!boatClass.crew;
  const partnerName = session.partner?.name ?? "";
  const chem = two && session.partner ? { name: partnerName, value: chemistry(session.partner) } : null;
  if (input.station === "crew") {
    const spiUp = s.spiHoist > 0.5;
    const sailTel = spiUp ? tel.spi! : tel.jib!;
    const sheet = spiUp ? s.spiSheet : s.jibSheet;
    // Calls from the helm, most urgent first.
    let call: string | null = null;
    const wrongSide = tel.jib!.backed || !tel.crew!.onWindward || (s.spiHoist > 0.3 && tel.spi!.wrongSide);
    const ideal = tel.crew!.ideal;
    if (wrongSide && Math.abs(tel.awa) > 22 * DEG) call = `${partnerName}: «Cambia lato!» → premi E`;
    else if (session.race.phase !== "prestart" && wantSpinnaker(session.race, p) !== !!session.playerControls.spi)
      call = `${partnerName}: «${session.playerControls.spi ? "Ammaina!" : "Issa lo spi!"}» → Spazio`;
    else if (tel.crew!.balance > 60) call = `${partnerName}: «Fuori! Siamo sbandati» → D / →`;
    else if (s.crewOut - ideal > 0.25 && tel.crew!.balance < -20) call = `${partnerName}: «Dentro! Ci rovesciamo sopravvento» → A / ←`;
    const where = s.crewOut > 0.75 ? "al trapezio" : s.crewOut > 0.3 ? "in cinghia" : "seduto dentro";
    return {
      gauge: { label: `IL TUO PESO · ${where.toUpperCase()}`, value: s.crewOut, centered: false, ideal, ends: ["◀ DENTRO (A)", "FUORI / TRAPEZIO (D) ▶"] },
      sail: { label: spiUp ? "SPINNAKER" : "FIOCCO", sheet, optimal: sailTel.optimal, state: sailTel.trimState, auto: autoTrim,
        text: tel.jib!.backed && !spiUp ? "Fiocco a collo! Cambia lato (E)" : spiUp && tel.spi!.collapsed ? "Lo spi è crollato: troppo all'orza" : undefined },
      call, crewLine: `${partnerName} al timone e alla randa · spi: ${s.spiHoist > 0.9 ? "su" : s.spiHoist > 0.05 ? "in manovra" : "giù"}`, chem,
    };
  }
  const tillerGauge = { label: "BARRA DEL TIMONE", value: input.tiller, centered: true, ends: ["◀ SINISTRA", "DESTRA ▶"] as [string, string] };
  const sail = { label: two ? "RANDA" : "REGOLAZIONE VELA", sheet: s.sheet, optimal: tel.optimalSheet, state: tel.trimState, auto: autoTrim };
  let crewLine: string | null = null;
  if (two) {
    const where = s.crewOut > 0.75 ? "al trapezio" : s.crewOut > 0.3 ? "in cinghia" : "dentro";
    const spi = s.spiHoist > 0.9 ? "spi su" : s.spiHoist > 0.05 ? "spi in manovra" : "spi giù";
    crewLine = `${partnerName}: ${where} · ${spi}${role === "full" ? " · Spazio = issa/ammaina" : ""}`;
  }
  return { gauge: tillerGauge, sail, call: null, crewLine, chem };
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
