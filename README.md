# HandDrawnFont

`HandDrawnFont` is a plug-and-play SwiftUI package that renders text from real
handwritten pen strokes. Glyphs are drawn in their original stroke order with
`Canvas` and a single shared `TimelineView` per text view.

See it at [handdrawn.software](https://handdrawn.software), or use the
[browser font forge](https://handdrawn.software/forge/) to download the Grug
Hand TTF family, draw characters or named icons, and export editable JSON plus
an installable TrueType font.

Created by Jip van der Velde and Michel Elings, creators of
[`grug`](https://developer.apple.com/design/awards/) at Ocho. `grug` won the
2026 Apple Design Award for Delight and Fun.

The package includes:

- A bundled lowercase Latin typeface with digits and common punctuation.
- Multiple handwritten variations for most characters.
- Animated and static text rendering.
- Animated and static single-glyph rendering.
- Word wrapping, explicit line breaks, and baseline-aware layout.
- Reduce Motion and semantic accessibility support.
- Deterministic or random variation selection.
- A versioned JSON format for loading custom typefaces.
- An optional debug product with a playground, catalog, variation browser,
  stroke-order preview, metrics inspector, and normalized stroke editor.

There is no database, networking, analytics, app-group, haptic, or host-app
dependency.

## Requirements

- iOS 16 or later
- macOS 13 or later
- Swift 6 toolchain
- SwiftUI

## Install from Git

In Xcode:

1. Open the consuming app project.
2. Choose **File → Add Package Dependencies…**.
3. Paste the package repository URL.
4. Select the `main` branch until the first semantic-versioned release is
   tagged.
5. Add the `HandDrawnFont` product to the app target.
6. Optionally add `HandDrawnFontDebug` for development-only inspection UI.

For a package manifest:

```swift
dependencies: [
    .package(
        url: "https://github.com/jipvandervelde/HandDrawnFont.git",
        branch: "main"
    )
],
targets: [
    .target(
        name: "YourApp",
        dependencies: [
            .product(name: "HandDrawnFont", package: "HandDrawnFont")
        ]
    )
]
```

## Install locally while developing

In Xcode, choose **File → Add Package Dependencies… → Add Local…** and select
this `HandDrawnFont` folder. Do not copy the JSON resource into the consuming
app; Swift Package Manager embeds it automatically.

## Quick start

```swift
import HandDrawnFont
import SwiftUI

struct WelcomeView: View {
    var body: some View {
        HandDrawnText("small action move mountain.")
            .padding()
    }
}
```

`HandDrawnText` animates once when it appears and then switches to the static
renderer. It owns all timing and completion state.

### Static text

```swift
HandDrawnText(
    "always visible.",
    animation: nil
)
```

### Custom appearance and speed

```swift
HandDrawnText(
    "slow stroke show hand.",
    style: HandDrawnTextStyle(
        glyphHeight: 42,
        color: .indigo,
        lineWidth: 2
    ),
    animation: HandDrawnAnimation(speedMultiplier: 5)
)
```

Higher `speedMultiplier` values draw more slowly. `.relaxed` is provided as a
debug-friendly slower preset.

### Replay an animation

```swift
struct ReplayExample: View {
    @State private var replayTrigger = 0

    var body: some View {
        VStack {
            HandDrawnText(
                "draw again.",
                variationSeed: 42,
                animationTrigger: replayTrigger
            )

            Button("Replay") {
                replayTrigger += 1
            }
        }
    }
}
```

Changing `animationTrigger` replays the existing glyph choices. A
`variationSeed` makes choices stable across view reconstruction and app runs.

### Render one glyph

```swift
if let glyph = HandDrawnTypeface.bundled.glyph(for: "a", variationIndex: 1) {
    AnimatedHandDrawnGlyphView(
        glyph,
        targetHeight: 80,
        animation: .relaxed,
        accessibilityLabel: "a"
    )
}
```

For a static glyph, use `HandDrawnGlyphView`.

### Missing characters

The bundled artwork intentionally covers lowercase `a`–`z`, digits, space, and
the following punctuation:

```text
! " ' , - . : = ?
```

Uppercase input uses the corresponding lowercase artwork. Accented characters,
emoji, and other unsupported input use the system font by default instead of
silently disappearing:

```swift
HandDrawnText(
    "hello 🌍",
    missingGlyphPolicy: .systemFont
)
```

`.placeholder` and `.hidden` are also available.

## Debug UI

Add the `HandDrawnFontDebug` product to the consuming app, then present:

```swift
#if DEBUG
import HandDrawnFontDebug

struct FontDebugScreen: View {
    var body: some View {
        HandDrawnFontDebugView()
    }
}
#endif
```

The debug product includes:

- `HandDrawnFontPlaygroundView`
- `HandDrawnFontCatalogView`
- `HandDrawnGlyphInspectorView`
- `HandDrawnGlyphMetricsView`
- `HandDrawnGlyphAuthoringView`
- `HandDrawnStrokeEditorView`

The runtime product never imports the debug product.

## Load a custom typeface

`HandDrawnTypeface` can load the same neutral JSON schema used by the bundled
resource:

```swift
let data = try Data(contentsOf: typefaceURL)
let customTypeface = try HandDrawnTypeface(data: data)

HandDrawnText(
    "custom hand.",
    typeface: customTypeface
)
```

You can create a typeface in code and export it as JSON:

```swift
let typeface = try HandDrawnTypeface(
    version: "1.0.0",
    glyphs: customGlyphs
)
let data = try typeface.encoded()
```

### Glyph metric coordinate space

The version 1 JSON format preserves the original drawing coordinate system.
`boundsX`, `boundsY`, `boundsWidth`, and `boundsHeight` are normalized against
the full glyph canvas. `baselineY` and `xHeightY` are normalized vertical
offsets from `boundsY`, not absolute canvas positions.

Use `metrics.canvasBaselineY` and `metrics.canvasXHeightY` for normalized guide
positions across the complete canvas, or `glyph.canvasBaseline` and
`glyph.canvasXHeight` for their point values. `HandDrawnGlyph.authored(...)`
accepts full-canvas guide positions and stores the correct bounds-relative
offsets automatically.

The debug product also provides a persistence-free authoring canvas. Its save
callback returns a normal `HandDrawnGlyph` that can be combined into a typeface
and encoded:

```swift
HandDrawnGlyphAuthoringView { glyph in
    let typeface = try? HandDrawnTypeface(
        version: "1.0.0",
        glyphs: [glyph]
    )
    let exportData = try? typeface?.encoded()
    // Store or share exportData using the host app's preferred workflow.
}
```

The package deliberately does not choose a database or document-storage system
for authored glyphs.

Custom typefaces may include multi-character named glyph keys. Render those
with `HandDrawnGlyphView(key:typeface:...)` or
`AnimatedHandDrawnGlyphView(key:typeface:...)`; text rendering does not infer
special meaning from punctuation prefixes.

## Public API map

| Need | API |
| --- | --- |
| Animated or static text | `HandDrawnText` |
| Text layout and color | `HandDrawnTextStyle` |
| Timing | `HandDrawnAnimation` |
| Static glyph | `HandDrawnGlyphView` |
| Animated glyph | `AnimatedHandDrawnGlyphView` |
| Bundled/custom collection | `HandDrawnTypeface` |
| Glyph data | `HandDrawnGlyph`, `HandDrawnStroke`, `HandDrawnPoint` |
| Debug dashboard | `HandDrawnFontDebugView` in `HandDrawnFontDebug` |
| Draw custom strokes | `HandDrawnGlyphAuthoringView` in `HandDrawnFontDebug` |

## Instructions for coding agents and LLMs

When integrating this package into an app, follow this exact sequence:

1. Confirm the target is iOS 16+/macOS 13+ and uses SwiftUI.
2. Add the package dependency; do not copy package sources or resources.
3. Link the `HandDrawnFont` product to the exact consuming target.
4. Add `import HandDrawnFont` only in files that use its public types.
5. Start with `HandDrawnText("...")`; do not create a loader, view model,
   database model, timer, or animation date.
6. Use `animation: nil` for static rendering.
7. Use an integer `animationTrigger` to replay.
8. Use `variationSeed` only when stable choices are desired.
9. Add `HandDrawnFontDebug` only when inspection UI is requested, preferably
   behind `#if DEBUG`.
10. Build the consuming target and inspect wrapping, accessibility text,
    Reduce Motion, light mode, and dark mode.

Copyable prompt for a coding agent:

```text
Add the HandDrawnFont Swift package to this SwiftUI target. Use the
HandDrawnFont product, import HandDrawnFont in the relevant view, and render the
requested copy with HandDrawnText. Do not copy the bundled JSON, add SwiftData,
create an animation timer, or manage start dates. Use animationTrigger for
replay and animation: nil for static content. Preserve semantic accessibility
and verify the target builds.
```

Repository-specific instructions for agents are also available in
[`AGENTS.md`](AGENTS.md).

## Performance and accessibility

- A text view uses one timeline rather than one timer per character.
- Parsed glyph paths are cached by immutable glyph ID.
- Frame rate automatically scales from 30 fps for short text toward 15 fps for
  long text, unless explicitly configured.
- Reduce Motion immediately uses the static renderer.
- Custom-drawn text exposes one semantic accessibility label rather than every
  stroke as an accessibility element.
- Missing characters remain visible by default.

## Development

```bash
swift build
swift test
```

The bundled resource is validated by tests for glyph counts, identifiers,
metrics, stroke data, deterministic selection, and JSON round-tripping.

## Release checklist

- Choose and add the license appropriate for both the source code and artwork.
- Run `swift test`.
- Build one iOS consumer in Xcode.
- Tag a semantic version such as `1.0.0`.
