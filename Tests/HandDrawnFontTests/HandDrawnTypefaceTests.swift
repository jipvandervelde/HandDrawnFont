import XCTest

@testable import HandDrawnFont

final class HandDrawnTypefaceTests: XCTestCase {
  func testBundledTypefaceLoadsAndHasExpectedCoverage() throws {
    let typeface = try HandDrawnTypeface.loadBundled()

    XCTAssertEqual(typeface.version, "1.0.0")
    XCTAssertEqual(typeface.glyphs.count, 179)
    XCTAssertEqual(typeface.characterKeys.count, 46)
    XCTAssertTrue(typeface.namedGlyphKeys.isEmpty)
    XCTAssertEqual(
      Set(typeface.characterKeys),
      Set(Array(" !\"',-.0123456789:=?abcdefghijklmnopqrstuvwxyz").map(String.init))
    )
  }

  func testOnlySpaceHasNoPenStrokes() throws {
    let typeface = try HandDrawnTypeface.loadBundled()
    let emptyGlyphs = typeface.glyphs.filter(\.strokes.isEmpty)

    XCTAssertEqual(emptyGlyphs.count, 1)
    XCTAssertEqual(emptyGlyphs.first?.key, " ")
  }

  func testSingleCharacterLookupIsCaseInsensitive() throws {
    let typeface = try HandDrawnTypeface.loadBundled()

    XCTAssertEqual(typeface.variations(for: "A"), typeface.variations(for: "a"))
    XCTAssertNotNil(typeface.glyph(for: "Z"))
  }

  func testTypefaceDocumentRoundTrips() throws {
    let original = try HandDrawnTypeface.loadBundled()
    let data = try original.encoded(prettyPrinted: false)
    let decoded = try HandDrawnTypeface(data: data)

    XCTAssertEqual(decoded.version, original.version)
    XCTAssertEqual(decoded.glyphs, original.glyphs)
  }

  func testBundledCharacterGuidesShareCanvasPositions() throws {
    let typeface = try HandDrawnTypeface.loadBundled()
    let characterGlyphs = typeface.glyphs.filter { $0.key.count == 1 && $0.key != " " }

    XCTAssertEqual(characterGlyphs.count, 178)
    for glyph in characterGlyphs {
      XCTAssertEqual(glyph.metrics.canvasXHeightY, 0.243_281_25, accuracy: 0.000_000_001)
      XCTAssertEqual(glyph.metrics.canvasBaselineY, 0.729_843_75, accuracy: 0.000_000_001)
    }
  }

  func testDuplicateGlyphIDsAreRejected() throws {
    let original = try HandDrawnTypeface.loadBundled()
    let glyph = try XCTUnwrap(original.glyphs.first)

    XCTAssertThrowsError(
      try HandDrawnTypeface(version: "test", glyphs: [glyph, glyph])
    ) { error in
      guard case HandDrawnFontError.duplicateGlyphID(glyph.id) = error else {
        return XCTFail("Unexpected error: \(error)")
      }
    }
  }

  func testAuthoredGlyphDerivesPaddedBounds() {
    let glyph = HandDrawnGlyph.authored(
      key: "x",
      strokes: [
        HandDrawnStroke(
          points: [
            HandDrawnPoint(x: 0.2, y: 0.3),
            HandDrawnPoint(x: 0.7, y: 0.8),
          ]
        )
      ],
      boundsPadding: 0.05
    )

    XCTAssertEqual(glyph.metrics.boundsX, 0.15, accuracy: 0.000_001)
    XCTAssertEqual(glyph.metrics.boundsY, 0.25, accuracy: 0.000_001)
    XCTAssertEqual(glyph.metrics.boundsWidth, 0.6, accuracy: 0.000_001)
    XCTAssertEqual(glyph.metrics.boundsHeight, 0.6, accuracy: 0.000_001)
    XCTAssertEqual(glyph.metrics.xHeightY, 0, accuracy: 0.000_001)
    XCTAssertEqual(glyph.metrics.baselineY, 0.5, accuracy: 0.000_001)
    XCTAssertEqual(glyph.metrics.canvasXHeightY, 0.25, accuracy: 0.000_001)
    XCTAssertEqual(glyph.metrics.canvasBaselineY, 0.75, accuracy: 0.000_001)
  }

  @MainActor
  func testSeededVariationSelectionIsDeterministic() throws {
    let typeface = try HandDrawnTypeface.loadBundled()
    let first = TextRenderPlanner.make(
      text: "hand drawn",
      typeface: typeface,
      animation: .standard,
      variationSeed: 42
    )
    let second = TextRenderPlanner.make(
      text: "hand drawn",
      typeface: typeface,
      animation: .standard,
      variationSeed: 42
    )

    XCTAssertEqual(first.selectedVariationIDs, second.selectedVariationIDs)
    XCTAssertEqual(first.visibleGlyphCount, 9)
    XCTAssertGreaterThan(first.totalDuration, 0)
  }

  @MainActor
  func testUnsupportedCharactersRemainInRenderPlan() throws {
    let typeface = try HandDrawnTypeface.loadBundled()
    let plan = TextRenderPlanner.make(
      text: "é🙂",
      typeface: typeface,
      animation: .standard,
      variationSeed: 42
    )

    XCTAssertEqual(plan.visibleGlyphCount, 2)
    XCTAssertTrue(plan.selectedVariationIDs.isEmpty)
    XCTAssertEqual(plan.lines.first?.words.first?.characters.count, 2)
  }
}
