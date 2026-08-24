import Foundation

enum PlannedCharacterContent {
  case glyph(HandDrawnGlyph)
  case missing(Character)
}

struct PlannedCharacter: Identifiable {
  let id: Int
  let content: PlannedCharacterContent
  let delay: TimeInterval
  let duration: TimeInterval
}

struct PlannedWord: Identifiable {
  let id: Int
  let characters: [PlannedCharacter]
}

struct PlannedLine: Identifiable {
  let id: Int
  let words: [PlannedWord]
  let isEmpty: Bool
}

struct TextRenderPlan {
  let lines: [PlannedLine]
  let totalDuration: TimeInterval
  let visibleGlyphCount: Int
  let selectedVariationIDs: [Int: UUID]
}

@MainActor
enum TextRenderPlanner {
  static func make(
    text: String,
    typeface: HandDrawnTypeface,
    animation: HandDrawnAnimation,
    variationSeed: UInt64?
  ) -> TextRenderPlan {
    let characters = Array(text)
    var delay: TimeInterval = 0
    var visibleGlyphCount = 0
    var selectedVariationIDs: [Int: UUID] = [:]
    var lines: [PlannedLine] = []
    var currentWords: [PlannedWord] = []
    var currentCharacters: [PlannedCharacter] = []
    var lineIndex = 0
    var wordIndex = 0

    func appendWord() {
      guard !currentCharacters.isEmpty else { return }
      currentWords.append(
        PlannedWord(
          id: currentCharacters.first?.id ?? wordIndex,
          characters: currentCharacters
        )
      )
      currentCharacters = []
      wordIndex += 1
    }

    func appendLine(forceEmpty: Bool = false) {
      appendWord()
      guard !currentWords.isEmpty || forceEmpty else { return }
      lines.append(
        PlannedLine(
          id: lineIndex,
          words: currentWords,
          isEmpty: currentWords.isEmpty
        )
      )
      currentWords = []
      wordIndex = 0
    }

    for (index, character) in characters.enumerated() {
      if character == "\n" {
        appendLine(forceEmpty: true)
        lineIndex += 1
        delay += animation.lineBreakDelay * animation.speedMultiplier
        continue
      }

      if character.isWhitespace {
        appendWord()
        delay += animation.spaceDelay * animation.speedMultiplier
        continue
      }

      visibleGlyphCount += 1
      let variations = typeface.variations(for: character)
      let content: PlannedCharacterContent
      let duration: TimeInterval

      if let glyph = selectVariation(
        from: variations,
        key: String(character).lowercased(),
        characterIndex: index,
        seed: variationSeed
      ) {
        content = .glyph(glyph)
        let renderData = HandDrawnGlyphRenderCache.shared.data(for: glyph)
        duration = animation.duration(forPathLength: renderData.totalLength)
        selectedVariationIDs[index] = glyph.id
      } else {
        content = .missing(character)
        duration = animation.duration(forPathLength: 0)
      }

      currentCharacters.append(
        PlannedCharacter(
          id: index,
          content: content,
          delay: delay,
          duration: duration
        )
      )
      delay += duration
    }

    appendLine()

    return TextRenderPlan(
      lines: lines,
      totalDuration: delay,
      visibleGlyphCount: visibleGlyphCount,
      selectedVariationIDs: selectedVariationIDs
    )
  }

  private static func selectVariation(
    from variations: [HandDrawnGlyph],
    key: String,
    characterIndex: Int,
    seed: UInt64?
  ) -> HandDrawnGlyph? {
    guard !variations.isEmpty else { return nil }
    guard let seed else { return variations.randomElement() }

    var hash = seed ^ UInt64(truncatingIfNeeded: characterIndex)
    for byte in key.utf8 {
      hash ^= UInt64(byte)
      hash &*= 1_099_511_628_211
    }
    return variations[Int(hash % UInt64(variations.count))]
  }
}
