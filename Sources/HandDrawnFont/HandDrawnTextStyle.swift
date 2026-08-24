import SwiftUI

/// Layout and drawing choices for ``HandDrawnText``.
public struct HandDrawnTextStyle: Sendable {
  public var glyphHeight: CGFloat
  public var color: Color
  public var lineWidth: CGFloat
  public var characterSpacing: CGFloat
  public var wordSpacing: CGFloat
  public var lineSpacing: CGFloat
  public var emptyLineHeight: CGFloat
  public var wordVerticalPadding: CGFloat

  public static let standard = HandDrawnTextStyle()

  public init(
    glyphHeight: CGFloat = 28,
    color: Color = .primary,
    lineWidth: CGFloat = 1.5,
    characterSpacing: CGFloat = 3,
    wordSpacing: CGFloat = 10,
    lineSpacing: CGFloat = 12,
    emptyLineHeight: CGFloat = 8,
    wordVerticalPadding: CGFloat = -6
  ) {
    self.glyphHeight = max(1, glyphHeight)
    self.color = color
    self.lineWidth = max(0.25, lineWidth)
    self.characterSpacing = characterSpacing
    self.wordSpacing = wordSpacing
    self.lineSpacing = lineSpacing
    self.emptyLineHeight = max(0, emptyLineHeight)
    self.wordVerticalPadding = wordVerticalPadding
  }
}

/// How ``HandDrawnText`` handles a character missing from the typeface.
public enum HandDrawnMissingGlyphPolicy: Equatable, Sendable {
  /// Render the character with a system font so content is never silently lost.
  case systemFont
  /// Render a visible square placeholder.
  case placeholder
  /// Reserve a small amount of space without showing a character.
  case hidden
}
