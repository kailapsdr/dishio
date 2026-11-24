// The handle between the two sides (laptops only).
// Drag it, or focus it and use the arrow keys, to make the form side wider
// or narrower. Double-click (or Enter) goes back to the starting width.
//
// The width is remembered as a share of the window (for example 0.44), not
// in pixels, so the layout keeps the same balance when the window is resized
// or the page is zoomed in or out.

import { storage } from "./storage.js";

const DEFAULT_SHARE = 0.44;
const MIN_PANEL_PX = 360; // the notepad needs at least this much room
const MIN_TABLE_PX = 420; // and the recipes this much
const KEY_STEP = 0.02;
const DESKTOP = window.matchMedia("(min-width: 960px)");

export function initSplitter() {
  const shell = document.querySelector(".shell");
  const handle = document.getElementById("splitter");
  if (!shell || !handle) return;

  let share = Number(storage.get("panelShare", DEFAULT_SHARE)) || DEFAULT_SHARE;

  function limits() {
    const total = shell.clientWidth;
    const min = Math.min(MIN_PANEL_PX, total * 0.5);
    const max = Math.max(min, total - MIN_TABLE_PX);
    return { total, min, max };
  }

  function apply() {
    if (!DESKTOP.matches) {
      shell.style.removeProperty("--panel-width");
      return;
    }
    const { total, min, max } = limits();
    const px = Math.round(Math.min(max, Math.max(min, share * total)));
    shell.style.setProperty("--panel-width", `${px}px`);
    handle.setAttribute("aria-valuemin", String(Math.round((min / total) * 100)));
    handle.setAttribute("aria-valuemax", String(Math.round((max / total) * 100)));
    handle.setAttribute("aria-valuenow", String(Math.round((px / total) * 100)));
  }

  function setShare(next, save = true) {
    const { total, min, max } = limits();
    share = Math.min(max, Math.max(min, next * total)) / total;
    apply();
    if (save) storage.set("panelShare", share);
  }

  // --- Dragging --------------------------------------------------------------
  handle.addEventListener("pointerdown", (event) => {
    if (!DESKTOP.matches || event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");
    document.body.classList.add("resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    const rect = shell.getBoundingClientRect();
    setShare((event.clientX - rect.left) / rect.width, false);
  });
  const stop = (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
    handle.classList.remove("dragging");
    document.body.classList.remove("resizing");
    storage.set("panelShare", share);
  };
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);

  // --- Keyboard and reset ------------------------------------------------------
  handle.addEventListener("keydown", (event) => {
    const { total, min, max } = limits();
    if (event.key === "ArrowLeft") setShare(share - KEY_STEP);
    else if (event.key === "ArrowRight") setShare(share + KEY_STEP);
    else if (event.key === "Home") setShare(min / total);
    else if (event.key === "End") setShare(max / total);
    else if (event.key === "Enter") setShare(DEFAULT_SHARE);
    else return;
    event.preventDefault();
  });
  handle.addEventListener("dblclick", () => setShare(DEFAULT_SHARE));

  // Window resized or page zoomed: keep the same share.
  window.addEventListener("resize", apply);
  DESKTOP.addEventListener("change", apply);
  apply();
}
