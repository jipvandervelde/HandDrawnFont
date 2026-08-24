import SwiftUI
import XCTest

@testable import HandDrawnFont

final class HandDrawnViewSmokeTests: XCTestCase {
  @MainActor
  func testStaticTextProducesAnImage() {
    let view = HandDrawnText(
      "hand drawn font.",
      animation: nil,
      variationSeed: 42
    )
    .frame(width: 320, height: 120, alignment: .topLeading)
    .padding()

    let renderer = ImageRenderer(content: view)
    renderer.scale = 1

    XCTAssertNotNil(renderer.cgImage)
  }

  @MainActor
  func testSingleGlyphProducesAnImage() throws {
    let glyph = try XCTUnwrap(HandDrawnTypeface.bundled.glyph(for: "a"))
    let renderer = ImageRenderer(
      content: HandDrawnGlyphView(glyph, targetHeight: 80)
        .padding()
    )
    renderer.scale = 1

    XCTAssertNotNil(renderer.cgImage)
  }
}
