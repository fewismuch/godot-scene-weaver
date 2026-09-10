import { $ } from "./dom.js";
import { SHAPE_RECT, SHAPE_CIRCLE, SHAPE_CAPSULE } from "./constants.js";
import { state } from "./state.js";
import { clamp, markDirty } from "./utils.js";
import { pushHistory } from "./history.js";
import { rectOf, setRect, clampCollisionToRegion, gridFromCollision, regenerateCollisionForShape } from "./model.js";
import { current } from "./selection.js";
import { render, showSelected, updateNameValidation } from "./render.js";
import { findNameConflict } from "./validation.js";

export function apply() {
  const o = current();
  if (!o) return;
  const newName = $("name").value.trim() || o.id;
  const conflict = findNameConflict(newName, state.primary);
  if (conflict >= 0) {
    updateNameValidation(newName);
    return;
  }
  o.name = newName;
  o.description = $("description").value;
  setRect(o, { x: +$("x").value, y: +$("y").value, w: Math.max(1, +$("w").value), h: Math.max(1, +$("h").value) });
  o.grid_size = [Math.max(1, +$("gw").value), Math.max(1, +$("gh").value)];
  o.anchor = [clamp(+$("ax").value, 0, 1), clamp(+$("ay").value, 0, 1)];
  const r = rectOf(o), spx = $("spx").value, spy = $("spy").value;
  if (spx === "" || spy === "") {
    o.collision = null;
  } else {
    const shape = $("shapeType").value, px = +spx, py = +spy;
    if (shape === SHAPE_CIRCLE) {
      o.collision = { shape, position: [px, py], radius: Math.max(1, +$("sr").value || 1) };
    } else if (shape === SHAPE_CAPSULE) {
      o.collision = {
        shape, position: [px, py],
        size: [Math.max(2, +$("sw").value || 1), Math.max(2, +$("sh").value || 1)],
        radius: Math.max(1, +$("cr").value || 1),
        height: Math.max(2, +$("cht").value || 1),
      };
    } else {
      o.collision = { shape: SHAPE_RECT, position: [px, py], size: [Math.max(1, +$("sw").value || 1), Math.max(1, +$("sh").value || 1)] };
    }
    clampCollisionToRegion(o.collision, r.w, r.h);
    o.grid_size = gridFromCollision(o.collision);
  }
  o.notes = $("notes").value;
  pushHistory();
  markDirty();
  render();
  showSelected();
}

export function applyCollisionRegen() {
  const o = current();
  if (!o) return;
  o.collision = regenerateCollisionForShape(o, $("shapeType").value);
  o.grid_size = gridFromCollision(o.collision);
  pushHistory();
  markDirty();
  render();
  showSelected();
}

export function clearCollision() {
  const o = current();
  if (!o) return;
  o.collision = null;
  state.editingIndex = -1;
  pushHistory();
  markDirty();
  render();
  showSelected();
}
