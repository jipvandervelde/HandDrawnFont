import HandDrawnFont
import SwiftUI

/// Interactive controls for text, timing, scale, deterministic variations,
/// missing-glyph fallbacks, and replay behavior.
public struct HandDrawnFontPlaygroundView: View {
  @State private var ownedTypeface: HandDrawnTypeface
  private let externalTypeface: Binding<HandDrawnTypeface>?

  @State private var sampleText = "small action move mountain."
  @State private var animates = true
  @State private var animationTrigger = 0
  @State private var glyphHeight = 36.0
  @State private var speedMultiplier = 4.0
  @State private var usesDeterministicVariations = true
  @State private var missingGlyphPolicy = HandDrawnMissingGlyphPolicy.systemFont
  @State private var replayTask: Task<Void, Never>?
  @Environment(\.dismiss) private var dismiss

  public init(typeface: HandDrawnTypeface = .bundled) {
    _ownedTypeface = State(initialValue: typeface)
    externalTypeface = nil
  }

  public init(typeface: Binding<HandDrawnTypeface>) {
    _ownedTypeface = State(initialValue: typeface.wrappedValue)
    externalTypeface = typeface
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
            missingGlyphPolicy: missingGlyphPolicy,
            onAnimationCompleted: scheduleReplay
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

        Section("Font guides") {
          VStack(alignment: .leading, spacing: 8) {
            LabeledContent(
              "Cap height",
              value: capHeightRatio.formatted(.number.precision(.fractionLength(2))) + "×"
            )
            Slider(value: capHeightRatioBinding, in: capHeightRatioRange)
          }

          Text("Sets the font-wide cap-height line relative to the x-height. The drawing canvas updates without moving saved strokes.")
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        Section("Typeface diagnostics") {
          LabeledContent("Version", value: typeface.version)
          LabeledContent("Glyph variations", value: "\(typeface.glyphs.count)")
          LabeledContent("Character keys", value: "\(typeface.characterKeys.count)")
          LabeledContent(
            "Cap-height guide",
            value: typeface.fontGuides.capHeightY.formatted(
              .percent.precision(.fractionLength(1))
            )
          )
          LabeledContent(
            "Pen strokes",
            value: "\(typeface.glyphs.reduce(0) { $0 + $1.strokes.count })"
          )
          LabeledContent(
            "Points",
            value: "\(typeface.glyphs.reduce(0) { $0 + $1.pointCount })"
          )
        }

        Section("HandDrawnFont") {
          Link(destination: URL(string: "https://github.com/jipvandervelde/HandDrawnFont")!) {
            Label("View package on GitHub", systemImage: "arrow.up.right.square")
          }
          Link(destination: URL(string: "https://x.com/jipvandervelde")!) {
            Label("Follow on X", systemImage: "person.crop.circle")
          }
          Link(destination: URL(string: "mailto:hi@ocho.so")!) {
            Label("Send feedback", systemImage: "envelope")
          }
        }
      }
      .navigationTitle("Playground")
      .handDrawnInlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close", systemImage: "xmark") {
            dismiss()
          }
        }
      }
      .onChange(of: animates) { isAnimating in
        if isAnimating {
          animationTrigger &+= 1
        } else {
          replayTask?.cancel()
          replayTask = nil
        }
      }
      .onDisappear {
        replayTask?.cancel()
        replayTask = nil
      }
    }
  }

  private var typeface: HandDrawnTypeface {
    externalTypeface?.wrappedValue ?? ownedTypeface
  }

  private var referenceGlyph: HandDrawnGlyph? {
    typeface.glyphs.first(where: { $0.key != " " }) ?? typeface.glyphs.first
  }

  private var capHeightRatioRange: ClosedRange<Double> {
    guard let referenceGlyph else { return 1.05...2.4 }
    let baseline = referenceGlyph.metrics.canvasBaselineY
    let xHeight = referenceGlyph.metrics.canvasXHeightY
    let bodyHeight = max(0.01, baseline - xHeight)
    let upperBound = max(1.05, min(2.4, (baseline - 0.02) / bodyHeight))
    return 1.05...upperBound
  }

  private var capHeightRatio: Double {
    guard let referenceGlyph else { return 1.38 }
    let baseline = referenceGlyph.metrics.canvasBaselineY
    let xHeight = referenceGlyph.metrics.canvasXHeightY
    let bodyHeight = max(0.01, baseline - xHeight)
    let ratio = (baseline - typeface.fontGuides.capHeightY) / bodyHeight
    return min(capHeightRatioRange.upperBound, max(capHeightRatioRange.lowerBound, ratio))
  }

  private var capHeightRatioBinding: Binding<Double> {
    Binding(
      get: { capHeightRatio },
      set: { newRatio in
        guard let referenceGlyph else { return }
        let baseline = referenceGlyph.metrics.canvasBaselineY
        let xHeight = referenceGlyph.metrics.canvasXHeightY
        let bodyHeight = max(0.01, baseline - xHeight)
        let capHeightY = min(
          xHeight - 0.01,
          max(0.02, baseline - newRatio * bodyHeight)
        )
        updateFontGuides(HandDrawnFontGuides(capHeightY: capHeightY))
      }
    )
  }

  @MainActor
  private func updateFontGuides(_ fontGuides: HandDrawnFontGuides) {
    guard
      let updated = try? HandDrawnTypeface(
        version: typeface.version,
        glyphs: typeface.glyphs,
        fontGuides: fontGuides
      )
    else { return }

    if let externalTypeface {
      externalTypeface.wrappedValue = updated
    } else {
      ownedTypeface = updated
    }
  }

  @MainActor
  private func scheduleReplay() {
    replayTask?.cancel()
    guard animates else { return }

    replayTask = Task { @MainActor in
      try? await Task.sleep(nanoseconds: 1_000_000_000)
      guard !Task.isCancelled, animates else { return }
      animationTrigger &+= 1
    }
  }
}
