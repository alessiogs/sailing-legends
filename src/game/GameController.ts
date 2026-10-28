import { Matrix, Vector3, type Engine, type Scene } from "@babylonjs/core";
import type { Input } from "../core/Input";
import type { Sound } from "../core/Sound";
import { DEG } from "../core/math";
import { t } from "../i18n";
import { legTarget } from "../race/Course";
import { HELM, type PlayerChoice } from "../race/PlayerChoice";
import type { Racer } from "../race/Race";
import { RaceSession } from "../race/RaceSession";
import { CLASSES, isTwoPerson, type BoatClass } from "../sailing/BoatClass";
import { RIVALS, type SailorProfile } from "../sailors/Sailors";
import { boatColors } from "../ui/boatColors";
import type { Hud } from "../ui/Hud";
import { buildPanel } from "../ui/hudPanel";
import { Boat420View } from "../world/Boat420View";
import { boatLook, BoatView } from "../world/BoatView";
import { CourseView } from "../world/CourseView";
import { Ocean } from "../world/Ocean";
import { makeWaves, type Wave } from "../world/Waves";
import type { CameraRig } from "./CameraRig";
import { PlayerControls, type Assists } from "./PlayerControls";
import { RaceFeedback, type Cue } from "./RaceFeedback";

/** What the game is doing: each mode but racing shows its own screen. */
export type Mode = "menu" | "racing" | "paused" | "results" | "controls";

/** The page screens the controller drives: one per mode, plus the Auto-trim option of the main menu. */
export interface Screens {
  /** Shows the screen of `mode` and hides the others (racing has none). */
  show(mode: Mode): void;
  /** Fills the results table from the standings. */
  fillResults(standings: Racer[]): void;
  /** Whether the menu's Auto-trim option is ticked. */
  autoTrimChosen(): boolean;
  /** Ticks or unticks the menu's Auto-trim option. */
  showAutoTrim(on: boolean): void;
}

/** What the controller works with, made once at startup. */
export type GameDeps = {
  engine: Engine;
  scene: Scene;
  cameraRig: CameraRig;
  canvas: HTMLCanvasElement;
  input: Input;
  hud: Hud;
  sound: Sound;
  screens: Screens;
  /** Saves the player's preferences (controls and mute). */
  savePrefs: () => void;
};

/**
 * Owns the game state (the race session, the race setup chosen in the menu, the Assists) and the
 * menu / racing / paused / results / controls modes, and runs one frame at a time.
 */
export class GameController {
  // ---------- Race setup (chosen in the menu) ----------
  boatClass: BoatClass = CLASSES.optimist;
  choice: PlayerChoice = HELM;
  partner: SailorProfile = RIVALS[1];
  windKn = 11;
  /** The Assists the player has switched on. */
  readonly assists: Assists = { autoTrim: false };

  // ---------- Modes ----------
  private _mode: Mode = "menu";
  /** The mode the Commands menu returns to. */
  private controlsReturn: Mode = "menu";

  // ---------- The race and its scene ----------
  /** The current race; the first one is created at startup, behind the menu. */
  session!: RaceSession;
  private boats = new Map<string, BoatView | Boat420View>();
  private courseView: CourseView | null = null;
  private ocean: Ocean | null = null;
  private waves: Wave[] = [];
  private time = 0;

  /** The sounds, messages and coaching hints the player gets from the race. */
  private readonly feedback = new RaceFeedback();

  // ---------- Player on board ----------
  /** The player's input turned into the player boat's controls, per Role; also the browser autopilot. */
  readonly controls: PlayerControls;

  // ---------- Frame scratch ----------
  private fpsAcc = 0;
  private fpsFrames = 0;
  private readonly projMat = new Matrix();
  private readonly tmp = new Vector3();

  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly cameraRig: CameraRig;
  private readonly canvas: HTMLCanvasElement;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly sound: Sound;
  private readonly screens: Screens;
  private readonly savePrefs: () => void;

  constructor(deps: GameDeps) {
    this.engine = deps.engine;
    this.scene = deps.scene;
    this.cameraRig = deps.cameraRig;
    this.canvas = deps.canvas;
    this.input = deps.input;
    this.hud = deps.hud;
    this.sound = deps.sound;
    this.screens = deps.screens;
    this.savePrefs = deps.savePrefs;
    this.controls = new PlayerControls(deps.input, this.assists);
  }

  get mode(): Mode { return this._mode; }

  /** Startup: the course with AI boats idling behind the menu until the player starts. */
  showMenuBackground() {
    this.newRace();
    this.hud.show(false);
    this.setMode("menu");
  }

  newRace() {
    const { scene, hud, input } = this;
    for (const b of this.boats.values()) b.dispose();
    this.boats.clear();
    this.courseView?.dispose();
    hud.clearTags();
    const seed = Math.floor(Math.random() * 1e6);
    const session = this.session = new RaceSession({ seed, windKn: this.windKn, boatClass: this.boatClass, choice: this.choice, partner: this.partner });
    input.role = isTwoPerson(this.boatClass) ? this.choice.role : "helm";
    this.controls.newRace();
    this.feedback.newRace(session);
    this.waves = makeWaves(session.wind.meanDir, this.windKn);
    if (!this.ocean) this.ocean = new Ocean(scene, this.waves);
    else this.ocean.setWaves(this.waves);
    this.courseView = new CourseView(scene, session.race.course);
    for (const r of session.race.racers) {
      const look = boatLook(boatColors(r.id));
      this.boats.set(r.id, isTwoPerson(r.sim.cls) ? new Boat420View(scene, r.id, look) : new BoatView(scene, r.id, look));
    }
    input.reset();
    this.cameraRig.placeBehind(session.player!.sim.state, isTwoPerson(this.boatClass));
    hud.show(true);
    hud.toast(t("toast.startSequence"), "big");
  }

  setMode(m: Mode) {
    this._mode = m;
    this.screens.show(m);
  }

  startFromMenu() {
    this.sound.init();
    this.assists.autoTrim = this.screens.autoTrimChosen();
    this.newRace();
    this.setMode("racing");
  }

  openControls() {
    if (this._mode === "controls") return;
    this.controlsReturn = this._mode === "racing" ? "paused" : this._mode;
    this.setMode("controls");
  }

  closeControls() { this.setMode(this.controlsReturn); }

  private showResults() {
    this.screens.fillResults(this.session.race.standings());
    this.setMode("results");
  }

  private handleActions() {
    const { input, sound, hud } = this;
    for (const a of input.consume()) {
      if (a === "mute") {
        sound.init();
        sound.setMuted(!sound.muted);
        this.savePrefs();
        hud.toast(sound.muted ? t("toast.audioOff") : t("toast.audioOn"));
        continue;
      }
      if (a === "controls") { if (this._mode === "controls") this.closeControls(); else this.openControls(); continue; }
      if (this._mode === "controls") {
        if (a === "pause") this.closeControls();
        continue;
      }
      if (this._mode === "menu") {
        if (a === "start") this.startFromMenu();
        continue;
      }
      const mode = this._mode;
      if (a === "pause") this.setMode(mode === "paused" ? "racing" : mode === "racing" ? "paused" : mode);
      if (a === "restart") { this.newRace(); this.setMode("racing"); }
      if (a === "menu" || a === "help") { this.setMode("menu"); }
      if (a === "autoTrim" && this._mode === "racing") {
        this.assists.autoTrim = !this.assists.autoTrim;
        this.screens.showAutoTrim(this.assists.autoTrim);
        if (!this.assists.autoTrim) this.controls.autoTrimOff(this.session);
        hud.toast(this.assists.autoTrim ? t("toast.autoTrimOn") : t("toast.autoTrimOff"));
      }
      if (a === "spi" && this._mode === "racing") {
        const text = this.controls.callSpinnaker(this.session);
        if (text !== null) hud.toast(text);
      }
      if (a === "switch" && this._mode === "racing" && this.controls.switchSide(this.session)) hud.toast(t("toast.switchSide"));
      if (a === "camera") {
        hud.toast(t(`toast.camera.${this.cameraRig.nextMode(isTwoPerson(this.boatClass))}`));
      }
    }
  }

  /** One rendered frame: input, the race (while racing), the 3D scene, the HUD and the sound. */
  frame(dt: number) {
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 1) { window.__fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }

    this.input.update(dt);
    this.handleActions();

    // Read after handleActions, which may have started a new race.
    if (this.session) this.renderRace(dt, this.session);
    else this.scene.render();
  }

  private renderRace(dt: number, session: RaceSession) {
    const { engine, hud, scene } = this;
    const { camera } = this.cameraRig;
    if (this._mode === "racing") {
      this.time += dt;
      this.controls.apply(dt, session);
      session.advance(dt);
      this.play(this.feedback.update(session, this.input.steering));
    }
    const mode = this._mode;
    for (const r of session.race.racers) this.boats.get(r.id)!.update(mode === "racing" ? dt : 0, this.time, r.sim.state, r.sim.telemetry, this.waves);
    const p = session.player!;
    const leg = p.leg >= 0 && p.leg < session.race.course.legs.length ? session.race.course.legs[p.leg] : null;
    this.courseView!.setTarget(p.finishTime !== null ? null : leg ? legTarget(leg) : null);
    this.courseView!.update(this.time, this.waves, p.leg < 0, !!leg && leg.kind === "finish");
    this.cameraRig.follow(dt, p.sim.state, isTwoPerson(this.boatClass));
    this.ocean!.update(this.time, camera, session.wind);
    hud.update(dt, session.race, p, session.wind, this.panel(session));
    const tel = p.sim.telemetry;
    const luff = tel.trimState === "luffing" || tel.trimState === "irons" ? Math.max(0.3, 1 - tel.aoa / (6 * DEG)) : 0;
    this.sound.update(dt, tel.aws, tel.speed, mode === "racing" ? luff : 0, mode === "racing");
    scene.render();
    const { projMat, tmp } = this;
    projMat.copyFrom(scene.getTransformMatrix());
    const vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const scale = this.canvas.clientWidth / engine.getRenderWidth();
    hud.updateTags(session.race, p, (x, y, z) => {
      tmp.set(x, y, z);
      const toCam = tmp.subtract(camera.globalPosition);
      const fwd = camera.getForwardRay().direction;
      if (Vector3.Dot(toCam, fwd) <= 0) return null;
      const v = Vector3.Project(tmp, Matrix.IdentityReadOnly, projMat, vp);
      return { x: v.x * scale, y: v.y * scale };
    });
  }

  /** Test hook: sails the race `seconds` ahead at the fixed step, the autopilot steering when it is on. */
  fastForward(seconds: number) {
    for (let i = 0; i < seconds * 60; i++) this.controls.fastForwardStep(this.session, 1 / 60);
  }

  // ---------- Race feedback ----------
  /** Plays the race feedback's cues, in order. */
  private play(cues: Cue[]) {
    const { sound, hud } = this;
    for (const c of cues) {
      switch (c.kind) {
        case "beep": sound.beep(); break;
        case "bump": sound.bump(); break;
        case "chime": sound.chime(); break;
        case "buzzer": sound.buzzer(); break;
        case "horn":
          if (c.afterMs > 0) setTimeout(() => sound.horn(c.seconds), c.afterMs);
          else sound.horn(c.seconds);
          break;
        case "toast": hud.toast(c.text, c.style); break;
        case "results": {
          const show = () => { if (this._mode === "racing") this.showResults(); };
          if (c.afterMs > 0) setTimeout(show, c.afterMs);
          else show();
          break;
        }
      }
    }
  }

  // ---------- HUD panel ----------
  /** The HUD's bottom panel for the player's boat, from the race and the choices held here. */
  private panel(session: RaceSession) {
    return buildPanel({
      session, role: this.input.role, control: this.choice.control, twoPerson: isTwoPerson(this.boatClass),
      tiller: this.input.tiller, autoTrim: this.assists.autoTrim,
    });
  }
}
