import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = join(scriptDirectory, "..");
const sourceDirectory = join(websiteDirectory, "src");
const outputDirectory = join(websiteDirectory, "dist");

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });

await build({
  entryPoints: [join(sourceDirectory, "forge", "app.js")],
  bundle: true,
  format: "iife",
  legalComments: "inline",
  minify: true,
  outfile: join(outputDirectory, "forge", "app.js"),
  platform: "browser",
  target: ["chrome120", "safari16"],
});

await rm(join(outputDirectory, "forge", "font-export.js"), { force: true });

console.log(`built ${outputDirectory}`);
