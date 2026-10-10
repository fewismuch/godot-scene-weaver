import { $ } from "./dom.js";
import { state } from "./state.js";
import { hideProgress, markDirty } from "./utils.js";
import { normalize } from "./model.js";
import { resetHistory } from "./history.js";
import { autoSegment } from "./segment.js";
import { render, showSelected, fit } from "./render.js";
import { syncGodotAtlasPath } from "./godot-export.js";
import { commitPendingEditor } from "./editor.js";

export function loadJSON(data) {
  state.documentVersion++;
  hideProgress();
  state.objects = (data.objects || []).map(normalize);
  state.imageName = data.meta?.atlas || data.meta?.image || state.imageName;
  syncGodotAtlasPath();
  state.selected = new Set(state.objects.length ? [0] : []);
  state.primary = state.objects.length ? 0 : -1;
  state.editingIndex = -1;
  resetHistory();
  markDirty(false);
  render();
  showSelected();
}

export function loadImageFile(file) {
  const version = ++state.documentVersion;
  const im = new Image();
  im.onload = async () => {
    if (version !== state.documentVersion) { URL.revokeObjectURL(im.src); return; }
    if (state.imageURL) URL.revokeObjectURL(state.imageURL);
    state.imageURL = im.src;
    state.imageName = file.name;
    syncGodotAtlasPath();
    state.img = im;
    state.imgData = null;
    $("segBtn").disabled = false;
    render();
    fit();
    if (await autoSegment() && version === state.documentVersion) resetHistory();
  };
  im.onerror = () => {
    URL.revokeObjectURL(im.src);
    if (version === state.documentVersion) hideProgress();
  };
  im.src = URL.createObjectURL(file);
}

export function exportJSON() {
  if (!commitPendingEditor()) return;
  const data = {
    meta: {
      image_resolution: state.img ? { width: state.img.width, height: state.img.height } : { width: 0, height: 0 },
      coordinate_system: "top_left_origin",
      perspective: "top_down",
      atlas: state.imageName,
    },
    objects: state.objects,
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = (state.imageName ? state.imageName.replace(/\.[^.]+$/, "") : "atlas") + ".objects.json";
  a.click();
  markDirty(false);
}
