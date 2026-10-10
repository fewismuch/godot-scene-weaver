import test from "node:test";
import assert from "node:assert/strict";
import { createZip } from "../js/zip.js";
import { autoSegment } from "../js/segment.js";
import { state } from "../js/state.js";
import { commitPendingEditor } from "../js/editor.js";

test("pending form values commit before navigation or export", () => {
  const previousDocument = globalThis.document;
  const previous = {
    img: state.img, objects: state.objects, selected: state.selected, primary: state.primary,
    history: state.history, historyIndex: state.historyIndex, formDirty: state.formDirty, dirty: state.dirty,
  };
  const elements = new Map();
  globalThis.document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      value: "", style: {}, classList: { add() {}, remove() {} },
    });
    return elements.get(id);
  } };
  state.img = null;
  state.objects = [{ id: "OBJ_001", name: "old", description: "", top_left: { x: 0, y: 0 }, bottom_right: { x: 4, y: 4 }, notes: "", collision: null }];
  state.selected = new Set([0]);
  state.primary = 0;
  state.history = [structuredClone(state.objects)];
  state.historyIndex = 0;
  state.formDirty = true;
  elements.set("name", { value: "new", style: {}, classList: { add() {}, remove() {} } });
  for (const [id, value] of Object.entries({ x: "0", y: "0", w: "4", h: "4" })) {
    elements.set(id, { value, style: {}, classList: { add() {}, remove() {} } });
  }
  try {
    assert.equal(commitPendingEditor(), true);
    assert.equal(state.objects[0].name, "new");
    assert.equal(state.formDirty, false);
    assert.equal(state.history.length, 2);
  } finally {
    globalThis.document = previousDocument;
    Object.assign(state, previous);
  }
});

test("ZIP writer stores scene text as UTF-8", async () => {
  const bytes = new Uint8Array(await createZip([{ name: "scene.tscn", data: "名称=测试" }]).arrayBuffer());
  const nameLength = new DataView(bytes.buffer).getUint16(26, true);
  const contentStart = 30 + nameLength;
  const contentLength = new DataView(bytes.buffer).getUint32(18, true);
  assert.equal(new TextDecoder().decode(bytes.subarray(contentStart, contentStart + contentLength)), "名称=测试");
});

test("stale segmentation leaves newer document untouched", async () => {
  const previousDocument = globalThis.document;
  const previousImage = state.img;
  const previousObjects = state.objects;
  const previousVersion = state.documentVersion;
  const progress = { style: {} };
  const message = { textContent: "" };
  globalThis.document = { getElementById: id => id === "progress" ? progress : message };
  state.img = { width: 1, height: 1 };
  state.objects = [{ id: "newer" }];
  try {
    const pending = autoSegment();
    state.documentVersion++;
    assert.equal(await pending, false);
    assert.deepEqual(state.objects, [{ id: "newer" }]);
  } finally {
    globalThis.document = previousDocument;
    state.img = previousImage;
    state.objects = previousObjects;
    state.documentVersion = previousVersion;
  }
});
