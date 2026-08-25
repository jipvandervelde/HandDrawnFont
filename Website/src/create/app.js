import { buildTrueType, fileStemForFamily, validateProject } from "./font-export.js";
import {
  drawAnimatedPreviewFrame,
  fontBaselineOffset,
  makeAnimatedPreviewPlan,
} from "./animated-preview.mjs";
import {
  deriveBoundsPreservingGuides,
  editorCanvasGeometry,
  setProjectBaselineY,
  setProjectCapHeightY,
  setProjectXHeightY,
  synchronizeProjectGuides,
  thumbnailCanvasGeometry,
} from "./font-metrics.mjs";
import { buildStoredZip } from "./zip-export.mjs";

const PROJECT_URL = "/create/grug-hand-project.json";
const STORAGE_KEY = "handdrawn-font-forge-project-v1";
const root = document.querySelector("[data-forge-app]");

const elements = {
  addDialog: document.querySelector("[data-add-dialog]"),
  addForm: document.querySelector("[data-add-form]"),
  animatedPreview: document.querySelector("[data-animated-preview]"),
  baseline: document.querySelector("[data-baseline]"),
  baselineOutput: document.querySelector("[data-baseline-output]"),
  bearingOutput: document.querySelector("[data-bearing-output]"),
  capHeight: document.querySelector("[data-cap-height]"),
  capHeightOutput: document.querySelector("[data-cap-height-output]"),
  canvas: document.querySelector("[data-drawing-canvas]"),
  clearGlyph: document.querySelector("[data-clear-glyph]"),
  copyVariation: document.querySelector("[data-copy-variation]"),
  currentKey: document.querySelector("[data-current-key]"),
  currentKind: document.querySelector("[data-current-kind]"),
  glyphCount: document.querySelector("[data-glyph-count]"),
  exportJSON: document.querySelector("[data-export-json]"),
  exportManifest: document.querySelector("[data-export-manifest]"),
  exportPackage: document.querySelector("[data-export-package]"),
  exportTTF: document.querySelector("[data-export-ttf]"),
  familyName: document.querySelector("[data-family-name]"),
  fontPreview: document.querySelector("[data-font-preview]"),
  glyphPlay: document.querySelector("[data-glyph-play]"),
  glyphGrid: document.querySelector("[data-glyph-grid]"),
  glyphSearch: document.querySelector("[data-glyph-search]"),
  importProject: document.querySelector("[data-import-project]"),
  lineCap: document.querySelector("[data-line-cap]"),
  lineCapOptions: document.querySelectorAll("[data-line-cap-option]"),
  newGlyphError: document.querySelector("[data-new-glyph-error]"),
  newGlyphKind: document.querySelector("[data-new-glyph-kind]"),
  newGlyphLabel: document.querySelector("[data-new-glyph-label]"),
  newGlyphValue: document.querySelector("[data-new-glyph-value]"),
  openAdd: document.querySelector("[data-open-add]"),
  penOutput: document.querySelector("[data-pen-output]"),
  penWidth: document.querySelector("[data-pen-width]"),
  previewInput: document.querySelector("[data-preview-input]"),
  previewPlay: document.querySelector("[data-preview-play]"),
  previewStage: document.querySelector("[data-preview-stage]"),
  previewStatus: document.querySelector("[data-preview-status]"),
  resetProject: document.querySelector("[data-reset-project]"),
  saveIndicator: document.querySelector("[data-save-indicator]"),
  sideBearing: document.querySelector("[data-side-bearing]"),
  toast: document.querySelector("[data-toast]"),
  undoStroke: document.querySelector("[data-undo-stroke]"),
  variationStrip: document.querySelector("[data-variation-strip]"),
  xHeight: document.querySelector("[data-x-height]"),
  xHeightOutput: document.querySelector("[data-x-height-output]"),
};

const state = {
  activePointer: null,
  currentGlyphID: null,
  currentStroke: [],
  defaultProject: null,
  fontCache: null,
  glyphFilter: "characters",
  glyphAnimationDuration: 0,
  glyphAnimationFrame: null,
  glyphAnimationGlyphID: null,
  glyphAnimationPausedAt: null,
  glyphAnimationStart: 0,
  previewAnimationFrame: null,
  previewAnimationPausedAt: null,
  previewAnimationPlan: null,
  previewAnimationStart: 0,
  previewFontFace: null,
  previewRevision: -1,
  previewTimer: null,
  project: null,
  revision: 0,
  saveTimer: null,
  search: "",
  toastTimer: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prepareProject(project) {
  project.familyName ||= "My Hand";
  project.fontForge = {
    lineCap: "round",
    sideBearing: 40,
    spaceWidth: 280,
    strokeWidth: 60,
    ...project.fontForge,
  };
  synchronizeProjectGuides(project);
  return project;
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
  const label = button.querySelector("[data-button-label]");
  if (label) label.textContent = busy ? busyText : normalText;
  else button.textContent = busy ? busyText : normalText;
}

function markChanged({ renderGrid = false, renderCanvas = true } = {}) {
  finishGlyphAnimation({ redraw: false });
  state.revision += 1;
  state.fontCache = null;
  cancelAnimatedPreview();
  elements.saveIndicator.textContent = "saving";
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(saveProjectLocally, 140);
  if (renderGrid) renderGlyphGrid();
  if (renderCanvas) renderEditor();
  scheduleLivePreview();
}

function saveProjectLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    elements.saveIndicator.textContent = "saved locally";
  } catch (error) {
    console.error(error);
    elements.saveIndicator.textContent = "not saved";
    showToast("Browser storage is full. Download a JSON backup.");
  }
}

function inkColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
}

function paperColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
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

function pointDistance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function strokeLength(points, mapPoint = (point) => point) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += pointDistance(mapPoint(points[index - 1]), mapPoint(points[index]));
  }
  return length;
}

function tracePartialStroke(context, points, mapPoint, length) {
  if (points.length === 0 || length <= 0) return;
  const first = mapPoint(points[0]);
  context.beginPath();
  context.moveTo(first.x, first.y);
  let remaining = length;

  for (let index = 1; index < points.length; index += 1) {
    const previous = mapPoint(points[index - 1]);
    const point = mapPoint(points[index]);
    const segmentLength = pointDistance(previous, point);
    if (segmentLength <= remaining) {
      context.lineTo(point.x, point.y);
      remaining -= segmentLength;
      continue;
    }

    const progress = segmentLength > 0 ? remaining / segmentLength : 0;
    context.lineTo(
      previous.x + (point.x - previous.x) * progress,
      previous.y + (point.y - previous.y) * progress,
    );
    break;
  }
  context.stroke();
}

function traceGlyphProgress(context, strokes, mapPoint, progress) {
  const lengths = strokes.map((stroke) => strokeLength(stroke.points, mapPoint));
  const totalLength = lengths.reduce((total, length) => total + length, 0);
  let remaining = totalLength * Math.min(1, Math.max(0, progress));

  strokes.forEach((stroke, index) => {
    if (remaining <= 0) return;
    tracePartialStroke(context, stroke.points, mapPoint, Math.min(lengths[index], remaining));
    remaining -= lengths[index];
  });
}

function drawBlankGlyphReference(context, glyph, width, editorGeometry, guides) {
  if (
    glyph.strokes.length > 0 ||
    state.currentStroke.length > 0 ||
    Array.from(glyph.key).length !== 1 ||
    !/^\p{L}$/u.test(glyph.key)
  ) {
    return;
  }

  const guideTop = /^\p{Lu}$/u.test(glyph.key)
    ? guides.capHeightY
    : guides.xHeightY;
  const targetHeight =
    (guides.baselineY - guideTop) * editorGeometry.contentHeight;
  if (targetHeight <= 0) return;

  context.save();
  context.font = '400 100px "Inter Reference", Inter, system-ui, sans-serif';
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const heightReference = context.measureText(/^\p{Lu}$/u.test(glyph.key) ? "H" : "x");
  const referenceAscent = heightReference.actualBoundingBoxAscent || 70;
  const fontSize = Math.max(1, (targetHeight / referenceAscent) * 100);
  context.font = `400 ${fontSize}px "Inter Reference", Inter, system-ui, sans-serif`;
  const glyphMetrics = context.measureText(glyph.key);
  const visualCenterOffset =
    (glyphMetrics.actualBoundingBoxLeft - glyphMetrics.actualBoundingBoxRight) / 2;
  const baselinePosition =
    editorGeometry.topInset + guides.baselineY * editorGeometry.contentHeight;
  context.strokeStyle = inkColor();
  context.lineWidth = Math.max(1.25, width / 400);
  context.strokeText(glyph.key, width / 2 + visualCenterOffset, baselinePosition);
  context.restore();
}

function drawMainCanvas(animationProgress = null) {
  const glyph = currentGlyph();
  const { context, height, width } = prepareCanvas(elements.canvas);
  if (!glyph) return;

  const lineWidth = Math.max(2, (state.project.fontForge.strokeWidth / 1000) * width);
  context.lineCap = state.project.fontForge.lineCap;
  context.lineJoin = "round";
  context.strokeStyle = inkColor();
  context.lineWidth = lineWidth;
  const editorGeometry = editorCanvasGeometry(glyph, width, height);
  const mapPoint = (point) => ({
    x: point.x * width,
    y: editorGeometry.topInset + point.y * editorGeometry.contentHeight,
  });
  const { baselineY, capHeightY, xHeightY } = state.project.fontGuides;

  drawBlankGlyphReference(
    context,
    glyph,
    width,
    editorGeometry,
    state.project.fontGuides,
  );

  if (animationProgress === null) {
    for (const stroke of glyph.strokes) traceStroke(context, stroke.points, mapPoint);
    if (state.currentStroke.length > 0) traceStroke(context, state.currentStroke, mapPoint);
  } else {
    traceGlyphProgress(context, glyph.strokes, mapPoint, animationProgress);
  }

  context.save();
  context.setLineDash([7, 6]);
  context.lineWidth = 1;
  const capHeightPosition =
    editorGeometry.topInset + capHeightY * editorGeometry.contentHeight;
  context.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--guide-cap")
    .trim();
  context.beginPath();
  context.moveTo(0, capHeightPosition);
  context.lineTo(width, capHeightPosition);
  context.stroke();
  context.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--guide-x")
    .trim();
  context.beginPath();
  const xHeightPosition =
    editorGeometry.topInset + xHeightY * editorGeometry.contentHeight;
  const baselinePosition =
    editorGeometry.topInset + baselineY * editorGeometry.contentHeight;
  context.moveTo(0, xHeightPosition);
  context.lineTo(width, xHeightPosition);
  context.stroke();
  context.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--guide-base")
    .trim();
  context.beginPath();
  context.moveTo(0, baselinePosition);
  context.lineTo(width, baselinePosition);
  context.stroke();
  context.restore();

  const capLabel = document.querySelector(".guide-label--cap");
  const xLabel = document.querySelector(".guide-label--x");
  const baselineLabel = document.querySelector(".guide-label--baseline");
  capLabel.style.top = `${capHeightPosition}px`;
  xLabel.style.top = `${xHeightPosition}px`;
  baselineLabel.style.top = `${baselinePosition}px`;
}

function glyphAnimationDuration(glyph) {
  const mapPoint = (point) => ({
    x: point.x * glyph.canvasWidth,
    y: point.y * glyph.canvasHeight,
  });
  const pathLength = glyph.strokes.reduce(
    (total, stroke) => total + strokeLength(stroke.points, mapPoint),
    0,
  );
  return Math.min(1600, Math.max(500, (pathLength / 1100) * 1000));
}

function finishGlyphAnimation({ redraw = true } = {}) {
  if (state.glyphAnimationFrame !== null) {
    cancelAnimationFrame(state.glyphAnimationFrame);
  }
  state.glyphAnimationDuration = 0;
  state.glyphAnimationFrame = null;
  state.glyphAnimationGlyphID = null;
  state.glyphAnimationPausedAt = null;
  elements.glyphPlay.dataset.animating = "false";
  elements.glyphPlay.setAttribute("aria-label", "Play selected letter animation");
  if (redraw && state.project) drawMainCanvas();
}

function drawGlyphAnimationFrame(timestamp) {
  const glyph = currentGlyph();
  if (!glyph || glyph.id !== state.glyphAnimationGlyphID) {
    finishGlyphAnimation();
    return;
  }

  const elapsed = timestamp - state.glyphAnimationStart;
  const progress = Math.min(1, elapsed / state.glyphAnimationDuration);
  drawMainCanvas(progress);
  if (progress >= 1) {
    finishGlyphAnimation();
    return;
  }
  state.glyphAnimationFrame = requestAnimationFrame(drawGlyphAnimationFrame);
}

function playGlyphAnimation() {
  const glyph = currentGlyph();
  finishGlyphAnimation({ redraw: false });
  cancelAnimatedPreview();
  if (!glyph?.strokes.length) {
    drawMainCanvas();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    drawMainCanvas();
    showToast("Animation is disabled by Reduce Motion.");
    return;
  }

  state.glyphAnimationDuration = glyphAnimationDuration(glyph);
  state.glyphAnimationGlyphID = glyph.id;
  state.glyphAnimationStart = performance.now();
  elements.glyphPlay.dataset.animating = "true";
  elements.glyphPlay.setAttribute("aria-label", "Replay selected letter animation");
  drawMainCanvas(0);
  state.glyphAnimationFrame = requestAnimationFrame(drawGlyphAnimationFrame);
}

function tilePointMapper(glyph, width, height) {
  const geometry = thumbnailCanvasGeometry(glyph, width, height);
  return (point) => ({
    x:
      geometry.offsetX +
      (point.x * glyph.canvasWidth - geometry.sourceX) * geometry.scale,
    y:
      geometry.offsetY +
      (point.y * glyph.canvasHeight - geometry.sourceY) * geometry.scale,
  });
}

function editorAlignedTilePointMapper(glyph, width, height) {
  const geometry = editorCanvasGeometry(glyph, width, height);
  return (point) => ({
    x: point.x * width,
    y: geometry.topInset + point.y * geometry.contentHeight,
  });
}

function drawTileCanvas(canvas, glyph, selected = false, alignToEditor = false) {
  const { context, height, width } = prepareCanvas(canvas);
  const mapPoint = alignToEditor
    ? editorAlignedTilePointMapper(glyph, width, height)
    : tilePointMapper(glyph, width, height);

  context.strokeStyle = selected ? paperColor() : inkColor();
  context.lineCap = state.project.fontForge.lineCap;
  context.lineJoin = "round";
  context.lineWidth = Math.max(1.25, Math.min(width, height) * 0.035);
  for (const stroke of glyph.strokes) traceStroke(context, stroke.points, mapPoint);
}

function renderVariationStrip(glyph) {
  const groups = groupGlyphs(state.project.glyphs);
  const variations = groups.get(glyph.key) ?? [];
  const signature = variations.map((variation) => variation.id).join(",");

  if (elements.variationStrip.dataset.signature !== signature) {
    const fragment = document.createDocumentFragment();
    for (const variation of variations) {
      const item = document.createElement("div");
      item.className = "variation-thumbnail-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "variation-thumbnail";
      button.dataset.variationId = variation.id;
      button.setAttribute(
        "aria-label",
        `Variation ${variation.variationIndex} for ${glyph.key === " " ? "space" : glyph.key}`,
      );

      const canvas = document.createElement("canvas");
      canvas.width = 52;
      canvas.height = 44;
      canvas.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = String(variation.variationIndex);
      button.append(canvas, label);
      item.append(button);

      if (variations.length > 1) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "variation-thumbnail-delete";
        deleteButton.dataset.deleteVariation = variation.id;
        deleteButton.setAttribute(
          "aria-label",
          `Delete variation ${variation.variationIndex} for ${glyph.key === " " ? "space" : glyph.key}`,
        );
        const deleteMark = document.createElement("span");
        deleteMark.className = "variation-thumbnail-delete__mark";
        deleteMark.setAttribute("aria-hidden", "true");
        deleteMark.textContent = "×";
        deleteButton.append(deleteMark);
        deleteButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteVariation(variation.id);
        });
        item.append(deleteButton);
      }

      fragment.append(item);
    }

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "variation-thumbnail variation-thumbnail--add";
    addButton.dataset.addVariation = "";
    addButton.setAttribute(
      "aria-label",
      `Create new variation for ${glyph.key === " " ? "space" : glyph.key}`,
    );
    const plus = document.createElement("span");
    plus.className = "variation-thumbnail__plus";
    plus.setAttribute("aria-hidden", "true");
    plus.textContent = "+";
    addButton.append(plus);
    fragment.append(addButton);

    elements.variationStrip.replaceChildren(fragment);
    elements.variationStrip.dataset.signature = signature;
  }

  const buttons = [...elements.variationStrip.querySelectorAll("[data-variation-id]")];
  for (const button of buttons) {
    const variation = variations.find((candidate) => candidate.id === button.dataset.variationId);
    if (!variation) continue;
    const selected = variation.id === glyph.id;
    button.setAttribute("aria-pressed", String(selected));
    button.closest(".variation-thumbnail-item").dataset.selected = String(selected);
    requestAnimationFrame(() => drawTileCanvas(button.querySelector("canvas"), variation, selected));
  }

  if (elements.variationStrip.dataset.selected !== glyph.id) {
    elements.variationStrip.dataset.selected = glyph.id;
    requestAnimationFrame(() => {
      const selectedButton = elements.variationStrip.querySelector('[aria-pressed="true"]');
      if (!selectedButton) return;
      const centeredLeft =
        selectedButton.offsetLeft -
        (elements.variationStrip.clientWidth - selectedButton.offsetWidth) / 2;
      elements.variationStrip.scrollLeft = Math.max(0, centeredLeft);
    });
  }
}

function renderEditor() {
  const glyph = currentGlyph();
  if (!glyph) return;
  elements.currentKey.textContent = glyph.key === " " ? "space" : glyph.key.replace(/^\./, "");
  elements.currentKind.textContent = Array.from(glyph.key).length === 1 ? "character" : "named icon";
  renderVariationStrip(glyph);
  elements.undoStroke.disabled = glyph.strokes.length === 0;
  elements.clearGlyph.disabled = glyph.strokes.length === 0;
  elements.glyphPlay.disabled = glyph.strokes.length === 0;
  const { baselineY, capHeightY, xHeightY } = state.project.fontGuides;
  elements.capHeight.value = String(capHeightY);
  elements.xHeight.value = String(xHeightY);
  elements.baseline.value = String(baselineY);
  elements.capHeightOutput.value = capHeightY.toFixed(2);
  elements.xHeightOutput.value = xHeightY.toFixed(2);
  elements.baselineOutput.value = baselineY.toFixed(2);
  drawMainCanvas();
}

function renderGlyphGrid() {
  const groups = groupGlyphs(state.project.glyphs);
  elements.glyphCount.textContent = String(groups.size);
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
      finishGlyphAnimation({ redraw: false });
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
      drawTileCanvas(canvas, glyph, selected, true);
    }
  });
}

function redrawCanvasInk() {
  if (!state.project) return;
  finishGlyphAnimation({ redraw: false });
  renderGlyphGrid();
  renderEditor();
}

function setPressed(selector, value) {
  document.querySelectorAll(selector).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.glyphFilter === value));
  });
}

function updateProjectControls() {
  const settings = state.project.fontForge;
  elements.familyName.value = state.project.familyName;
  elements.penWidth.value = String(settings.strokeWidth);
  elements.penOutput.value = String(settings.strokeWidth);
  elements.sideBearing.value = String(settings.sideBearing);
  elements.bearingOutput.value = String(settings.sideBearing);
  updateLineCapControl(settings.lineCap);
}

function updateLineCapControl(lineCap) {
  elements.lineCapOptions.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lineCapOption === lineCap));
  });
}

function canvasPoint(event) {
  const rectangle = elements.canvas.getBoundingClientRect();
  const glyph = currentGlyph();
  const editorGeometry = editorCanvasGeometry(glyph, rectangle.width, rectangle.height);
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rectangle.left) / rectangle.width)),
    y: Math.min(
      1,
      Math.max(
        0,
        (event.clientY - rectangle.top - editorGeometry.topInset) /
          editorGeometry.contentHeight,
      ),
    ),
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
    deriveBoundsPreservingGuides(glyph);
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
  showToast("Variation copied.");
}

function createBlankVariation() {
  const glyph = currentGlyph();
  if (!glyph) return;
  const variations = state.project.glyphs.filter((candidate) => candidate.key === glyph.key);
  const blank = clone(glyph);
  blank.id = crypto.randomUUID();
  blank.variationIndex = Math.max(...variations.map((candidate) => candidate.variationIndex)) + 1;
  blank.strokes = [];
  deriveBoundsPreservingGuides(blank);
  state.project.glyphs.push(blank);
  state.currentGlyphID = blank.id;
  markChanged({ renderGrid: true });
  showToast("Blank variation created.");
}

function deleteVariation(variationID) {
  const variation = state.project.glyphs.find((candidate) => candidate.id === variationID);
  if (!variation) return;
  const variations = state.project.glyphs
    .filter((candidate) => candidate.key === variation.key)
    .sort((left, right) => left.variationIndex - right.variationIndex);
  if (variations.length <= 1) return;
  const index = variations.findIndex((candidate) => candidate.id === variationID);
  const replacement = variations[index - 1] ?? variations[index + 1];
  state.project.glyphs = state.project.glyphs.filter((candidate) => candidate.id !== variationID);
  state.project.glyphs
    .filter((candidate) => candidate.key === variation.key)
    .sort((left, right) => left.variationIndex - right.variationIndex)
    .forEach((candidate, variationIndex) => {
      candidate.variationIndex = variationIndex;
    });
  if (state.currentGlyphID === variationID) state.currentGlyphID = replacement.id;
  markChanged({ renderGrid: true });
  showToast("Variation deleted.");
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
  showToast("Project JSON downloaded.");
}

function packageReadme(stem) {
  return `${state.project.familyName}\n${"=".repeat(state.project.familyName.length)}\n\nThis package was created locally at handdrawn.software.\n\nFILES\n- ${stem}-Regular.ttf — installable TrueType font\n- ${stem}-project.json — editable strokes, variations, guides, and settings\n- ${stem}-codepoints.json — character and private-use codepoint assignments\n\nKEEP THE PROJECT JSON\nThe TTF is the compiled font. The project JSON is the editable source used to continue drawing and export a fresh font later. Import it at https://handdrawn.software/create/.\n\nNothing was uploaded while this package was built.\n`;
}

function scheduleLivePreview(delay = 180) {
  window.clearTimeout(state.previewTimer);
  elements.previewStatus.textContent = "updating";
  state.previewTimer = window.setTimeout(() => {
    buildFont();
  }, delay);
}

function resizePreviewInput() {
  elements.previewInput.style.height = "auto";
  elements.previewInput.style.height = `${elements.previewInput.scrollHeight}px`;
}

function restingPreviewStatus() {
  return state.previewRevision === state.revision ? "live" : "updating";
}

function finishAnimatedPreview() {
  if (state.previewAnimationFrame !== null) {
    cancelAnimationFrame(state.previewAnimationFrame);
  }
  state.previewAnimationFrame = null;
  state.previewAnimationPausedAt = null;
  state.previewAnimationPlan = null;
  elements.previewStage.dataset.animating = "false";
  elements.previewPlay.setAttribute("aria-label", "Play animated font preview");
  elements.previewStatus.textContent = restingPreviewStatus();
}

function clearAnimatedPreviewCanvas() {
  const context = elements.animatedPreview.getContext("2d");
  context.clearRect(0, 0, elements.animatedPreview.width, elements.animatedPreview.height);
}

function cancelAnimatedPreview() {
  finishAnimatedPreview();
  clearAnimatedPreviewCanvas();
}

function drawPreviewAnimationFrame(timestamp) {
  const plan = state.previewAnimationPlan;
  if (!plan) return;
  const elapsed = timestamp - state.previewAnimationStart;
  const { context, height, width } = prepareCanvas(elements.animatedPreview);
  context.strokeStyle = inkColor();
  context.lineCap = state.project.fontForge.lineCap;
  context.lineJoin = "round";
  const previewFontSize = Number.parseFloat(getComputedStyle(elements.fontPreview).fontSize) || 44;
  context.lineWidth = Math.max(
    1,
    (state.project.fontForge.strokeWidth / 1000) * previewFontSize,
  );
  drawAnimatedPreviewFrame(context, plan, Math.min(elapsed, plan.totalDuration));

  if (elapsed >= plan.totalDuration + 180) {
    finishAnimatedPreview();
    return;
  }

  if (width > 0 && height > 0) {
    state.previewAnimationFrame = requestAnimationFrame(drawPreviewAnimationFrame);
  }
}

async function playAnimatedPreview() {
  finishGlyphAnimation();
  cancelAnimatedPreview();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showToast("Animation is disabled by Reduce Motion.");
    return;
  }

  const font = await buildFont();
  if (!font) return;

  const style = getComputedStyle(elements.fontPreview);
  const fontSize = Number.parseFloat(style.fontSize) || 44;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.04;
  const baselineOffset = fontBaselineOffset({
    ascent: font.manifest.ascent,
    descent: font.manifest.descent,
    fontSize,
    lineHeight,
    unitsPerEm: font.manifest.unitsPerEm,
  });
  const plan = makeAnimatedPreviewPlan(
    state.project,
    elements.previewInput.value,
    {
      width: elements.previewStage.clientWidth,
      fontSize,
      lineHeight,
      baselineOffset,
    },
  );
  if (plan.items.length === 0) return;

  state.previewAnimationPlan = plan;
  state.previewAnimationStart = performance.now();
  elements.previewStage.dataset.animating = "true";
  elements.previewPlay.setAttribute("aria-label", "Replay animated font preview");
  elements.previewStatus.textContent = "playing";
  state.previewAnimationFrame = requestAnimationFrame(drawPreviewAnimationFrame);
}

function handleAnimationVisibilityChange() {
  if (state.previewAnimationPlan) {
    if (document.hidden && state.previewAnimationPausedAt === null) {
      if (state.previewAnimationFrame !== null) cancelAnimationFrame(state.previewAnimationFrame);
      state.previewAnimationFrame = null;
      state.previewAnimationPausedAt = performance.now();
    } else if (!document.hidden && state.previewAnimationPausedAt !== null) {
      state.previewAnimationStart += performance.now() - state.previewAnimationPausedAt;
      state.previewAnimationPausedAt = null;
      state.previewAnimationFrame = requestAnimationFrame(drawPreviewAnimationFrame);
    }
  }

  if (state.glyphAnimationGlyphID) {
    if (document.hidden && state.glyphAnimationPausedAt === null) {
      if (state.glyphAnimationFrame !== null) cancelAnimationFrame(state.glyphAnimationFrame);
      state.glyphAnimationFrame = null;
      state.glyphAnimationPausedAt = performance.now();
    } else if (!document.hidden && state.glyphAnimationPausedAt !== null) {
      state.glyphAnimationStart += performance.now() - state.glyphAnimationPausedAt;
      state.glyphAnimationPausedAt = null;
      state.glyphAnimationFrame = requestAnimationFrame(drawGlyphAnimationFrame);
    }
  }
}

async function buildFont({ download = false } = {}) {
  const button = download ? elements.exportTTF : null;
  const normalText = "download font (.ttf)";
  if (button) setBusy(button, true, "building font…", normalText);
  elements.previewStatus.textContent = state.previewAnimationPlan ? "playing" : "updating";
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    if (!state.fontCache || state.fontCache.revision !== state.revision) {
      state.fontCache = {
        ...buildTrueType(state.project),
        revision: state.revision,
      };
    }
    const cache = state.fontCache;

    if (state.previewRevision !== cache.revision) {
      const previewFamily = `Forge Preview ${cache.revision}`;
      const fontFace = new FontFace(previewFamily, cache.buffer);
      await fontFace.load();

      if (cache.revision !== state.revision) {
        scheduleLivePreview(0);
        if (!download) return cache;
      } else {
        document.fonts.add(fontFace);
        if (state.previewFontFace) document.fonts.delete(state.previewFontFace);
        state.previewFontFace = fontFace;
        state.previewRevision = cache.revision;
        elements.fontPreview.style.fontFamily = `"${previewFamily}", "Grug Hand", sans-serif`;
        resizePreviewInput();
      }
    }
    if (state.previewRevision === state.revision && !state.previewAnimationPlan) {
      elements.previewStatus.textContent = "live";
    }

    if (download) {
      const stem = fileStemForFamily(state.project.familyName);
      downloadBlob(
        new Blob([cache.buffer], { type: "font/ttf" }),
        `${stem}-Regular.ttf`,
      );
      showToast("TTF downloaded.");
    }
    return cache;
  } catch (error) {
    console.error(error);
    elements.previewStatus.textContent = "error";
    showToast(error instanceof Error ? error.message : "Could not build the font.");
    return null;
  } finally {
    if (button) setBusy(button, false, "", normalText);
  }
}

async function exportPackage() {
  const normalText = "download full package";
  setBusy(elements.exportPackage, true, "building package…", normalText);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    const cache = await buildFont();
    if (!cache) return;
    const stem = fileStemForFamily(state.project.familyName);
    const archive = buildStoredZip([
      { name: `${stem}-Regular.ttf`, data: cache.buffer },
      {
        name: `${stem}-project.json`,
        data: `${JSON.stringify(state.project, null, 2)}\n`,
      },
      {
        name: `${stem}-codepoints.json`,
        data: `${JSON.stringify(cache.manifest, null, 2)}\n`,
      },
      { name: "README.txt", data: packageReadme(stem) },
    ]);
    downloadBlob(new Blob([archive], { type: "application/zip" }), `${stem}-font-package.zip`);
    showToast("Full font package downloaded.");
  } catch (error) {
    console.error(error);
    showToast(error instanceof Error ? error.message : "Could not build the font package.");
  } finally {
    setBusy(elements.exportPackage, false, "", normalText);
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
  showToast("Codepoint map downloaded.");
}

async function importProject(file) {
  if (!file) return;
  try {
    if (file.size > 20_000_000) throw new Error("This project JSON is too large.");
    const parsed = JSON.parse(await file.text());
    validateProject(parsed);
    if (!window.confirm("Replace the current project with this imported JSON?")) return;
    state.project = prepareProject(parsed);
    const preferred = parsed.glyphs.find((glyph) => glyph.key === "a") ?? parsed.glyphs[0];
    state.currentGlyphID = preferred.id;
    state.glyphFilter = Array.from(preferred.key).length === 1 ? "characters" : "icons";
    setPressed("[data-glyph-filter]", state.glyphFilter);
    updateProjectControls();
    markChanged({ renderGrid: true });
    showToast("Project imported.");
  } catch (error) {
    console.error(error);
    showToast(error instanceof Error ? error.message : "This JSON is not a valid HandDrawnFont project.");
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
      elements.newGlyphError.textContent = "Enter exactly one character.";
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
      elements.newGlyphError.textContent = "Enter a name for this icon.";
      return false;
    }
    key = `.${slug}`;
  }

  if (state.project.glyphs.some((glyph) => glyph.key === key)) {
    elements.newGlyphError.textContent = "A glyph already exists for this value. Add a variation instead.";
    return false;
  }

  const glyph = {
    canvasHeight: 533.3333333333334,
    canvasWidth: 400,
    id: crypto.randomUUID(),
    key,
    metrics: {
      baselineY: state.project.fontGuides.baselineY,
      boundsHeight: 0,
      boundsWidth: 0,
      boundsX: 0,
      boundsY: 0,
      xHeightY: state.project.fontGuides.xHeightY,
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
  showToast("Blank glyph created.");
  return true;
}

function bindEvents() {
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
    finishGlyphAnimation({ redraw: false });
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

  elements.variationStrip.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-variation]");
    if (deleteButton) {
      deleteVariation(deleteButton.dataset.deleteVariation);
      return;
    }
    const addButton = event.target.closest("[data-add-variation]");
    if (addButton) {
      createBlankVariation();
      return;
    }
    const button = event.target.closest("[data-variation-id]");
    if (!button) return;
    finishGlyphAnimation({ redraw: false });
    state.currentGlyphID = button.dataset.variationId;
    renderGlyphGrid();
    renderEditor();
  });
  elements.copyVariation.addEventListener("click", duplicateVariation);
  elements.glyphPlay.addEventListener("click", playGlyphAnimation);
  elements.undoStroke.addEventListener("click", () => {
    const glyph = currentGlyph();
    if (!glyph?.strokes.length) return;
    glyph.strokes.pop();
    deriveBoundsPreservingGuides(glyph);
    markChanged({ renderGrid: true });
  });
  elements.clearGlyph.addEventListener("click", () => {
    const glyph = currentGlyph();
    if (!glyph?.strokes.length) return;
    if (!window.confirm(`Clear every stroke from ${glyph.key}?`)) return;
    glyph.strokes = [];
    deriveBoundsPreservingGuides(glyph);
    markChanged({ renderGrid: true });
  });

  elements.xHeight.addEventListener("input", () => {
    const xHeightY = Number(elements.xHeight.value);
    setProjectXHeightY(state.project, xHeightY);
    elements.xHeightOutput.value = xHeightY.toFixed(2);
    markChanged({ renderCanvas: true });
  });
  elements.capHeight.addEventListener("input", () => {
    const capHeightY = Number(elements.capHeight.value);
    setProjectCapHeightY(state.project, capHeightY);
    elements.capHeightOutput.value = capHeightY.toFixed(2);
    markChanged({ renderCanvas: true });
  });
  elements.baseline.addEventListener("input", () => {
    const baselineY = Number(elements.baseline.value);
    setProjectBaselineY(state.project, baselineY);
    elements.baselineOutput.value = baselineY.toFixed(2);
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
  elements.lineCap.addEventListener("click", (event) => {
    const button = event.target.closest("[data-line-cap-option]");
    if (!button || !elements.lineCap.contains(button)) return;
    state.project.fontForge.lineCap = button.dataset.lineCapOption;
    updateLineCapControl(state.project.fontForge.lineCap);
    markChanged({ renderCanvas: true });
  });

  elements.previewInput.addEventListener("input", () => {
    cancelAnimatedPreview();
    resizePreviewInput();
  });
  elements.previewPlay.addEventListener("click", playAnimatedPreview);
  elements.exportPackage.addEventListener("click", exportPackage);
  elements.exportTTF.addEventListener("click", () => buildFont({ download: true }));
  elements.exportJSON.addEventListener("click", exportProjectJSON);
  elements.exportManifest.addEventListener("click", exportManifest);
  elements.importProject.addEventListener("change", () => importProject(elements.importProject.files[0]));
  elements.resetProject.addEventListener("click", () => {
    if (!window.confirm("Restore the starter font? This replaces your current browser project.")) return;
    state.project = prepareProject(clone(state.defaultProject));
    state.currentGlyphID = state.project.glyphs.find((glyph) => glyph.key === "a")?.id;
    state.glyphFilter = "characters";
    setPressed("[data-glyph-filter]", state.glyphFilter);
    updateProjectControls();
    markChanged({ renderGrid: true });
    showToast("Starter font restored.");
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

  window.addEventListener("resize", () => {
    finishGlyphAnimation();
    cancelAnimatedPreview();
    resizePreviewInput();
  });
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", redrawCanvasInk);
  window.addEventListener("handdrawn:themechange", redrawCanvasInk);
  document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    const glyph = currentGlyph();
    if (!glyph?.strokes.length) return;
    event.preventDefault();
    glyph.strokes.pop();
    deriveBoundsPreservingGuides(glyph);
    markChanged({ renderGrid: true });
  });
  document.addEventListener("visibilitychange", handleAnimationVisibilityChange);
}

async function load() {
  try {
    const [projectResponse] = await Promise.all([
      fetch(PROJECT_URL),
      document.fonts.load('100px "Inter Reference"'),
    ]);
    if (!projectResponse.ok) throw new Error("Could not load the font project.");
    const defaultProject = await projectResponse.json();
    validateProject(defaultProject);
    state.defaultProject = prepareProject(defaultProject);

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        state.project = JSON.parse(stored);
        validateProject(state.project);
        prepareProject(state.project);
      } catch (error) {
        console.warn("Stored project was ignored", error);
        state.project = prepareProject(clone(state.defaultProject));
      }
    } else {
      state.project = prepareProject(clone(state.defaultProject));
    }
    state.currentGlyphID =
      state.project.glyphs.find((glyph) => glyph.key === "a" && glyph.variationIndex === 0)?.id ??
      state.project.glyphs[0]?.id;

    updateProjectControls();
    bindEvents();
    resizePreviewInput();
    renderGlyphGrid();
    renderEditor();
    root.setAttribute("aria-busy", "false");
    elements.saveIndicator.textContent = stored ? "saved locally" : "new project";
    scheduleLivePreview(0);
    window.HandDrawnForge = {
      buildFont: () => buildFont(),
      project: () => clone(state.project),
    };
  } catch (error) {
    console.error(error);
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<p class="load-error">Could not load the font project. Refresh and try again.</p>';
  }
}

load();
