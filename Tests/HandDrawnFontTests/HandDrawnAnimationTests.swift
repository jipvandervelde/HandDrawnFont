import XCTest

@testable import HandDrawnFont

final class HandDrawnAnimationTests: XCTestCase {
  func testDurationClampsAndScales() {
    let animation = HandDrawnAnimation(
      speedMultiplier: 2,
      minimumGlyphDuration: 0.01,
      maximumGlyphDuration: 0.02,
      pathUnitsPerSecond: 100
    )

    XCTAssertEqual(animation.duration(forPathLength: 0), 0.02, accuracy: 0.000_001)
    XCTAssertEqual(animation.duration(forPathLength: 1_000), 0.04, accuracy: 0.000_001)
  }

  func testAutomaticFrameRateDropsForLongText() {
    let animation = HandDrawnAnimation.standard

    XCTAssertEqual(animation.framesPerSecond(forVisibleGlyphCount: 1), 30)
    XCTAssertEqual(animation.framesPerSecond(forVisibleGlyphCount: 40), 15)
    XCTAssertGreaterThan(
      animation.framesPerSecond(forVisibleGlyphCount: 10),
      animation.framesPerSecond(forVisibleGlyphCount: 30)
    )
  }
}
