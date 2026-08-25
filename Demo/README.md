# HandDrawnFont demo

A deliberately small iOS app proving that both package products work in a
consuming SwiftUI target:

- `HandDrawnFont` renders the animated pangram and static A-Z/0-9 grid.
- `HandDrawnFontDebug` powers the debug toolbar button.
- The Xcode project links both products through a local Swift Package Manager
  reference to the repository root. It does not copy package sources or the
  bundled typeface JSON.

Open `HandDrawnFontDemo.xcodeproj`, choose an iOS simulator, and run the
`HandDrawnFontDemo` scheme.

The project is generated from `project.yml` with:

```sh
cd Demo
xcodegen generate
```
