/**
 * The HUD's no-overlap check, run locally in headless Chromium (CI has no browser):
 *
 *   NODE_PATH=$(npm root -g) node scripts/hud-overlap.cjs <built site dir> [screenshot dir] [--lang=en,it] [--only=390x844]
 *
 * It opens a race for the Optimist, the 420 as Helm and the 420 as Crew at 390x844, 360x740, 844x390, 1024x600,
 * 1280x720 and 1920x1080, with the Standings/map panel closed and open, and in two states: as the race has it, and a
 * worst case (a full standings list (8 rows, as the HUD shows a bigger fleet), a long message, the shift, Partner call and penalty pills, the Chemistry and
 * Partner lines all showing at once). It fails when two visible HUD boxes (every element with `data-hud`) intersect,
 * when one is cut off by the screen edge or holds text that spills out of it, when a button is under 44 px, or when
 * a control is covered at its centre. Floating boat name tags follow the boats and are not part of it.
 * The game must be built first: see docs/agents/sandbox-build.md.
 */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const SIZES = [[390, 844], [360, 740], [844, 390], [1024, 600], [1280, 720], [1920, 1080]];
const BOATS = [
  { name: "optimist", boat: "optimist", role: null },
  { name: "420-helm", boat: "420", role: "helm" },
  { name: "420-crew", boat: "420", role: "crew" },
];
// A long message and the other lines a worst case shows, per language.
const WORST = {
  en: {
    toast: "Giulia: «Come in! We are about to capsize to windward» → drag your weight to the left",
    shift: "Headed -12° · consider tacking", call: "Giulia: «Come in! We are about to capsize to windward» → drag your weight to the left",
    penalty: "Penalty: 2 turns still to do (180° / 720°) · always turn the same way", line: "Giulia: sitting in · spinnaker moving · tap Spi to hoist or drop",
    names: ["You/Giulia", "Luca/Sara", "Marco/Tommaso", "Elena/Pietro", "Giulia/Tommaso", "Sofia/Matteo", "Chiara/Lorenzo", "Alessandro/Francesca"],
    status: "leg 2/3",
  },
  it: {
    toast: "Giulia: «Dentro! Ci rovesciamo sopravvento» → trascina il peso a sinistra",
    shift: "Contro -12° · valuta la virata", call: "Giulia: «Dentro! Ci rovesciamo sopravvento» → trascina il peso a sinistra",
    penalty: "Penalità: 2 giri da fare (180° / 720°) · gira sempre nello stesso verso", line: "Giulia: seduto dentro · spi in manovra · tocca Spi per issare/ammainare",
    names: ["Tu/Giulia", "Luca/Sara", "Marco/Tommaso", "Elena/Pietro", "Giulia/Tommaso", "Sofia/Matteo", "Chiara/Lorenzo", "Alessandro/Francesca"],
    status: "lato 2/3",
  },
};
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const args = process.argv.slice(2);
const flag = name => (args.find(a => a.startsWith(`--${name}=`)) || "").split("=")[1];
const [siteDir, shotDir] = args.filter(a => !a.startsWith("--"));
if (!siteDir) { console.error("usage: hud-overlap.cjs <built site dir> [screenshot dir] [--lang=en,it] [--only=390x844]"); process.exit(2); }
const languages = (flag("lang") || "en,it").split(",");
const only = flag("only");
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(dir, p);
      if (!file.startsWith(path.resolve(dir)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    }).listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** Runs in the page: freezes the frame loop, optionally fills in the worst case, and measures every HUD box. */
function measure({ worst, text, open }) {
  window.__game.showPanel(open);
  const hud = document.getElementById("hud");
  if (worst) {
    window.__game.toast(text.toast, "bad");
    const show = (id, value) => { const el = document.getElementById(id); el.classList.remove("hidden"); el.textContent = value; };
    const shift = document.getElementById("shift"); shift.textContent = text.shift; shift.className = "status-pill warn";
    show("call", text.call);
    show("penalty-text", text.penalty); document.getElementById("penalty").classList.remove("hidden");
    show("chem", text.line); show("partner-line", text.line);
    const standings = document.getElementById("standings");
    standings.replaceChildren(...text.names.map((name, i) => {
      const li = document.createElement("li");
      if (i === 0) li.className = "me";
      for (const [cls, content] of [["n", String(i + 1)], ["", name], ["s", text.status]]) {
        const span = document.createElement("span"); if (cls) span.className = cls; if (!cls) span.setAttribute("data-truncates", "");
        span.textContent = content; li.append(span);
      }
      return li;
    }));
  }
  for (const el of document.querySelectorAll("#toast div")) el.style.animation = "none";
  window.__game.layoutHud(); // the HUD trims its panel a few times a second; do it now that the content is in
  const vw = window.innerWidth, vh = window.innerHeight;
  const label = el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}${el.dataset.action ? `[${el.dataset.action}]` : ""}`;
  const boxes = [];
  for (const el of document.querySelectorAll("[data-hud]")) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0 || r.height === 0 || el.closest(".hidden")) continue;
    boxes.push({ el, label: label(el), r });
  }
  const problems = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (a.r.left < -0.5 || a.r.top < -0.5 || a.r.right > vw + 0.5 || a.r.bottom > vh + 0.5)
      problems.push(`${a.label} is cut off by the screen edge (${Math.round(a.r.left)},${Math.round(a.r.top)} to ${Math.round(a.r.right)},${Math.round(a.r.bottom)} in ${vw}x${vh})`);
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 0.5 && h > 0.5) problems.push(`${a.label} overlaps ${b.label} (${Math.round(w)}x${Math.round(h)} px)`);
    }
    for (const part of [a.el, ...a.el.querySelectorAll("*")]) {
      const clipsHeight = getComputedStyle(part).overflowY !== "visible";
      // A name marked `data-truncates` ends in an ellipsis when it is too long; any other text must fit its box.
      if (part.hasAttribute("data-truncates")) continue;
      if (part.clientWidth > 0 && (part.scrollWidth > part.clientWidth + 1 || (clipsHeight && part.scrollHeight > part.clientHeight + 1)))
        problems.push(`text is cut off or spills out of ${label(part)} (in ${a.label}): ${part.scrollWidth}x${part.scrollHeight} in ${part.clientWidth}x${part.clientHeight}`);
    }
  }
  for (const { el, label: name, r } of boxes) {
    const touch = el.matches("button, .slider, .tiller");
    if (el.matches("button") && (r.width < 43.5 || r.height < 43.5)) problems.push(`${name} is smaller than 44 px (${Math.round(r.width)}x${Math.round(r.height)})`);
    if (touch) {
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || !(el === top || el.contains(top))) problems.push(`${name} is covered at its centre by ${top ? label(top) : "nothing"}`);
    }
  }
  // As the race has it, an open panel keeps everything; only the worst case may squeeze it (see src/ui/panelFit.ts).
  const panelEl = document.getElementById("panel");
  if (open && !worst && (panelEl.classList.contains("trimmed") || panelEl.querySelector(".trimmed"))) problems.push("the open panel had to give up a part for lack of room, with no extra messages showing");
  const pause = document.getElementById("touch-pause").getBoundingClientRect();
  if (pause.width < 43.5 || pause.height < 43.5) problems.push("#touch-pause is smaller than 44 px");
  return { boxes: boxes.map(b => b.label), problems, hudHidden: hud.classList.contains("hidden") };
}

(async () => {
  const server = await serve(siteDir);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const failures = [];
  let checks = 0;
  for (const language of languages) {
    for (const { name, boat, role } of BOATS) {
      // Phones (touch wording) and bigger screens (keyboard wording) are separate browser contexts.
      for (const phone of [true, false]) {
        const sized = SIZES.filter(([w, h]) => (w <= 844) === phone && (!only || only === `${w}x${h}`));
        if (!sized.length) continue;
        const [w0, h0] = sized[0];
        const context = await browser.newContext(phone
          ? { viewport: { width: w0, height: h0 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }
          : { viewport: { width: w0, height: h0 } });
        const page = await context.newPage();
        page.on("pageerror", e => failures.push(`[${language} ${name}] page error: ${e.message}`));
        await page.goto(url);
        await page.evaluate(lang => localStorage.setItem("sl-prefs", JSON.stringify({ language: lang })), language);
        await page.goto(url);
        await page.waitForFunction(() => window.__game && window.__game.session, null, { timeout: 90000 });
        await page.waitForTimeout(500);
        await page.click(`#class-opt button[data-v="${boat}"]`);
        if (role) await page.click(`#role-opt button[data-v="${role}"]`);
        await page.click("#start-btn");
        await page.waitForFunction(() => window.__game.mode === "racing");
        await page.waitForTimeout(1500);
        // Freeze the frame loop while measuring, so the HUD keeps what the check puts in it.
        await page.evaluate(() => {
          const raf = window.requestAnimationFrame.bind(window);
          window.__freeze = () => { window.__pending = null; window.requestAnimationFrame = cb => { window.__pending = cb; return 1; }; };
          window.__thaw = () => { window.requestAnimationFrame = raf; const cb = window.__pending; window.__pending = null; if (cb) raf(cb); };
        });
        for (const [w, h] of sized) {
          await page.setViewportSize({ width: w, height: h });
          for (const worst of [false, true]) {
            for (const open of [false, true]) {
              await page.evaluate(() => window.__thaw());
              await page.waitForTimeout(500);
              await page.evaluate(() => window.__freeze());
              await page.waitForFunction(() => window.__pending, null, { polling: 50 }); // the frame in flight has ended and asked for the next one
              const result = await page.evaluate(measure, { worst, text: WORST[language], open });
              const tag = `${language} ${name} ${w}x${h} panel ${open ? "open" : "closed"}${worst ? " worst-case" : ""}`;
              checks++;
              if (shotDir) await page.screenshot({ path: path.join(shotDir, `${w}x${h}-${name}-${language}-${open ? "open" : "closed"}${worst ? "-worst" : ""}.jpg`), type: "jpeg", quality: 72 });
              console.log(`${result.problems.length ? "FAIL" : "ok  "} ${tag} (${result.boxes.length} boxes)`);
              for (const p of result.problems) { console.log(`       ${p}`); failures.push(`[${tag}] ${p}`); }
            }
          }
        }
        await context.close();
      }
    }
  }
  await browser.close();
  server.close();
  console.log(failures.length ? `\n${failures.length} problem(s) in ${checks} checks` : `\nNo overlaps: ${checks} checks passed`);
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
