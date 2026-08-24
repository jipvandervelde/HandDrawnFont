import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canvasBaselineY,
  canvasXHeightY,
  deriveBoundsPreservingGuides,
  fontYForNormalizedPoint,
  setCanvasBaselineY,
  setCanvasXHeightY,
  setProjectBaselineY,
  setProjectXHeightY,
  synchronizeProjectGuides,
} from "../src/forge/font-metrics.mjs";
import { makeAnimatedPreviewPlan } from "../src/forge/animated-preview.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = join(scriptDirectory, "..");
const outputDirectory = join(websiteDirectory, "dist");
const requiredFiles = [
  "404.html",
  "fonts/GrugHand-Book.ttf",
  "fonts/GrugHand-Family.zip",
  "fonts/GrugHand-Light.ttf",
  "fonts/GrugHand-Medium.ttf",
  "fonts/GrugHand-README.txt",
  "fonts/GrugHand-Regular.ttf",
  "forge/app.js",
  "forge/grug-hand-manifest.json",
  "forge/grug-hand-project.json",
  "forge/index.html",
  "forge/styles.css",
  "index.html",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
  "third-party-notices.txt",
];

for (const file of requiredFiles) {
  await access(join(outputDirectory, file));
}

const html = await readFile(join(outputDirectory, "index.html"), "utf8");
const requiredMarkup = [
  "https://github.com/jipvandervelde/HandDrawnFont",
  "Jip van der Velde and Michel Elings",
  "GrugHand-Regular.ttf",
  'href="/forge/"',
];

for (const value of requiredMarkup) {
  if (!html.includes(value)) {
    throw new Error(`index.html is missing required markup: ${value}`);
  }
}

const css = await readFile(join(outputDirectory, "styles.css"), "utf8");
for (const value of ["@font-face", 'font-family: "Grug Hand"', "prefers-reduced-motion"]) {
  if (!css.includes(value)) {
    throw new Error(`styles.css is missing required font rule: ${value}`);
  }
}

const forgeHTML = await readFile(join(outputDirectory, "forge", "index.html"), "utf8");
for (const value of [
  "GrugHand-Family.zip",
  "249 drawings · 90 keys",
  "download ttf",
  "download project json",
  "download codepoint map",
  "data-preview-status",
  "data-preview-play",
  "data-animated-preview",
  "data-variation-strip",
  "no account. no upload.",
  "Jip van der Velde and Michel Elings",
]) {
  if (!forgeHTML.includes(value)) {
    throw new Error(`forge/index.html is missing required markup: ${value}`);
  }
}

if (forgeHTML.includes("build fresh preview") || forgeHTML.includes("data-build-preview")) {
  throw new Error("forge preview must update live without a manual build button");
}

if (forgeHTML.includes("data-variation-select")) {
  throw new Error("forge variations must use horizontal thumbnails instead of a dropdown");
}

const project = JSON.parse(
  await readFile(join(outputDirectory, "forge", "grug-hand-project.json"), "utf8"),
);
const projectKeys = new Set(project.glyphs.map((glyph) => glyph.key));
if (project.formatVersion !== 1 || project.glyphs.length !== 249 || projectKeys.size !== 90) {
  throw new Error("editable Grug source does not match the 249-drawing, 90-key archive");
}

const approximatelyEqual = (left, right, tolerance = 1e-9) =>
  Math.abs(left - right) <= tolerance;
const projectGuides = synchronizeProjectGuides(project);
assert.ok(approximatelyEqual(projectGuides.xHeightY, 0.243_281_25));
assert.ok(approximatelyEqual(projectGuides.baselineY, 0.729_843_75));
const characterGlyphs = project.glyphs.filter(
  (glyph) => Array.from(glyph.key).length === 1 && glyph.key !== " ",
);
assert.equal(characterGlyphs.length, 178);
for (const glyph of project.glyphs) {
  assert.ok(approximatelyEqual(canvasXHeightY(glyph.metrics), projectGuides.xHeightY));
  assert.ok(approximatelyEqual(canvasBaselineY(glyph.metrics), projectGuides.baselineY));
}

const projectGuideFixture = JSON.parse(JSON.stringify(project));
setProjectXHeightY(projectGuideFixture, 0.3);
setProjectBaselineY(projectGuideFixture, 0.8);
assert.ok(
  projectGuideFixture.glyphs.every(
    (glyph) =>
      approximatelyEqual(canvasXHeightY(glyph.metrics), 0.3) &&
      approximatelyEqual(canvasBaselineY(glyph.metrics), 0.8),
  ),
);

const guideFixture = {
  canvasHeight: 500,
  metrics: {
    baselineY: 0.5,
    boundsHeight: 0.4,
    boundsWidth: 0.4,
    boundsX: 0.2,
    boundsY: 0.2,
    xHeightY: 0.04,
  },
  strokes: [
    {
      points: [
        { x: 0.3, y: 0.42 },
        { x: 0.7, y: 0.68 },
      ],
    },
  ],
};
deriveBoundsPreservingGuides(guideFixture);
assert.ok(approximatelyEqual(guideFixture.metrics.boundsY, 0.4));
assert.ok(approximatelyEqual(canvasXHeightY(guideFixture.metrics), 0.24));
assert.ok(approximatelyEqual(canvasBaselineY(guideFixture.metrics), 0.7));
setCanvasXHeightY(guideFixture.metrics, 0.3);
setCanvasBaselineY(guideFixture.metrics, 0.8);
assert.ok(approximatelyEqual(canvasXHeightY(guideFixture.metrics), 0.3));
assert.ok(approximatelyEqual(canvasBaselineY(guideFixture.metrics), 0.8));
assert.ok(
  approximatelyEqual(
    fontYForNormalizedPoint(guideFixture, canvasBaselineY(guideFixture.metrics), 2),
    0,
  ),
);

const animationPlan = makeAnimatedPreviewPlan(project, "small hand make own mark.", {
  width: 720,
  fontSize: 44,
  lineHeight: 46,
});
assert.equal(animationPlan.items.length, 21);
assert.ok(animationPlan.totalDuration > 0);
assert.ok(animationPlan.items.every((item) => item.duration > 0));
assert.ok(
  animationPlan.items
    .flatMap((item) => item.strokes)
    .flatMap((stroke) => stroke.points)
    .every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
);

const manifest = JSON.parse(
  await readFile(join(outputDirectory, "forge", "grug-hand-manifest.json"), "utf8"),
);
if (
  manifest.glyphCount !== 246 ||
  manifest.glyphs.length !== 246 ||
  !manifest.features.includes("calt")
) {
  throw new Error("compiled Grug manifest does not match the Regular TTF archive");
}

const zip = await readFile(join(outputDirectory, "fonts", "GrugHand-Family.zip"));
if (zip.subarray(0, 4).toString("hex") !== "504b0304") {
  throw new Error("Grug Hand family download is not a ZIP archive");
}

console.log(
  `checked ${requiredFiles.length} assets, four Grug Hand faces, ${project.glyphs.length} editable drawings with fixed project guides, and ${manifest.glyphCount} compiled drawings`,
);
