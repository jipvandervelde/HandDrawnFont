# handdrawn.software

Static website and browser font forge for the HandDrawnFont Swift package. The
site uses the four finished Grug Hand font faces made from the original
drawings: Light, Book, Regular, and Medium.

The checked-in website fonts are byte-for-byte copies of the Ocho Grug font
exports. The Swift package continues to use normalized stroke data for its
animated renderer.

`/forge/` includes:

- Individual TTF downloads and a ZIP of the finished Grug Hand family.
- A coverage catalog generated from the Regular TTF manifest.
- A touch, Pencil, and mouse stroke editor initialized with the original
  normalized Grug drawing source.
- Local JSON import/export in the same versioned shape accepted by the Swift
  package.
- Client-side TrueType generation and a codepoint manifest. Nothing is sent to
  a server; browser local storage is only used for autosave.
- A live font preview that rebuilds automatically after drawing, guide, spacing,
  or stroke-style changes.
- An optional animated preview that replays the editable centerline strokes
  letter by letter, using the Swift package's relaxed timing model.
- A horizontally scrollable thumbnail strip for switching between glyph
  variations without opening a dropdown.

The version 1 project schema stores each glyph's `baselineY` and `xHeightY` as
normalized offsets from `boundsY`. The forge also stores one full-canvas
`fontGuides` pair for the whole project. It keeps every glyph synchronized to
those fixed positions, preserves them when drawing bounds change, and converts
them back to bounds-relative glyph values when saving JSON or building a font.

The source project has 249 drawings across 90 character and named-icon keys.
The archived Regular TTF has 246 compiled drawings. Generated fonts map the
primary Unicode characters normally and assign alternates and named icons to
private-use codepoints listed in the exported manifest.

## Local development

```bash
npm ci
npm run dev
```

Wrangler serves the generated site locally. The production output is written
to the ignored `dist/` directory.

## Checks

```bash
npm run build
npm run check
```

The build bundles `fonteditor-core` into the forge application with esbuild.
Its MIT license is included in `src/third-party-notices.txt` and the production
output.

## Deployment

The Wrangler configuration is pinned to the Ocho Cloudflare account and the
`handdrawn.software` custom domain.

```bash
npm run deploy
```
