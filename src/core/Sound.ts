/**
 * All sound is synthesized with WebAudio (no audio files): wind, water rushing past the hull,
 * the sail flapping when it luffs, and race signals. Starts on the first user gesture.
 */
declare global {
  interface Window {
    /** Older Safari's prefixed AudioContext. */
    webkitAudioContext?: typeof AudioContext;
  }
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private wind!: GainNode;
  private whistle!: GainNode;
  private water!: GainNode;
  private waterFilter!: BiquadFilterNode;
  private flap!: GainNode;
  private noise!: AudioBuffer;
  muted = false;
  private flapPhase = 0;

  /** Call from a user gesture (click / key press). Safe to call more than once. */
  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // Two seconds of white noise, looped, feeds every "airy" sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const src = (offset: number) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(0, offset);
      return s;
    };

    // Wind: low rumble plus a faint whistle in the rigging.
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    const wl = ctx.createBiquadFilter(); wl.type = "lowpass"; wl.frequency.value = 520;
    src(0).connect(wl).connect(this.wind).connect(this.master);
    this.whistle = ctx.createGain(); this.whistle.gain.value = 0;
    const wb = ctx.createBiquadFilter(); wb.type = "bandpass"; wb.frequency.value = 1400; wb.Q.value = 14;
    src(0.5).connect(wb).connect(this.whistle).connect(this.master);

    // Water along the hull.
    this.water = ctx.createGain(); this.water.gain.value = 0;
    this.waterFilter = ctx.createBiquadFilter(); this.waterFilter.type = "bandpass"; this.waterFilter.frequency.value = 500; this.waterFilter.Q.value = 0.8;
    src(1.0).connect(this.waterFilter).connect(this.water).connect(this.master);

    // Sail flapping (amplitude-modulated in update()).
    this.flap = ctx.createGain(); this.flap.gain.value = 0;
    const fh = ctx.createBiquadFilter(); fh.type = "bandpass"; fh.frequency.value = 900; fh.Q.value = 0.7;
    src(1.4).connect(fh).connect(this.flap).connect(this.master);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Continuous sounds, once per frame. aws in m/s, speed in m/s, luff 0..1, active = racing. */
  update(dt: number, aws: number, speed: number, luff: number, active: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = active ? 1 : 0.35;
    const w = Math.min(1, aws / 9);
    this.wind.gain.setTargetAtTime(0.22 * w * w * k, t, 0.3);
    this.whistle.gain.setTargetAtTime(0.03 * Math.max(0, w - 0.55) * k, t, 0.5);
    const v = Math.min(1, Math.abs(speed) / 2.2);
    this.water.gain.setTargetAtTime(0.5 * Math.pow(v, 1.4) * k, t, 0.2);
    this.waterFilter.frequency.setTargetAtTime(350 + 700 * v, t, 0.3);
    // Flutter at ~7-11 Hz, faster in more wind.
    this.flapPhase += dt * (7 + 4 * w) * Math.PI * 2;
    const flutter = 0.5 + 0.5 * Math.sin(this.flapPhase);
    this.flap.gain.setTargetAtTime(0.32 * luff * w * flutter * flutter * k, t, 0.015);
  }

  private tone(freqs: number[], dur: number, type: OscillatorType, vol: number, attack = 0.01, glideTo?: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.08));
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
    g.connect(lp).connect(this.master);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(f * glideTo, t + dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** Committee boat horn. */
  horn(dur = 0.9) { this.tone([196, 247], dur, "sawtooth", 0.12, 0.03); }
  /** Short countdown beep. */
  beep() { this.tone([880], 0.12, "sine", 0.15); }
  /** Mark rounded. */
  chime() { this.tone([660, 990], 0.45, "triangle", 0.12, 0.01, 1.5); }
  /** Penalty given. */
  buzzer() { this.tone([110, 116], 0.5, "square", 0.07); }

  /** Hull knock on contact. */
  bump() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + 0.3);
  }
}
