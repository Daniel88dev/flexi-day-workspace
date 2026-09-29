import { box, set } from "../dom.js";
import { rng } from "../anim.js";

// Film grain keyed to the output frame (not the sub-sample time), so motion blur never averages it away.
let grain;
const TILES = 10;
const urls = [];

export function build(stage) {
  const rand = rng(20260929);
  for (let k = 0; k < TILES; k++) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rand() + rand() + rand() - 1.5) * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    urls.push(`url(${cv.toDataURL("image/png")})`);
  }
  box(stage, {
    w: 1920,
    h: 1080,
    style: {
      pointerEvents: "none",
      background:
        "radial-gradient(130% 120% at 50% 50%, oklch(0 0 0 / 0) 55%, oklch(0.1 0.02 285 / 0.22) 100%)",
      mixBlendMode: "multiply",
    },
  });
  grain = box(stage, {
    w: 1920,
    h: 1080,
    style: {
      pointerEvents: "none",
      mixBlendMode: "overlay",
      opacity: 0.075,
      imageRendering: "pixelated",
    },
  });
}

export function render(t, f) {
  const k = ((f % TILES) + TILES) % TILES;
  const r = rng(f * 7919 + 13);
  set(grain, "backgroundImage", urls[k]);
  set(grain, "backgroundPosition", `${Math.floor(r() * 256)}px ${Math.floor(r() * 256)}px`);
}
