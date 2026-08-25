import AppKit
import CoreText
import Foundation

let canvasWidth = 1200
let canvasHeight = 630
let wordmark = "handdrawn.software"

let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
let websiteURL = scriptURL.deletingLastPathComponent().deletingLastPathComponent()
let fontURL = websiteURL.appendingPathComponent("src/fonts/GrugHand-Regular.ttf")
let outputURL = websiteURL.appendingPathComponent("src/og-image.png")

guard
  let fontData = NSData(contentsOf: fontURL),
  let provider = CGDataProvider(data: fontData),
  let graphicsFont = CGFont(provider)
else {
  fatalError("Could not load \(fontURL.path)")
}

var registrationError: Unmanaged<CFError>?
if !CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, &registrationError) {
  let description = registrationError?.takeRetainedValue().localizedDescription ?? "unknown error"
  if !description.localizedCaseInsensitiveContains("already registered") {
    fatalError("Could not register Grug Hand: \(description)")
  }
}

guard
  let postScriptName = graphicsFont.postScriptName as String?,
  let font = NSFont(name: postScriptName, size: 116),
  let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: canvasWidth,
    pixelsHigh: canvasHeight,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ),
  let context = NSGraphicsContext(bitmapImageRep: bitmap)
else {
  fatalError("Could not create the OG image canvas")
}

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center

let attributes: [NSAttributedString.Key: Any] = [
  .font: font,
  .foregroundColor: NSColor.black,
  .paragraphStyle: paragraph,
]

let attributedWordmark = NSAttributedString(string: wordmark, attributes: attributes)
let measured = attributedWordmark.boundingRect(
  with: NSSize(width: CGFloat(canvasWidth), height: .greatestFiniteMagnitude),
  options: [.usesLineFragmentOrigin, .usesFontLeading]
)
let drawingRect = NSRect(
  x: 0,
  y: (CGFloat(canvasHeight) - measured.height) / 2,
  width: CGFloat(canvasWidth),
  height: measured.height
)

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor.white.setFill()
NSRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight).fill()
attributedWordmark.draw(in: drawingRect)
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Could not encode OG image")
}

try png.write(to: outputURL, options: .atomic)
print("wrote \(outputURL.path) (\(canvasWidth)x\(canvasHeight))")
