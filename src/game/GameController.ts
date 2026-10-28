import { Matrix, Vector3, type Engine, type Scene } from "@babylonjs/core";
import { crewOnWrongSide, wantSpinnaker } from "../ai/CrewAI";
import { RacingAI } from "../ai/RacingAI";
import type { Input } from "../core/Input";
import type { Sound } from "../core/Sound";
import { DEG } from "../core/math";
import { t } from "../i18n";
import { legTarget } from "../race/Course";
import { HELM, type PlayerChoice } from "../race/PlayerChoice";
import type { Racer } from "../race/Race";
import { RaceSession } from "../race/RaceSession";
import { CLASSES, isTwoPerson, type BoatClass } from "../sailing/BoatClass";
import type { Controls } from "../sailing/BoatPhysics";
import { crewWeight, spinnakerState } from "../sailing/BoatStates";
import { AUTOPILOT_HELM, crewChemistry, RIVALS, type SailorProfile } from "../sailors/Sailors";
import { boatColors } from "../ui/boatColors";
import { crewWeightText, spinnakerText } from "../ui/boatStateText";
import type { Hud, Panel } from "../ui/Hud";
import { eventText } from "../ui/raceEventText";
import { Boat420View } from "../world/Boat420View";
import { boatLook, BoatView } from "../world/BoatView";
import { CourseView } from "../world/CourseView";
import { Ocean } from "../world/Ocean";
import { makeWaves, type Wave } from "../world/Waves";
import type { CameraRig } from "./CameraRig";

/** What the game is doing: each mode but racing shows its own screen. */
export type Mode = "menu" | "racing" | "paused" | "results" | "controls";

/** Help the game gives by doing a secondary task for the player; each can be switched off. */
export type Assists = {
  /** Auto-trim: the player's sail trim is set automatically. */
  autoTrim: boolean;
};

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

  // ---------- Race feedback ----------
  private lastClock = 0;
  private lastBoomSide = 1;
  private ironsHintShown = false;
  private wasTacking = false;

  // ---------- Player on board ----------
  private crewSheets = { jib: 0.5, spi: 0.5 };
  private activeSail: "jib" | "spi" = "jib";
  /** Debug autopilot for the player boat (window.__game.autopilot = true), used by automated tests. */
  autopilotOn = false;
  /** The autopilot's Helm, made when the autopilot first sails the player's boat. */
  autopilot: RacingAI | null = null;

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
    this.crewSheets = { jib: 0.5, spi: 0.5 };
    this.wasTacking = false;
    this.waves = makeWaves(session.wind.meanDir, this.windKn);
    if (!this.ocean) this.ocean = new Ocean(scene, this.waves);
    else this.ocean.setWaves(this.waves);
    this.courseView = new CourseView(scene, session.race.course);
    for (const r of session.race.racers) {
      const look = boatLook(boatColors(r.id));
      this.boats.set(r.id, isTwoPerson(r.sim.cls) ? new Boat420View(scene, r.id, look) : new BoatView(scene, r.id, look));
    }
    input.reset();
    this.lastBoomSide = 0;
    this.lastClock = session.race.clock;
    this.ironsHintShown = false;
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
        if (!this.assists.autoTrim) input.sheet = input.role === "crew" ? this.activeCrewSheet() : this.session.player!.sim.state.sheet;
        hud.toast(this.assists.autoTrim ? t("toast.autoTrimOn") : t("toast.autoTrimOff"));
      }
      if (a === "spi" && this._mode === "racing") this.callSpinnaker();
      if (a === "switch" && this._mode === "racing" && input.role === "crew") {
        this.session.playerControls.switchSide = true;
        hud.toast(t("toast.switchSide"));
      }
      if (a === "camera") {
        hud.toast(t(`toast.camera.${this.cameraRig.nextMode(isTwoPerson(this.boatClass))}`));
      }
    }
  }

  /** One rendered frame: input, the race (while racing), the 3D scene, the HUD and the sound. */
  frame(dt: number) {
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 1) { (window as any).__fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }

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
      const p = session.player!;
      this.applyPlayerControls(dt, p);
      session.advance(dt);
      this.processEvents();
      this.playerCoaching();
    }
    const mode = this._mode;
    for (const r of session.race.racers) this.boats.get(r.id)!.update(mode === "racing" ? dt : 0, this.time, r.sim.state, r.sim.telemetry, this.waves);
    const p = session.player!;
    const leg = p.leg >= 0 && p.leg < session.race.course.legs.length ? session.race.course.legs[p.leg] : null;
    this.courseView!.setTarget(p.finishTime !== null ? null : leg ? legTarget(leg) : null);
    this.courseView!.update(this.time, this.waves, p.leg < 0, !!leg && leg.kind === "finish");
    this.cameraRig.follow(dt, p.sim.state, isTwoPerson(this.boatClass));
    this.ocean!.update(this.time, camera, session.wind);
    hud.update(dt, session.race, p, session.wind, this.buildPanel(p));
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
    for (let i = 0; i < seconds * 60; i++) {
      if (this.autopilotOn && this.autopilot) Object.assign(this.session.playerControls, this.autopilot.update(1 / 60, this.session.wind));
      this.session.step(1 / 60);
    }
  }

  // ---------- Race feedback ----------
  private processEvents() {
    const { session, sound, hud } = this;
    const clock = session.race.clock;
    // Countdown signals: beeps in the last 5 seconds and at -30/-10, horn at the gun.
    for (const t of [-30, -10, -5, -4, -3, -2, -1]) if (this.lastClock < t && clock >= t) sound.beep();
    this.lastClock = clock;
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
      if (e.kind === "finish") setTimeout(() => { if (this._mode === "racing") this.showResults(); }, 2500);
    }
    if (session.race.phase === "done" && this._mode === "racing" && session.player!.finishTime === null) this.showResults();
  }

  private playerCoaching() {
    const { session, hud } = this;
    const p = session.player!;
    const s = p.sim.state, tel = p.sim.telemetry;
    if (this.lastBoomSide === 0) this.lastBoomSide = s.boomSide;
    if (s.boomSide !== this.lastBoomSide) {
      const gybe = Math.abs(tel.awa) > 90 * DEG;
      // When the Partner is the Helm, the call comes from them (the player, as Crew, must react).
      if (session.partnerHelm) hud.toast(t(gybe ? "coach.partnerGybe" : "coach.partnerTack", { name: session.partner!.name }), "bad");
      else hud.toast(gybe ? t("coach.gybe") : t("coach.tack"));
      this.lastBoomSide = s.boomSide;
    }
    if (session.partnerHelm) {
      const tacking = session.partnerHelm.tacking;
      if (tacking && !this.wasTacking) { hud.toast(t("coach.partnerReadyAbout", { name: session.partner!.name })); this.sound.beep(); }
      this.wasTacking = tacking;
    }
    if (!this.ironsHintShown && tel.trimState === "irons" && Math.abs(tel.speed) < 0.3 && session.race.clock > -40) {
      this.ironsHintShown = true;
      hud.toast(this.input.steering === "tiller" ? t("coach.irons.tiller") : t("coach.irons.boat"), "bad");
    }
  }

  // ---------- Player on board ----------
  private activeCrewSheet() {
    return this.activeSail === "spi" ? this.crewSheets.spi : this.crewSheets.jib;
  }

  /** Space: hoist/drop the spinnaker (Crew), or call for it (Full Boat Control). */
  private callSpinnaker() {
    const { session, hud, choice } = this;
    if (!this.boatClass.spinnaker) return;
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

  private applyPlayerControls(dt: number, p: Racer) {
    const { session, input, crewSheets } = this;
    const pc = session.playerControls;
    const tel = p.sim.telemetry;
    if (this.autopilotOn) {
      if (!this.autopilot || this.autopilot.racer !== p) this.autopilot = new RacingAI(p, AUTOPILOT_HELM, session.race, 99, 3);
      const c = this.autopilot.update(dt, session.wind);
      if (!session.partnerHelm) { pc.rudder = c.rudder; pc.sheet = c.sheet; }
      if (input.role === "crew") this.autopilotCrew(pc, p);
      return;
    }
    if (input.role === "crew") {
      // The Partner is the Helm (RaceSession fills rudder and mainsheet). We trim and move.
      const nowSail: "jib" | "spi" = p.sim.state.spiHoist > 0.5 ? "spi" : "jib";
      if (nowSail !== this.activeSail) { this.activeSail = nowSail; input.sheet = this.activeCrewSheet(); }
      if (this.assists.autoTrim) input.sheet = this.activeSail === "spi" ? tel.spi!.optimal : tel.jib!.optimal;
      crewSheets[this.activeSail] = input.sheet;
      pc.jibSheet = crewSheets.jib;
      pc.spiSheet = crewSheets.spi;
      pc.crewOut = input.crewOut;
      return;
    }
    pc.rudder = input.rudder;
    if (this.assists.autoTrim) {
      input.sheet = tel.optimalSheet;
    }
    pc.sheet = input.sheet;
  }

  /** Test helper: perfect Crew work for the autopilot. */
  private autopilotCrew(pc: Controls, p: Racer) {
    const tel = p.sim.telemetry;
    pc.jibSheet = tel.jib?.optimal; pc.spiSheet = tel.spi?.optimal; pc.crewOut = tel.crew?.ideal;
    pc.spi = wantSpinnaker(this.session.race, p);
    if (crewOnWrongSide(p.sim)) pc.switchSide = true;
  }

  // ---------- HUD panel ----------
  private buildPanel(p: Racer): Panel {
    const { session, input } = this;
    const s = p.sim.state, tel = p.sim.telemetry;
    const two = isTwoPerson(this.boatClass);
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
        sail: { label: spiUp ? t("hud.sail.spinnaker") : t("hud.sail.jib"), sheet, optimal: sailTel.optimal, state: sailTel.trimState, autoTrim: this.assists.autoTrim,
          text: tel.jib!.backed && !spiUp ? t("trim.jibBacked") : spiUp && tel.spi!.collapsed ? t("trim.spiCollapsed") : undefined },
        call, partnerLine: t("hud.partnerLine.helm", { name, spi }), chem,
      };
    }
    const tillerGauge = { label: t("hud.gauge.tiller"), value: input.tiller, centered: true, ends: [t("hud.gauge.left"), t("hud.gauge.right")] as [string, string] };
    const sail = { label: two ? t("hud.sail.main") : t("hud.sail.single"), sheet: s.sheet, optimal: tel.optimalSheet, state: tel.trimState, autoTrim: this.assists.autoTrim };
    let partnerLine: string | null = null;
    if (two) {
      const weight = crewWeightText(crewWeight(s.crewOut), "partner");
      const spi = spinnakerText(spinnakerState(s.spiHoist));
      partnerLine = t(this.choice.control === "fullBoat" ? "hud.partnerLine.crewOnCall" : "hud.partnerLine.crew", { name, weight, spi });
    }
    return { gauge: tillerGauge, sail, call: null, partnerLine, chem };
  }
}
