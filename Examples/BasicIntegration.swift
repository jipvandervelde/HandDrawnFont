import HandDrawnFont
import SwiftUI

struct BasicHandDrawnFontExample: View {
    @State private var animationTrigger = 0

    var body: some View {
        VStack(spacing: 24) {
            HandDrawnText(
                "small action move mountain.",
                style: HandDrawnTextStyle(glyphHeight: 36),
                animation: .relaxed,
                variationSeed: 42,
                animationTrigger: animationTrigger
            )

            Button("Replay") {
                animationTrigger += 1
            }

            HandDrawnText(
                "static hand.",
                animation: nil
            )
        }
        .padding()
    }
}
