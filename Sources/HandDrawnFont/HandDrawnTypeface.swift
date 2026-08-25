import Foundation

/// Errors produced while loading or validating a typeface document.
public enum HandDrawnFontError: Error, LocalizedError, Sendable {
  case bundledResourceMissing
  case unsupportedFormat(Int)
  case emptyGlyphKey(UUID)
  case invalidCanvasSize(UUID)
  case invalidMetrics(UUID)
  case invalidFontGuides
  case invalidPoint(UUID)
  case duplicateGlyphID(UUID)
  case duplicateVariation(key: String, variationIndex: Int)

  public var errorDescription: String? {
    switch self {
    case .bundledResourceMissing:
      "The bundled hand-drawn typeface resource is missing."
    case .unsupportedFormat(let version):
      "Typeface format version \(version) is not supported."
    case .emptyGlyphKey(let id):
      "Glyph \(id) has an empty key."
    case .invalidCanvasSize(let id):
      "Glyph \(id) has an invalid canvas size."
    case .invalidMetrics(let id):
      "Glyph \(id) has invalid metrics."
    case .invalidFontGuides:
      "Typeface font guides are invalid."
    case .invalidPoint(let id):
      "Glyph \(id) contains a non-finite point."
    case .duplicateGlyphID(let id):
      "Glyph ID \(id) occurs more than once."
    case .duplicateVariation(let key, let variationIndex):
      "Glyph key \(key) contains variation \(variationIndex) more than once."
    }
  }
}

/// Font-wide guide positions in normalized glyph-canvas coordinates.
public struct HandDrawnFontGuides: Codable, Hashable, Sendable {
  /// The shared cap-height line, where `0` is the top of the canonical canvas.
  public var capHeightY: Double

  public init(capHeightY: Double = 0.06) {
    self.capHeightY = capHeightY
  }

  public static let `default` = HandDrawnFontGuides()

  static func inferred(from glyphs: [HandDrawnGlyph]) -> HandDrawnFontGuides {
    guard let reference = glyphs.first(where: { $0.key != " " }) ?? glyphs.first else {
      return .default
    }

    let baselineY = reference.metrics.canvasBaselineY
    let xHeightY = reference.metrics.canvasXHeightY
    let xHeight = max(0, baselineY - xHeightY)
    return HandDrawnFontGuides(
      capHeightY: min(1, max(0, xHeightY - xHeight * 0.38))
    )
  }
}

struct HandDrawnTypefaceDocument: Codable, Sendable {
  static let currentFormatVersion = 2

  var formatVersion: Int
  var typefaceVersion: String
  var fontGuides: HandDrawnFontGuides
  var glyphs: [HandDrawnGlyph]
}

private struct HandDrawnTypefaceVersionHeader: Decodable {
  var formatVersion: Int
}

private struct HandDrawnTypefaceDocumentV1: Decodable {
  var formatVersion: Int
  var typefaceVersion: String
  var glyphs: [HandDrawnGlyph]
}

/// A validated, immutable collection of handwritten glyph variations.
public struct HandDrawnTypeface: Sendable {
  public let version: String
  public let fontGuides: HandDrawnFontGuides
  public let glyphs: [HandDrawnGlyph]

  private let glyphsByKey: [String: [HandDrawnGlyph]]
  private let glyphsByID: [UUID: HandDrawnGlyph]

  public init(
    version: String,
    glyphs: [HandDrawnGlyph],
    fontGuides: HandDrawnFontGuides? = nil
  ) throws {
    try Self.validate(glyphs)
    let resolvedFontGuides = fontGuides ?? .inferred(from: glyphs)
    try Self.validate(resolvedFontGuides)

    self.version = version
    self.fontGuides = resolvedFontGuides
    self.glyphs = glyphs.sorted {
      if $0.key == $1.key {
        return $0.variationIndex < $1.variationIndex
      }
      return $0.key < $1.key
    }
    self.glyphsByKey = Dictionary(grouping: self.glyphs, by: \.key)
    self.glyphsByID = Dictionary(uniqueKeysWithValues: self.glyphs.map { ($0.id, $0) })
  }

  public init(data: Data) throws {
    let decoder = JSONDecoder()
    let header = try decoder.decode(HandDrawnTypefaceVersionHeader.self, from: data)

    switch header.formatVersion {
    case 1:
      let document = try decoder.decode(HandDrawnTypefaceDocumentV1.self, from: data)
      try self.init(
        version: document.typefaceVersion,
        glyphs: document.glyphs,
        fontGuides: .inferred(from: document.glyphs)
      )
    case HandDrawnTypefaceDocument.currentFormatVersion:
      let document = try decoder.decode(HandDrawnTypefaceDocument.self, from: data)
      try self.init(
        version: document.typefaceVersion,
        glyphs: document.glyphs,
        fontGuides: document.fontGuides
      )
    default:
      throw HandDrawnFontError.unsupportedFormat(header.formatVersion)
    }
  }

  /// The package's built-in lowercase Latin typeface, digits, and punctuation.
  public static let bundled: HandDrawnTypeface = {
    do {
      return try loadBundled()
    } catch {
      preconditionFailure("Unable to load bundled HandDrawnFont resource: \(error)")
    }
  }()

  /// Loads and validates the typeface shipped in this Swift package.
  public static func loadBundled() throws -> HandDrawnTypeface {
    guard
      let url = Bundle.module.url(
        forResource: "hand-drawn-typeface",
        withExtension: "json"
      )
    else {
      throw HandDrawnFontError.bundledResourceMissing
    }

    return try HandDrawnTypeface(data: Data(contentsOf: url))
  }

  /// Encodes the neutral, versioned typeface interchange format.
  public func encoded(prettyPrinted: Bool = true) throws -> Data {
    let document = HandDrawnTypefaceDocument(
      formatVersion: HandDrawnTypefaceDocument.currentFormatVersion,
      typefaceVersion: version,
      fontGuides: fontGuides,
      glyphs: glyphs
    )
    let encoder = JSONEncoder()
    if prettyPrinted {
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }
    return try encoder.encode(document)
  }

  public func variations(for key: String) -> [HandDrawnGlyph] {
    let lookupKey = key.count == 1 ? key.lowercased() : key
    return glyphsByKey[lookupKey] ?? []
  }

  public func variations(for character: Character) -> [HandDrawnGlyph] {
    variations(for: String(character).lowercased())
  }

  public func glyph(id: UUID) -> HandDrawnGlyph? {
    glyphsByID[id]
  }

  public func glyph(for key: String, variationIndex: Int = 0) -> HandDrawnGlyph? {
    let variations = variations(for: key)
    return variations.first(where: { $0.variationIndex == variationIndex }) ?? variations.first
  }

  public var keys: [String] {
    glyphsByKey.keys.sorted()
  }

  public var characterKeys: [String] {
    keys.filter { $0.count == 1 }
  }

  public var namedGlyphKeys: [String] {
    keys.filter { $0.count > 1 }
  }

  private static func validate(_ glyphs: [HandDrawnGlyph]) throws {
    var seenIDs = Set<UUID>()
    var seenVariations = Set<String>()

    for glyph in glyphs {
      guard seenIDs.insert(glyph.id).inserted else {
        throw HandDrawnFontError.duplicateGlyphID(glyph.id)
      }
      guard !glyph.key.isEmpty else {
        throw HandDrawnFontError.emptyGlyphKey(glyph.id)
      }
      guard glyph.canvasWidth.isFinite,
        glyph.canvasHeight.isFinite,
        glyph.canvasWidth > 0,
        glyph.canvasHeight > 0
      else {
        throw HandDrawnFontError.invalidCanvasSize(glyph.id)
      }

      let metrics = glyph.metrics
      guard metrics.boundsX.isFinite,
        metrics.boundsY.isFinite,
        metrics.boundsWidth.isFinite,
        metrics.boundsHeight.isFinite,
        metrics.baselineY.isFinite,
        metrics.xHeightY.isFinite,
        metrics.boundsWidth >= 0,
        metrics.boundsHeight >= 0
      else {
        throw HandDrawnFontError.invalidMetrics(glyph.id)
      }

      for point in glyph.strokes.flatMap(\.points) {
        guard point.x.isFinite, point.y.isFinite else {
          throw HandDrawnFontError.invalidPoint(glyph.id)
        }
      }

      let variationKey = "\(glyph.key)\u{0}\(glyph.variationIndex)"
      guard seenVariations.insert(variationKey).inserted else {
        throw HandDrawnFontError.duplicateVariation(
          key: glyph.key,
          variationIndex: glyph.variationIndex
        )
      }
    }
  }

  private static func validate(_ fontGuides: HandDrawnFontGuides) throws {
    guard fontGuides.capHeightY.isFinite,
      (0...1).contains(fontGuides.capHeightY)
    else {
      throw HandDrawnFontError.invalidFontGuides
    }
  }
}
