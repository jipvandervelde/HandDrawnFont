import HandDrawnFont
import SwiftUI

/// A persistence-free canvas for drawing normalized glyph strokes.
public struct HandDrawnStrokeEditorView: View {
  @Binding private var strokes: [HandDrawnStroke]
  private let baselineY: Double
  private let xHeightY: Double
  private let color: Color
  private let lineWidth: CGFloat

  @State private var currentPoints: [HandDrawnPoint] = []

  public init(
    strokes: Binding<[HandDrawnStroke]>,
    baselineY: Double = 0.75,
    xHeightY: Double = 0.25,
    color: Color = .primary,
    lineWidth: CGFloat = 2
  ) {
    _strokes = strokes
    self.baselineY = baselineY
    self.xHeightY = xHeightY
    self.color = color
    self.lineWidth = lineWidth
  }

  public var body: some View {
    GeometryReader { geometry in
      Canvas { context, size in
        drawGuide(y: xHeightY * size.height, color: .green, size: size, context: &context)
        drawGuide(y: baselineY * size.height, color: .blue, size: size, context: &context)

        for stroke in strokes {
          draw(stroke.points, size: size, context: &context)
        }
        draw(currentPoints, size: size, context: &context)
      }
      .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
      .overlay {
        RoundedRectangle(cornerRadius: 12)
          .strokeBorder(.secondary.opacity(0.25))
      }
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { value in
            appendPoint(value.location, canvasSize: geometry.size)
          }
          .onEnded { _ in
            finishStroke()
          }
      )
    }
    .aspectRatio(3.0 / 4.0, contentMode: .fit)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Hand-drawn glyph canvas")
    .accessibilityHint("Draw with one finger or a pointing device")
  }

  private func appendPoint(_ location: CGPoint, canvasSize: CGSize) {
    guard canvasSize.width > 0, canvasSize.height > 0 else { return }
    let point = HandDrawnPoint(
      x: min(1, max(0, location.x / canvasSize.width)),
      y: min(1, max(0, location.y / canvasSize.height))
    )

    if let previous = currentPoints.last {
      let distance = hypot(point.x - previous.x, point.y - previous.y)
      guard distance >= 0.0015 else { return }
    }
    currentPoints.append(point)
  }

  private func finishStroke() {
    guard currentPoints.count > 1 else {
      currentPoints = []
      return
    }
    strokes.append(HandDrawnStroke(points: currentPoints))
    currentPoints = []
  }

  private func draw(
    _ points: [HandDrawnPoint],
    size: CGSize,
    context: inout GraphicsContext
  ) {
    guard let first = points.first else { return }
    var path = Path()
    path.move(to: CGPoint(x: first.x * size.width, y: first.y * size.height))
    for point in points.dropFirst() {
      path.addLine(to: CGPoint(x: point.x * size.width, y: point.y * size.height))
    }
    context.stroke(
      path,
      with: .color(color),
      style: StrokeStyle(
        lineWidth: max(0.25, lineWidth),
        lineCap: .round,
        lineJoin: .round
      )
    )
  }

  private func drawGuide(
    y: CGFloat,
    color: Color,
    size: CGSize,
    context: inout GraphicsContext
  ) {
    var path = Path()
    path.move(to: CGPoint(x: 0, y: y))
    path.addLine(to: CGPoint(x: size.width, y: y))
    context.stroke(
      path,
      with: .color(color.opacity(0.7)),
      style: StrokeStyle(lineWidth: 1, dash: [5, 4])
    )
  }
}

/// Draws a scratch glyph and returns an immutable runtime value when saved.
public struct HandDrawnGlyphAuthoringView: View {
  private let initialGlyph: HandDrawnGlyph?
  private let onSave: (@MainActor (HandDrawnGlyph) -> Void)?

  @State private var key: String
  @State private var variationIndex: Int
  @State private var strokes: [HandDrawnStroke]
  @State private var baselineY: Double
  @State private var xHeightY: Double
  @State private var savedGlyph: HandDrawnGlyph?
  @State private var animationTrigger = 0

  public init(
    initialGlyph: HandDrawnGlyph? = nil,
    onSave: (@MainActor (HandDrawnGlyph) -> Void)? = nil
  ) {
    self.initialGlyph = initialGlyph
    self.onSave = onSave
    _key = State(initialValue: initialGlyph?.key ?? "a")
    _variationIndex = State(initialValue: initialGlyph?.variationIndex ?? 0)
    _strokes = State(initialValue: initialGlyph?.strokes ?? [])
    _baselineY = State(initialValue: initialGlyph?.metrics.canvasBaselineY ?? 0.75)
    _xHeightY = State(initialValue: initialGlyph?.metrics.canvasXHeightY ?? 0.25)
  }

  public var body: some View {
    NavigationStack {
      Form {
        Section("Glyph") {
          TextField("Key", text: $key)
          Stepper("Variation \(variationIndex)", value: $variationIndex, in: 0...99)
        }

        Section("Draw") {
          HandDrawnStrokeEditorView(
            strokes: $strokes,
            baselineY: baselineY,
            xHeightY: xHeightY
          )

          HStack {
            Button("Undo stroke", systemImage: "arrow.uturn.backward") {
              _ = strokes.popLast()
            }
            .disabled(strokes.isEmpty)

            Spacer()

            Button("Clear", role: .destructive) {
              strokes = []
            }
            .disabled(strokes.isEmpty)
          }
        }

        Section("Guides") {
          VStack(alignment: .leading) {
            Text("X-height: \(xHeightY, format: .number.precision(.fractionLength(2)))")
            Slider(value: $xHeightY, in: 0...1)
          }
          VStack(alignment: .leading) {
            Text("Baseline: \(baselineY, format: .number.precision(.fractionLength(2)))")
            Slider(value: $baselineY, in: 0...1)
          }
        }

        Section("Result") {
          if let savedGlyph {
            AnimatedHandDrawnGlyphView(
              savedGlyph,
              targetHeight: 100,
              animation: .relaxed,
              animationTrigger: animationTrigger,
              accessibilityLabel: key.count == 1 ? key : nil
            )
            .frame(maxWidth: .infinity, minHeight: 130)

            Button("Replay", systemImage: "arrow.counterclockwise") {
              animationTrigger &+= 1
            }
          } else {
            Text("Save a glyph to preview its runtime rendering.")
              .foregroundStyle(.secondary)
          }

          Button("Save glyph", systemImage: "checkmark") {
            save()
          }
          .disabled(key.isEmpty || strokes.isEmpty)
        }
      }
      .navigationTitle("Glyph authoring")
    }
  }

  @MainActor
  private func save() {
    let glyph = HandDrawnGlyph.authored(
      key: key,
      variationIndex: variationIndex,
      strokes: strokes,
      baselineY: baselineY,
      xHeightY: xHeightY
    )
    savedGlyph = glyph
    animationTrigger &+= 1
    onSave?(glyph)
  }
}
