import HandDrawnFont
import SwiftUI

/// A ready-to-present debug dashboard for the runtime typeface.
///
/// Add the `HandDrawnFontDebug` product only to builds that need inspection UI.
public struct HandDrawnFontDebugView: View {
  @State private var typeface: HandDrawnTypeface

  public init(typeface: HandDrawnTypeface = .bundled) {
    _typeface = State(initialValue: typeface)
  }

  public var body: some View {
    TabView {
      HandDrawnFontPlaygroundView(typeface: $typeface)
        .tabItem {
          Label("Playground", systemImage: "scribble.variable")
        }

      HandDrawnFontCatalogView(typeface: $typeface)
        .tabItem {
          Label("Glyphs", systemImage: "square.grid.2x2")
        }
    }
  }
}

extension View {
  @ViewBuilder
  func handDrawnInlineNavigationTitle() -> some View {
    #if os(iOS)
      navigationBarTitleDisplayMode(.inline)
    #else
      self
    #endif
  }

  @ViewBuilder
  func handDrawnHidesDebugTabBar() -> some View {
    #if os(iOS)
      toolbar(.hidden, for: .tabBar)
    #else
      self
    #endif
  }

  @ViewBuilder
  func handDrawnDisablesScrollClipping() -> some View {
    if #available(iOS 17, macOS 14, *) {
      scrollClipDisabled()
    } else {
      self
    }
  }
}
