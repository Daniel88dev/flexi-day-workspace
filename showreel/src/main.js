import * as calendar from "./scenes/calendar.js";
import * as approve from "./scenes/approve.js";
import * as balance from "./scenes/balance.js";
import * as type from "./scenes/type.js";
import * as endcard from "./scenes/endcard.js";
import * as overlay from "./scenes/overlay.js";
import { vblurFilter } from "./scenes/shared.js";
import { DURATION, FPS } from "./timeline.js";

const SCENES = [calendar, approve, balance, type, endcard, overlay];

const FACES = [
  "500 20px Bricolage",
  "600 20px Bricolage",
  "700 20px Bricolage",
  "800 20px Bricolage",
  "400 20px Hanken",
  "500 20px Hanken",
  "600 20px Hanken",
  "700 20px Hanken",
  "400 20px Instrument",
  "italic 400 20px Instrument",
];

async function boot() {
  const loaded = await Promise.all(FACES.map((f) => document.fonts.load(f)));
  const missing = FACES.filter((_, i) => loaded[i].length === 0);
  // A fallback font would render without complaint, so refuse to start instead.
  if (missing.length)
    throw new Error(`Brand fonts missing (${missing.join(", ")}): run npm install`);
  await document.fonts.ready;
  const stage = document.getElementById("stage");
  vblurFilter(stage);
  for (const s of SCENES) s.build(stage);

  window.__render = (t, f = Math.round(t * FPS)) => {
    for (const s of SCENES) s.render(t, f);
  };

  const params = new URLSearchParams(location.search);
  if (!params.has("render")) {
    // Preview: fit the stage to the window; ?t=4.2 freezes a moment, otherwise it loops in real time.
    const fit = () => {
      const k = Math.min(innerWidth / 1920, innerHeight / 1080);
      stage.style.transform = `scale(${k})`;
    };
    fit();
    addEventListener("resize", fit);
    const hud = document.getElementById("hud");
    hud.style.display = "block";
    if (params.has("t")) {
      const t = parseFloat(params.get("t"));
      window.__render(t);
      hud.textContent = `t=${t.toFixed(3)}s`;
    } else {
      const t0 = performance.now();
      const speed = parseFloat(params.get("speed") || "1");
      const loop = () => {
        const t = (((performance.now() - t0) / 1000) * speed) % DURATION;
        window.__render(t);
        hud.textContent = `t=${t.toFixed(2)}s`;
        requestAnimationFrame(loop);
      };
      loop();
    }
  } else {
    window.__render(0);
  }
  window.__ready = true;
}

boot();
