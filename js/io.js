import { $ } from "./dom.js";
import { state } from "./state.js";
import { markDirty } from "./utils.js";
import { normalize } from "./model.js";
import { resetHistory } from "./history.js";
import { autoSegment } from "./segment.js";
import { render, showSelected, fit } from "./render.js";
import { syncGodotAtlasPath } from "./godot-export.js";

export function loadJSON(data) {
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
  state.imageName = file.name;
  syncGodotAtlasPath();
  const im = new Image();
  im.onload = async () => {
    state.img = im;
    state.imgData = null;
    $("segBtn").disabled = false;
    render();
    fit();
    await autoSegment();
    resetHistory();
  };
  im.src = URL.createObjectURL(file);
}

export function exportJSON() {
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
