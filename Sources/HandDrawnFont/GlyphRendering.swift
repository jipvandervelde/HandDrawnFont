import SwiftUI

struct HandDrawnStrokeRenderData {
  let path: Path
  let length: Double
}

struct HandDrawnGlyphRenderData {
  let bounds: CGRect
  let baseline: CGFloat
  let xHeight: CGFloat
  let strokes: [HandDrawnStrokeRenderData]
  let totalLength: Double
}

@MainActor
final class HandDrawnGlyphRenderCache {
  static let shared = HandDrawnGlyphRenderCache()

  private var entries: [UUID: HandDrawnGlyphRenderData] = [:]

  func data(for glyph: HandDrawnGlyph) -> HandDrawnGlyphRenderData {
    if let cached = entries[glyph.id] {
      return cached
    }

    let canvasSize = glyph.canvasSize
    let strokes = glyph.strokes.map { stroke in
      let points = stroke.points.map { $0.point(in: canvasSize) }
      var path = Path()
      if let firstPoint = points.first {
        path.move(to: firstPoint)
        for point in points.dropFirst() {
          path.addLine(to: point)
        }
      }
      return HandDrawnStrokeRenderData(
        path: path,
        length: Self.pathLength(points)
      )
    }

    let data = HandDrawnGlyphRenderData(
      bounds: glyph.bounds,
      baseline: glyph.baseline,
      xHeight: glyph.xHeight,
      strokes: strokes,
      totalLength: strokes.reduce(0) { $0 + $1.length }
    )
    entries[glyph.id] = data
    return data
  }

  private static func pathLength(_ points: [CGPoint]) -> Double {
    guard points.count > 1 else { return 0 }

    var length: Double = 0
    for index in 1..<points.count {
      let dx = points[index].x - points[index - 1].x
      let dy = points[index].y - points[index - 1].y
      length += sqrt((dx * dx) + (dy * dy))
    }
    return length
  }
}

@MainActor
struct HandDrawnGlyphCanvas: View {
  let glyph: HandDrawnGlyph
  let targetHeight: CGFloat
  let color: Color
  let lineWidth: CGFloat
  let progress: Double

  var body: some View {
    let renderData = HandDrawnGlyphRenderCache.shared.data(for: glyph)
    let scale = scale(for: renderData)
    let scaledWidth = max(0, renderData.bounds.width * scale)
    let targetBaseline = targetHeight * 0.7
    let glyphBaseline = renderData.baseline * scale
    let verticalOffset = targetBaseline - glyphBaseline
    let transform = CGAffineTransform(
      a: scale,
      b: 0,
      c: 0,
      d: scale,
      tx: -renderData.bounds.minX * scale,
      ty: (-renderData.bounds.minY * scale) + verticalOffset
    )

    Canvas { context, _ in
      draw(
        renderData: renderData,
        progress: min(1, max(0, progress)),
        transform: transform,
        context: &context
      )
    }
    .frame(width: scaledWidth, height: targetHeight * 1.2)
  }

  private func scale(for renderData: HandDrawnGlyphRenderData) -> CGFloat {
    let expectedHeight = abs(renderData.baseline - renderData.xHeight)
    if expectedHeight > 10 {
      return (targetHeight * 0.4) / expectedHeight
    }
    return targetHeight / max(renderData.bounds.height, 1)
  }

  private func draw(
    renderData: HandDrawnGlyphRenderData,
    progress: Double,
    transform: CGAffineTransform,
    context: inout GraphicsContext
  ) {
    guard renderData.totalLength > 0 else { return }

    let currentLength = renderData.totalLength * progress
    var accumulatedLength: Double = 0

    for stroke in renderData.strokes {
      guard stroke.length > 0 else { continue }
      let strokeEnd = accumulatedLength + stroke.length

      let strokeProgress: Double
      if currentLength <= accumulatedLength {
        break
      } else if currentLength >= strokeEnd {
        strokeProgress = 1
      } else {
        strokeProgress = (currentLength - accumulatedLength) / stroke.length
      }

      let path = stroke.path
        .trimmedPath(from: 0, to: strokeProgress)
        .applying(transform)
      context.stroke(
        path,
        with: .color(color),
        style: StrokeStyle(
          lineWidth: lineWidth,
          lineCap: .butt,
          lineJoin: .round
        )
      )
      accumulatedLength = strokeEnd
    }
  }
}
