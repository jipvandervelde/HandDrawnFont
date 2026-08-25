import { canvasBaselineY, canvasXHeightY } from "./font-metrics.mjs";

const TARGET_X_HEIGHT = 500;
const MINIMUM_GLYPH_DURATION_MS = 8;
const MAXIMUM_GLYPH_DURATION_MS = 18;
const RELAXED_SPEED_MULTIPLIER = 4;
const PATH_UNITS_PER_SECOND = 12_000;
const SPACE_DELAY_MS = 32;
const LINE_BREAK_DELAY_MS = 48;
const TEXT_CONTROL_BASELINE_ADJUSTMENT = -1;

function median(values) {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function sourceScale(glyphs) {
  const heights = glyphs
    .filter((glyph) => /^[a-z]$/.test(glyph.key))
    .map(
      (glyph) =>
        Math.abs(canvasBaselineY(glyph.metrics) - canvasXHeightY(glyph.metrics)) *
        glyph.canvasHeight,
    )
    .filter((height) => Number.isFinite(height) && height > 0);
  return TARGET_X_HEIGHT / Math.max(1, median(heights));
}

function pointDistance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function strokeLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += pointDistance(points[index - 1], points[index]);
  }
  return length;
}

function glyphDuration(pathLength) {
  const unscaled = Math.min(
    MAXIMUM_GLYPH_DURATION_MS,
    Math.max(MINIMUM_GLYPH_DURATION_MS, (pathLength / PATH_UNITS_PER_SECOND) * 1000),
  );
  return unscaled * RELAXED_SPEED_MULTIPLIER;
}

function glyphGroups(glyphs) {
  const groups = new Map();
  for (const glyph of glyphs) {
    const values = groups.get(glyph.key) ?? [];
    values.push(glyph);
    groups.set(glyph.key, values);
  }
  for (const values of groups.values()) {
    values.sort((left, right) => left.variationIndex - right.variationIndex);
  }
  return groups;
}

function glyphData(glyph, scale, pixelsPerFontUnit, sideBearing) {
  const strokes = glyph.strokes.map((stroke) => {
    const points = stroke.points.map((point) => ({
      x:
        ((point.x - glyph.metrics.boundsX) * glyph.canvasWidth * scale + sideBearing) *
        pixelsPerFontUnit,
      y:
        -(canvasBaselineY(glyph.metrics) - point.y) *
        glyph.canvasHeight *
        scale *
        pixelsPerFontUnit,
    }));
    return { length: strokeLength(points), points };
  });
  const measuredWidth = glyph.metrics.boundsWidth * glyph.canvasWidth * scale;
  return {
    advanceWidth:
      Math.max(sideBearing * 2 + 40, Math.round(measuredWidth + sideBearing * 2)) *
      pixelsPerFontUnit,
    glyphID: glyph.id,
    pathLength: glyph.strokes.reduce((total, stroke) => {
      const sourcePoints = stroke.points.map((point) => ({
        x: point.x * glyph.canvasWidth,
        y: point.y * glyph.canvasHeight,
      }));
      return total + strokeLength(sourcePoints);
    }, 0),
    strokes,
  };
}

export function fontBaselineOffset({
  ascent,
  descent,
  fontSize,
  lineHeight,
  unitsPerEm,
}) {
  const resolvedUnitsPerEm = Math.max(1, unitsPerEm);
  const scaledAscent = (ascent / resolvedUnitsPerEm) * fontSize;
  const scaledDescent = (descent / resolvedUnitsPerEm) * fontSize;
  return (
    (lineHeight - scaledAscent - scaledDescent) / 2 +
    scaledAscent +
    TEXT_CONTROL_BASELINE_ADJUSTMENT
  );
}

export function makeAnimatedPreviewPlan(
  project,
  text,
  { width, fontSize, lineHeight, baselineOffset = fontSize * 0.9 },
) {
  const glyphs = project.glyphs;
  const groups = glyphGroups(glyphs);
  const scale = sourceScale(glyphs);
  const pixelsPerFontUnit = fontSize / 1000;
  const sideBearing = Number(project.fontForge?.sideBearing) || 40;
  const spaceWidth = (Number(project.fontForge?.spaceWidth) || 280) * pixelsPerFontUnit;
  const maximumWidth = Math.max(1, width);
  const resolvedLineHeight = Math.max(fontSize, lineHeight);
  const items = [];
  let delay = 0;
  let lineIndex = 0;
  let x = 0;

  function moveToNextLine(addDelay = false) {
    lineIndex += 1;
    x = 0;
    if (addDelay) delay += LINE_BREAK_DELAY_MS;
  }

  function dataForCharacter(character) {
    const key = character.toLowerCase();
    const variations = groups.get(key) ?? [];
    if (variations.length === 0) {
      return {
        advanceWidth: fontSize * 0.6,
        duration: glyphDuration(0),
        strokes: [],
      };
    }

    // The generated TTF maps normal text to variation zero. Use the same
    // drawing here so the animated centerline exactly matches its static text.
    const glyph = variations[0];
    const data = glyphData(glyph, scale, pixelsPerFontUnit, sideBearing);
    return {
      ...data,
      duration: glyphDuration(data.pathLength),
    };
  }

  const explicitLines = String(text).split("\n");
  explicitLines.forEach((line, explicitLineIndex) => {
    const words = line.trim().length > 0 ? line.trim().split(/\s+/) : [];
    words.forEach((word, wordIndex) => {
      const wordData = Array.from(word).map(dataForCharacter);
      const wordWidth = wordData.reduce((total, data) => total + data.advanceWidth, 0);
      if (x > 0 && x + wordWidth > maximumWidth) moveToNextLine();

      Array.from(word).forEach((character, index) => {
        const data = wordData[index];
        if (x > 0 && x + data.advanceWidth > maximumWidth) moveToNextLine();
        const baseline = lineIndex * resolvedLineHeight + baselineOffset;
        const strokes = data.strokes.map((stroke) => ({
          length: stroke.length,
          points: stroke.points.map((point) => ({
            x: point.x + x,
            y: point.y + baseline,
          })),
        }));
        items.push({
          character,
          delay,
          duration: data.duration,
          glyphID: data.glyphID,
          strokes,
          totalLength: strokes.reduce((total, stroke) => total + stroke.length, 0),
        });
        delay += data.duration;
        x += data.advanceWidth;
      });

      if (wordIndex < words.length - 1) {
        x += spaceWidth;
        delay += SPACE_DELAY_MS;
      }
    });

    if (explicitLineIndex < explicitLines.length - 1) moveToNextLine(true);
  });

  return {
    height: Math.max(resolvedLineHeight, (lineIndex + 1) * resolvedLineHeight),
    items,
    totalDuration: delay,
  };
}

function tracePartialStroke(context, points, length) {
  if (points.length === 0 || length <= 0) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  let remaining = length;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
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

export function drawAnimatedPreviewFrame(context, plan, elapsed) {
  for (const item of plan.items) {
    const progress = Math.min(1, Math.max(0, (elapsed - item.delay) / item.duration));
    if (progress <= 0 || item.totalLength <= 0) continue;
    let remaining = item.totalLength * progress;

    for (const stroke of item.strokes) {
      if (remaining <= 0) break;
      tracePartialStroke(context, stroke.points, Math.min(stroke.length, remaining));
      remaining -= stroke.length;
    }
  }
}
