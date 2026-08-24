import HandDrawnFont
import SwiftUI

/// Shows stroke geometry, baseline, x-height, bounds, and metadata for one key.
public struct HandDrawnGlyphInspectorView: View {
  private let key: String
  private let typeface: HandDrawnTypeface

  @State private var selectedIndex = 0
  @State private var animationTrigger = 0

  public init(key: String, typeface: HandDrawnTypeface = .bundled) {
    self.key = key
    self.typeface = typeface
  }

  public var body: some View {
    let variations = typeface.variations(for: key)

    Form {
      if variations.isEmpty {
        VStack(spacing: 10) {
          Image(systemName: "questionmark.square.dashed")
            .font(.largeTitle)
          Text("Glyph unavailable")
            .font(.headline)
          Text("No glyph exists for \(key).")
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
      } else {
        let safeIndex = min(selectedIndex, variations.count - 1)
        let glyph = variations[safeIndex]

        Section("Rendered") {
          AnimatedHandDrawnGlyphView(
            glyph,
            targetHeight: 110,
            animation: .relaxed,
            animationTrigger: animationTrigger,
            accessibilityLabel: key.count == 1 ? key : nil
          )
          .frame(maxWidth: .infinity, minHeight: 140)

          Button("Replay stroke order", systemImage: "arrow.counterclockwise") {
            animationTrigger &+= 1
          }
        }

        Section("Geometry") {
          HandDrawnGlyphMetricsView(glyph: glyph)
            .frame(maxWidth: .infinity)
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
        }

        if variations.count > 1 {
          Section("Variation") {
            Picker("Variation", selection: $selectedIndex) {
              ForEach(Array(variations.indices), id: \.self) { index in
                Text("\(variations[index].variationIndex)").tag(index)
              }
            }
            .pickerStyle(.segmented)
          }
        }

        Section("Metrics") {
          LabeledContent("Key", value: key == " " ? "space" : key)
          LabeledContent("Variation", value: "\(glyph.variationIndex)")
          LabeledContent("Strokes", value: "\(glyph.strokes.count)")
          LabeledContent("Points", value: "\(glyph.pointCount)")
          LabeledContent(
            "Canvas",
            value: "\(Int(glyph.canvasWidth)) × \(Int(glyph.canvasHeight))"
          )
          LabeledContent("ID", value: glyph.id.uuidString)
        }
      }
    }
    .navigationTitle(key == " " ? "space" : key)
    .onChange(of: selectedIndex) { _ in
      animationTrigger &+= 1
    }
  }
}

/// Raw glyph-coordinate visualization used to audit metrics and source points.
public struct HandDrawnGlyphMetricsView: View {
  public let glyph: HandDrawnGlyph

  public init(glyph: HandDrawnGlyph) {
    self.glyph = glyph
  }

  public var body: some View {
    GeometryReader { geometry in
      let canvasSize = glyph.canvasSize
      let scale = min(
        geometry.size.width / max(canvasSize.width, 1),
        geometry.size.height / max(canvasSize.height, 1)
      )
      let renderedSize = CGSize(
        width: canvasSize.width * scale,
        height: canvasSize.height * scale
      )
      let origin = CGPoint(
        x: (geometry.size.width - renderedSize.width) / 2,
        y: (geometry.size.height - renderedSize.height) / 2
      )

      Canvas { context, _ in
        let transform = CGAffineTransform(
          a: scale,
          b: 0,
          c: 0,
          d: scale,
          tx: origin.x,
          ty: origin.y
        )

        drawGuide(
          y: glyph.xHeight,
          color: .green,
          canvasSize: canvasSize,
          transform: transform,
          context: &context
        )
        drawGuide(
          y: glyph.baseline,
          color: .blue,
          canvasSize: canvasSize,
          transform: transform,
          context: &context
        )

        let boundsPath = Path(glyph.bounds).applying(transform)
        context.stroke(
          boundsPath,
          with: .color(.orange),
          style: StrokeStyle(lineWidth: 1, dash: [5, 4])
        )

        for stroke in glyph.strokes {
          var path = Path()
          let points = stroke.points.map {
            CGPoint(
              x: $0.x * canvasSize.width,
              y: $0.y * canvasSize.height
            )
          }
          guard let first = points.first else { continue }
          path.move(to: first)
          for point in points.dropFirst() {
            path.addLine(to: point)
          }
          context.stroke(
            path.applying(transform),
            with: .foreground,
            style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .round)
          )
        }
      }
      .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Glyph geometry for \(glyph.key)")
  }

  private func drawGuide(
    y: CGFloat,
    color: Color,
    canvasSize: CGSize,
    transform: CGAffineTransform,
    context: inout GraphicsContext
  ) {
    var path = Path()
    path.move(to: CGPoint(x: 0, y: y))
    path.addLine(to: CGPoint(x: canvasSize.width, y: y))
    context.stroke(
      path.applying(transform),
      with: .color(color.opacity(0.8)),
      style: StrokeStyle(lineWidth: 1, dash: [4, 3])
    )
  }
}
