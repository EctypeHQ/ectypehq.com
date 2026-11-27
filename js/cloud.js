/* Fig. 1, the hero, live: real rows and generated rows as two point clouds of the same shape.
   Loaded by js/main.js after first paint, once the hero is on screen. Until it draws its first
   frame (and whenever it cannot: no WebGL, a lost context, an error) the static poster
   img/cloud.svg, computed by the same js/cloud-core.js, is the figure.

   The loop (timings in cloud-core.js, BEATS): real rows leave a flat table and settle into a
   turning cloud; its fingerprint (nested density ridges, see RIDGE in cloud-core.js) draws
   itself from the core outward; the real points fade, leaving the print; generated rows pour
   into it; the generated cloud's own print appears and both clouds come to rest side by side.
   Then the visitor can drag (or use the arrow keys) to turn them, lay one over the other and
   replay.

   Two layers: WebGL draws the points; a 2D canvas above it draws the ridges, recomputed each
   frame from the points as they are seen, so the print turns with the cloud. */
import * as THREE from "./vendor/three/three.module.min.js";
import { SCENE, LOOP_END, BEATS, RIDGE, CASING, CASING_ALPHA, beat, ease, yawAt, orient, prepare, fitDistance, cameraLift, viewFor, cloudRidges, ridgeInk } from "./cloud-core.js";
import { bindAll } from "./format.js";

const REAL = [0x4a / 255, 0x1d / 255, 0x7a / 255];
const ECT = [0x0a / 255, 0x6b / 255, 0x70 / 255];
const INK = { real: "#4a1d7a", syn: "#0a6b70", paper: "#fcfbfe" };
const PAPER = 0xfcfbfe;
const HOLD = 0.7;

const POINT_VS = `
attribute vec3 aStart;
attribute float aDelay;
uniform float uT, uSpread, uDur, uDiam, uFocal, uGravity;
uniform mat3 uUnturn;
varying float vK;
void main() {
  float k = clamp((uT - aDelay * uSpread) / uDur, 0.0, 1.0);
  float e = uGravity > 0.5 ? k * k * k * (k * (6.0 * k - 15.0) + 10.0) : (k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(-2.0 * k + 2.0, 3.0) / 2.0);
  vec3 p = mix(uUnturn * aStart, position, e);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, uDiam * uFocal / -mv.z);
  vK = k;
}`;
const POINT_FS = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
varying float vK;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float a = uAlpha * smoothstep(0.5, 0.36, r) * min(1.0, vK * 6.0 + 0.35);
  gl_FragColor = vec4(uColor, a);
}`;
function lowPower() {
  const nav = navigator;
  return window.matchMedia("(max-width: 700px)").matches || (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 4;
}

function pointsObject(pts, st, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  g.setAttribute("aStart", new THREE.BufferAttribute(st.start, 3));
  g.setAttribute("aDelay", new THREE.BufferAttribute(st.delay, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: POINT_VS, fragmentShader: POINT_FS, transparent: true, depthWrite: false,
    uniforms: {
      uT: { value: 99 }, uSpread: { value: 1.4 }, uDur: { value: 1.3 }, uDiam: { value: SCENE.pointSize },
      uFocal: { value: 1 }, uGravity: { value: 0 }, uUnturn: { value: new THREE.Matrix3() },
      uColor: { value: new THREE.Vector3(...color) }, uAlpha: { value: SCENE.pointAlpha },
    },
  });
  const o = new THREE.Points(g, m);
  o.frustumCulled = false;
  return o;
}

const BEAT_WORDS = {
  arrive: "Real rows become points",
  shells: "Their shape, traced in ridges",
  letgo: "The fingerprint: the shape, without the rows",
  pour: "New rows generated from it",
  apart: "",
};

export async function initCloud(fig, reduceMotion) {
  const stage = fig.querySelector(".cloud-stage");
  const beatEl = fig.querySelector(".cloud-beat");
  const genEl = fig.querySelector("[data-count='generated']");
  const viewBtns = [...fig.querySelectorAll("[data-view-btn]")];
  const replayBtn = fig.querySelector("[data-replay]");

  const data = await fetch("data/cloud-data.json").then((r) => { if (!r.ok) throw new Error(`cloud-data.json: ${r.status}`); return r.json(); });
  bindAll(fig, {}, {}, {}, data);

  const low = lowPower();
  const geo = prepare(data, { maxPoints: low ? 2200 : 4000 });

  const canvas = document.createElement("canvas");
  canvas.className = "cloud-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-describedby", "cloud-desc");
  canvas.setAttribute("aria-label", "Fig. 1, live: real rows in purple and generated rows in teal, as two point clouds of the same shape. Drag, or use the arrow keys, to turn them.");

  THREE.ColorManagement.enabled = false;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, alpha: false, powerPreference: "default" });
  } catch (e) {
    fig.classList.add("is-static");
    console.warn("Fig. 1: WebGL is not available; showing the static figure.", e);
    return;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(PAPER, 1);
  let dprCap = low ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(SCENE.fov, SCENE.aspect, 0.1, 100);
  const realG = new THREE.Group(), synG = new THREE.Group();
  realG.matrixAutoUpdate = synG.matrixAutoUpdate = false;
  const realPts = pointsObject(geo.real, geo.realStart, REAL);
  const synPts = pointsObject(geo.syn, geo.synStart, ECT);
  synPts.material.uniforms.uGravity.value = 1;
  synPts.material.uniforms.uSpread.value = 1.6;
  synPts.material.uniforms.uDur.value = 1.15;
  realG.add(realPts);
  synG.add(synPts);

  // the ridge layer
  const rc = document.createElement("canvas");
  rc.className = "cloud-ridges";
  rc.setAttribute("aria-hidden", "true");
  // A CPU-backed 2D canvas: a few thousand short strokes rasterise faster there than through a
  // GPU canvas when the GPU is slow or emulated, and cost little where it is fast.
  const rx = rc.getContext("2d", { willReadFrequently: true });
  let ridgeAt = -1e9;
  scene.add(realG, synG);

  const lay = geo.layout;
  const st = {
    t: reduceMotion.matches ? LOOP_END : 0,
    view: "side", sep: 1, sepFrom: 1, sepTo: 1, sepT0: 0,
    spin: 0, tilt: 0, visible: true, raf: 0, last: 0, frames: 0, slow: 0, started: false,
  };
  const still = () => reduceMotion.matches;

  /* ---------- sizing ---------- */
  let W = 0, H = 0;
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height || (r.width === W && r.height === H)) return;
    W = r.width; H = r.height;
    renderer.setSize(W, H, false);
    const d = renderer.getPixelRatio();
    rc.width = Math.round(W * d); rc.height = Math.round(H * d);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    requestFrame();
  }

  /* ---------- one frame ---------- */
  const M4 = new THREE.Matrix4(), M3 = new THREE.Matrix3();
  function setGroup(group, m, ox) {
    group.matrix.set(m[0][0], m[0][1], m[0][2], ox, m[1][0], m[1][1], m[1][2], 0, m[2][0], m[2][1], m[2][2], 0, 0, 0, 0, 1);
    group.matrixWorldNeedsUpdate = true;
  }
  function draw(now) {
    const t = st.t;
    const inLoop = t < LOOP_END;
    // separation: during the loop it follows the last beat; afterwards the view switch
    let sep;
    if (inLoop) sep = ease(beat("apart", t)) * (st.view === "side" ? 1 : 0);
    else {
      const k = still() ? 1 : Math.min(1, (now - st.sepT0) / 850);
      sep = st.sepFrom + (st.sepTo - st.sepFrom) * ease(k);
    }
    st.sep = sep;
    const ox = lay.apart * sep;
    const m = orient(yawAt(t, geo.broad) + st.spin, SCENE.tilt + st.tilt);
    setGroup(realG, m, -ox);
    setGroup(synG, m, ox);
    // the start positions face the viewer whatever the turn: undo the rotation for them
    M4.set(m[0][0], m[0][1], m[0][2], 0, m[1][0], m[1][1], m[1][2], 0, m[2][0], m[2][1], m[2][2], 0, 0, 0, 0, 1);
    M3.setFromMatrix4(M4).transpose();
    realPts.material.uniforms.uUnturn.value.copy(M3);
    synPts.material.uniforms.uUnturn.value.copy(M3);

    const dist = fitDistance(camera.aspect, lay, lay.apart * Math.max(sep, 0.0001));
    const lift = cameraLift(dist);
    camera.position.set(0, lift, dist);
    camera.lookAt(0, lift, 0);
    const focal = (renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2) / Math.tan((SCENE.fov * Math.PI) / 360);
    realPts.material.uniforms.uFocal.value = synPts.material.uniforms.uFocal.value = focal;

    const U = (o) => o.material.uniforms;
    const bShell = beat("shells", t), bLet = beat("letgo", t), bApart = beat("apart", t);
    U(realPts).uT.value = t - HOLD; // the table holds still for a moment first
    U(synPts).uT.value = t - BEATS.find((b) => b.id === "pour").from;
    U(realPts).uAlpha.value = SCENE.pointAlpha * (bLet < 1 ? 1 - ease(bLet) : ease(Math.min(1, bApart * 1.6)));
    synPts.visible = t >= BEATS.find((b) => b.id === "pour").from;
    // The print is recomputed at most about 30 times a second: the cloud turns slowly, and the
    // canvas keeps the last print between updates.
    if (now - ridgeAt > 30 || still() || drag) {
      ridgeAt = now;
      drawRidges(m, sep, still() ? 1 : ease(bShell), ease(Math.min(1, bApart * 2.5)));
    }

    // words for the beat, and the generated-rows counter
    const cur = inLoop ? [...BEATS].reverse().find((b) => t >= b.from) : null;
    const words = cur ? BEAT_WORDS[cur.id] : "";
    if (beatEl.textContent !== words) beatEl.textContent = words;
    beatEl.dataset.tone = cur && (cur.id === "pour") ? "ect" : "real";
    if (genEl && !still()) {
      const n = inLoop ? Math.round(data.rows_generated * ease(beat("pour", t))) : data.rows_generated;
      const txt = n.toLocaleString("en-US");
      if (genEl.textContent !== txt) genEl.textContent = txt;
    }
    fig.classList.toggle("is-rested", t >= BEATS[BEATS.length - 1].from + 0.8);
    renderer.render(scene, camera);
    if (!st.started) {
      st.started = true;
      fig.classList.add("is-live");
    }
  }

  /* ---------- the ridges: both prints, from the points as seen in this frame ----------
     progress (0–1) draws the real print in from the core outward, each ridge traced around the
     core; synAlpha fades in the generated cloud's print. Paper casings first, then the ink. As the
     clouds come together (sep -> 0) the generated print's ridges narrow to an inlay, so where the
     two prints coincide a teal line runs inside each purple ridge, and where they part, both show. */
  function drawRidges(m, sep, progress, synAlpha) {
    const d = rc.width / W;
    rx.setTransform(1, 0, 0, 1, 0, 0);
    rx.clearRect(0, 0, rc.width, rc.height);
    if (progress <= 0) return;
    const v = viewFor(W, H, lay, lay.apart * Math.max(sep, 0.0001));
    const rid = cloudRidges(geo, m, v, sep, { withSyn: synAlpha > 0, cellPx: low ? 4 : 3 });
    rx.setTransform(d, 0, 0, d, 0, 0);
    rx.lineCap = "round"; rx.lineJoin = "round";
    const scale = Math.min(1.2, Math.max(0.6, W / 700));
    const u = progress * (RIDGE.levels + 1);
    const sets = [[rid.real, INK.real, 1, u, 1]];
    if (synAlpha > 0) sets.push([rid.syn, INK.syn, synAlpha, RIDGE.levels + 1, 0.42 + 0.58 * sep]);
    for (const pass of ["casing", "ink"]) {
      for (const [rs, col, alpha, upto, thin] of sets) {
        for (let k = 0; k < RIDGE.levels; k++) {
          if (k >= upto) break;
          const ink = ridgeInk(k, scale);
          rx.beginPath();
          for (let i = 0; i < rs.lev.length; i++) {
            if (rs.lev[i] !== k || k + rs.ang[i] > upto) continue;
            rx.moveTo(rs.seg[i * 4], rs.seg[i * 4 + 1]);
            rx.lineTo(rs.seg[i * 4 + 2], rs.seg[i * 4 + 3]);
          }
          if (pass === "casing") {
            rx.strokeStyle = INK.paper; rx.globalAlpha = CASING_ALPHA * alpha; rx.lineWidth = ink.width + 2 * CASING * scale;
          } else {
            rx.strokeStyle = col; rx.globalAlpha = Math.min(1, ink.alpha / thin ** 0.5) * alpha; rx.lineWidth = Math.max(0.8, ink.width * thin);
          }
          rx.stroke();
        }
      }
    }
    rx.globalAlpha = 1;
  }

  /* ---------- the clock: runs only while the hero is visible and the tab is shown ---------- */
  function loop(now) {
    st.raf = 0;
    const dt = st.last ? Math.min(0.1, (now - st.last) / 1000) : 0;
    st.last = now;
    if (!still()) st.t += dt;
    draw(now);
    // keep it smooth on slow devices: if frames run long, drop the pixel ratio once
    if (dt > 0 && st.frames < 120) {
      st.frames++;
      if (dt > 0.026) st.slow++;
      if (st.frames === 90 && st.slow > 30 && dprCap > 1) { dprCap = 1; renderer.setPixelRatio(1); W = 0; resize(); }
    }
    if (running()) st.raf = requestAnimationFrame(loop);
    else st.last = 0;
  }
  const running = () => st.visible && !document.hidden && (!still() || performance.now() - st.sepT0 < 900);
  function requestFrame() {
    if (!st.raf && st.visible && !document.hidden) st.raf = requestAnimationFrame(loop);
  }

  new IntersectionObserver((es) => {
    st.visible = es.some((e) => e.isIntersecting);
    if (st.visible) requestFrame();
  }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) requestFrame(); });
  new ResizeObserver(resize).observe(stage);

  /* ---------- controls ---------- */
  function setView(v) {
    if (st.t < LOOP_END) st.t = LOOP_END; // asking for a view ends the story
    st.view = v;
    st.sepFrom = st.sep; st.sepTo = v === "side" ? 1 : 0; st.sepT0 = performance.now();
    viewBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.viewBtn === v)));
    fig.dataset.view = v;
    requestFrame();
  }
  viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.viewBtn)));
  replayBtn.addEventListener("click", () => {
    st.t = 0; st.spin = 0; st.tilt = 0;
    setView("side");
    st.t = 0;
    requestFrame();
  });
  const syncReplay = () => { replayBtn.hidden = still(); if (still()) { st.t = LOOP_END; requestFrame(); } };
  reduceMotion.addEventListener("change", syncReplay);
  syncReplay();

  // drag to turn (horizontal turns about the long axis, vertical tips it); arrow keys do the same
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, spin: st.spin, tilt: st.tilt };
    canvas.setPointerCapture(e.pointerId);
    fig.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    st.spin = drag.spin + (e.clientX - drag.x) * 0.009;
    st.tilt = Math.max(-0.9, Math.min(0.9, drag.tilt + (e.clientY - drag.y) * 0.006));
    requestFrame();
  });
  const end = () => { drag = null; fig.classList.remove("is-dragging"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: [-0.18, 0], ArrowRight: [0.18, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key];
    if (!k) return;
    e.preventDefault();
    st.spin += k[0];
    st.tilt = Math.max(-0.9, Math.min(0.9, st.tilt + k[1]));
    requestFrame();
  });

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(st.raf); st.raf = 0;
    fig.classList.remove("is-live");
    fig.classList.add("is-static");
  });

  stage.insertBefore(rc, stage.querySelector(".cloud-poster").nextSibling);
  stage.insertBefore(canvas, rc);
  resize();
  requestFrame();
}
