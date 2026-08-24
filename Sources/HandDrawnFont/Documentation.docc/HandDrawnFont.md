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
