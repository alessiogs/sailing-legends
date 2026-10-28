import { angleDiff, bearingTo, DEG, KNOTS } from "../core/math";
import { distanceTo, legTarget, type Course } from "../race/Course";
import type { Race, Racer } from "../race/Race";
import { isTwoPerson } from "../sailing/BoatClass";
import type { Telemetry, TrimState } from "../sailing/BoatPhysics";
import { WindField } from "../sailing/Wind";
import { t } from "../i18n";
import { legName, racerName } from "./raceNames";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const BOAT_COLORS: Record<string, string> = { player: "#ffffff", ai0: "#4aa3ff", ai1: "#ffd23f", ai2: "#ff5a4e" };

const fmtClock = (t: number) => {
  const neg = t < 0;
  const a = Math.abs(neg ? Math.ceil(t) : Math.floor(t));
  return `${neg ? "-" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};

/** What the bottom panel shows; depends on the player's Role on board. */
export type Panel = {
  gauge: { label: string; value: number; centered: boolean; ideal?: number; ends: [string, string] };
  sail: { label: string; sheet: number; optimal: number; state: TrimState; autoTrim: boolean; text?: string };
  /** A call from the Partner the player should act on (as Crew), or null. */
  call: string | null;
  /** One-line status of the Partner on board, or null. */
  partnerLine: string | null;
  /** Crew Chemistry with the Partner, or null for single-handers. */
  chem: { name: string; value: number } | null;
};


export class Hud {
  private el = {
    hud: $("hud"), phase: $("phase"), clock: $("clock"), position: $("position"), leg: $("leg"), target: $("target"),
    standings: $("standings"), speed: $("speed"), vmg: $("vmg"), twa: $("twa"), tws: $("tws"), heel: $("heel"),
    leeway: $("leeway"), shift: $("shift"), trimOpt: $("trim-opt"), trimCur: $("trim-cur"), trimState: $("trim-state"),
    autoTrim: $("auto-trim-chip"), toast: $("toast"), tags: $("tags"), tillerPos: $("tiller-pos"),
    gaugeLabel: $("gauge-label"), gaugeCenter: $("gauge-center"), gaugeIdeal: $("gauge-ideal"), gaugeLeft: $("gauge-left"),
    gaugeRight: $("gauge-right"), sailLabel: $("sail-label"), call: $("call"), partnerLine: $("partner-line"), chem: $("chem"),
    penalty: $("penalty"), penaltyText: $("penalty-text"), penaltyBar: $("penalty-bar"),
  };
  private compass = $<HTMLCanvasElement>("compass").getContext("2d")!;
  private minimap = $<HTMLCanvasElement>("minimap").getContext("2d")!;
  private tagEls = new Map<string, HTMLDivElement>();
  private slowTimer = 0;

  show(v: boolean) {
    this.el.hud.classList.toggle("hidden", !v);
    this.el.tags.classList.toggle("hidden", !v);
  }

  toast(text: string, kind: "" | "big" | "bad" | "good" = "") {
    const d = document.createElement("div");
    d.textContent = text;
    if (kind) d.className = kind;
    this.el.toast.appendChild(d);
    setTimeout(() => d.remove(), 3300);
    while (this.el.toast.children.length > 3) this.el.toast.firstChild?.remove();
  }

  update(dt: number, race: Race, me: Racer, wind: WindField, panel: Panel) {
    const tel = me.sim.telemetry, s = me.sim.state, c = race.course;
    const legs = c.legs;

    // Race card.
    this.el.phase.textContent = t(race.phase === "prestart" ? "hud.phase.prestart" : me.finishTime !== null ? "hud.phase.finished"
      : me.ocs && !me.clearedBack ? "hud.phase.ocs" : "hud.phase.racing");
    this.el.clock.textContent = fmtClock(me.finishTime ?? race.clock);
    this.el.clock.style.color = race.phase === "prestart" && race.clock > -10 ? "var(--warn)" : "";
    const standings = race.standings();
    const pos = standings.indexOf(me) + 1;
    this.el.position.textContent = race.phase === "prestart" ? "–" : t("hud.position", { position: pos, boats: standings.length });

    let target = legTarget(legs[Math.max(0, Math.min(me.leg, legs.length - 1))]);
    if (me.leg === -1) {
      this.el.leg.textContent = t(me.ocs && !me.clearedBack ? "hud.leg.ocs" : race.phase === "prestart" ? "hud.leg.prestart" : "hud.leg.cross");
      target = { x: (c.start.a.x + c.start.b.x) / 2, z: (c.start.a.z + c.start.b.z) / 2 };
    } else if (me.finishTime !== null) {
      this.el.leg.textContent = t("hud.leg.done");
    } else {
      const leg = legs[me.leg];
      this.el.leg.textContent = t("hud.leg.sailing", { leg: me.leg + 1, legs: legs.length, upwind: leg.upwind, target: legName(leg), toPort: leg.kind === "mark" });
    }
    const dist = distanceTo(target, s.x, s.z);
    const brg = bearingTo(s.x, s.z, target.x, target.z);
    const rel = angleDiff(s.heading, brg) / DEG;
    this.el.target.textContent = me.finishTime !== null ? "" : `${dist.toFixed(0)} m · ${rel >= 0 ? "▶" : "◀"} ${Math.abs(rel).toFixed(0)}°`;

    // Instruments.
    const vmg = (s.vx * Math.sin(brg) + s.vz * Math.cos(brg)) * KNOTS;
    this.el.speed.textContent = (tel.speed * KNOTS).toFixed(1);
    this.el.vmg.textContent = vmg.toFixed(1);
    const twaDeg = tel.twa / DEG;
    this.el.twa.textContent = t("hud.twa", { angle: Math.abs(twaDeg).toFixed(0), starboard: twaDeg >= 0 });
    this.el.tws.textContent = `${(tel.tws * KNOTS).toFixed(1)} kn`;
    this.el.tws.style.color = tel.puff > 0.25 ? "var(--warn)" : "";
    this.el.heel.textContent = `${Math.abs(tel.heelDeg).toFixed(0)}°`;
    this.el.leeway.textContent = t("hud.leeway", { angle: Math.abs(tel.leewayDeg).toFixed(0) });

    // Wind shift vs. the mean, and whether it helps on the current tack.
    const shift = angleDiff(wind.meanDir, wind.sample(s.x, s.z).fromDir) / DEG;
    const upwindLeg = me.leg < 0 || (me.leg < legs.length && legs[me.leg].upwind);
    if (Math.abs(shift) >= 3 && upwindLeg && me.finishTime === null) {
      const onStbd = tel.twa > 0; // wind over the starboard side
      const lift = (shift > 0) === onStbd;
      this.el.shift.textContent = t(lift ? "hud.shift.lift" : "hud.shift.header", { shift: `${shift > 0 ? "+" : ""}${shift.toFixed(0)}` });
      this.el.shift.className = `shift ${lift ? "lift" : "header"}`;
    } else {
      this.el.shift.textContent = "";
    }

    // Sail trim bar.
    const sail = panel.sail;
    const tol = 0.08;
    const lo = Math.max(0, sail.optimal - tol), hi = Math.min(1, sail.optimal + tol);
    this.el.sailLabel.textContent = sail.label;
    this.el.trimOpt.style.left = `${lo * 100}%`;
    this.el.trimOpt.style.width = `${(hi - lo) * 100}%`;
    this.el.trimCur.style.left = `${sail.sheet * 100}%`;
    this.el.trimState.textContent = sail.text ?? t(`trim.${sail.state}`);
    this.el.trimState.className = `trim-state ${sail.state}`;
    this.el.autoTrim.classList.toggle("hidden", !sail.autoTrim);
    // Top gauge: the tiller (centred, left = port) or the Crew's weight (0 in .. 1 trapeze).
    const g = panel.gauge;
    this.el.gaugeLabel.textContent = g.label;
    this.el.gaugeLeft.textContent = g.ends[0];
    this.el.gaugeRight.textContent = g.ends[1];
    this.el.gaugeCenter.classList.toggle("hidden", !g.centered);
    if (g.centered) {
      const tp = Math.max(-1, Math.min(1, g.value));
      this.el.tillerPos.style.left = `${50 + Math.min(0, tp) * 50}%`;
      this.el.tillerPos.style.width = `${Math.abs(tp) * 50}%`;
    } else {
      this.el.tillerPos.style.left = "0%";
      this.el.tillerPos.style.width = `${Math.max(0, Math.min(1, g.value)) * 100}%`;
    }
    this.el.gaugeIdeal.classList.toggle("hidden", g.ideal === undefined);
    if (g.ideal !== undefined) this.el.gaugeIdeal.style.left = `${Math.max(0, Math.min(1, g.ideal)) * 100}%`;
    this.el.call.classList.toggle("hidden", !panel.call);
    if (panel.call) this.el.call.textContent = panel.call;
    this.el.partnerLine.classList.toggle("hidden", !panel.partnerLine);
    if (panel.partnerLine) this.el.partnerLine.textContent = panel.partnerLine;
    this.el.chem.classList.toggle("hidden", !panel.chem);
    if (panel.chem) this.el.chem.innerHTML = `${t("hud.chem.pair", { name: panel.chem.name })} <b>${t("hud.chem.value", { value: panel.chem.value })}</b>`;

    // Penalty turns still owed.
    if (me.penalty) {
      const turns = Math.round(me.penalty.needed / (2 * Math.PI));
      const done = Math.min(1, Math.abs(me.penalty.turned) / me.penalty.needed);
      this.el.penalty.classList.remove("hidden");
      this.el.penaltyText.textContent = t("hud.penalty", { turns, done: Math.round(done * turns * 360), total: turns * 360 });
      this.el.penaltyBar.style.width = `${done * 100}%`;
    } else this.el.penalty.classList.add("hidden");

    this.drawCompass(tel, s.heading, brg, wind, s.x, s.z);

    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 0.25;
      this.renderStandings(race, standings, me);
    }
    this.drawMinimap(race, wind, me, target);
  }

  private renderStandings(race: Race, standings: Racer[], me: Racer) {
    const legs = race.course.legs.length;
    this.el.standings.innerHTML = standings.map((r, i) => {
      const status = r.dsq ? t("standings.dsq") : r.finishTime !== null ? fmtClock(r.finishTime)
        : r.penalty ? t("standings.penalty")
        : r.leg < 0 ? t(r.ocs && !r.clearedBack ? "standings.ocs" : race.phase === "prestart" ? "standings.prestart" : "standings.start")
        : t("standings.leg", { leg: r.leg + 1, legs });
      return `<li class="${r === me ? "me" : ""}"><span class="n">${i + 1}</span><span><i class="dot" style="background:${BOAT_COLORS[r.id] ?? "#ccc"}"></i>${racerName(r)}</span><span class="s">${status}</span></li>`;
    }).join("");
  }

  /** Boat-up wind dial: true wind arrow, no-go sector, bearing to the next mark. */
  private drawCompass(tel: Telemetry, heading: number, brgTarget: number, wind: WindField, x: number, z: number) {
    const g = this.compass, W = 300, cx = W / 2, cy = W / 2, R = 118;
    g.clearRect(0, 0, W, W);
    g.save();
    g.translate(cx, cy);
    g.fillStyle = "rgba(6,24,38,.62)";
    g.strokeStyle = "rgba(205,233,245,.25)";
    g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, R + 22, 0, Math.PI * 2); g.fill(); g.stroke();
    // Canvas angle for a bearing relative to the bow (0 = up, clockwise).
    const ang = (rel: number) => rel - Math.PI / 2;
    const twa = tel.twa;
    // No-go sector (~40° either side of the wind).
    g.fillStyle = "rgba(255,107,91,.28)";
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, ang(twa - 40 * DEG), ang(twa + 40 * DEG)); g.closePath(); g.fill();
    // Optimal close-hauled lines.
    g.strokeStyle = "rgba(62,224,143,.6)"; g.lineWidth = 2;
    for (const d of [-47, 47]) {
      const a = ang(twa + d * DEG);
      g.beginPath(); g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke();
    }
    // Ticks.
    g.strokeStyle = "rgba(205,233,245,.45)"; g.lineWidth = 2;
    for (let i = 0; i < 36; i++) {
      const a = (i * 10 * DEG) - Math.PI / 2, r0 = i % 9 === 0 ? R - 14 : R - 6;
      g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke();
    }
    // Boat silhouette.
    g.fillStyle = "#e9f3f7";
    g.beginPath(); g.moveTo(0, -36); g.lineTo(16, -6); g.lineTo(14, 32); g.lineTo(-14, 32); g.lineTo(-16, -6); g.closePath(); g.fill();
    // Wind arrow from the rim toward the centre.
    const wa = ang(twa);
    const puff = wind.sample(x, z).puff;
    g.strokeStyle = puff > 0.25 ? "#ffd23f" : "#6fd3ff"; g.fillStyle = g.strokeStyle; g.lineWidth = 7;
    const ox = Math.cos(wa) * (R + 16), oy = Math.sin(wa) * (R + 16), ix = Math.cos(wa) * 52, iy = Math.sin(wa) * 52;
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(ix, iy); g.stroke();
    g.beginPath(); g.moveTo(ix, iy);
    g.lineTo(ix + Math.cos(wa + 0.45) * 22, iy + Math.sin(wa + 0.45) * 22);
    g.lineTo(ix + Math.cos(wa - 0.45) * 22, iy + Math.sin(wa - 0.45) * 22); g.closePath(); g.fill();
    // Next mark marker on the rim.
    const ta = ang(angleDiff(heading, brgTarget));
    g.fillStyle = "#3ee08f";
    g.beginPath();
    g.arc(Math.cos(ta) * (R + 8), Math.sin(ta) * (R + 8), 10, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = "#cfe2ea"; g.font = "600 22px Inter, system-ui, sans-serif"; g.textAlign = "center";
    g.fillText(`${(tel.tws * KNOTS).toFixed(0)} kn`, cx, cy + 72);
  }

  private drawMinimap(race: Race, wind: WindField, me: Racer, target: { x: number; z: number }) {
    const g = this.minimap, W = 400, H = 460, c: Course = race.course;
    // Chart bounds from the course itself (works for any class / course size), north-up.
    const pts = [c.start.a, c.start.b, ...c.marks];
    const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const spanZ = Math.max(...zs) - Math.min(...zs) + 30;
    const spanX = Math.max(spanZ * ((W - 40) / (H - 40)), Math.max(...xs) - Math.min(...xs) + 30);
    const minX = midX - spanX / 2, maxX = midX + spanX / 2;
    const minZ = Math.min(...zs) - 15, maxZ = minZ + spanX * ((H - 40) / (W - 40));
    const sx = (x: number) => ((x - minX) / (maxX - minX)) * (W - 40) + 20;
    const sz = (z: number) => H - 20 - ((z - minZ) / (maxZ - minZ)) * (H - 40);
    const k = (W - 40) / (maxX - minX);
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(10,48,70,.55)";
    g.fillRect(0, 0, W, H);
    // Puffs.
    for (const p of wind.puffs) {
      const a = WindField.puffFade(p) * Math.min(1, p.strength / 2.2);
      if (a < 0.05) continue;
      const grd = g.createRadialGradient(sx(p.x), sz(p.z), 0, sx(p.x), sz(p.z), p.radius * k * 1.2);
      grd.addColorStop(0, `rgba(2,14,28,${0.55 * a})`);
      grd.addColorStop(1, "rgba(2,14,28,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(sx(p.x), sz(p.z), p.radius * k * 1.2, 0, Math.PI * 2); g.fill();
    }
    // Laylines to the next upwind target.
    const leg = me.leg >= 0 && me.leg < c.legs.length ? c.legs[me.leg] : null;
    const dir = wind.meanDir + wind.shift();
    if (leg && leg.upwind && me.finishTime === null) {
      g.strokeStyle = "rgba(62,224,143,.35)"; g.lineWidth = 2; g.setLineDash([6, 6]);
      for (const d of [-47, 47]) {
        const b = dir + Math.PI + d * DEG;
        g.beginPath(); g.moveTo(sx(target.x), sz(target.z));
        g.lineTo(sx(target.x + Math.sin(b) * 160), sz(target.z + Math.cos(b) * 160)); g.stroke();
      }
      g.setLineDash([]);
    }
    // Lines.
    const line = (a: { x: number; z: number }, b: { x: number; z: number }, col: string) => {
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(sx(a.x), sz(a.z)); g.lineTo(sx(b.x), sz(b.z)); g.stroke(); g.setLineDash([]);
    };
    line(c.start.a, c.start.b, "rgba(255,255,255,.7)");
    for (const l of c.legs) if (l.kind === "finish") line(l.line.a, l.line.b, "rgba(111,211,255,.8)");
    // Marks.
    for (const l of c.legs) {
      if (l.kind !== "mark") continue;
      g.fillStyle = "#ff8a2a";
      g.beginPath(); g.arc(sx(l.mark.x), sz(l.mark.z), 7, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#ff8a2a"; g.beginPath(); g.arc(sx(c.pin.x), sz(c.pin.z), 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e9f3f7"; g.fillRect(sx(c.committee.x) - 5, sz(c.committee.z) - 10, 10, 20);
    // Target ring.
    g.strokeStyle = "#3ee08f"; g.lineWidth = 3;
    g.beginPath(); g.arc(sx(target.x), sz(target.z), 13, 0, Math.PI * 2); g.stroke();
    // Boats.
    for (const r of race.racers) {
      const st = r.sim.state;
      g.save();
      // Keep boats that wander off the chart pinned to its edge.
      g.translate(Math.max(10, Math.min(W - 10, sx(st.x))), Math.max(10, Math.min(H - 10, sz(st.z))));
      g.rotate(st.heading);
      g.fillStyle = BOAT_COLORS[r.id] ?? "#ccc";
      g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(-7, 8); g.closePath(); g.fill();
      if (r === me) { g.strokeStyle = "#071827"; g.lineWidth = 2; g.stroke(); }
      g.restore();
    }
    // Wind arrow.
    g.save();
    g.translate(W - 34, 34);
    g.rotate(dir);
    g.strokeStyle = "#6fd3ff"; g.fillStyle = "#6fd3ff"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 14); g.stroke();
    g.beginPath(); g.moveTo(0, 20); g.lineTo(8, 6); g.lineTo(-8, 6); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = "#cfe2ea"; g.font = "600 18px Inter, system-ui, sans-serif"; g.textAlign = "left";
    g.fillText(t("hud.minimap.wind"), W - 84, 74);
  }

  /** Floating name tags; `project` returns screen coords or null when off-screen. */
  updateTags(race: Race, me: Racer, project: (x: number, y: number, z: number) => { x: number; y: number } | null) {
    const standings = race.standings();
    for (const r of race.racers) {
      if (r === me) continue;
      let el = this.tagEls.get(r.id);
      if (!el) {
        el = document.createElement("div");
        el.style.borderLeft = `3px solid ${BOAT_COLORS[r.id] ?? "#ccc"}`;
        this.el.tags.appendChild(el);
        this.tagEls.set(r.id, el);
      }
      const p = project(r.sim.state.x, isTwoPerson(r.sim.cls) ? 7.2 : 3.6, r.sim.state.z);
      if (!p) { el.style.display = "none"; continue; }
      el.style.display = "";
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      const pos = standings.indexOf(r) + 1;
      el.textContent = race.phase === "prestart" ? racerName(r) : t("hud.tag", { position: pos, name: racerName(r), ocs: r.ocs && !r.clearedBack });
    }
  }

  clearTags() {
    for (const el of this.tagEls.values()) el.remove();
    this.tagEls.clear();
  }
}
