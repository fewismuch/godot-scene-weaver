import { $ } from "./dom.js";
import { MAX_HISTORY } from "./constants.js";
import { state } from "./state.js";
import { markDirty, snapshot } from "./utils.js";
import { normalizeSelection } from "./selection.js";
import { render, showSelected } from "./render.js";

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
