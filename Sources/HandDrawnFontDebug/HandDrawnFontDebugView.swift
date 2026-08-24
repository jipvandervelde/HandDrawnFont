import HandDrawnFont
import SwiftUI

/// A ready-to-present debug dashboard for the runtime typeface.
///
/// Add the `HandDrawnFontDebug` product only to builds that need inspection UI.
public struct HandDrawnFontDebugView: View {
  private let typeface: HandDrawnTypeface

  public init(typeface: HandDrawnTypeface = .bundled) {
    self.typeface = typeface
  }

  public var body: some View {
    TabView {
      HandDrawnFontPlaygroundView(typeface: typeface)
        .tabItem {
          Label("Playground", systemImage: "scribble.variable")
        }

      HandDrawnFontCatalogView(typeface: typeface)
        .tabItem {
          Label("Glyphs", systemImage: "square.grid.2x2")
        }

      HandDrawnGlyphAuthoringView()
        .tabItem {
          Label("Draw", systemImage: "pencil.and.outline")
        }
    }
  }
}
