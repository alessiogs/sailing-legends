import type { Role } from "../race/PlayerChoice";
import { DEFAULT_CONTROLS, type ControlSettings } from "./ControlSettings";
import { clamp } from "./math";

/**
 * Keyboard + gamepad. Produces smooth tiller and sheet commands plus one-shot actions.
 * Keyboard: A/D or ←/→ move the tiller, W/↑ sheet in, S/↓ ease, T Auto-trim, C camera, R restart,
 * H/M menu, P/Esc pause, V sound. Gamepad: left stick tiller, RT sheet in, LT ease, Y camera,
 * X Auto-trim, Start pause, Back restart. How the keys steer is set by `settings` (see ControlSettings.ts).
 */
export type Action = "autoTrim" | "camera" | "restart" | "help" | "pause" | "start" | "menu" | "mute" | "controls" | "spi" | "switch";

export class Input {
  /** Tiller position: -1 = pushed fully to port (left), +1 = fully to starboard (right). */
  tiller = 0;
  sheet = 0.55;
  settings: ControlSettings = { ...DEFAULT_CONTROLS };
  /** The player's Role, which sets what left/right move: the Helm moves the tiller, the Crew moves their weight (D/→ out, A/← in). */
  role: Role = "helm";
  /** Crew weight 0 (in) .. 0.5 (hiking) .. 1 (trapeze). */
  crewOut = 0.3;
  get steering() { return this.settings.steering; }
  private keys = new Set<string>();
  private pressed: Action[] = [];
  private padPrev: boolean[] = [];
  usingPad = false;

  constructor(target: Window = window) {
    target.addEventListener("keydown", e => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (!e.repeat) {
        if (k === "t") this.pressed.push("autoTrim");
        if (k === "c") this.pressed.push("camera");
        if (k === "r") this.pressed.push("restart");
        if (k === "h") this.pressed.push("help");
        if (k === "m") this.pressed.push("menu");
        if (k === "v") this.pressed.push("mute");
        if (k === "k") this.pressed.push("controls");
        if (k === "p" || k === "escape") this.pressed.push("pause");
        if (k === "enter" || k === " ") this.pressed.push("start");
        if (k === " ") this.pressed.push("spi");
        if (k === "e") this.pressed.push("switch");
      }
      this.keys.add(k);
      this.usingPad = false;
    });
    target.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()));
    target.addEventListener("blur", () => this.keys.clear());
  }

  /** Call once per frame. */
  update(dt: number) {
    const k = this.keys;
    const left = k.has("a") || k.has("arrowleft");
    const right = k.has("d") || k.has("arrowright");
    const fine = k.has("shift");
    // The key direction is where the tiller (or, in arcade mode, the bow) goes.
    const keyDir = (right ? 1 : 0) - (left ? 1 : 0);
    if (this.role === "crew") {
      this.crewOut = clamp(this.crewOut + keyDir * dt * 0.8, 0, 1);
      if (k.has("w") || k.has("arrowup")) this.sheet = clamp(this.sheet - dt * 0.45 * this.settings.sheetSpeed, 0, 1);
      if (k.has("s") || k.has("arrowdown")) this.sheet = clamp(this.sheet + dt * 0.45 * this.settings.sheetSpeed, 0, 1);
      this.tiller = 0;
      this.pollPad(dt);
      return;
    }
    const want = this.steering === "tiller" ? keyDir : -keyDir;
    const limit = fine ? 0.35 : 1;
    const ts = this.settings.tillerSpeed, ss = this.settings.sheetSpeed;
    if (want !== 0) this.tiller = clamp(this.tiller + want * dt * 2.6 * ts, -limit, limit);
    else if (this.settings.autoCenter) this.tiller -= Math.sign(this.tiller) * Math.min(Math.abs(this.tiller), dt * 3.5 * ts);

    if (k.has("w") || k.has("arrowup")) this.sheet = clamp(this.sheet - dt * 0.45 * ss, 0, 1);
    if (k.has("s") || k.has("arrowdown")) this.sheet = clamp(this.sheet + dt * 0.45 * ss, 0, 1);

    this.pollPad(dt);
  }

  private pollPad(dt: number) {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find(p => p && p.connected);
    if (!pad) return;
    const lx = pad.axes[0] ?? 0;
    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    if (Math.abs(lx) > 0.12 || rt > 0.05 || lt > 0.05) this.usingPad = true;
    if (this.usingPad) {
      const dz = Math.abs(lx) < 0.12 ? 0 : (lx - Math.sign(lx) * 0.12) / 0.88;
      if (this.role === "crew") this.crewOut = clamp(this.crewOut + dz * dt * 0.8, 0, 1);
      else this.tiller = this.steering === "tiller" ? dz : -dz;
      this.sheet = clamp(this.sheet + (lt - rt) * dt * 0.6 * this.settings.sheetSpeed, 0, 1);
    }
    const map: [number, Action[]][] = [[3, ["camera"]], [2, ["autoTrim"]], [9, ["pause"]], [8, ["restart"]], [0, ["start", "spi"]], [1, ["switch"]]];
    for (const [i, acts] of map) {
      const now = !!pad.buttons[i]?.pressed;
      if (now && !this.padPrev[i]) { this.pressed.push(...acts); this.usingPad = true; }
      this.padPrev[i] = now;
    }
  }

  /** Rudder command for the physics: +1 turns the bow to starboard (= tiller pushed to port). */
  get rudder() {
    return -this.tiller;
  }

  reset() {
    this.tiller = 0;
    this.sheet = 0.55;
    this.crewOut = 0.3;
  }

  consume(): Action[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }
}
