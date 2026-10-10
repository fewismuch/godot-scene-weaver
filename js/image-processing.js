// Browser adaptation of perfectPixel's fixed-grid path: Sobel edge projections,
// local grid-line refinement, then center, median, or majority sampling per cell.
// Sources: https://github.com/theamusing/perfectPixel and
// https://github.com/theamusing/perfectPixel_webdemo/services/perfectPixelService.ts
// (theAmusing; the core perfect-pixel package declares MIT).

export function removeSolidBackground(image, color, tolerance = 12) {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const matches = i => {
    const p = i * 4;
    return data[p + 3] === 0 || (
      Math.abs(data[p] - color[0]) <= tolerance &&
      Math.abs(data[p + 1] - color[1]) <= tolerance &&
      Math.abs(data[p + 2] - color[2]) <= tolerance
    );
  };
  const add = i => {
    if (!visited[i] && matches(i)) {
      visited[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width, y = (i / width) | 0;
    data[i * 4 + 3] = 0;
    if (x > 0) add(i - 1);
    if (x + 1 < width) add(i + 1);
    if (y > 0) add(i - width);
    if (y + 1 < height) add(i + width);
  }
  return { width, height, data };
}

export function refinedGrid(image, gridWidth, gridHeight, intensity = 0.25) {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4, a = data[p + 3] / 255;
    gray[i] = a * (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) + (1 - a) * 255;
  }
  const gx = new Float32Array(width), gy = new Float32Array(height);
  // 3x3 Sobel, summed by axis as in perfectPixel's refine_grids().
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const sx = -gray[i - width - 1] + gray[i - width + 1]
      - 2 * gray[i - 1] + 2 * gray[i + 1]
      - gray[i + width - 1] + gray[i + width + 1];
    const sy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
      + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
    gx[x] += Math.abs(sx); gy[y] += Math.abs(sy);
  }
  function axis(length, cells, projection) {
    const coords = new Int32Array(cells + 1);
    coords[cells] = length;
    const cell = length / cells, radius = cell * intensity;
    for (let n = 1; n < cells; n++) {
      const expected = Math.round(n * cell);
      let best = expected, strength = 0;
      const lo = Math.max(coords[n - 1] + 1, Math.ceil(n * cell - radius), 1);
      const hi = Math.min(Math.floor(n * cell + radius), length - (cells - n), length - 2);
      for (let p = lo; p <= hi; p++) {
        if (projection[p] > projection[p - 1] && projection[p] >= projection[p + 1] && projection[p] > strength) {
          best = p; strength = projection[p];
        }
      }
      coords[n] = Math.max(coords[n - 1] + 1, Math.min(best, length - (cells - n)));
    }
    return coords;
  }
  return { x: axis(width, gridWidth, gx), y: axis(height, gridHeight, gy) };
}

function median(values) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function sampleMedianCell(image, x0, y0, x1, y1, result, target) {
  const alpha = [], channels = [[], [], []];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = (y * image.width + x) * 4;
    const a = image.data[p + 3];
    alpha.push(a);
    if (a >= 128) for (let channel = 0; channel < 3; channel++) channels[channel].push(image.data[p + channel]);
  }
  if (median(alpha) < 128) return;
  for (let channel = 0; channel < 3; channel++) result[target + channel] = median(channels[channel]);
  result[target + 3] = 255;
}

function sampleMajorityCell(image, x0, y0, x1, y1, result, target) {
  const width = x1 - x0, area = width * (y1 - y0);
  const count = Math.min(128, area);
  const samples = new Uint8Array(count * 4);
  for (let sample = 0; sample < count; sample++) {
    const position = Math.floor((sample + 0.5) * area / count);
    const x = x0 + position % width, y = y0 + Math.floor(position / width);
    const source = (y * image.width + x) * 4;
    for (let channel = 0; channel < 4; channel++) samples[sample * 4 + channel] = image.data[source + channel];
  }
  // Adapt perfectPixel's two-color majority-cluster approach; include alpha for transparent sprites.
  const centers = [Array.from(samples.slice(0, 4)), Array.from(samples.slice(0, 4))];
  let farthest = -1;
  for (let sample = 0; sample < count; sample++) {
    let distance = 0;
    for (let channel = 0; channel < 4; channel++) {
      const delta = samples[sample * 4 + channel] - centers[0][channel];
      distance += delta * delta;
    }
    if (distance > farthest) {
      farthest = distance;
      for (let channel = 0; channel < 4; channel++) centers[1][channel] = samples[sample * 4 + channel];
    }
  }
  let sizes = [0, 0];
  for (let iteration = 0; iteration < 6; iteration++) {
    const sums = [new Float64Array(4), new Float64Array(4)];
    sizes = [0, 0];
    for (let sample = 0; sample < count; sample++) {
      let first = 0, second = 0;
      for (let channel = 0; channel < 4; channel++) {
        const value = samples[sample * 4 + channel];
        first += (value - centers[0][channel]) ** 2;
        second += (value - centers[1][channel]) ** 2;
      }
      const cluster = second < first ? 1 : 0;
      sizes[cluster]++;
      for (let channel = 0; channel < 4; channel++) sums[cluster][channel] += samples[sample * 4 + channel];
    }
    for (let cluster = 0; cluster < 2; cluster++) {
      if (sizes[cluster]) for (let channel = 0; channel < 4; channel++) {
        centers[cluster][channel] = sums[cluster][channel] / sizes[cluster];
      }
    }
  }
  const winner = centers[sizes[1] >= sizes[0] ? 1 : 0];
  for (let channel = 0; channel < 4; channel++) result[target + channel] = winner[channel];
}

export function sampleRefinedGrid(image, gridWidth, gridHeight, method = "center") {
  if (!["center", "median", "majority"].includes(method)) throw new Error("无效的格内取样方式。");
  const { x, y } = refinedGrid(image, gridWidth, gridHeight);
  const result = new Uint8ClampedArray(gridWidth * gridHeight * 4);
  for (let row = 0; row < gridHeight; row++) for (let col = 0; col < gridWidth; col++) {
    const target = (row * gridWidth + col) * 4;
    if (method === "median") {
      sampleMedianCell(image, x[col], y[row], x[col + 1], y[row + 1], result, target);
    } else if (method === "majority") {
      sampleMajorityCell(image, x[col], y[row], x[col + 1], y[row + 1], result, target);
    } else {
      const sx = Math.min(image.width - 1, Math.floor((x[col] + x[col + 1]) / 2));
      const sy = Math.min(image.height - 1, Math.floor((y[row] + y[row + 1]) / 2));
      const source = (sy * image.width + sx) * 4;
      for (let channel = 0; channel < 4; channel++) result[target + channel] = image.data[source + channel];
    }
    if (result[target + 3] < 128) result.fill(0, target, target + 4);
    else result[target + 3] = 255;
  }
  return { width: gridWidth, height: gridHeight, data: result };
}

function adjustPixelColors(data, saturation, contrast) {
  const sat = saturation / 100, con = contrast / 100;
  if (sat === 1 && con === 1) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const red = (data[i] - 128) * con + 128;
    const green = (data[i + 1] - 128) * con + 128;
    const blue = (data[i + 2] - 128) * con + 128;
    const gray = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    data[i] = gray + (red - gray) * sat;
    data[i + 1] = gray + (green - gray) * sat;
    data[i + 2] = gray + (blue - gray) * sat;
  }
}

function contentBounds(image, x0, y0, x1, y1) {
  let left = x1, top = y1, right = -1, bottom = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (image.data[(y * image.width + x) * 4 + 3] < 128) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

function inkRuns(image, axis, detection) {
  const length = axis === "x" ? image.width : image.height;
  const other = axis === "x" ? image.height : image.width;
  const { backgroundColor, tolerance = 0 } = detection;
  const runs = [];
  let start = -1;
  for (let n = 0; n < length; n++) {
    let hasInk = false;
    for (let m = 0; m < other; m++) {
      const x = axis === "x" ? n : m, y = axis === "x" ? m : n;
      const p = (y * image.width + x) * 4;
      if (image.data[p + 3] < 128) continue;
      if (backgroundColor &&
          Math.abs(image.data[p] - backgroundColor[0]) <= tolerance &&
          Math.abs(image.data[p + 1] - backgroundColor[1]) <= tolerance &&
          Math.abs(image.data[p + 2] - backgroundColor[2]) <= tolerance) continue;
      hasInk = true;
      break;
    }
    if (hasInk && start < 0) start = n;
    if (!hasInk && start >= 0) { runs.push({ start, end: n }); start = -1; }
  }
  if (start >= 0) runs.push({ start, end: length });
  return runs;
}

function regularBands(length, count, leading, trailing, gap) {
  const cell = (length - leading - trailing - gap * (count - 1)) / count;
  if (cell < 1) throw new Error("边缘与间隔之和过大，格子宽度不足 1 像素。");
  return Array.from({ length: count }, (_, i) => ({
    start: Math.round(leading + i * (cell + gap)),
    end: Math.round(leading + i * (cell + gap) + cell),
  }));
}

export function detectGridBands(image, columns, rows, spacing = null, detection = {}) {
  if (spacing) {
    return {
      x: regularBands(image.width, columns, spacing.left, spacing.right, spacing.columnGap),
      y: regularBands(image.height, rows, spacing.top, spacing.bottom, spacing.rowGap),
    };
  }
  const x = inkRuns(image, "x", detection), y = inkRuns(image, "y", detection);
  if (columns === 1 && x.length) x.splice(0, x.length, { start: x[0].start, end: x.at(-1).end });
  if (rows === 1 && y.length) y.splice(0, y.length, { start: y[0].start, end: y.at(-1).end });
  if (x.length !== columns || y.length !== rows) {
    throw new Error(`自动识别到 ${x.length} 列、${y.length} 行内容，与设定的 ${columns} 列、${rows} 行不符。请检查背景色，或关闭自动识别并填写边缘和间隔。`);
  }
  return { x, y };
}

export function pixelateGridImage(image, columns, rows, tileWidth, tileHeight, spacing = null, scale = 4, detection = {}, color = { saturation: 100, contrast: 100 }, sampleMethod = "center") {
  const bands = detectGridBands(image, columns, rows, spacing, detection);
  const source = document.createElement("canvas");
  source.width = image.width; source.height = image.height;
  source.getContext("2d").putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  const large = document.createElement("canvas");
  large.width = tileWidth * scale; large.height = tileHeight * scale;
  const largeCtx = large.getContext("2d", { willReadFrequently: true });
  const result = document.createElement("canvas");
  result.width = columns * tileWidth; result.height = rows * tileHeight;
  const output = result.getContext("2d");
  let count = 0;
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const box = contentBounds(image, bands.x[col].start, bands.y[row].start, bands.x[col].end, bands.y[row].end);
    if (!box) continue;
    largeCtx.clearRect(0, 0, large.width, large.height);
    largeCtx.imageSmoothingEnabled = true;
    largeCtx.imageSmoothingQuality = "high";
    largeCtx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, large.width, large.height);
    const pixels = sampleRefinedGrid(largeCtx.getImageData(0, 0, large.width, large.height), tileWidth, tileHeight, sampleMethod);
    adjustPixelColors(pixels.data, color.saturation, color.contrast);
    output.putImageData(new ImageData(pixels.data, tileWidth, tileHeight), col * tileWidth, row * tileHeight);
    count++;
  }
  return { canvas: result, count, bands };
}
