import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canvasBaselineY,
  canvasXHeightY,
  deriveBoundsPreservingGuides,
  editorCanvasGeometry,
  fontYForNormalizedPoint,
  setCanvasBaselineY,
  setCanvasXHeightY,
  setProjectBaselineY,
  setProjectCapHeightY,
  setProjectXHeightY,
  synchronizeProjectGuides,
  thumbnailCanvasGeometry,
} from "../src/create/font-metrics.mjs";
import {
  fontBaselineOffset,
  makeAnimatedPreviewPlan,
} from "../src/create/animated-preview.mjs";
import {
  buildTrueType,
  mergeStrokeContours,
} from "../src/create/font-export.js";
import { buildStoredZip } from "../src/create/zip-export.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = join(scriptDirectory, "..");
const outputDirectory = join(websiteDirectory, "dist");
const requiredFiles = [
  "_redirects",
  "404.html",
  "fonts/GrugHand-Book.ttf",
  "fonts/GrugHand-Family.zip",
  "fonts/GrugHand-Light.ttf",
  "fonts/GrugHand-Medium.ttf",
  "fonts/GrugHand-README.txt",
  "fonts/GrugHand-Regular.ttf",
  "fonts/Inter-Regular.woff2",
  "github-scribble.svg",
  "create/app.js",
  "create/grug-hand-manifest.json",
  "create/grug-hand-project.json",
  "create/index.html",
  "create/styles.css",
  "create/zip-export.mjs",
  "grug/app.js",
  "grug/index.html",
  "grug/wisdoms.json",
  "header.css",
  "home-intro.js",
  "index.html",
  "og-image.png",
  "robots.txt",
  "rough-edges.css",
  "rough-edges.js",
  "sitemap.xml",
  "styles.css",
  "theme.js",
  "third-party-notices.txt",
];

for (const file of requiredFiles) {
  await access(join(outputDirectory, file));
}

const thirdPartyNotices = await readFile(
  join(outputDirectory, "third-party-notices.txt"),
  "utf8",
);
for (const value of ["clipper2-ts", "Boost Software License - Version 1.0"]) {
  if (!thirdPartyNotices.includes(value)) {
    throw new Error(`third-party notices are missing: ${value}`);
  }
}

const redirects = await readFile(join(outputDirectory, "_redirects"), "utf8");
for (const value of [
  "/forge /create/ 301",
  "/forge/* /create/:splat 301",
  "/grug-font /grug/ 301",
  "/grug-font/* /grug/:splat 301",
]) {
  if (!redirects.includes(value)) {
    throw new Error(`_redirects is missing legacy route coverage: ${value}`);
  }
}

const requiredAttributionLinks = [
  'href="https://x.com/jipvandervelde"',
  'href="https://x.com/michelelings"',
  'href="https://ocho.so"',
  'href="https://apps.apple.com/app/grug/id6751649802"',
  'href="https://developer.apple.com/design/awards/"',
  "2026 Apple Design Award winner",
];

function assertAttributionLinks(source, label) {
  for (const value of requiredAttributionLinks) {
    if (!source.includes(value)) {
      throw new Error(`${label} is missing attribution link: ${value}`);
    }
  }
}

const html = await readFile(join(outputDirectory, "index.html"), "utf8");
const requiredMarkup = [
  "https://github.com/jipvandervelde/HandDrawnFont",
  "GrugHand-Regular.ttf",
  'class="header-link" href="/grug/">grug font</a>',
  'class="header-link" href="/create/">create font</a>',
  'class="story-actions"',
  'class="button button--primary"',
  'class="button button--quiet"',
  "Create your font",
  "Open GitHub",
  'class="github-scribble"',
  "data-theme-toggle",
  'href="/header.css"',
  'href="/rough-edges.css"',
  'src="/rough-edges.js"',
  'src="/home-intro.js"',
  'src="/theme.js"',
  'href="/create/"',
  "data-home-title-static",
  "data-home-title-line",
  "data-home-title-canvas",
  "data-home-after-intro",
  "home-intro-pending",
];

for (const value of requiredMarkup) {
  if (!html.includes(value)) {
    throw new Error(`index.html is missing required markup: ${value}`);
  }
}
assertAttributionLinks(html, "index.html");

const socialImageMarkup = [
  'property="og:image" content="https://handdrawn.software/og-image.png"',
  'property="og:image:width" content="1200"',
  'property="og:image:height" content="630"',
  'name="twitter:card" content="summary_large_image"',
  'name="twitter:image" content="https://handdrawn.software/og-image.png"',
];

for (const [file, source] of [
  ["index.html", html],
  ["create/index.html", await readFile(join(outputDirectory, "create", "index.html"), "utf8")],
  ["grug/index.html", await readFile(join(outputDirectory, "grug", "index.html"), "utf8")],
]) {
  for (const value of socialImageMarkup) {
    if (!source.includes(value)) {
      throw new Error(`${file} is missing social image metadata: ${value}`);
    }
  }
}

const homeHeader = html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
if (!homeHeader?.includes("data-home-after-intro")) {
  throw new Error("homepage navigation must wait for the title animation");
}

if (
  html.includes('<section class="closing"') ||
  html.includes("Bring your handwriting into an app.")
) {
  throw new Error("homepage must not retain the removed closing CTA section");
}

if (html.includes("HandDrawnFont · Swift package")) {
  throw new Error("homepage must not retain the removed title eyebrow");
}

if (html.includes('<p class="eyebrow">Installation</p>')) {
  throw new Error("homepage must not retain the removed installation eyebrow");
}

if (html.includes('class="feature-number"')) {
  throw new Error("homepage feature cards must not retain numeric labels");
}

if (
  !html.includes("<span data-home-title-line>Hand-drawn text</span>") ||
  !html.includes("<span data-home-title-line>for every app.</span>")
) {
  throw new Error("homepage title must share two explicit lines with its animation");
}

if (html.includes('class="hero"') || !html.includes('<h1 id="story-title"')) {
  throw new Error("use-in-app page must begin with its package story, without an intro hero");
}

const css = await readFile(join(outputDirectory, "styles.css"), "utf8");
for (const value of [
  "@font-face",
  'font-family: "Grug Hand"',
  "prefers-reduced-motion",
  ".home-title-canvas",
  "transform: translate(1px, 1px)",
  'font-feature-settings: "calt" 0, "rand" 0',
  ".home-title [data-home-title-line]",
  ".home-intro-pending [data-home-after-intro]",
  "transition: opacity 320ms ease-out",
  "--rough-edge-intensity: 1.75",
  ".code-card code::selection",
  "user-select: text",
]) {
  if (!css.includes(value)) {
    throw new Error(`styles.css is missing required font rule: ${value}`);
  }
}

const pendingRevealRule = css.match(
  /\.home-intro-pending \[data-home-after-intro\] \{[^}]*\}/s,
)?.[0];
if (!pendingRevealRule || /visibility|transform/.test(pendingRevealRule)) {
  throw new Error("homepage reveal must use opacity only and preserve final layout");
}

function assertBlackAndWhiteOnly(source, label) {
  const colorFunctions = source.match(/(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi) ?? [];
  const hexColors = source.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  const unexpectedColors = [
    ...colorFunctions,
    ...hexColors.filter(
      (color) => !["#000000", "#ffffff"].includes(color.toLowerCase()),
    ),
  ];
  if (unexpectedColors.length > 0) {
    throw new Error(`${label} leaves black-and-white palette: ${unexpectedColors.join(", ")}`);
  }
}

assertBlackAndWhiteOnly(css, "styles.css");
assertBlackAndWhiteOnly(html, "index.html");

const homeIntroScript = await readFile(join(outputDirectory, "home-intro.js"), "utf8");
for (const value of [
  "/create/grug-hand-project.json",
  "/create/grug-hand-manifest.json",
  "prefers-reduced-motion: reduce",
  "home-intro-pending",
  "home-intro-complete",
  "requestAnimationFrame",
  "data-home-title-canvas",
]) {
  if (!homeIntroScript.includes(value)) {
    throw new Error(`home-intro.js is missing homepage animation behavior: ${value}`);
  }
}

const homeIntroSource = await readFile(
  join(websiteDirectory, "src", "home-intro.js"),
  "utf8",
);
if (!homeIntroSource.includes('manifest.strokeLinecap === "butt" ? "butt" : "round"')) {
  throw new Error("home-intro.js must match the compiled font stroke caps during animation");
}
for (const value of [
  "setRevealTargetsInert",
  "target.inert = inert",
  "staticTitle.getBoundingClientRect()",
  "getComputedStyle(staticTitle)",
  "staticTitleLines",
  "line.textContent.trim()",
]) {
  if (!homeIntroSource.includes(value)) {
    throw new Error(`homepage source is missing its accessible reveal behavior: ${value}`);
  }
}

const headerCSS = await readFile(join(outputDirectory, "header.css"), "utf8");
for (const value of [
  ".site-header",
  ".forge-header",
  ".forge-header--editor",
  "padding-inline: calc(12px + clamp(20px, 2.5vw, 34px))",
  ".header-link",
  "font-size: 17px",
  "height: 84px",
]) {
  if (!headerCSS.includes(value)) {
    throw new Error(`header.css is missing shared toolbar rule: ${value}`);
  }
}
assertBlackAndWhiteOnly(headerCSS, "header.css");

if (headerCSS.includes("1480px")) {
  throw new Error("editor header must not retain the removed desktop width cap");
}

if (css.includes(".site-header")) {
  throw new Error("styles.css must not duplicate the shared homepage header rules");
}

const forgeHTML = await readFile(join(outputDirectory, "create", "index.html"), "utf8");
for (const value of [
  "data-glyph-count",
  ">90</span> glyphs",
  "download full package",
  "ZIP · font + editable source + codepoints",
  "download font (.ttf)",
  "download editable project",
  "download codepoint map",
  "data-export-package",
  "data-preview-status",
  "data-preview-play",
  "preview-play__icon",
  "data-glyph-play",
  "drawing-play__icon",
  'aria-label="Play selected letter animation"',
  "data-preview-input",
  "data-font-preview",
  "data-animated-preview",
  "data-cap-height",
  "data-variation-strip",
  'class="forge-header forge-header--editor"',
  'data-line-cap-option="round"',
  'data-line-cap-option="butt"',
  '<h4 id="export-title">Download</h4>',
  'class="header-link" href="/grug/">grug font</a>',
  'href="/create/" aria-current="page">create font</a>',
  "data-theme-toggle",
  'href="/header.css"',
  'href="/rough-edges.css"',
  'src="/rough-edges.js"',
  'src="/theme.js"',
  'aria-label="create font"',
  "No account or upload required.",
]) {
  if (!forgeHTML.includes(value)) {
    throw new Error(`create/index.html is missing required markup: ${value}`);
  }
}

for (const value of ["data-editable-summary", "drawings ·"]) {
  if (forgeHTML.includes(value)) {
    throw new Error(`Removed forge heading copy still present: ${value}`);
  }
}
assertAttributionLinks(forgeHTML, "create/index.html");

if (forgeHTML.includes("/home-intro.js") || forgeHTML.includes("home-intro-pending")) {
  throw new Error("create-font page must not load the homepage-only intro");
}

if (
  forgeHTML.includes("GrugHand-Family.zip") ||
  forgeHTML.includes("data-compiled-grid") ||
  forgeHTML.includes('class="editor-intro"') ||
  forgeHTML.includes("Take everything, or choose one file.") ||
  forgeHTML.includes("<select data-line-cap>") ||
  forgeHTML.includes('id="project-title"') ||
  forgeHTML.includes(">Font settings</h3>")
) {
  throw new Error("create-font page retains removed editor chrome or intro copy");
}

const forgeCSS = await readFile(join(outputDirectory, "create", "styles.css"), "utf8");
assertBlackAndWhiteOnly(forgeCSS, "create/styles.css");
assertBlackAndWhiteOnly(forgeHTML, "create/index.html");

for (const value of [
  ".preview-card > .preview-play",
  ".stroke-cap-segmented",
  ".stroke-cap-field legend,",
  "contain: size",
  ".wisdom-today",
  ".coverage-note {",
  "font-size: 15px",
  "justify-items: start",
  "--rough-fill-color: var(--ink)",
  "@media (min-width: 1081px)",
  "--editor-edge-gap: 12px",
  "height: calc(100dvh - 84px - var(--editor-edge-gap))",
  "padding-bottom: calc(clamp(20px, 2.5vw, 34px) + 12px)",
  ".canvas-stage",
  "65.217391cqh",
  "scrollbar-gutter: stable",
  "--rough-edge-intensity: 2.35",
  "font-size: clamp(46px, 4vw, 62px)",
  "--editor-side-column: minmax(290px, 0.88fr)",
  "--glyph-column-min: 90px",
  "--glyph-column-max: 122px",
  "grid-template-columns: var(--editor-side-column) minmax(440px, 1.55fr) var(--editor-side-column)",
  "repeat(auto-fill, minmax(var(--glyph-column-min), 1fr))",
  ".grug-download-icon",
  "flex: 0 0 16px",
  "grid-template-columns: repeat(4, minmax(0, 1fr))",
  ".drawing-actions .drawing-play",
  ".variation-thumbnail-delete",
  ".export-action:not(.export-action--primary):hover:not(:disabled)",
  ".variation-thumbnail-delete__mark",
  '.variation-thumbnail-item[data-selected="true"] .variation-thumbnail-delete',
  "overflow-y: hidden",
  "margin-top: -17px",
  "padding: 18px 18px 5px 2px",
  "transform: translate(1px, 1px)",
  'font-feature-settings: "calt" 0, "rand" 0',
  "font-variant-ligatures: none",
]) {
  if (!forgeCSS.includes(value)) {
    throw new Error(`create/styles.css is missing requested shared layout treatment: ${value}`);
  }
}

if (
  !/\.variation-thumbnail-delete\s*\{[^}]*top: -17px;[^}]*right: -17px;/s.test(
    forgeCSS,
  )
) {
  throw new Error("variation delete control must sit beyond the thumbnail corner");
}

if (
  !/\.glyph-grid\s*\{[^}]*align-content: start;[^}]*grid-auto-rows: max-content;/s.test(
    forgeCSS,
  ) ||
  !/\.glyph-tile canvas\s*\{[^}]*height: auto;[^}]*aspect-ratio: 3 \/ 4\.6;/s.test(
    forgeCSS,
  )
) {
  throw new Error("glyph tiles must keep the editor canvas aspect ratio and equal row heights");
}

if (forgeCSS.includes(".forge-header")) {
  throw new Error("create/styles.css must not duplicate the shared subpage header rules");
}

if (forgeCSS.includes(".editor-intro")) {
  throw new Error("create/styles.css must not retain the removed editor intro layout");
}

if (forgeHTML.includes("Export formats") || forgeCSS.includes(".eyebrow")) {
  throw new Error("create-font page must not retain the removed export eyebrow");
}

if (
  !forgeHTML.includes("Editable project (.json)") ||
  !forgeHTML.includes("Installable font (.ttf)") ||
  !forgeHTML.includes("cannot be reopened for editing here")
) {
  throw new Error("create-font export cards must explain editable and compiled files");
}

if (
  !forgeHTML.includes("square-button square-button--thumb") ||
  !forgeCSS.includes(".square-button--thumb")
) {
  throw new Error("add-glyph button must use the slider-thumb visual treatment");
}

if (forgeCSS.includes("1480px")) {
  throw new Error("create-font editor must grow to the available desktop width");
}

const grugFontHTML = await readFile(join(outputDirectory, "grug", "index.html"), "utf8");
for (const value of [
  "GrugHand-Family.zip",
  "download ttf",
  "data-compiled-summary",
  "data-compiled-grid",
  "data-daily-wisdom",
  "data-wisdom-grid",
  "one wisdom today",
  "download grug",
  'class="grug-download-icon" aria-hidden="true">&#xE085;</span>',
  'href="/grug/" aria-current="page">grug font</a>',
  'class="header-link" href="/create/">create font</a>',
  "data-theme-toggle",
  'href="/header.css"',
  'href="/rough-edges.css"',
  'src="/rough-edges.js"',
  'src="/theme.js"',
  '<h1 id="download-title">grug hand.</h1>',
  '<div class="section-heading download-heading">',
  "Download all",
  'type="module" src="/grug/app.js"',
]) {
  if (!grugFontHTML.includes(value)) {
    throw new Error(`grug/index.html is missing required markup: ${value}`);
  }
}
assertAttributionLinks(grugFontHTML, "grug/index.html");

if (grugFontHTML.includes("/home-intro.js") || grugFontHTML.includes("home-intro-pending")) {
  throw new Error("grug page must not load the homepage-only intro");
}

for (const removedCopy of [
  "grug hand · compiled font",
  "finished hand. ready now.",
  "four real TrueType faces",
  "download all four · zip",
  "download all four",
  "about 600 kb",
  "data-wisdom-count",
  "wisdom in grug bag.",
  "find more in grug",
  "daily grug wisdom",
  "inside compiled grug hand",
]) {
  if (grugFontHTML.includes(removedCopy)) {
    throw new Error(`grug/index.html must not retain removed download copy: ${removedCopy}`);
  }
}

if (grugFontHTML.includes("data-forge-app") || grugFontHTML.includes("data-drawing-canvas")) {
  throw new Error("Grug font download page must not contain the create-font editor");
}
assertBlackAndWhiteOnly(grugFontHTML, "grug/index.html");

const grugFontApp = await readFile(join(outputDirectory, "grug", "app.js"), "utf8");
for (const value of [
  "grug-hand-manifest.json",
  "grug-hand-project.json",
  "wisdoms.json",
  "data-coverage-filter",
  "drawAnimatedPreviewFrame",
  "makeAnimatedPreviewPlan",
  "wisdomReplayState",
  "pointerenter",
  "prefers-reduced-motion: reduce",
  "renderGrid",
  "renderWisdoms",
]) {
  if (!grugFontApp.includes(value)) {
    throw new Error(`grug/app.js is missing font coverage logic: ${value}`);
  }
}

if (grugFontApp.includes("wisdomCount")) {
  throw new Error("grug/app.js must not retain the removed wisdom count label path");
}

for (const value of [
  ".wisdom-replay-canvas",
  ".wisdom-replay.is-replaying .wisdom-replay-static",
  ".wisdom-replay:focus-visible",
  "@media (hover: hover) and (pointer: fine)",
]) {
  if (!forgeCSS.includes(value)) {
    throw new Error(`create/styles.css is missing wisdom replay treatment: ${value}`);
  }
}

const wisdoms = JSON.parse(
  await readFile(join(outputDirectory, "grug", "wisdoms.json"), "utf8"),
);
if (
  wisdoms.source !== "Grug app WisdomLibrary.swift" ||
  wisdoms.count !== 702 ||
  wisdoms.wisdoms?.length !== 702 ||
  new Set(wisdoms.wisdoms.map(({ id }) => id)).size !== 702
) {
  throw new Error("grug/wisdoms.json must contain all 702 unique shipped wisdoms");
}

const themeScript = await readFile(join(outputDirectory, "theme.js"), "utf8");
for (const value of [
  'const MODES = ["system", "light", "dark"]',
  "handdrawn-color-scheme",
  "data-theme-toggle",
  "Color scheme:",
  "handdrawn:themechange",
  "new CustomEvent",
  "\\uE0BD",
  "\\uE09A",
  "\\uE092",
]) {
  if (!themeScript.includes(value)) {
    throw new Error(`theme.js is missing its color-scheme cycle: ${value}`);
  }
}

const roughEdgesScript = await readFile(join(outputDirectory, "rough-edges.js"), "utf8");
for (const value of [
  "roughBoxPath",
  "FILL_SELECTOR",
  "STATEFUL_FILL_SELECTOR",
  '".variation-thumbnail"',
  '".export-action"',
  "installFill",
  "rough-fill-overlay",
  "ResizeObserver",
  "MutationObserver",
  "rough-range-host",
  "--rough-edge-intensity",
  '".button"',
  '".button--primary"',
  '".code-card"',
  '".code-card__bar button"',
  ".feature-card",
  ".font-card",
  '".font-card > a"',
  '".wisdom-today"',
  '".wisdom-card"',
  '".compiled-glyph"',
  ".forge-app",
  ".canvas-shell",
  '".square-button:not(.square-button--thumb)"',
]) {
  if (!roughEdgesScript.includes(value)) {
    throw new Error(`rough-edges.js is missing its reusable edge treatment: ${value}`);
  }
}

const roughFillSelectors = roughEdgesScript.match(
  /const FILL_SELECTOR = \[([\s\S]*?)\]\.join/,
)?.[1];
const roughBoxSelectors = roughEdgesScript.match(
  /const BOX_SELECTOR = \[([\s\S]*?)\]\.join/,
)?.[1];
if (
  !roughFillSelectors ||
  !roughBoxSelectors ||
  roughFillSelectors.includes(".preview-play") ||
  roughBoxSelectors.includes(".preview-play")
) {
  throw new Error("preview play must use the clear add-glyph circle treatment, not a rough blob");
}

const roughEdgesCSS = await readFile(join(outputDirectory, "rough-edges.css"), "utf8");
assertBlackAndWhiteOnly(roughEdgesCSS, "rough-edges.css");

for (const value of [
  ".rough-fill-host",
  ".rough-fill__shape",
  '.segmented button[aria-pressed="true"] > .rough-edge-overlay',
  '.variation-thumbnail[aria-pressed="true"] > .rough-edge-overlay',
  "fill: var(--rough-fill-color, var(--ink))",
  "stroke: none",
  ".github-scribble",
  'url("/github-scribble.svg")',
]) {
  if (!roughEdgesCSS.includes(value)) {
    throw new Error(`rough-edges.css is missing the reusable GitHub mark: ${value}`);
  }
}

const githubScribble = await readFile(join(outputDirectory, "github-scribble.svg"), "utf8");
for (const value of ["feTurbulence", "feDisplacementMap", 'filter="url(#scribble)"']) {
  if (!githubScribble.includes(value)) {
    throw new Error(`github-scribble.svg is missing its hand-drawn treatment: ${value}`);
  }
}
assertBlackAndWhiteOnly(githubScribble, "github-scribble.svg");

const notFoundHTML = await readFile(join(outputDirectory, "404.html"), "utf8");
for (const value of ['href="/rough-edges.css"', 'src="/rough-edges.js"']) {
  if (!notFoundHTML.includes(value)) {
    throw new Error(`404.html is missing its shared rough treatment: ${value}`);
  }
}

for (const [source, label] of [
  [html, "index.html"],
  [forgeHTML, "create/index.html"],
  [grugFontHTML, "grug/index.html"],
  [notFoundHTML, "404.html"],
]) {
  if (/[↗↘↙↖↓↑→←]/u.test(source)) {
    throw new Error(`${label} must not use directional arrow glyphs in actions`);
  }
}

if ((html.match(/class="github-scribble"/g) ?? []).length !== 2) {
  throw new Error("homepage must use the scribbled GitHub mark on both GitHub buttons");
}

for (const [source, label] of [
  [html, "index.html"],
  [forgeHTML, "create/index.html"],
  [grugFontHTML, "grug/index.html"],
]) {
  const header = source.match(/<header\b[\s\S]*?<\/header>/)?.[0];
  if (!header) {
    throw new Error(`${label} is missing its site header`);
  }
  if (header.includes("use in app") || header.includes("github")) {
    throw new Error(`${label} header must contain only the two product routes`);
  }
  if (!source.includes('class="header-links"') || !source.includes("&#xE0BD;")) {
    throw new Error(`${label} is missing the full-width header or drawn theme glyph`);
  }
  if (!header.includes("forge-header--editor")) {
    throw new Error(`${label} must use the editor header size and positioning`);
  }
  if (source.includes("<svg viewBox=\"0 0 24 24\"")) {
    throw new Error(`${label} must not use generic SVG theme icons`);
  }
}

if (forgeHTML.includes("build fresh preview") || forgeHTML.includes("data-build-preview")) {
  throw new Error("forge preview must update live without a manual build button");
}

if (
  !forgeHTML.includes("<textarea") ||
  !forgeHTML.includes('rows="3"') ||
  /<input\b[^>]*\bid="preview-copy"/s.test(forgeHTML)
) {
  throw new Error("forge preview text must be edited directly in the rendered preview");
}

if (
  forgeHTML.includes("preview-card__heading") ||
  forgeHTML.includes("preview-card__actions") ||
  forgeHTML.includes("play strokes") ||
  !forgeHTML.includes('aria-label="Play animated font preview"')
) {
  throw new Error("forge preview must use only an icon play button at bottom right");
}

if (forgeHTML.includes("data-variation-select")) {
  throw new Error("forge variations must use horizontal thumbnails instead of a dropdown");
}

const forgeApp = await readFile(join(outputDirectory, "create", "app.js"), "utf8");
for (const value of [
  "data-add-variation",
  "Create new variation for",
  "application/zip",
  "font-package.zip",
  "scrollHeight",
  "HTMLTextAreaElement",
  "data-line-cap-option",
  "data-delete-variation",
  "Blank variation created.",
  "Variation copied.",
  "Variation deleted.",
]) {
  if (!forgeApp.includes(value)) {
    throw new Error(`forge app is missing required editor behavior: ${value}`);
  }
}

const forgeSourceApp = await readFile(join(websiteDirectory, "src", "create", "app.js"), "utf8");
for (const value of [
  "blank.strokes = [];",
  "createBlankVariation();",
  'elements.copyVariation.addEventListener("click", duplicateVariation);',
  "variations.length <= 1",
  'deleteButton.addEventListener("click", (event) => {',
  "event.stopPropagation();",
  "function playGlyphAnimation()",
  "function tilePointMapper(glyph, width, height)",
  "function editorAlignedTilePointMapper(glyph, width, height)",
  "drawTileCanvas(canvas, glyph, selected, true);",
  "thumbnailCanvasGeometry(glyph, width, height)",
  "(point.x * glyph.canvasWidth - geometry.sourceX) * geometry.scale",
  "(point.y * glyph.canvasHeight - geometry.sourceY) * geometry.scale",
  "traceGlyphProgress(context, glyph.strokes, mapPoint, animationProgress);",
  'elements.glyphPlay.addEventListener("click", playGlyphAnimation);',
  'elements.glyphPlay.disabled = glyph.strokes.length === 0;',
  "function redrawCanvasInk()",
  'window.addEventListener("handdrawn:themechange", redrawCanvasInk);',
]) {
  if (!forgeSourceApp.includes(value)) {
    throw new Error(`create/app.js is missing required variation behavior: ${value}`);
  }
}

if (forgeApp.includes(".scrollIntoView(")) {
  throw new Error("forge variation selection must not move the whole page vertically");
}

if (forgeApp.includes("data-compiled-grid") || forgeApp.includes("data-coverage-filter")) {
  throw new Error("forge app must not retain Grug font download-page behavior");
}

const project = JSON.parse(
  await readFile(join(outputDirectory, "create", "grug-hand-project.json"), "utf8"),
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
assert.ok(approximatelyEqual(projectGuides.capHeightY, 0.06));
const characterGlyphs = project.glyphs.filter(
  (glyph) => Array.from(glyph.key).length === 1 && glyph.key !== " ",
);
assert.equal(characterGlyphs.length, 178);
for (const glyph of project.glyphs) {
  assert.ok(approximatelyEqual(canvasXHeightY(glyph.metrics), projectGuides.xHeightY));
  assert.ok(approximatelyEqual(canvasBaselineY(glyph.metrics), projectGuides.baselineY));
}

const projectGuideFixture = JSON.parse(JSON.stringify(project));
setProjectCapHeightY(projectGuideFixture, 0.1);
setProjectXHeightY(projectGuideFixture, 0.3);
setProjectBaselineY(projectGuideFixture, 0.8);
assert.ok(approximatelyEqual(projectGuideFixture.fontGuides.capHeightY, 0.1));
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

const primaryA = project.glyphs.find(
  (glyph) => glyph.key === "a" && glyph.variationIndex === 0,
);
const repeatedLetterPlan = makeAnimatedPreviewPlan(project, "aa", {
  width: 720,
  fontSize: 44,
  lineHeight: 46,
});
assert.deepEqual(
  repeatedLetterPlan.items.map((item) => item.glyphID),
  [primaryA.id, primaryA.id],
);
const homepageTitlePlan = makeAnimatedPreviewPlan(
  project,
  "Hand-drawn text\nfor every app.",
  {
    width: 780,
    fontSize: 90,
    lineHeight: 91.8,
  },
);
assert.equal(homepageTitlePlan.items.length, 26);
const homepagePrimaryGlyphs = new Map();
for (const glyph of [...project.glyphs].sort(
  (left, right) => left.variationIndex - right.variationIndex,
)) {
  if (!homepagePrimaryGlyphs.has(glyph.key)) {
    homepagePrimaryGlyphs.set(glyph.key, glyph.id);
  }
}
assert.ok(
  homepageTitlePlan.items.every(
    (item) => item.glyphID === homepagePrimaryGlyphs.get(item.character.toLowerCase()),
  ),
);
assert.ok(
  Math.max(
    ...homepageTitlePlan.items
      .slice(0, "Hand-drawntext".length)
      .flatMap((item) => item.strokes)
      .flatMap((stroke) => stroke.points)
      .map((point) => point.y),
  ) <
    Math.min(
      ...homepageTitlePlan.items
        .slice("Hand-drawntext".length)
        .flatMap((item) => item.strokes)
        .flatMap((stroke) => stroke.points)
        .map((point) => point.y),
    ),
);
assert.ok(
  approximatelyEqual(
    fontBaselineOffset({
      ascent: 900,
      descent: 324,
      fontSize: 44,
      lineHeight: 45.76,
      unitsPerEm: 1000,
    }),
    34.552,
  ),
);

const expandedEditorGeometry = editorCanvasGeometry(primaryA, 300, 460);
assert.ok(approximatelyEqual(expandedEditorGeometry.contentHeight, 400));
assert.ok(approximatelyEqual(expandedEditorGeometry.topInset, 60));

const primaryAThumbnailGeometry = thumbnailCanvasGeometry(primaryA, 100, 52);
const primaryABoundsWidth = primaryA.metrics.boundsWidth * primaryA.canvasWidth;
const primaryABoundsHeight = primaryA.metrics.boundsHeight * primaryA.canvasHeight;
assert.ok(
  approximatelyEqual(
    (primaryABoundsWidth * primaryAThumbnailGeometry.scale) /
      (primaryABoundsHeight * primaryAThumbnailGeometry.scale),
    primaryABoundsWidth / primaryABoundsHeight,
  ),
);
assert.ok(approximatelyEqual(primaryAThumbnailGeometry.offsetY, 5));

const generatedFont = buildTrueType(project);
assert.equal(generatedFont.manifest.capHeight, 688);
const generatedPrimaryGlyph = (key) =>
  generatedFont.manifest.glyphs.find((glyph) => glyph.key === key && glyph.primary);
assert.equal(generatedPrimaryGlyph("e").contourCount, 1);
assert.equal(generatedPrimaryGlyph("o").contourCount, 2);
assert.ok(
  Math.max(...generatedFont.manifest.glyphs.map((glyph) => glyph.contourCount)) < 16,
);
assert.ok(generatedFont.buffer.byteLength < 300_000);

const heavyStrokeProject = JSON.parse(JSON.stringify(project));
heavyStrokeProject.fontForge = {
  ...heavyStrokeProject.fontForge,
  strokeWidth: 140,
};
const heavyStrokeFont = buildTrueType(heavyStrokeProject);
assert.ok(
  heavyStrokeFont.manifest.glyphs.find(
    (glyph) => glyph.key === "e" && glyph.primary,
  ).contourCount <= 2,
);
assert.ok(heavyStrokeFont.buffer.byteLength < 300_000);

const crossingStrokeContours = mergeStrokeContours(
  [
    [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    [
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ],
  ],
  20,
  "round",
);
assert.equal(crossingStrokeContours.length, 1);

const explicitUppercaseProject = JSON.parse(JSON.stringify(project));
explicitUppercaseProject.glyphs.push({
  canvasHeight: 533.333_333_333_333_4,
  canvasWidth: 400,
  id: "explicit-uppercase-a",
  key: "A",
  metrics: {
    baselineY: projectGuides.baselineY,
    boundsHeight: 0,
    boundsWidth: 0,
    boundsX: 0,
    boundsY: 0,
    xHeightY: projectGuides.xHeightY,
  },
  strokes: [],
  variationIndex: 0,
});
const explicitUppercaseFont = buildTrueType(explicitUppercaseProject);
assert.ok(
  explicitUppercaseFont.manifest.glyphs.some(
    (glyph) => glyph.key === "A" && glyph.codepoint === "U+0041",
  ),
);

const manifest = JSON.parse(
  await readFile(join(outputDirectory, "create", "grug-hand-manifest.json"), "utf8"),
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

const packageZip = buildStoredZip([
  { name: "Test-Regular.ttf", data: new Uint8Array([0, 1, 2, 3]) },
  { name: "Test-project.json", data: '{"formatVersion":1}\n' },
  { name: "README.txt", data: "keep the source\n" },
]);
const packageZipView = new DataView(
  packageZip.buffer,
  packageZip.byteOffset,
  packageZip.byteLength,
);
assert.equal(packageZipView.getUint32(0, true), 0x04034b50);
assert.equal(packageZipView.getUint32(packageZip.byteLength - 22, true), 0x06054b50);
assert.equal(packageZipView.getUint16(packageZip.byteLength - 12, true), 3);
const packageZipText = new TextDecoder().decode(packageZip);
for (const filename of ["Test-Regular.ttf", "Test-project.json", "README.txt"]) {
  assert.ok(packageZipText.includes(filename));
}

const inter = await readFile(join(outputDirectory, "fonts", "Inter-Regular.woff2"));
if (inter.subarray(0, 4).toString("hex") !== "774f4632") {
  throw new Error("Inter drawing reference is not a WOFF2 font");
}

console.log(
  `checked ${requiredFiles.length} assets, four Grug Hand faces, Inter blank-glyph reference, ${project.glyphs.length} editable drawings with fixed cap, x-height, and baseline guides, and ${manifest.glyphCount} compiled drawings`,
);
