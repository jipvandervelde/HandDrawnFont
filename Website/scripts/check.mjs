import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = join(scriptDirectory, "..");
const outputDirectory = join(websiteDirectory, "dist");
const requiredFiles = [
  "404.html",
  "fonts/GrugHand-Book.ttf",
  "fonts/GrugHand-Light.ttf",
  "fonts/GrugHand-Medium.ttf",
  "fonts/GrugHand-Regular.ttf",
  "index.html",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
];

for (const file of requiredFiles) {
  await access(join(outputDirectory, file));
}

const html = await readFile(join(outputDirectory, "index.html"), "utf8");
const requiredMarkup = [
  "https://github.com/jipvandervelde/HandDrawnFont",
  "Jip van der Velde and Michel Elings",
  "GrugHand-Regular.ttf",
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

console.log(`checked ${requiredFiles.length} static assets and four Grug Hand faces`);
