const SVG_NS = "http://www.w3.org/2000/svg";

export function el(tag, { cls, style, text, html, attrs } = {}, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (style) Object.assign(node.style, style);
  if (text != null) node.textContent = text;
  if (html != null) node.innerHTML = html;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Absolutely positioned box, the building block of every scene.
export function box(parent, { x = 0, y = 0, w, h, style = {}, cls, text, html } = {}) {
  return el(
    "div",
    {
      cls,
      text,
      html,
      style: {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        ...(w != null ? { width: `${w}px` } : {}),
        ...(h != null ? { height: `${h}px` } : {}),
        ...style,
      },
    },
    parent
  );
}

// Writes a style only when it changed; renders touch hundreds of nodes per frame.
export function set(node, prop, value) {
  const cache = node.__s || (node.__s = {});
  if (cache[prop] === value) return;
  cache[prop] = value;
  if (prop.startsWith("--")) node.style.setProperty(prop, value);
  else node.style[prop] = value;
}

export function attr(node, name, value) {
  const cache = node.__a || (node.__a = {});
  const v = String(value);
  if (cache[name] === v) return;
  cache[name] = v;
  node.setAttribute(name, v);
}

export function show(node, visible) {
  set(node, "display", visible ? "" : "none");
}

export const f2 = (v) => Math.round(v * 100) / 100;

export function measure(text, font, letterSpacing = "0px") {
  const probe = el(
    "span",
    {
      text,
      style: {
        position: "absolute",
        left: "-9999px",
        top: "0",
        whiteSpace: "pre",
        font,
        letterSpacing,
      },
    },
    document.body
  );
  const r = probe.getBoundingClientRect();
  probe.remove();
  return { w: r.width, h: r.height };
}

// Distance from the top of a block (with this font and line-height) to its text baseline.
export function baseline(font, lineHeight = "1") {
  const wrap = el(
    "div",
    {
      text: "Hxg",
      style: {
        position: "absolute",
        left: "-9999px",
        top: "0",
        font,
        lineHeight,
        whiteSpace: "pre",
      },
    },
    document.body
  );
  const marker = el(
    "span",
    { style: { display: "inline-block", width: "1px", height: "0px" } },
    wrap
  );
  const b = marker.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
  wrap.remove();
  return b;
}

// Splits text into per-letter spans inside a mask, for staggered type animation.
export function letters(parent, text, style = {}) {
  const wrap = el(
    "span",
    { style: { display: "inline-block", whiteSpace: "pre", ...style } },
    parent
  );
  const spans = [...text].map((ch) =>
    el(
      "span",
      { text: ch, style: { display: "inline-block", whiteSpace: "pre", willChange: "transform" } },
      wrap
    )
  );
  return { wrap, spans };
}
