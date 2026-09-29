import * as A from "../anim.js";
import { CUE } from "../timeline.js";
import { svg } from "../dom.js";

// One camera whip carries the approval scene out the top and the phone scene in from below.
export const whip = (t) => A.swoop(A.clamp((t - CUE.whip[0]) / (CUE.whip[1] - CUE.whip[0])));

export function whipSpeed(t) {
  const e = 1 / 480;
  return (Math.abs(whip(t + e) - whip(t - e)) / (2 * e)) * 1080;
}

// Vertical-only Gaussian blur to smooth the ghost steps of the sub-frame blur at whip speed.
let vblurNode = null;
export function vblurFilter(stage) {
  if (vblurNode) return;
  const host = svg("svg", { width: 0, height: 0, style: "position:absolute" }, stage);
  const filter = svg(
    "filter",
    { id: "vblur", x: "-5%", y: "-20%", width: "110%", height: "140%" },
    host
  );
  vblurNode = svg(
    "feGaussianBlur",
    { stdDeviation: "0 0", "color-interpolation-filters": "sRGB" },
    filter
  );
}
export function setVblur(sigma) {
  vblurNode?.setAttribute("stdDeviation", `0 ${sigma.toFixed(2)}`);
}

export const APP_ICON = `<svg viewBox="0 0 32 32" width="100%" height="100%"><rect width="32" height="32" rx="7.5" fill="#0c0c16"/><path fill="#fbfbff" transform="translate(5.265 23.03) scale(0.02 -0.02)" d="M107 0L107 336L23 336L23 443L163 436L163 455Q128 462 105.5 480.5Q83 499 72.5 523.5Q62 548 62 576Q62 620 84 651Q106 682 146 699.5Q186 717 240 717Q287 717 324.5 705.5Q362 694 385 678L376 547Q352 564 321.5 575Q291 586 264 586Q235 586 215.5 570Q196 554 196 518Q196 493 206.5 478.5Q217 464 232.5 457.5Q248 451 264 449L383 449L383 336L247 336L247 0Z"/><path fill="#9086f9" transform="translate(14.835 23.03) scale(0.02 -0.02)" d="M256 -14Q190 -14 141.5 20Q93 54 66 116Q39 178 39 263Q39 343 62.5 405Q86 467 133.5 502Q181 537 250 537Q301 537 335.5 518Q370 499 392.5 463Q415 427 429 374L452 374Q446 407 440 438Q434 469 431 496.5Q428 524 428 545L428 715L572 715L572 257L572 0L453 0L453 152L432 152Q421 96 397.5 59Q374 22 339 4Q304 -14 256 -14ZM305 104Q338 104 361 118.5Q384 133 399 155.5Q414 178 421 204Q428 230 428 253L428 272Q428 291 423 311.5Q418 332 407.5 351.5Q397 371 382 387Q367 403 347 412Q327 421 303 421Q267 421 241.5 401.5Q216 382 203 346Q190 310 190 263Q190 215 203.5 179Q217 143 243.5 123.5Q270 104 305 104Z"/></svg>`;

export const CHECK_PATH = "M7 12.5l3.2 3.2L17.5 8.5";
