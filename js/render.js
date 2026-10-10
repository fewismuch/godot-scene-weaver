import { $ } from "./dom.js";
import { HANDLES, SHAPE_RECT, SHAPE_CIRCLE, SHAPE_CAPSULE } from "./constants.js";
import { state } from "./state.js";
import { clamp, esc, displayName } from "./utils.js";
import { findNameConflict } from "./validation.js";
import { rectOf, applyCollisionDOM, collisionSummary } from "./model.js";

function current() { return state.primary >= 0 ? state.objects[state.primary] : null; }

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

export function setZoom(z) {
  state.zoom = clamp(z, .15, 12);
  $("zoomText").textContent = Math.round(state.zoom * 100) + "%";
  render();
}

export function fit() {
  if (!state.img) return;
  const r = $("canvasWrap").getBoundingClientRect();
  setZoom(clamp(Math.min((r.width - 56) / state.img.width, (r.height - 56) / state.img.height), .15, 12));
}

export function setCursorInfo(p) {
  const text = state.img ? `(${String(p.x).padStart(5, " ")}, ${String(p.y).padStart(5, " ")})` : "";
  if (text === state.lastCursorText) return;
  state.lastCursorText = text;
  $("cursorInfo").textContent = text;
}

export function render() {
  if (!state.img) {
    $("stage").style.width = "480px";
    $("stage").style.height = "320px";
    $("atlas").style.display = "none";
    return;
  }
  $("atlas").style.display = "block";
  $("atlas").src = state.img.src;
  $("stage").style.width = state.img.width * state.zoom + "px";
  $("stage").style.height = state.img.height * state.zoom + "px";
  $("atlas").width = state.img.width * state.zoom;
  $("atlas").height = state.img.height * state.zoom;
  const ov = $("overlay");
  ov.style.width = state.img.width * state.zoom + "px";
  ov.style.height = state.img.height * state.zoom + "px";
  ov.innerHTML = "";
  state.objects.forEach((o, i) => {
    const r = rectOf(o), sel = state.selected.has(i), ed = i === state.editingIndex;
    const d = document.createElement("div");
    d.className = "rect" + (sel ? " selected" : "") + (ed ? " collision-editing" : "");
    d.style.left = r.x * state.zoom + "px";
    d.style.top = r.y * state.zoom + "px";
    d.style.width = Math.max(1, r.w * state.zoom) + "px";
    d.style.height = Math.max(1, r.h * state.zoom) + "px";
    d.dataset.i = i;
    const lbl = document.createElement("span");
    lbl.className = "label";
    lbl.textContent = displayName(o);
    d.appendChild(lbl);
    if (o.collision) {
      const box = document.createElement("div");
      box.className = "collision";
      box.dataset.i = i;
      if (ed) box.classList.add("editing");
      applyCollisionDOM(box, o.collision, state.zoom);
      if (ed) {
        for (const h of HANDLES) {
          const hd = document.createElement("div");
          hd.className = "handle " + h;
          hd.dataset.handle = h;
          box.appendChild(hd);
        }
      }
      d.appendChild(box);
    }
    ov.appendChild(d);
  });
  $("imageInfo").textContent = `${state.imageName || "Atlas"} · ${state.img.width}×${state.img.height} · ${state.objects.length} 区域`;
  $("listMeta").textContent = `${state.objects.length} 个区域 · 选中 ${state.selected.size}`;
  updateStatus();
  renderList();
  updateMergeButton();
}

export function renderList() {
  const q = $("search").value.toLowerCase();
  let arr = state.objects.map((o, i) => ({ o, i })).filter(v => (displayName(v.o) + " " + v.o.description).toLowerCase().includes(q));
  arr.sort((a, b) => state.sortAsc ? displayName(a.o).localeCompare(displayName(b.o)) : displayName(b.o).localeCompare(displayName(a.o)));
  $("list").innerHTML = arr.length ? arr.map(v => {
    const sel = state.selected.has(v.i), multi = state.selected.size > 1;
    return `<div class="obj ${sel ? "selected" : ""} ${multi && sel ? "multi" : ""}" data-i="${v.i}">
      <div class="idx">${String(v.i + 1).padStart(2, "0")}</div>
      <div><div class="title">${esc(displayName(v.o))}</div><div class="desc">${esc(v.o.description) || "无描述"}</div></div>
    </div>`;
  }).join("") : `<div class="empty">暂无区域</div>`;
}

export function syncShapeFields() {
  const o = current();
  if (!o) return;
  const c = o.collision;
  $("shapeRectFields").style.display = "none";
  $("shapeCircleFields").style.display = "none";
  $("shapeCapsuleFields").style.display = "none";
  if (!c) {
    $("shapeType").value = SHAPE_RECT;
    $("spx").value = $("spy").value = $("sw").value = $("sh").value = $("sr").value = "";
    return;
  }
  $("shapeType").value = c.shape;
  $("spx").value = c.position[0];
  $("spy").value = c.position[1];
  if (c.shape === SHAPE_CIRCLE) {
    $("shapeCircleFields").style.display = "block";
    $("sr").value = c.radius;
  } else if (c.shape === SHAPE_CAPSULE) {
    $("shapeRectFields").style.display = "block";
    $("shapeCapsuleFields").style.display = "block";
    $("sw").value = c.size[0];
    $("sh").value = c.size[1];
  } else {
    $("shapeRectFields").style.display = "block";
    $("sw").value = c.size[0];
    $("sh").value = c.size[1];
  }
}

export function showSelected() {
  state.formDirty = false;
  const multi = state.selected.size > 1, o = multi ? null : current(), has = !!o && !multi;
  $("noSelection").style.display = (!has && !multi) ? "block" : "none";
  $("editor").style.display = has ? "block" : "none";
  updateMergeButton();
  if (!has) { if (!multi) $("selectionInfo").textContent = ""; return; }
  const r = rectOf(o);
  $("id").value = o.id;
  $("name").value = o.name || o.id;
  updateNameValidation(o.name || o.id);
  $("description").value = o.description;
  $("x").value = r.x;
  $("y").value = r.y;
  $("w").value = r.w;
  $("h").value = r.h;
  syncShapeFields();
  $("notes").value = o.notes || "";
  updateStatus();
}

export function updateStatus() {
  if (state.selected.size > 1) { $("selectionInfo").textContent = `已选 ${state.selected.size} 个区域`; return; }
  const o = current();
  $("selectionInfo").textContent = o
    ? `${displayName(o)} · Region ${rectOf(o).w}×${rectOf(o).h}` + (o.collision ? ` · ${collisionSummary(o.collision)}` : "") + (state.editingIndex === state.primary ? " · 编辑碰撞" : "")
    : "";
}

export function syncEditorFields() {
  const o = current();
  if (!o || state.selected.size > 1) return;
  syncShapeFields();
  updateStatus();
}

export function updateNameValidation(name) {
  const input = $("name");
  const hint = $("nameError");
  if (!input || !hint) return true;
  const conflict = findNameConflict((name ?? input.value).trim() || current()?.id, state.primary);
  if (conflict >= 0) {
    input.classList.add("invalid");
    hint.textContent = `名称重复：已被区域 #${conflict + 1}（${displayName(state.objects[conflict])}）使用`;
    hint.style.display = "block";
    return false;
  }
  input.classList.remove("invalid");
  hint.textContent = "";
  hint.style.display = "none";
  return true;
}

export function renderCollisionOnly() {
  state.objects.forEach((o, i) => {
    if (!o.collision) return;
    const el = $("overlay").querySelector(`.collision[data-i="${i}"]`);
    if (!el) return;
    applyCollisionDOM(el, o.collision, state.zoom);
  });
}
