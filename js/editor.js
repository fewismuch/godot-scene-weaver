import { $ } from "./dom.js";
import { SHAPE_RECT, SHAPE_CIRCLE, SHAPE_CAPSULE, SHAPE_ELLIPSE } from "./constants.js";
import { state } from "./state.js";
import { markDirty } from "./utils.js";
import { pushHistory } from "./history.js";
import { rectOf, setRect, clampCollisionToRegion, gridFromCollision, regenerateCollisionForShape } from "./model.js";
import { render, showSelected, updateNameValidation } from "./render.js";
import { findNameConflict } from "./validation.js";

function current() { return state.primary >= 0 ? state.objects[state.primary] : null; }

export function commitPendingEditor() {
  return !state.formDirty || apply();
}

export function apply() {
  const o = current();
  if (!o) return false;
  const newName = $("name").value.trim() || o.id;
  const conflict = findNameConflict(newName, state.primary);
  if (conflict >= 0) {
    updateNameValidation(newName);
    return false;
  }
  o.name = newName;
  o.description = $("description").value;
  setRect(o, { x: +$("x").value, y: +$("y").value, w: Math.max(1, +$("w").value), h: Math.max(1, +$("h").value) });
  const r = rectOf(o), spx = $("spx").value, spy = $("spy").value;
  if (spx === "" || spy === "") {
    o.collision = null;
  } else {
    const shape = $("shapeType").value, px = +spx, py = +spy;
    if (shape === SHAPE_CIRCLE) {
      o.collision = { shape, position: [px, py], radius: Math.max(1, +$("sr").value || 1) };
    } else if (shape === SHAPE_CAPSULE) {
      const width = Math.max(2, +$("sw").value || 1), height = Math.max(2, +$("sh").value || 1);
      o.collision = {
        shape, position: [px, py],
        size: [Math.min(width, height), height],
        radius: Math.min(width, height) / 2,
        height,
      };
    } else if (shape === SHAPE_ELLIPSE) {
      o.collision = { shape, position: [px, py], size: [Math.max(1, +$("sw").value || 1), Math.max(1, +$("sh").value || 1)] };
    } else {
      o.collision = { shape: SHAPE_RECT, position: [px, py], size: [Math.max(1, +$("sw").value || 1), Math.max(1, +$("sh").value || 1)] };
    }
    clampCollisionToRegion(o.collision, r.w, r.h);
    o.grid_size = gridFromCollision(o.collision);
  }
  o.notes = $("notes").value;
  state.formDirty = false;
  pushHistory();
  markDirty();
  render();
  showSelected();
  return true;
}

export function applyCollisionRegen() {
  const shape = $("shapeType").value;
  if (!commitPendingEditor()) return;
  const o = current();
  if (!o) return;
  o.collision = regenerateCollisionForShape(o, shape);
  o.grid_size = gridFromCollision(o.collision);
  pushHistory();
  markDirty();
  render();
  showSelected();
}

export function clearCollision() {
  if (!commitPendingEditor()) return;
  const o = current();
  if (!o) return;
  o.collision = null;
  state.editingIndex = -1;
  pushHistory();
  markDirty();
  render();
  showSelected();
}
