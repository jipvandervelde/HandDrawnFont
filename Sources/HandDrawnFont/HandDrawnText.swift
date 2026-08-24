import SwiftUI

private struct HandDrawnTextAccessibilityModifier: ViewModifier {
  let label: String
  let isHidden: Bool

  func body(content: Content) -> some View {
    if isHidden || label.isEmpty {
      content.accessibilityHidden(true)
    } else {
      content
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
  }
}

/// Displays a string using the bundled handwritten stroke typeface.
///
/// The view owns its playback state. Change `animationTrigger` to replay the
/// same selected glyph variations without managing dates or completion state.
public struct HandDrawnText: View {
  public let text: String
  public let typeface: HandDrawnTypeface
  public let style: HandDrawnTextStyle
  public let animation: HandDrawnAnimation?
  public let variationSeed: UInt64?
  public let animationTrigger: Int
  public let missingGlyphPolicy: HandDrawnMissingGlyphPolicy
  public let accessibilityText: String?
  public let isAccessibilityHidden: Bool
  public let onVariationMapCreated: (@MainActor ([Int: UUID]) -> Void)?
  public let onAnimationCompleted: (@MainActor () -> Void)?

  @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
  @State private var renderPlan: TextRenderPlan?
  @State private var animationStartTime: Date?
  @State private var isComplete = false
  @State private var completionTask: Task<Void, Never>?

  public init(
    _ text: String,
    typeface: HandDrawnTypeface = .bundled,
    style: HandDrawnTextStyle = .standard,
    animation: HandDrawnAnimation? = .standard,
    variationSeed: UInt64? = nil,
    animationTrigger: Int = 0,
    missingGlyphPolicy: HandDrawnMissingGlyphPolicy = .systemFont,
    accessibilityText: String? = nil,
    isAccessibilityHidden: Bool = false,
    onVariationMapCreated: (@MainActor ([Int: UUID]) -> Void)? = nil,
    onAnimationCompleted: (@MainActor () -> Void)? = nil
  ) {
    self.text = text
    self.typeface = typeface
    self.style = style
    self.animation = animation
    self.variationSeed = variationSeed
    self.animationTrigger = animationTrigger
    self.missingGlyphPolicy = missingGlyphPolicy
    self.accessibilityText = accessibilityText
    self.isAccessibilityHidden = isAccessibilityHidden
    self.onVariationMapCreated = onVariationMapCreated
    self.onAnimationCompleted = onAnimationCompleted
  }

  public var body: some View {
    playbackContent
      .modifier(
        HandDrawnTextAccessibilityModifier(
          label: (accessibilityText ?? text).trimmingCharacters(in: .whitespacesAndNewlines),
          isHidden: isAccessibilityHidden
        )
      )
      .onAppear {
        prepareAndStart()
      }
      .onChange(of: text) { _ in prepareAndStart() }
      .onChange(of: variationSeed) { _ in prepareAndStart() }
      .onChange(of: animation) { _ in prepareAndStart() }
      .onChange(of: typeface.glyphs.map(\.id)) { _ in prepareAndStart() }
      .onChange(of: animationTrigger) { _ in restartExistingPlan() }
      .onChange(of: accessibilityReduceMotion) { _ in restartExistingPlan() }
      .onDisappear {
        completionTask?.cancel()
        completionTask = nil
      }
  }

  @ViewBuilder
  private var playbackContent: some View {
    Group {
      if let renderPlan {
        if shouldRenderStatic {
          renderedContent(plan: renderPlan, date: nil)
        } else if let animation, animationStartTime != nil {
          TimelineView(
            .animation(
              minimumInterval: max(
                1
                  / animation.framesPerSecond(
                    forVisibleGlyphCount: renderPlan.visibleGlyphCount
                  ),
                1 / 60
              )
            )
          ) { context in
            renderedContent(plan: renderPlan, date: context.date)
          }
        } else {
          renderedContent(plan: renderPlan, date: nil)
        }
      } else {
        Color.clear.frame(height: style.glyphHeight * 1.2)
      }
    }
  }

  private var shouldRenderStatic: Bool {
    isComplete || animation == nil || accessibilityReduceMotion
  }

  @ViewBuilder
  private func renderedContent(plan: TextRenderPlan, date: Date?) -> some View {
    VStack(alignment: .leading, spacing: style.lineSpacing) {
      ForEach(plan.lines) { line in
        if line.isEmpty {
          Spacer().frame(height: style.emptyLineHeight)
        } else {
          HandDrawnWordFlowLayout(spacing: style.wordSpacing) {
            ForEach(line.words) { word in
              HStack(spacing: style.characterSpacing) {
                ForEach(word.characters) { character in
                  renderedCharacter(character, date: date)
                }
              }
              .padding(.vertical, style.wordVerticalPadding)
            }
          }
        }
      }
    }
  }

  @ViewBuilder
  private func renderedCharacter(_ character: PlannedCharacter, date: Date?) -> some View {
    let progress = characterProgress(character, date: date)

    switch character.content {
    case .glyph(let glyph):
      HandDrawnGlyphCanvas(
        glyph: glyph,
        targetHeight: style.glyphHeight,
        color: style.color,
        lineWidth: style.lineWidth,
        progress: progress
      )
      .accessibilityHidden(true)

    case .missing(let value):
      switch missingGlyphPolicy {
      case .systemFont:
        Text(String(value))
          .font(.system(size: style.glyphHeight * 0.8))
          .foregroundStyle(style.color)
          .frame(minHeight: style.glyphHeight * 1.2)
          .opacity(progress > 0 ? 1 : 0)
          .accessibilityHidden(true)
      case .placeholder:
        Text("□")
          .font(.system(size: style.glyphHeight * 0.75))
          .foregroundStyle(style.color.opacity(0.6))
          .frame(minHeight: style.glyphHeight * 1.2)
          .opacity(progress > 0 ? 1 : 0)
          .accessibilityHidden(true)
      case .hidden:
        Color.clear
          .frame(width: style.glyphHeight * 0.35, height: style.glyphHeight * 1.2)
          .accessibilityHidden(true)
      }
    }
  }

  private func characterProgress(_ character: PlannedCharacter, date: Date?) -> Double {
    guard let date,
      let animation,
      let animationStartTime,
      !accessibilityReduceMotion
    else {
      return 1
    }

    let elapsed =
      date.timeIntervalSince(animationStartTime)
      - animation.initialDelay
      - character.delay
    guard elapsed > 0 else { return 0 }
    return min(1, elapsed / max(0.001, character.duration))
  }

  @MainActor
  private func prepareAndStart() {
    completionTask?.cancel()
    let timing = animation ?? .standard
    let plan = TextRenderPlanner.make(
      text: text,
      typeface: typeface,
      animation: timing,
      variationSeed: variationSeed
    )
    renderPlan = plan
    onVariationMapCreated?(plan.selectedVariationIDs)
    start(plan: plan)
  }

  @MainActor
  private func restartExistingPlan() {
    guard let renderPlan else {
      prepareAndStart()
      return
    }
    start(plan: renderPlan)
  }

  @MainActor
  private func start(plan: TextRenderPlan) {
    completionTask?.cancel()
    completionTask = nil

    guard let animation, !accessibilityReduceMotion else {
      animationStartTime = nil
      isComplete = true
      return
    }

    animationStartTime = Date()
    isComplete = false
    let totalDuration = animation.initialDelay + plan.totalDuration
    completionTask = Task { @MainActor in
      try? await Task.sleep(
        nanoseconds: UInt64(max(0, totalDuration) * 1_000_000_000)
      )
      guard !Task.isCancelled else { return }
      isComplete = true
      onAnimationCompleted?()
    }
  }
}
