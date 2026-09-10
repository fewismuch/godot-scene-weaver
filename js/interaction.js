import { $ } from "./dom.js";
import { state } from "./state.js";
import { markDirty, pointerPos } from "./utils.js";
import { pushHistory, undo, redo } from "./history.js";
import {
  rectOf, cloneCollision, collisionAABB, clampAABB,
  setCollisionFromAABB, clampCollisionToRegion, gridFromCollision,
} from "./model.js";
import {
  selectSingle, toggleSelect, mergeSelected, deleteSelected,
  enterCollisionEdit, finishMarquee, addCollisionSelected, deleteCollisionSelected, current,
} from "./selection.js";
import { render, renderList, showSelected, setZoom, fit, setCursorInfo, syncEditorFields, renderCollisionOnly, updateNameValidation } from "./render.js";
import { apply, applyCollisionRegen, clearCollision } from "./editor.js";
import { loadImageFile, loadJSON, exportJSON } from "./io.js";
import { exportGodotScene } from "./godot-export.js";
import { autoSegment } from "./segment.js";

function applyCollisionMove(p) {
  const o = state.objects[state.interaction.index], c = o.collision;
  const dx = p.x - state.interaction.startX, dy = p.y - state.interaction.startY;
  c.position = [state.interaction.orig.position[0] + dx, state.interaction.orig.position[1] + dy];
  clampCollisionToRegion(c, state.interaction.rw, state.interaction.rh);
  syncEditorFields();
  renderCollisionOnly();
}

function applyCollisionResize(p) {
  const o = state.objects[state.interaction.index], h = state.interaction.handle, orig = state.interaction.origAABB;
  let x1 = orig.x, y1 = orig.y, x2 = orig.x + orig.w, y2 = orig.y + orig.h;
  if (h.includes("w")) x1 = p.x;
  if (h.includes("e")) x2 = p.x;
  if (h.includes("n")) y1 = p.y;
  if (h.includes("s")) y2 = p.y;
  if (x2 - x1 < 1) { if (h.includes("w")) x1 = x2 - 1; else x2 = x1 + 1; }
  if (y2 - y1 < 1) { if (h.includes("n")) y1 = y2 - 1; else y2 = y1 + 1; }
  const a = clampAABB({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }, 0, 0, state.interaction.rw, state.interaction.rh);
  setCollisionFromAABB(o.collision, a);
  o.grid_size = gridFromCollision(o.collision);
  syncEditorFields();
  renderCollisionOnly();
}

function hideContextMenu() { $("ctxMenu").style.display = "none"; }

function showContextMenu(x, y) {
  $("ctxMerge").style.display = state.selected.size >= 2 ? "block" : "none";
  const hasCol = [...state.selected].some(i => state.objects[i]?.collision) || !!current()?.collision;
  $("ctxCollisionDel").style.display = hasCol ? "block" : "none";
  $("ctxMenu").style.display = "block";
  const m = $("ctxMenu").getBoundingClientRect();
  $("ctxMenu").style.left = Math.min(x, innerWidth - m.width - 8) + "px";
  $("ctxMenu").style.top = Math.min(y, innerHeight - m.height - 8) + "px";
}

function onOverlayMouseDown(e) {
  const handle = e.target.closest(".handle");
  if (handle && e.button === 0 && state.editingIndex >= 0) {
    e.stopPropagation();
    e.preventDefault();
    const box = handle.closest(".collision"), i = +box.dataset.i;
    if (i !== state.editingIndex) return;
    const o = state.objects[i], r = rectOf(o);
    state.interaction = {
      type: "collisionResize", index: i, rw: r.w, rh: r.h,
      handle: handle.dataset.handle, startX: pointerPos(e).x, startY: pointerPos(e).y,
      origAABB: collisionAABB(o.collision),
    };
    return;
  }
  const collision = e.target.closest(".collision");
  if (collision && e.button === 0) {
    e.stopPropagation();
    e.preventDefault();
    const i = +collision.dataset.i;
    if (state.editingIndex !== i) return;
    const o = state.objects[i], r = rectOf(o);
    state.interaction = {
      type: "collisionMove", index: i, rw: r.w, rh: r.h,
      startX: pointerPos(e).x, startY: pointerPos(e).y, orig: cloneCollision(o.collision),
    };
    return;
  }
  const rect = e.target.closest(".rect");
  if (rect && e.button === 0) {
    e.preventDefault();
    e.stopPropagation();
    window.getSelection()?.removeAllRanges();
    const i = +rect.dataset.i;
    if (e.shiftKey) toggleSelect(i);
    else if (!state.selected.has(i) || state.selected.size > 1) {
      selectSingle(i);
      state.editingIndex = -1;
      render();
    }
  }
}

function onOverlayDblClick(e) {
  if (e.target.closest(".collision") || e.target.closest(".handle")) return;
  const rect = e.target.closest(".rect");
  if (!rect) return;
  e.stopPropagation();
  e.preventDefault();
  enterCollisionEdit(+rect.dataset.i);
}

function onOverlayContextMenu(e) {
  const rect = e.target.closest(".rect");
  if (!rect) return;
  e.preventDefault();
  e.stopPropagation();
  const i = +rect.dataset.i;
  if (!state.selected.has(i)) selectSingle(i);
  showContextMenu(e.clientX, e.clientY);
}

export function bindEvents() {
  $("overlay").addEventListener("mousedown", onOverlayMouseDown);
  $("overlay").addEventListener("dblclick", onOverlayDblClick);
  $("overlay").addEventListener("contextmenu", onOverlayContextMenu);

  $("stage").addEventListener("mousedown", e => {
    if (e.button !== 0 || state.interaction) return;
    if (e.target !== $("stage") && e.target !== $("atlas") && e.target !== $("overlay")) return;
    hideContextMenu();
    const p = pointerPos(e);
    state.interaction = { type: "marquee", x: p.x, y: p.y, additive: e.shiftKey };
    $("drawRect").style.display = "block";
    $("drawRect").style.left = p.x * state.zoom + "px";
    $("drawRect").style.top = p.y * state.zoom + "px";
    $("drawRect").style.width = "0";
    $("drawRect").style.height = "0";
  });

  window.addEventListener("mousemove", e => {
    const p = pointerPos(e);
    setCursorInfo(p);
    if (!state.interaction) return;
    if (state.interaction.type === "marquee") {
      const x = Math.min(state.interaction.x, p.x), y = Math.min(state.interaction.y, p.y);
      $("drawRect").style.left = x * state.zoom + "px";
      $("drawRect").style.top = y * state.zoom + "px";
      $("drawRect").style.width = Math.abs(p.x - state.interaction.x) * state.zoom + "px";
      $("drawRect").style.height = Math.abs(p.y - state.interaction.y) * state.zoom + "px";
    } else if (state.interaction.type === "collisionMove") {
      applyCollisionMove(p);
    } else if (state.interaction.type === "collisionResize") {
      applyCollisionResize(p);
    }
  });

  window.addEventListener("mouseup", e => {
    if (!state.interaction) return;
    if (state.interaction.type === "marquee") {
      const p = pointerPos(e);
      finishMarquee(state.interaction.x, state.interaction.y, p.x - state.interaction.x, p.y - state.interaction.y, state.interaction.additive);
    } else if (state.interaction.type === "collisionMove" || state.interaction.type === "collisionResize") {
      pushHistory();
      markDirty();
      render();
      showSelected();
    }
    state.interaction = null;
  });

  window.addEventListener("mousedown", e => { if (!$("ctxMenu").contains(e.target)) hideContextMenu(); });

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      state.editingIndex = -1;
      hideContextMenu();
      render();
      showSelected();
      state.interaction = null;
    }
    if (e.key === "Delete" && state.selected.size && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) deleteSelected();
    if ((e.ctrlKey || e.metaKey) && e.key === "s" && e.shiftKey) { e.preventDefault(); exportGodotScene(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); exportJSON(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
  });

  $("applyBtn").onclick = apply;
  ["description", "x", "y", "w", "h", "gw", "gh", "ax", "ay", "shapeType", "spx", "spy", "sw", "sh", "sr", "cr", "cht", "notes"]
    .forEach(id => $(id).addEventListener("input", () => markDirty()));
  $("name").addEventListener("input", () => { markDirty(); updateNameValidation(); });
  $("shapeType").addEventListener("change", applyCollisionRegen);
  $("regenCollisionBtn").onclick = applyCollisionRegen;
  $("clearCollisionBtn").onclick = clearCollision;
  $("imgBtn").onclick = () => $("imgFile").click();
  $("jsonBtn").onclick = () => $("jsonFile").click();
  $("imgFile").onchange = e => { const f = e.target.files[0]; if (f) loadImageFile(f); e.target.value = ""; };
  $("jsonFile").onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { loadJSON(JSON.parse(r.result)); } catch (err) { alert("JSON 解析失败：" + err.message); } };
    r.readAsText(f);
    e.target.value = "";
  };
  $("segBtn").onclick = () => autoSegment();
  $("undoBtn").onclick = undo;
  $("redoBtn").onclick = redo;
  $("mergeBtn").onclick = mergeSelected;
  $("exportBtn").onclick = exportJSON;
  $("exportGodotBtn").onclick = exportGodotScene;
  $("deleteBtn").onclick = deleteSelected;
  $("search").oninput = renderList;
  $("sortBtn").onclick = () => { $("sortBtn").textContent = (state.sortAsc = !state.sortAsc) ? "名称↑" : "名称↓"; renderList(); };
  $("zoomIn").onclick = () => setZoom(state.zoom * 1.2);
  $("zoomOut").onclick = () => setZoom(state.zoom / 1.2);
  $("fitBtn").onclick = fit;
  $("ctxDelete").onclick = () => { hideContextMenu(); deleteSelected(); };
  $("ctxMerge").onclick = () => { hideContextMenu(); mergeSelected(); };
  $("ctxEdit").onclick = () => { hideContextMenu(); if (state.primary >= 0) enterCollisionEdit(state.primary); };
  $("ctxCollision").onclick = () => { hideContextMenu(); addCollisionSelected(); };
  $("ctxCollisionDel").onclick = () => { hideContextMenu(); deleteCollisionSelected(); };
  $("canvasWrap").addEventListener("mousedown", e => { if (e.shiftKey) { e.preventDefault(); window.getSelection()?.removeAllRanges(); } });
  $("canvasWrap").addEventListener("wheel", e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(state.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); } }, { passive: false });
  ["dragenter", "dragover"].forEach(t => $("canvasWrap").addEventListener(t, e => { e.preventDefault(); $("drop").style.display = "flex"; }));
  $("canvasWrap").addEventListener("dragleave", e => { if (!e.currentTarget.contains(e.relatedTarget)) $("drop").style.display = "none"; });
  $("canvasWrap").addEventListener("drop", e => {
    e.preventDefault();
    $("drop").style.display = "none";
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.type.startsWith("image/")) loadImageFile(f);
    else if (f.name.endsWith(".json")) {
      const r = new FileReader();
      r.onload = () => { try { loadJSON(JSON.parse(r.result)); } catch (err) { alert("JSON 解析失败：" + err.message); } };
      r.readAsText(f);
    }
  });
}
