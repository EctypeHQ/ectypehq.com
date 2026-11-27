/* Fig. 1, the hero: geometry shared by the live WebGL figure (js/cloud.js) and the static poster
   (img/cloud.svg, written by tools/render_cloud.py from this same module). No three.js here.

   Everything is driven by data/cloud-data.json: three columns, a sample of real and generated
   rows, and derived.transform (log10 or linear per column, chosen by tools/update_data.py and
   applied identically to both clouds). Another file with the same structure can be swapped in
   without touching this code. */

export const SCENE = {
  fov: 30,            // degrees, vertical
  tilt: 0.42,         // radians: we look slightly down on the clouds
  roll: 0.55,         // radians: each cloud leans in the picture plane
  margin: { top: 0.12, bottom: 0.09 }, // of the stage height: room for the controls and labels
  rock: 0.55,         // radians: the cloud rocks this far either side of its broadest face
  rockPeriod: 15,     // seconds per rock, there and back
  pointSize: 0.03,    // dot diameter, world units
  pointAlpha: 0.7,   // at 0.7 a single dot still meets 3:1 on paper (tools/check_a11y.py)
  aspect: 16 / 10,    // the poster's aspect; the live stage may differ
};

/* The loop, in seconds. Beats overlap a little so it reads as one movement. */
export const BEATS = [
  { id: "arrive", from: 0.0, to: 3.0 },   // real rows hold as a table, then leave it and settle into a cloud
  { id: "shells", from: 2.8, to: 5.4 },   // ridges draw themselves around it: the shape
  { id: "letgo", from: 5.4, to: 6.6 },    // the real points fade: the fingerprint is the shape alone
  { id: "pour", from: 6.4, to: 9.2 },     // generated rows pour in and fill the same shape
  { id: "apart", from: 9.4, to: 11.2 },   // both clouds, side by side, turning together
];
export const LOOP_END = 11.2;
/* The turn about the long axis at time t. The cloud rocks about the angle where it shows its
   broadest face (geo.broad), rather than spinning all the way round: seen edge-on, a flat cloud
   and its print collapse to a sliver. At LOOP_END it faces the viewer squarely. */
export const yawAt = (t, broad = 0) => broad + SCENE.rock * Math.sin((2 * Math.PI * (t - LOOP_END)) / SCENE.rockPeriod);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const ease = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const beat = (id, t) => { const b = BEATS.find((q) => q.id === id); return clamp01((t - b.from) / (b.to - b.from)); };

function quantile(sorted, q) {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/* Small deterministic PRNG, so the poster and the live figure agree. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* Display coordinates: transform each column, then map the real rows' 0.5–99.5 % range to
   [-1, 1]. The same mapping is applied to the generated rows. Axes: x, y, z = columns 0, 1, 2,
   with y up. */
function toDisplay(data, maxPoints) {
  const cols = data.columns;
  const tf = (data.derived && data.derived.transform) || {};
  const f = cols.map((c) => (tf[c] === "log10" ? Math.log10 : (v) => v));
  const pick = (rows) => {
    const step = rows.length > maxPoints ? rows.length / maxPoints : 1;
    const out = [];
    for (let k = 0; k < Math.min(rows.length, maxPoints); k++) out.push(rows[Math.floor(k * step)]);
    return out;
  };
  const real = pick(data.real), syn = pick(data.synthetic);
  const frame = cols.map((_, j) => {
    const v = data.real.map((r) => f[j](r[j])).sort((a, b) => a - b);
    return [quantile(v, 0.005), quantile(v, 0.995)];
  });
  const unit = (r, j) => ((f[j](r[j]) - frame[j][0]) / (frame[j][1] - frame[j][0])) * 2 - 1;
  // Pivot on the real cloud's centre, so it turns in place.
  const centre = [0, 1, 2].map((j) => data.real.reduce((acc, r) => acc + unit(r, j), 0) / data.real.length);
  // Turn the cloud so its longest axis stands upright (the end where column 1 is larger on top).
  const all = new Float32Array(data.real.length * 3);
  data.real.forEach((r, i) => { for (let j = 0; j < 3; j++) all[i * 3 + j] = unit(r, j) - centre[j]; });
  let { axis } = principal(all);
  if (axis[1] < 0) axis = axis.map((x) => -x);
  const u = norm(cross(axis, Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), v = cross(u, axis);
  const map = (rows) => {
    const a = new Float32Array(rows.length * 3);
    rows.forEach((r, i) => {
      const p = [0, 1, 2].map((j) => unit(r, j) - centre[j]);
      const dot = (q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      a[i * 3] = dot(u); a[i * 3 + 1] = dot(axis); a[i * 3 + 2] = dot(v);
    });
    return a;
  };
  return { real: map(real), syn: map(syn), frame, transform: cols.map((c) => tf[c] || "linear") };
}

/* The real cloud's centre and longest axis (power iteration on the covariance). */
function principal(pts) {
  const n = pts.length / 3, m = [0, 0, 0];
  for (let i = 0; i < pts.length; i += 3) for (let j = 0; j < 3; j++) m[j] += pts[i + j] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < pts.length; i += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += (pts[i + a] - m[a]) * (pts[i + b] - m[b]) / n;
  let v = [1, 1, 1];
  for (let it = 0; it < 60; it++) {
    const w = [0, 1, 2].map((a) => C[a][0] * v[0] + C[a][1] * v[1] + C[a][2] * v[2]);
    const len = Math.hypot(...w); v = w.map((x) => x / len);
  }
  return { mean: m, axis: v };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

/* Where each real row starts: a flat sheet of rows, like the table it came from. Each generated
   row starts high above the shape and falls in. Delays stagger the arrivals. */
function starts(n, kind, seed) {
  const r = rng(seed);
  const start = new Float32Array(n * 3), delay = new Float32Array(n);
  if (kind === "table") {
    const cols = Math.ceil(Math.sqrt(n * 0.62)), rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      start[i * 3] = -1.05 + (2.1 * col) / (cols - 1);
      start[i * 3 + 1] = 1.25 - (2.5 * row) / (rows - 1);
      start[i * 3 + 2] = 1.9;
      delay[i] = (row / rows) * 0.55 + r() * 0.08;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.16;
      start[i * 3] = Math.cos(a) * rad;
      start[i * 3 + 1] = 2.6 + r() * 0.5;
      start[i * 3 + 2] = Math.sin(a) * rad;
      delay[i] = r() * 0.62;
    }
  }
  return { start, delay };
}

export function prepare(data, { maxPoints = 4000 } = {}) {
  const disp = toDisplay(data, maxPoints);
  const full = toDisplay(data, Infinity).real;
  const nR = disp.real.length / 3, nS = disp.syn.length / 3;
  // Extents of the real cloud: across its axis (radial) and along it, so the layout fits the data.
  const rad = [], len = [];
  for (let i = 0; i < full.length; i += 3) { rad.push(Math.hypot(full[i], full[i + 2])); len.push(Math.abs(full[i + 1])); }
  rad.sort((a, b) => a - b); len.sort((a, b) => a - b);
  const ext = { r: quantile(rad, 0.985), h: quantile(len, 0.99) };
  return { ...disp, ext, layout: layout(ext), broad: broadest(full), realStart: starts(nR, "table", 7), synStart: starts(nS, "pour", 11) };
}

/* The spin about the long axis at which the cloud, as seen, covers the largest area (the
   determinant of the 2D covariance of the projected points, at the default tilt). */
function broadest(pts) {
  let best = 0, bestA = -1;
  const n = pts.length / 3;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI, m = orient(a);
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const X = m[0][0] * pts[i] + m[0][1] * pts[i + 1] + m[0][2] * pts[i + 2];
      const Y = m[1][0] * pts[i] + m[1][1] * pts[i + 1] + m[1][2] * pts[i + 2];
      sx += X; sy += Y; sxx += X * X; syy += Y * Y; sxy += X * Y;
    }
    const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2, cxy = sxy / n - (sx / n) * (sy / n);
    const A = vx * vy - cxy * cxy;
    if (A > bestA) { bestA = A; best = a; }
  }
  return best;
}

/* ---------- orientation, layout and projection, shared with js/cloud.js ---------- */
/* The rotation applied to a cloud: spin about its own (upright) long axis, lean it by SCENE.roll
   in the picture plane, then tip it towards the viewer by `tilt`. Row-major 3 × 3. */
export function orient(spin, tilt = SCENE.tilt) {
  const cs = Math.cos(spin), ss = Math.sin(spin), cr = Math.cos(SCENE.roll), sr = Math.sin(SCENE.roll);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const Ry = [[cs, 0, ss], [0, 1, 0], [-ss, 0, cs]];
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  const Rx = [[1, 0, 0], [0, ct, -st], [0, st, ct]];
  const mul = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
  return mul(Rx, mul(Rz, Ry));
}

/* Half-size of one cloud on screen, and the distance between the two centres side by side. */
function layout(ext) {
  const c = Math.cos(SCENE.roll), s = Math.abs(Math.sin(SCENE.roll));
  const halfW = ext.r * c + ext.h * s * 0.55, halfH = ext.h * c + ext.r * s;
  return { halfW, halfH, apart: halfW * 1.18 + 0.12 };
}

/* Camera distance that keeps both clouds (or one, overlaid) inside a stage of this aspect,
   clear of the controls along the top edge and the labels along the bottom. */
export function fitDistance(aspect, lay, apart = lay.apart) {
  const t = Math.tan((SCENE.fov * Math.PI) / 360);
  const free = 1 - SCENE.margin.top - SCENE.margin.bottom;
  return Math.max((lay.halfH * 1.04) / (t * free), ((apart + lay.halfW) * 1.12) / (t * aspect)) + lay.halfW * 0.6;
}
/* How far the camera rises (world units) so the clouds sit between those margins. */
export function cameraLift(dist) {
  return (SCENE.margin.top - SCENE.margin.bottom) * dist * Math.tan((SCENE.fov * Math.PI) / 360);
}


/* ---------- the view: one camera, shared by the canvas, the ridges and the poster ---------- */
/* W, H in CSS pixels. Matches js/cloud.js's PerspectiveCamera at (0, lift, dist) looking along -z. */
export function viewFor(W, H, lay, apart = lay.apart) {
  const dist = fitDistance(W / H, lay, apart);
  return { W, H, dist, lift: cameraLift(dist), f: H / 2 / Math.tan((SCENE.fov * Math.PI) / 360) };
}

/* Screen positions (CSS px) of a cloud's points, turned by m and shifted by ox. */
export function project(pts, m, ox, v) {
  const n = pts.length / 3, out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
    const X = m[0][0] * x + m[0][1] * y + m[0][2] * z + ox;
    const Y = m[1][0] * x + m[1][1] * y + m[1][2] * z - v.lift;
    const Z = m[2][0] * x + m[2][1] * y + m[2][2] * z;
    const k = v.f / (v.dist - Z);
    out[i * 2] = v.W / 2 + X * k;
    out[i * 2 + 1] = v.H / 2 - Y * k;
  }
  return out;
}

/* ---------- the cloud's fingerprint ----------
   Ridges are drawn the way the page's prints are drawn (js/ridge-core.js): level sets of a smooth
   field, at a constant spacing, with the core inside and the ridges thinning towards the edge.
   Here the field comes from the points themselves, as the cloud is seen:
     1. project the points to the screen and estimate their density on a grid (bilinear splat,
        then a separable Gaussian of RIDGE.sigma world units, scaled by perspective);
     2. choose RIDGE.levels density thresholds from the real cloud so that the regions inside
        them have areas in the ratio (k + 0.5)^2, up to the region that holds RIDGE.mass of the
        points. Area grows with the square of a radius, so the ridges come out at a nearly
        constant spacing, as on a print, whatever the cloud's shape; they follow its bend, close
        around its densest core, and fork or end where the density does;
     3. trace those thresholds with marching squares.
   The real and the generated cloud go through exactly the same steps and the same thresholds
   (taken from the real cloud), so in the overlaid view their ridges fall on top of each other
   wherever the shapes agree, and part where they do not. */
export const RIDGE = { sigma: 0.1, levels: 9, mass: 0.97 };

export function densityField(xy, v, { cellPx = 3 } = {}) {
  const n = xy.length / 2;
  const sig = (RIDGE.sigma * v.f) / v.dist;             // px
  const cell = Math.max(cellPx, sig / 2.6);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xy[i * 2], y = xy[i * 2 + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = sig * 3.5;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1;
  let F = new Float32Array(nx * ny);
  const w = 1 / n;
  for (let i = 0; i < n; i++) {
    const gx = (xy[i * 2] - x0) / cell, gy = (xy[i * 2 + 1] - y0) / cell;
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const o = iy * nx + ix;
    F[o] += w * (1 - fx) * (1 - fy); F[o + 1] += w * fx * (1 - fy);
    F[o + nx] += w * (1 - fx) * fy; F[o + nx + 1] += w * fx * fy;
  }
  // separable Gaussian
  const s = sig / cell, R = Math.ceil(s * 3), k = new Float32Array(2 * R + 1);
  let ks = 0;
  for (let i = -R; i <= R; i++) { k[i + R] = Math.exp(-(i * i) / (2 * s * s)); ks += k[i + R]; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const T = new Float32Array(F.length);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let a = 0;
    for (let o = -R; o <= R; o++) { const xx = x + o; if (xx >= 0 && xx < nx) a += F[y * nx + xx] * k[o + R]; }
    T[y * nx + x] = a;
  }
  const G = new Float32Array(F.length);
  let peak = 0, px = 0, py = 0;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let a = 0;
    for (let o = -R; o <= R; o++) { const yy = y + o; if (yy >= 0 && yy < ny) a += T[yy * nx + x] * k[o + R]; }
    G[y * nx + x] = a;
    if (a > peak) { peak = a; px = x; py = y; }
  }
  return { F: G, nx, ny, x0, y0, cell, peak, core: [x0 + px * cell, y0 + py * cell] };
}

/* Ridge segments of one field: flat arrays of [x0, y0, x1, y1] in px, with each segment's level
   and its angle around the core (0–1), so the ridges can be drawn in from the core outward. */
/* Density thresholds, core first: the region above thr[k] has an area proportional to
   (k + 0.5)^2, and the outermost holds RIDGE.mass of the points. */
export function ridgeLevels(fd) {
  const v = Float32Array.from(fd.F).sort().reverse();
  let total = 0;
  for (let i = 0; i < v.length; i++) total += v[i];
  let acc = 0, outer = v.length - 1;
  for (let i = 0; i < v.length; i++) { acc += v[i]; if (acc >= RIDGE.mass * total) { outer = i; break; } }
  const K = RIDGE.levels, thr = [];
  for (let k = 0; k < K; k++) thr.push(v[Math.min(outer, Math.round(outer * ((k + 0.5) / (K - 0.5)) ** 2))]);
  return thr;
}

export function ridgeSegments(fd, thr) {
  const { F, nx, ny, x0, y0, cell, core } = fd;
  const seg = [], lev = [], ang = [];
  const K = thr.length, top = thr[0], bottom = thr[K - 1];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const o = j * nx + i;
    const a = F[o], b = F[o + 1], c = F[o + nx + 1], d = F[o + nx];
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
    if (hi < bottom || lo > top) continue;
    for (let l = 0; l < K; l++) {
      const v = thr[l];
      if (v < lo || v > hi) continue;
      const p = [];
      if ((a < v) !== (b < v)) p.push(i + (v - a) / (b - a), j);
      if ((b < v) !== (c < v)) p.push(i + 1, j + (v - b) / (c - b));
      if ((d < v) !== (c < v)) p.push(i + (v - d) / (c - d), j + 1);
      if ((a < v) !== (d < v)) p.push(i, j + (v - a) / (d - a));
      for (let q = 0; q + 3 < p.length; q += 4) {
        const X0 = x0 + p[q] * cell, Y0 = y0 + p[q + 1] * cell, X1 = x0 + p[q + 2] * cell, Y1 = y0 + p[q + 3] * cell;
        seg.push(X0, Y0, X1, Y1); lev.push(l);
        ang.push((Math.atan2((Y0 + Y1) / 2 - core[1], (X0 + X1) / 2 - core[0]) + Math.PI) / (2 * Math.PI));
      }
    }
  }
  return { seg: new Float32Array(seg), lev: new Uint8Array(lev), ang: new Float32Array(ang) };
}

/* Ink for ridge k: the core ridge is the heaviest, and they thin and fade towards the edge,
   like ink lifting at the edge of a pressed finger. `scale` is the stage width / 700. */
export function ridgeInk(k, scale = 1) {
  const u = k / Math.max(1, RIDGE.levels - 1);
  return { width: Math.max(1, (2.5 - 1.1 * u) * scale), alpha: 0.95 - 0.25 * u }; // alpha >= 0.7: 3:1 on paper (check_a11y.py)
}
export const CASING = 1.1;        // px of paper on each side of a ridge, so ridges read over dense points
export const CASING_ALPHA = 0.9;

/* Both clouds' ridges for one view. sep: 1 side by side, 0 overlaid. */
export function cloudRidges(geo, m, v, sep, { withSyn = true, cellPx = 3 } = {}) {
  const ox = geo.layout.apart * sep;
  const fr = densityField(project(geo.real, m, -ox, v), v, { cellPx });
  const thr = ridgeLevels(fr);
  const out = { real: ridgeSegments(fr, thr), thr };
  if (withSyn) out.syn = ridgeSegments(densityField(project(geo.syn, m, ox, v), v, { cellPx }), thr);
  return out;
}

/* Join segments that share an end into polylines (marching squares computes a shared edge point
   identically from both cells, so the ends match exactly). Keeps the poster small. */
function chain(seg, keep) {
  const n = seg.length / 4, key = (s, e) => `${seg[s * 4 + e * 2].toFixed(3)},${seg[s * 4 + e * 2 + 1].toFixed(3)}`;
  const at = new Map(), used = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (!keep(s)) { used[s] = 1; continue; }
    for (const e of [0, 1]) { const k = key(s, e); if (!at.has(k)) at.set(k, []); at.get(k).push(s * 2 + e); }
  }
  const pt = (s, e) => [seg[s * 4 + e * 2], seg[s * 4 + e * 2 + 1]];
  const out = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const line = [pt(s0, 0), pt(s0, 1)];
    for (const dir of [1, 0]) {
      let s = s0, e = dir;
      for (;;) {
        const next = (at.get(key(s, e)) || []).find((q) => !used[q >> 1]);
        if (next === undefined) break;
        s = next >> 1; used[s] = 1; e = 1 - (next & 1);
        if (dir) line.push(pt(s, e)); else line.unshift(pt(s, e));
      }
    }
    out.push(line);
  }
  return out;
}

/* The poster: the final, side-by-side state, as an SVG string, from the same functions. */
export function posterSVG(data, { W = 1000, colors = { real: "#4a1d7a", syn: "#0a6b70" } } = {}) {
  const H = Math.round(W / SCENE.aspect);
  const g = prepare(data);
  const v = viewFor(W, H, g.layout);
  const m = orient(yawAt(LOOP_END, g.broad));
  const ap = g.layout.apart;
  const scale = W / 700;
  const r1 = (x) => Math.round(x * 10) / 10;
  const dots = (xy) => {
    let d = "", px = 0, py = 0;
    for (let i = 0; i < xy.length; i += 2) {
      const X = Math.round(xy[i]), Y = Math.round(xy[i + 1]);
      d += d ? `m${X - px} ${Y - py}h0` : `M${X} ${Y}h0`;
      px = X; py = Y;
    }
    return d;
  };
  const lines = (rs, k) => {
    let d = "";
    for (const line of chain(rs.seg, (s) => rs.lev[s] === k)) {
      let px = 0, py = 0;
      line.forEach((q, i) => {
        const X = r1(q[0]), Y = r1(q[1]);
        d += i ? `l${r1(X - px)} ${r1(Y - py)}` : `M${X} ${Y}`;
        px = X; py = Y;
      });
    }
    return d.replace(/ -/g, "-");
  };
  const rid = cloudRidges(g, m, v, 1);
  const dot = (SCENE.pointSize * v.f) / v.dist;
  // paper casings first, then the ink, as on the canvas
  let casing = "", ink = "";
  for (const [rs, col] of [[rid.real, colors.real], [rid.syn, colors.syn]]) {
    for (let k = 0; k < RIDGE.levels; k++) {
      const s = ridgeInk(k, scale), d = lines(rs, k);
      if (!d) continue;
      casing += `<path d="${d}" stroke-width="${(s.width + 2 * CASING * scale).toFixed(2)}"/>`;
      ink += `<path d="${d}" stroke="${col}" stroke-opacity="${s.alpha.toFixed(2)}" stroke-width="${s.width.toFixed(2)}"/>`;
    }
  }
  // One path per cloud keeps the file small, but overlapping dots in one path do not darken each
  // other as they do on the canvas; a little more opacity brings the dense cores close.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#fcfbfe"/>` +
    `<g fill="none" stroke-linecap="round" stroke-width="${dot.toFixed(2)}" stroke-opacity="${Math.min(1, SCENE.pointAlpha + 0.15)}">` +
    `<path stroke="${colors.real}" d="${dots(project(g.real, m, -ap, v))}"/>` +
    `<path stroke="${colors.syn}" d="${dots(project(g.syn, m, ap, v))}"/></g>` +
    `<g fill="none" stroke="#fcfbfe" stroke-opacity="${CASING_ALPHA}" stroke-linecap="round" stroke-linejoin="round">${casing}</g>` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${ink}</g></svg>`;
}
