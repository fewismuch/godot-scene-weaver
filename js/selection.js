import { $ } from "./dom.js";
import { SHAPE_RECT } from "./constants.js";
import { state } from "./state.js";
import { displayName, markDirty } from "./utils.js";
import { pushHistory } from "./history.js";
import { rectOf, setRect, rectsIntersect, gridFromCollision, regenerateCollisionForShape } from "./model.js";
import { render, showSelected } from "./render.js";
import { commitPendingEditor } from "./editor.js";

export function selectSingle(i) {
  if (!commitPendingEditor()) return false;
  state.selected = new Set([i]);
  state.primary = i;
  render();
  showSelected();
  return true;
}

export function toggleSelect(i) {
  if (!commitPendingEditor()) return false;
  if (state.selected.has(i)) {
    state.selected.delete(i);
    if (state.primary === i) state.primary = state.selected.size ? [...state.selected][0] : -1;
  } else {
    state.selected.add(i);
    state.primary = i;
  }
  render();
  showSelected();
  return true;
}

export function clearSelection() {
  if (!commitPendingEditor()) return false;
  state.selected = new Set();
  state.primary = -1;
  state.editingIndex = -1;
  render();
  showSelected();
  return true;
}

export function mergeSelected() {
  if (!commitPendingEditor()) return;
  const indices = [...state.selected].sort((a, b) => a - b);
  if (indices.length < 2) return;
  const keep = state.objects[indices[0]];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of indices) {
    const r = rectOf(state.objects[i]);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  setRect(keep, { x: minX, y: minY, w: maxX - minX, h: maxY - minY });
  const remove = new Set(indices.slice(1));
  state.objects = state.objects.filter((_, i) => !remove.has(i));
  const newIdx = state.objects.indexOf(keep);
  state.selected = new Set([newIdx]);
  state.primary = newIdx;
  state.editingIndex = -1;
  pushHistory();
  markDirty();
  render();
  showSelected();
}

export function current() { return state.primary >= 0 ? state.objects[state.primary] : null; }

export function enterCollisionEdit(i) {
  if (!selectSingle(i)) return;
  if (!state.objects[i].collision) {
    state.objects[i].collision = regenerateCollisionForShape(state.objects[i], SHAPE_RECT);
    state.objects[i].grid_size = gridFromCollision(state.objects[i].collision);
    pushHistory();
    markDirty();
  }
  state.editingIndex = i;
  render();
  showSelected();
}

export function deleteSelected() {
  if (!commitPendingEditor()) return;
  if (!state.selected.size) return;
  const names = [...state.selected].map(i => displayName(state.objects[i])).join("、");
  if (!confirm(`删除 ${names}？`)) return;
  const remove = new Set(state.selected);
  state.objects = state.objects.filter((_, i) => !remove.has(i));
  state.selected = new Set();
  state.primary = state.objects.length ? 0 : -1;
  state.editingIndex = -1;
  if (state.objects.length) state.selected.add(0);
  pushHistory();
  markDirty();
  render();
  showSelected();
}

export function finishMarquee(x0, y0, dx, dy, additive) {
  if (!commitPendingEditor()) { $("drawRect").style.display = "none"; return; }
  $("drawRect").style.display = "none";
  const x = Math.min(x0, x0 + dx), y = Math.min(y0, y0 + dy);
  const w = Math.abs(dx), h = Math.abs(dy);
  if (w < 4 && h < 4) { if (!additive) clearSelection(); return; }
  const box = { x, y, w, h }, hits = [];
  state.objects.forEach((o, i) => { if (rectsIntersect(box, rectOf(o))) hits.push(i); });
  if (additive) hits.forEach(i => state.selected.add(i));
  else state.selected = new Set(hits);
  state.primary = state.selected.size ? [...state.selected][0] : -1;
  state.editingIndex = -1;
  render();
  showSelected();
}

export function addCollisionSelected() {
  if (!commitPendingEditor()) return;
  if (!state.img) return;
  const targets = state.selected.size ? [...state.selected].sort((a, b) => a - b) : state.primary >= 0 ? [state.primary] : [];
  if (!targets.length) return;
  let n = 0;
  for (const i of targets) {
    const o = state.objects[i];
    const shape = o.collision?.shape || SHAPE_RECT;
    o.collision = regenerateCollisionForShape(o, shape);
    o.grid_size = gridFromCollision(o.collision);
    o.anchor = [.5, .5];
    n++;
  }
  if (!n) { alert("无法从当前 Region 推断碰撞体积"); return; }
  pushHistory();
  markDirty();
  render();
  showSelected();
}

export function deleteCollisionSelected() {
  if (!commitPendingEditor()) return;
  const targets = state.selected.size ? [...state.selected] : state.primary >= 0 ? [state.primary] : [];
  if (!targets.length) return;
  for (const i of targets) state.objects[i].collision = null;
  state.editingIndex = -1;
  pushHistory();
  markDirty();
  render();
  showSelected();
}
