/* Ridge geometry shared by the hero, the worker and tools/og.html.
   A print is a whorl plus one Gaussian ridge along the chord of every column pair, weighted by
   that pair's rank correlation:
     field(p) = whorl(p) + A · Σ_{i<j} ρ_ij · exp(-d(p, chord_ij)² / 2σ²)
   The field is linear in the matrix, so morphing between matrices is a blend of fields. One
   scale A, set by the real matrix, is used for every matrix, so the comparison stays honest. */

export const VIEW = { w: 2.0, h: 2.4 };            // x ∈ [-1, 1], y ∈ [-1.2, 1.2]
export const OVAL = { cx: 0, cy: 0.02, rx: 0.9, ry: 1.1 };
const CORE = { x: 0.02, y: 0.16 };
export const PERIOD = 0.074;                        // ridge spacing
const SIGMA = 0.13;                                 // reach of each column pair

export function anchors(n) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
    pts.push({ x: OVAL.cx + OVAL.rx * 0.97 * Math.cos(a), y: OVAL.cy + OVAL.ry * 0.97 * Math.sin(a) });
  }
  return pts;
}

/* mats: array of n×n matrices, the first one sets the scale. grid: cells across. */
export function buildFields(mats, n, grid) {
  const P = anchors(n);
  const nx = grid + 1, ny = Math.round(grid * (VIEW.h / VIEW.w)) + 1;
  const dx = VIEW.w / grid, dy = VIEW.h / (ny - 1);
  const K = mats.length, cut2 = 9 * SIGMA * SIGMA, inv2s2 = 1 / (2 * SIGMA * SIGMA);
  const S = mats.map(() => new Float32Array(nx * ny));
  const base = new Float32Array(nx * ny);

  for (let gy = 0; gy < ny; gy++) {
    const y = -VIEW.h / 2 + gy * dy;
    for (let gx = 0; gx < nx; gx++) {
      const x = -VIEW.w / 2 + gx * dx;
      const ux = (x - CORE.x) / 0.92, uy = (y - CORE.y);
      const ang = Math.atan2(uy, ux);
      base[gy * nx + gx] = Math.hypot(ux, uy) * (1 + 0.06 * Math.sin(2 * ang + 0.6)) + 0.035 * Math.sin(3 * ang);
    }
  }
  // Loop over pairs, and only over the grid cells inside each chord's padded bounding box.
  const pad = 3 * SIGMA;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = P[i], b = P[j];
    const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
    const r = mats.map((m) => m[i][j]);
    if (r.every((v) => v === 0)) continue;
    const gx0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad + VIEW.w / 2) / dx));
    const gx1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + pad + VIEW.w / 2) / dx));
    const gy0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - pad + VIEW.h / 2) / dy));
    const gy1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + pad + VIEW.h / 2) / dy));
    for (let gy = gy0; gy <= gy1; gy++) {
      const y = -VIEW.h / 2 + gy * dy;
      for (let gx = gx0; gx <= gx1; gx++) {
        const x = -VIEW.w / 2 + gx * dx;
        let t = ((x - a.x) * vx + (y - a.y) * vy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - (a.x + t * vx), ey = y - (a.y + t * vy);
        const d2 = ex * ex + ey * ey;
        if (d2 > cut2) continue;
        const g = Math.exp(-d2 * inv2s2), idx = gy * nx + gx;
        for (let k = 0; k < K; k++) S[k][idx] += r[k] * g;
      }
    }
  }
  let mx = 0;
  for (let i = 0; i < S[0].length; i++) mx = Math.max(mx, Math.abs(S[0][i]));
  const A = 0.62 / (mx || 1);
  const fields = S.map((s) => {
    const f = new Float32Array(s.length);
    for (let i = 0; i < s.length; i++) f[i] = base[i] + A * s[i];
    return f;
  });
  return { fields, nx, ny, dx, dy };
}

/* Marching squares into one path of short segments. */
function contourPath(ctx, F, nx, ny, toPx) {
  ctx.beginPath();
  for (let gy = 0; gy < ny - 1; gy++) {
    for (let gx = 0; gx < nx - 1; gx++) {
      const i = gy * nx + gx;
      const a = F[i], b = F[i + 1], c = F[i + nx + 1], d = F[i + nx];
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      const l0 = Math.ceil(lo / PERIOD - 0.5), l1 = Math.floor(hi / PERIOD - 0.5);
      for (let l = l0; l <= l1; l++) {
        const v = (l + 0.5) * PERIOD;
        const pts = [];
        if ((a < v) !== (b < v)) pts.push(gx + (v - a) / (b - a), gy);
        if ((b < v) !== (c < v)) pts.push(gx + 1, gy + (v - b) / (c - b));
        if ((d < v) !== (c < v)) pts.push(gx + (v - d) / (c - d), gy + 1);
        if ((a < v) !== (d < v)) pts.push(gx, gy + (v - a) / (d - a));
        for (let k = 0; k + 3 < pts.length; k += 4) {
          const p = toPx(pts[k], pts[k + 1]), q = toPx(pts[k + 2], pts[k + 3]);
          ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
        }
      }
    }
  }
}

export const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/* Draw one print. geo: {nx, ny, dx, dy}; n: number of columns (rim marks). */
export function drawPrint(canvas, geo, F, color, n, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = opts.width || canvas.clientWidth, h = opts.height || canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sx = w / VIEW.w, sy = h / VIEW.h;
  const toPx = (gx, gy) => [gx * geo.dx * sx, gy * geo.dy * sy];
  const unit = Math.min(sx, sy);

  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = rgb(color);
  ctx.lineWidth = Math.max(1.1, PERIOD * unit * 0.4);
  contourPath(ctx, F, geo.nx, geo.ny, toPx);
  ctx.stroke();
  // soft oval edge, like ink lifting at the edge of a pressed finger
  ctx.globalCompositeOperation = "destination-in";
  ctx.translate((OVAL.cx + VIEW.w / 2) * sx, (OVAL.cy + VIEW.h / 2) * sy);
  ctx.scale(OVAL.rx * sx, OVAL.ry * sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.8, "rgba(0,0,0,1)"); g.addColorStop(0.97, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  if (opts.rim === false) return;
  ctx.save();
  ctx.fillStyle = "rgba(97,93,116,0.75)";
  for (const p of anchors(n)) {
    ctx.beginPath();
    ctx.arc((p.x + VIEW.w / 2) * sx, (p.y + VIEW.h / 2) * sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* Grid resolution: the print is a few hundred pixels wide at most; fewer cells on small screens. */
export const gridFor = (cssWidth) => (cssWidth < 260 ? 96 : cssWidth < 340 ? 112 : 132);
