/* Number binding. An element with data-r="path" (and optional data-f="format") gets its text from
   data/results.json; a path starting with "demo." reads data/demo-data.json and one starting with
   "compete." reads data/compete.json (the head-to-head benchmark) and one starting with "cloud."
   reads data/cloud-data.json (the hero's points, loaded by js/cloud.js) and "mcp." reads
   data/mcp-session.json (the agents demo, loaded by js/agents.js) instead.
   tools/update_data.py implements the same formats in Python to bake the values into the HTML
   for readers without JavaScript. Keep the two in step. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

const signed = (v, d) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
const mean = (v) => (Array.isArray(v) ? v[0] : v);
const ordinal = (v) => {
  const n = Math.round(v);
  const s = n % 100 >= 10 && n % 100 <= 20 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
  return `${n}${s}`;
};

export const FORMATS = {
  mean3: (v) => signed(mean(v), 3),
  mean2: (v) => signed(mean(v), 2),
  mean1: (v) => signed(mean(v), 1),
  mean0: (v) => signed(mean(v), 0),
  int: (v) => Math.round(v).toLocaleString("en-US"),
  pct1: (v) => `${(v * 100).toFixed(1)}%`,
  ordinal,
  million1: (v) => `${(v / 1e6).toFixed(1)} million`,
  range3: ([a, b]) => `${a.toFixed(3)} to ${b.toFixed(3)}`,
  range1: ([a, b]) => `${a.toFixed(1)} to ${b.toFixed(1)}`,
  kb: (v) => `${(v / 1000).toFixed(1)} kB`,
  or: (v) => (v.length < 2 ? v.join("") : `${v.slice(0, -1).join(", ")} or ${v[v.length - 1]}`),
  date: (v) => { const [y, m, d] = v.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; },
  text: (v) => String(v),
};

export function resolve(path, results, demo, compete, cloud, mcp) {
  const parts = path.split(".");
  let cur = results;
  if (parts[0] === "demo") { cur = demo; parts.shift(); }
  else if (parts[0] === "compete") { cur = compete; parts.shift(); }
  else if (parts[0] === "cloud") { cur = cloud; parts.shift(); }
  else if (parts[0] === "mcp") { cur = mcp; parts.shift(); }
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function format(value, f = "text") {
  const fn = FORMATS[f] || FORMATS.text;
  return fn(value);
}

export function bindAll(root, results, demo, compete, cloud, mcp) {
  root.querySelectorAll("[data-r]").forEach((el) => {
    const v = resolve(el.dataset.r, results, demo, compete, cloud, mcp);
    if (v === undefined) return;
    el.textContent = format(v, el.dataset.f);
    if (el.tagName === "TIME") el.setAttribute("datetime", String(v));
  });
}
