import {
  Color3, Color4, DirectionalLight, Engine, HemisphericLight, Scene, Vector3,
} from "@babylonjs/core";
import { Input } from "./core/Input";
import { Sound } from "./core/Sound";
import { angleDiff } from "./core/math";
import { GameController } from "./game/GameController";
import { CameraRig } from "./game/CameraRig";
import { loadPrefs, savePrefs } from "./game/Preferences";
import { Hud } from "./ui/Hud";
import { Menus } from "./ui/Menus";
import { fillPageText } from "./ui/pageText";
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

const cameraRig = new CameraRig(scene, canvas);

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

// ---------- Menus and game ----------
const menus = new Menus(input, savePlayerPrefs);
const game = new GameController({ engine, scene, cameraRig, canvas, input, hud, sound, screens: menus, savePrefs: savePlayerPrefs });
menus.attach(game);

// ---------- Main loop ----------
engine.runRenderLoop(() => game.frame(Math.min(engine.getDeltaTime() / 1000, 0.1)));

// Menu background: show the course with AI boats idling until the player starts.
game.showMenuBackground();

window.addEventListener("resize", () => engine.resize());
setTimeout(() => document.getElementById("loading")!.classList.add("hidden"), 300);

// Debug/testing hook (used by automated browser tests).
(window as any).__game = {
  get session() { return game.session; }, input, get mode() { return game.mode; },
  start: () => game.startFromMenu(), angleDiff,
  get autopilot() { return game.autopilotOn; },
  set autopilot(on: boolean) { game.autopilotOn = on; },
  fastForward(seconds: number) { game.fastForward(seconds); },
};
