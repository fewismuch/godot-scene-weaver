import { $ } from "./dom.js";
import { state } from "./state.js";

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function displayName(o) { return (o.name || o.id || "").trim() || o.id; }

export function markDirty(v = true) {
  state.dirty = v;
  $("dirty").style.display = v ? "inline-block" : "none";
}

export function snapshot() { return JSON.parse(JSON.stringify(state.objects)); }

export function showProgress(msg) {
  $("progressMsg").textContent = msg;
  $("progress").style.display = "flex";
}

export function hideProgress() { $("progress").style.display = "none"; }

export function pointerPos(e) {
  const r = $("stage").getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) / state.zoom), y: Math.floor((e.clientY - r.top) / state.zoom) };
}
