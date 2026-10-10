import { $ } from "./dom.js";
import { SHAPE_RECT, SHAPE_CIRCLE, SHAPE_CAPSULE, SHAPE_ELLIPSE } from "./constants.js";
import { state } from "./state.js";
import { clamp } from "./utils.js";

export function rectOf(o) {
  return { x: o.top_left.x, y: o.top_left.y, w: o.bottom_right.x - o.top_left.x, h: o.bottom_right.y - o.top_left.y };
}

export function setRect(o, r) {
  o.top_left = { x: Math.round(r.x), y: Math.round(r.y) };
  o.bottom_right = { x: Math.round(r.x + r.w), y: Math.round(r.y + r.h) };
}

export function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clampRect(r) {
  if (!state.img) return r;
  let { x, y, w, h } = r;
  w = Math.max(1, w);
  h = Math.max(1, h);
  x = clamp(x, 0, state.img.width - 1);
  y = clamp(y, 0, state.img.height - 1);
  if (x + w > state.img.width) w = state.img.width - x;
  if (y + h > state.img.height) h = state.img.height - y;
  return { x, y, w, h };
}

export function cloneCollision(c) { return JSON.parse(JSON.stringify(c)); }

export function clampAABB(a, x0, y0, x1, y1) {
  let { x, y, w, h } = a;
  w = Math.max(1, w);
  h = Math.max(1, h);
  x = clamp(x, x0, x1 - 1);
  y = clamp(y, y0, y1 - 1);
  if (x + w > x1) w = x1 - x;
  if (y + h > y1) h = y1 - y;
  return { x, y, w, h };
}

export function collisionAABB(c) {
  if (!c) return null;
  if (c.shape === SHAPE_CIRCLE) {
    const r = Math.max(1, c.radius || 1);
    const cx = c.position[0], cy = c.position[1];
    return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
  }
  const w = Math.max(1, c.size?.[0] || 1), h = Math.max(1, c.size?.[1] || 1);
  const cx = c.position[0], cy = c.position[1];
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function setCollisionFromAABB(c, a) {
  const x0 = Math.round(a.x);
  const y0 = Math.round(a.y);
  const x1 = Math.round(a.x + a.w);
  const y1 = Math.round(a.y + a.h);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  c.position = [x0 + w / 2, y0 + h / 2];
  if (c.shape === SHAPE_CIRCLE) {
    c.radius = Math.max(1, Math.min(Math.floor(w / 2), Math.floor(h / 2)));
    delete c.size;
    delete c.height;
  } else if (c.shape === SHAPE_CAPSULE) {
    c.size = [w, h];
    c.radius = Math.max(1, Math.min(w / 2, h / 2));
    c.height = h;
  } else {
    c.size = [w, h];
    delete c.radius;
    delete c.height;
  }
}

export function clampCollisionToRegion(c, rw, rh) {
  if (!c || rw <= 0 || rh <= 0) return;
  if (c.shape === SHAPE_CIRCLE) {
    c.radius = Math.min(Math.max(1, c.radius), rw / 2, rh / 2);
    c.position = [clamp(c.position[0], c.radius, rw - c.radius), clamp(c.position[1], c.radius, rh - c.radius)];
  } else {
    const w = Math.min(Math.max(1, c.size[0]), rw);
    const h = Math.min(Math.max(1, c.size[1]), rh);
    c.size = [c.shape === SHAPE_CAPSULE ? Math.min(w, h) : w, h];
    c.position = [clamp(c.position[0], c.size[0] / 2, rw - c.size[0] / 2), clamp(c.position[1], h / 2, rh - h / 2)];
    if (c.shape === SHAPE_CAPSULE) {
      c.radius = c.size[0] / 2;
      c.height = h;
    }
  }
}

export function normalizeCollision(raw, rw, rh) {
  if (!raw) return null;
  let c;
  if (raw.shape) {
    c = { shape: raw.shape, position: [+raw.position[0], +raw.position[1]] };
    if (raw.size) c.size = [+raw.size[0], +raw.size[1]];
    if (raw.radius != null) c.radius = +raw.radius;
    if (raw.height != null) c.height = +raw.height;
  } else {
    const w = +(raw.width ?? raw.w ?? 1), h = +(raw.height ?? raw.h ?? 1);
    const x = +(raw.x ?? 0), y = +(raw.y ?? 0);
    c = { shape: SHAPE_RECT, position: [x + w / 2, y + h / 2], size: [w, h] };
  }
  if (rw > 0 && rh > 0) clampCollisionToRegion(c, rw, rh);
  return c;
}

export function normalize(o, i) {
  const id = o.id || `OBJ_${String(i + 1).padStart(3, "0")}`;
  const tl = o.top_left || { x: o.region?.[0] ?? 0, y: o.region?.[1] ?? 0 };
  const br = o.bottom_right || { x: (o.region?.[0] ?? 0) + (o.region?.[2] ?? 0), y: (o.region?.[1] ?? 0) + (o.region?.[3] ?? 0) };
  const rw = (+br.x) - (+tl.x), rh = (+br.y) - (+tl.y);
  return {
    id,
    name: o.name || id,
    description: o.description || "",
    top_left: { x: +tl.x, y: +tl.y },
    bottom_right: { x: +br.x, y: +br.y },
    grid_size: o.grid_size || [1, 1],
    anchor: o.anchor || [.5, .5],
    notes: o.notes || "",
    collision: normalizeCollision(o.collision, rw, rh),
  };
}

export function shapeToCollision(base, shape, rw, rh) {
  const [bx, by] = base.position, [bw, bh] = base.size;
  let c;
  if (shape === SHAPE_CIRCLE) {
    c = { shape, position: [bx, by], radius: Math.max(1, Math.round(Math.min(bw, bh) / 2)) };
  } else if (shape === SHAPE_CAPSULE) {
    const rad = Math.max(1, Math.round(Math.min(bw, bh) / 2));
    c = { shape, position: [bx, by], size: [bw, bh], radius: rad, height: Math.max(rad * 2, bh) };
  } else if (shape === SHAPE_ELLIPSE) {
    c = { shape, position: [bx, by], size: [Math.max(1, bw), Math.max(1, bh)] };
  } else {
    c = { shape: SHAPE_RECT, position: [bx, by], size: [Math.max(1, bw), Math.max(1, bh)] };
  }
  clampCollisionToRegion(c, rw, rh);
  return c;
}

export function collisionShapeClass(shape) {
  if (shape === SHAPE_CIRCLE) return "shape-circle";
  if (shape === SHAPE_CAPSULE) return "shape-capsule";
  if (shape === SHAPE_ELLIPSE) return "shape-ellipse";
  return "shape-rect";
}

export function applyCollisionDOM(el, c, z) {
  const editing = el.classList.contains("editing");
  el.className = "collision " + collisionShapeClass(c.shape) + (editing ? " editing" : "");
  const a = collisionAABB(c);
  el.style.left = a.x * z + "px";
  el.style.top = a.y * z + "px";
  el.style.width = Math.max(1, a.w * z) + "px";
  el.style.height = Math.max(1, a.h * z) + "px";
  el.style.borderRadius = c.shape === SHAPE_CAPSULE ? `${Math.min(a.w, a.h) * z / 2}px` : "";
}

export function collisionSummary(c) {
  if (!c) return "";
  if (c.shape === SHAPE_CIRCLE) return `Circle r=${c.radius}`;
  if (c.shape === SHAPE_CAPSULE) return `Capsule ${c.size[0]}×${c.size[1]}`;
  if (c.shape === SHAPE_ELLIPSE) return `Ellipse ${c.size[0]}×${c.size[1]}`;
  return `Rect ${c.size[0]}×${c.size[1]}`;
}

export function gridFromCollision(c) {
  const a = collisionAABB(c);
  if (!a) return [1, 1];
  const cell = Math.max(1, +$("cellSize").value || 16);
  return [Math.max(1, Math.ceil(a.w / cell)), Math.max(1, Math.ceil(a.h / cell))];
}

export function isBackgroundPixel(data, i, tolerance, bgKeys) {
  const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
  if (a < 16) return true;
  for (const key of bgKeys) {
    const [br, bg, bb, ba] = key.split(",").map(Number);
    if (Math.abs(r - br) <= tolerance && Math.abs(g - bg) <= tolerance && Math.abs(b - bb) <= tolerance && Math.abs(a - ba) <= tolerance) return true;
  }
  return false;
}

export function detectBackgroundKeys(data, w, h) {
  const keys = new Set();
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
    const i = (y * w + x) * 4;
    keys.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
  }
  return keys;
}

export function ensureImgData() {
  if (!state.img) return null;
  if (state.imgData) return state.imgData;
  const c = document.createElement("canvas");
  c.width = state.img.width;
  c.height = state.img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(state.img, 0, 0);
  state.imgData = ctx.getImageData(0, 0, state.img.width, state.img.height);
  return state.imgData;
}

export function isOpaqueAt(x, y, tolerance = 8) {
  const data = ensureImgData();
  if (!data || x < 0 || y < 0 || x >= state.img.width || y >= state.img.height) return false;
  const i = (y * state.img.width + x) * 4;
  const a = data.data[i + 3];
  if (a < 16) return false;
  const bgKeys = detectBackgroundKeys(data.data, state.img.width, state.img.height);
  return !isBackgroundPixel(data.data, (y * state.img.width + x) * 4, tolerance, bgKeys);
}

export function computeTopDownCollision(o) {
  const r = rectOf(o);
  if (!state.img || r.w < 1 || r.h < 1) return null;
  const footY = Math.floor(r.y + r.h * .55);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, footRows = 0;
  for (let y = footY; y < r.y + r.h; y++) {
    let row = false;
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!isOpaqueAt(x, y)) continue;
      row = true;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (row) footRows++;
  }
  if (minX === Infinity) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!isOpaqueAt(x, y)) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX === Infinity) {
    const fh = Math.max(2, Math.floor(r.h * .25)), fw = Math.max(2, Math.floor(r.w * .6));
    return { shape: SHAPE_RECT, position: [r.w / 2, r.h - fh / 2], size: [fw, fh] };
  }
  let w = maxX - minX + 1, h = maxY - minY + 1;
  if (footRows <= 1 && h < Math.max(2, Math.floor(r.h * .2))) {
    h = Math.min(r.h, Math.max(h, Math.floor(r.h * .25)));
    maxY = Math.min(r.y + r.h - 1, minY + h - 1);
    minY = maxY - h + 1;
    w = maxX - minX + 1;
  }
  const cx = minX - r.x + w / 2, cy = minY - r.y + h / 2;
  return { shape: SHAPE_RECT, position: [cx, cy], size: [w, h] };
}

export function regenerateCollisionForShape(o, shape) {
  const r = rectOf(o);
  const base = computeTopDownCollision(o);
  if (!base) {
    const fh = Math.max(1, Math.floor(r.h * .25)), fw = Math.max(1, Math.floor(r.w * .6));
    return shapeToCollision({ position: [r.w / 2, r.h - fh / 2], size: [fw, fh] }, shape, r.w, r.h);
  }
  return shapeToCollision(base, shape, r.w, r.h);
}
