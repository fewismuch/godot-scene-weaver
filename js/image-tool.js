import { removeSolidBackground, detectGridBands, pixelateGridImage } from "./image-processing.js";
import { createZip } from "./zip.js";

const $ = id => document.getElementById(id);
const source = $("sourceCanvas"), result = $("resultCanvas");
let loaded = false, picking = false, exportingZip = false;
let outputName = "pixel-atlas.png", tilesName = "pixel-tiles.zip", pixelGrid = null;
const zoom = new WeakMap();

function selectZoomButton(canvas, selected) {
  const prefix = canvas === source ? "source" : "result";
  for (const preset of ["100", "200", "300", "Fit"]) {
    const button = $(prefix + preset);
    const active = selected === preset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}
function setZoom(canvas, factor, selected = null) {
  const width = Math.max(1, Math.round(canvas.width * factor));
  const height = Math.max(1, Math.round(canvas.height * factor));
  const stage = canvas.parentElement;
  stage.style.width = `${width}px`; stage.style.height = `${height}px`;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  zoom.set(canvas, factor);
  $(canvas === source ? "sourceZoom" : "resultZoom").textContent = `${Math.round(factor * 100)}%`;
  selectZoomButton(canvas, selected);
}
function fitCanvas(canvas) {
  if (!canvas.width || !canvas.height) return;
  const area = canvas.closest(".image-area");
  const factor = Math.min(4, (area.clientWidth - 48) / canvas.width, (area.clientHeight - 48) / canvas.height);
  setZoom(canvas, Math.max(0.05, factor), "Fit");
  area.scrollLeft = 0; area.scrollTop = 0;
}
for (const [canvas, prefix] of [[source, "source"], [result, "result"]]) {
  const area = canvas.closest(".image-area");
  $(prefix + "Fit").addEventListener("click", () => fitCanvas(canvas));
  for (const percent of [100, 200, 300]) {
    $(prefix + percent).addEventListener("click", () => {
      if (canvas.width) setZoom(canvas, percent / 100, String(percent));
    });
  }
  area.addEventListener("wheel", event => {
    // macOS pinch sends ctrl+wheel. Plain two-finger scrolling pans natively.
    if (!canvas.width || !canvas.height || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const before = canvas.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(1, (event.clientX - before.left) / before.width));
    const relativeY = Math.max(0, Math.min(1, (event.clientY - before.top) / before.height));
    const step = event.deltaY < 0 ? 1.2 : 1 / 1.2;
    const next = Math.max(0.05, Math.min(32, (zoom.get(canvas) || 1) * step));
    setZoom(canvas, next);
    area.scrollLeft += (canvas.clientWidth - before.width) * relativeX;
    area.scrollTop += (canvas.clientHeight - before.height) * relativeY;
  }, { passive: false });
}

function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function number(id, min, max) {
  const value = Number($(id).value);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${$(id).closest("label")?.firstChild?.textContent?.trim() || id}应为 ${min}–${max} 的整数`);
  return value;
}
function hex(rgb) { return `#${Array.from(rgb).map(v => v.toString(16).padStart(2, "0")).join("")}`; }
function rgb(value) { return [1, 3, 5].map(i => Number.parseInt(value.slice(i, i + 2), 16)); }
const spacingIds = ["marginLeft", "marginRight", "marginTop", "marginBottom", "columnGap", "rowGap"];

function setBackgroundEditability() {
  $("tolerance").disabled = !$("removeBackground").checked;
}

function workingImage(input, backgroundColor, tolerance) {
  return $("removeBackground").checked
    ? removeSolidBackground(input, backgroundColor, tolerance)
    : input;
}

function setSpacingEditability() {
  const automatic = $("autoSpacing").checked;
  for (const id of spacingIds) $(id).disabled = automatic;
  $("spacingTolerance").disabled = !automatic;
}

function fillDetectedSpacing(bands) {
  const averageGap = runs => runs.length < 2 ? 0 : Math.round(
    runs.slice(1).reduce((sum, band, index) => sum + band.start - runs[index].end, 0) / (runs.length - 1)
  );
  const values = {
    marginLeft: bands.x[0].start,
    marginRight: source.width - bands.x.at(-1).end,
    marginTop: bands.y[0].start,
    marginBottom: source.height - bands.y.at(-1).end,
    columnGap: averageGap(bands.x),
    rowGap: averageGap(bands.y),
  };
  for (const [id, value] of Object.entries(values)) $(id).value = value;
}

function updateCropGuide() {
  const guide = $("cropGuide");
  const status = $("guideStatus");
  if (!loaded) {
    guide.setAttribute("hidden", "");
    status.textContent = "上传图片后，原图预览会显示裁剪参考线。";
    return;
  }
  const value = id => Number($(id).value);
  const columns = value("sourceColumns"), rows = value("sourceRows");
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns > 256 || rows > 256) {
    status.textContent = "请先填写有效的原图行列数。";
    return;
  }
  let bands, approximate = false;
  if ($("autoSpacing").checked) {
    try {
      const spacingTolerance = value("spacingTolerance");
      if (!Number.isInteger(spacingTolerance) || spacingTolerance < 0 || spacingTolerance > 255) {
        status.textContent = "间隔识别颜色容差应为 0–255 的整数。";
        return;
      }
      const input = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
      const clean = workingImage(input, rgb($("backgroundColor").value), value("tolerance"));
      bands = detectGridBands(clean, columns, rows, null,
        { backgroundColor: rgb($("backgroundColor").value), tolerance: spacingTolerance });
      fillDetectedSpacing(bands);
      status.textContent = "原图上已显示自动识别的裁剪线；关闭自动识别可手动调整。";
    } catch {
      approximate = true;
      try { bands = detectGridBands({ width: source.width, height: source.height }, columns, rows,
        { left: 0, right: 0, top: 0, bottom: 0, columnGap: 0, rowGap: 0 }); }
      catch { status.textContent = "无法计算参考线，请检查行列数。"; return; }
      status.textContent = "自动识别未匹配当前行列数；橙色线是临时等分参考线。关闭自动识别后可调整边缘和间隔。";
    }
  } else {
    const spacing = {
      left: value("marginLeft"), right: value("marginRight"),
      top: value("marginTop"), bottom: value("marginBottom"),
      columnGap: value("columnGap"), rowGap: value("rowGap"),
    };
    if (![...Object.values(spacing)].every(Number.isInteger) || Object.values(spacing).some(n => n < 0)) {
      status.textContent = "边缘和间隔应填写非负整数。";
      return;
    }
    try { bands = detectGridBands({ width: source.width, height: source.height }, columns, rows, spacing); }
    catch { status.textContent = "边缘与间隔之和过大，请减小数值。"; return; }
    status.textContent = "黄色虚线是当前裁剪边界；调整数值时会实时移动。";
  }
  guide.replaceChildren();
  guide.classList.toggle("approx", approximate);
  guide.setAttribute("viewBox", `0 0 ${source.width} ${source.height}`);
  guide.setAttribute("preserveAspectRatio", "none");
  const element = (tag, attributes, className) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, entry] of Object.entries(attributes)) node.setAttribute(key, entry);
    node.setAttribute("class", className);
    guide.append(node);
  };
  const maskAxis = (bandsForAxis, length, vertical) => {
    let previous = 0;
    for (const band of bandsForAxis) {
      if (band.start > previous) element("rect", vertical
        ? { x: previous, y: 0, width: band.start - previous, height: source.height }
        : { x: 0, y: previous, width: source.width, height: band.start - previous }, "guide-mask");
      previous = band.end;
    }
    if (previous < length) element("rect", vertical
      ? { x: previous, y: 0, width: length - previous, height: source.height }
      : { x: 0, y: previous, width: source.width, height: length - previous }, "guide-mask");
  };
  maskAxis(bands.x, source.width, true);
  maskAxis(bands.y, source.height, false);
  for (const band of bands.x) for (const x of [band.start, band.end]) {
    element("line", { x1: x, y1: 0, x2: x, y2: source.height }, "guide-line");
  }
  for (const band of bands.y) for (const y of [band.start, band.end]) {
    element("line", { x1: 0, y1: y, x2: source.width, y2: y }, "guide-line");
  }
  guide.removeAttribute("hidden");
}

async function loadFile(file) {
  if (exportingZip) return message("正在打包小图，请稍后再加载图片。", true);
  if (!file?.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    source.width = image.naturalWidth; source.height = image.naturalHeight;
    source.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
    const pixel = source.getContext("2d").getImageData(0, 0, 1, 1).data;
    $("backgroundColor").value = hex(pixel.slice(0, 3));
    $("fileName").textContent = file.name;
    $("sourceInfo").textContent = `${source.width} × ${source.height}`;
    outputName = `${file.name.replace(/\.[^.]+$/, "")}-pixel-atlas.png`;
    tilesName = `${file.name.replace(/\.[^.]+$/, "")}-pixel-tiles.zip`;
    pixelGrid = null;
    loaded = true; $("process").disabled = false; $("download").disabled = true; $("downloadTiles").disabled = true;
    result.width = result.height = 0; $("resultInfo").textContent = "等待生成";
    $("resultZoom").textContent = "—";
    selectZoomButton(result, null);
    fitCanvas(source);
    updateCropGuide();
    message("图片已加载，可调整设置后生成。");
  } catch { message("无法读取这张图片。", true); }
  finally { URL.revokeObjectURL(url); }
}

$("sourceFile").addEventListener("change", event => loadFile(event.target.files[0]));
$("removeBackground").addEventListener("change", () => {
  setBackgroundEditability();
  updateCropGuide();
});
$("autoSpacing").addEventListener("change", () => {
  setSpacingEditability();
  if (!$("autoSpacing").checked) $("manualSpacing").open = true;
  updateCropGuide();
});
for (const id of ["sourceColumns", "sourceRows", "marginLeft", "marginRight", "marginTop", "marginBottom", "columnGap", "rowGap"]) {
  $(id).addEventListener("input", updateCropGuide);
}
for (const id of ["backgroundColor", "tolerance", "spacingTolerance"]) $(id).addEventListener("input", updateCropGuide);
setBackgroundEditability();
setSpacingEditability();
$("pickColor").addEventListener("click", () => {
  if (!loaded) return message("请先选择图片。", true);
  picking = true; source.classList.add("picking"); message("请在左侧原图上点击背景颜色。");
});
source.addEventListener("click", event => {
  if (!picking) return;
  const rect = source.getBoundingClientRect();
  const x = Math.min(source.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * source.width / rect.width)));
  const y = Math.min(source.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * source.height / rect.height)));
  $("backgroundColor").value = hex(source.getContext("2d").getImageData(x, y, 1, 1).data.slice(0, 3));
  picking = false; source.classList.remove("picking");
  updateCropGuide();
  message(`背景色已选取：${$("backgroundColor").value}`);
});

$("process").addEventListener("click", async () => {
  if (!loaded || exportingZip) return;
  pixelGrid = null;
  $("downloadTiles").disabled = true;
  $("download").disabled = true;
  try {
    const tileWidth = number("tileWidth", 2, 256), tileHeight = number("tileHeight", 2, 256);
    const sampleMethod = $("sampleMethod").value;
    if (!["center", "median", "majority"].includes(sampleMethod)) throw new Error("请选择有效的格内取样方式。");
    const saturation = number("saturation", 0, 200), contrast = number("contrast", 0, 200);
    const tolerance = $("removeBackground").checked ? number("tolerance", 0, 255) : 0;
    const spacingTolerance = $("autoSpacing").checked ? number("spacingTolerance", 0, 255) : 0;
    const columns = number("sourceColumns", 1, 256);
    const rows = number("sourceRows", 1, 256);
    const outputWidth = tileWidth * columns, outputHeight = tileHeight * rows;
    if (outputWidth > 8192 || outputHeight > 8192 || tileWidth * 4 > 8192 || tileHeight * 4 > 8192) throw new Error("图像过大，请减小网格数或单格尺寸。");
    const spacing = $("autoSpacing").checked ? null : {
      left: number("marginLeft", 0, source.width), right: number("marginRight", 0, source.width),
      top: number("marginTop", 0, source.height), bottom: number("marginBottom", 0, source.height),
      columnGap: number("columnGap", 0, source.width), rowGap: number("rowGap", 0, source.height),
    };
    $("process").disabled = true; message($("removeBackground").checked ? "正在去背景、逐格裁剪并像素化…" : "正在逐格裁剪并像素化…");
    await new Promise(resolve => setTimeout(resolve, 20));
    const input = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
    const clean = workingImage(input, rgb($("backgroundColor").value), tolerance);
    const { canvas: sheet, count } = pixelateGridImage(clean, columns, rows, tileWidth, tileHeight, spacing, 4,
      { backgroundColor: rgb($("backgroundColor").value), tolerance: spacingTolerance }, { saturation, contrast }, sampleMethod);
    if (!count) throw new Error("没有找到有效小图，请检查背景色和裁剪间隔。");
    result.width = sheet.width; result.height = sheet.height;
    result.getContext("2d").drawImage(sheet, 0, 0);
    fitCanvas(result);
    $("resultInfo").textContent = `${count} 张 · ${columns} × ${rows} 格 · ${sheet.width} × ${sheet.height} px`;
    pixelGrid = { columns, rows, tileWidth, tileHeight };
    $("downloadTiles").disabled = false;
    $("download").disabled = false;
    message(`已裁剪并像素化 ${count} 张小图；每格 ${tileWidth}×${tileHeight}，图集 ${sheet.width}×${sheet.height}，保留原行列位置。`);
  } catch (error) { message(error.message || "处理失败。", true); }
  finally { $("process").disabled = false; }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function pngBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("PNG 导出失败。")), "image/png"
  ));
}

$("download").addEventListener("click", async () => {
  try {
    downloadBlob(await pngBlob(result), outputName);
  } catch (error) { message(error.message || "PNG 导出失败。", true); }
});

$("downloadTiles").addEventListener("click", async () => {
  if (!pixelGrid || exportingZip) return;
  const { columns, rows, tileWidth, tileHeight } = pixelGrid;
  exportingZip = true;
  $("downloadTiles").disabled = true;
  $("process").disabled = true;
  try {
    if (columns * rows > 65535) throw new Error("小图数量超过 ZIP 格式上限 65535 张。");
    const tile = document.createElement("canvas");
    tile.width = tileWidth; tile.height = tileHeight;
    const context = tile.getContext("2d");
    context.imageSmoothingEnabled = false;
    const rowDigits = Math.max(2, String(rows).length);
    const colDigits = Math.max(2, String(columns).length);
    const files = [];
    for (let row = 0; row < rows; row++) {
      message(`正在打包像素小图：${row + 1}/${rows} 行…`);
      for (let col = 0; col < columns; col++) {
        context.clearRect(0, 0, tileWidth, tileHeight);
        context.drawImage(result, col * tileWidth, row * tileHeight, tileWidth, tileHeight,
          0, 0, tileWidth, tileHeight);
        const blob = await pngBlob(tile);
        files.push({
          name: `row-${String(row + 1).padStart(rowDigits, "0")}_col-${String(col + 1).padStart(colDigits, "0")}.png`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }
    }
    downloadBlob(createZip(files), tilesName);
    message(`已打包 ${files.length} 张 ${tileWidth}×${tileHeight} 像素小图。`);
  } catch (error) { message(error.message || "小图 ZIP 导出失败。", true); }
  finally {
    exportingZip = false;
    $("process").disabled = false;
    $("downloadTiles").disabled = !pixelGrid;
  }
});

document.addEventListener("dragover", event => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); });
document.addEventListener("drop", event => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault(); loadFile(event.dataTransfer.files[0]);
});
