/* "What people use it for": without JavaScript every group is on the page as a plain list,
   with an index of links that jump to each one. This turns the section into an index and a
   single open group per view, with a switch between "by industry" and "by job". */
const section = document.getElementById("uses");

if (section) {
  const parts = [...section.querySelectorAll(".uses-part")];
  const radios = [...section.querySelectorAll('input[name="uses-view"]')];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const linksOf = (part) => [...part.querySelectorAll(".uses-index a")];
  const groupsOf = (part) => [...part.querySelectorAll(".use-group")];

  function openGroup(part, id) {
    linksOf(part).forEach((a) => {
      if (a.getAttribute("aria-controls") === id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    groupsOf(part).forEach((g) => { g.hidden = g.id !== id; });
  }

  function showPart(kind) {
    parts.forEach((p) => { p.hidden = p.dataset.part !== kind; });
    radios.forEach((r) => { r.checked = r.value === kind; });
  }

  parts.forEach((part) => {
    openGroup(part, groupsOf(part)[0].id);
    part.querySelector(".uses-index").addEventListener("click", (e) => {
      const a = e.target.closest("a[aria-controls]");
      if (!a) return;
      e.preventDefault();
      const id = a.getAttribute("aria-controls");
      openGroup(part, id);
      // On narrow screens the open group sits below the index: bring it into view if it is not.
      const g = document.getElementById(id);
      const r = g.getBoundingClientRect();
      if (r.top > window.innerHeight - 120) {
        g.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
      }
    });
  });

  radios.forEach((r) => r.addEventListener("change", () => { if (r.checked) showPart(r.value); }));

  // A link straight to one group (#use-insurance) opens that group in its view.
  const fromHash = () => {
    const g = location.hash.startsWith("#use-") && document.getElementById(location.hash.slice(1));
    if (!g || !g.classList.contains("use-group")) return false;
    const part = g.closest(".uses-part");
    showPart(part.dataset.part);
    openGroup(part, g.id);
    g.scrollIntoView({ block: "start" });
    return true;
  };
  if (!fromHash()) showPart("industry");
  window.addEventListener("hashchange", fromHash);
  section.classList.add("is-ready");
}
