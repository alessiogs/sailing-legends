import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Scene, Vector3,
} from "@babylonjs/core";
import { crewChemistry, RIVALS, rivalById } from "./sailors/Sailors";
import { DEFAULT_CONTROLS } from "./core/ControlSettings";
import { Input } from "./core/Input";
import { Sound } from "./core/Sound";
import { angleDiff } from "./core/math";
import type { Racer } from "./race/Race";
import { CREW, FULL_BOAT, HELM, type PlayerChoice } from "./race/PlayerChoice";
import { CLASSES, isTwoPerson } from "./sailing/BoatClass";
import { t, type MessageKey } from "./i18n";
import { GameController, type Mode, type Screens } from "./game/GameController";
import { loadPrefs, savePrefs } from "./game/Preferences";
import { Hud } from "./ui/Hud";
import { fillPageText } from "./ui/pageText";
import { racerName } from "./ui/raceNames";
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

// ---------- Services ----------
const input = new Input();
const hud = new Hud();
const sound = new Sound();

// ---------- Preferences ----------
const storage = () => localStorage;
const prefs = loadPrefs(storage);
input.settings = prefs.controls;
sound.muted = prefs.muted;
const savePlayerPrefs = () => savePrefs(storage, { controls: input.settings, muted: sound.muted });

// ---------- Screens ----------
const $ = (id: string) => document.getElementById(id)!;
const menuEl = $("menu"), pauseEl = $("pause"), resultsEl = $("results"), controlsEl = $("controls");
const autoTrimEl = $("auto-trim-opt") as HTMLInputElement;

const screens: Screens = {
  show(m: Mode) {
    menuEl.classList.toggle("hidden", m !== "menu");
    pauseEl.classList.toggle("hidden", m !== "paused");
    resultsEl.classList.toggle("hidden", m !== "results");
    controlsEl.classList.toggle("hidden", m !== "controls");
  },
  fillResults(standings: Racer[]) {
    const rows = standings.map((r, i) => {
      const time = r.dsq ? t("results.dsq") : r.finishTime !== null ? `${Math.floor(r.finishTime / 60)}:${String(Math.floor(r.finishTime % 60)).padStart(2, "0")}` : "—";
      return `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.dsq ? "–" : t("results.place", { place: i + 1 })}</td><td>${racerName(r)}</td><td>${time}</td></tr>`;
    }).join("");
    $("results-table").innerHTML = rows;
  },
  autoTrimChosen: () => autoTrimEl.checked,
  showAutoTrim(on: boolean) { autoTrimEl.checked = on; },
};

// ---------- Game ----------
const game = new GameController({ engine, scene, camera, canvas, input, hud, sound, screens, savePrefs: savePlayerPrefs });

$("start-btn").addEventListener("click", () => game.startFromMenu());
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
    b.addEventListener("click", () => { apply(b.dataset.v!); input.tiller = 0; syncControls(); savePlayerPrefs(); });
  }
};
bindSeg("steer-opt", v => { input.settings.steering = v === "boat" ? "boat" : "tiller"; });
bindSeg("center-opt", v => { input.settings.autoCenter = v === "1"; });
bindSeg("tspeed-opt", v => { input.settings.tillerSpeed = Number(v); });
bindSeg("sspeed-opt", v => { input.settings.sheetSpeed = Number(v); });
$("open-controls").addEventListener("click", () => game.openControls());
$("pause-controls").addEventListener("click", () => game.openControls());
$("controls-back").addEventListener("click", () => game.closeControls());
$("controls-reset").addEventListener("click", () => { input.settings = { ...DEFAULT_CONTROLS }; syncControls(); savePlayerPrefs(); });
$("resume-btn").addEventListener("click", () => game.setMode("racing"));
$("pause-menu").addEventListener("click", () => game.setMode("menu"));
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
  const { boatClass, choice, partner } = game;
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
    b.addEventListener("click", () => { game.partner = rivalById(b.dataset.v!) ?? game.partner; syncBoatMenu(); });
  }
}
for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#class-opt button"))) {
  b.addEventListener("click", () => { game.boatClass = CLASSES[b.dataset.v!] ?? CLASSES.optimist; syncBoatMenu(); });
}
for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#role-opt button"))) {
  b.addEventListener("click", () => { game.choice = ROLE_OPTIONS[b.dataset.v as RoleOption].choice; syncBoatMenu(); });
}
syncBoatMenu();

for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("#wind-opt button"))) {
  b.addEventListener("click", () => {
    game.windKn = Number(b.dataset.v);
    for (const o of Array.from(document.querySelectorAll("#wind-opt button"))) o.classList.toggle("on", o === b);
  });
}

// ---------- Main loop ----------
engine.runRenderLoop(() => game.frame(Math.min(engine.getDeltaTime() / 1000, 0.1)));

// Menu background: show the course with AI boats idling until the player starts.
game.showMenuBackground();

window.addEventListener("resize", () => engine.resize());
setTimeout(() => $("loading").classList.add("hidden"), 300);

// Debug/testing hook (used by automated browser tests).
(window as any).__game = {
  get session() { return game.session; }, input, get mode() { return game.mode; },
  start: () => game.startFromMenu(), angleDiff,
  get autopilot() { return game.autopilotOn; },
  set autopilot(on: boolean) { game.autopilotOn = on; },
  fastForward(seconds: number) { game.fastForward(seconds); },
};
