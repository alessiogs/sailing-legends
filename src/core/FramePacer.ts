/** Frame pacing for the render loop: skips animation frames that come sooner than the wanted interval. */

/** Target frame rate when the player is not racing (menus, pause, results, career). */
export const IDLE_FPS = 10;
/** Frame-rate cap on phones and tablets while racing. */
export const PHONE_FPS = 60;

/** Frames may come a little early (display jitter), so accept an interval this fraction short. */
const TOLERANCE = 0.9;

export class FramePacer {
  private acc = 0;

  /**
   * Add the time since the last animation frame. Returns the time to simulate and draw when a frame is due
   * (all the time accumulated since the last drawn frame), or null to skip it. `fps` is the wanted rate, or
   * 0 for no cap.
   */
  tick(dt: number, fps: number): number | null {
    this.acc += dt;
    if (fps > 0 && this.acc < TOLERANCE / fps) return null;
    const out = this.acc;
    this.acc = 0;
    return out;
  }
}
