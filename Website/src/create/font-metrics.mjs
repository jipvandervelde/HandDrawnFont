export const DEFAULT_FONT_GUIDES = Object.freeze({
  baselineY: 0.729_843_75,
  capHeightY: 0.06,
  xHeightY: 0.243_281_25,
});

function normalizedGuide(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function clampNormalized(value) {
  return Math.min(1, Math.max(0, value));
}

export function canvasBaselineY(metrics) {
  return metrics.boundsY + metrics.baselineY;
}

export function canvasXHeightY(metrics) {
  return metrics.boundsY + metrics.xHeightY;
}

export function setCanvasBaselineY(metrics, value) {
  metrics.baselineY = value - metrics.boundsY;
}

export function setCanvasXHeightY(metrics, value) {
  metrics.xHeightY = value - metrics.boundsY;
}

export function resolveProjectGuides(project) {
  if (
    normalizedGuide(project?.fontGuides?.baselineY) &&
    normalizedGuide(project?.fontGuides?.xHeightY)
  ) {
    return {
      baselineY: project.fontGuides.baselineY,
      capHeightY: normalizedGuide(project.fontGuides.capHeightY)
        ? project.fontGuides.capHeightY
        : DEFAULT_FONT_GUIDES.capHeightY,
      xHeightY: project.fontGuides.xHeightY,
    };
  }

  const referenceGlyph =
    project?.glyphs?.find(
      (glyph) => glyph.key === "a" && glyph.variationIndex === 0,
    ) ??
    project?.glyphs?.find(
      (glyph) => Array.from(glyph.key).length === 1 && glyph.key !== " ",
    ) ??
    project?.glyphs?.[0];
  const baselineY = referenceGlyph
    ? canvasBaselineY(referenceGlyph.metrics)
    : DEFAULT_FONT_GUIDES.baselineY;
  const xHeightY = referenceGlyph
    ? canvasXHeightY(referenceGlyph.metrics)
    : DEFAULT_FONT_GUIDES.xHeightY;

  return {
    baselineY: normalizedGuide(baselineY)
      ? baselineY
      : DEFAULT_FONT_GUIDES.baselineY,
    capHeightY: DEFAULT_FONT_GUIDES.capHeightY,
    xHeightY: normalizedGuide(xHeightY)
      ? xHeightY
      : DEFAULT_FONT_GUIDES.xHeightY,
  };
}

export function synchronizeProjectGuides(project) {
  const guides = resolveProjectGuides(project);
  project.fontGuides = guides;
  for (const glyph of project.glyphs) {
    setCanvasBaselineY(glyph.metrics, guides.baselineY);
    setCanvasXHeightY(glyph.metrics, guides.xHeightY);
  }
  return guides;
}

export function setProjectBaselineY(project, value) {
  const guides = synchronizeProjectGuides(project);
  guides.baselineY = clampNormalized(value);
  for (const glyph of project.glyphs) {
    setCanvasBaselineY(glyph.metrics, guides.baselineY);
  }
}

export function setProjectXHeightY(project, value) {
  const guides = synchronizeProjectGuides(project);
  guides.xHeightY = clampNormalized(value);
  for (const glyph of project.glyphs) {
    setCanvasXHeightY(glyph.metrics, guides.xHeightY);
  }
}

export function setProjectCapHeightY(project, value) {
  const guides = synchronizeProjectGuides(project);
  guides.capHeightY = clampNormalized(value);
}

export function editorCanvasGeometry(glyph, width, height) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const sourceAspectRatio = glyph.canvasHeight / glyph.canvasWidth;
  const contentHeight = Math.min(safeHeight, safeWidth * sourceAspectRatio);
  return {
    contentHeight,
    topInset: Math.max(0, safeHeight - contentHeight),
  };
}

export function thumbnailCanvasGeometry(glyph, width, height) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const bounds = glyph.metrics;
  const sourceWidth = Math.max(0.05, bounds.boundsWidth) * glyph.canvasWidth;
  const sourceHeight = Math.max(0.05, bounds.boundsHeight) * glyph.canvasHeight;
  const scale = Math.min(
    Math.max(1, safeWidth - 12) / sourceWidth,
    Math.max(1, safeHeight - 10) / sourceHeight,
  );
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;

  return {
    offsetX: (safeWidth - renderedWidth) / 2,
    offsetY: (safeHeight - renderedHeight) / 2,
    scale,
    sourceX: bounds.boundsX * glyph.canvasWidth,
    sourceY: bounds.boundsY * glyph.canvasHeight,
  };
}

export function deriveBoundsPreservingGuides(glyph, padding = 0.02) {
  const baselineY = canvasBaselineY(glyph.metrics);
  const xHeightY = canvasXHeightY(glyph.metrics);
  const points = glyph.strokes.flatMap((stroke) => stroke.points);

  if (points.length === 0) {
    glyph.metrics.boundsX = 0;
    glyph.metrics.boundsY = 0;
    glyph.metrics.boundsWidth = 0;
    glyph.metrics.boundsHeight = 0;
  } else {
    const minimumX = Math.min(...points.map((point) => point.x));
    const maximumX = Math.max(...points.map((point) => point.x));
    const minimumY = Math.min(...points.map((point) => point.y));
    const maximumY = Math.max(...points.map((point) => point.y));
    const boundsX = Math.max(0, minimumX - padding);
    const boundsY = Math.max(0, minimumY - padding);
    glyph.metrics.boundsX = boundsX;
    glyph.metrics.boundsY = boundsY;
    glyph.metrics.boundsWidth = Math.max(0, Math.min(1, maximumX + padding) - boundsX);
    glyph.metrics.boundsHeight = Math.max(0, Math.min(1, maximumY + padding) - boundsY);
  }

  setCanvasBaselineY(glyph.metrics, baselineY);
  setCanvasXHeightY(glyph.metrics, xHeightY);
}

export function fontYForNormalizedPoint(glyph, pointY, scale) {
  return (canvasBaselineY(glyph.metrics) - pointY) * glyph.canvasHeight * scale;
}
