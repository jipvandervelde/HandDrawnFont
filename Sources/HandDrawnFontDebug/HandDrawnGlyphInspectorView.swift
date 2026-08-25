import HandDrawnFont
import SwiftUI

/// Shows a glyph's variations and opens its full-height drawing editor.
public struct HandDrawnGlyphInspectorView: View {
  private let key: String
  @State private var ownedTypeface: HandDrawnTypeface
  private let externalTypeface: Binding<HandDrawnTypeface>?

  @State private var selectedIndex = 0
  @State private var isPresentingNewVariation = false
  @State private var isConfirmingGlyphDeletion = false
  @State private var presentedError: String?

  @Environment(\.dismiss) private var dismiss

  public init(key: String, typeface: HandDrawnTypeface = .bundled) {
    self.key = key
    _ownedTypeface = State(initialValue: typeface)
    externalTypeface = nil
  }

  public init(key: String, typeface: Binding<HandDrawnTypeface>) {
    self.key = key
    _ownedTypeface = State(initialValue: typeface.wrappedValue)
    externalTypeface = typeface
  }

  public var body: some View {
    let binding = externalTypeface ?? $ownedTypeface
    HandDrawnGlyphInspectorContent(
      key: key,
      typeface: binding,
      selectedIndex: $selectedIndex,
      isPresentingNewVariation: $isPresentingNewVariation,
      isConfirmingGlyphDeletion: $isConfirmingGlyphDeletion,
      presentedError: $presentedError,
      dismiss: dismiss
    )
  }
}

private struct HandDrawnGlyphInspectorContent: View {
  let key: String
  @Binding var typeface: HandDrawnTypeface
  @Binding var selectedIndex: Int
  @Binding var isPresentingNewVariation: Bool
  @Binding var isConfirmingGlyphDeletion: Bool
  @Binding var presentedError: String?
  let dismiss: DismissAction

  var body: some View {
    let variations = typeface.variations(for: key)

    ScrollView {
      if !variations.isEmpty {
        VStack(alignment: .leading, spacing: 28) {
          variationStrip(variations: variations)
          metadata(variations: variations)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
      } else {
        VStack(spacing: 12) {
          Image(systemName: "questionmark.square.dashed")
            .font(.largeTitle)
          Text("Glyph unavailable")
            .font(.headline)
          Text("This glyph has no drawings.")
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
      }
    }
    .navigationTitle(displayName)
    .handDrawnInlineNavigationTitle()
    .handDrawnHidesDebugTabBar()
    .navigationDestination(isPresented: $isPresentingNewVariation) {
      editor(
        variations: variations + [blankVariation(after: variations.last)],
        selectedIndex: variations.count
      )
    }
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Menu {
          Button("Add variation", systemImage: "plus") {
            isPresentingNewVariation = true
          }

          Button("Delete glyph", systemImage: "trash", role: .destructive) {
            isConfirmingGlyphDeletion = true
          }
        } label: {
          Label("Glyph actions", systemImage: "ellipsis.circle")
        }
      }
    }
    .confirmationDialog(
      "Delete \(displayName)?",
      isPresented: $isConfirmingGlyphDeletion,
      titleVisibility: .visible
    ) {
      Button("Delete glyph", role: .destructive) {
        deleteGlyph()
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("This removes every variation of the glyph from the in-memory font.")
    }
    .alert(
      "Unable to update glyph",
      isPresented: Binding(
        get: { presentedError != nil },
        set: { if !$0 { presentedError = nil } }
      )
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(presentedError ?? "Unknown error")
    }
    .onChange(of: variations.count) { newCount in
      selectedIndex = max(0, min(selectedIndex, newCount - 1))
    }
  }

  private func variationStrip(variations: [HandDrawnGlyph]) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Variations")
        .font(.headline)

      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(spacing: 18) {
          ForEach(Array(variations.enumerated()), id: \.element.id) { index, glyph in
            ZStack(alignment: .topTrailing) {
              NavigationLink {
                editor(variations: variations, selectedIndex: index)
              } label: {
                HandDrawnVariationThumbnail(
                  glyph: glyph,
                  isSelected: false,
                  size: CGSize(width: 228, height: 276)
                )
              }
              .buttonStyle(.plain)

              if variations.count > 1 {
                Button {
                  deleteVariation(at: index)
                } label: {
                  Image(systemName: "xmark")
                    .font(.body.bold())
                    .frame(width: 36, height: 36)
                    .background(.regularMaterial, in: Circle())
                }
                .buttonStyle(.plain)
                .offset(x: 11, y: -11)
                .accessibilityLabel("Delete variation \(index + 1)")
              }
            }
          }

          NavigationLink {
            editor(
              variations: variations + [blankVariation(after: variations.last)],
              selectedIndex: variations.count
            )
          } label: {
            VStack(spacing: 5) {
              Image(systemName: "plus")
                .font(.largeTitle)
              Text("New")
                .font(.title3)
            }
            .frame(width: 228, height: 276)
            .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 24))
            .overlay {
              RoundedRectangle(cornerRadius: 24)
                .strokeBorder(.secondary.opacity(0.35), style: StrokeStyle(dash: [5]))
            }
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Add variation")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 18)
      }
      .handDrawnDisablesScrollClipping()
    }
  }

  private func metadata(variations: [HandDrawnGlyph]) -> some View {
    let first = variations[0]
    let strokeCount = variations.reduce(0) { $0 + $1.strokes.count }
    let pointCount = variations.reduce(0) { $0 + $1.pointCount }

    return VStack(alignment: .leading, spacing: 12) {
      Text("Glyph information")
        .font(.headline)

      LazyVGrid(
        columns: [GridItem(.adaptive(minimum: 132), alignment: .leading)],
        alignment: .leading,
        spacing: 12
      ) {
        metadataValue("Type", value: glyphKind)
        metadataValue("Key", value: displayName)
        metadataValue("Unicode", value: unicodeValue)
        metadataValue("Variations", value: "\(variations.count)")
        metadataValue("Strokes", value: "\(strokeCount)")
        metadataValue("Points", value: "\(pointCount)")
        metadataValue(
          "Canvas",
          value: "\(Int(first.canvasWidth.rounded())) × \(Int(first.canvasHeight.rounded()))"
        )
        metadataValue("Baseline", value: percentage(first.metrics.canvasBaselineY))
        metadataValue("x-height", value: percentage(first.metrics.canvasXHeightY))
      }
    }
  }

  private func metadataValue(_ label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label.uppercased())
        .font(.caption2.monospaced())
        .foregroundStyle(.secondary)
      Text(value)
        .font(.body)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 14))
  }

  private var glyphKind: String {
    key.count == 1 ? "Character" : "Icon"
  }

  private var unicodeValue: String {
    guard key.count == 1 else { return "Named glyph" }
    return key.unicodeScalars
      .map { "U+" + String($0.value, radix: 16).uppercased() }
      .joined(separator: " ")
  }

  private func percentage(_ value: Double) -> String {
    "\(Int((value * 100).rounded()))%"
  }

  private func editor(
    variations: [HandDrawnGlyph],
    selectedIndex: Int
  ) -> some View {
    HandDrawnGlyphEditingView(
      key: key,
      initialVariations: variations,
      initialSelectedIndex: selectedIndex,
      fontGuides: typeface.fontGuides
    ) { savedVariations, fontGuides in
      replaceGlyph(with: savedVariations, fontGuides: fontGuides)
    }
  }

  private func blankVariation(after glyph: HandDrawnGlyph?) -> HandDrawnGlyph {
    HandDrawnGlyph.authored(
      key: key,
      variationIndex: (glyph?.variationIndex ?? -1) + 1,
      strokes: [],
      canvasWidth: glyph?.canvasWidth ?? 400,
      canvasHeight: glyph?.canvasHeight ?? 400 / (3.0 / 4.0),
      baselineY: glyph?.metrics.canvasBaselineY ?? 0.75,
      xHeightY: glyph?.metrics.canvasXHeightY ?? 0.25
    )
  }

  private func deleteVariation(at index: Int) {
    var variations = typeface.variations(for: key)
    guard variations.count > 1, variations.indices.contains(index) else { return }
    variations.remove(at: index)
    replaceGlyph(with: variations)
    selectedIndex = min(selectedIndex, variations.count - 1)
  }

  private func replaceGlyph(
    with variations: [HandDrawnGlyph],
    fontGuides: HandDrawnFontGuides? = nil
  ) {
    do {
      let otherGlyphs = typeface.glyphs.filter { $0.key != key }
      let normalized = variations.enumerated().map { index, glyph in
        HandDrawnGlyph.authored(
          key: key,
          variationIndex: index,
          strokes: glyph.strokes,
          canvasWidth: glyph.canvasWidth,
          canvasHeight: glyph.canvasHeight,
          baselineY: glyph.metrics.canvasBaselineY,
          xHeightY: glyph.metrics.canvasXHeightY
        )
      }
      typeface = try HandDrawnTypeface(
        version: typeface.version,
        glyphs: otherGlyphs + normalized,
        fontGuides: fontGuides ?? typeface.fontGuides
      )
      selectedIndex = min(selectedIndex, max(0, normalized.count - 1))
    } catch {
      presentedError = error.localizedDescription
    }
  }

  private func deleteGlyph() {
    do {
      typeface = try HandDrawnTypeface(
        version: typeface.version,
        glyphs: typeface.glyphs.filter { $0.key != key },
        fontGuides: typeface.fontGuides
      )
      dismiss()
    } catch {
      presentedError = error.localizedDescription
    }
  }

  private var displayName: String {
    key == " " ? "space" : key
  }
}

struct HandDrawnVariationThumbnail: View {
  let glyph: HandDrawnGlyph
  let isSelected: Bool
  var size = CGSize(width: 76, height: 92)

  var body: some View {
    VStack(spacing: 4) {
      if glyph.strokes.isEmpty {
        Image(systemName: "pencil.tip.crop.circle.badge.plus")
          .font(.title2)
          .foregroundStyle(.secondary)
          .frame(maxHeight: .infinity)
      } else {
        HandDrawnGlyphView(
          glyph,
          targetHeight: min(size.width * 0.62, size.height * 0.68),
          accessibilityLabel: nil
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }

      Text("\(glyph.variationIndex + 1)")
        .font(size.width > 100 ? .title3.monospacedDigit() : .caption.monospacedDigit())
        .foregroundStyle(.secondary)
    }
    .padding(size.width > 100 ? 18 : 8)
    .frame(width: size.width, height: size.height)
    .background(
      isSelected ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08),
      in: RoundedRectangle(cornerRadius: size.width > 100 ? 24 : 16)
    )
    .overlay {
      RoundedRectangle(cornerRadius: size.width > 100 ? 24 : 16)
        .strokeBorder(isSelected ? Color.accentColor : .secondary.opacity(0.22), lineWidth: 2)
    }
    .contentShape(RoundedRectangle(cornerRadius: 16))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Variation \(glyph.variationIndex + 1)")
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}

/// Raw glyph-coordinate visualization used to audit metrics and source points.
public struct HandDrawnGlyphMetricsView: View {
  public let glyph: HandDrawnGlyph

  public init(glyph: HandDrawnGlyph) {
    self.glyph = glyph
  }

  public var body: some View {
    GeometryReader { geometry in
      let canvasSize = glyph.canvasSize
      let scale = min(
        geometry.size.width / max(canvasSize.width, 1),
        geometry.size.height / max(canvasSize.height, 1)
      )
      let renderedSize = CGSize(
        width: canvasSize.width * scale,
        height: canvasSize.height * scale
      )
      let origin = CGPoint(
        x: (geometry.size.width - renderedSize.width) / 2,
        y: (geometry.size.height - renderedSize.height) / 2
      )

      Canvas { context, _ in
        let transform = CGAffineTransform(
          a: scale,
          b: 0,
          c: 0,
          d: scale,
          tx: origin.x,
          ty: origin.y
        )

        drawGuide(
          y: glyph.canvasXHeight,
          color: .green,
          canvasSize: canvasSize,
          transform: transform,
          context: &context
        )
        drawGuide(
          y: glyph.canvasBaseline,
          color: .blue,
          canvasSize: canvasSize,
          transform: transform,
          context: &context
        )

        let boundsPath = Path(glyph.bounds).applying(transform)
        context.stroke(
          boundsPath,
          with: .color(.orange),
          style: StrokeStyle(lineWidth: 1, dash: [5, 4])
        )

        for stroke in glyph.strokes {
          var path = Path()
          let points = stroke.points.map {
            CGPoint(
              x: $0.x * canvasSize.width,
              y: $0.y * canvasSize.height
            )
          }
          guard let first = points.first else { continue }
          path.move(to: first)
          for point in points.dropFirst() {
            path.addLine(to: point)
          }
          context.stroke(
            path.applying(transform),
            with: .foreground,
            style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .round)
          )
        }
      }
      .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Glyph geometry for \(glyph.key)")
  }

  private func drawGuide(
    y: CGFloat,
    color: Color,
    canvasSize: CGSize,
    transform: CGAffineTransform,
    context: inout GraphicsContext
  ) {
    var path = Path()
    path.move(to: CGPoint(x: 0, y: y))
    path.addLine(to: CGPoint(x: canvasSize.width, y: y))
    context.stroke(
      path.applying(transform),
      with: .color(color.opacity(0.8)),
      style: StrokeStyle(lineWidth: 1, dash: [4, 3])
    )
  }
}
