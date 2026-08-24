import { buildTrueType, fileStemForFamily, validateProject } from "./font-export.js";

const PROJECT_URL = "/forge/grug-hand-project.json";
const MANIFEST_URL = "/forge/grug-hand-manifest.json";
const STORAGE_KEY = "handdrawn-font-forge-project-v1";
const root = document.querySelector("[data-forge-app]");

const elements = {
  addDialog: document.querySelector("[data-add-dialog]"),
  addForm: document.querySelector("[data-add-form]"),
  baseline: document.querySelector("[data-baseline]"),
  baselineOutput: document.querySelector("[data-baseline-output]"),
  bearingOutput: document.querySelector("[data-bearing-output]"),
  buildPreview: document.querySelector("[data-build-preview]"),
  canvas: document.querySelector("[data-drawing-canvas]"),
  clearGlyph: document.querySelector("[data-clear-glyph]"),
  compiledGrid: document.querySelector("[data-compiled-grid]"),
  compiledSummary: document.querySelector("[data-compiled-summary]"),
  copyVariation: document.querySelector("[data-copy-variation]"),
  currentKey: document.querySelector("[data-current-key]"),
  currentKind: document.querySelector("[data-current-kind]"),
  editableSummary: document.querySelector("[data-editable-summary]"),
  exportJSON: document.querySelector("[data-export-json]"),
  exportManifest: document.querySelector("[data-export-manifest]"),
  exportTTF: document.querySelector("[data-export-ttf]"),
  familyName: document.querySelector("[data-family-name]"),
  fontPreview: document.querySelector("[data-font-preview]"),
  glyphGrid: document.querySelector("[data-glyph-grid]"),
  glyphSearch: document.querySelector("[data-glyph-search]"),
  importProject: document.querySelector("[data-import-project]"),
  lineCap: document.querySelector("[data-line-cap]"),
  newGlyphError: document.querySelector("[data-new-glyph-error]"),
  newGlyphKind: document.querySelector("[data-new-glyph-kind]"),
  newGlyphLabel: document.querySelector("[data-new-glyph-label]"),
  newGlyphValue: document.querySelector("[data-new-glyph-value]"),
  openAdd: document.querySelector("[data-open-add]"),
  penOutput: document.querySelector("[data-pen-output]"),
  penWidth: document.querySelector("[data-pen-width]"),
  previewInput: document.querySelector("[data-preview-input]"),
  resetProject: document.querySelector("[data-reset-project]"),
  saveIndicator: document.querySelector("[data-save-indicator]"),
  sideBearing: document.querySelector("[data-side-bearing]"),
  toast: document.querySelector("[data-toast]"),
  undoStroke: document.querySelector("[data-undo-stroke]"),
  variationSelect: document.querySelector("[data-variation-select]"),
  xHeight: document.querySelector("[data-x-height]"),
  xHeightOutput: document.querySelector("[data-x-height-output]"),
};

const state = {
  activePointer: null,
  compiledFilter: "characters",
  currentGlyphID: null,
  currentStroke: [],
  defaultProject: null,
  fontCache: null,
  glyphFilter: "characters",
  manifest: null,
  project: null,
  revision: 0,
  saveTimer: null,
  search: "",
  toastTimer: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function groupGlyphs(glyphs) {
  const groups = new Map();
  for (const glyph of glyphs) {
    const group = groups.get(glyph.key) ?? [];
    group.push(glyph);
    groups.set(glyph.key, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => left.variationIndex - right.variationIndex);
  }
  return groups;
}

function keySort(left, right) {
  const leftCharacter = Array.from(left).length === 1;
  const rightCharacter = Array.from(right).length === 1;
  if (leftCharacter !== rightCharacter) return leftCharacter ? -1 : 1;
  return left.localeCompare(right, "en");
}

function currentGlyph() {
  return state.project?.glyphs.find((glyph) => glyph.id === state.currentGlyphID) ?? null;
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.dataset.visible = "true";
  state.toastTimer = window.setTimeout(() => {
    elements.toast.dataset.visible = "false";
  }, 2400);
}

function setBusy(button, busy, busyText, normalText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

function markChanged({ renderGrid = false, renderCanvas = true } = {}) {
  state.revision += 1;
  state.fontCache = null;
  elements.saveIndicator.textContent = "saving";
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(saveProjectLocally, 140);
  if (renderGrid) renderGlyphGrid();
  if (renderCanvas) renderEditor();
}

function saveProjectLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    elements.saveIndicator.textContent = "saved local";
  } catch (error) {
    console.error(error);
    elements.saveIndicator.textContent = "not saved";
    showToast("browser pocket full. download json backup.");
  }
}

function deriveBounds(glyph) {
  const points = glyph.strokes.flatMap((stroke) => stroke.points);
  if (points.length === 0) {
    glyph.metrics.boundsX = 0;
    glyph.metrics.boundsY = 0;
    glyph.metrics.boundsWidth = 0;
    glyph.metrics.boundsHeight = 0;
    return;
  }

  const minimumX = Math.min(...points.map((point) => point.x));
  const maximumX = Math.max(...points.map((point) => point.x));
  const minimumY = Math.min(...points.map((point) => point.y));
  const maximumY = Math.max(...points.map((point) => point.y));
  const padding = 0.02;
  const boundsX = Math.max(0, minimumX - padding);
  const boundsY = Math.max(0, minimumY - padding);
  glyph.metrics.boundsX = boundsX;
  glyph.metrics.boundsY = boundsY;
  glyph.metrics.boundsWidth = Math.max(0, Math.min(1, maximumX + padding) - boundsX);
  glyph.metrics.boundsHeight = Math.max(0, Math.min(1, maximumY + padding) - boundsY);
}

function inkColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
}

function prepareCanvas(canvas) {
  const rectangle = canvas.getBoundingClientRect();
  const width = Math.max(1, rectangle.width);
  const height = Math.max(1, rectangle.height);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, height, width };
}

function traceStroke(context, points, mapPoint) {
  if (points.length === 0) return;
  const first = mapPoint(points[0]);
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    const mapped = mapPoint(point);
    context.lineTo(mapped.x, mapped.y);
  }
  context.stroke();
}

function drawMainCanvas() {
  const glyph = currentGlyph();
  const { context, height, width } = prepareCanvas(elements.canvas);
  if (!glyph) return;

  const lineWidth = Math.max(2, (state.project.fontForge.strokeWidth / 1000) * width);
  context.lineCap = state.project.fontForge.lineCap;
  context.lineJoin = "round";
  context.strokeStyle = inkColor();
  context.lineWidth = lineWidth;
  const mapPoint = (point) => ({ x: point.x * width, y: point.y * height });

  for (const stroke of glyph.strokes) traceStroke(context, stroke.points, mapPoint);
  if (state.currentStroke.length > 0) traceStroke(context, state.currentStroke, mapPoint);

  context.save();
  context.setLineDash([7, 6]);
  context.lineWidth = 1;
  context.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--guide-x")
    .trim();
  context.beginPath();
  context.moveTo(0, glyph.metrics.xHeightY * height);
  context.lineTo(width, glyph.metrics.xHeightY * height);
  context.stroke();
  context.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--guide-base")
    .trim();
  context.beginPath();
  context.moveTo(0, glyph.metrics.baselineY * height);
  context.lineTo(width, glyph.metrics.baselineY * height);
  context.stroke();
  context.restore();

  const xLabel = document.querySelector(".guide-label--x");
  const baselineLabel = document.querySelector(".guide-label--baseline");
  xLabel.style.top = `${glyph.metrics.xHeightY * 100}%`;
  baselineLabel.style.top = `${glyph.metrics.baselineY * 100}%`;
}

function drawTileCanvas(canvas, glyph, selected = false) {
  const { context, height, width } = prepareCanvas(canvas);
  const bounds = glyph.metrics;
  const sourceWidth = Math.max(0.05, bounds.boundsWidth) * glyph.canvasWidth;
  const sourceHeight = Math.max(0.05, bounds.boundsHeight) * glyph.canvasHeight;
  const scale = Math.min((width - 12) / sourceWidth, (height - 10) / sourceHeight);
  const offsetX = (width - sourceWidth * scale) / 2;
  const offsetY = (height - sourceHeight * scale) / 2;
  const mapPoint = (point) => ({
    x: offsetX + (point.x - bounds.boundsX) * glyph.canvasWidth * scale,
    y: offsetY + (point.y - bounds.boundsY) * glyph.canvasHeight * scale,
  });

  context.strokeStyle = selected ? "#0f0d0a" : inkColor();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(1.25, Math.min(width, height) * 0.035);
  for (const stroke of glyph.strokes) traceStroke(context, stroke.points, mapPoint);
}

function renderVariationSelect(glyph) {
  const groups = groupGlyphs(state.project.glyphs);
  const variations = groups.get(glyph.key) ?? [];
  elements.variationSelect.replaceChildren(
    ...variations.map((variation) => {
      const option = document.createElement("option");
      option.value = variation.id;
      option.textContent = String(variation.variationIndex);
      option.selected = variation.id === glyph.id;
      return option;
    }),
  );
}

function renderEditor() {
  const glyph = currentGlyph();
  if (!glyph) return;
  elements.currentKey.textContent = glyph.key === " " ? "space" : glyph.key.replace(/^\./, "");
  elements.currentKind.textContent = Array.from(glyph.key).length === 1 ? "character" : "named icon";
  renderVariationSelect(glyph);
  elements.undoStroke.disabled = glyph.strokes.length === 0;
  elements.clearGlyph.disabled = glyph.strokes.length === 0;
  elements.xHeight.value = String(glyph.metrics.xHeightY);
  elements.baseline.value = String(glyph.metrics.baselineY);
  elements.xHeightOutput.value = glyph.metrics.xHeightY.toFixed(2);
  elements.baselineOutput.value = glyph.metrics.baselineY.toFixed(2);
  drawMainCanvas();
}

function renderGlyphGrid() {
  const groups = groupGlyphs(state.project.glyphs);
  elements.editableSummary.textContent = `${state.project.glyphs.length} drawings · ${groups.size} keys`;
  const query = state.search.trim().toLowerCase();
  const keys = [...groups.keys()]
    .filter((key) =>
      state.glyphFilter === "characters"
        ? Array.from(key).length === 1
        : Array.from(key).length > 1,
    )
    .filter((key) => key.toLowerCase().includes(query))
    .sort(keySort);

  const fragment = document.createDocumentFragment();
  const canvases = [];
  for (const key of keys) {
    const variations = groups.get(key);
    const glyph = variations[0];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "glyph-tile";
    button.setAttribute("aria-label", `${key === " " ? "space" : key}, ${variations.length} drawing${variations.length === 1 ? "" : "s"}`);
    const selected = currentGlyph()?.key === key;
    button.setAttribute("aria-pressed", String(selected));
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 52;
    canvas.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = key === " " ? "space" : key.replace(/^\./, "");
    const count = document.createElement("sup");
    count.textContent = variations.length > 1 ? String(variations.length) : "";
    button.append(canvas, label, count);
    button.addEventListener("click", () => {
      state.currentGlyphID = glyph.id;
      renderGlyphGrid();
      renderEditor();
    });
    fragment.append(button);
    canvases.push([canvas, glyph, selected]);
  }
  elements.glyphGrid.replaceChildren(fragment);
  requestAnimationFrame(() => {
    for (const [canvas, glyph, selected] of canvases) {
      drawTileCanvas(canvas, glyph, selected);
    }
  });
}

function setPressed(selector, value) {
  document.querySelectorAll(selector).forEach((button) => {
    const candidate = button.dataset.glyphFilter ?? button.dataset.coverageFilter;
    button.setAttribute("aria-pressed", String(candidate === value));
  });
}

function compiledGlyphs() {
  const manifest = state.manifest;
  if (state.compiledFilter === "icons") {
    return manifest.glyphs
      .filter((glyph) => glyph.primary && Array.from(glyph.character).length > 1)
      .map((glyph) => ({
        codepoint: Number.parseInt(glyph.codepoint.slice(2), 16),
        label: glyph.character.replace(/^\./, ""),
      }));
  }

  const direct = manifest.glyphs
    .filter((glyph) => glyph.primary && Array.from(glyph.character).length === 1)
    .map((glyph) => ({
      codepoint: glyph.character.codePointAt(0),
      label: glyph.character === " " ? "space" : glyph.character,
    }));
  const uppercase = manifest.uppercaseMappings.map((mapping) => ({
    codepoint: Number.parseInt(mapping.codepoint.slice(2), 16),
    label: mapping.character,
  }));
  return [...direct, ...uppercase];
}

function renderCompiledGrid() {
  const fragment = document.createDocumentFragment();
  for (const glyph of compiledGlyphs()) {
    const tile = document.createElement("div");
    tile.className = "compiled-glyph";
    const mark = document.createElement("span");
    mark.className = "compiled-glyph__mark";
    mark.textContent = glyph.label === "space" ? "·" : String.fromCodePoint(glyph.codepoint);
    mark.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "compiled-glyph__label";
    label.textContent = glyph.label;
    tile.setAttribute("aria-label", glyph.label);
    tile.append(mark, label);
    fragment.append(tile);
  }
  elements.compiledGrid.replaceChildren(fragment);
}

function updateProjectControls() {
  const settings = state.project.fontForge;
  elements.familyName.value = state.project.familyName;
  elements.penWidth.value = String(settings.strokeWidth);
  elements.penOutput.value = String(settings.strokeWidth);
  elements.sideBearing.value = String(settings.sideBearing);
  elements.bearingOutput.value = String(settings.sideBearing);
  elements.lineCap.value = settings.lineCap;
}

function canvasPoint(event) {
  const rectangle = elements.canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rectangle.left) / rectangle.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rectangle.top) / rectangle.height)),
  };
}

function appendPointerPoint(event) {
  const point = canvasPoint(event);
  const previous = state.currentStroke.at(-1);
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015) return;
  state.currentStroke.push(point);
  drawMainCanvas();
}

function finishStroke(cancelled = false) {
  const glyph = currentGlyph();
  if (!cancelled && glyph && state.currentStroke.length > 1) {
    glyph.strokes.push({ id: crypto.randomUUID(), points: state.currentStroke });
    deriveBounds(glyph);
    state.currentStroke = [];
    markChanged({ renderGrid: true });
  } else {
    state.currentStroke = [];
    drawMainCanvas();
  }
  state.activePointer = null;
}

function duplicateVariation() {
  const glyph = currentGlyph();
  if (!glyph) return;
  const variations = state.project.glyphs.filter((candidate) => candidate.key === glyph.key);
  const duplicate = clone(glyph);
  duplicate.id = crypto.randomUUID();
  duplicate.variationIndex = Math.max(...variations.map((candidate) => candidate.variationIndex)) + 1;
  duplicate.strokes = duplicate.strokes.map((stroke) => ({
    ...stroke,
    id: crypto.randomUUID(),
  }));
  state.project.glyphs.push(duplicate);
  state.currentGlyphID = duplicate.id;
  markChanged({ renderGrid: true });
  showToast("new variation wake.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportProjectJSON() {
  const stem = fileStemForFamily(state.project.familyName);
  const json = `${JSON.stringify(state.project, null, 2)}\n`;
  downloadBlob(new Blob([json], { type: "application/json" }), `${stem}-project.json`);
  showToast("json carry every path.");
}

async function buildFont({ download = false } = {}) {
  const button = download ? elements.exportTTF : elements.buildPreview;
  const normalText = download ? "download ttf ↓" : "build fresh preview";
  setBusy(button, true, "stone grind…", normalText);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    if (!state.fontCache || state.fontCache.revision !== state.revision) {
      state.fontCache = {
        ...buildTrueType(state.project),
        revision: state.revision,
      };
    }
    const previewFamily = `Forge Preview ${state.revision}`;
    const fontFace = new FontFace(previewFamily, state.fontCache.buffer);
    await fontFace.load();
    document.fonts.add(fontFace);
    elements.fontPreview.style.fontFamily = `"${previewFamily}", "Grug Hand", sans-serif`;

    if (download) {
      const stem = fileStemForFamily(state.project.familyName);
      downloadBlob(
        new Blob([state.fontCache.buffer], { type: "font/ttf" }),
        `${stem}-Regular.ttf`,
      );
      showToast("ttf leave cave.");
    } else {
      showToast("fresh font stand up.");
    }
    return state.fontCache;
  } catch (error) {
    console.error(error);
    showToast(error instanceof Error ? error.message : "font stone crack");
    return null;
  } finally {
    setBusy(button, false, "", normalText);
  }
}

async function exportManifest() {
  const cache = await buildFont();
  if (!cache) return;
  const stem = fileStemForFamily(state.project.familyName);
  downloadBlob(
    new Blob([`${JSON.stringify(cache.manifest, null, 2)}\n`], {
      type: "application/json",
    }),
    `${stem}-codepoints.json`,
  );
  showToast("map show icon cave.");
}

async function importProject(file) {
  if (!file) return;
  try {
    if (file.size > 20_000_000) throw new Error("json too big for browser cave");
    const parsed = JSON.parse(await file.text());
    validateProject(parsed);
    if (!window.confirm("replace current browser project with imported json?")) return;
    parsed.familyName ||= "My Hand";
    parsed.fontForge = {
      lineCap: "round",
      sideBearing: 40,
      spaceWidth: 280,
      strokeWidth: 60,
      ...parsed.fontForge,
    };
    state.project = parsed;
    const preferred = parsed.glyphs.find((glyph) => glyph.key === "a") ?? parsed.glyphs[0];
    state.currentGlyphID = preferred.id;
    state.glyphFilter = Array.from(preferred.key).length === 1 ? "characters" : "icons";
    setPressed("[data-glyph-filter]", state.glyphFilter);
    updateProjectControls();
    markChanged({ renderGrid: true });
    showToast("project enter cave.");
  } catch (error) {
    console.error(error);
    showToast(error instanceof Error ? error.message : "json no fit cave");
  } finally {
    elements.importProject.value = "";
  }
}

function openAddDialog() {
  elements.newGlyphError.textContent = "";
  elements.newGlyphValue.value = "";
  elements.addDialog.showModal();
  if (!window.matchMedia("(pointer: coarse)").matches) elements.newGlyphValue.focus();
}

function addGlyph() {
  const kind = elements.newGlyphKind.value;
  const rawValue = elements.newGlyphValue.value.trim();
  let key;
  if (kind === "character") {
    if (Array.from(rawValue).length !== 1) {
      elements.newGlyphError.textContent = "one character fit one glyph.";
      return false;
    }
    key = rawValue;
  } else {
    const slug = rawValue
      .replace(/^\./, "")
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) {
      elements.newGlyphError.textContent = "icon need small name.";
      return false;
    }
    key = `.${slug}`;
  }

  if (state.project.glyphs.some((glyph) => glyph.key === key)) {
    elements.newGlyphError.textContent = "mark already have home. copy variation instead.";
    return false;
  }

  const glyph = {
    canvasHeight: 533.3333333333334,
    canvasWidth: 400,
    id: crypto.randomUUID(),
    key,
    metrics: {
      baselineY: 0.75,
      boundsHeight: 0,
      boundsWidth: 0,
      boundsX: 0,
      boundsY: 0,
      xHeightY: 0.25,
    },
    strokes: [],
    variationIndex: 0,
  };
  state.project.glyphs.push(glyph);
  state.currentGlyphID = glyph.id;
  state.glyphFilter = kind === "character" ? "characters" : "icons";
  setPressed("[data-glyph-filter]", state.glyphFilter);
  markChanged({ renderGrid: true });
  elements.addDialog.close();
  showToast("blank glyph wait for hand.");
  return true;
}

function bindEvents() {
  document.querySelectorAll("[data-coverage-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.compiledFilter = button.dataset.coverageFilter;
      setPressed("[data-coverage-filter]", state.compiledFilter);
      renderCompiledGrid();
    });
  });

  document.querySelectorAll("[data-glyph-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.glyphFilter = button.dataset.glyphFilter;
      setPressed("[data-glyph-filter]", state.glyphFilter);
      renderGlyphGrid();
    });
  });

  elements.glyphSearch.addEventListener("input", () => {
    state.search = elements.glyphSearch.value;
    renderGlyphGrid();
  });

  elements.canvas.addEventListener("pointerdown", (event) => {
    if (state.activePointer !== null) return;
    state.activePointer = event.pointerId;
    state.currentStroke = [];
    elements.canvas.setPointerCapture(event.pointerId);
    appendPointerPoint(event);
  });
  elements.canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== state.activePointer) return;
    appendPointerPoint(event);
  });
  elements.canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId !== state.activePointer) return;
    finishStroke(false);
  });
  elements.canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== state.activePointer) return;
    finishStroke(true);
  });

  elements.variationSelect.addEventListener("change", () => {
    state.currentGlyphID = elements.variationSelect.value;
    renderGlyphGrid();
    renderEditor();
  });
  elements.copyVariation.addEventListener("click", duplicateVariation);
  elements.undoStroke.addEventListener("click", () => {
    const glyph = currentGlyph();
    if (!glyph?.strokes.length) return;
    glyph.strokes.pop();
    deriveBounds(glyph);
    markChanged({ renderGrid: true });
  });
  elements.clearGlyph.addEventListener("click", () => {
    const glyph = currentGlyph();
    if (!glyph?.strokes.length) return;
    if (!window.confirm(`clear every stroke from ${glyph.key}?`)) return;
    glyph.strokes = [];
    deriveBounds(glyph);
    markChanged({ renderGrid: true });
  });

  elements.xHeight.addEventListener("input", () => {
    const glyph = currentGlyph();
    glyph.metrics.xHeightY = Number(elements.xHeight.value);
    elements.xHeightOutput.value = glyph.metrics.xHeightY.toFixed(2);
    markChanged({ renderCanvas: true });
  });
  elements.baseline.addEventListener("input", () => {
    const glyph = currentGlyph();
    glyph.metrics.baselineY = Number(elements.baseline.value);
    elements.baselineOutput.value = glyph.metrics.baselineY.toFixed(2);
    markChanged({ renderCanvas: true });
  });

  elements.familyName.addEventListener("input", () => {
    state.project.familyName = elements.familyName.value;
    markChanged({ renderCanvas: false });
  });
  elements.penWidth.addEventListener("input", () => {
    state.project.fontForge.strokeWidth = Number(elements.penWidth.value);
    elements.penOutput.value = elements.penWidth.value;
    markChanged({ renderCanvas: true });
  });
  elements.sideBearing.addEventListener("input", () => {
    state.project.fontForge.sideBearing = Number(elements.sideBearing.value);
    elements.bearingOutput.value = elements.sideBearing.value;
    markChanged({ renderCanvas: false });
  });
  elements.lineCap.addEventListener("change", () => {
    state.project.fontForge.lineCap = elements.lineCap.value;
    markChanged({ renderCanvas: true });
  });

  elements.previewInput.addEventListener("input", () => {
    elements.fontPreview.textContent = elements.previewInput.value || " ";
  });
  elements.buildPreview.addEventListener("click", () => buildFont());
  elements.exportTTF.addEventListener("click", () => buildFont({ download: true }));
  elements.exportJSON.addEventListener("click", exportProjectJSON);
  elements.exportManifest.addEventListener("click", exportManifest);
  elements.importProject.addEventListener("change", () => importProject(elements.importProject.files[0]));
  elements.resetProject.addEventListener("click", () => {
    if (!window.confirm("replace browser project with original Grug drawing source?")) return;
    state.project = clone(state.defaultProject);
    state.currentGlyphID = state.project.glyphs.find((glyph) => glyph.key === "a")?.id;
    state.glyphFilter = "characters";
    setPressed("[data-glyph-filter]", state.glyphFilter);
    updateProjectControls();
    markChanged({ renderGrid: true });
    showToast("grug source return.");
  });

  elements.openAdd.addEventListener("click", openAddDialog);
  elements.newGlyphKind.addEventListener("change", () => {
    const icon = elements.newGlyphKind.value === "icon";
    elements.newGlyphLabel.textContent = icon ? "icon name" : "one character";
    elements.newGlyphValue.placeholder = icon ? "heart" : "å";
    elements.newGlyphError.textContent = "";
  });
  elements.addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      elements.addDialog.close();
      return;
    }
    addGlyph();
  });

  window.addEventListener("resize", drawMainCanvas);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    renderGlyphGrid();
    drawMainCanvas();
  });
  document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const glyph = currentGlyph();
    if (!glyph?.strokes.length) return;
    event.preventDefault();
    glyph.strokes.pop();
    deriveBounds(glyph);
    markChanged({ renderGrid: true });
  });
}

async function load() {
  try {
    const [projectResponse, manifestResponse] = await Promise.all([
      fetch(PROJECT_URL),
      fetch(MANIFEST_URL),
    ]);
    if (!projectResponse.ok || !manifestResponse.ok) throw new Error("font cave no open");
    const [defaultProject, manifest] = await Promise.all([
      projectResponse.json(),
      manifestResponse.json(),
    ]);
    validateProject(defaultProject);
    state.defaultProject = defaultProject;
    state.manifest = manifest;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        state.project = JSON.parse(stored);
        validateProject(state.project);
      } catch (error) {
        console.warn("Stored project was ignored", error);
        state.project = clone(defaultProject);
      }
    } else {
      state.project = clone(defaultProject);
    }

    state.project.familyName ||= "My Hand";
    state.project.fontForge = {
      lineCap: "round",
      sideBearing: 40,
      spaceWidth: 280,
      strokeWidth: 60,
      ...state.project.fontForge,
    };
    state.currentGlyphID =
      state.project.glyphs.find((glyph) => glyph.key === "a" && glyph.variationIndex === 0)?.id ??
      state.project.glyphs[0]?.id;

    elements.compiledSummary.textContent = `${manifest.glyphCount} compiled drawings · ${manifest.features.length} OpenType features`;
    updateProjectControls();
    bindEvents();
    renderCompiledGrid();
    renderGlyphGrid();
    renderEditor();
    root.setAttribute("aria-busy", "false");
    elements.saveIndicator.textContent = stored ? "saved local" : "new local";
    window.HandDrawnForge = {
      buildFont: () => buildFont(),
      project: () => clone(state.project),
    };
  } catch (error) {
    console.error(error);
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<p class="load-error">font cave no open. refresh after small breath.</p>';
  }
}

load();
