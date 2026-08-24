// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "HandDrawnFont",
  platforms: [
    .iOS(.v16),
    .macOS(.v13),
  ],
  products: [
    .library(
      name: "HandDrawnFont",
      targets: ["HandDrawnFont"]
    ),
    .library(
      name: "HandDrawnFontDebug",
      targets: ["HandDrawnFontDebug"]
    ),
  ],
  targets: [
    .target(
      name: "HandDrawnFont",
      resources: [
        .process("Resources")
      ]
    ),
    .target(
      name: "HandDrawnFontDebug",
      dependencies: ["HandDrawnFont"]
    ),
    .testTarget(
      name: "HandDrawnFontTests",
      dependencies: ["HandDrawnFont"]
    ),
  ]
)
