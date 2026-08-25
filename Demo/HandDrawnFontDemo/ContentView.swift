import HandDrawnFont
import HandDrawnFontDebug
import SwiftUI

struct ContentView: View {
  private enum PresentedSheet: String, Identifiable {
    case debugTools

    var id: String { rawValue }
  }

  private let pangram = "the quick brown fox jumps over the lazy dog."
  private let previewGlyphs = Array("abcdefghijklmnopqrstuvwxyz0123456789").map(String.init)

  @State private var animationTrigger = 0
  @State private var presentedSheet: PresentedSheet?

  var body: some View {
    NavigationStack {
      GeometryReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 28) {
            pangramPreview
              .frame(minHeight: max(280, proxy.size.height * 0.46))

            glyphPreview
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(20)
        }
      }
      .navigationTitle("HandDrawnFont")
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button {
            presentedSheet = .debugTools
          } label: {
            Label("Open debug tools", systemImage: "ladybug")
          }
          .accessibilityHint("Shows the bundled font playground, catalog, and drawing tools")
        }
      }
      .sheet(item: $presentedSheet) { _ in
        HandDrawnFontDebugView()
      }
    }
  }

  private var pangramPreview: some View {
    VStack(alignment: .leading, spacing: 18) {
      Spacer(minLength: 0)

      Button {
        animationTrigger += 1
      } label: {
        HandDrawnText(
          pangram,
          style: HandDrawnTextStyle(
            glyphHeight: 48,
            lineWidth: 2.4,
            characterSpacing: 4,
            wordSpacing: 14,
            lineSpacing: 16
          ),
          animation: .relaxed,
          variationSeed: 42,
          animationTrigger: animationTrigger
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("The quick brown fox jumps over the lazy dog")
      .accessibilityHint("Replays the hand-drawn animation")

      Text("Tap the sentence to draw it again.")
        .font(.footnote)
        .foregroundStyle(.secondary)

      Spacer(minLength: 0)
    }
  }

  private var glyphPreview: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Letters and numbers")
        .font(.headline)

      LazyVGrid(
        columns: [GridItem(.adaptive(minimum: 58, maximum: 76), spacing: 10)],
        alignment: .leading,
        spacing: 10
      ) {
        ForEach(previewGlyphs, id: \.self) { glyph in
          HandDrawnText(
            glyph,
            style: HandDrawnTextStyle(
              glyphHeight: 30,
              lineWidth: 1.8
            ),
            animation: nil,
            variationSeed: 42,
            accessibilityText: glyph
          )
          .frame(maxWidth: .infinity, minHeight: 64)
          .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
          .overlay {
            RoundedRectangle(cornerRadius: 14)
              .stroke(.quaternary)
          }
        }
      }
    }
  }
}

#Preview {
  ContentView()
}
