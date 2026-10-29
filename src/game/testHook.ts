import type { CareerState } from "../career/CareerSave";
import type { Input } from "../core/Input";
import { angleDiff } from "../core/math";
import type { RaceSession } from "../race/RaceSession";
import type { GameController, Mode } from "./GameController";

/** The debug/testing hook on `window.__game`, used by automated browser tests. */
export type GameTestHook = {
  readonly session: RaceSession;
  readonly input: Input;
  readonly mode: Mode;
  /** The Career in progress, or `null`. */
  readonly career: CareerState | null;
  /** Starts a race as the menu's start button does. */
  start(): void;
  angleDiff: typeof angleDiff;
  /** The debug autopilot for the player boat. */
  autopilot: boolean;
  /** Sails the race ahead by `seconds` of race time. */
  fastForward(seconds: number): void;
};

declare global {
  interface Window {
    __game?: GameTestHook;
    /** Frames per second over the last second, for automated browser tests. */
    __fps?: number;
  }
}

/** Puts the test hook on `window.__game`. */
export function installTestHook(game: GameController, input: Input) {
  window.__game = {
    get session() { return game.session; }, input, get mode() { return game.mode; }, get career() { return game.career; },
    start: () => game.startFromMenu(), angleDiff,
    get autopilot() { return game.controls.autopilotOn; },
    set autopilot(on: boolean) { game.controls.autopilotOn = on; },
    fastForward(seconds: number) { game.fastForward(seconds); },
  };
}
