import SwiftUI

struct HandDrawnWordFlowLayout: Layout {
  var spacing: CGFloat

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) -> CGSize {
    FlowResult(proposal: proposal, subviews: subviews, spacing: spacing).size
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) {
    let result = FlowResult(proposal: proposal, subviews: subviews, spacing: spacing)
    for (index, subview) in subviews.enumerated() {
      subview.place(
        at: CGPoint(
          x: bounds.minX + result.positions[index].x,
          y: bounds.minY + result.positions[index].y
        ),
        proposal: .unspecified
      )
    }
  }

  private struct FlowResult {
    var size: CGSize = .zero
    var positions: [CGPoint] = []

    init(proposal: ProposedViewSize, subviews: Subviews, spacing: CGFloat) {
      var currentX: CGFloat = 0
      var currentY: CGFloat = 0
      var lineHeight: CGFloat = 0
      var maximumX: CGFloat = 0
      let maximumWidth = proposal.width ?? .infinity

      for subview in subviews {
        let subviewSize = subview.sizeThatFits(.unspecified)
        if currentX + subviewSize.width > maximumWidth, currentX > 0 {
          currentX = 0
          currentY += lineHeight + spacing
          lineHeight = 0
        }

        positions.append(CGPoint(x: currentX, y: currentY))
        lineHeight = max(lineHeight, subviewSize.height)
        currentX += subviewSize.width + spacing
        maximumX = max(maximumX, currentX - spacing)
      }

      size = CGSize(width: maximumX, height: currentY + lineHeight)
    }
  }
}
