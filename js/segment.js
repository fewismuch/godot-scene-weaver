import { $ } from "./dom.js";
import { state } from "./state.js";
import { markDirty, showProgress, hideProgress } from "./utils.js";
import { normalize, isBackgroundPixel, detectBackgroundKeys } from "./model.js";
import { pushHistory } from "./history.js";
import { render, showSelected } from "./render.js";

export function segmentImage(image) {
  const w = image.width, h = image.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  const tolerance = +($("bgTolerance").value || 8);
  const minArea = +($("minArea").value || 16);
  const bgKeys = detectBackgroundKeys(data, w, h);
  const parent = new Int32Array(w * h);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
  function unite(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, pix = idx * 4;
      if (isBackgroundPixel(data, pix, tolerance, bgKeys)) continue;
      if (x > 0 && !isBackgroundPixel(data, (idx - 1) * 4, tolerance, bgKeys)) unite(idx, idx - 1);
      if (y > 0 && !isBackgroundPixel(data, (idx - w) * 4, tolerance, bgKeys)) unite(idx, idx - w);
    }
  }
  const boxes = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, pix = idx * 4;
      if (isBackgroundPixel(data, pix, tolerance, bgKeys)) continue;
      const root = find(idx);
      let b = boxes.get(root);
      if (!b) boxes.set(root, { minX: x, maxX: x, minY: y, maxY: y });
      else {
        if (x < b.minX) b.minX = x;
        if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y;
        if (y > b.maxY) b.maxY = y;
      }
    }
  }
  const rects = [];
  for (const b of boxes.values()) {
    const rw = b.maxX - b.minX + 1, rh = b.maxY - b.minY + 1;
    if (rw * rh < minArea) continue;
    rects.push({ x: b.minX, y: b.minY, w: rw, h: rh });
  }
  return rects.sort((a, b) => a.y - b.y || a.x - b.x);
}

export async function autoSegment() {
  if (!state.img) return false;
  const version = state.documentVersion;
  const image = state.img;
  showProgress("正在自动分割…");
  await new Promise(r => setTimeout(r, 16));
  if (version !== state.documentVersion || image !== state.img) return false;
  const rects = segmentImage(image);
  if (version !== state.documentVersion || image !== state.img) return false;
  state.objects = rects.map((r, i) => normalize({
    id: `OBJ_${String(i + 1).padStart(3, "0")}`,
    top_left: { x: r.x, y: r.y },
    bottom_right: { x: r.x + r.w, y: r.y + r.h },
  }, i));
  state.selected = new Set(state.objects.length ? [0] : []);
  state.primary = state.objects.length ? 0 : -1;
  state.editingIndex = -1;
  pushHistory();
  markDirty(true);
  hideProgress();
  render();
  showSelected();
  return true;
}
