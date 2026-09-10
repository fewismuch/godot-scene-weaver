import { $ } from "./dom.js";
import { SHAPE_RECT } from "./constants.js";
import { state } from "./state.js";
import { displayName, markDirty } from "./utils.js";
import { pushHistory } from "./history.js";
import { rectOf, setRect, rectsIntersect, gridFromCollision, regenerateCollisionForShape } from "./model.js";
import { render, showSelected } from "./render.js";

export function normalizeSelection() {
  state.selected = new Set([...state.selected].filter(i => i >= 0 && i < state.objects.length));
  if (state.primary >= state.objects.length) state.primary = state.objects.length - 1;
  if (state.editingIndex >= state.objects.length) state.editingIndex = -1;
  if (state.selected.size === 0 && state.objects.length) state.selected.add(state.primary >= 0 ? state.primary : 0);
  if (state.selected.size && !state.selected.has(state.primary)) state.primary = [...state.selected][0];
  updateMergeButton();
}

export function selectSingle(i) {
  state.selected = new Set([i]);
  state.primary = i;
  render();
  showSelected();
}

export function toggleSelect(i) {
  if (state.selected.has(i)) {
    state.selected.delete(i);
    if (state.primary === i) state.primary = state.selected.size ? [...state.selected][0] : -1;
  } else {
    state.selected.add(i);
    state.primary = i;
  }
  render();
  showSelected();
}

export function clearSelection() {
  state.selected = new Set();
  state.primary = -1;
  state.editingIndex = -1;
  render();
  showSelected();
}

export function updateMergeButton() {
  const n = state.selected.size;
  $("mergeBtn").disabled = n < 2;
  $("multiHint").style.display = n > 1 ? "block" : "none";
  $("multiCount").textContent = n;
  if (n > 1) {
    $("editor").style.display = "none";
    $("noSelection").style.display = "none";
  }
}

export function mergeSelected() {
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
  selectSingle(i);
  if (!state.objects[i].collision) {
    state.objects[i].collision = regenerateCollisionForShape(state.objects[i], SHAPE_RECT);
    state.objects[i].grid_size = gridFromCollision(state.objects[i].collision);
  }
  state.editingIndex = i;
  render();
  showSelected();
}

export function deleteSelected() {
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
  const targets = state.selected.size ? [...state.selected] : state.primary >= 0 ? [state.primary] : [];
  if (!targets.length) return;
  for (const i of targets) state.objects[i].collision = null;
  state.editingIndex = -1;
  pushHistory();
  markDirty();
  render();
  showSelected();
}
