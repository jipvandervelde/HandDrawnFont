import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = join(scriptDirectory, "..");
const sourceDirectory = join(websiteDirectory, "src");
const outputDirectory = join(websiteDirectory, "dist");
const interFontSource = join(
  websiteDirectory,
  "node_modules",
  "@fontsource",
  "inter",
  "files",
  "inter-latin-400-normal.woff2",
);

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
await cp(interFontSource, join(outputDirectory, "fonts", "Inter-Regular.woff2"));

await build({
  entryPoints: [join(sourceDirectory, "create", "app.js")],
  bundle: true,
  format: "iife",
  legalComments: "inline",
  minify: true,
  outfile: join(outputDirectory, "create", "app.js"),
  platform: "browser",
  target: ["chrome120", "safari16"],
});

await build({
  entryPoints: [join(sourceDirectory, "home-intro.js")],
  bundle: true,
  format: "iife",
  legalComments: "inline",
  minify: true,
  outfile: join(outputDirectory, "home-intro.js"),
  platform: "browser",
  target: ["chrome120", "safari16"],
});

await rm(join(outputDirectory, "create", "font-export.js"), { force: true });

console.log(`built ${outputDirectory}`);
