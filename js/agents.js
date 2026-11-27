/* "Give your agent a data tool": replays a recorded ectype-mcp session.
   Every transcript is already in the HTML (baked by tools/update_data.py from
   data/mcp-session.json), so without JavaScript or with prefers-reduced-motion it is simply there.
   This script rebinds the numbers from data/mcp-session.json, then, once the panel scrolls into
   view, hides the steps and shows them again one by one: each turn, then the result's checks one
   row at a time. Controls: Next step, Skip to the end, Replay; the right or down arrow on the
   transcript advances one step. Space is reserved throughout, so nothing on the page moves.
   With two or more recorded sessions, a "Recorded in" switch picks the transcript; the
   chosen one and its caption are shown complete (Replay plays it). */
import { bindAll } from "./format.js";

const fig = document.getElementById("replay");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// How long each kind of step holds before the next one appears (ms).
const HOLD = { say: 1100, call: 1300, result: 500, check: 230, rules: 650, verdict: 400, files: 900 };

if (fig) {
  const lists = [...fig.querySelectorAll(".transcript")];
  const radios = [...fig.querySelectorAll('input[name="replay-session"]')];
  const caps = [...fig.querySelectorAll("[data-session-cap]")];
  const btnNext = fig.querySelector("[data-replay-next]");
  const btnEnd = fig.querySelector("[data-replay-end]");
  const btnAgain = fig.querySelector("[data-replay-again]");
  let list = lists[0], steps = [], shown = 0, timer = 0, auto = false, io = null;

  fetch("data/mcp-session.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`mcp-session.json: ${r.status}`))))
    .then((mcp) => bindAll(fig, {}, {}, {}, undefined, mcp))
    .catch((e) => console.error(e)); // the baked values stay

  function render() {
    steps.forEach((s, i) => s.classList.toggle("is-shown", i < shown));
    const done = shown >= steps.length;
    fig.classList.toggle("is-playing", !done);
    btnNext.disabled = done;
    btnEnd.disabled = done;
  }
  function stop() { clearTimeout(timer); timer = 0; auto = false; }
  function tick() {
    if (shown >= steps.length) { stop(); render(); return; }
    shown++;
    render();
    const kind = steps[shown - 1].dataset.step;
    if (auto) timer = setTimeout(tick, HOLD[kind] || 600);
  }
  function play() {
    stop();
    if (reduceMotion.matches) { shown = steps.length; render(); return; }
    shown = 0; auto = true;
    render();
    timer = setTimeout(tick, 350);
  }
  function next() { stop(); tick(); }
  function end() { stop(); shown = steps.length; render(); }
  function choose(i) {
    stop();
    list = lists[i] || lists[0];
    lists.forEach((l) => { l.hidden = l !== list; });
    caps.forEach((c) => { c.hidden = c.dataset.sessionCap !== list.dataset.session; });
    steps = [...list.querySelectorAll("[data-step]")];
    shown = steps.length;
    render();
  }

  btnNext.addEventListener("click", next);
  btnEnd.addEventListener("click", end);
  btnAgain.addEventListener("click", () => { play(); list.focus({ preventScroll: true }); });
  lists.forEach((l) => l.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if (shown < steps.length) { e.preventDefault(); next(); }
    }
  }));
  // Choosing a session shows it complete, and the first-view autoplay no longer fires.
  radios.forEach((r) => r.addEventListener("change", () => {
    if (!r.checked) return;
    if (io) { io.disconnect(); io = null; }
    choose(Number(r.value));
  }));
  reduceMotion.addEventListener("change", () => { if (reduceMotion.matches) end(); });

  choose(0);
  fig.classList.add("is-ready");
  // Play once, the first time the panel's top reaches the upper 60 % of the window (a ratio
  // threshold would never fire on a phone, where the panel is taller than the screen).
  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    io = new IntersectionObserver((es) => {
      if (es.some((x) => x.isIntersecting)) { io.disconnect(); io = null; play(); }
    }, { rootMargin: "0px 0px -40% 0px", threshold: 0 });
    io.observe(fig);
  }
}
