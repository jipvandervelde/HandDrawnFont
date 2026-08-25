# handdrawn.software

Static website and browser font forge for the HandDrawnFont Swift package. The
site uses the four finished Grug Hand font faces made from the original
drawings: Light, Book, Regular, and Medium.

The checked-in website fonts are byte-for-byte copies of the Ocho Grug font
exports. The Swift package continues to use normalized stroke data for its
animated renderer.

`/grug/` includes:

- Individual TTF downloads and a ZIP of the finished Grug Hand family.
- A coverage catalog generated from the Regular TTF manifest.

`/create/` includes:

- A touch, Pencil, and mouse stroke editor initialized with the original
  normalized Grug drawing source.
- Local JSON import/export in the same versioned shape accepted by the Swift
  package.
- Client-side TrueType generation and a codepoint manifest. Nothing is sent to
  a server; browser local storage is only used for autosave.
- TrueType strokes are expanded and boolean-merged into non-overlapping glyph
  outlines before export, avoiding raster seams while preserving counters.
- A complete ZIP download containing the generated TTF, editable project JSON,
  codepoint map, and a short README, alongside each individual file download.
- A live font preview that rebuilds automatically after drawing, guide, spacing,
  or stroke-style changes.
- An optional animated preview that replays the editable centerline strokes
  letter by letter, using the Swift package's relaxed timing model.
- A horizontally scrollable thumbnail strip for switching between glyph
  variations without opening a dropdown.
- An expanded ascender zone above the logical glyph canvas, with fixed cap
  height, x-height, and baseline guides that do not stretch or rewrite source
  drawings.
- A faint, locally bundled Inter reference character on blank letter glyphs.
  It is aligned to the baseline and the applicable cap-height or x-height
  guide, then disappears as soon as drawing begins.

The version 1 project schema stores each glyph's `baselineY` and `xHeightY` as
normalized offsets from `boundsY`. The forge also stores one full-canvas
`fontGuides` set with `capHeightY`, `xHeightY`, and `baselineY` for the whole
project. It keeps every glyph synchronized to those fixed positions, preserves
them when drawing bounds change, and converts them back to bounds-relative
glyph values when saving JSON or building a font. The generated TTF writes the
matching OpenType cap-height and x-height metadata.
The animated preview uses the generated font's primary glyph advances and
vertical metrics, so its centerline replay matches the static TTF preview size.
Inter is bundled solely as the blank-glyph drawing reference under the SIL Open
Font License; see `src/third-party-notices.txt`.

The source project has 249 drawings across 90 character and named-icon keys.
The archived Regular TTF has 246 compiled drawings. Generated fonts map the
primary Unicode characters normally and assign alternates and named icons to
private-use codepoints listed in the exported manifest.

## Hand-drawn edges

`src/rough-edges.js` replaces straight CSS borders with two deterministic,
slightly imperfect SVG pen paths. The same system wraps editor fields, draws
rough slider tracks, and follows dynamically rendered glyph and variation
buttons through a `MutationObserver`. Paths redraw through a `ResizeObserver`,
so they stay sharp and aligned when a control or viewport changes size. Text
and interactive content are never filtered or distorted.

The shared treatment also covers homepage calls to action and the Swift code
panel, Grug font downloads, wisdom cards, and compiled glyph tiles. Individual
surfaces can adjust the wobble with `--rough-edge-intensity` while retaining the
same renderer, two-stroke construction, focus behavior, and theme colors.

To apply the treatment to another card, add its selector to `BOX_SELECTOR` in
`src/rough-edges.js`. Keep a normal CSS border on the card: it is the no-script
fallback and is hidden only after the vector overlay has been installed.

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

The build bundles `fonteditor-core` and `clipper2-ts` into the create-font
application with esbuild. Their MIT and Boost licenses are included in
`src/third-party-notices.txt` and the production output.

## Deployment

The Wrangler configuration is pinned to the Ocho Cloudflare account and the
`handdrawn.software` custom domain.

```bash
npm run deploy
```
