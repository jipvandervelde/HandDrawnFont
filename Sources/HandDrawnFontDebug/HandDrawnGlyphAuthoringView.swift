import Foundation
import HandDrawnFont
import SwiftUI

private enum HandDrawnEditorViewport {
  static let topHeadroomRatio = 0.20
  static let bottomHeadroomRatio = 0.16
  static let totalHeadroomRatio = topHeadroomRatio + bottomHeadroomRatio
}

/// A persistence-free canvas for drawing normalized glyph strokes.
public struct HandDrawnStrokeEditorView: View {
  @Binding private var strokes: [HandDrawnStroke]
  private let baselineY: Double
  private let xHeightY: Double
  private let explicitCapHeightY: Double?
  private let playbackTrigger: Int
  private let color: Color
  private let lineWidth: CGFloat
  private let canvasAspectRatio: CGFloat
  private let placeholderKey: String?
  private let referenceStrokes: [[HandDrawnStroke]]

  @State private var currentPoints: [HandDrawnPoint] = []
  @State private var playbackStart: Date?
  @State private var playbackTask: Task<Void, Never>?
  @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

  public init(
    strokes: Binding<[HandDrawnStroke]>,
    baselineY: Double = 0.75,
    xHeightY: Double = 0.25,
    capHeightY: Double? = nil,
    playbackTrigger: Int = 0,
    color: Color = .primary,
    lineWidth: CGFloat = 2,
    canvasAspectRatio: CGFloat = 3 / 4,
    placeholderKey: String? = nil,
    referenceStrokes: [[HandDrawnStroke]] = []
  ) {
    _strokes = strokes
    self.baselineY = baselineY
    self.xHeightY = xHeightY
    self.explicitCapHeightY = capHeightY
    self.playbackTrigger = playbackTrigger
    self.color = color
    self.lineWidth = lineWidth
    self.canvasAspectRatio = canvasAspectRatio
    self.placeholderKey = placeholderKey
    self.referenceStrokes = referenceStrokes
  }

  public var body: some View {
    GeometryReader { geometry in
      ZStack {
        if let playbackStart, !accessibilityReduceMotion {
          TimelineView(.animation(minimumInterval: 1 / 60)) { timeline in
            strokeCanvas(
              size: geometry.size,
              progress: playbackProgress(at: timeline.date, start: playbackStart)
            )
          }
        } else {
          strokeCanvas(size: geometry.size, progress: nil)
        }
      }
      .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 18))
      .overlay {
        RoundedRectangle(cornerRadius: 18)
          .strokeBorder(.secondary.opacity(0.25))
      }
      .contentShape(Rectangle())
      .allowsHitTesting(playbackStart == nil)
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
    .onChange(of: playbackTrigger) { _ in
      startPlayback()
    }
    .onDisappear {
      playbackTask?.cancel()
      playbackTask = nil
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Hand-drawn glyph canvas")
    .accessibilityHint("Draw with one finger or a pointing device")
  }

  private func strokeCanvas(size: CGSize, progress: Double?) -> some View {
    let canvasGeometry = editorCanvasGeometry(for: size)

    return Canvas { context, _ in
      drawGuide(
        y: canvasGeometry.yPosition(for: resolvedCapHeightY),
        color: .orange,
        size: size,
        context: &context
      )
      drawGuide(
        y: canvasGeometry.yPosition(for: xHeightY),
        color: .green,
        size: size,
        context: &context
      )
      drawGuide(
        y: canvasGeometry.yPosition(for: baselineY),
        color: .blue,
        size: size,
        context: &context
      )

      if progress == nil, strokes.isEmpty, currentPoints.isEmpty {
        drawEmptyState(
          size: size,
          canvasGeometry: canvasGeometry,
          context: &context
        )
      }

      if let progress {
        let strokeCount = max(1, strokes.count)
        for (index, stroke) in strokes.enumerated() {
          let localProgress = min(1, max(0, progress * Double(strokeCount) - Double(index)))
          draw(
            partialPoints(stroke.points, progress: localProgress),
            size: size,
            canvasGeometry: canvasGeometry,
            context: &context
          )
        }
      } else {
        for stroke in strokes {
          draw(
            stroke.points,
            size: size,
            canvasGeometry: canvasGeometry,
            context: &context
          )
        }
        draw(
          currentPoints,
          size: size,
          canvasGeometry: canvasGeometry,
          context: &context
        )
      }
    }
  }

  private var resolvedCapHeightY: Double {
    if let explicitCapHeightY {
      return min(xHeightY - 0.01, max(0, explicitCapHeightY))
    }
    let bodyHeight = max(0, baselineY - xHeightY)
    return max(0.04, xHeightY - bodyHeight * 0.38)
  }

  private func drawEmptyState(
    size: CGSize,
    canvasGeometry: EditorCanvasGeometry,
    context: inout GraphicsContext
  ) {
    if !referenceStrokes.isEmpty {
      for variation in referenceStrokes {
        for stroke in variation {
          draw(
            stroke.points,
            size: size,
            canvasGeometry: canvasGeometry,
            opacity: 0.10,
            context: &context
          )
        }
      }
      return
    }

    guard let placeholderKey, placeholderKey != " ", placeholderKey.count == 1 else {
      return
    }

    let capY = canvasGeometry.yPosition(for: resolvedCapHeightY)
    let baseline = canvasGeometry.yPosition(for: baselineY)
    let guideHeight = max(24, baseline - capY)
    var text = context.resolve(
      Text(placeholderKey)
        .font(.system(size: guideHeight * 0.78, weight: .regular, design: .default))
    )
    text.shading = .color(color.opacity(0.12))
    context.draw(
      text,
      at: CGPoint(x: size.width / 2, y: (capY + baseline) / 2),
      anchor: .center
    )
  }

  private var playbackDuration: TimeInterval {
    let pointCount = strokes.reduce(0) { $0 + $1.points.count }
    return min(2.4, max(0.7, Double(pointCount) * 0.006))
  }

  private func playbackProgress(at date: Date, start: Date) -> Double {
    min(1, max(0, date.timeIntervalSince(start) / playbackDuration))
  }

  private func partialPoints(
    _ points: [HandDrawnPoint],
    progress: Double
  ) -> [HandDrawnPoint] {
    guard points.count > 1, progress > 0 else { return [] }
    guard progress < 1 else { return points }

    let segmentPosition = progress * Double(points.count - 1)
    let completedSegments = Int(segmentPosition.rounded(.down))
    let segmentProgress = segmentPosition - Double(completedSegments)
    var result = Array(points.prefix(completedSegments + 1))

    if completedSegments + 1 < points.count {
      let start = points[completedSegments]
      let end = points[completedSegments + 1]
      result.append(
        HandDrawnPoint(
          x: start.x + (end.x - start.x) * segmentProgress,
          y: start.y + (end.y - start.y) * segmentProgress
        )
      )
    }
    return result
  }

  @MainActor
  private func startPlayback() {
    playbackTask?.cancel()
    guard !strokes.isEmpty, !accessibilityReduceMotion else {
      playbackStart = nil
      return
    }

    playbackStart = Date()
    let duration = playbackDuration
    playbackTask = Task { @MainActor in
      try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
      guard !Task.isCancelled else { return }
      playbackStart = nil
    }
  }

  private func appendPoint(_ location: CGPoint, canvasSize: CGSize) {
    guard canvasSize.width > 0, canvasSize.height > 0 else { return }
    let canvasGeometry = editorCanvasGeometry(for: canvasSize)
    let point = HandDrawnPoint(
      x: min(1, max(0, location.x / canvasSize.width)),
      y: canvasGeometry.normalizedY(for: location.y)
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
    canvasGeometry: EditorCanvasGeometry,
    opacity: Double = 1,
    context: inout GraphicsContext
  ) {
    guard let first = points.first else { return }
    var path = Path()
    path.move(
      to: CGPoint(
        x: first.x * size.width,
        y: canvasGeometry.yPosition(for: first.y)
      )
    )
    for point in points.dropFirst() {
      path.addLine(
        to: CGPoint(
          x: point.x * size.width,
          y: canvasGeometry.yPosition(for: point.y)
        )
      )
    }
    context.stroke(
      path,
      with: .color(color.opacity(opacity)),
      style: StrokeStyle(
        lineWidth: max(0.25, lineWidth),
        lineCap: .round,
        lineJoin: .round
      )
    )
  }

  private func editorCanvasGeometry(for size: CGSize) -> EditorCanvasGeometry {
    EditorCanvasGeometry(size: size, canvasAspectRatio: canvasAspectRatio)
  }

  private struct EditorCanvasGeometry {
    let contentHeight: CGFloat
    let topInset: CGFloat

    init(size: CGSize, canvasAspectRatio: CGFloat) {
      let safeAspectRatio = max(0.01, canvasAspectRatio)
      contentHeight = min(size.height, size.width / safeAspectRatio)
      let availableHeadroom = max(0, size.height - contentHeight)
      topInset = availableHeadroom
        * CGFloat(
          HandDrawnEditorViewport.topHeadroomRatio
            / HandDrawnEditorViewport.totalHeadroomRatio
        )
    }

    func yPosition(for normalizedY: Double) -> CGFloat {
      topInset + CGFloat(normalizedY) * contentHeight
    }

    func normalizedY(for position: CGFloat) -> Double {
      guard contentHeight > 0 else { return 0 }
      return min(1, max(0, Double((position - topInset) / contentHeight)))
    }
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

struct HandDrawnGlyphEditingView: View {
  private struct EditableVariation: Identifiable, Equatable {
    let id: UUID
    var renderID: UUID
    var strokes: [HandDrawnStroke]
    var canvasWidth: Double
    var canvasHeight: Double
    var baselineY: Double
    var xHeightY: Double

    init(glyph: HandDrawnGlyph) {
      id = UUID()
      renderID = UUID()
      strokes = glyph.strokes
      canvasWidth = glyph.canvasWidth
      canvasHeight = glyph.canvasHeight
      baselineY = glyph.metrics.canvasBaselineY
      xHeightY = glyph.metrics.canvasXHeightY
    }
  }

  private let key: String
  private let onSave: @MainActor ([HandDrawnGlyph], HandDrawnFontGuides) -> Void

  // The editor owns an isolated draft. The caller is only mutated from `save()`.
  @State private var draftVariations: [EditableVariation]
  @State private var selectedID: UUID
  @State private var draftFontGuides: HandDrawnFontGuides
  @State private var undoStacks: [UUID: [[HandDrawnStroke]]] = [:]
  @State private var redoStacks: [UUID: [[HandDrawnStroke]]] = [:]
  @State private var playbackTrigger = 0

  @Environment(\.dismiss) private var dismiss

  init(
    key: String,
    initialVariations: [HandDrawnGlyph],
    initialSelectedIndex: Int = 0,
    fontGuides: HandDrawnFontGuides? = nil,
    onSave: @escaping @MainActor ([HandDrawnGlyph], HandDrawnFontGuides) -> Void
  ) {
    self.key = key
    self.onSave = onSave

    let source = initialVariations.isEmpty
      ? [HandDrawnGlyph.authored(key: key, strokes: [])]
      : initialVariations
    let editable = source.map(EditableVariation.init)
    let safeIndex = min(max(0, initialSelectedIndex), editable.count - 1)
    _draftVariations = State(initialValue: editable)
    _selectedID = State(initialValue: editable[safeIndex].id)
    _draftFontGuides = State(
      initialValue: fontGuides ?? .init(
        capHeightY: Self.inferredCapHeightY(for: editable[safeIndex])
      )
    )
  }

  var body: some View {
    VStack(spacing: 0) {
      editorVariationStrip

      GeometryReader { geometry in
        let size = fittedCanvasSize(in: geometry.size)

        HandDrawnStrokeEditorView(
          strokes: selectedStrokes,
          baselineY: selectedVariation?.baselineY ?? 0.75,
          xHeightY: selectedVariation?.xHeightY ?? 0.25,
          capHeightY: draftFontGuides.capHeightY,
          playbackTrigger: playbackTrigger,
          lineWidth: 3,
          canvasAspectRatio: selectedCanvasAspectRatio,
          placeholderKey: key,
          referenceStrokes: referenceVariationStrokes
        )
        .id(selectedID)
        .frame(width: size.width, height: size.height)
        .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
      }
    }
    .navigationTitle(displayName)
    .handDrawnInlineNavigationTitle()
    .handDrawnHidesDebugTabBar()
    .navigationBarBackButtonHidden(true)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      floatingToolbar
        .padding(.horizontal)
        .padding(.bottom, -10)
        .frame(maxWidth: .infinity)
    }
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button {
          discardAndDismiss()
        } label: {
          Label("Back", systemImage: "chevron.left")
            .labelStyle(.iconOnly)
        }
        .accessibilityLabel("Back")
        .accessibilityHint("Discards unsaved drawing changes")
      }

      ToolbarItem(placement: .confirmationAction) {
        Button("Save") {
          save()
        }
        .buttonStyle(.borderedProminent)
        .disabled(!canSave)
      }
    }
  }

  private var editorVariationStrip: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 12) {
        ForEach(Array(draftVariations.enumerated()), id: \.element.id) { index, variation in
          ZStack(alignment: .topTrailing) {
            Button {
              selectedID = variation.id
            } label: {
              HandDrawnVariationThumbnail(
                glyph: glyph(for: variation, variationIndex: index),
                isSelected: selectedID == variation.id,
                size: CGSize(width: 76, height: 82)
              )
            }
            .buttonStyle(.plain)

            if draftVariations.count > 1 {
              Button {
                deleteVariation(id: variation.id)
              } label: {
                Image(systemName: "xmark")
                  .font(.caption.bold())
                  .frame(width: 24, height: 24)
                  .background(.regularMaterial, in: Circle())
              }
              .buttonStyle(.plain)
              .offset(x: 7, y: -7)
              .accessibilityLabel("Delete variation \(index + 1)")
            }
          }
        }

        Button {
          addVariation()
        } label: {
          VStack(spacing: 5) {
            Image(systemName: "plus")
              .font(.title2)
            Text("New")
              .font(.caption)
          }
          .frame(width: 76, height: 82)
          .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 16))
          .overlay {
            RoundedRectangle(cornerRadius: 16)
              .strokeBorder(.secondary.opacity(0.35), style: StrokeStyle(dash: [5]))
          }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add variation")
      }
      .padding(.horizontal)
      .padding(.top, 2)
      .padding(.bottom, 4)
    }
    .handDrawnDisablesScrollClipping()
  }

  private var floatingToolbar: some View {
    HStack(spacing: 10) {
      toolbarButton("Undo", systemImage: "arrow.uturn.backward", isDisabled: !canUndo) {
        undo()
      }
      toolbarButton("Redo", systemImage: "arrow.uturn.forward", isDisabled: !canRedo) {
        redo()
      }

      Divider()
        .frame(height: 24)

      toolbarButton("Clear", systemImage: "trash", isDisabled: selectedStrokes.wrappedValue.isEmpty) {
        selectedStrokes.wrappedValue = []
      }

      Divider()
        .frame(height: 24)

      toolbarButton("Play", systemImage: "play.fill", isDisabled: selectedStrokes.wrappedValue.isEmpty) {
        playbackTrigger &+= 1
      }
    }
    .padding(8)
    .background(.ultraThinMaterial, in: Capsule())
    .overlay {
      Capsule()
        .strokeBorder(.secondary.opacity(0.25))
    }
  }

  private func toolbarButton(
    _ title: String,
    systemImage: String,
    isDisabled: Bool,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Label(title, systemImage: systemImage)
        .labelStyle(.iconOnly)
        .frame(width: 34, height: 34)
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .accessibilityLabel(title)
  }

  private var selectedVariationIndex: Int? {
    draftVariations.firstIndex(where: { $0.id == selectedID })
  }

  private var selectedVariation: EditableVariation? {
    guard let index = selectedVariationIndex else { return nil }
    return draftVariations[index]
  }

  private var referenceVariationStrokes: [[HandDrawnStroke]] {
    draftVariations
      .filter { $0.id != selectedID && !$0.strokes.isEmpty }
      .map(\.strokes)
  }

  private var selectedStrokes: Binding<[HandDrawnStroke]> {
    Binding(
      get: {
        guard let index = selectedVariationIndex else { return [] }
        return draftVariations[index].strokes
      },
      set: { newValue in
        guard let index = selectedVariationIndex else { return }
        let oldValue = draftVariations[index].strokes
        guard oldValue != newValue else { return }
        let id = draftVariations[index].id
        undoStacks[id, default: []].append(oldValue)
        redoStacks[id] = []
        draftVariations[index].strokes = newValue
        draftVariations[index].renderID = UUID()
      }
    )
  }

  private var canUndo: Bool {
    !(undoStacks[selectedID] ?? []).isEmpty
  }

  private var canRedo: Bool {
    !(redoStacks[selectedID] ?? []).isEmpty
  }

  private var canSave: Bool {
    key == " " || draftVariations.allSatisfy { !$0.strokes.isEmpty }
  }

  private func addVariation() {
    let reference = selectedVariation ?? draftVariations[0]
    let blank = HandDrawnGlyph.authored(
      key: key,
      variationIndex: draftVariations.count,
      strokes: [],
      canvasWidth: reference.canvasWidth,
      canvasHeight: reference.canvasHeight,
      baselineY: reference.baselineY,
      xHeightY: reference.xHeightY
    )
    let editable = EditableVariation(glyph: blank)
    draftVariations.append(editable)
    selectedID = editable.id
  }

  private func deleteVariation(id: UUID) {
    guard draftVariations.count > 1,
          let index = draftVariations.firstIndex(where: { $0.id == id })
    else {
      return
    }
    draftVariations.remove(at: index)
    undoStacks[id] = nil
    redoStacks[id] = nil
    if selectedID == id {
      selectedID = draftVariations[min(index, draftVariations.count - 1)].id
    }
  }

  private func undo() {
    guard
      let index = selectedVariationIndex,
      var history = undoStacks[selectedID],
      let previous = history.popLast()
    else { return }

    redoStacks[selectedID, default: []].append(draftVariations[index].strokes)
    undoStacks[selectedID] = history
    draftVariations[index].strokes = previous
    draftVariations[index].renderID = UUID()
  }

  private func redo() {
    guard
      let index = selectedVariationIndex,
      var history = redoStacks[selectedID],
      let next = history.popLast()
    else { return }

    undoStacks[selectedID, default: []].append(draftVariations[index].strokes)
    redoStacks[selectedID] = history
    draftVariations[index].strokes = next
    draftVariations[index].renderID = UUID()
  }

  private func fittedCanvasSize(in available: CGSize) -> CGSize {
    let reference = selectedVariation ?? draftVariations[0]
    let sourceHeightRatio = max(0.1, reference.canvasHeight / max(1, reference.canvasWidth))
    let visibleHeightRatio = sourceHeightRatio + HandDrawnEditorViewport.totalHeadroomRatio
    let aspect = 1 / visibleHeightRatio
    let reservedWidth = max(0, available.width - 24)
    let reservedHeight = max(0, available.height - 24)
    let width = min(reservedWidth, reservedHeight * aspect)
    return CGSize(width: width, height: width / aspect)
  }

  private var selectedCanvasAspectRatio: CGFloat {
    let reference = selectedVariation ?? draftVariations[0]
    return CGFloat(max(0.1, reference.canvasWidth / max(1, reference.canvasHeight)))
  }

  private func glyph(
    for variation: EditableVariation,
    variationIndex: Int
  ) -> HandDrawnGlyph {
    HandDrawnGlyph.authored(
      id: variation.renderID,
      key: key,
      variationIndex: variationIndex,
      strokes: variation.strokes,
      canvasWidth: variation.canvasWidth,
      canvasHeight: variation.canvasHeight,
      baselineY: variation.baselineY,
      xHeightY: variation.xHeightY
    )
  }

  @MainActor
  private func save() {
    let glyphs = draftVariations.enumerated().map { index, variation in
      HandDrawnGlyph.authored(
        key: key,
        variationIndex: index,
        strokes: variation.strokes,
        canvasWidth: variation.canvasWidth,
        canvasHeight: variation.canvasHeight,
        baselineY: variation.baselineY,
        xHeightY: variation.xHeightY
      )
    }
    onSave(glyphs, draftFontGuides)
    dismiss()
  }

  private func discardAndDismiss() {
    // Draft state dies with this view, so the caller keeps its original glyphs.
    dismiss()
  }

  private var displayName: String {
    key == " " ? "space" : key
  }

  private static func inferredCapHeightY(for variation: EditableVariation) -> Double {
    let bodyHeight = max(0, variation.baselineY - variation.xHeightY)
    return max(0.04, variation.xHeightY - bodyHeight * 0.38)
  }
}

/// Draws a glyph without persisting it. Save returns immutable runtime values.
public struct HandDrawnGlyphAuthoringView: View {
  private let initialGlyph: HandDrawnGlyph?
  private let onSave: (@MainActor (HandDrawnGlyph) -> Void)?

  public init(
    initialGlyph: HandDrawnGlyph? = nil,
    onSave: (@MainActor (HandDrawnGlyph) -> Void)? = nil
  ) {
    self.initialGlyph = initialGlyph
    self.onSave = onSave
  }

  public var body: some View {
    let glyph = initialGlyph ?? HandDrawnGlyph.authored(key: "a", strokes: [])

    NavigationStack {
      HandDrawnGlyphEditingView(
        key: glyph.key,
        initialVariations: [glyph]
      ) { glyphs, _ in
        if let savedGlyph = glyphs.first {
          onSave?(savedGlyph)
        }
      }
    }
  }
}
