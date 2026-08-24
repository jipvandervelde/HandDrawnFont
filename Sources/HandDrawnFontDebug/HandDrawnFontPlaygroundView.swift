import HandDrawnFont
import SwiftUI

/// Interactive controls for text, timing, scale, deterministic variations,
/// missing-glyph fallbacks, and replay behavior.
public struct HandDrawnFontPlaygroundView: View {
  private let typeface: HandDrawnTypeface

  @State private var sampleText = "small action move mountain."
  @State private var animates = true
  @State private var animationTrigger = 0
  @State private var glyphHeight = 36.0
  @State private var speedMultiplier = 4.0
  @State private var usesDeterministicVariations = true
  @State private var missingGlyphPolicy = HandDrawnMissingGlyphPolicy.systemFont

  public init(typeface: HandDrawnTypeface = .bundled) {
    self.typeface = typeface
  }

  public var body: some View {
    NavigationStack {
      Form {
        Section("Preview") {
          HandDrawnText(
            sampleText,
            typeface: typeface,
            style: HandDrawnTextStyle(glyphHeight: glyphHeight),
            animation: animates
              ? HandDrawnAnimation(
                speedMultiplier: speedMultiplier
              ) : nil,
            variationSeed: usesDeterministicVariations ? 42 : nil,
            animationTrigger: animationTrigger,
            missingGlyphPolicy: missingGlyphPolicy
          )
          .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
          .padding(.vertical, 12)

          Button("Replay animation", systemImage: "arrow.counterclockwise") {
            animationTrigger &+= 1
          }
          .disabled(!animates)
        }

        Section("Text") {
          TextField("Sample text", text: $sampleText, axis: .vertical)
            .lineLimit(2...6)
        }

        Section("Rendering") {
          Toggle("Animate strokes", isOn: $animates)
          Toggle("Deterministic variations", isOn: $usesDeterministicVariations)

          VStack(alignment: .leading) {
            Text("Glyph height: \(glyphHeight, format: .number.precision(.fractionLength(0)))")
            Slider(value: $glyphHeight, in: 16...96, step: 1)
          }

          VStack(alignment: .leading) {
            Text(
              "Speed multiplier: \(speedMultiplier, format: .number.precision(.fractionLength(1)))×"
            )
            Text("Higher values draw more slowly.")
              .font(.caption)
              .foregroundStyle(.secondary)
            Slider(value: $speedMultiplier, in: 0.5...12, step: 0.5)
          }

          Picker("Missing glyph", selection: $missingGlyphPolicy) {
            Text("System font").tag(HandDrawnMissingGlyphPolicy.systemFont)
            Text("Placeholder").tag(HandDrawnMissingGlyphPolicy.placeholder)
            Text("Hidden").tag(HandDrawnMissingGlyphPolicy.hidden)
          }
        }

        Section("Typeface diagnostics") {
          LabeledContent("Version", value: typeface.version)
          LabeledContent("Glyph variations", value: "\(typeface.glyphs.count)")
          LabeledContent("Character keys", value: "\(typeface.characterKeys.count)")
          LabeledContent(
            "Pen strokes",
            value: "\(typeface.glyphs.reduce(0) { $0 + $1.strokes.count })"
          )
          LabeledContent(
            "Points",
            value: "\(typeface.glyphs.reduce(0) { $0 + $1.pointCount })"
          )
        }
      }
      .navigationTitle("Font playground")
    }
  }
}
