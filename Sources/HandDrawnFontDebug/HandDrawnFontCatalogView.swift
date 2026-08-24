import HandDrawnFont
import SwiftUI

/// Browses every available glyph key and variation.
public struct HandDrawnFontCatalogView: View {
  private let typeface: HandDrawnTypeface

  public init(typeface: HandDrawnTypeface = .bundled) {
    self.typeface = typeface
  }

  public var body: some View {
    NavigationStack {
      List {
        Section("Characters") {
          ForEach(typeface.characterKeys, id: \.self) { key in
            NavigationLink {
              HandDrawnGlyphInspectorView(key: key, typeface: typeface)
            } label: {
              glyphRow(key: key)
            }
          }
        }

        if !typeface.namedGlyphKeys.isEmpty {
          Section("Named glyphs") {
            ForEach(typeface.namedGlyphKeys, id: \.self) { key in
              NavigationLink {
                HandDrawnGlyphInspectorView(key: key, typeface: typeface)
              } label: {
                glyphRow(key: key)
              }
            }
          }
        }
      }
      .navigationTitle("Glyph catalog")
    }
  }

  private func glyphRow(key: String) -> some View {
    let variations = typeface.variations(for: key)
    return HStack(spacing: 16) {
      if let glyph = variations.first {
        HandDrawnGlyphView(
          glyph,
          targetHeight: 36,
          accessibilityLabel: displayName(for: key)
        )
        .frame(width: 56, alignment: .center)
      }

      VStack(alignment: .leading, spacing: 2) {
        Text(displayName(for: key))
        Text("\(variations.count) variation\(variations.count == 1 ? "" : "s")")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 4)
  }

  private func displayName(for key: String) -> String {
    key == " " ? "space" : key
  }
}
