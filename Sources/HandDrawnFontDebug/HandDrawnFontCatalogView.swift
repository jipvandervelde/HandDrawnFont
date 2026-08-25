import HandDrawnFont
import SwiftUI
import UniformTypeIdentifiers

/// Browses and edits every available glyph key and variation.
public struct HandDrawnFontCatalogView: View {
  @State private var ownedTypeface: HandDrawnTypeface
  private let externalTypeface: Binding<HandDrawnTypeface>?

  public init(typeface: HandDrawnTypeface = .bundled) {
    _ownedTypeface = State(initialValue: typeface)
    externalTypeface = nil
  }

  public init(typeface: Binding<HandDrawnTypeface>) {
    _ownedTypeface = State(initialValue: typeface.wrappedValue)
    externalTypeface = typeface
  }

  public var body: some View {
    HandDrawnFontCatalogContent(typeface: externalTypeface ?? $ownedTypeface)
  }
}

private struct HandDrawnFontCatalogContent: View {
  private enum GlyphKind: String, CaseIterable, Identifiable {
    case characters = "Characters"
    case icons = "Icons"

    var id: Self { self }

    var systemImage: String {
      switch self {
      case .characters: "character"
      case .icons: "app.dashed"
      }
    }
  }

  @Binding var typeface: HandDrawnTypeface

  @State private var path: [String] = []
  @State private var selectedKind = GlyphKind.characters
  @State private var presentedCreationKind: GlyphKind?
  @State private var isImporting = false
  @State private var isExporting = false
  @State private var exportedDocument = HandDrawnTypefaceFileDocument(data: Data())
  @State private var presentedError: String?

  private let columns = [
    GridItem(.adaptive(minimum: 92, maximum: 132), spacing: 7)
  ]

  var body: some View {
    NavigationStack(path: $path) {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 18) {
          Picker("Glyph type", selection: $selectedKind) {
            ForEach(GlyphKind.allCases) { kind in
              Text(kind.rawValue).tag(kind)
            }
          }
          .pickerStyle(.segmented)

          if filteredKeys.isEmpty {
            VStack(spacing: 12) {
              Image(systemName: selectedKind.systemImage)
                .font(.largeTitle)
              Text("No \(selectedKind.rawValue.lowercased()) yet")
                .font(.headline)
              Text("Use the add button to draw the first one.")
                .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 60)
          } else {
            LazyVGrid(columns: columns, spacing: 7) {
              ForEach(filteredKeys, id: \.self) { key in
                NavigationLink(value: key) {
                  HandDrawnGlyphCatalogTile(key: key, typeface: typeface)
                }
                .buttonStyle(.plain)
              }
            }
          }
        }
        .padding()
      }
      .navigationTitle("Glyphs")
      .handDrawnInlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .navigation) {
          Menu {
            Button("Import font config", systemImage: "square.and.arrow.down") {
              isImporting = true
            }
            Button("Export font config", systemImage: "square.and.arrow.up") {
              prepareExport()
            }
          } label: {
            Label("Import or export font config", systemImage: "arrow.up.arrow.down")
          }
        }

        ToolbarItem(placement: .primaryAction) {
          Button {
            presentedCreationKind = selectedKind
          } label: {
            Label("Add \(selectedKind.rawValue.dropLast().lowercased())", systemImage: "plus")
          }
        }
      }
      .navigationDestination(for: String.self) { key in
        HandDrawnGlyphInspectorView(key: key, typeface: $typeface)
      }
    }
    .sheet(item: $presentedCreationKind) { kind in
      HandDrawnNewGlyphView(
        kind: kind.rawValue,
        existingKeys: Set(typeface.keys)
      ) { key in
        addGlyph(key: key)
      }
    }
    .fileImporter(
      isPresented: $isImporting,
      allowedContentTypes: [.json],
      allowsMultipleSelection: false,
      onCompletion: importTypeface
    )
    .fileExporter(
      isPresented: $isExporting,
      document: exportedDocument,
      contentType: .json,
      defaultFilename: "hand-drawn-typeface"
    ) { result in
      if case .failure(let error) = result {
        presentedError = error.localizedDescription
      }
    }
    .alert(
      "Font config unavailable",
      isPresented: Binding(
        get: { presentedError != nil },
        set: { if !$0 { presentedError = nil } }
      )
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(presentedError ?? "Unknown error")
    }
  }

  private var filteredKeys: [String] {
    switch selectedKind {
    case .characters:
      typeface.characterKeys
    case .icons:
      typeface.namedGlyphKeys
    }
  }

  private func addGlyph(key: String) {
    do {
      typeface = try HandDrawnTypeface(
        version: typeface.version,
        glyphs: typeface.glyphs + [HandDrawnGlyph.authored(key: key, strokes: [])],
        fontGuides: typeface.fontGuides
      )
      path.append(key)
    } catch {
      presentedError = error.localizedDescription
    }
  }

  private func prepareExport() {
    do {
      exportedDocument = HandDrawnTypefaceFileDocument(data: try typeface.encoded())
      isExporting = true
    } catch {
      presentedError = error.localizedDescription
    }
  }

  private func importTypeface(_ result: Result<[URL], Error>) {
    do {
      guard let url = try result.get().first else { return }
      let hasAccess = url.startAccessingSecurityScopedResource()
      defer {
        if hasAccess {
          url.stopAccessingSecurityScopedResource()
        }
      }
      typeface = try HandDrawnTypeface(data: Data(contentsOf: url))
    } catch {
      presentedError = error.localizedDescription
    }
  }
}

private struct HandDrawnNewGlyphView: View {
  @Environment(\.dismiss) private var dismiss

  let kind: String
  let existingKeys: Set<String>
  let onCreate: @MainActor (String) -> Void

  @State private var draft = ""

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(placeholder, text: $draft)
            .autocorrectionDisabled()
        } footer: {
          Text(footer)
        }
      }
      .navigationTitle("New \(singularKind)")
      .handDrawnInlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            dismiss()
          }
        }

        ToolbarItem(placement: .confirmationAction) {
          Button("Add") {
            onCreate(normalizedKey)
            dismiss()
          }
          .buttonStyle(.borderedProminent)
          .disabled(!isValid)
        }
      }
    }
  }

  private var trimmedDraft: String {
    draft.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var normalizedKey: String {
    kind == "Characters" ? trimmedDraft.lowercased() : trimmedDraft
  }

  private var singularKind: String {
    kind == "Characters" ? "character" : "icon"
  }

  private var placeholder: String {
    kind == "Characters" ? "Character" : "Icon name"
  }

  private var footer: String {
    if normalizedKey.isEmpty {
      return kind == "Characters"
        ? "Enter one character."
        : "Give the icon a descriptive name, such as heart or share."
    }
    if kind == "Characters", normalizedKey.count != 1 {
      return "A character key must contain exactly one character."
    }
    if kind == "Icons", normalizedKey.count == 1 {
      return "Icon names must contain more than one character."
    }
    if existingKeys.contains(normalizedKey) {
      return "That glyph already exists."
    }
    return "A blank variation will be ready to draw."
  }

  private var isValid: Bool {
    !normalizedKey.isEmpty
      && !existingKeys.contains(normalizedKey)
      && (kind == "Characters" ? normalizedKey.count == 1 : normalizedKey.count > 1)
  }
}

private struct HandDrawnGlyphCatalogTile: View {
  let key: String
  let typeface: HandDrawnTypeface

  var body: some View {
    let variations = typeface.variations(for: key)

    VStack(spacing: 6) {
      ZStack {
        if key == " " {
          Image(systemName: "space")
            .font(.title2)
            .foregroundStyle(.secondary)
        } else if let glyph = variations.first {
          HandDrawnGlyphView(
            glyph,
            targetHeight: 72,
            accessibilityLabel: displayName
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .frame(height: 108)

      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(displayName)
          .font(.headline)
          .lineLimit(1)

        Spacer(minLength: 0)

        Text("\(variations.count)")
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
      }
    }
    .padding(8)
    .background(.background, in: RoundedRectangle(cornerRadius: 18))
    .overlay {
      RoundedRectangle(cornerRadius: 18)
        .strokeBorder(.secondary.opacity(0.25))
    }
    .contentShape(RoundedRectangle(cornerRadius: 18))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(displayName), \(variations.count) variations")
    .accessibilityHint("Opens glyph details")
  }

  private var displayName: String {
    key == " " ? "space" : key
  }
}

private struct HandDrawnTypefaceFileDocument: FileDocument {
  static let readableContentTypes: [UTType] = [.json]
  static let writableContentTypes: [UTType] = [.json]

  var data: Data

  init(data: Data) {
    self.data = data
  }

  init(configuration: ReadConfiguration) throws {
    data = configuration.file.regularFileContents ?? Data()
  }

  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}
