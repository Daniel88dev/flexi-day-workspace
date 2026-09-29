// Renders the reel frame by frame in headless Chrome and encodes it with ffmpeg.
//
//   node render.mjs                      full master: 60 fps, K sub-frames per frame (motion blur)
//   node render.mjs --preview            quick look: 30 fps, no motion blur
//   node render.mjs --stills 1.2,4.5     single frames into out/stills, plus a contact sheet
//   node render.mjs --from 4 --to 6      render only part of the timeline
//
// Options: --k 8 (sub-frames), --shutter 0.5 (fraction of a frame), --workers 5, --crf 14
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, "out");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1920,
  H = 1080,
  DURATION = 15;

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};

const preview = opt("preview", false) === true;
const stills = opt("stills", null);
const FPS = Number(opt("fps", preview ? 30 : 60));
const K = Number(opt("k", preview || stills ? 1 : 8));
const SHUTTER = Number(opt("shutter", 0.5));
const WORKERS = Number(opt("workers", 5));
const CRF = Number(opt("crf", 14));
const FROM = Number(opt("from", 0));
const TO = Number(opt("to", DURATION));
const NAME = opt("name", preview ? "flexiday-reel-preview" : "flexiday-reel");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const file = path.join(
      ROOT,
      decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)
    );
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function openPage(browser, port) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[page]", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("[console]", m.text()));
  await page.goto(`http://127.0.0.1:${port}/index.html?render`);
  await page.waitForFunction(() => globalThis.__ready === true, null, { timeout: 60000 });
  const cdp = await context.newCDPSession(page);
  const shot = async (t, f) => {
    await page.evaluate(([t, f]) => globalThis.__render(t, f), [t, f]);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      optimizeForSpeed: true,
    });
    return Buffer.from(data, "base64");
  };
  return { context, page, shot };
}

function ffmpeg(args, { quiet = true } = {}) {
  const p = spawn(
    "ffmpeg",
    ["-hide_banner", "-loglevel", quiet ? "error" : "info", "-y", ...args],
    {
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
  p.done = once(p, "close").then(([code]) => {
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  });
  return p;
}

async function renderStills(browser, port) {
  const times = String(stills)
    .split(",")
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  const dir = path.join(OUT, "stills");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { shot, context } = await openPage(browser, port);
  const files = [];
  for (const [i, t] of times.entries()) {
    const f = Math.round(t * 60);
    const buf = K > 1 ? await blurredStill(shot, t, f) : await shot(t, f);
    const file = path.join(dir, `${String(i).padStart(2, "0")}_t${t.toFixed(3)}.png`);
    fs.writeFileSync(file, buf);
    files.push(file);
  }
  await context.close();
  if (files.length > 1) {
    const cols = files.length <= 4 ? 2 : files.length <= 9 ? 3 : 4;
    const rows = Math.ceil(files.length / cols);
    const tw = Math.floor(1920 / cols),
      th = Math.round((tw * 9) / 16);
    const inputs = files.flatMap((f) => ["-i", f]);
    const pads = files.map((_, i) => `[${i}:v]scale=${tw}:${th}[s${i}]`).join(";");
    const blanks = cols * rows - files.length;
    let chain = files.map((_, i) => `[s${i}]`).join("");
    let extra = "";
    for (let b = 0; b < blanks; b++) {
      extra += `;color=c=black:s=${tw}x${th}:d=1[b${b}]`;
      chain += `[b${b}]`;
    }
    const layout = Array.from(
      { length: cols * rows },
      (_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`
    ).join("|");
    const graph = `${pads}${extra};${chain}xstack=inputs=${cols * rows}:layout=${layout}`;
    const p = ffmpeg([
      ...inputs,
      "-filter_complex",
      graph,
      "-frames:v",
      "1",
      path.join(dir, "sheet.png"),
    ]);
    p.stdin.end();
    await p.done;
  }
  console.log(`stills → ${dir}`);
}

async function blurredStill(shot, t, f) {
  const tmp = path.join(OUT, "stills", `_k${f}`);
  fs.mkdirSync(tmp, { recursive: true });
  const bufs = [];
  for (let k = 0; k < K; k++)
    bufs.push(await shot((f + ((k + 0.5) / K) * SHUTTER - SHUTTER / 2) / 60, f));
  const p = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-c:v",
    "png",
    "-i",
    "-",
    "-vf",
    `format=gbrp16le,tmix=frames=${K},select='eq(n\\,${K - 1})',format=rgb24`,
    "-frames:v",
    "1",
    "-f",
    "image2",
    "-c:v",
    "png",
    "-",
  ]);
  const chunks = [];
  p.stdout.on("data", (d) => chunks.push(d));
  for (const b of bufs) p.stdin.write(b);
  p.stdin.end();
  await once(p, "close");
  fs.rmSync(tmp, { recursive: true, force: true });
  return Buffer.concat(chunks);
}

async function renderVideo(browser, port) {
  const f0 = Math.round(FROM * FPS),
    f1 = Math.round(TO * FPS);
  const total = f1 - f0;
  const chunkDir = path.join(OUT, "chunks");
  fs.rmSync(chunkDir, { recursive: true, force: true });
  fs.mkdirSync(chunkDir, { recursive: true });
  const per = Math.ceil(total / WORKERS);
  const progress = new Array(WORKERS).fill(0);
  const started = Date.now();
  const timer = setInterval(() => {
    const done = progress.reduce((a, b) => a + b, 0);
    const el = (Date.now() - started) / 1000;
    const eta = done ? (el / done) * (total - done) : 0;
    process.stdout.write(
      `\r  ${done}/${total} frames · ${el.toFixed(0)}s elapsed · eta ${eta.toFixed(0)}s   `
    );
  }, 1000);

  const chunks = [];
  await Promise.all(
    Array.from({ length: WORKERS }, async (_, w) => {
      const a = f0 + w * per,
        b = Math.min(f1, a + per);
      if (a >= b) return;
      const file = path.join(chunkDir, `chunk_${String(w).padStart(2, "0")}.mkv`);
      chunks[w] = file;
      const { shot, context } = await openPage(browser, port);
      const vf =
        K > 1
          ? `format=gbrp16le,tmix=frames=${K},select='eq(mod(n\\,${K})\\,${K - 1})',setpts=N/(${FPS}*TB)`
          : `format=gbrp16le,setpts=N/(${FPS}*TB)`;
      const ff = ffmpeg([
        "-f",
        "image2pipe",
        "-framerate",
        String(FPS * K),
        "-c:v",
        "png",
        "-i",
        "-",
        "-vf",
        vf,
        "-r",
        String(FPS),
        "-c:v",
        "ffv1",
        "-level",
        "3",
        "-pix_fmt",
        "gbrp16le",
        file,
      ]);
      for (let f = a; f < b; f++) {
        for (let k = 0; k < K; k++) {
          const t = K > 1 ? (f + ((k + 0.5) / K) * SHUTTER - SHUTTER / 2) / FPS : f / FPS;
          const buf = await shot(t, Math.round((f / FPS) * 60));
          if (!ff.stdin.write(buf)) await once(ff.stdin, "drain");
        }
        progress[w]++;
      }
      ff.stdin.end();
      await ff.done;
      await context.close();
    })
  );
  clearInterval(timer);
  process.stdout.write("\n");

  const list = path.join(chunkDir, "list.txt");
  fs.writeFileSync(
    list,
    chunks
      .filter(Boolean)
      .map((c) => `file '${c}'`)
      .join("\n")
  );
  const audio = path.join(OUT, "soundtrack.wav");
  const withAudio = fs.existsSync(audio) && FROM === 0 && TO === DURATION;
  const out = path.join(OUT, `${NAME}.mp4`);
  const p = ffmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    ...(withAudio ? ["-i", audio] : []),
    "-vf",
    "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    String(CRF),
    "-tune",
    "animation",
    "-profile:v",
    "high",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-color_range",
    "tv",
    ...(withAudio ? ["-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest"] : []),
    "-movflags",
    "+faststart",
    out,
  ]);
  p.stdin.end();
  await p.done;
  console.log(`video → ${out} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}

const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars", "--mute-audio"],
});
try {
  fs.mkdirSync(OUT, { recursive: true });
  if (stills) await renderStills(browser, port);
  else await renderVideo(browser, port);
} finally {
  await browser.close();
  server.close();
}
