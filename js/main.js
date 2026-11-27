/* Ectype site entry point. Loads data/results.json, data/compete.json and data/demo-data.json,
   binds every quoted number and loads Fig. 3 when it nears the viewport. Fig. 1 (the hero's
   point clouds) starts on its own, after first paint, once it is on screen: see startCloud.
   Fig. 2 (the head-to-head chart) is baked into the HTML by tools/update_data.py and needs no script. */
import { SITE } from "./config.js";
import { bindAll } from "./format.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.querySelectorAll("[data-site]").forEach((a) => {
  const url = SITE[a.dataset.site];
  if (url) a.href = url;
});

/* ---------- copy buttons ---------- */
function copyText(text, btn) {
  const note = btn.querySelector(".pip-note");
  const target = note || btn;
  const prev = target.textContent;
  const done = (ok) => {
    target.textContent = ok ? "copied" : "select to copy";
    if (!note) target.textContent = ok ? "Copied" : "Select and copy";
    btn.classList.toggle("copied", ok);
    setTimeout(() => { target.textContent = prev; btn.classList.remove("copied"); }, 1600);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  else {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove(); done(ok);
  }
}
document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy, b)));
document.querySelectorAll("[data-copy-from]").forEach((b) => b.addEventListener("click", () =>
  copyText(document.getElementById(b.dataset.copyFrom).textContent, b)));

/* ---------- Fig. 1: the hero's point clouds ----------
   The poster image is already the figure. three.js (about 750 kB, self-hosted) is fetched only
   after the first paint and only once the hero is on screen; without WebGL it is never fetched. */
const fig1 = document.getElementById("fig1");
let markCloud;
const cloudStarted = new Promise((r) => { markCloud = r; });
function startCloud() {
  import("./cloud.js")
    .then((m) => m.initCloud(fig1, reduceMotion))
    .catch((e) => { console.error(e); fig1.classList.add("is-static"); })
    .finally(markCloud);
}
function hasWebGL() {
  // A throwaway context, released at once, so browsers without WebGL never fetch three.js.
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return true;
  } catch (e) { return false; }
}
if (fig1 && "IntersectionObserver" in window && hasWebGL()) {
  requestAnimationFrame(() => setTimeout(() => {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); startCloud(); }
    });
    io.observe(fig1);
  }, 0));
} else {
  if (fig1) fig1.classList.add("is-static");
  markCloud();
}

/* ---------- data ---------- */
const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });

function fail(msg) {
  document.querySelectorAll("[data-status]").forEach((s) => { s.textContent = msg; s.hidden = false; });
  // Fall back to the same static snapshots readers without JavaScript get.
  document.querySelectorAll("figure noscript").forEach((ns) => {
    const m = ns.textContent.match(/src="([^"]+)"[^>]*alt="([^"]+)"/);
    if (!m || ns.parentNode.querySelector(".snapshot")) return;
    const img = new Image();
    img.src = m[1]; img.alt = m[2]; img.className = "snapshot";
    ns.after(img);
  });
  document.documentElement.classList.add("data-failed");
}

Promise.all([getJSON("data/results.json"), getJSON("data/demo-data.json"), getJSON("data/compete.json")]).then(([results, demo, compete]) => {
  bindAll(document, results, demo, compete);


  const ev = document.getElementById("evidence");
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    import("./evidence.js").then((m) => m.initEvidence(demo, reduceMotion)).catch((e) => { console.error(e); fail("The figure could not be drawn in this browser."); });
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: "800px 0px" });
    io.observe(ev);
  } else start();
  // A link straight to #evidence should not wait for scrolling.
  if (location.hash === "#evidence") start();
  // Otherwise use idle time after the hero has started, so the figure is ready before it is reached.
  cloudStarted.then(() => setTimeout(() => (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(start, { timeout: 1500 }), 400));
}).catch((e) => {
  console.error(e);
  fail("The measurements could not be loaded. Serve the site over HTTP (see README) to see the live figures.");
});

/* ---------- the session band: each command "runs" once when it scrolls into view ---------- */
const session = document.getElementById("session");
if (session && !reduceMotion.matches && "IntersectionObserver" in window) {
  const r = session.getBoundingClientRect();
  // Only stage it when it starts below the fold, so nothing a reader is already looking at changes.
  if (r.top > window.innerHeight) {
    session.classList.add("will-play");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        session.classList.add("is-played");
      }
    }, { threshold: 0.35 });
    io.observe(session);
  }
}
