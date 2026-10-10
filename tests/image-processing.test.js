import test from "node:test";
import assert from "node:assert/strict";
import { removeSolidBackground, detectGridBands, refinedGrid, sampleRefinedGrid } from "../js/image-processing.js";

function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set(paint(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

test("removes edge-connected background but preserves enclosed matching pixels", () => {
  const original = image(5, 5, (x, y) =>
    x >= 1 && x <= 3 && y >= 1 && y <= 3 && !(x === 2 && y === 2)
      ? [255, 0, 0, 255] : [255, 255, 255, 255]);
  const clean = removeSolidBackground(original, [255, 255, 255], 0);
  assert.equal(clean.data[3], 0);
  assert.equal(clean.data[(2 * 5 + 2) * 4 + 3], 255);
  assert.equal(original.data[3], 255);
});

test("fixed grid sampling always returns exact requested pixel dimensions", () => {
  const source = image(128, 128, (x, y) =>
    x >= 32 && x < 96 && y >= 32 && y < 96 ? [200, 60, 30, 255] : [0, 0, 0, 0]);
  const { x, y } = refinedGrid(source, 32, 32);
  assert.equal(x.length, 33);
  assert.equal(y.length, 33);
  assert.equal(x[0], 0); assert.equal(x[32], 128);
  const result = sampleRefinedGrid(source, 32, 32);
  assert.equal(result.width, 32);
  assert.equal(result.height, 32);
  assert.equal(result.data.length, 32 * 32 * 4);
  assert.equal(result.data[(16 * 32 + 16) * 4 + 3], 255);
  assert.equal(result.data[3], 0);
});

test("detects outer margins and inter-cell gaps after background removal", () => {
  const source = image(100, 80, (x, y) => {
    if (((x >= 10 && x < 30) || (x >= 60 && x < 80)) &&
        ((y >= 5 && y < 25) || (y >= 50 && y < 70))) return [200, 20, 20, 255];
    return [255, 255, 255, 255];
  });
  const clean = removeSolidBackground(source, [255, 255, 255], 0);
  const expected = {
    x: [{ start: 10, end: 30 }, { start: 60, end: 80 }],
    y: [{ start: 5, end: 25 }, { start: 50, end: 70 }],
  };
  assert.deepEqual(detectGridBands(clean, 2, 2), expected);
  assert.deepEqual(detectGridBands(clean, 2, 2, {
    left: 10, right: 20, top: 5, bottom: 10, columnGap: 30, rowGap: 25,
  }), expected);
  assert.throws(() => detectGridBands(clean, 3, 2), /自动识别到 2 列/);
});
