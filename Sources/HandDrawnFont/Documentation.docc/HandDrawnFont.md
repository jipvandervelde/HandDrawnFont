# ``HandDrawnFont``

Render SwiftUI text from real handwritten stroke geometry.

## Overview

Use ``HandDrawnText`` for the common path:

```swift
HandDrawnText("small action move mountain.")
```

The view loads ``HandDrawnTypeface/bundled``, selects a handwritten variation
for each supported character, lays words out across available width, and draws
all strokes on a shared timeline. It automatically becomes static when playback
finishes or Reduce Motion is enabled.

Use ``HandDrawnGlyphView`` and ``AnimatedHandDrawnGlyphView`` for individual
glyphs. Use ``HandDrawnTypeface/init(data:)`` to load custom artwork.

## Glyph metrics

The version 1 JSON format stores glyph bounds in the normalized full-canvas
coordinate space. ``HandDrawnGlyphMetrics/baselineY`` and
``HandDrawnGlyphMetrics/xHeightY`` are normalized offsets from the top of those
bounds. Use ``HandDrawnGlyphMetrics/canvasBaselineY`` and
``HandDrawnGlyphMetrics/canvasXHeightY`` when placing guides in the complete
canvas.

## Topics

### Text

- ``HandDrawnText``
- ``HandDrawnTextStyle``
- ``HandDrawnAnimation``
- ``HandDrawnMissingGlyphPolicy``

### Glyphs

- ``HandDrawnGlyphView``
- ``AnimatedHandDrawnGlyphView``
- ``HandDrawnGlyph``
- ``HandDrawnStroke``
- ``HandDrawnPoint``
- ``HandDrawnGlyphMetrics``

### Typefaces

- ``HandDrawnTypeface``
- ``HandDrawnFontError``
