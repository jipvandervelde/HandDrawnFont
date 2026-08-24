import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  "no account. no upload.",
  "Jip van der Velde and Michel Elings",
]) {
  if (!forgeHTML.includes(value)) {
    throw new Error(`forge/index.html is missing required markup: ${value}`);
  }
}

const project = JSON.parse(
  await readFile(join(outputDirectory, "forge", "grug-hand-project.json"), "utf8"),
);
const projectKeys = new Set(project.glyphs.map((glyph) => glyph.key));
if (project.formatVersion !== 1 || project.glyphs.length !== 249 || projectKeys.size !== 90) {
  throw new Error("editable Grug source does not match the 249-drawing, 90-key archive");
}

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
  `checked ${requiredFiles.length} assets, four Grug Hand faces, ${project.glyphs.length} editable drawings, and ${manifest.glyphCount} compiled drawings`,
);
