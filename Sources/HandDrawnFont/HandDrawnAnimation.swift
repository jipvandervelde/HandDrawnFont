import Foundation

/// Timing configuration for stroke-by-stroke drawing.
public struct HandDrawnAnimation: Equatable, Sendable {
  public var initialDelay: TimeInterval
  public var speedMultiplier: Double
  public var minimumGlyphDuration: TimeInterval
  public var maximumGlyphDuration: TimeInterval
  public var pathUnitsPerSecond: Double
  public var spaceDelay: TimeInterval
  public var lineBreakDelay: TimeInterval
  public var framesPerSecond: Double?

  /// Matches the quick handwritten animation used by the source artwork.
  public static let standard = HandDrawnAnimation()

  /// A slower preset that makes each pen stroke easier to inspect.
  public static let relaxed = HandDrawnAnimation(speedMultiplier: 4)

  public init(
    initialDelay: TimeInterval = 0,
    speedMultiplier: Double = 1,
    minimumGlyphDuration: TimeInterval = 0.008,
    maximumGlyphDuration: TimeInterval = 0.018,
    pathUnitsPerSecond: Double = 12_000,
    spaceDelay: TimeInterval = 0.008,
    lineBreakDelay: TimeInterval = 0.012,
    framesPerSecond: Double? = nil
  ) {
    self.initialDelay = max(0, initialDelay)
    self.speedMultiplier = max(0.1, speedMultiplier)
    self.minimumGlyphDuration = max(0.001, minimumGlyphDuration)
    self.maximumGlyphDuration = max(self.minimumGlyphDuration, maximumGlyphDuration)
    self.pathUnitsPerSecond = max(1, pathUnitsPerSecond)
    self.spaceDelay = max(0, spaceDelay)
    self.lineBreakDelay = max(0, lineBreakDelay)
    self.framesPerSecond = framesPerSecond.map { min(60, max(1, $0)) }
  }

  func duration(forPathLength pathLength: Double) -> TimeInterval {
    let unscaled = min(
      maximumGlyphDuration,
      max(minimumGlyphDuration, pathLength / pathUnitsPerSecond)
    )
    return unscaled * speedMultiplier
  }

  func framesPerSecond(forVisibleGlyphCount count: Int) -> Double {
    if let framesPerSecond {
      return framesPerSecond
    }
    if count <= 5 { return 30 }
    if count >= 40 { return 15 }
    let progress = Double(count - 5) / 35
    return 30 - (progress * 15)
  }
}
