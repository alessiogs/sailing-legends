import { Matrix, Vector3, type Engine, type Scene } from "@babylonjs/core";
import type { Input } from "../core/Input";
import type { Sound } from "../core/Sound";
import { DEG } from "../core/math";
import { t } from "../i18n";
import { seasonCalendar } from "../career/Calendar";
import { nextRaceSetup, startCareer, type RaceSetup } from "../career/Career";
import { loadCareer, saveCareer, type CareerLoad, type CareerState, type CareerStorage } from "../career/CareerSave";
import { isSeasonOver, raceEntries, recordRace } from "../career/RecordRace";
import { startNextSeason, type SeasonChoice } from "../career/SeasonClose";
import { isRegattaComplete, regattaReport, seasonSummary } from "../career/Standings";
import { legTarget } from "../race/Course";
import { HELM, type PlayerChoice } from "../race/PlayerChoice";
import type { Racer } from "../race/Race";
import { makeFleet } from "../race/Fleet";
import { FIXED_DT, RaceSession } from "../race/RaceSession";
import { CLASSES, isTwoPerson, type BoatClass } from "../sailing/BoatClass";
import { RIVALS, type SailorProfile } from "../sailors/Sailors";
import { boatColors } from "../ui/boatColors";
import type { CareerView } from "../ui/CareerScreen";
import type { Hud } from "../ui/Hud";
import { buildPanel } from "../ui/hudPanel";
import { Boat420View } from "../world/Boat420View";
import { boatLook } from "../world/boatMaterials";
import { BoatView } from "../world/BoatView";
import type { BoatViewBase } from "../world/BoatViewBase";
import { CourseView } from "../world/CourseView";
import { Ocean } from "../world/Ocean";
import { makeWaves, type Wave } from "../world/Waves";
import type { CameraRig } from "./CameraRig";
import { boatCrews } from "./boatCrews";
import { PlayerControls, type Assists } from "./PlayerControls";
import { RaceFeedback, type Cue } from "./RaceFeedback";

/** What the game is doing: each mode but racing shows its own screen. */
export type Mode = "menu" | "racing" | "paused" | "results" | "controls" | "career";

/** What the results screen offers after a Career Race: the next Race when the Regatta has one, the standings of the Regatta this Race completed, and the calendar. */
export type CareerResults = { nextRace: boolean; standings: number | null };

/** The page screens the controller drives: one per mode, plus the Auto-trim option of the main menu. */
export interface Screens {
  /** Shows the screen of `mode` and hides the others (racing has none). */
  show(mode: Mode): void;
  /** Fills the results table from the standings; `career` is set after a Career Race (Quick race: `null`). */
  fillResults(standings: Racer[], career: CareerResults | null): void;
  /** Fills the Career screen (shown in mode `career`). */
  showCareer(view: CareerView): void;
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
  /** Where the Career is saved (a getter: merely reaching `localStorage` can throw). */
  careerStorage: () => CareerStorage;
};

/** After the player finishes a Career Race, the rest of the fleet is sailed on at most this long to get a full result. */
const FINISH_FLEET_S = 600;

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

  // ---------- Career ----------
  /** The Career being played, or `null` in Quick race and before one is started or continued. */
  career: CareerState | null = null;
  /** The Career Race the current session is, or `null` for a Quick race; `recorded` once its result is in the Career. */
  private careerRace: { setup: RaceSetup; recorded: boolean; completed: number | null } | null = null;

  // ---------- Modes ----------
  private _mode: Mode = "menu";
  /** The mode the Commands menu returns to. */
  private controlsReturn: Mode = "menu";

  // ---------- The race and its scene ----------
  /** The current race; the first one is created at startup, behind the menu. */
  session!: RaceSession;
  private boats = new Map<string, BoatViewBase>();
  private courseView: CourseView | null = null;
  private ocean: Ocean | null = null;
  private waves: Wave[] = [];
  private time = 0;
  /** The class and the player's Role and Control mode of the current session (the menu may have moved on since). */
  private activeClass: BoatClass = CLASSES.optimist;
  private activeChoice: PlayerChoice = HELM;

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
  private readonly careerStorage: () => CareerStorage;

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
    this.careerStorage = deps.careerStorage;
    this.controls = new PlayerControls(deps.input, this.assists);
  }

  get mode(): Mode { return this._mode; }

  /** Startup: the course with AI boats idling behind the menu until the player starts. */
  showMenuBackground() {
    this.newRace();
    this.hud.show(false);
    this.setMode("menu");
  }

  /** Starts a race: the Career's `setup` for a Career Race, else a Quick race from the menu's choices. */
  newRace(setup?: RaceSetup) {
    const { scene, hud, input } = this;
    for (const b of this.boats.values()) b.dispose();
    this.boats.clear();
    this.courseView?.dispose();
    hud.clearTags();
    this.careerRace = setup ? { setup, recorded: false, completed: null } : null;
    const seed = setup ? setup.seed : Math.floor(Math.random() * 1e6);
    const windKn = setup ? setup.windKn : this.windKn;
    const fleet = setup ? setup.fleet : makeFleet({ boatClass: this.boatClass, choice: this.choice, partner: this.partner });
    this.activeClass = fleet.boatClass;
    this.activeChoice = setup ? fleet.choice : this.choice;
    const session = this.session = new RaceSession({ seed, windKn, fleet });
    input.role = isTwoPerson(this.activeClass) ? this.activeChoice.role : "helm";
    this.controls.newRace();
    this.feedback.newRace(session);
    this.waves = makeWaves(session.wind.meanDir, windKn);
    if (!this.ocean) this.ocean = new Ocean(scene, this.waves);
    else this.ocean.setWaves(this.waves);
    this.courseView = new CourseView(scene, session.race.course);
    const crews = boatCrews(fleet, setup ? this.career : null);
    for (const r of session.race.racers) {
      const look = boatLook(boatColors(r.id));
      const crew = crews.get(r.id)!;
      this.boats.set(r.id, isTwoPerson(r.sim.cls) ? new Boat420View(scene, r.id, look, crew) : new BoatView(scene, r.id, look, crew));
    }
    input.reset();
    hud.setBoat(isTwoPerson(this.activeClass), this.activeChoice.role === "crew");
    this.cameraRig.placeBehind(session.player!.sim.state, isTwoPerson(this.activeClass));
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

  // ---------- Career ----------
  /** The saved Career: `null` when there is none, `{ ok: false }` when it cannot be read. */
  savedCareer(): CareerLoad | null { return loadCareer(this.careerStorage); }

  /** Asks for the starting age of a new Career. */
  askCareerAge() {
    this.screens.showCareer({ kind: "age", replaces: this.savedCareer() !== null });
    this.setMode("career");
  }

  /** Starts a new Career at `startingAge`, saves it and shows its calendar. */
  newCareer(startingAge: number) {
    this.career = startCareer({ seed: Math.floor(Math.random() * 2 ** 31), startingAge });
    saveCareer(this.careerStorage, this.career);
    this.showCalendar();
  }

  /** Continues the saved Career at its calendar; an unreadable save gets the "start a new career?" prompt instead. */
  continueCareer() {
    const saved = this.savedCareer();
    if (saved === null) return this.askCareerAge();
    if (!saved.ok) {
      this.screens.showCareer({ kind: "unreadable" });
      return this.setMode("career");
    }
    this.career = saved.state;
    this.showCalendar();
  }

  /** The Season calendar of the Career in progress. */
  showCalendar() {
    if (!this.career) return;
    this.screens.showCareer({ kind: "calendar", state: this.career });
    this.setMode("career");
  }

  /** The standings after Regatta `index` of the Career in progress (the Season summary follows the last one). */
  showStandings(index: number) {
    const report = this.career && regattaReport(this.career, index);
    if (!this.career || !report) return;
    this.screens.showCareer({ kind: "standings", state: this.career, report, last: index === seasonCalendar(this.career.classId).length - 1 });
    this.setMode("career");
  }

  /** The Season summary of the Career in progress, once its last Regatta is sailed. */
  showSummary() {
    const summary = this.career && seasonSummary(this.career);
    if (!this.career || !summary) return;
    this.screens.showCareer({ kind: "summary", state: this.career, summary });
    this.setMode("career");
  }

  /** The end-of-Season choice of the Career in progress, once the Season is over. */
  showNextSeason() {
    if (!this.career || !isSeasonOver(this.career)) return;
    this.screens.showCareer({ kind: "next", state: this.career });
    this.setMode("career");
  }

  /** Closes the Season with the player's choice (stay, or the 420 with a Partner), saves and shows the new Season's calendar. */
  startSeason(choice: SeasonChoice) {
    if (!this.career || !isSeasonOver(this.career)) return;
    this.career = startNextSeason(this.career, choice);
    saveCareer(this.careerStorage, this.career);
    this.showCalendar();
  }

  /** Starts the next Race of the Career's Regatta (nothing when the Season's Regattas are all sailed). */
  startCareerRace() {
    const setup = this.career && nextRaceSetup(this.career);
    if (!setup) return;
    this.sound.init();
    this.assists.autoTrim = this.screens.autoTrimChosen();
    this.newRace(setup);
    this.setMode("racing");
  }

  /** Records the Career Race once the player has finished: sails the rest of the fleet home, adds the result, saves. */
  private recordCareerRace(race: { setup: RaceSetup; recorded: boolean; completed: number | null }) {
    if (race.recorded || !this.career) return;
    const { race: r } = this.session;
    for (let i = 0; i < FINISH_FLEET_S / FIXED_DT && r.phase !== "done"; i++) this.session.step(FIXED_DT);
    const regattaIndex = this.career.regattaIndex;
    this.career = recordRace(this.career, raceEntries(race.setup.fleet, r.racers));
    race.completed = isRegattaComplete(this.career, regattaIndex) ? regattaIndex : null;
    saveCareer(this.careerStorage, this.career);
    race.recorded = true;
  }

  /** Whether the current session is a Career Race (which cannot be restarted). */
  get inCareerRace() { return this.careerRace !== null; }

  /** Sails a new Quick race with the menu's choices; nothing in a Career Race. */
  restart() {
    if (this.careerRace) return;
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
    const career = this.careerRace;
    if (career) this.recordCareerRace(career);
    this.screens.fillResults(this.session.race.standings(), career && this.career ? { nextRace: career.completed === null && nextRaceSetup(this.career) !== null, standings: career.completed } : null);
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
      if (this._mode === "career") {
        if (a === "menu") this.setMode("menu");
        continue;
      }
      const mode = this._mode;
      if (a === "pause") this.setMode(mode === "paused" ? "racing" : mode === "racing" ? "paused" : mode);
      if (a === "restart") this.restart();
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
        hud.toast(t(`toast.camera.${this.cameraRig.nextMode(isTwoPerson(this.activeClass))}`));
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
    for (const r of session.race.racers) this.boats.get(r.id)!.update(mode === "racing" ? dt : 0, this.time, r.sim.state, r.sim.telemetry, this.waves, camera.position);
    const p = session.player!;
    const leg = p.leg >= 0 && p.leg < session.race.course.legs.length ? session.race.course.legs[p.leg] : null;
    this.courseView!.setTarget(p.finishTime !== null ? null : leg ? legTarget(leg) : null);
    this.courseView!.update(this.time, this.waves, p.leg < 0, !!leg && leg.kind === "finish");
    this.cameraRig.follow(dt, p.sim.state, isTwoPerson(this.activeClass));
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
      session, role: this.input.role, control: this.activeChoice.control, twoPerson: isTwoPerson(this.activeClass),
      tiller: this.input.tiller, autoTrim: this.assists.autoTrim,
    });
  }
}
