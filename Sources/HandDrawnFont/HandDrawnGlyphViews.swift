import SwiftUI

private struct HandDrawnGlyphAccessibilityModifier: ViewModifier {
  let label: String?

  func body(content: Content) -> some View {
    if let label, !label.isEmpty {
      content
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    } else {
      content.accessibilityHidden(true)
    }
  }
}

/// Renders one glyph without animation.
public struct HandDrawnGlyphView: View {
  private let glyph: HandDrawnGlyph?
  private let unresolvedKey: String?
  private let targetHeight: CGFloat
  private let color: Color
  private let lineWidth: CGFloat
  private let accessibilityLabel: String?

  public init(
    _ glyph: HandDrawnGlyph,
    targetHeight: CGFloat = 28,
    color: Color = .primary,
    lineWidth: CGFloat = 1.5,
    accessibilityLabel: String? = nil
  ) {
    self.glyph = glyph
    self.unresolvedKey = nil
    self.targetHeight = targetHeight
    self.color = color
    self.lineWidth = lineWidth
    self.accessibilityLabel = accessibilityLabel
  }

  public init(
    key: String,
    typeface: HandDrawnTypeface = .bundled,
    variationIndex: Int = 0,
    targetHeight: CGFloat = 28,
    color: Color = .primary,
    lineWidth: CGFloat = 1.5,
    accessibilityLabel: String? = nil
  ) {
    self.glyph = typeface.glyph(for: key, variationIndex: variationIndex)
    self.unresolvedKey = key
    self.targetHeight = targetHeight
    self.color = color
    self.lineWidth = lineWidth
    self.accessibilityLabel = accessibilityLabel
  }

  public var body: some View {
    Group {
      if let glyph {
        HandDrawnGlyphCanvas(
          glyph: glyph,
          targetHeight: max(1, targetHeight),
          color: color,
          lineWidth: max(0.25, lineWidth),
          progress: 1
        )
      } else {
        Text(unresolvedKey ?? "")
          .font(.system(size: max(1, targetHeight * 0.65)))
          .foregroundStyle(color.opacity(0.45))
          .frame(height: max(1, targetHeight * 1.2))
      }
    }
    .modifier(
      HandDrawnGlyphAccessibilityModifier(
        label: resolvedAccessibilityLabel
      )
    )
  }

  private var resolvedAccessibilityLabel: String? {
    if let accessibilityLabel {
      return accessibilityLabel
    }
    guard let key = glyph?.key, key.count == 1 else {
      return nil
    }
    return key
  }
}

/// Renders one glyph from start to finish using its original stroke order.
public struct AnimatedHandDrawnGlyphView: View {
  private let glyph: HandDrawnGlyph?
  private let unresolvedKey: String?
  private let targetHeight: CGFloat
  private let color: Color
  private let lineWidth: CGFloat
  private let animation: HandDrawnAnimation
  private let animationTrigger: Int
  private let accessibilityLabel: String?
  private let onAnimationCompleted: (@MainActor () -> Void)?

  @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
  @State private var startTime: Date?
  @State private var isComplete = false
  @State private var completionTask: Task<Void, Never>?

  public init(
    _ glyph: HandDrawnGlyph,
    targetHeight: CGFloat = 28,
    color: Color = .primary,
    lineWidth: CGFloat = 1.5,
    animation: HandDrawnAnimation = .standard,
    animationTrigger: Int = 0,
    accessibilityLabel: String? = nil,
    onAnimationCompleted: (@MainActor () -> Void)? = nil
  ) {
    self.glyph = glyph
    self.unresolvedKey = nil
    self.targetHeight = targetHeight
    self.color = color
    self.lineWidth = lineWidth
    self.animation = animation
    self.animationTrigger = animationTrigger
    self.accessibilityLabel = accessibilityLabel
    self.onAnimationCompleted = onAnimationCompleted
  }

  public init(
    key: String,
    typeface: HandDrawnTypeface = .bundled,
    variationIndex: Int = 0,
    targetHeight: CGFloat = 28,
    color: Color = .primary,
    lineWidth: CGFloat = 1.5,
    animation: HandDrawnAnimation = .standard,
    animationTrigger: Int = 0,
    accessibilityLabel: String? = nil,
    onAnimationCompleted: (@MainActor () -> Void)? = nil
  ) {
    self.glyph = typeface.glyph(for: key, variationIndex: variationIndex)
    self.unresolvedKey = key
    self.targetHeight = targetHeight
    self.color = color
    self.lineWidth = lineWidth
    self.animation = animation
    self.animationTrigger = animationTrigger
    self.accessibilityLabel = accessibilityLabel
    self.onAnimationCompleted = onAnimationCompleted
  }

  public var body: some View {
    Group {
      if let glyph {
        if isComplete || accessibilityReduceMotion {
          glyphCanvas(glyph, progress: 1)
        } else if let startTime {
          TimelineView(
            .animation(
              minimumInterval: max(
                1 / animation.framesPerSecond(forVisibleGlyphCount: 1),
                1 / 60
              )
            )
          ) { context in
            glyphCanvas(
              glyph,
              progress: progress(at: context.date, glyph: glyph, startTime: startTime)
            )
          }
        } else {
          glyphCanvas(glyph, progress: 0)
        }
      } else {
        Text(unresolvedKey ?? "")
          .font(.system(size: max(1, targetHeight * 0.65)))
          .foregroundStyle(color.opacity(0.45))
          .frame(height: max(1, targetHeight * 1.2))
      }
    }
    .modifier(HandDrawnGlyphAccessibilityModifier(label: resolvedAccessibilityLabel))
    .onAppear(perform: restart)
    .onChange(of: animationTrigger) { _ in restart() }
    .onChange(of: accessibilityReduceMotion) { _ in restart() }
    .onDisappear {
      completionTask?.cancel()
      completionTask = nil
    }
  }

  private var resolvedAccessibilityLabel: String? {
    if let accessibilityLabel {
      return accessibilityLabel
    }
    guard let key = glyph?.key, key.count == 1 else {
      return nil
    }
    return key
  }

  private func glyphCanvas(_ glyph: HandDrawnGlyph, progress: Double) -> some View {
    HandDrawnGlyphCanvas(
      glyph: glyph,
      targetHeight: max(1, targetHeight),
      color: color,
      lineWidth: max(0.25, lineWidth),
      progress: progress
    )
  }

  private func progress(at date: Date, glyph: HandDrawnGlyph, startTime: Date) -> Double {
    let elapsed = date.timeIntervalSince(startTime) - animation.initialDelay
    guard elapsed > 0 else { return 0 }
    return min(1, elapsed / max(0.001, duration(for: glyph)))
  }

  private func duration(for glyph: HandDrawnGlyph) -> TimeInterval {
    let renderData = HandDrawnGlyphRenderCache.shared.data(for: glyph)
    return animation.duration(forPathLength: renderData.totalLength)
  }

  @MainActor
  private func restart() {
    completionTask?.cancel()
    completionTask = nil

    guard let glyph, !accessibilityReduceMotion else {
      startTime = nil
      isComplete = true
      return
    }

    startTime = Date()
    isComplete = false
    let totalDuration = animation.initialDelay + duration(for: glyph)
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
