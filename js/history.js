import { $ } from "./dom.js";
import { MAX_HISTORY } from "./constants.js";
import { state } from "./state.js";
import { markDirty, snapshot } from "./utils.js";
import { render, showSelected } from "./render.js";

function normalizeSelection() {
  state.selected = new Set([...state.selected].filter(i => i >= 0 && i < state.objects.length));
  if (state.primary >= state.objects.length) state.primary = state.objects.length - 1;
  if (state.editingIndex >= state.objects.length) state.editingIndex = -1;
  if (state.selected.size === 0 && state.objects.length) state.selected.add(state.primary >= 0 ? state.primary : 0);
  if (state.selected.size && !state.selected.has(state.primary)) state.primary = [...state.selected][0];
}

export function resetHistory() {
  state.history = [snapshot()];
  state.historyIndex = 0;
  updateHistoryButtons();
}

export function pushHistory() {
  const snap = snapshot();
  const last = state.history[state.historyIndex];
  if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snap);
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }
  updateHistoryButtons();
}

export function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  state.objects = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  normalizeSelection();
  markDirty();
  render();
  showSelected();
  updateHistoryButtons();
}

export function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  state.objects = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  normalizeSelection();
  markDirty();
  render();
  showSelected();
  updateHistoryButtons();
}

export function updateHistoryButtons() {
  $("undoBtn").disabled = state.historyIndex <= 0;
  $("redoBtn").disabled = state.historyIndex >= state.history.length - 1;
}
