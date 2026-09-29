# flexiday motion reel

A 15-second, 1080p60 brand spot for flexiday, built as code: an HTML composition rendered frame by
frame in headless Chrome, with a soundtrack synthesised from the same cue sheet.

## Render

```bash
npm install
node audio.mjs
node render.mjs
```

`audio.mjs` writes `out/soundtrack.wav` (48 kHz, mastered to -14 LUFS). `render.mjs` renders the
picture, muxes the soundtrack if it exists, and writes `out/flexiday-reel.mp4`. Both need `ffmpeg`
with libx264 on the `PATH`. The render drives the Chrome installed at
`/Applications/Google Chrome.app`; set `CHROME_PATH` to point it at another Chrome or Chromium.

| Command                             | Output                                               |
| ----------------------------------- | ---------------------------------------------------- |
| `node render.mjs`                   | master: 60 fps, 8 sub-frames per frame (motion blur) |
| `node render.mjs --preview`         | 30 fps, no motion blur, about a minute               |
| `node render.mjs --stills 4.2,12`   | single frames plus a contact sheet in `out/stills/`  |
| `node render.mjs --from 4 --to 6`   | part of the timeline                                 |
| `node render.mjs --k 4 --workers 4` | fewer sub-frames, fewer Chrome instances             |

Open `index.html` through any static server to scrub it live: `?t=5.2` freezes a moment, no
parameter loops it in real time.

## How it fits together

- `src/timeline.js` is the cue sheet. Picture and sound both read it, so moving a cue moves the hit
  and its sound together.
- Every scene renders as a pure function of time (`render(t)`), which is what makes sub-frame motion
  blur possible: each output frame averages 8 renders across a 180° shutter (`tmix` in ffmpeg).
- Colours, fonts, the team and the logo geometry come from the product: `flexi-day/app/globals.css`,
  `flexi-day/lib/demo/team.ts`, `components/brand/logo.tsx`. The fonts come from the same
  `@expo-google-fonts` packages the iPhone app uses, so `npm install` fetches them with their OFL
  licence, and the page refuses to render if one is missing.

| Time        | Scene                                                               |
| ----------- | ------------------------------------------------------------------- |
| 0.0 – 4.0   | a dot drops, blooms into the logo mark, bursts into June's calendar |
| 4.0 – 6.2   | Marco's request is approved in one click                            |
| 6.2 – 8.0   | the iPhone app: balance ring, odometer, floating cards              |
| 8.0 – 11.0  | "Time off, handled with care.", one move per word                   |
| 11.0 – 15.0 | a reel of weekdays lands on flexiday                                |
