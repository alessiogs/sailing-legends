import {
  Color3, Color4, DirectionalLight, Engine, HemisphericLight, Scene, Vector3,
} from "@babylonjs/core";
import { Input } from "./core/Input";
import { chooseLanguage, setLanguage, type Language } from "./i18n";
import { Sound } from "./core/Sound";
import { GameController } from "./game/GameController";
import { CameraRig } from "./game/CameraRig";
import { loadPrefs, savePrefs } from "./game/Preferences";
import { installTestHook } from "./game/testHook";
import { Hud } from "./ui/Hud";
import { Menus } from "./ui/Menus";
import { fillPageText } from "./ui/pageText";
import "./style.css";

// ---------- Preferences and language ----------
const storage = () => localStorage;
const prefs = loadPrefs(storage);
// The saved choice, else the browser's language, else Italian.
const language = chooseLanguage(prefs.language, navigator.language);
setLanguage(language);
document.documentElement.lang = language;

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
let savedLanguage = prefs.language;
input.settings = prefs.controls;
sound.muted = prefs.muted;
const savePlayerPrefs = () => savePrefs(storage, { controls: input.settings, muted: sound.muted, language: savedLanguage });

// ---------- Menus and game ----------
// Changing the language saves it and reloads the page: every screen and the HUD then read the new catalog from the
// start, instead of each one re-wording what it already shows.
const chooseMenuLanguage = (next: Language) => {
  savedLanguage = next;
  savePlayerPrefs();
  location.reload();
};
const menus = new Menus(input, savePlayerPrefs, language, chooseMenuLanguage);
const game = new GameController({ engine, scene, cameraRig, canvas, input, hud, sound, screens: menus, savePrefs: savePlayerPrefs, careerStorage: storage });
menus.attach(game);

// ---------- Main loop ----------
engine.runRenderLoop(() => game.frame(Math.min(engine.getDeltaTime() / 1000, 0.1)));

// Menu background: show the course with AI boats idling until the player starts.
game.showMenuBackground();

window.addEventListener("resize", () => engine.resize());
setTimeout(() => document.getElementById("loading")!.classList.add("hidden"), 300);

// Debug/testing hook (used by automated browser tests).
installTestHook(game, input);
