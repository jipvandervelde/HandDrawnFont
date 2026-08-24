import { createFont } from "fonteditor-core";
import {
  canvasBaselineY,
  canvasXHeightY,
  fontYForNormalizedPoint,
} from "./font-metrics.mjs";

const UNITS_PER_EM = 1000;
const TARGET_X_HEIGHT = 500;
const FONT_COORDINATE_LIMIT = 32_500;
const PUA_START = 0xe000;
const PUA_END = 0xf8ff;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function median(values) {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function isSingleScalar(value) {
  return typeof value === "string" && Array.from(value).length === 1;
}

function keySort(left, right) {
  const leftCharacter = isSingleScalar(left);
  const rightCharacter = isSingleScalar(right);
  if (leftCharacter !== rightCharacter) return leftCharacter ? -1 : 1;
  return left.localeCompare(right, "en");
}

function safeFamilyName(value) {
  const cleaned = String(value || "My Hand").replace(/[\u0000-\u001f]/g, "").trim();
  return cleaned.slice(0, 63) || "My Hand";
}

function postScriptName(familyName) {
  return familyName.replace(/[^A-Za-z0-9-]/g, "") || "MyHand";
}

function glyphName(key, variationIndex, codepoint, primary) {
  if (primary && isSingleScalar(key)) {
    if (key === " ") return "space";
    return `uni${key.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
  }

  const readable = Array.from(key)
    .map((character) => {
      if (/^[A-Za-z0-9]$/.test(character)) return character.toLowerCase();
      return `u${character.codePointAt(0).toString(16).padStart(4, "0")}`;
    })
    .join("_");
  return `uni${codepoint.toString(16).toUpperCase().padStart(4, "0")}_${readable}_v${String(variationIndex).padStart(2, "0")}`;
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function contour(points, clockwise = true) {
  const compact = [];
  for (const point of points) {
    const resolved = {
      x: Math.round(point.x),
      y: Math.round(point.y),
      onCurve: true,
    };
    const previous = compact.at(-1);
    if (!previous || previous.x !== resolved.x || previous.y !== resolved.y) {
      compact.push(resolved);
    }
  }
  if (compact.length < 3) return null;

  const isClockwise = signedArea(compact) < 0;
  if (isClockwise !== clockwise) compact.reverse();
  return compact;
}

function circleContour(center, radius, steps = 12) {
  const points = [];
  for (let index = 0; index < steps; index += 1) {
    const angle = (Math.PI * 2 * index) / steps;
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return contour(points, true);
}

function segmentContour(start, end, radius) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 0.01) return null;

  const normalX = (-deltaY / length) * radius;
  const normalY = (deltaX / length) * radius;
  return contour(
    [
      { x: start.x + normalX, y: start.y + normalY },
      { x: end.x + normalX, y: end.y + normalY },
      { x: end.x - normalX, y: end.y - normalY },
      { x: start.x - normalX, y: start.y - normalY },
    ],
    true,
  );
}

function compactPoints(points, minimumDistance = 3) {
  const compacted = [];
  for (const point of points) {
    const previous = compacted.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= minimumDistance) {
      compacted.push(point);
    }
  }
  const finalPoint = points.at(-1);
  if (finalPoint && compacted.at(-1) !== finalPoint) compacted.push(finalPoint);
  return compacted;
}

function strokeContours(points, width, lineCap) {
  if (points.length === 0) return [];
  const radius = width / 2;
  const result = [];

  if (points.length === 1) {
    const dot = circleContour(points[0], radius);
    return dot ? [dot] : [];
  }

  for (let index = 1; index < points.length; index += 1) {
    const segment = segmentContour(points[index - 1], points[index], radius);
    if (segment) result.push(segment);
  }

  const firstJoin = lineCap === "round" ? 0 : 1;
  const lastJoin = lineCap === "round" ? points.length : points.length - 1;
  for (let index = firstJoin; index < lastJoin; index += 1) {
    const circle = circleContour(points[index], radius);
    if (circle) result.push(circle);
  }

  return result;
}

function calculateBounds(contours) {
  const points = contours.flat();
  if (points.length === 0) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  return {
    xMin: Math.min(...points.map((point) => point.x)),
    yMin: Math.min(...points.map((point) => point.y)),
    xMax: Math.max(...points.map((point) => point.x)),
    yMax: Math.max(...points.map((point) => point.y)),
  };
}

function sourceScale(glyphs) {
  const sourceHeights = glyphs
    .filter((glyph) => /^[a-z]$/.test(glyph.key))
    .map(
      (glyph) =>
        Math.abs(canvasBaselineY(glyph.metrics) - canvasXHeightY(glyph.metrics)) *
        glyph.canvasHeight,
    )
    .filter((height) => Number.isFinite(height) && height > 0);

  return TARGET_X_HEIGHT / Math.max(1, median(sourceHeights));
}

function fontPointsForGlyph(glyph, scale, sideBearing) {
  return glyph.strokes.map((stroke) => {
    const points = stroke.points.map((point) => ({
      x: clamp(
        (point.x - glyph.metrics.boundsX) * glyph.canvasWidth * scale + sideBearing,
        -FONT_COORDINATE_LIMIT,
        FONT_COORDINATE_LIMIT,
      ),
      y: clamp(
        fontYForNormalizedPoint(glyph, point.y, scale),
        -FONT_COORDINATE_LIMIT,
        FONT_COORDINATE_LIMIT,
      ),
    }));
    return compactPoints(points);
  });
}

function makeNotdefGlyph() {
  const outer = contour(
    [
      { x: 40, y: -120 },
      { x: 40, y: 820 },
      { x: 540, y: 820 },
      { x: 540, y: -120 },
    ],
    true,
  );
  const inner = contour(
    [
      { x: 120, y: -40 },
      { x: 120, y: 740 },
      { x: 460, y: 740 },
      { x: 460, y: -40 },
    ],
    false,
  );
  return {
    advanceWidth: 600,
    contours: [outer, inner].filter(Boolean),
    leftSideBearing: 40,
    name: ".notdef",
    unicode: [],
    xMin: 40,
    yMin: -120,
    xMax: 540,
    yMax: 820,
  };
}

function validateGlyph(glyph) {
  const metrics = glyph?.metrics;
  const metricsAreFinite =
    metrics &&
    [
      metrics.boundsX,
      metrics.boundsY,
      metrics.boundsWidth,
      metrics.boundsHeight,
      metrics.baselineY,
      metrics.xHeightY,
    ].every(Number.isFinite);
  const strokesAreValid =
    Array.isArray(glyph?.strokes) &&
    glyph.strokes.every(
      (stroke) =>
        typeof stroke.id === "string" &&
        Array.isArray(stroke.points) &&
        stroke.points.every(
          (point) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            Math.abs(point.x) <= 4 &&
            Math.abs(point.y) <= 4,
        ),
    );

  return (
    glyph &&
    typeof glyph.id === "string" &&
    typeof glyph.key === "string" &&
    glyph.key.length > 0 &&
    glyph.key.length <= 128 &&
    Number.isInteger(glyph.variationIndex) &&
    glyph.variationIndex >= 0 &&
    Number.isFinite(glyph.canvasWidth) &&
    glyph.canvasWidth > 0 &&
    glyph.canvasWidth <= 10_000 &&
    Number.isFinite(glyph.canvasHeight) &&
    glyph.canvasHeight > 0 &&
    glyph.canvasHeight <= 10_000 &&
    metricsAreFinite &&
    strokesAreValid
  );
}

export function validateProject(project) {
  if (!project || project.formatVersion !== 1 || !Array.isArray(project.glyphs)) {
    throw new Error("project no speak handdrawn format one");
  }
  if (
    project.fontGuides !== undefined &&
    (!Number.isFinite(project.fontGuides?.baselineY) ||
      !Number.isFinite(project.fontGuides?.xHeightY) ||
      project.fontGuides.baselineY < 0 ||
      project.fontGuides.baselineY > 1 ||
      project.fontGuides.xHeightY < 0 ||
      project.fontGuides.xHeightY > 1)
  ) {
    throw new Error("font guides leave drawing cave");
  }
  if (!project.glyphs.every(validateGlyph)) {
    throw new Error("one glyph carry broken bone");
  }
  if (project.glyphs.length === 0 || project.glyphs.length > 4096) {
    throw new Error("glyph cave wrong size");
  }

  const pointCount = project.glyphs.reduce(
    (total, glyph) =>
      total +
      glyph.strokes.reduce(
        (strokeTotal, stroke) => strokeTotal + stroke.points.length,
        0,
      ),
    0,
  );
  if (pointCount > 100_000) throw new Error("too many point for one cave");

  const pairs = new Set();
  for (const glyph of project.glyphs) {
    const pair = `${glyph.key}\u0000${glyph.variationIndex}`;
    if (pairs.has(pair)) throw new Error(`duplicate variation for ${glyph.key}`);
    pairs.add(pair);
  }
  return project;
}

function allocateCodepoint(usedCodepoints, nextCodepoint) {
  let candidate = nextCodepoint;
  while (usedCodepoints.has(candidate) && candidate <= PUA_END) candidate += 1;
  if (candidate > PUA_END) throw new Error("private-use cave full");
  usedCodepoints.add(candidate);
  return candidate;
}

export function buildTrueType(project) {
  validateProject(project);

  const familyName = safeFamilyName(project.familyName);
  const settings = {
    lineCap: project.fontForge?.lineCap === "butt" ? "butt" : "round",
    sideBearing: clamp(Number(project.fontForge?.sideBearing) || 40, 0, 240),
    spaceWidth: clamp(Number(project.fontForge?.spaceWidth) || 280, 80, 1200),
    strokeWidth: clamp(Number(project.fontForge?.strokeWidth) || 60, 10, 220),
  };
  const scale = sourceScale(project.glyphs);
  const groups = new Map();
  for (const glyph of project.glyphs) {
    const group = groups.get(glyph.key) ?? [];
    group.push(glyph);
    groups.set(glyph.key, group);
  }
  const orderedKeys = [...groups.keys()].sort(keySort);
  const explicitCodepoints = new Set(
    orderedKeys.filter(isSingleScalar).map((key) => key.codePointAt(0)),
  );
  let nextPUACodepoint = PUA_START;
  const glyf = [makeNotdefGlyph()];
  const manifestGlyphs = [];
  let globalMinimumY = -120;
  let globalMaximumY = 820;

  for (const key of orderedKeys) {
    const variations = [...groups.get(key)].sort(
      (left, right) => left.variationIndex - right.variationIndex,
    );

    for (let index = 0; index < variations.length; index += 1) {
      const glyph = variations[index];
      const primary = index === 0;
      let codepoint;
      const unicodes = [];

      if (primary && isSingleScalar(key)) {
        codepoint = key.codePointAt(0);
        unicodes.push(codepoint);
        if (/^[a-z]$/.test(key)) unicodes.push(key.toUpperCase().codePointAt(0));
      } else {
        codepoint = allocateCodepoint(explicitCodepoints, nextPUACodepoint);
        nextPUACodepoint = codepoint + 1;
        unicodes.push(codepoint);
      }

      const name = glyphName(key, glyph.variationIndex, codepoint, primary);
      const centerlines = fontPointsForGlyph(glyph, scale, settings.sideBearing);
      const contours = centerlines.flatMap((points) =>
        strokeContours(points, settings.strokeWidth, settings.lineCap),
      );
      const bounds = calculateBounds(contours);
      const measuredWidth = glyph.metrics.boundsWidth * glyph.canvasWidth * scale;
      const advanceWidth = clamp(
        key === " "
          ? settings.spaceWidth
          : Math.max(
              settings.sideBearing * 2 + 40,
              Math.round(measuredWidth + settings.sideBearing * 2),
            ),
        40,
        65_535,
      );

      glyf.push({
        advanceWidth,
        contours,
        leftSideBearing: key === " " ? 0 : settings.sideBearing,
        name,
        unicode: unicodes,
        ...bounds,
      });
      globalMinimumY = Math.min(globalMinimumY, bounds.yMin);
      globalMaximumY = Math.max(globalMaximumY, bounds.yMax);
      manifestGlyphs.push({
        advanceWidth,
        codepoint: `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`,
        glyphName: name,
        id: glyph.id,
        key,
        primary,
        variationIndex: glyph.variationIndex,
      });
    }
  }

  if (!groups.has(" ")) {
    glyf.push({
      advanceWidth: settings.spaceWidth,
      contours: [],
      leftSideBearing: 0,
      name: "space",
      unicode: [0x20],
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
    });
  }

  const ascent = Math.max(900, Math.ceil(globalMaximumY + 60));
  const descent = Math.max(250, Math.ceil(Math.abs(globalMinimumY) + 60));
  const font = createFont();
  const data = font.get();
  data.head.unitsPerEm = UNITS_PER_EM;
  data.head.fontRevision = 1;
  data.head.xMin = Math.min(...glyf.map((glyph) => glyph.xMin));
  data.head.yMin = globalMinimumY;
  data.head.xMax = Math.max(...glyf.map((glyph) => glyph.xMax));
  data.head.yMax = globalMaximumY;
  data.glyf = glyf;
  data.cmap = {};
  data.name = {
    fontFamily: familyName,
    fontSubFamily: "Regular",
    fullName: `${familyName} Regular`,
    postScriptName: `${postScriptName(familyName)}-Regular`,
    uniqueSubFamily: `${familyName} Regular 1.0`,
    version: "Version 1.0",
  };
  data.hhea.ascent = ascent;
  data.hhea.descent = -descent;
  data.hhea.lineGap = 0;
  data.post.format = 2;
  data["OS/2"].usWeightClass = 400;
  data["OS/2"].fsSelection = 64;
  data["OS/2"].sTypoAscender = ascent;
  data["OS/2"].sTypoDescender = -descent;
  data["OS/2"].sTypoLineGap = 0;
  data["OS/2"].usWinAscent = ascent;
  data["OS/2"].usWinDescent = descent;
  data["OS/2"].sxHeight = TARGET_X_HEIGHT;
  data["OS/2"].sCapHeight = TARGET_X_HEIGHT;
  data["OS/2"].achVendID = "Ocho";
  font.set(data);

  const buffer = font.write({
    hinting: false,
    kerning: false,
    toBuffer: false,
    type: "ttf",
    writeZeroContoursGlyfData: false,
  });

  return {
    buffer,
    manifest: {
      formatVersion: 1,
      familyName,
      styleName: "Regular",
      unitsPerEm: UNITS_PER_EM,
      ascent,
      descent,
      xHeight: TARGET_X_HEIGHT,
      ...settings,
      glyphCount: manifestGlyphs.length,
      glyphs: manifestGlyphs,
    },
  };
}

export function fileStemForFamily(familyName) {
  return safeFamilyName(familyName).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "My-Hand";
}
