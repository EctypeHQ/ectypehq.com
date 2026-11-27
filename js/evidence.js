/* Fig. 3, the evidence figure: side-by-side 24 × 24 rank-correlation matrices with numbered
   annotations that recompute, a keyboard cell readout and marginal histograms with
   total-variation distance. Loaded lazily, when the section nears the viewport. */

const SVGNS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

/* ---------- diverging scale: deep minutia rose #ab1a35 (−1) .. blotter white (0) .. contour teal (+1) ----------
   Interpolated in OKLab, so lightness falls evenly with |ρ| on both arms. The two ends share
   OKLab L = 0.481, so equal |ρ| reads as equal weight whatever its sign. Teal against rose
   separates less for deuteranopes than for other viewers (tools/check_a11y.py), so cells with
   ρ ≤ HATCH also carry fine dark hatching: the sign never depends on colour alone. */
export const HATCH = -0.15;
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const gam = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, v)) * 255); };
function toLab([R, G, B]) {
  const r = lin(R), g = lin(G), b = lin(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function toRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
const NEG = toLab([171, 26, 53]), MID = toLab([247, 246, 250]), POS = toLab([10, 107, 112]);
const LUT = [];
for (let k = 0; k <= 200; k++) {
  const r = -1 + k / 100, t = Math.abs(r) ** 0.8, end = r < 0 ? NEG : POS;
  const c = toRgb(MID.map((m, i) => m + (end[i] - m) * t));
  LUT.push(`rgb(${c[0]},${c[1]},${c[2]})`);
}
export const rhoColor = (r) => LUT[Math.round((Math.max(-1, Math.min(1, r)) + 1) * 100)];

/* ---------- figure content ---------- */
const GROUPS = [
  { from: 0, to: 0, label: "Credit limit" },
  { from: 1, to: 4, label: "Demographics" },
  { from: 5, to: 10, label: "Repayment status" },
  { from: 11, to: 16, label: "Bill amounts" },
  { from: 17, to: 22, label: "Payments" },
  { from: 23, to: 23, label: "Default" },
];
const NOTES = [
  { rows: [5, 10], cols: [5, 10], text: "Repayment status over six months: late one month, often late the next." },
  { rows: [11, 16], cols: [11, 16], text: "Bill amounts over six months: each bill tracks the one before." },
  { rows: [0, 0], cols: [17, 22], text: "Credit limit against payments: higher limits, larger payments." },
];
const HISTS = [
  { col: "LIMIT_BAL", label: "Credit limit", panel: "c" },
  { col: "AGE", label: "Age", panel: "d" },
  { col: "BILL_AMT1", label: "Latest bill", panel: "e" },
  { col: "PAY_AMT1", label: "Latest payment", panel: "f" },
];
const LABELS = { ectype: "Ectype synthetic rows", independent: "Independent columns", real: "Held-out real rows (control)" };
const FILL = { ectype: "#0a6b70", independent: "#615d74", real: "#4a1d7a" };

const fmt = (v, d = 2) => (Number(v.toFixed(d)) < 0 ? "−" : "") + Math.abs(v).toFixed(d);
const fmtAxis = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
const shortName = (c) => (c === "default payment next month" ? "DEFAULT" : c);

function blockMean(m, [r0, r1], [c0, c1]) {
  let s = 0, k = 0;
  for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) {
    if (i === j || (r0 === c0 && j < i)) continue;
    s += m[i][j]; k++;
  }
  return s / k;
}

let patternId = 0;
function hatchPattern(svg, size = 0.42, width = 0.07) {
  const id = `neg-hatch-${++patternId}`;
  const pat = el("pattern", { id, patternUnits: "userSpaceOnUse", width: size, height: size, patternTransform: "rotate(45)" }, el("defs", {}, svg));
  el("line", { x1: 0, y1: 0, x2: 0, y2: size, stroke: "#3a0c1c", "stroke-opacity": 0.55, "stroke-width": width }, pat);
  return `url(#${id})`;
}

function buildMatrix(host, n) {
  const svg = el("svg", { viewBox: `0 0 ${n} ${n}`, "aria-hidden": "true", focusable: "false" });
  const hatch = hatchPattern(svg);
  const cells = [];
  for (let i = 0; i < n; i++) {
    cells.push([]);
    for (let j = 0; j < n; j++) {
      const r = el("rect", { x: j, y: i, width: 1.02, height: 1.02, class: "cell" }, svg);
      r.dataset.i = i; r.dataset.j = j;
      cells[i].push(r);
    }
  }
  const hatchLayer = el("g", { class: "hatch", "pointer-events": "none" }, svg);
  const cross = el("rect", { x: 0, y: 0, width: 1, height: 1, class: "cross", visibility: "hidden" }, svg);
  host.appendChild(svg);
  return { svg, cells, cross, hatch, hatchLayer };
}

function paint(P, M, n) {
  P.hatchLayer.textContent = "";
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    P.cells[i][j].setAttribute("fill", rhoColor(M[i][j]));
    if (M[i][j] <= HATCH) el("rect", { x: j, y: i, width: 1, height: 1, fill: P.hatch }, P.hatchLayer);
  }
}

function drawScale(svg) {
  const defs = el("defs", {}, svg);
  const grad = el("linearGradient", { id: "rho-grad", x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
  for (let k = 0; k <= 40; k++) el("stop", { offset: `${k * 2.5}%`, "stop-color": rhoColor(-1 + k / 20) }, grad);
  el("rect", { x: 1, y: 2, width: 218, height: 12, fill: "url(#rho-grad)" }, svg);
  el("rect", { x: 1, y: 2, width: ((HATCH + 1) / 2) * 218, height: 12, fill: hatchPattern(svg, 4.2, 0.9) }, svg);
  el("rect", { x: 1, y: 2, width: 218, height: 12, fill: "none", stroke: "#1d1530", "stroke-width": 1 }, svg);
  [[-1, "−1"], [-0.5, "−0.5"], [0, "0"], [0.5, "+0.5"], [1, "+1"]].forEach(([v, s]) => {
    const x = 1 + ((v + 1) / 2) * 218;
    el("line", { x1: x, x2: x, y1: 14, y2: 18, stroke: "#1d1530" }, svg);
    const t = el("text", { x, y: 31, "text-anchor": v === -1 ? "start" : v === 1 ? "end" : "middle" }, svg);
    t.textContent = s;
  });
}

function histogram(host, h, demo, mode) {
  const m = demo.marginals[h.col];
  const real = m.real, other = m[mode], edges = m.edges;
  const W = 220, H = 72, nb = real.length;
  const maxV = Math.max(...real, ...other) * 1.06;
  const X = (k) => (k / nb) * W, Y = (v) => H - (v / maxV) * H;
  const tv = 0.5 * real.reduce((s, v, k) => s + Math.abs(v - other[k]), 0);

  host.innerHTML = "";
  const p = document.createElement("p");
  p.innerHTML = `<span><b class="pl">${h.panel}</b> ${h.label}</span><span class="tv">TV ${tv.toFixed(3)}</span>`;
  host.appendChild(p);
  const svg = el("svg", { viewBox: `0 -2 ${W} ${H + 20}`, "aria-hidden": "true", focusable: "false" });
  other.forEach((v, k) => el("rect", { x: X(k), y: Y(v), width: W / nb + 0.25, height: H - Y(v), fill: FILL[mode], "fill-opacity": 0.38 }, svg));
  let d = `M0 ${H}`;
  real.forEach((v, k) => { d += ` L${X(k)} ${Y(v)} L${X(k + 1)} ${Y(v)}`; });
  el("path", { d: `${d} L${W} ${H}`, fill: "none", stroke: "#4a1d7a", "stroke-width": 1.5 }, svg);
  el("line", { x1: 0, x2: W, y1: H, y2: H, stroke: "#1d1530" }, svg);
  [[0, "start", edges[0]], [W, "end", edges[edges.length - 1]]].forEach(([x, a, v]) => {
    const t = el("text", { x, y: H + 15, "text-anchor": a }, svg);
    t.textContent = fmtAxis(v);
  });
  host.appendChild(svg);
  host.setAttribute("role", "img");
  host.setAttribute("aria-label", `Panel ${h.panel}, ${h.label} (${h.col}): real distribution as an outline, ${LABELS[mode].toLowerCase()} as bars. Total-variation distance ${tv.toFixed(3)}.`);
}

export function initEvidence(demo, reduceMotion) {
  const fig = document.getElementById("fig3");
  const cols = demo.columns, n = cols.length, S = demo.spearman;
  const matA = document.getElementById("mat-a"), matB = document.getElementById("mat-b");
  const A = buildMatrix(matA, n), B = buildMatrix(matB, n);
  const readout = document.getElementById("readout");
  if (reduceMotion.matches) fig.classList.add("no-motion");

  // group brackets beside panel a
  const groups = fig.querySelector(".groups");
  GROUPS.forEach((g) => {
    const li = document.createElement("li");
    li.textContent = g.label;
    li.style.top = `${(g.from / n) * 100}%`;
    li.style.height = `${((g.to - g.from + 1) / n) * 100}%`;
    groups.appendChild(li);
  });
  drawScale(document.getElementById("scale"));

  paint(A, S.real, n);

  // numbered markers on both panels, at the centre of each annotated block
  for (const host of [matA, matB]) {
    NOTES.forEach((note, k) => {
      const m = document.createElement("span");
      m.className = "marker"; m.setAttribute("aria-hidden", "true"); m.textContent = k + 1;
      m.style.left = `${((note.cols[0] + note.cols[1] + 1) / 2 / n) * 100}%`;
      m.style.top = `${((note.rows[0] + note.rows[1] + 1) / 2 / n) * 100}%`;
      host.appendChild(m);
    });
  }

  let mode = "ectype", cur = null;
  const hostH = document.getElementById("hists");
  HISTS.forEach(() => { const d = document.createElement("div"); d.className = "hist"; hostH.appendChild(d); });

  function render() {
    const M = S[mode];
    paint(B, M, n);
    document.getElementById("b-label").textContent = LABELS[mode];
    fig.dataset.mode = mode;

    let mae = 0, k = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { mae += Math.abs(M[i][j] - S.real[i][j]); k++; }
    mae /= k;
    const notes = document.getElementById("notes");
    notes.innerHTML = "";
    NOTES.forEach((note, idx) => {
      const ra = blockMean(S.real, note.rows, note.cols), rb = blockMean(M, note.rows, note.cols);
      const off = Math.abs(rb - ra) > 0.1;
      const li = document.createElement("li");
      li.innerHTML = `<span class="n" aria-hidden="true">${idx + 1}</span><p><span class="sr-only">Annotation ${idx + 1}. </span>${note.text}<span class="vals">mean ρ: a ${fmt(ra)}, b ${fmt(rb)} <span class="${off ? "off" : ""}">(Δ ${fmt(rb - ra)})</span></span></p>`;
      notes.appendChild(li);
    });
    const li = document.createElement("li");
    li.className = "sum";
    li.innerHTML = `<span class="n" aria-hidden="true">Σ</span><p>All ${k} column pairs: mean |Δρ| between a and b<span class="vals"><b>${mae.toFixed(3)}</b></span></p>`;
    notes.appendChild(li);

    HISTS.forEach((h, idx) => histogram(hostH.children[idx], h, demo, mode));
    if (cur) show(cur[0], cur[1]);
  }

  function show(i, j) {
    cur = [i, j];
    for (const P of [A, B]) { P.cross.setAttribute("x", j); P.cross.setAttribute("y", i); P.cross.setAttribute("visibility", "visible"); }
    const a = S.real[i][j], b = S[mode][i][j];
    readout.innerHTML = `<b>${shortName(cols[i])}</b> with <b>${shortName(cols[j])}</b>: a <span class="v">${fmt(a, 3)}</span>, b <span class="v">${fmt(b, 3)}</span>, difference <span class="v">${fmt(b - a, 3)}</span>`;
  }
  const hide = () => { for (const P of [A, B]) P.cross.setAttribute("visibility", "hidden"); };

  for (const P of [A, B]) {
    const pick = (e) => { const t = e.target; if (t.dataset && t.dataset.i !== undefined) show(+t.dataset.i, +t.dataset.j); };
    P.svg.addEventListener("pointermove", pick);
    P.svg.addEventListener("pointerdown", pick);
    P.svg.addEventListener("pointerleave", () => { if (document.activeElement !== matB) hide(); });
  }
  matB.addEventListener("focus", () => show(...(cur || [11, 12])));
  matB.addEventListener("blur", hide);
  matB.addEventListener("keydown", (e) => {
    const [i, j] = cur || [0, 0];
    const moves = { ArrowUp: [i - 1, j], ArrowDown: [i + 1, j], ArrowLeft: [i, j - 1], ArrowRight: [i, j + 1], Home: [i, 0], End: [i, n - 1], PageUp: [0, j], PageDown: [n - 1, j] };
    const mv = moves[e.key];
    if (!mv) return;
    e.preventDefault();
    show(Math.max(0, Math.min(n - 1, mv[0])), Math.max(0, Math.min(n - 1, mv[1])));
  });

  fig.querySelectorAll('input[name="fig2-cmp"]').forEach((r) => r.addEventListener("change", () => {
    if (r.checked) { mode = r.value; render(); }
  }));
  render();
  fig.classList.add("is-ready");
}
