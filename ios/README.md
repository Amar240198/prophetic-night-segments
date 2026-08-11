# Native iOS prototype

Open `PropheticNightSegments.xcodeproj`, choose the `PropheticNightSegments` scheme and an
iPhone simulator, then press Run.

The SwiftUI app is a native implementation, not a web view. It includes:

- authoritative-time input and seven fixed demonstration fixtures;
- integer-millisecond segmentation with independently derived boundaries;
- six-part, thirds, last-third, and Dāwūd pattern views;
- careful evidence and disclaimer language;
- suggested scheduling markers;
- exact JSON inspection and sharing;
- five XCTest cases covering precision, contiguity, DST offsets, validation, and
  the non-negotiable domain mappings.

The bundle identifier is intentionally `com.example.propheticnightsegments`. Replace it
and select your Apple development team before installing on a physical device or
preparing a distributable build.

Command-line verification:

```bash
xcodebuild \
  -project ios/PropheticNightSegments.xcodeproj \
  -scheme PropheticNightSegments \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Run tests from Xcode with `⌘U`, or replace the destination below with an installed
simulator:

```bash
xcodebuild \
  -project ios/PropheticNightSegments.xcodeproj \
  -scheme PropheticNightSegments \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO \
  test
```
