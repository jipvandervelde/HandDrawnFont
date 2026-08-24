# AGENTS.md

This repository is a standalone Swift Package. It has no host-app assumptions.

## Purpose

`HandDrawnFont` renders text and individual glyphs from normalized handwritten
strokes. `HandDrawnFontDebug` provides optional inspection views.

## Commands

```bash
swift build
swift test
```

For iOS integration, also build the consuming app target in Xcode.

## Products

- `HandDrawnFont`: runtime models, resource loading, layout, static rendering,
  and animation.
- `HandDrawnFontDebug`: playground, catalog, metrics/stroke inspection, and a
  persistence-free glyph authoring canvas.

Do not make a consuming app depend on `HandDrawnFontDebug` unless the user asks
for debug tooling.

## Integration contract

The minimal integration is:

```swift
import HandDrawnFont

HandDrawnText("small action move mountain.")
```

Rules for coding agents:

1. Link the package product to the exact app or extension target that imports
   it.
2. Never copy `hand-drawn-typeface.json` into a client. It is loaded with
   `Bundle.module` inside the package.
3. Never add SwiftData, Core Data, UserDefaults, app-group storage, or a custom
   loader for the bundled typeface.
4. Never create per-character timers. `HandDrawnText` owns one shared timeline.
5. Use `animation: nil` for static content.
6. Use `animationTrigger` to replay and `variationSeed` for stable variations.
7. Do not turn named glyphs into magic text prefixes. Use the explicit glyph
   views.
8. Preserve the package's Reduce Motion and semantic accessibility behavior.
9. Unsupported characters should remain visible unless the product explicitly
   requests `.placeholder` or `.hidden`.
10. Verify `swift test` after package edits and build the consuming target after
    integration edits.

## Source layout

- `Sources/HandDrawnFont/HandDrawnGlyph.swift`: public normalized value types.
- `Sources/HandDrawnFont/HandDrawnTypeface.swift`: loading, lookup, validation,
  and JSON interchange.
- `Sources/HandDrawnFont/GlyphRendering.swift`: cached SwiftUI paths and Canvas
  drawing.
- `Sources/HandDrawnFont/HandDrawnText.swift`: public text facade and playback.
- `Sources/HandDrawnFont/HandDrawnGlyphViews.swift`: public individual glyph
  views.
- `Sources/HandDrawnFont/TextRenderPlan.swift`: variation selection and timing.
- `Sources/HandDrawnFontDebug/`: optional debug UI.
- `Tests/HandDrawnFontTests/`: resource and behavior invariants.

## Package invariants

- Runtime code remains independent of any consumer.
- Public models remain `Codable` and `Sendable`.
- Bundled glyph geometry stays normalized.
- Glyph IDs are unique and identify immutable artwork. Change the ID when a
  glyph's strokes or metrics change so the render cache cannot become stale.
- A `(key, variationIndex)` pair is unique.
- The space glyph is the only bundled glyph allowed to have no strokes.
- Resource format changes require a format-version bump and migration logic.
- Public API changes require README and DocC updates.

## Adding artwork

Use the public `HandDrawnTypeface` JSON schema. Validate new artwork with
`HandDrawnTypeface(data:)`, update expected coverage tests, and inspect it in
`HandDrawnFontDebugView`. Do not add brand or app-specific artwork to the
neutral bundled typeface without explicit approval.
